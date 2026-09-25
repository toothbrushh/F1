// ============================================================
// profile.js — 車手 / 車隊介紹頁（driver.html 與 team.html 共用）
// 頁面用 <body data-kind="driver|team"> 告訴這支程式要畫哪一種
// 網址參數 ?id=hamilton&season=2026 決定要顯示誰
// ============================================================
import { loadDriverProfile, loadTeamProfile, loadStories } from './api.js';
import { avatar, hydratePhotos } from './photos.js';
import {
  esc, nationalityFlag, countryFlag, teamColor, teamLink, driverLink, driverName, formatFullDate,
} from './utils.js';

const params = new URLSearchParams(location.search);
const id = params.get('id') || '';
const season = Number(params.get('season')) || new Date().getFullYear();
const kind = document.body.dataset.kind;
const $root = document.getElementById('profile');

document.querySelectorAll('[data-back]').forEach((a) => {
  a.href = `./?season=${season}#${kind === 'driver' ? 'drivers' : 'teams'}`;
  a.textContent = `← 回到 ${season} 賽季`;
});

// 只有「已經結束」的賽季拿第一才算冠軍（今年的第一名只是暫時領先）
const isChampion = (h) => h.position === '1' && h.season < new Date().getFullYear();

function truncatedNote(p) {
  return p.historyTruncated ? '<p class="muted small">只列出最近 20 個賽季。</p>' : '';
}

function statCard(label, value, note = '') {
  return `<div class="stat"><b>${value ?? '—'}</b><span>${label}</span>${note ? `<small>${note}</small>` : ''}</div>`;
}

