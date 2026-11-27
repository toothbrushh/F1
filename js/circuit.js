// ============================================================
// circuit.js — 賽道介紹頁（circuit.html?id=suzuka&season=2026）
//
// 內容分兩種來源：
//   1. 自己寫的介紹：data/circuits.json（國家、歷史、區段、特色、輪胎、天氣）
//   2. 真實資料：這一季的賽程（Jolpica）、上次在這裡的輪胎策略（OpenF1 存檔）、
//      歷屆冠軍（Jolpica）、比賽週末天氣預報（Open-Meteo）
// 先把第 1 種馬上畫出來，第 2 種各自慢慢補上；其中一個失敗也不影響其他區塊。
// ============================================================
import {
  loadSeason, loadCircuits, loadCircuitMaps, findCircuit, loadCircuitInfo, loadCircuitWinners, loadForecast,
  loadTyreStints, TYRE_DATA_FROM,
} from './api.js';
import { summarizeStrategies } from './tyres.js';
import { trackMap } from './trackmap.js';
import {
  esc, countryFlag, toDate, formatDate, formatTime, driverLink, teamLink, driverName, sessionLabel,
  userTimeZone,
} from './utils.js';
import { t, lang, applyStatic } from './i18n.js';

const params = new URLSearchParams(location.search);
const id = params.get('id') || '';
const season = Number(params.get('season')) || new Date().getFullYear();
const $root = document.getElementById('circuit');

applyStatic();
document.title = t('circuit.page');
document.querySelectorAll('[data-back]').forEach((a) => {
  a.href = `./?season=${season}#circuits`;
  a.textContent = t('circuit.back', { season });
});

// ---------- 小工具 ----------
const list = (items) => (items?.length ? `<ul class="highlights">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
const paras = (items) => (items || []).map((p) => `<p>${esc(p)}</p>`).join('');
const statCard = (label, value) => `<div class="stat"><b>${value ?? '—'}</b><span>${label}</span></div>`;

function ratingRow(key, value) {
  if (!value) return '';
  const dots = Array.from({ length: 5 }, (_, i) => `<i class="${i < value ? 'on' : ''}"></i>`).join('');
  return `<div class="rating"><span>${t(`circuit.rating.${key}`)}</span>
    <span class="rating-dots" role="img" aria-label="${value} / 5">${dots}</span></div>`;
}

// Open-Meteo 的天氣代碼（WMO）→ 圖示
function weatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  return '⛈️';
}

// ---------- 主要內容 ----------
function renderPage(circuit, info, race, map) {
  const loc = circuit?.Location || {};
  const name = circuit?.circuitName || id;
  const c = info ? (info[lang] || info.zh) : null;
  const facts = info?.facts || {};
  document.title = t('circuit.title', { name });

  // 正賽圈數：有成績就用冠軍實際跑的圈數，否則用資料檔裡的數字
  const laps = Number(race?.results?.[0]?.laps) || facts.laps;
  const lapsNote = laps && facts.lengthKm ? `<small>${t('circuit.raceDistance', { n: Math.round(laps * facts.lengthKm) })}</small>` : '';

  const raceBox = race
    ? `<p class="muted">${t('circuit.thisSeason', { season, round: race.round })} · ${esc(race.name)} · ${formatDate(toDate(race.date, race.time))}</p>
       <p><a class="more" href="./?season=${season}#round/${race.round}/race">${t('circuit.viewResults')}</a>
          <a class="more" href="./?season=${season}#schedule/${race.round}">${t('circuit.viewSchedule')}</a></p>`
    : `<p class="muted">${t('circuit.notThisSeason', { season })}</p>`;

  // 用經緯度開 Google 地圖（手機上會直接開 Google Maps App）
  const mapLink = loc.lat && loc.long
    ? `<a class="more" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(`${loc.lat},${loc.long}`)}" target="_blank" rel="noopener">${t('circuit.map')}</a>` : '';
  const wiki = circuit?.url ? `<a class="more" href="${esc(circuit.url)}" target="_blank" rel="noopener">${t('profile.wiki')}</a>` : '';

  $root.innerHTML = `
    <section class="hero circuit-hero" style="--c:var(--accent)">
      <span class="circuit-flag" aria-hidden="true">${countryFlag(loc.country)}</span>
      <div class="hero-text">
        <p class="muted">${esc(loc.locality || '')}${loc.country ? `, ${esc(loc.country)}` : ''}</p>
        <h1>${esc(name)}</h1>
        ${c?.tagline ? `<p class="tagline">${esc(c.tagline)}</p>` : ''}
        ${raceBox}
      </div>
    </section>

    ${info ? `<section class="stats">
      ${facts.lengthKm ? statCard(t('circuit.length'), t('circuit.km', { n: facts.lengthKm })) : ''}
      ${facts.turns ? statCard(t('circuit.turns'), facts.turns) : ''}
      ${laps ? `<div class="stat"><b>${laps}</b><span>${t('circuit.laps')}</span>${lapsNote}</div>` : ''}
      ${facts.firstGP ? statCard(t('circuit.firstGP'), facts.firstGP) : ''}
      ${facts.direction ? statCard(t('circuit.direction'), t(`circuit.dir.${facts.direction}`)) : ''}
      ${facts.type ? statCard(t('circuit.type'), t(`circuit.type.${facts.type}`)) : ''}
    </section>` : ''}

    ${map ? `<article class="card">
      <h2>🗺 ${t('circuit.mapTitle')}</h2>
      <div class="track-map-wrap">${trackMap(map, facts.lengthKm)}</div>
      <p class="tm-legend small">
        <span><i class="tm-key tm-key-straight"></i>${t('circuit.mapLegendStraight')}</span>
        <span><i class="tm-key tm-key-arrow">➤</i>${t('circuit.mapLegendArrow')}</span>
        <span>🏁 ${t('circuit.mapStart')}</span>
      </p>
      <p class="muted small">${t('circuit.mapNote')}</p>
    </article>` : ''}

    ${c ? `
    <div class="two-col">
      <article class="card story">
        <h2>${t('circuit.countryHistory')}</h2>
        <p>${esc(c.country)}</p>
        ${paras(c.history)}
        ${wiki} ${mapLink}
      </article>
      <article class="card">
        <h2>${t('circuit.ratings')}</h2>
        ${ratingRow('tyreStress', info.ratings?.tyreStress)}
        ${ratingRow('downforce', info.ratings?.downforce)}
        ${ratingRow('overtaking', info.ratings?.overtaking)}
        <p class="muted small">${t('circuit.ratingsNote')}</p>
        <h3>${t('circuit.features')}</h3>
        ${list(c.features)}
      </article>
    </div>

    <article class="card story">
      <h2>${t('circuit.trackGuide')}</h2>
      <p>${esc(c.layout)}</p>
      <h3>${t('circuit.sectors')}</h3>
      <ol class="sector-list">${(c.sectors || []).map((s, i) => `
        <li><span class="sector-badge">${t('circuit.sector', { n: i + 1 })}</span><p>${esc(s.replace(/^[^：:]*[：:]\s*/, ''))}</p></li>`).join('')}
      </ol>
    </article>

    <div class="two-col">
      <article class="card story">
        <h2>🛞 ${t('circuit.tyres')}</h2>
        ${info.tyreRange ? `<p><b>${t('circuit.tyreRange')}</b>${t(`circuit.tyreRange.${info.tyreRange}`)}</p>` : ''}
        <p>${esc(c.tyres)}</p>
        <div id="tyre-summary"></div>
      </article>
      <article class="card story">
        <h2>🌤 ${t('circuit.weather')}</h2>
        <p>${esc(c.weather)}</p>
        <div id="forecast"></div>
      </article>
    </div>` : `
    <article class="card story"><p class="muted">${t('circuit.noStory')}</p>${wiki} ${mapLink}</article>`}

    ${race ? sessionsCard(race) : ''}

    <article class="card">
      <h2>${t('circuit.winners')}</h2>
      <div id="winners"><div class="loading"><div class="spinner"></div></div></div>
    </article>`;
}

