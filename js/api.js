// ============================================================
// api.js — 資料層：負責「去哪裡拿資料、怎麼快取、失敗怎麼辦」
//
// 資料來源：Jolpica F1 API（舊 Ergast API 的接班人，免費、免金鑰）
//   https://github.com/jolpica/jolpica-f1
//
// 三層備援：
//   1. localStorage 快取（還沒過期就直接用，不打 API）
//   2. 即時呼叫 API
//   3. API 失敗時，改讀 data/snapshot.json
//      （這份快照由 GitHub Actions 每幾小時自動抓一次，跟網站一起部署）
//
// 畫面層（main.js / profile.js）只呼叫 loadSeason()、loadDriverProfile()…，
// 不需要知道資料是從哪一層來的。這就是「分層」的好處。
// ============================================================

export const API_BASE = 'https://api.jolpi.ca/ergast/f1';
const CACHE_PREFIX = 'f1cache:v1:';
const PAGE_SIZE = 100; // Jolpica 一次最多回傳 100 筆

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// ---------- 可被外部設定的部分（給 Node 的快照腳本用） ----------
const config = {
  fetchImpl: (...args) => fetch(...args),
  onResponse: null, // (path, json) => void，快照腳本用來記錄每個回應
  snapshotUrl: 'data/snapshot.json',
};
export function configure(options) {
  Object.assign(config, options);
}

// ============================================================
// 1. 請求佇列：限制同時發出的請求數
// Jolpica 有速率限制（每秒約 4 次、每小時約 500 次），一口氣發 20 個請求會被擋（HTTP 429）。
// 所以我們排隊：同時最多 2 個，且每個請求之間至少間隔 350ms。
// ============================================================
const MAX_CONCURRENT = 2;
const MIN_GAP_MS = 350;
let active = 0;
let lastStart = 0;
const waiting = [];

function runQueue() {
  if (active >= MAX_CONCURRENT || waiting.length === 0) return;
  const wait = Math.max(0, lastStart + MIN_GAP_MS - Date.now());
  if (wait > 0) {
    setTimeout(runQueue, wait);
    return;
  }
  const job = waiting.shift();
  active++;
  lastStart = Date.now();
  job().finally(() => {
    active--;
    runQueue();
  });
  runQueue();
}

function enqueue(task) {
  return new Promise((resolve, reject) => {
    waiting.push(() => task().then(resolve, reject));
    runQueue();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(path, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await config.fetchImpl(API_BASE + path, { signal: controller.signal });
    if (res.status === 429 && attempt < 5) {
      // 被限速了：照伺服器說的秒數（Retry-After）等，沒說就越等越久
      const retryAfter = Number(res.headers.get('Retry-After'));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 2000 * attempt);
      return fetchJson(path, attempt + 1);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}：${path}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// 2. localStorage 快取
// 注意：無痕模式或 Node 環境可能沒有 localStorage，所以全部包 try/catch。
// ============================================================
function cacheRead(path) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + path);
    return raw ? JSON.parse(raw) : null; // { t: 存入時間, data }
  } catch {
    return null;
  }
}

function cacheWrite(path, data) {
  const value = JSON.stringify({ t: Date.now(), data });
  try {
    localStorage.setItem(CACHE_PREFIX + path, value);
  } catch {
    // 空間滿了：清掉所有舊快取再試一次
    clearCache();
    try { localStorage.setItem(CACHE_PREFIX + path, value); } catch { /* 放棄快取 */ }
  }
}

/** 清除快取；給 prefix 就只清符合的（例如某個賽季） */
export function clearCache(pathPrefix = '') {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX + pathPrefix)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* 沒有 localStorage */ }
}

