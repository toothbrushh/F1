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

// ---------- 歷屆冠軍名單 → data/champions.json ----------
// Jolpica 不能一次查「某位車手的所有年度積分」，所以由這裡一年一年查好冠軍，
// 網頁的介紹頁直接讀這份名單來計算「世界冠軍」次數。
const champions = { generatedAt: new Date().toISOString(), drivers: {}, constructors: {} };
const years = [];
for (let y = 1950; y < season; y++) years.push(y);
const failed = [];
async function fetchChampion(y) {
  try {
    const d = await get(`/${y}/driverstandings/?limit=1`);
    const id = d.MRData.StandingsTable.StandingsLists[0]?.DriverStandings[0]?.Driver.driverId;
    if (id) champions.drivers[y] = id;
    if (y >= 1958) {
      const c = await get(`/${y}/constructorstandings/?limit=1`);
      const cid = c.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings[0]?.Constructor.constructorId;
      if (cid) champions.constructors[y] = cid;
    }
  } catch (err) {
    failed.push(y);
    console.log(`${y} 年冠軍查詢失敗：${err.message}`);
  }
}
await Promise.all(years.map(fetchChampion));
// 被限速而失敗的年份：休息一下，再一年一年慢慢重試
const retry = failed.splice(0);
for (const y of retry) {
  await new Promise((r) => setTimeout(r, 3000));
  await fetchChampion(y);
}
if (failed.length) console.log(`仍然失敗的年份：${failed.join(', ')}`);
const nDrivers = Object.keys(champions.drivers).length;
console.log(`冠軍名單：車手 ${nDrivers} 年、車隊 ${Object.keys(champions.constructors).length} 年；` +
  `最近：${champions.drivers[season - 1]} / ${champions.constructors[season - 1]}`);
if (nDrivers > 0) {
  await writeFile(new URL('../data/champions.json', import.meta.url), JSON.stringify(champions));
  console.log('已寫入 data/champions.json');
}

// 健康檢查：順便測試車手 / 車隊介紹頁用到的 API（結果不寫進快照）
if (leader) {
  try {
    const dp = await loadDriverProfile(leader.Driver.driverId, season);
    console.log(`車手頁檢查 ${leader.Driver.driverId}：冠軍 ${dp.stats.titles}、分站冠軍 ${dp.stats.wins}、頒獎台 ${dp.stats.podiums}、竿位 ${dp.stats.poles}、出賽 ${dp.stats.starts}、參賽 ${dp.stats.seasons} 季、歷年表 ${dp.history.length} 列、本季 ${dp.seasonRaces.length} 站`);
    const vet = await loadDriverProfile('hamilton', season);
    console.log(`車手頁檢查 hamilton：冠軍 ${vet.stats.titles}（champions.json 在 Node 讀不到，所以只算最近 20 季）、分站冠軍 ${vet.stats.wins}、參賽 ${vet.stats.seasons} 季、歷年表 ${vet.history.length} 列`);
    const teamId = data.constructorStandings[0].Constructor.constructorId;
    const tp = await loadTeamProfile(teamId, season);
    console.log(`車隊頁檢查 ${teamId}：車隊冠軍 ${tp.stats.titles}、分站冠軍 ${tp.stats.wins}、竿位 ${tp.stats.poles}、參賽 ${tp.stats.races} 站、${tp.stats.seasons} 季、歷年表 ${tp.history.length} 列、車手 ${tp.drivers.map((d) => d.driverId).join('/')}、本季 ${tp.seasonRaces.length} 站`);
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
