// ============================================================
// tyres.mjs — 由 GitHub Actions 執行，把比完的比賽的輪胎資料存檔
//
// 為什麼要存檔？OpenF1 在 F1 賽事進行中會暫停所有免費查詢（連過去的比賽也查不到），
// 所以趁它開放的時候先存起來，網頁就能隨時顯示輪胎策略，也不用每次重問。
//
// 產生的檔案（會 commit 回 repo）：data/tyres/{年份}.json
//   { season, races: { 回合: { sessionKey, stints: [...] } } }
//
// 比賽清單從已經存好的檔案拿，不用再問 Jolpica：
//   過去賽季 → data/history/{年份}.json；今年 → data/snapshot.json（上一個步驟剛產生）
//
// 本機執行：node scripts/tyres.mjs
// ============================================================
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { OPENF1_BASE, TYRE_DATA_FROM, matchSession } from '../js/api.js';

const DIR = new URL('../data/tyres/', import.meta.url);
const GAP_MS = Number(process.env.GAP_MS ?? 2100); // OpenF1 免費版大約每分鐘 30 次，慢慢問
const currentYear = new Date().getFullYear();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJson(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch {
    return null;
  }
}

class LiveSessionError extends Error {}

let lastRequest = 0;
async function openf1(path) {
  await sleep(Math.max(0, lastRequest + GAP_MS - Date.now()));
  lastRequest = Date.now();
  const res = await fetch(OPENF1_BASE + path);
  if (res.status === 401) throw new LiveSessionError('F1 賽事進行中，OpenF1 暫停免費查詢');
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`HTTP ${res.status}：${path}`);
  return res.json();
}

/** 這一季有哪些比賽、哪些已經比完（從存好的 Jolpica 回應裡找） */
async function racesOf(season) {
  const file = season === currentYear
    ? await readJson(new URL('../data/snapshot.json', import.meta.url))
    : await readJson(new URL(`../data/history/${season}.json`, import.meta.url));
  const races = file?.responses?.[`/${season}/races/?limit=100`]?.MRData.RaceTable.Races || [];
  // 正賽開始 4 小時後才算比完（給 OpenF1 一點時間整理資料）
  return races.filter((r) => Date.now() - new Date(`${r.date}T${r.time || '12:00:00Z'}`) > 4 * 3600 * 1000);
}

await mkdir(DIR, { recursive: true });
let saved = 0;
try {
  for (let season = TYRE_DATA_FROM; season <= currentYear; season++) {
    const fileUrl = new URL(`${season}.json`, DIR);
    const archive = (await readJson(fileUrl)) || { season, races: {} };
    const todo = (await racesOf(season)).filter((r) => !archive.races[r.round]);
    if (!todo.length) continue;

    const sessions = await openf1(`/sessions?year=${season}&session_name=Race`);
    for (const race of todo) {
      const session = matchSession(sessions, race);
      if (!session) {
        console.log(`${season} R${race.round}：OpenF1 找不到這場比賽`);
        continue;
      }
      const stints = await openf1(`/stints?session_key=${session.session_key}`);
      if (!stints.length) {
        console.log(`${season} R${race.round}：還沒有輪胎資料，下次再試`);
        continue;
      }
      // 只留畫圖需要的欄位，讓檔案小一點
      archive.races[race.round] = {
        sessionKey: session.session_key,
        stints: stints.map((s) => ({
          driver_number: s.driver_number, stint_number: s.stint_number, lap_start: s.lap_start,
          lap_end: s.lap_end, compound: s.compound, tyre_age_at_start: s.tyre_age_at_start,
        })),
      };
      // 每存一場就寫入一次：中途被擋（賽事開始）也不會遺失已經抓到的資料
      await writeFile(fileUrl, JSON.stringify(archive));
      saved++;
      console.log(`${season} R${race.round}：存了 ${stints.length} 段 stint`);
    }
  }
} catch (err) {
  if (err instanceof LiveSessionError) console.log(`${err.message}，這次先跳過，下次再存`);
  else throw err;
}
console.log(`本次新存了 ${saved} 場比賽的輪胎資料`);
