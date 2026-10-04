// ============================================================
// history.mjs — 由 GitHub Actions 執行，把「過去賽季」的成績存檔
//
// 產生的檔案（會 commit 回 repo，跟網站一起部署）：
//   data/history/{年份}.json      該季所有 API 回應（賽程、積分、正賽、排位、衝刺賽）
//   data/history/standings.json   每季的完整年度積分榜（介紹頁查歷年成績用）
//   data/history/manifest.json    每季上次檢查的時間
//
// 過去的成績不會再變，存起來之後網頁讀一個檔案就好，不用每次重問 API。
//
// Jolpica 每小時大約只讓問 500 次，所以每次執行只用 HISTORY_BUDGET 次請求：
//   先補還沒存檔的賽季（從最近的年份開始），
//   都存好之後，每個月重新檢查一次（API 偶爾會修正舊資料）。
//
// 本機執行：node scripts/history.mjs
// ============================================================
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { configure, loadSeason } from '../js/api.js';

const DIR = new URL('../data/history/', import.meta.url);
const BUDGET = Number(process.env.HISTORY_BUDGET || 200);
const REFRESH_DAYS = 30;
const FIRST_SEASON = 1950;
const currentYear = new Date().getFullYear();

await mkdir(DIR, { recursive: true });

async function readJson(name) {
  try {
    return JSON.parse(await readFile(new URL(name, DIR), 'utf8'));
  } catch {
    return null;
  }
}

// 物件的 key 依字母排序後再存，內容沒變時檔案就一模一樣，git 不會產生多餘的變更
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const manifest = (await readJson('manifest.json')) || {};

// ---------- 決定這次要處理哪些賽季 ----------
const missing = [];
const stale = [];
for (let y = currentYear - 1; y >= FIRST_SEASON; y--) {
  const checked = manifest[y];
  if (!checked) missing.push(y);
  else if (Date.now() - new Date(checked).getTime() > REFRESH_DAYS * 86400000) stale.push(y);
}
stale.sort((a, b) => new Date(manifest[a]) - new Date(manifest[b])); // 最久沒檢查的先
const queue = [...missing, ...stale];
console.log(`尚未存檔 ${missing.length} 季、需要重新檢查 ${stale.length} 季；本次請求上限 ${BUDGET} 次`);

// ---------- 逐季抓取 ----------
let requests = 0;
let responses = {};
let errors = [];
configure({
  onResponse: (path, json) => { responses[path] = json; requests++; },
  onError: (path, err) => {
    requests++;
    // 4xx（例如 1958 年以前查車隊積分）代表「本來就沒有這項資料」，不算失敗；
    // 只有限速（429）、伺服器錯誤（5xx）、網路中斷這種「暫時性」錯誤才算資料不完整
    const m = /HTTP (\d{3})/.exec(err.message);
    if (!m || m[1] === '429' || m[1].startsWith('5')) errors.push(`${path}：${err.message}`);
  },
});

const saved = [];
for (const y of queue) {
  if (requests >= BUDGET) break;
  responses = {};
  errors = [];
  try {
    await loadSeason(y);
  } catch (err) {
    if (!errors.length) errors.push(err.message);
  }
  // 只要有任何一個請求失敗（例如被限速），這季就不存，避免存到不完整的資料
  if (errors.length || !responses[`/${y}/races/?limit=100`]) {
    console.log(`${y}：資料不完整，這次先跳過（${errors[0] || '缺少賽程'}）`);
    continue;
  }
  const name = `${y}.json`;
  const content = stableStringify({ season: y, responses });
  const old = await readFile(new URL(name, DIR), 'utf8').catch(() => null);
  if (old !== content) await writeFile(new URL(name, DIR), content);
  manifest[y] = new Date().toISOString();
  saved.push(y);
  console.log(`${y}：${old === null ? '新增存檔' : old === content ? '檢查完畢，沒有變化' : '資料有更新'}（${Object.keys(responses).length} 個回應）`);
}
console.log(`本次使用 ${requests} 次請求，處理了 ${saved.length} 季`);

await writeFile(new URL('manifest.json', DIR), stableStringify(manifest));

// ---------- 重建年度積分榜索引 ----------
// 只留介紹頁需要的欄位，讓檔案小一點
const index = { drivers: {}, constructors: {} };
for (const y of Object.keys(manifest).map(Number).sort()) {
  const file = await readJson(`${y}.json`);
  if (!file) continue;
  const d = file.responses[`/${y}/driverstandings/`]?.MRData.StandingsTable.StandingsLists[0]?.DriverStandings;
  const c = file.responses[`/${y}/constructorstandings/`]?.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings;
  if (d) {
    index.drivers[y] = d.map((r) => ({
      position: r.position, positionText: r.positionText, points: r.points, wins: r.wins,
      Driver: { driverId: r.Driver.driverId },
      Constructors: (r.Constructors || []).map((t) => ({ constructorId: t.constructorId, name: t.name })),
    }));
  }
  if (c?.length) {
    index.constructors[y] = c.map((r) => ({
      position: r.position, positionText: r.positionText, points: r.points, wins: r.wins,
      Constructor: { constructorId: r.Constructor.constructorId, name: r.Constructor.name },
    }));
  }
}
await writeFile(new URL('standings.json', DIR), stableStringify(index));
console.log(`積分榜索引：車手 ${Object.keys(index.drivers).length} 季、車隊 ${Object.keys(index.constructors).length} 季`);