/** 這一季在這裡的賽程（當地時間換算成使用者時區） */
function sessionsCard(race) {
  const now = new Date();
  return `<article class="card">
    <div class="card-head"><h2>${t('circuit.thisSeason', { season, round: race.round })}</h2>
      <span class="muted small">${t('schedule.tz', { tz: esc(userTimeZone()) })}</span></div>
    <table class="sessions">${race.sessions.map((s) => {
      const time = toDate(s.date, s.time);
      return `<tr class="${time && time < now ? 'past' : ''} ${s.key === 'Race' ? 'is-race' : ''}">
        <td>${esc(sessionLabel(s.key))}</td><td>${formatDate(time)}</td>
        <td class="mono">${s.time ? formatTime(time) : t('schedule.timeTbc')}</td></tr>`;
    }).join('')}</table>
  </article>`;
}

// ---------- 慢慢補上的真實資料 ----------
async function fillWinners() {
  const el = document.getElementById('winners');
  try {
    const races = (await loadCircuitWinners(id)).filter((r) => r.Results?.[0]).slice(-10).reverse();
    if (!races.length) {
      el.innerHTML = `<p class="muted">${t('circuit.winnersEmpty')}</p>`;
      return;
    }
    el.innerHTML = `<div class="table-wrap"><table class="data">
      <thead><tr><th>${t('circuit.year')}</th><th>${t('table.driver')}</th><th>${t('table.team')}</th></tr></thead>
      <tbody>${races.map((r) => {
        const w = r.Results[0];
        return `<tr><td><a class="name-link" href="./?season=${esc(r.season)}#round/${esc(r.round)}/race">${esc(r.season)}</a></td>
          <td>${driverLink(w.Driver, r.season)}</td><td>${teamLink(w.Constructor, r.season)}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  } catch (err) {
    console.warn(err);
    el.innerHTML = `<p class="muted">${t('circuit.winnersEmpty')}</p>`;
  }
}

