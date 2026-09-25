// ============================================================
// main.js — 主頁的「控制中心」
//
// 流程：
//   1. 讀網址決定賽季 (?season=2025) → loadSeason() 抓資料
//   2. 讀網址 hash 決定要看哪個畫面 (#drivers、#round/5/qualifying…) → render()
//   3. 使用者點任何連結只會改變 hash → 觸發 hashchange → 再 render() 一次
//
// 這種「網址就是狀態」的做法叫做 hash 路由：
// 重新整理不會跑掉、可以分享網址、瀏覽器「上一頁」也能用。
// ============================================================
import { loadSeason, clearCache } from './api.js';
import { renderTimeline, raceStates, nextRace } from './timeline.js';
import { renderPointsChart } from './chart.js';
import { avatar, hydratePhotos } from './photos.js';
import {
  esc, toDate, formatDate, formatDateTime, formatTime, countdown, userTimeZone, lapToMs, formatGap,
  statusZh, isFinished, nationalityFlag, countryFlag, driverLink, teamLink, teamColor, driverName,
  SESSION_LABELS,
} from './utils.js';

const FIRST_SEASON = 1950;
const CURRENT_YEAR = new Date().getFullYear();
const params = new URLSearchParams(location.search);
const season = clampSeason(Number(params.get('season')) || CURRENT_YEAR);

const state = { data: null, scheduleFilter: 'all' };
const $view = document.getElementById('view');
const $status = document.getElementById('data-status');

function clampSeason(y) {
  return Math.min(CURRENT_YEAR, Math.max(FIRST_SEASON, y));
}