// ============================================================
// 3. 快照備援
// ============================================================
let snapshotPromise = null;
function loadSnapshot() {
  if (!snapshotPromise) {
    snapshotPromise = fetch(config.snapshotUrl, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return snapshotPromise;
}

// 記錄這一輪載入資料時，實際用到了哪些來源（顯示在頁首讓使用者知道）
const sourceLog = { live: 0, cache: 0, snapshot: 0, snapshotTime: null, oldest: null };
function resetSourceLog() {
  Object.assign(sourceLog, { live: 0, cache: 0, snapshot: 0, snapshotTime: null, oldest: null });
}
function noteTime(t) {
  if (!sourceLog.oldest || t < sourceLog.oldest) sourceLog.oldest = t;
}

/**
 * 取得一個 API 路徑的 JSON（核心函式）
 * @param {string} path  例如 "/2026/driverstandings/"
 * @param {number} ttl   快取有效時間（毫秒）
 */
export async function get(path, ttl = 10 * MIN) {
  const cached = cacheRead(path);
  if (cached && Date.now() - cached.t < ttl) {
    sourceLog.cache++;
    noteTime(cached.t);
    return cached.data;
  }
  try {
    const data = await enqueue(() => fetchJson(path));
    cacheWrite(path, data);
    config.onResponse?.(path, data);
    sourceLog.live++;
    noteTime(Date.now());
    return data;
  } catch (err) {
    // API 失敗：先用過期的快取，再不行就用快照
    if (cached) {
      sourceLog.cache++;
      noteTime(cached.t);
      return cached.data;
    }
    const snap = await loadSnapshot();
    if (snap?.responses?.[path]) {
      sourceLog.snapshot++;
      sourceLog.snapshotTime = snap.generatedAt;
      noteTime(new Date(snap.generatedAt).getTime());
      return snap.responses[path];
    }
    throw err;
  }
}

/**
 * 分頁抓取：API 一次最多 100 筆，一整季的正賽成績約 480 筆，
 * 所以先抓第一頁看總數（MRData.total），再把剩下的頁數一起抓。
 */
async function getAllPages(basePath, ttl) {
  const first = await get(`${basePath}?limit=${PAGE_SIZE}&offset=0`, ttl);
  const total = Number(first.MRData.total);
  const rest = [];
  for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) {
    rest.push(get(`${basePath}?limit=${PAGE_SIZE}&offset=${offset}`, ttl));
  }
  return [first, ...(await Promise.all(rest))];
}

/** 把多頁的 Races 合併：同一站可能被切在兩頁，要依 round 接起來 */
function mergeRacePages(pages, key) {
  const byRound = new Map();
  for (const page of pages) {
    for (const race of page.MRData.RaceTable.Races) {
      const round = Number(race.round);
      if (!byRound.has(round)) byRound.set(round, []);
      byRound.get(round).push(...(race[key] || []));
    }
  }
  return byRound;
}

const ttlForSeason = (season) => (Number(season) >= new Date().getFullYear() ? 10 * MIN : 7 * DAY);

// 賽程裡各個賽段的欄位名稱（依時間順序）
const SESSION_KEYS = ['FirstPractice', 'SecondPractice', 'ThirdPractice', 'SprintShootout', 'SprintQualifying', 'Sprint', 'Qualifying'];

// ============================================================
// 4. 對外的高階函式：一次載入整個賽季
// ============================================================
export async function loadSeason(season) {
  resetSourceLog();
  const ttl = ttlForSeason(season);

  // Promise.all：這幾個請求彼此獨立，可以同時進行（實際上會經過佇列排隊）
  const [schedule, driverSt, constructorSt, resultPages, qualiPages, sprintPages] = await Promise.all([
    get(`/${season}/races/?limit=${PAGE_SIZE}`, ttl),
    get(`/${season}/driverstandings/`, ttl),
    get(`/${season}/constructorstandings/`, ttl).catch(() => null), // 1958 年以前沒有車隊積分
    getAllPages(`/${season}/results/`, ttl),
    getAllPages(`/${season}/qualifying/`, ttl).catch(() => []),
    getAllPages(`/${season}/sprint/`, ttl).catch(() => []),
  ]);

  const results = mergeRacePages(resultPages, 'Results');
  const qualifying = mergeRacePages(qualiPages, 'QualifyingResults');
  const sprint = mergeRacePages(sprintPages, 'SprintResults');

  // 把「賽程」和「成績」組合成畫面好用的形狀
  const races = schedule.MRData.RaceTable.Races.map((r) => {
    const round = Number(r.round);
    const sessions = SESSION_KEYS.filter((k) => r[k]).map((k) => ({
      key: k,
      date: r[k].date,
      time: r[k].time,
    }));
    sessions.push({ key: 'Race', date: r.date, time: r.time });
    const raceResults = results.get(round) || [];
    return {
      round,
      name: r.raceName,
      date: r.date,
      time: r.time,
      circuit: r.Circuit,
      sessions,
      hasSprint: Boolean(r.Sprint) || sprint.has(round),
      results: raceResults,
      qualifying: qualifying.get(round) || [],
      sprint: sprint.get(round) || [],
      completed: raceResults.length > 0,
    };
  });

  const dList = driverSt.MRData.StandingsTable.StandingsLists[0];
  const cList = constructorSt?.MRData.StandingsTable.StandingsLists[0];

  return {
    season: Number(season),
    races,
    driverStandings: dList?.DriverStandings || [],
    constructorStandings: cList?.ConstructorStandings || [],
    standingsRound: Number(dList?.round || 0),
    meta: { ...sourceLog },
  };
}

// ============================================================
// 5. 車手 / 車隊介紹頁用的資料
// 用 Promise.allSettled：就算其中一項失敗，其他資料還是能顯示。
//
// 注意：Jolpica 不允許「不指定賽季」查積分榜（會回 HTTP 400），
// 所以歷年成績要先查出參加過哪些賽季，再一季一季查。
// 為了不要一次發太多請求，只抓最近 HISTORY_LIMIT 季。
// ============================================================
const HISTORY_LIMIT = 20;
const total = (json) => Number(json?.MRData?.total || 0);
const settledValue = (r) => (r.status === 'fulfilled' ? r.value : null);

/** 歷屆冠軍名單（由 GitHub Actions 產生的 data/champions.json） */
let championsPromise = null;
export function loadChampions() {
  if (!championsPromise) {
    championsPromise = fetch('data/champions.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return championsPromise;
}

/** 先查參加過的賽季，再逐季查年度積分（只取最近 HISTORY_LIMIT 季） */
async function loadHistory(kind, id) {
  const p = `/${kind}/${encodeURIComponent(id)}`;
  const seasonsJson = await get(`${p}/seasons/?limit=${PAGE_SIZE}`, DAY);
  const seasons = seasonsJson.MRData.SeasonTable.Seasons.map((s) => Number(s.season));
  const recent = seasons.slice(-HISTORY_LIMIT);
  const table = kind === 'drivers' ? 'driverstandings' : 'constructorstandings';
  const listKey = kind === 'drivers' ? 'DriverStandings' : 'ConstructorStandings';
  const rows = await Promise.all(recent.map(async (y) => {
    try {
      const json = await get(`/${y}${p}/${table}/`, ttlForSeason(y));
      const row = json.MRData.StandingsTable.StandingsLists[0]?.[listKey]?.[0];
      return row ? { season: y, ...row } : null;
    } catch {
      return null;
    }
  }));
  return { seasons, history: rows.filter(Boolean), truncated: seasons.length > recent.length };
}

function countTitles(champions, kind, id, history) {
  const map = champions?.[kind];
  if (map) return Object.values(map).filter((x) => x === id).length;
  // 沒有冠軍名單時，退而用抓到的歷年成績計算（可能不完整）
  const currentYear = new Date().getFullYear();
  return history.filter((h) => h.position === '1' && h.season < currentYear).length;
}

export async function loadDriverProfile(id, season) {
  const ttl = DAY;
  const p = `/drivers/${encodeURIComponent(id)}`;
  const results = await Promise.allSettled([
    get(`${p}/`, ttl),
    loadHistory('drivers', id),
    get(`${p}/results/?limit=1`, ttl),
    get(`${p}/results/1/?limit=1`, ttl),
    get(`${p}/results/2/?limit=1`, ttl),
    get(`${p}/results/3/?limit=1`, ttl),
    get(`${p}/qualifying/1/?limit=1`, ttl),
    get(`/${season}${p}/results/?limit=${PAGE_SIZE}`, ttlForSeason(season)),
    loadChampions(),
  ]);
  const [info, hist, starts, p1, p2, p3, poles, seasonRes, champions] = results.map(settledValue);
  if (!info) throw results[0].reason;

  const history = hist?.history || [];
  return {
    driver: info.MRData.DriverTable.Drivers[0],
    history,
    historyTruncated: hist?.truncated,
    firstSeason: hist?.seasons[0],
    stats: {
      titles: countTitles(champions, 'drivers', id, history),
      seasons: hist?.seasons.length ?? null,
      starts: starts ? total(starts) : null,
      wins: p1 ? total(p1) : null,
      podiums: p1 && p2 && p3 ? total(p1) + total(p2) + total(p3) : null,
      poles: poles ? total(poles) : null,
    },
    seasonRaces: seasonRes?.MRData.RaceTable.Races || [],
  };
}

export async function loadTeamProfile(id, season) {
  const ttl = DAY;
  const p = `/constructors/${encodeURIComponent(id)}`;
  const results = await Promise.allSettled([
    get(`${p}/`, ttl),
    loadHistory('constructors', id),
    get(`${p}/races/?limit=1`, ttl),
    get(`${p}/results/1/?limit=1`, ttl),
    get(`${p}/qualifying/1/?limit=1`, ttl),
    get(`/${season}${p}/results/?limit=${PAGE_SIZE}`, ttlForSeason(season)),
    loadChampions(),
  ]);
  const [info, hist, races, wins, poles, seasonRes, champions] = results.map(settledValue);
  const seasonRaces = seasonRes?.MRData.RaceTable.Races || [];
  // 本季車手：直接從本季成績裡找出替這隊出賽過的人（省一次 API 請求）
  const drivers = [...new Map(seasonRaces.flatMap((r) => r.Results || [])
    .map((r) => [r.Driver.driverId, r.Driver])).values()];
  if (!info) throw results[0].reason;

  const history = hist?.history || [];
  return {
    team: info.MRData.ConstructorTable.Constructors[0],
    history,
    historyTruncated: hist?.truncated,
    firstSeason: hist?.seasons[0],
    stats: {
      titles: countTitles(champions, 'constructors', id, history),
      seasons: hist?.seasons.length ?? null,
      races: races ? total(races) : null,
      wins: wins ? total(wins) : null,
      poles: poles ? total(poles) : null,
    },
    drivers,
    seasonRaces,
  };
}

/** 車手/車隊故事（自己寫的中文內容） */
let storiesPromise = null;
export function loadStories() {
  if (!storiesPromise) {
    storiesPromise = fetch('data/stories.json')
      .then((r) => (r.ok ? r.json() : { drivers: {}, teams: {} }))
      .catch(() => ({ drivers: {}, teams: {} }));
  }
  return storiesPromise;
}
