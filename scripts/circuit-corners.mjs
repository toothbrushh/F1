// ============================================================
// circuit-corners.mjs — 在賽道平面圖上加入「官方彎道編號」與「計時區段分界」
//
// 先跑 circuit-maps.mjs 產生外形，再跑這支：node scripts/circuit-corners.mjs
//
// 資料來源：
//   - Jolpica：每一站的日期與 circuitId
//   - OpenF1：比賽的 session_key / circuit_key、最快圈的區段時間、車子在那一圈的位置
//   - MultiViewer（非官方，FastF1 也使用）：賽道外形與彎道編號（F1 計時系統的座標）
//
// 做法：
//   1. MultiViewer 的座標系統跟我們的外形（經緯度換算的公尺）不同，
//      所以先把兩條外形都依長度均分成 N 個點，用「相似變換」（縮放＋旋轉＋平移，必要時鏡像）
//      找出最吻合的對齊方式，並記下對齊誤差（公尺）讓我們確認結果可信。
//   2. 用同一個變換把彎道位置換算到我們的外形上，貼到最近的賽道點，存成「離起點幾公尺」。
//   3. 找比賽中的最快圈：圈開始的位置就是計時線；開始後 S1、S1+S2 秒時車子的位置就是區段分界。
// ============================================================
import { readFile, writeFile } from 'node:fs/promises';

const FILE = new URL('../data/circuit-maps.json', import.meta.url);
const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
const OPENF1 = 'https://api.openf1.org/v1';
const MULTIVIEWER = 'https://api.multiviewer.app/api/v1';
const N = 256; // 對齊時每條外形取的點數
const STEP = 10; // 跟 circuit-maps.mjs 的重新取樣間距相同
const MAX_RMS = 40; // 對齊誤差超過幾公尺就不採用

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    // 有些 API 會擋掉 Node 預設的 User-Agent（"node"），所以帶一個一般的名稱
    const res = await fetch(url, { headers: { 'User-Agent': 'f1-season-site (data script)' } });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (i === tries) throw new Error(`HTTP ${res.status} ${url}`);
    await sleep(2000 * i); // 被限速或暫時失敗：等一下再試
  }
}
const openf1 = async (path) => {
  await sleep(700); // OpenF1 免費版有速率限制
  return getJson(OPENF1 + path);
};

// ---------- 幾何 ----------
/** 依長度均分取 n 個點（封閉迴圈），回傳 { pts, cum, total } */
function resampleN(points, n) {
  const loop = [...points, points[0]];
  const cum = [0];
  for (let i = 1; i < loop.length; i++) cum.push(cum[i - 1] + Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]));
  const total = cum[cum.length - 1];
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = (total * k) / n;
    while (cum[j + 1] < d) j++;
    const t = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([loop[j][0] + (loop[j + 1][0] - loop[j][0]) * t, loop[j][1] + (loop[j + 1][1] - loop[j][1]) * t]);
  }
  return out;
}

/**
 * 找 A → B 最吻合的相似變換。2D 的相似變換可以用複數表示：b ≈ c·a + t（c = 縮放 × 旋轉）。
 * 嘗試所有起點偏移、正反方向、是否鏡像，取誤差最小的。
 */
function align(A, B) {
  const mean = (P) => [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length];
  const mb = mean(B);
  const Bc = B.map(([x, y]) => [x - mb[0], y - mb[1]]);
  let best = null;
  for (const mirror of [false, true]) {
    for (const reverse of [false, true]) {
      let P = A.map(([x, y]) => [x, mirror ? -y : y]);
      if (reverse) P = [P[0], ...P.slice(1).reverse()];
      const ma = mean(P);
      const Ac = P.map(([x, y]) => [x - ma[0], y - ma[1]]);
      const norm = Ac.reduce((s, [x, y]) => s + x * x + y * y, 0);
      for (let s = 0; s < B.length; s++) {
        // c = Σ conj(a)·b / Σ|a|²
        let re = 0;
        let im = 0;
        for (let i = 0; i < Ac.length; i++) {
          const [ax, ay] = Ac[i];
          const [bx, by] = Bc[(i + s) % Bc.length];
          re += ax * bx + ay * by;
          im += ax * by - ay * bx;
        }
        re /= norm;
        im /= norm;
        let err = 0;
        for (let i = 0; i < Ac.length; i++) {
          const [ax, ay] = Ac[i];
          const [bx, by] = Bc[(i + s) % Bc.length];
          err += (re * ax - im * ay - bx) ** 2 + (re * ay + im * ax - by) ** 2;
        }
        const rms = Math.sqrt(err / Ac.length);
        if (!best || rms < best.rms) best = { rms, re, im, ma, mirror, reverse, shift: s };
      }
    }
  }
  const { re, im, ma, mirror } = best;
  best.apply = ([x, y]) => {
    const ax = x - ma[0];
    const ay = (mirror ? -y : y) - ma[1];
    return [re * ax - im * ay + mb[0], re * ay + im * ax + mb[1]];
  };
  return best;
}

