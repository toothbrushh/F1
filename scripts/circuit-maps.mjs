// ============================================================
// circuit-maps.mjs — 產生賽道平面圖資料 data/circuit-maps.json
//
// 來源：bacinger/f1-circuits（MIT 授權）的 GeoJSON 賽道外形
//   https://github.com/bacinger/f1-circuits
// 這份資料的每條賽道是一條線：第一個點在起點/終點直線上，點的順序就是比賽方向。
//
// 這支程式做的事：
//   1. 把經緯度換算成以公尺為單位的平面座標（北方朝上）
//   2. 每 10 公尺重新取樣，找出「直線段」（方向幾乎不變、長度 250 公尺以上的路段）
//   3. 輸出精簡的 JSON 給網頁畫圖
//
// 執行：node scripts/circuit-maps.mjs   （賽道外形很少變，有新賽道時再跑一次即可）
// ============================================================
import { writeFile } from 'node:fs/promises';

const SOURCE = 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson';

// Jolpica 的 circuitId → bacinger 的 id
const IDS = {
  albert_park: 'au-1953', shanghai: 'cn-2004', suzuka: 'jp-1962', bahrain: 'bh-2002', jeddah: 'sa-2021',
  miami: 'us-2022', imola: 'it-1953', monaco: 'mc-1929', catalunya: 'es-1991', villeneuve: 'ca-1978',
  red_bull_ring: 'at-1969', silverstone: 'gb-1948', spa: 'be-1925', hungaroring: 'hu-1986', zandvoort: 'nl-1948',
  monza: 'it-1922', baku: 'az-2016', marina_bay: 'sg-2008', americas: 'us-2012', rodriguez: 'mx-1962',
  interlagos: 'br-1940', vegas: 'us-2023', losail: 'qa-2004', yas_marina: 'ae-2009', madring: 'es-2026',
  // 近年不在賽程上、但 API 查得到的賽道（外形是現在的版本，早年的賽道配置可能不同）
  nurburgring: 'de-1927', hockenheimring: 'de-1932', ricard: 'fr-1969', istanbul: 'tr-2005', portimao: 'pt-2008',
  mugello: 'it-1914', sepang: 'my-1999', sochi: 'ru-2014', magny_cours: 'fr-1960', estoril: 'pt-1972',
  jacarepagua: 'br-1977', indianapolis: 'us-1909', galvez: 'ar-1952', kyalami: 'za-1961', watkins_glen: 'us-1956',
};

const R = 6371000; // 地球半徑（公尺）
const STEP = 10; // 重新取樣間距（公尺）
const WINDOW = 40; // 判斷方向變化時，往前後各看幾公尺
const MAX_TURN = 4; // 前後 WINDOW 公尺內方向變化小於幾度，就算「直」
const MIN_STRAIGHT = 250; // 直線段最短長度（公尺）

/** 經緯度 → 平面公尺座標（以賽道中心為原點，x 往東、y 往北） */
function project(coords) {
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const lon0 = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const k = Math.PI / 180;
  return coords.map(([lon, lat]) => [(lon - lon0) * k * R * Math.cos(lat0 * k), (lat - lat0) * k * R]);
}

/** 沿著賽道每 STEP 公尺取一個點（封閉迴圈） */
function resample(pts) {
  const loop = [...pts, pts[0]];
  const out = [];
  let carry = 0;
  for (let i = 0; i < loop.length - 1; i++) {
    const [x1, y1] = loop[i];
    const [x2, y2] = loop[i + 1];
    const seg = Math.hypot(x2 - x1, y2 - y1);
    let d = carry;
    while (d < seg) {
      const t = d / seg;
      out.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
      d += STEP;
    }
    carry = d - seg;
  }
  return out;
}

const heading = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
function angleDiff(a, b) {
  let d = (b - a) * 180 / Math.PI;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return Math.abs(d);
}

/** 找出直線段：回傳 [{ from, to, length }]，from/to 是從起點起算的距離（公尺） */
function findStraights(samples) {
  const n = samples.length;
  const w = Math.round(WINDOW / STEP);
  const at = (i) => samples[((i % n) + n) % n];
  const straight = samples.map((_, i) => angleDiff(heading(at(i - w), at(i)), heading(at(i), at(i + w))) < MAX_TURN);

  // 找一個「不直」的點當作起始，避免直線段被起點切成兩半
  const start = straight.indexOf(false);
  if (start < 0) return [];
  const runs = [];
  let runStart = null;
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (straight[i] && runStart === null) runStart = start + k;
    if ((!straight[i] || k === n) && runStart !== null) {
      const len = (start + k - runStart) * STEP;
      if (len >= MIN_STRAIGHT) {
        runs.push({ from: (runStart % n) * STEP, to: ((start + k) % n) * STEP, length: len });
      }
      runStart = null;
    }
  }
  return runs.sort((a, b) => b.length - a.length);
}

const round = (v) => Math.round(v);

const geo = await (await fetch(SOURCE)).json();
const byId = new Map(geo.features.map((f) => [f.properties.id, f]));
const maps = {};
for (const [circuitId, srcId] of Object.entries(IDS)) {
  const f = byId.get(srcId);
  if (!f) {
    console.warn('找不到', circuitId, srcId);
    continue;
  }
  let coords = f.geometry.coordinates;
  const [a, b] = [coords[0], coords[coords.length - 1]];
  if (a[0] === b[0] && a[1] === b[1]) coords = coords.slice(0, -1); // 封閉線的最後一點跟第一點重複
  const pts = project(coords);
  const samples = resample(pts);
  maps[circuitId] = {
    source: srcId,
    name: f.properties.Name,
    // 外形資料本身的長度（公尺），用來把「距離」換算到圖上的位置
    pathLength: samples.length * STEP,
    points: pts.map(([x, y]) => [round(x), round(y)]),
    straights: findStraights(samples),
  };
  console.log(circuitId.padEnd(15), String(samples.length * STEP).padStart(5), 'm', maps[circuitId].straights.map((s) => s.length).join(', '));
}

await writeFile(
  new URL('../data/circuit-maps.json', import.meta.url),
  `${JSON.stringify({
    _說明: '賽道平面圖資料，由 scripts/circuit-maps.mjs 產生，請不要手動修改。外形來源：bacinger/f1-circuits（MIT License, Copyright (c) 2019-2025 Tomislav Bacinger）。座標單位為公尺，x 往東、y 往北；第一個點在起點/終點直線上，點的順序就是比賽方向。straights 是依外形自動計算的直線段。',
    source: 'https://github.com/bacinger/f1-circuits',
    maps,
  })}\n`,
);
console.log('已寫入 data/circuit-maps.json');
