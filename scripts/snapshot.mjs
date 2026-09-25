// ============================================================
// snapshot.mjs — 由 GitHub Actions 執行（Node.js），產生 data/snapshot.json
//
// 做法：直接重複使用網頁的 api.js 的 loadSeason()，
// 並透過 configure({ onResponse }) 把每一個 API 回應記錄下來。
// 網頁在 API 連不上時，就會改讀這份快照 → 網站永遠有資料可看。
//
// 本機執行：node scripts/snapshot.mjs [賽季]
// ============================================================
import { writeFile, mkdir } from 'node:fs/promises';
import { configure, get, loadSeason, loadDriverProfile, loadTeamProfile } from '../js/api.js';

const season = Number(process.argv[2]) || new Date().getFullYear();
const responses = {};
configure({ onResponse: (path, json) => { responses[path] = json; } });

const data = await loadSeason(season);

const done = data.races.filter((r) => r.completed);
const leader = data.driverStandings[0];
console.log(`賽季 ${season}：共 ${data.races.length} 站，已完賽 ${done.length} 站`);
console.log(`衝刺賽週末：${data.races.filter((r) => r.hasSprint).map((r) => `R${r.round}`).join(', ') || '無'}`);
if (leader) console.log(`積分領先：${leader.Driver.givenName} ${leader.Driver.familyName} ${leader.points} 分`);
console.log(`車隊：${data.constructorStandings.map((c) => c.Constructor.constructorId).join(', ')}`);
console.log(`車手：${data.driverStandings.map((s) => s.Driver.driverId).join(', ')}`);
console.log(`記錄了 ${Object.keys(responses).length} 個 API 回應`);

configure({ onResponse: null });
// 健康檢查：順便測試車手 / 車隊介紹頁用到的 API（結果不寫進快照）
if (leader) {
  try {
    // 先直接看車手歷年積分端點的原始回應
    const hs = await get(`/drivers/${leader.Driver.driverId}/driverstandings/?limit=100`);
    console.log(`歷年積分端點：total=${hs.MRData.total}、StandingsLists=${hs.MRData.StandingsTable?.StandingsLists?.length}`,
      JSON.stringify(hs.MRData).slice(0, 300));
    const dp = await loadDriverProfile(leader.Driver.driverId, season);
    console.log(`車手頁檢查 ${leader.Driver.driverId}：冠軍 ${dp.stats.titles}、分站冠軍 ${dp.stats.wins}、頒獎台 ${dp.stats.podiums}、竿位 ${dp.stats.poles}、出賽 ${dp.stats.starts}、歷年 ${dp.history.length} 季、本季 ${dp.seasonRaces.length} 站`);
    const teamId = data.constructorStandings[0].Constructor.constructorId;
    const tp = await loadTeamProfile(teamId, season);
    console.log(`車隊頁檢查 ${teamId}：車隊冠軍 ${tp.stats.titles}、分站冠軍 ${tp.stats.wins}、竿位 ${tp.stats.poles}、參賽 ${tp.stats.races}、車手 ${tp.drivers.map((d) => d.driverId).join('/')}、本季 ${tp.seasonRaces.length} 站`);
  } catch (err) {
    console.log('介紹頁 API 檢查失敗：', err.message);
  }
}

if (Object.keys(responses).length === 0) {
  console.error('沒有抓到任何資料，不寫入快照');
  process.exit(1);
}

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../data/snapshot.json', import.meta.url),
  JSON.stringify({ generatedAt: new Date().toISOString(), season, responses }),
);
console.log('已寫入 data/snapshot.json');