/** 我們外形上每 STEP 公尺的點（與 circuit-maps.mjs 相同的方式） */
function samplesOf(points) {
  const loop = [...points, points[0]];
  const out = [];
  let carry = 0;
  for (let i = 0; i < loop.length - 1; i++) {
    const [x1, y1] = loop[i];
    const [x2, y2] = loop[i + 1];
    const seg = Math.hypot(x2 - x1, y2 - y1);
    let d = carry;
    while (d < seg) {
      out.push([x1 + ((x2 - x1) * d) / seg, y1 + ((y2 - y1) * d) / seg]);
      d += STEP;
    }
    carry = d - seg;
  }
  return out;
}

/** 貼到最近的賽道點：回傳 { d: 離起點幾公尺, off: 偏離幾公尺 } */
function snap(samples, [x, y]) {
  let best = 0;
  let bestD = Infinity;
  samples.forEach(([sx, sy], i) => {
    const dd = Math.hypot(sx - x, sy - y);
    if (dd < bestD) {
      bestD = dd;
      best = i;
    }
  });
  return { d: best * STEP, off: bestD };
}

/** 在一串有時間的位置資料中，內插出某個時間點的位置 */
function positionAt(locs, time) {
  for (let i = 1; i < locs.length; i++) {
    const t0 = Date.parse(locs[i - 1].date);
    const t1 = Date.parse(locs[i].date);
    if (t0 <= time && time <= t1) {
      const f = (time - t0) / (t1 - t0 || 1);
      return [locs[i - 1].x + (locs[i].x - locs[i - 1].x) * f, locs[i - 1].y + (locs[i].y - locs[i - 1].y) * f];
    }
  }
  return null;
}

/** 環狀距離的中位數：先以第一個值為基準展開，再取中位數 */
function circularMedian(values, L) {
  const base = values[0];
  const rel = values.map((v) => ((v - base + L * 1.5) % L) - L / 2).sort((a, b) => a - b);
  const mid = rel[Math.floor(rel.length / 2)];
  const spread = Math.max(...rel.map((r) => Math.abs(r - mid)));
  return { value: Math.round((((base + mid) % L) + L) % L / STEP) * STEP, spread: Math.round(spread) };
}

