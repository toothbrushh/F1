// ============================================================
// trackmap.js — 賽道平面圖（SVG）
// 資料來自 data/circuit-maps.json（由 scripts/circuit-maps.mjs 產生）：
//   points：賽道外形（公尺，x 往東、y 往北），第一個點在起點/終點，順序就是比賽方向
//   straights：自動計算的直線段 [{ from, to, length }]，單位公尺
//
// SVG 的 y 軸往下，地圖的 y（北）往上，所以畫的時候把 y 取負號。
// viewBox 直接用公尺當單位，線條粗細等大小則依賽道範圍等比例換算。
// ============================================================
import { esc } from './utils.js';
import { t } from './i18n.js';

/** 預先算好每個點離起點的距離，方便「沿著賽道走 d 公尺在哪裡」 */
function prepare(map) {
  const pts = map.points.map(([x, y]) => [x, -y]);
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i % pts.length];
    cum.push(cum[i - 1] + Math.hypot(x2 - x1, y2 - y1));
  }
  // straights 的距離是用重新取樣後的長度算的，換算成這裡的長度
  const scale = cum[pts.length] / (map.pathLength || cum[pts.length]);
  return { pts, cum, total: cum[pts.length], scale };
}

/** 沿著賽道走 d 公尺的位置與方向（弧度） */
function pointAt(g, d) {
  const dist = ((d % g.total) + g.total) % g.total;
  let i = 0;
  while (i < g.pts.length - 1 && g.cum[i + 1] < dist) i++;
  const a = g.pts[i];
  const b = g.pts[(i + 1) % g.pts.length];
  const seg = g.cum[i + 1] - g.cum[i] || 1;
  const tt = (dist - g.cum[i]) / seg;
  return { x: a[0] + (b[0] - a[0]) * tt, y: a[1] + (b[1] - a[1]) * tt, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

/** 從 from 走到 to（公尺）的折線 */
function subPath(g, from, to) {
  const end = to > from ? to : to + g.total;
  const out = [pointAt(g, from)];
  for (let k = 0; k < g.pts.length * 2; k++) {
    const i = k % g.pts.length;
    const d = g.cum[i] + (k >= g.pts.length ? g.total : 0);
    if (d > from && d < end) out.push({ x: g.pts[i][0], y: g.pts[i][1] });
  }
  out.push(pointAt(g, end));
  return out.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
}

function bounds(pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// ---------- 文字標籤擺放 ----------
// 標籤很容易壓到賽道或彼此重疊，所以每個標籤都試幾個候選位置（直線的兩側、不同遠近、
// 沿著直線的不同位置），選一個「離賽道最遠、不跟其他標籤重疊、不超出畫面」的位置。

/** 估計文字寬度：中文字約 1 個字高，英數約 0.6 個字高 */
function textWidth(text, size) {
  let w = 0;
  for (const ch of text) w += (ch.codePointAt(0) > 0x2000 ? 1.05 : 0.6) * size;
  return w;
}

function boxDistance(box, x, y) {
  const dx = Math.max(box.x1 - x, 0, x - box.x2);
  const dy = Math.max(box.y1 - y, 0, y - box.y2);
  return Math.hypot(dx, dy);
}

function overlaps(a, b, gap) {
  return a.x1 - gap < b.x2 && b.x1 - gap < a.x2 && a.y1 - gap < b.y2 && b.y1 - gap < a.y2;
}

/**
 * 從候選位置中選最好的一個
 * @param candidates [{ x, y }] 標籤中心
 * @param samples    賽道上的取樣點
 * @param placed     已經放好的標籤框
 * @param vb         [x, y, w, h] 畫面範圍
 */
function placeLabel(text, size, candidates, samples, placed, vb, u) {
  const w = textWidth(text, size) / 2 + u;
  const h = size * 0.65 + u * 0.5;
  let best = null;
  for (const c of candidates) {
    const box = { x1: c.x - w, x2: c.x + w, y1: c.y - h, y2: c.y + h };
    let clear = Infinity;
    for (const [x, y] of samples) clear = Math.min(clear, boxDistance(box, x, y));
    let score = Math.min(clear, u * 8); // 離賽道夠遠就好，不用更遠
    if (placed.some((b) => overlaps(box, b, u))) score -= 1000;
    // 稍微偏好靠近原本位置、也不要離畫面太遠（畫面之後會自動放大到包含所有標籤）
    score -= Math.hypot(c.x - candidates[0].x, c.y - candidates[0].y) * 0.04;
    const out = Math.max(vb[0] - box.x1, 0, box.x2 - vb[0] - vb[2], vb[1] - box.y1, 0, box.y2 - vb[1] - vb[3]);
    score -= out * 0.15;
    if (!best || score > best.score) best = { ...c, box, score };
  }
  placed.push(best.box);
  return best;
}

/** 某一點周圍的候選位置：先試賽道兩側，再試一圈圈往外的各個方向（radii 的單位是 u） */
function ringCandidates(p, u, radii) {
  const nx = Math.sin(p.angle);
  const ny = -Math.cos(p.angle);
  const r0 = radii[0] * u;
  // ax/ay：標籤說明的那個點（標籤離它太遠時會畫一條引線）
  const out = [{ x: p.x + nx * r0, y: p.y + ny * r0, ax: p.x, ay: p.y }, { x: p.x - nx * r0, y: p.y - ny * r0, ax: p.x, ay: p.y }];
  for (const rr of radii) {
    const r = rr * u; // 半徑以「賽道範圍的 1%」為單位
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      out.push({ x: p.x + Math.cos(a) * r * 1.6, y: p.y + Math.sin(a) * r, ax: p.x, ay: p.y }); // 橫向多推一點，因為文字是橫的
    }
  }
  return out;
}

const trackPath = (g) => `${g.pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('')}Z`;

/** 小縮圖（賽道列表卡片用）：只有外形與起點 */
export function trackThumb(map) {
  if (!map?.points?.length) return '';
  const g = prepare(map);
  const b = bounds(g.pts);
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const pad = span * 0.08;
  const s = pointAt(g, 0);
  return `<svg class="track-thumb" viewBox="${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + pad * 2} ${b.maxY - b.minY + pad * 2}" aria-hidden="true">
    <path class="tm-line" d="${trackPath(g)}" style="stroke-width:${span * 0.022}"/>
    <circle class="tm-start-dot" cx="${s.x}" cy="${s.y}" r="${span * 0.035}"/></svg>`;
}

/**
 * 完整平面圖：外形、起點/終點、行進方向箭頭、直線段（標上長度）、北方
 * @param {object} map         circuit-maps.json 裡的一筆
 * @param {number} lengthKm    官方賽道長度（有的話用來把直線長度換算得更準）
 */
export function trackMap(map, lengthKm) {
  if (!map?.points?.length) return '';
  const g = prepare(map);
  const b = bounds(g.pts);
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const u = span / 100; // 1 個單位 = 賽道範圍的 1%
  const pad = u * 12;
  const vb = [b.minX - pad, b.minY - pad, b.maxX - b.minX + pad * 2, b.maxY - b.minY + pad * 2];
  // 直線長度：用官方長度與外形長度的比例校正
  const k = lengthKm ? (lengthKm * 1000) / (map.pathLength || g.total) : 1;
  const km = (m) => (m * k / 1000).toFixed(1);

  // 擺標籤用的賽道取樣點與已放好的標籤框
  const samples = Array.from({ length: 300 }, (_, i) => {
    const p = pointAt(g, (g.total * i) / 300);
    return [p.x, p.y];
  });
  const placed = [];
  // 標籤離說明的點超過一段距離時，畫一條細引線連到標籤框的邊緣
  const leader = (lp) => {
    const cx = Math.max(lp.box.x1, Math.min(lp.ax, lp.box.x2));
    const cy = Math.max(lp.box.y1, Math.min(lp.ay, lp.box.y2));
    if (Math.hypot(cx - lp.ax, cy - lp.ay) < u * 6) return '';
    return `<line class="tm-leader" x1="${lp.ax.toFixed(1)}" y1="${lp.ay.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" style="stroke-width:${u * 0.5}"/>`;
  };
  const labelText = (x, y, size, cls, text) => `<text class="tm-label ${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}"
    text-anchor="middle" dominant-baseline="central" style="font-size:${size}px;stroke-width:${u * 1.4}px">${esc(text)}</text>`;

  // 起點/終點：垂直於賽道的黑白格線，加上旗子與文字（先放，讓它有最好的位置）
  const s0 = pointAt(g, 0);
  const px = -Math.sin(s0.angle);
  const py = Math.cos(s0.angle);
  const half = u * 4.5;
  const startText = `🏁 ${t('circuit.mapStart')}`;
  const sp = placeLabel(startText, u * 4.8, ringCandidates(s0, u, [8, 12, 16, 21, 27]), samples, placed, vb, u);
  const startLine = `<line class="tm-start-bg" x1="${s0.x - px * half}" y1="${s0.y - py * half}" x2="${s0.x + px * half}" y2="${s0.y + py * half}" style="stroke-width:${u * 2.4}"/>
    <line class="tm-start" x1="${s0.x - px * half}" y1="${s0.y - py * half}" x2="${s0.x + px * half}" y2="${s0.y + py * half}"
      style="stroke-width:${u * 2.4};stroke-dasharray:${u * 1.5} ${u * 1.5}"/>
    ${leader(sp)}${labelText(sp.x, sp.y, u * 4.8, 'tm-label-start', startText)}`;

  // 直線段：全部上色，最長的三段（400 公尺以上）標上長度
  const straights = (map.straights || []).map((s, i) => {
    const from = s.from * g.scale;
    const len = s.length * g.scale;
    const path = `<path class="tm-straight" d="${subPath(g, from, s.to * g.scale)}" style="stroke-width:${u * 2.6}"/>`;
    if (i >= 3 || s.length < 400) return { path, label: '' };
    const text = t('circuit.mapStraight', { km: km(s.length) });
    const cands = [0.5, 0.3, 0.7].flatMap((f) => ringCandidates(pointAt(g, from + len * f), u, [7, 11, 15, 20]));
    const lp = placeLabel(text, u * 4.4, cands, samples, placed, vb, u);
    return { path, label: leader(lp) + labelText(lp.x, lp.y, u * 4.4, 'tm-label-straight', text) };
  });

  // 行進方向箭頭：每 1/6 圈一個（起點附近不放，避免跟起點標記重疊）
  const arrows = [1, 2, 3, 4, 5].map((n) => {
    const p = pointAt(g, (g.total * n) / 6);
    const deg = (p.angle * 180) / Math.PI;
    return `<path class="tm-arrow" d="M${u * 2.6},0 L${-u * 1.6},${u * 2} L${-u * 0.6},0 L${-u * 1.6},${-u * 2}Z"
      transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)}) rotate(${deg.toFixed(1)})"/>`;
  }).join('');

  // 畫面範圍擴大到包含所有標籤，右上角再留位置給北方標記
  for (const bx of placed) {
    const x1 = Math.min(vb[0], bx.x1 - u * 2);
    const y1 = Math.min(vb[1], bx.y1 - u * 2);
    const x2 = Math.max(vb[0] + vb[2], bx.x2 + u * 2);
    const y2 = Math.max(vb[1] + vb[3], bx.y2 + u * 2);
    vb.splice(0, 4, x1, y1, x2 - x1, y2 - y1);
  }
  const north = `<g class="tm-north" transform="translate(${vb[0] + vb[2] - u * 6},${vb[1] + u * 7})">
    <path d="M0,${-u * 4} L${u * 2.2},${u * 2.5} L0,${u * 1.2} L${-u * 2.2},${u * 2.5}Z"/>
    <text y="${u * 7.5}" text-anchor="middle" style="font-size:${u * 4}px">N</text></g>`;

  return `<svg class="track-map" viewBox="${vb.map((v) => v.toFixed(1)).join(' ')}" role="img"
      aria-label="${esc(t('circuit.mapAria', { name: map.name }))}">
    <path class="tm-outline" d="${trackPath(g)}" style="stroke-width:${u * 4.2}"/>
    <path class="tm-line" d="${trackPath(g)}" style="stroke-width:${u * 1.6}"/>
    ${straights.map((s) => s.path).join('')}
    ${arrows}
    ${startLine}
    ${straights.map((s) => s.label).join('')}
    ${north}
  </svg>`;
}
