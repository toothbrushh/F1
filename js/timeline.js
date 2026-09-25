// ============================================================
// timeline.js — 賽季步驟圖
// 每一站是一個「步驟點」，用一條線串起來：
//   實心 = 已完賽（下方顯示冠軍）、閃爍 = 下一站、空心 = 待賽
// 每個點都是 <a> 連結：已完賽 → 該站成績；未完賽 → 賽程表的那一站
// ============================================================
import { esc, countryFlag, formatDate, toDate, countdown } from './utils.js';

/** 判斷每一站的狀態：done / pending（比完但成績還沒出）/ next / todo */
export function raceStates(races, now = new Date()) {
  let nextFound = false;
  return races.map((race) => {
    if (race.completed) return 'done';
    const start = toDate(race.date, race.time);
    // 正賽開始 3 小時後還沒成績 → 視為「成績待更新」
    if (start && now - start > 3 * 3600 * 1000) return 'pending';
    if (!nextFound) {
      nextFound = true;
      return 'next';
    }
    return 'todo';
  });
}

export function nextRace(races) {
  const states = raceStates(races);
  const i = states.indexOf('next');
  return i >= 0 ? races[i] : null;
}

export function renderTimeline(el, data, activeRound) {
  const states = raceStates(data.races);
  const doneCount = states.filter((s) => s === 'done').length;

  document.getElementById('timeline-title').textContent =
    `${data.season} 賽季進度 · ${doneCount} / ${data.races.length} 站`;

  if (data.races.length === 0) {
    el.innerHTML = '<p class="muted">這個賽季還沒有公布賽程。</p>';
    return;
  }

  el.innerHTML = `<ol class="steps">${data.races.map((race, i) => {
    const state = states[i];
    const winner = race.results[0]?.Driver;
    const href = state === 'done' ? `#round/${race.round}/race` : `#schedule/${race.round}`;
    const start = toDate(race.date, race.time);
    let sub = formatDate(start);
    if (state === 'done' && winner) sub = `🏆 ${esc(winner.code || winner.familyName)}`;
    if (state === 'next') sub = `⏱ ${countdown(start)}`;
    if (state === 'pending') sub = '成績待更新';
    const place = race.circuit?.Location?.locality || race.name.replace(' Grand Prix', '');
    return `
      <li class="step step-${state}${race.round === activeRound ? ' is-active' : ''}">
        <a href="${href}" title="${esc(race.name)}">
          <span class="step-round">R${race.round}${race.hasSprint ? '<b class="sprint-tag" title="衝刺賽週末">S</b>' : ''}</span>
          <span class="step-dot" aria-hidden="true"></span>
          <span class="step-flag">${countryFlag(race.circuit?.Location?.country)}</span>
          <span class="step-name">${esc(place)}</span>
          <span class="step-sub">${sub}</span>
        </a>
      </li>`;
  }).join('')}</ol>`;

  // 讓「目前選取的站」或「下一站」自動捲到可見位置
  const done = el.querySelectorAll('.step-done');
  const target = el.querySelector('.is-active') || el.querySelector('.step-next') || done[done.length - 1];
  if (target) {
    el.scrollLeft = target.offsetLeft - el.clientWidth / 2 + target.clientWidth / 2;
  }
}
