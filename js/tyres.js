// ============================================================
// tyres.js — 輪胎策略圖
// 每位車手一列，橫軸是圈數；每一段色條代表一套輪胎（一個 stint），
// 顏色就是輪胎顏色：紅 = 軟、黃 = 中性、白 = 硬、綠 = 半雨、藍 = 全雨。
// 色條裡也寫上字母（S/M/H/I/W），不只靠顏色辨識。
//
// 這裡用一般的 <div> 加百分比寬度畫圖，不用 SVG：
// 寬度用 % 表示，螢幕多寬都會自動縮放。
// ============================================================
import { esc, driverLink } from './utils.js';

export const COMPOUNDS = {
  SOFT: { label: '軟胎', short: 'S', color: '#e8002d', text: '#fff' },
  MEDIUM: { label: '中性胎', short: 'M', color: '#ffd12e', text: '#111' },
  HARD: { label: '硬胎', short: 'H', color: '#f0f0ec', text: '#111' },
  INTERMEDIATE: { label: '半雨胎', short: 'I', color: '#43b02a', text: '#fff' },
  WET: { label: '全雨胎', short: 'W', color: '#0067ad', text: '#fff' },
};
const UNKNOWN = { label: '未知', short: '?', color: '#6b6b78', text: '#fff' };
const compound = (name) => COMPOUNDS[name] || UNKNOWN;

/** 把 OpenF1 的 stint 依車號分組，並依 stint 順序排好 */
function groupByDriver(stints) {
  const map = new Map();
  for (const s of stints) {
    const no = String(s.driver_number);
    if (!map.has(no)) map.set(no, []);
    map.get(no).push(s);
  }
  for (const list of map.values()) list.sort((a, b) => a.stint_number - b.stint_number);
  return map;
}

/** 統計最常見的換胎組合，例如「M → H」有幾個人用 */
function commonStrategies(rows) {
  const count = new Map();
  for (const { stints } of rows) {
    if (!stints.length) continue;
    const key = stints.map((s) => compound(s.compound).short).join(' → ');
    count.set(key, (count.get(key) || 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
}

/**
 * @param {HTMLElement} el      要畫在哪裡
 * @param {Array} results       Jolpica 的正賽成績（已依名次排序）
 * @param {Array} stints        OpenF1 的 stint 資料
 * @param {number} season
 */
export function renderTyreStrategy(el, results, stints, season) {
  const byDriver = groupByDriver(stints);
  const rows = results.map((r) => ({ r, stints: byDriver.get(String(r.number)) || [] }));

  // 總圈數：冠軍跑的圈數，或 stint 資料裡最大的圈數
  const totalLaps = Math.max(
    Number(results[0]?.laps) || 0,
    ...stints.map((s) => Number(s.lap_end) || 0),
  );
  if (!totalLaps || !rows.some((x) => x.stints.length)) {
    el.innerHTML = '<p class="muted">這場比賽沒有輪胎資料。</p>';
    return;
  }

  const used = new Set(stints.map((s) => s.compound));
  const legend = Object.entries(COMPOUNDS).filter(([k]) => used.has(k)).map(([, c]) => `
    <span class="ty-legend-item"><i class="ty-swatch" style="--tc:${c.color};--tt:${c.text}">${c.short}</i>${c.label}</span>`).join('');

  const strategies = commonStrategies(rows);

  const rowHtml = rows.map(({ r, stints: list }) => {
    const classified = /^\d+$/.test(r.positionText);
    const lastLap = Number(r.laps) || totalLaps;
    const segs = list.map((s, i) => {
      const c = compound(s.compound);
      const from = Number(s.lap_start) || 1;
      // 最後一段有時沒有 lap_end（例如退賽），用這位車手實際跑的圈數
      const to = Number(s.lap_end) || (i === list.length - 1 ? lastLap : from);
      const laps = Math.max(1, to - from + 1);
      const left = ((from - 1) / totalLaps) * 100;
      const width = (laps / totalLaps) * 100;
      const age = Number(s.tyre_age_at_start) || 0;
      const tip = `第 ${from}–${to} 圈 · ${c.label} · ${laps} 圈${age > 0 ? `（舊胎，起跑時已用 ${age} 圈）` : '（新胎）'}`;
      return `<span class="ty-seg${age > 0 ? ' used' : ''}" style="left:${left}%;width:${width}%;--tc:${c.color};--tt:${c.text}"
        tabindex="0" title="${esc(tip)}" aria-label="${esc(tip)}">
        ${width > 5 ? `<b>${c.short}</b>` : ''}${width > 11 ? `<small>${laps}</small>` : ''}</span>`;
    }).join('');
    const stops = Math.max(0, list.length - 1);
    return `<div class="ty-row">
      <span class="ty-pos">${classified ? `P${esc(r.positionText)}` : '<span class="dnf">DNF</span>'}</span>
      <span class="ty-name"><span class="ty-full">${driverLink(r.Driver, season)}</span><span class="ty-code">${esc(r.Driver.code || r.Driver.familyName)}</span></span>
      <div class="ty-track">${segs || '<span class="muted small ty-none">沒有資料</span>'}</div>
      <span class="ty-stops">${list.length ? `${stops} 停` : ''}</span>
    </div>`;
  }).join('');

  // 圈數刻度：每 10 圈一個
  const ticks = [];
  for (let lap = 10; lap < totalLaps; lap += 10) ticks.push(lap);
  ticks.push(totalLaps);
  const axis = ticks.map((lap) => `<span style="left:${(lap / totalLaps) * 100}%">${lap}</span>`).join('');

  el.innerHTML = `
    <div class="ty-head">
      <div class="ty-legend">${legend}<span class="ty-legend-item"><i class="ty-swatch used" style="--tc:#9b9bab"></i>斜紋 = 舊胎</span></div>
      ${strategies.length ? `<p class="muted small">最常見的策略：${strategies.map(([k, n]) => `<b class="ty-strat">${esc(k)}</b>（${n} 人）`).join('、')}</p>` : ''}
    </div>
    <div class="ty-chart" role="img" aria-label="${esc(`各車手輪胎策略，共 ${totalLaps} 圈`)}">
      ${rowHtml}
      <div class="ty-row ty-axis-row"><span></span><span class="muted small">圈數</span><div class="ty-axis">${axis}</div><span></span></div>
    </div>
    <p class="muted small">滑鼠移到色條上（手機用長按）可以看每一段的圈數。資料來源：<a href="https://openf1.org" target="_blank" rel="noopener">OpenF1</a>。</p>`;
}

