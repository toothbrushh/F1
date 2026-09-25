// ============================================================
// chart.js — 積分走勢折線圖（純 SVG，不用任何圖表套件）
// 學習重點：SVG 座標系 (0,0) 在左上角，y 往下變大，
// 所以「積分越高 → y 越小」，要用 scale 函式把資料值換算成像素。
// ============================================================
import { esc, teamColor, driverName } from './utils.js';

/**
 * 算出每位車手「每一站結束後的累積積分」（正賽 + 衝刺賽）
 * 回傳 { rounds: [1,2,...], series: [{ driver, constructor, values: [...] }] }
 */
export function cumulativePoints(data, topN = 8) {
  const done = data.races.filter((r) => r.completed);
  const top = data.driverStandings.slice(0, topN);
  const series = top.map((s) => {
    let sum = 0;
    const values = done.map((race) => {
      for (const list of [race.results, race.sprint]) {
        const row = list.find((x) => x.Driver.driverId === s.Driver.driverId);
        if (row) sum += Number(row.points || 0);
      }
      return sum;
    });
    return { driver: s.Driver, constructor: s.Constructors?.[s.Constructors.length - 1], values };
  });
  return { rounds: done.map((r) => r.round), names: done.map((r) => r.name), series };
}

export function renderPointsChart(container, data) {
  const { rounds, names, series } = cumulativePoints(data);
  if (rounds.length < 2) {
    container.innerHTML = '<p class="muted">至少要比完兩站才會顯示走勢圖。</p>';
    return;
  }

  // 同隊的第二位車手用虛線，這樣顏色相同也分得出來（不只靠顏色辨識）
  const seenTeams = new Set();
  series.forEach((s) => {
    const id = s.constructor?.constructorId;
    s.color = teamColor(id);
    s.dashed = seenTeams.has(id);
    seenTeams.add(id);
    s.label = s.driver.code || s.driver.familyName;
  });

  // 用容器實際寬度當畫布寬度，手機上文字才不會被縮到看不清楚
  const W = Math.max(320, container.clientWidth || 760);
  const H = W < 500 ? 260 : 340;
  const pad = { top: 16, right: 56, bottom: 32, left: 44 };
  const maxY = Math.max(10, ...series.flatMap((s) => s.values));
  const niceMax = Math.ceil(maxY / 50) * 50;

  // scale 函式：資料值 → 像素
  const x = (i) => pad.left + (i / (rounds.length - 1)) * (W - pad.left - pad.right);
  const y = (v) => pad.top + (1 - v / niceMax) * (H - pad.top - pad.bottom);

  // 格線與 y 軸刻度
  const ticks = [];
  const step = niceMax <= 100 ? 25 : niceMax <= 300 ? 50 : 100;
  for (let v = 0; v <= niceMax; v += step) ticks.push(v);
  const grid = ticks.map((v) => `
    <line class="grid" x1="${pad.left}" x2="${W - pad.right}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="axis" x="${pad.left - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');

  // x 軸：站數太多時只標部分
  const every = Math.ceil(rounds.length / (W < 500 ? 6 : 12));
  const xLabels = rounds.map((r, i) => (i % every === 0 || i === rounds.length - 1)
    ? `<text class="axis" x="${x(i)}" y="${H - 10}" text-anchor="middle">R${r}</text>` : '').join('');

  // 每位車手一條折線：points 屬性是 "x1,y1 x2,y2 ..."
  const lines = series.map((s) => `
    <polyline class="series-line" fill="none" stroke="${s.color}" stroke-width="2"
      stroke-linejoin="round" stroke-linecap="round" ${s.dashed ? 'stroke-dasharray="6 4"' : ''}
      points="${s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>`).join('');

  // 線尾直接標名字；太靠近的標籤往下推開，避免重疊
  const ends = series
    .map((s) => ({ s, y: y(s.values[s.values.length - 1]) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  }
  const endLabels = ends.map(({ s, y: ly }) =>
    `<text class="end-label" x="${W - pad.right + 8}" y="${ly + 4}">${esc(s.label)}</text>`).join('');

  container.innerHTML = `
    <div class="chart-legend">${series.map((s) => `
      <span><svg width="22" height="8" aria-hidden="true"><line x1="1" x2="21" y1="4" y2="4" stroke="${s.color}"
        stroke-width="2" ${s.dashed ? 'stroke-dasharray="5 3"' : ''}/></svg>${esc(driverName(s.driver))}</span>`).join('')}
    </div>
    <div class="chart-box">
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="前 ${series.length} 名車手累積積分走勢">
        ${grid}${xLabels}${lines}${endLabels}
        <line class="crosshair" y1="${pad.top}" y2="${H - pad.bottom}" visibility="hidden"/>
        <g class="hover-dots"></g>
        <rect class="hit" x="${pad.left}" y="0" width="${W - pad.left - pad.right}" height="${H}" fill="transparent"/>
      </svg>
      <div class="tooltip" hidden></div>
    </div>`;

  // ---- 滑鼠移動：十字線對齊最近的一站，tooltip 列出所有車手當時積分 ----
  const svg = container.querySelector('svg.chart');
  const hit = svg.querySelector('.hit');
  const cross = svg.querySelector('.crosshair');
  const dots = svg.querySelector('.hover-dots');
  const tip = container.querySelector('.tooltip');

  function show(i) {
    cross.setAttribute('x1', x(i));
    cross.setAttribute('x2', x(i));
    cross.setAttribute('visibility', 'visible');
    dots.innerHTML = series.map((s) =>
      `<circle cx="${x(i)}" cy="${y(s.values[i])}" r="4" fill="${s.color}" class="hover-dot"/>`).join('');

    // tooltip 用 textContent 塞文字，避免 XSS
    tip.replaceChildren();
    const title = document.createElement('div');
    title.className = 'tip-title';
    title.textContent = `R${rounds[i]} ${names[i]}`;
    tip.append(title);
    [...series].sort((a, b) => b.values[i] - a.values[i]).forEach((s) => {
      const row = document.createElement('div');
      row.className = 'tip-row';
      const key = document.createElement('i');
      key.style.background = s.color;
      const val = document.createElement('b');
      val.textContent = s.values[i];
      const name = document.createElement('span');
      name.textContent = s.label;
      row.append(key, val, name);
      tip.append(row);
    });
    tip.hidden = false;
    // 把 SVG 座標換算回螢幕上的比例位置
    const ratio = svg.clientWidth / W;
    const left = x(i) * ratio;
    tip.style.left = `${left > svg.clientWidth / 2 ? left - tip.offsetWidth - 12 : left + 12}px`;
  }
  function hide() {
    cross.setAttribute('visibility', 'hidden');
    dots.innerHTML = '';
    tip.hidden = true;
  }
  hit.addEventListener('pointermove', (e) => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pad.left) / (W - pad.left - pad.right)) * (rounds.length - 1));
    show(Math.max(0, Math.min(rounds.length - 1, i)));
  });
  hit.addEventListener('pointerleave', hide);
}