/** 故事區塊：內容來自 data/stories.json（自己寫的中文介紹） */
function storyBlock(story, wikiUrl, name) {
  const wiki = wikiUrl ? `<a class="more" href="${esc(wikiUrl)}" target="_blank" rel="noopener">在 Wikipedia 看更多 →</a>` : '';
  if (!story) {
    return `<article class="card story"><h2>故事</h2>
      <p class="muted">還沒有撰寫 ${esc(name)} 的中文介紹。你可以在 <code>data/stories.json</code> 裡自己加上去！</p>${wiki}</article>`;
  }
  return `<article class="card story">
    <h2>故事${story.nickname ? ` <small>「${esc(story.nickname)}」</small>` : ''}</h2>
    ${story.tagline ? `<p class="tagline">${esc(story.tagline)}</p>` : ''}
    ${(story.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join('')}
    ${story.highlights?.length ? `<h3>生涯亮點</h3><ul class="highlights">${story.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
    ${wiki}
  </article>`;
}

/** 本季每站名次的小方塊 */
function seasonStrip(races, pickRows) {
  if (!races.length) return '<p class="muted">這個賽季還沒有正賽成績。</p>';
  return `<div class="result-strip">${races.map((race) => {
    const rows = pickRows(race);
    return rows.map((r) => {
      const pos = Number(r.position);
      const classified = /^\d+$/.test(r.positionText);
      const cls = !classified ? 'dnf' : pos === 1 ? 'p1' : pos <= 3 ? 'pod' : Number(r.points) > 0 ? 'pts' : '';
      return `<a class="strip-cell ${cls}" href="./?season=${season}#round/${race.round}/race"
        title="R${race.round} ${esc(race.raceName)}：${classified ? `第 ${pos} 名` : esc(r.status)}，${esc(r.points)} 分">
        <small>R${race.round} ${countryFlag(race.Circuit?.Location?.country)}</small>
        <b>${classified ? `P${pos}` : 'DNF'}</b></a>`;
    }).join('');
  }).join('')}</div>
  <p class="muted small">金色 = 冠軍、銀色 = 頒獎台、有底色 = 有拿分。點方塊看該站成績。</p>`;
}

async function renderDriver() {
  const [p, stories] = await Promise.all([loadDriverProfile(id, season), loadStories()]);
  const d = p.driver;
  const story = stories.drivers?.[stories.aliases?.[id] || id];
  const lastTeam = p.seasonRaces.at(-1)?.Results[0]?.Constructor || p.history.at(-1)?.Constructors?.at(-1);
  const color = teamColor(lastTeam?.constructorId);
  const age = d.dateOfBirth ? Math.floor((Date.now() - new Date(d.dateOfBirth)) / (365.25 * 86400000)) : null;
  document.title = `${driverName(d)} · F1 車手`;

  const firstSeason = p.firstSeason;
  $root.innerHTML = `
    <section class="hero" style="--c:${color}">
      ${avatar(d.url, driverName(d), 'lg')}
      <div class="hero-text">
        ${d.permanentNumber ? `<span class="hero-no">${esc(d.permanentNumber)}</span>` : ''}
        <p class="muted">${nationalityFlag(d.nationality)} ${esc(d.nationality)}${d.code ? ` · ${esc(d.code)}` : ''}</p>
        <h1>${esc(driverName(d))}</h1>
        <p>${lastTeam ? teamLink(lastTeam, season) : ''}
          ${d.dateOfBirth ? ` · 生日 ${formatFullDate(new Date(d.dateOfBirth))}${age ? `（${age} 歲）` : ''}` : ''}</p>
      </div>
    </section>

    <section class="stats">
      ${statCard('世界冠軍', p.stats.titles)}
      ${statCard('分站冠軍', p.stats.wins)}
      ${statCard('頒獎台', p.stats.podiums)}
      ${statCard('竿位', p.stats.poles, '1994 年起有排位資料')}
      ${statCard('出賽', p.stats.starts)}
      ${statCard('參賽季數', p.stats.seasons)}
    </section>

    ${storyBlock(story, d.url, driverName(d))}

    <article class="card">
      <h2>${season} 賽季每站成績</h2>
      ${seasonStrip(p.seasonRaces, (race) => race.Results || [])}
    </article>

    <article class="card">
      <h2>歷年成績${firstSeason ? `（${firstSeason} 年出道）` : ''}</h2>
      ${truncatedNote(p)}
      <div class="table-wrap"><table class="data">
        <thead><tr><th>賽季</th><th>車隊</th><th class="num">年度名次</th><th class="num">勝場</th><th class="num">積分</th></tr></thead>
        <tbody>${[...p.history].reverse().map((h) => `<tr class="${isChampion(h) ? 'champion' : ''}">
          <td><a class="name-link" href="./?season=${h.season}#drivers">${h.season}</a></td>
          <td>${(h.Constructors || []).map((c) => teamLink(c, h.season)).join('、')}</td>
          <td class="num pos">${isChampion(h) ? '🏆 ' : ''}${esc(h.positionText || h.position || '—')}</td>
          <td class="num">${esc(h.wins)}</td>
          <td class="num"><b>${esc(h.points)}</b></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </article>`;
}

async function renderTeam() {
  const [p, stories] = await Promise.all([loadTeamProfile(id, season), loadStories()]);
  const t = p.team;
  const story = stories.teams?.[stories.aliases?.[id] || id];
  const color = teamColor(t.constructorId);
  document.title = `${t.name} · F1 車隊`;

  // 本季每站：兩位車手的得分合計
  const perRace = p.seasonRaces.map((race) => ({
    race,
    points: (race.Results || []).reduce((s, r) => s + Number(r.points || 0), 0),
    best: Math.min(...(race.Results || []).map((r) => (/^\d+$/.test(r.positionText) ? Number(r.position) : 99))),
  }));
  const maxPts = Math.max(1, ...perRace.map((x) => x.points));

  $root.innerHTML = `
    <section class="hero team-hero" style="--c:${color}">
      ${avatar(t.url, t.name, 'lg', 'square')}
      <div class="hero-text">
        <p class="muted">${nationalityFlag(t.nationality)} ${esc(t.nationality)}</p>
        <h1>${esc(t.name)}</h1>
        <p>${season} 車手：${p.drivers.map((d) => `<span class="hero-driver">${avatar(d.url, driverName(d))}${driverLink(d, season)}</span>`).join('') || '—'}</p>
      </div>
    </section>

    <section class="stats">
      ${statCard('車隊冠軍', p.stats.titles, '1958 年起')}
      ${statCard('分站冠軍', p.stats.wins)}
      ${statCard('竿位', p.stats.poles, '1994 年起有排位資料')}
      ${statCard('參賽站數', p.stats.races)}
      ${statCard('參賽季數', p.stats.seasons, p.firstSeason ? `${p.firstSeason} 年起` : '')}
    </section>

    ${storyBlock(story, t.url, t.name)}

    <article class="card">
      <h2>${season} 賽季每站得分</h2>
      ${perRace.length ? `<div class="team-bars">${perRace.map(({ race, points, best }) => `
        <a href="./?season=${season}#round/${race.round}/race" class="tbar" title="R${race.round} ${esc(race.raceName)}：${points} 分，最佳 P${best === 99 ? '—' : best}">
          <span class="tbar-val">${points || ''}</span>
          <span class="tbar-fill" style="height:${(points / maxPts) * 100}%;--c:${color}"></span>
          <small>R${race.round}</small>
        </a>`).join('')}</div>` : '<p class="muted">這個賽季還沒有正賽成績。</p>'}
    </article>

    <article class="card">
      <h2>歷年車隊積分</h2>
      ${truncatedNote(p)}
      ${p.history.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>賽季</th><th class="num">年度名次</th><th class="num">勝場</th><th class="num">積分</th></tr></thead>
        <tbody>${[...p.history].reverse().map((h) => `<tr class="${isChampion(h) ? 'champion' : ''}">
          <td><a class="name-link" href="./?season=${h.season}#teams">${h.season}</a></td>
          <td class="num pos">${isChampion(h) ? '🏆 ' : ''}${esc(h.positionText || h.position || '—')}</td>
          <td class="num">${esc(h.wins)}</td>
          <td class="num"><b>${esc(h.points)}</b></td>
        </tr>`).join('')}</tbody></table></div>` : '<p class="muted">沒有車隊積分紀錄（車隊冠軍從 1958 年開始）。</p>'}
    </article>`;
}

(kind === 'driver' ? renderDriver() : renderTeam()).then(() => hydratePhotos($root)).catch((err) => {
  console.error(err);
  $root.innerHTML = `<div class="card empty"><p>載入失敗：${esc(err.message)}</p>
    <p class="muted small">可能是網路問題或 API 暫時忙碌，稍後再試。</p>
    <button class="btn" type="button" onclick="location.reload()">重試</button></div>`;
});