/** 上一次在這條賽道比完的正賽（今年比完了就用今年，否則找去年） */
async function lastCompletedRace(seasonData) {
  const here = (d) => d?.races.find((r) => r.completed && r.circuit?.circuitId === id);
  const thisYear = here(seasonData);
  if (thisYear) return { year: season, race: thisYear };
  if (season - 1 < TYRE_DATA_FROM) return null;
  const prev = await loadSeason(season - 1).catch(() => null);
  const race = here(prev);
  return race ? { year: season - 1, race } : null;
}

async function fillTyres(seasonData) {
  const el = document.getElementById('tyre-summary');
  if (!el) return;
  try {
    const last = await lastCompletedRace(seasonData);
    if (!last || last.year < TYRE_DATA_FROM) {
      el.innerHTML = `<p class="muted small">${t('circuit.noTyreData')}</p>`;
      return;
    }
    const data = await loadTyreStints(last.year, last.race);
    const sum = data && summarizeStrategies(last.race.results, data.stints);
    if (!sum) {
      el.innerHTML = `<p class="muted small">${t('circuit.noTyreData')}</p>`;
      return;
    }
    const winner = last.race.results[0];
    el.innerHTML = `<h3>${t('circuit.lastTyres', { year: last.year })}</h3>
      <p>${t('circuit.compoundsUsed')}${sum.compounds.map((c) => `<span class="ty-legend-item"><i class="ty-swatch" style="--tc:${c.color};--tt:${c.text}">${c.short}</i>${esc(c.label)}</span>`).join(' ')}</p>
      ${sum.winner ? `<p>${t('circuit.winnerStrategy', { driver: esc(driverName(winner.Driver)), strategy: esc(sum.winner), stops: t('tyre.stops', { n: sum.winnerStops }) })}</p>` : ''}
      ${sum.common.length ? `<p class="muted small">${t('tyre.common')}${sum.common.map(([k, n]) => `<b class="ty-strat">${esc(k)}</b>${t('tyre.commonItem', { n })}`).join(t('table.listSep'))}</p>` : ''}
      <a class="more" href="./?season=${last.year}#round/${last.race.round}/tyres">${t('circuit.fullTyreChart')}</a>`;
  } catch (err) {
    console.warn(err);
    el.innerHTML = `<p class="muted small">${t('circuit.noTyreData')}</p>`;
  }
}

/** 比賽週末在 14 天內才有天氣預報 */
async function fillForecast(race) {
  const el = document.getElementById('forecast');
  const loc = race?.circuit?.Location;
  if (!el || !loc?.lat || !loc?.long) return;
  const dates = race.sessions.map((s) => s.date).filter(Boolean).sort();
  const first = dates[0];
  const last = race.date;
  const raceEnd = toDate(race.date, race.time);
  const daysAway = (new Date(`${first}T00:00:00Z`) - Date.now()) / 86400000;
  if (!first || !raceEnd || raceEnd < new Date() || daysAway > 14) return;
  try {
    const days = await loadForecast(loc.lat, loc.long, first, last);
    if (!days.length) return;
    el.innerHTML = `<h3>${t('circuit.forecast')}</h3>
      <div class="forecast">${days.map((d) => `
        <div class="fc-day">
          <small>${formatDate(new Date(`${d.date}T12:00:00`))}</small>
          <span class="fc-icon" aria-hidden="true">${weatherIcon(d.code)}</span>
          <b>${Math.round(d.max)}° / ${Math.round(d.min)}°</b>
          ${d.rain != null ? `<small>${t('circuit.rainChance', { n: d.rain })}</small>` : ''}
        </div>`).join('')}
      </div>
      <p class="muted small">${t('circuit.forecastNote')}</p>`;
  } catch (err) {
    console.warn(err); // 預報失敗就只顯示一般氣候說明
  }
}

async function main() {
  const [circuits, maps, seasonData] = await Promise.all([loadCircuits(), loadCircuitMaps(), loadSeason(season).catch(() => null)]);
  const race = seasonData?.races.find((r) => r.circuit?.circuitId === id) || null;
  // 這一季沒在這裡比賽 → 另外問 API 這條賽道的名稱與地點
  const circuit = race?.circuit || await loadCircuitInfo(id).catch(() => null);
  const found = findCircuit(circuits, id, circuit?.Location?.locality);
  if (!circuit && !found) throw new Error(`找不到賽道 / circuit not found: ${id}`);
  renderPage(circuit, found?.info, race, maps[id] || (found && maps[found.id]) || null);
  fillWinners();
  fillTyres(seasonData);
  fillForecast(race);
}

main().catch((err) => {
  console.error(err);
  $root.innerHTML = `<div class="card empty"><p>${t('profile.failed', { msg: esc(err.message) })}</p>
    <p class="muted small">${t('profile.failedHint')}</p>
    <button class="btn" type="button" onclick="location.reload()">${t('common.retry')}</button></div>`;
});