/** OpenF1：比賽最快圈的車子位置（當作賽道外形） */
async function lapTrace(session) {
  const laps = (await openf1(`/laps?session_key=${session.session_key}`)) || [];
  const lap = laps.filter((l) => l.lap_duration && l.date_start && !l.is_pit_out_lap).sort((a, b) => a.lap_duration - b.lap_duration)[0];
  if (!lap) return null;
  const start = Date.parse(lap.date_start);
  const from = new Date(start).toISOString();
  const to = new Date(start + lap.lap_duration * 1000).toISOString();
  const locs = ((await openf1(`/location?session_key=${session.session_key}&driver_number=${lap.driver_number}&date%3E=${from}&date%3C=${to}`)) || [])
    .filter((l) => l.x || l.y);
  // 同一個位置重複的點拿掉
  return locs.map((l) => [l.x, l.y]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
}

/** 用幾位車手的最快圈找出計時線與兩個區段分界（回傳離起點幾公尺） */
async function timingLines(session, place, L) {
  const laps = (await openf1(`/laps?session_key=${session.session_key}`)) || [];
  const valid = laps
    .filter((l) => l.lap_duration && l.duration_sector_1 && l.duration_sector_2 && l.duration_sector_3 && !l.is_pit_out_lap && l.date_start)
    .sort((a, b) => a.lap_duration - b.lap_duration);
  const picks = [];
  for (const l of valid) {
    if (!picks.some((p) => p.driver_number === l.driver_number)) picks.push(l);
    if (picks.length === 5) break;
  }
  const f = [];
  const s1 = [];
  const s2 = [];
  for (const lap of picks) {
    const start = Date.parse(lap.date_start);
    const from = new Date(start - 3000).toISOString();
    const to = new Date(start + lap.lap_duration * 1000 + 3000).toISOString();
    const locs = ((await openf1(`/location?session_key=${session.session_key}&driver_number=${lap.driver_number}&date%3E=${from}&date%3C=${to}`)) || [])
      .filter((l) => l.x || l.y);
    const p0 = positionAt(locs, start);
    const p1 = positionAt(locs, start + lap.duration_sector_1 * 1000);
    const p2 = positionAt(locs, start + (lap.duration_sector_1 + lap.duration_sector_2) * 1000);
    if (p0 && p1 && p2) {
      f.push(place(p0));
      s1.push(place(p1));
      s2.push(place(p2));
    }
  }
  if (f.length < 3) return null;
  const mf = circularMedian(f, L);
  const m1 = circularMedian(s1, L);
  const m2 = circularMedian(s2, L);
  return { finish: mf.value, s1: m1.value, s2: m2.value, spread: Math.max(mf.spread, m1.spread, m2.spread) };
}

// ---------- 主程式 ----------
const data = JSON.parse(await readFile(FILE, 'utf8'));
const today = new Date().toISOString().slice(0, 10);

// 每條賽道列出已經比完的正賽（新的在前），計時資料找不到時往前一年找
const latest = new Map();
for (const year of [2024, 2025, new Date().getFullYear()]) {
  const sessions = (await openf1(`/sessions?year=${year}&session_type=Race`)) || [];
  const races = (await getJson(`${JOLPICA}/${year}/races/?limit=100`)).MRData.RaceTable.Races;
  for (const r of races) {
    const s = sessions.find((x) => x.session_name === 'Race' && x.date_start.slice(0, 10) === r.date);
    if (s && r.date < today) {
      if (!latest.has(r.Circuit.circuitId)) latest.set(r.Circuit.circuitId, []);
      latest.get(r.Circuit.circuitId).unshift({ year, session: s });
    }
  }
}

const report = [];
for (const [id, map] of Object.entries(data.maps)) {
  const hits = latest.get(id);
  if (!hits) continue;
  const { year, session } = hits[0];
  try {
    const mv = await getJson(`${MULTIVIEWER}/circuits/${session.circuit_key}/${year}`);
    // MultiViewer 沒有這條賽道（例如新賽道）時，改用 OpenF1 一圈的車子位置當作外形來對齊：
    // 這樣仍然可以算出計時線與區段分界，只是沒有彎道編號
    let outline = mv?.x?.length ? mv.x.map((x, i) => [x, mv.y[i]]) : await lapTrace(session);
    if (!outline?.length) throw new Error('MultiViewer 與 OpenF1 都沒有外形資料');
    const ours = map.points;
    const fit = align(resampleN(outline, N), resampleN(ours, N));
    outline = null;
    if (fit.rms > MAX_RMS) throw new Error(`對齊誤差太大：${fit.rms.toFixed(1)} 公尺`);
    const samples = samplesOf(ours);
    const offs = [];
    const place = (p) => {
      const s = snap(samples, fit.apply(p));
      offs.push(s.off);
      return s.d;
    };

    const corners = (mv?.corners || []).map((c) => ({
      n: `${c.number}${c.letter || ''}`,
      d: place([c.trackPosition.x, c.trackPosition.y]),
    }));

    // 計時線與區段分界：OpenF1 每圈的開始時間有時會差一點，所以取 5 位不同車手的最快圈，
    // 各算一次位置再取中位數；這一年沒有資料就往前一年找（賽道外形與彎道仍用最新的一年）
    const L = samples.length * STEP;
    let timing = null;
    for (const hit of hits) {
      timing = await timingLines(hit.session, place, L);
      if (timing) {
        timing.year = hit.year;
        break;
      }
    }

    map.corners = corners;
    map.sectors = timing ? [timing.s1, timing.s2] : null;
    map.finish = timing ? timing.finish : null;
    map.timing = {
      year, circuitKey: session.circuit_key, fitRms: Math.round(fit.rms), maxOffset: Math.round(Math.max(0, ...offs)),
      timingYear: timing?.year ?? null, spread: timing?.spread ?? null,
    };
    report.push(`${id.padEnd(15)} ${year} ${mv?.x?.length ? 'MV' : 'OF'} 對齊誤差 ${fit.rms.toFixed(1).padStart(5)} m · 最大偏離 ${Math.max(0, ...offs).toFixed(0).padStart(3)} m · ${corners.length} 彎 · `
      + (timing ? `計時線 ${timing.finish} · 區段 ${timing.s1}/${timing.s2}（${timing.year}，各圈差距 ±${timing.spread} m）` : '沒有計時資料'));
  } catch (err) {
    report.push(`${id.padEnd(15)} 失敗：${err.message}`);
  }
}
console.log(report.join('\n'));

data._說明 += ' corners（官方彎道編號）與 sectors（計時區段分界）、finish（計時線）來自 MultiViewer 與 OpenF1，以「離外形起點幾公尺」表示。';
await writeFile(FILE, `${JSON.stringify(data)}\n`);
console.log('已更新 data/circuit-maps.json');
