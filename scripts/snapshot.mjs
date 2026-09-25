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
import { configure, loadSeason } from '../js/api.js';

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