// ============================================================
// 路由：把 hash 解析成 { view, round, tab }
// ============================================================
function parseRoute() {
  const [view = 'summary', round, tab] = location.hash.replace(/^#/, '').split('/');
  return { view: view || 'summary', round: round ? Number(round) : null, tab: tab || null };
}

function render() {
  if (!state.data) return;
  const route = parseRoute();

  // 分頁按鈕亮起目前那一個
  document.querySelectorAll('.tabs a').forEach((a) => {
    a.classList.toggle('active', a.dataset.view === route.view);
    a.setAttribute('aria-current', a.dataset.view === route.view ? 'page' : 'false');
  });

  const views = { summary: viewSummary, drivers: viewDrivers, teams: viewTeams, round: viewRound, schedule: viewSchedule };
  const fn = views[route.view] || viewSummary;
  $view.innerHTML = '';
  const activeRound = fn(route);
  renderTimeline(document.getElementById('timeline'), state.data, activeRound);
  hydratePhotos($view);
  updateCountdowns();
}

// ============================================================
// 畫面 1：總覽
// ============================================================
function viewSummary() {
  const d = state.data;
  const [p1, p2] = d.driverStandings;
  const [t1, t2] = d.constructorStandings;
  const states = raceStates(d.races);
  const lastDone = [...d.races].reverse().find((r) => r.completed);
  const next = nextRace(d.races);
  const doneCount = states.filter((s) => s === 'done').length;

  const cards = [];
  if (p1) {
    cards.push(`
      <article class="card stat-card" style="--c:${teamColor(p1.Constructors?.at(-1)?.constructorId)}">
        <h3>車手積分領先</h3>
        <div class="leader">${avatar(p1.Driver.url, driverName(p1.Driver), 'md')}
          <p class="big">${nationalityFlag(p1.Driver.nationality)} ${driverLink(p1.Driver, d.season)}</p></div>
        <p class="stat-line"><b>${p1.points}</b> 分 · ${p1.wins} 勝${p2 ? ` · 領先 P2 ${fmtPts(p1.points - p2.points)} 分` : ''}</p>
      </article>`);
  }
  if (t1) {
    cards.push(`
      <article class="card stat-card" style="--c:${teamColor(t1.Constructor.constructorId)}">
        <h3>車隊積分領先</h3>
        <div class="leader">${avatar(t1.Constructor.url, t1.Constructor.name, 'md', 'square')}
          <p class="big">${teamLink(t1.Constructor, d.season)}</p></div>
        <p class="stat-line"><b>${t1.points}</b> 分 · ${t1.wins} 勝${t2 ? ` · 領先 P2 ${fmtPts(t1.points - t2.points)} 分` : ''}</p>
      </article>`);
  }
  if (lastDone) {
    cards.push(`
      <article class="card">
        <h3>上一站 · R${lastDone.round} ${countryFlag(lastDone.circuit?.Location?.country)} ${esc(lastDone.name)}</h3>
        <ol class="podium">${lastDone.results.slice(0, 3).map((r, i) => `
          <li><span class="medal m${i + 1}">${i + 1}</span>${avatar(r.Driver.url, driverName(r.Driver))}
            <span class="podium-name">${driverLink(r.Driver, d.season)}<small>${esc(r.Constructor.name)}</small></span></li>`).join('')}
        </ol>
        <a class="more" href="#round/${lastDone.round}/race">完整成績 →</a>
      </article>`);
  }
  if (next) {
    const start = toDate(next.date, next.time);
    cards.push(`
      <article class="card next-card">
        <h3>下一站 · R${next.round}</h3>
        <p class="big">${countryFlag(next.circuit?.Location?.country)} ${esc(next.name)}</p>
        <p class="countdown" data-countdown="${start?.toISOString() || ''}">${start ? countdown(start) : ''}</p>
        <p class="muted">正賽：${formatDateTime(start)}${next.hasSprint ? ' · 衝刺賽週末' : ''}</p>
        <a class="more" href="#schedule/${next.round}">完整時間表 →</a>
      </article>`);
  }

  $view.innerHTML = `
    <div class="card-grid">${cards.join('') || '<p class="muted">這個賽季還沒有資料。</p>'}</div>
    <p class="progress-text">已完成 <b>${doneCount}</b> / ${d.races.length} 站${d.standingsRound ? `（積分統計至第 ${d.standingsRound} 站）` : ''}</p>
    <div class="two-col">
      <article class="card">
        <div class="card-head"><h3>車手積分 Top 5</h3><a class="more" href="#drivers">全部 →</a></div>
        ${driverTable(d.driverStandings.slice(0, 5), true)}
      </article>
      <article class="card">
        <div class="card-head"><h3>車隊積分 Top 5</h3><a class="more" href="#teams">全部 →</a></div>
        ${teamTable(d.constructorStandings.slice(0, 5), true)}
      </article>
    </div>
    <article class="card">
      <div class="card-head"><h3>積分走勢（前 8 名車手）</h3></div>
      <div id="points-chart"></div>
    </article>`;
  renderPointsChart(document.getElementById('points-chart'), d);
  return null;
}

const fmtPts = (n) => Number(n.toFixed(1));

// ============================================================
// 畫面 2、3：車手積分 / 車隊積分
// ============================================================
function driverTable(rows, compact = false) {
  if (!rows.length) return '<p class="muted">尚無積分資料。</p>';
  const leader = Number(rows[0].points) || 1;
  return `<div class="table-wrap"><table class="data">
    <thead><tr><th class="num">名次</th><th>車手</th><th class="${compact ? 'hide-sm' : ''}">車隊</th>${compact ? '' : '<th class="num">勝場</th>'}
      <th class="num">積分</th>${compact ? '' : '<th class="num">差距</th>'}</tr></thead>
    <tbody>${rows.map((s) => {
      const team = s.Constructors?.at(-1);
      return `<tr>
        <td class="num pos">${esc(s.positionText || s.position)}</td>
        <td><span class="car-no">${esc(s.Driver.permanentNumber || '')}</span>${avatar(s.Driver.url, driverName(s.Driver))}${nationalityFlag(s.Driver.nationality)} ${driverLink(s.Driver, state.data.season)}</td>
        <td class="${compact ? 'hide-sm' : ''}">${team ? teamLink(team, state.data.season) : ''}</td>
        ${compact ? '' : `<td class="num">${esc(s.wins)}</td>`}
        <td class="num pts"><b>${esc(s.points)}</b>
          ${compact ? '' : `<span class="bar"><i style="width:${(Number(s.points) / leader) * 100}%;--c:${teamColor(team?.constructorId)}"></i></span>`}</td>
        ${compact ? '' : `<td class="num muted">${s.position === '1' ? '—' : `-${fmtPts(leader - Number(s.points))}`}</td>`}
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function teamTable(rows, compact = false) {
  if (!rows.length) return '<p class="muted">這個賽季沒有車隊積分（車隊冠軍從 1958 年才開始）。</p>';
  const leader = Number(rows[0].points) || 1;
  // 從車手積分表反查每隊有哪些車手
  const driversOf = (id) => state.data.driverStandings
    .filter((s) => s.Constructors?.some((c) => c.constructorId === id))
    .map((s) => driverLink(s.Driver, state.data.season)).join('、');
  return `<div class="table-wrap"><table class="data">
    <thead><tr><th class="num">名次</th><th>車隊</th>${compact ? '' : '<th>車手</th><th class="num">勝場</th>'}
      <th class="num">積分</th>${compact ? '' : '<th class="num">差距</th>'}</tr></thead>
    <tbody>${rows.map((s) => `<tr>
        <td class="num pos">${esc(s.positionText || s.position)}</td>
        <td>${avatar(s.Constructor.url, s.Constructor.name, 'sm', 'square')}${nationalityFlag(s.Constructor.nationality)} ${teamLink(s.Constructor, state.data.season)}</td>
        ${compact ? '' : `<td class="small">${driversOf(s.Constructor.constructorId)}</td><td class="num">${esc(s.wins)}</td>`}
        <td class="num pts"><b>${esc(s.points)}</b>
          ${compact ? '' : `<span class="bar"><i style="width:${(Number(s.points) / leader) * 100}%;--c:${teamColor(s.Constructor.constructorId)}"></i></span>`}</td>
        ${compact ? '' : `<td class="num muted">${s.position === '1' ? '—' : `-${fmtPts(leader - Number(s.points))}`}</td>`}
      </tr>`).join('')}</tbody></table></div>`;
}

function viewDrivers() {
  $view.innerHTML = `<article class="card"><div class="card-head"><h3>${state.data.season} 車手積分榜</h3>
    <span class="muted small">點名字看車手故事</span></div>${driverTable(state.data.driverStandings)}</article>`;
  return null;
}

function viewTeams() {
  $view.innerHTML = `<article class="card"><div class="card-head"><h3>${state.data.season} 車隊積分榜</h3>
    <span class="muted small">點車隊看車隊歷史</span></div>${teamTable(state.data.constructorStandings)}</article>`;
  return null;
}

// ============================================================
// 畫面 4：分站成績（排位賽 / 衝刺賽 / 正賽）
// ============================================================
function viewRound(route) {
  const d = state.data;
  if (!d.races.length) {
    $view.innerHTML = '<p class="muted">這個賽季還沒有賽程。</p>';
    return null;
  }
  // 沒指定站 → 最近一站有成績的；都沒有 → 第一站
  const lastDone = [...d.races].reverse().find((r) => r.completed || r.qualifying.length);
  const race = d.races.find((r) => r.round === route.round) || lastDone || d.races[0];

  const tabs = [['qualifying', '排位賽']];
  if (race.hasSprint) tabs.push(['sprint', '衝刺賽']);
  tabs.push(['race', '正賽']);
  let tab = route.tab;
  if (!tabs.some(([k]) => k === tab)) tab = race.completed ? 'race' : 'qualifying';

  const idx = d.races.indexOf(race);
  const prev = d.races[idx - 1];
  const next = d.races[idx + 1];
  const start = toDate(race.date, race.time);

  let body;
  if (tab === 'qualifying') body = qualifyingTable(race.qualifying);
  else if (tab === 'sprint') body = resultTable(race.sprint, true);
  else body = resultTable(race.results, false);
  if (!body) {
    body = `<div class="empty">
      <p>${start > new Date() ? '這一站還沒開始比賽。' : '成績尚未公布，請稍後再回來看看。'}</p>
      <a class="btn" href="#schedule/${race.round}">查看這一站的時間表 →</a></div>`;
  }

  $view.innerHTML = `
    <article class="card">
      <div class="round-nav">
        ${prev ? `<a class="btn" href="#round/${prev.round}/${tab}" aria-label="上一站">‹</a>` : '<span class="btn disabled">‹</span>'}
        <select id="round-select" aria-label="選擇分站">${d.races.map((r) => `
          <option value="${r.round}" ${r === race ? 'selected' : ''}>R${r.round} · ${countryFlag(r.circuit?.Location?.country)} ${esc(r.name)}</option>`).join('')}
        </select>
        ${next ? `<a class="btn" href="#round/${next.round}/${tab}" aria-label="下一站">›</a>` : '<span class="btn disabled">›</span>'}
      </div>
      <p class="muted round-meta">${esc(race.circuit?.circuitName || '')} · ${esc(race.circuit?.Location?.locality || '')}, ${esc(race.circuit?.Location?.country || '')} · 正賽 ${formatDateTime(start)}</p>
      <div class="subtabs" role="tablist">${tabs.map(([k, label]) => `
        <a role="tab" href="#round/${race.round}/${k}" class="${k === tab ? 'active' : ''}" aria-selected="${k === tab}">${label}</a>`).join('')}
      </div>
      ${body}
    </article>`;

  document.getElementById('round-select').addEventListener('change', (e) => {
    location.hash = `round/${e.target.value}/${tab}`;
  });
  return race.round;
}

// 非數字的名次代碼（API 用字母表示）
const POS_CODE = { R: 'DNF', D: 'DSQ', E: 'EX', W: 'DNS', F: 'DNQ', N: 'NC' };

function resultTable(rows, isSprint) {
  if (!rows.length) return '';
  const fastest = rows.find((r) => r.FastestLap?.rank === '1');
  return `
    ${fastest ? `<p class="fastest-note">⏱ 最快圈：${driverLink(fastest.Driver, state.data.season)}
      <b>${esc(fastest.FastestLap.Time?.time)}</b>（第 ${esc(fastest.FastestLap.lap)} 圈）</p>` : ''}
    <div class="table-wrap"><table class="data results">
    <thead><tr><th class="num">名次</th><th>車手</th><th>車隊</th><th class="num">發車</th><th class="num">升降</th>
      <th class="num">圈數</th><th>時間 / 差距</th>${isSprint ? '' : '<th>最快圈</th>'}<th class="num">得分</th></tr></thead>
    <tbody>${rows.map((r) => {
      const grid = Number(r.grid);
      const pos = Number(r.position);
      const classified = /^\d+$/.test(r.positionText);
      let change = '';
      if (classified && grid > 0) {
        const diff = grid - pos;
        change = diff > 0 ? `<span class="up">▲${diff}</span>` : diff < 0 ? `<span class="down">▼${-diff}</span>` : '<span class="muted">—</span>';
      }
      const finished = isFinished(r.status);
      const timeCell = r.Time?.time
        ? esc(r.Time.time)
        : `<span class="${finished ? 'muted' : 'dnf'}">${esc(statusZh(r.status))}</span>`;
      const fl = r.FastestLap;
      return `<tr class="${pos <= 3 && classified ? `top${pos}` : ''}">
        <td class="num pos">${classified ? esc(r.positionText) : `<span class="dnf" title="${esc(statusZh(r.status))}">${POS_CODE[r.positionText] || esc(r.positionText)}</span>`}</td>
        <td><span class="car-no">${esc(r.number)}</span>${driverLink(r.Driver, state.data.season)}</td>
        <td>${teamLink(r.Constructor, state.data.season)}</td>
        <td class="num">${grid === 0 ? '<span class="muted small">維修區</span>' : grid}</td>
        <td class="num">${change}</td>
        <td class="num">${esc(r.laps)}</td>
        <td class="mono">${timeCell}</td>
        ${isSprint ? '' : `<td class="mono ${fl?.rank === '1' ? 'purple' : ''}">${esc(fl?.Time?.time || '')}</td>`}
        <td class="num pts"><b>${Number(r.points) ? esc(r.points) : ''}</b></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function qualifyingTable(rows) {
  if (!rows.length) return '';
  // 每一節（Q1/Q2/Q3）找出最快時間，用紫色標示（F1 轉播的慣例）
  const best = {};
  for (const q of ['Q1', 'Q2', 'Q3']) {
    const times = rows.map((r) => lapToMs(r[q])).filter(Boolean);
    best[q] = times.length ? Math.min(...times) : null;
  }
  const bestOf = (r) => lapToMs(r.Q3) || lapToMs(r.Q2) || lapToMs(r.Q1);
  const pole = bestOf(rows[0]);
  const cell = (r, q) => {
    const ms = lapToMs(r[q]);
    return `<td class="mono ${ms && ms === best[q] ? 'purple' : ''}">${esc(r[q] || '')}</td>`;
  };
  return `<p class="muted small">Q1 淘汰最慢的車手、Q2 再淘汰一批，前 10 名進入 Q3 爭奪竿位。紫色 = 該節最快。</p>
    <div class="table-wrap"><table class="data">
    <thead><tr><th class="num">名次</th><th>車手</th><th>車隊</th><th>Q1</th><th>Q2</th><th>Q3</th><th class="num">與竿位差距</th></tr></thead>
    <tbody>${rows.map((r) => {
      const t = bestOf(r);
      return `<tr class="${Number(r.position) <= 3 ? `top${r.position}` : ''}">
        <td class="num pos">${esc(r.position)}</td>
        <td><span class="car-no">${esc(r.number)}</span>${driverLink(r.Driver, state.data.season)}</td>
        <td>${teamLink(r.Constructor, state.data.season)}</td>
        ${cell(r, 'Q1')}${cell(r, 'Q2')}${cell(r, 'Q3')}
        <td class="num mono muted">${t && pole ? formatGap(t - pole) : ''}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

// ============================================================
// 畫面 5：賽程表
// ============================================================
function viewSchedule(route) {
  const d = state.data;
  const states = raceStates(d.races);
  const now = new Date();
  const labels = { done: '已完賽', pending: '成績待更新', next: '下一站', todo: '待賽' };
  const filters = [['all', '全部'], ['todo', '待賽'], ['done', '已完賽']];
  const visible = d.races.filter((r, i) => {
    if (state.scheduleFilter === 'done') return states[i] === 'done' || states[i] === 'pending';
    if (state.scheduleFilter === 'todo') return states[i] === 'next' || states[i] === 'todo';
    return true;
  });

  $view.innerHTML = `
    <div class="schedule-bar">
      <div class="chips">${filters.map(([k, label]) => `
        <button type="button" class="chip ${state.scheduleFilter === k ? 'active' : ''}" data-filter="${k}">${label}</button>`).join('')}
      </div>
      <span class="muted small">時區：${esc(userTimeZone())}</span>
    </div>
    <div class="schedule-list">${visible.map((race) => {
      const st = states[d.races.indexOf(race)];
      const loc = race.circuit?.Location || {};
      return `<article class="card race-card state-${st} ${race.round === route.round ? 'is-target' : ''}" id="race-${race.round}">
        <header>
          <span class="round-badge">R${race.round}</span>
          <div class="race-title">
            <h3>${countryFlag(loc.country)} ${esc(race.name)}</h3>
            <p class="muted small">${esc(race.circuit?.circuitName || '')} · ${esc(loc.locality || '')}, ${esc(loc.country || '')}</p>
          </div>
          <span class="state-badge">${labels[st]}</span>
        </header>
        <table class="sessions">${race.sessions.map((s) => {
          const t = toDate(s.date, s.time);
          const past = t && t < now;
          return `<tr class="${past ? 'past' : ''} ${s.key === 'Race' ? 'is-race' : ''}">
            <td>${SESSION_LABELS[s.key] || s.key}</td>
            <td>${formatDate(t)}</td>
            <td class="mono">${s.time ? formatTime(t) : '時間未定'}</td>
          </tr>`;
        }).join('')}</table>
        ${st === 'done' ? `<a class="more" href="#round/${race.round}/race">🏆 ${esc(driverName(race.results[0].Driver))} 奪冠 · 查看成績 →</a>` : ''}
        ${st === 'next' ? `<p class="countdown small" data-countdown="${toDate(race.date, race.time)?.toISOString() || ''}"></p>` : ''}
      </article>`;
    }).join('') || '<p class="muted">沒有符合的分站。</p>'}</div>`;

  $view.querySelectorAll('[data-filter]').forEach((btn) => btn.addEventListener('click', () => {
    state.scheduleFilter = btn.dataset.filter;
    render();
  }));

  if (route.round) {
    document.getElementById(`race-${route.round}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return route.round;
}

// ============================================================
// 倒數計時：每 30 秒更新畫面上所有 data-countdown 的元素
// ============================================================
function updateCountdowns() {
  document.querySelectorAll('[data-countdown]').forEach((el) => {
    if (el.dataset.countdown) el.textContent = `⏱ 倒數 ${countdown(new Date(el.dataset.countdown))}`;
  });
}

// ============================================================
// 載入資料 + 顯示資料來源狀態
// ============================================================
function showStatus(meta) {
  const time = meta.oldest ? formatDateTime(new Date(meta.oldest)) : '';
  if (meta.snapshot > 0) {
    $status.innerHTML = `<span class="warn">⚠ 即時 API 暫時無法連線，目前顯示備份資料（${esc(formatDateTime(new Date(meta.snapshotTime)))}）</span>`;
  } else if (meta.live > 0) {
    $status.textContent = `✓ 已更新至最新資料（${formatDateTime(new Date())}）`;
  } else {
    $status.textContent = `資料時間：${time}（快取，每 10 分鐘自動更新）`;
  }
}

async function load() {
  try {
    state.data = await loadSeason(season);
  } catch (err) {
    console.error(err);
    $status.innerHTML = '<span class="warn">⚠ 無法取得資料</span>';
    $view.innerHTML = `<div class="empty card"><p>抓取資料失敗：${esc(err.message)}</p>
      <p class="muted small">可能是網路問題或 API 暫時忙碌，稍等幾秒再試一次。</p>
      <button class="btn" type="button" id="retry">重試</button></div>`;
    document.getElementById('retry').addEventListener('click', () => location.reload());
    return;
  }
  // 畫面錯誤不要被當成「抓資料失敗」，所以 render() 放在 try 外面
  showStatus(state.data.meta);
  render();
}

function init() {
  // 賽季下拉選單：今年 → 1950
  const select = document.getElementById('season-select');
  for (let y = CURRENT_YEAR; y >= FIRST_SEASON; y--) {
    select.add(new Option(String(y), String(y), false, y === season));
  }
  select.addEventListener('change', () => {
    // 換賽季 = 換網址參數，頁面重新載入；保留目前的分頁 hash（分站編號可能不存在，路由會自動處理）
    const view = parseRoute().view;
    location.href = `?season=${select.value}#${view}`;
  });

  document.getElementById('tz').textContent = userTimeZone();
  document.getElementById('refresh-btn').addEventListener('click', async () => {
    clearCache(`/${season}/`);
    $status.textContent = '重新抓取中…';
    await load();
  });

  window.addEventListener('hashchange', render);
  // 視窗大小改變（例如手機轉橫向）時，重畫走勢圖以符合新寬度
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const el = document.getElementById('points-chart');
      if (el && state.data) renderPointsChart(el, state.data);
    }, 200);
  });
  setInterval(updateCountdowns, 30 * 1000);

  // 當季資料：頁面開著的時候每 10 分鐘自動更新一次
  if (season === CURRENT_YEAR) setInterval(load, 10 * 60 * 1000);

  document.title = `${season} F1 賽季成績`;
  load();
}

init();
