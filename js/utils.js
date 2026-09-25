// ============================================================
// utils.js — 共用小工具
// 這裡放「跟畫面、跟資料來源都無關」的純函式：
// 格式化時間、跳脫 HTML、國旗、車隊顏色…
// 純函式（同樣輸入 → 同樣輸出、沒有副作用）最容易測試與重用。
// ============================================================

/**
 * 跳脫 HTML 特殊字元。
 * 重要觀念：只要把「外部資料」塞進 innerHTML，就要先跳脫，
 * 否則資料裡如果有 <script> 之類的字串，就會被瀏覽器當成程式執行（XSS 攻擊）。
 */
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 把 API 給的 date("2026-03-08") + time("04:00:00Z") 合成 Date 物件（UTC） */
export function toDate(date, time) {
  if (!date) return null;
  return new Date(`${date}T${time || '00:00:00Z'}`);
}

// Intl.DateTimeFormat 會自動用「使用者電腦的時區」顯示，
// 所以住在台灣的人看到台灣時間，朋友在美國就看到美國時間。
const fmtDate = new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' });
const fmtDateTime = new Intl.DateTimeFormat('zh-TW', {
  month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
});
const fmtTime = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
const fmtFull = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });

export const formatDate = (d) => (d ? fmtDate.format(d) : '—');
export const formatDateTime = (d) => (d ? fmtDateTime.format(d) : '—');
export const formatTime = (d) => (d ? fmtTime.format(d) : '—');
export const formatFullDate = (d) => (d ? fmtFull.format(d) : '—');
export const userTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** 倒數計時文字，例如「3 天 4 小時」 */
export function countdown(target, now = new Date()) {
  let ms = target - now;
  if (ms <= 0) return '進行中 / 即將開始';
  const d = Math.floor(ms / 86400000); ms -= d * 86400000;
  const h = Math.floor(ms / 3600000); ms -= h * 3600000;
  const m = Math.floor(ms / 60000);
  if (d > 0) return `${d} 天 ${h} 小時`;
  if (h > 0) return `${h} 小時 ${m} 分`;
  return `${m} 分鐘`;
}

/** "1:23.456" 或 "59.123" → 毫秒；解析失敗回傳 null */
export function lapToMs(str) {
  if (!str) return null;
  const parts = String(str).split(':');
  let sec = 0;
  for (const p of parts) sec = sec * 60 + parseFloat(p);
  return Number.isFinite(sec) ? Math.round(sec * 1000) : null;
}

/** 毫秒差距 → "+0.123" */
export function formatGap(ms) {
  if (ms == null) return '';
  if (ms === 0) return '—';
  return `+${(ms / 1000).toFixed(3)}`;
}

// ---------- 比賽狀態翻譯 ----------
const STATUS_ZH = {
  Finished: '完賽',
  Lapped: '被套圈',
  Retired: '退賽',
  Accident: '事故',
  Collision: '碰撞',
  'Collision damage': '碰撞損傷',
  Disqualified: '取消資格',
  'Did not start': '未起跑',
  'Did not qualify': '未晉級',
  'Did not prequalify': '未通過資格預賽',
  Withdrew: '退出',
  Engine: '引擎故障',
  Gearbox: '變速箱故障',
  Transmission: '傳動系統故障',
  Hydraulics: '液壓故障',
  Brakes: '煞車故障',
  Suspension: '懸吊故障',
  Electrical: '電子系統故障',
  'Power Unit': '動力單元故障',
  'Power loss': '動力流失',
  'Spun off': '打滑衝出',
  Overheating: '過熱',
  'Fuel pressure': '油壓問題',
  'Water pressure': '水壓問題',
  'Oil leak': '漏油',
  Puncture: '爆胎',
  Wheel: '輪胎問題',
  Illness: '身體不適',
};

export function statusZh(status) {
  if (!status) return '';
  const m = /^\+(\d+) Laps?$/.exec(status); // "+1 Lap" → "+1 圈"
  if (m) return `+${m[1]} 圈`;
  return STATUS_ZH[status] || status;
}

/** 完賽（含被套圈）才算 "classified finish" */
export function isFinished(status) {
  return status === 'Finished' || status === 'Lapped' || /^\+\d+ Laps?$/.test(status || '');
}

// ---------- 國旗 ----------
// 國旗 emoji 其實是兩個「區域指示符號」字母組成，例如 🇹🇼 = T + W。
// 所以只要有 ISO 國碼，就能用程式算出國旗。
const NATIONALITY_ISO = {
  Dutch: 'NL', British: 'GB', Monegasque: 'MC', Spanish: 'ES', Mexican: 'MX', Australian: 'AU',
  French: 'FR', German: 'DE', Finnish: 'FI', Canadian: 'CA', Japanese: 'JP', Chinese: 'CN',
  Danish: 'DK', Thai: 'TH', American: 'US', Italian: 'IT', 'New Zealander': 'NZ', Argentine: 'AR',
  Argentinian: 'AR', Brazilian: 'BR', Austrian: 'AT', Swiss: 'CH', Belgian: 'BE', Swedish: 'SE',
  Polish: 'PL', Russian: 'RU', Venezuelan: 'VE', Colombian: 'CO', Indian: 'IN', Irish: 'IE',
  Portuguese: 'PT', 'South African': 'ZA', Hungarian: 'HU', Indonesian: 'ID', Malaysian: 'MY',
  Chilean: 'CL', Czech: 'CZ', Estonian: 'EE', Uruguayan: 'UY', Rhodesian: 'ZW', Liechtensteiner: 'LI',
  'East German': 'DE', 'American-Italian': 'US', 'Argentine-Italian': 'AR',
};
const COUNTRY_ISO = {
  Australia: 'AU', Austria: 'AT', Azerbaijan: 'AZ', Bahrain: 'BH', Belgium: 'BE', Brazil: 'BR',
  Canada: 'CA', China: 'CN', France: 'FR', Germany: 'DE', Hungary: 'HU', India: 'IN', Italy: 'IT',
  Japan: 'JP', Korea: 'KR', Malaysia: 'MY', Mexico: 'MX', Monaco: 'MC', Netherlands: 'NL',
  Portugal: 'PT', Qatar: 'QA', Russia: 'RU', 'Saudi Arabia': 'SA', Singapore: 'SG', Spain: 'ES',
  Sweden: 'SE', Switzerland: 'CH', Turkey: 'TR', UAE: 'AE', 'United Arab Emirates': 'AE', UK: 'GB',
  'United Kingdom': 'GB', USA: 'US', 'United States': 'US', Vietnam: 'VN', Argentina: 'AR',
  'South Africa': 'ZA', Morocco: 'MA', Denmark: 'DK',
};

function isoToFlag(iso) {
  if (!iso) return '🏁';
  return [...iso.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');
}
export const nationalityFlag = (n) => isoToFlag(NATIONALITY_ISO[n]);
export const countryFlag = (c) => isoToFlag(COUNTRY_ISO[c]);

// ---------- 車隊顏色 ----------
// 以 constructorId（API 裡車隊的代號）對應代表色；沒列到的歷史車隊用雜湊產生一個穩定的顏色。
const TEAM_COLORS = {
  red_bull: '#3671C6', ferrari: '#E8002D', mercedes: '#27F4D2', mclaren: '#FF8000',
  aston_martin: '#229971', alpine: '#0093CC', williams: '#64C4FF', rb: '#6692FF',
  racing_bulls: '#6692FF', alphatauri: '#5E8FAA', toro_rosso: '#469BFF', haas: '#B6BABD',
  sauber: '#52E252', kick_sauber: '#52E252', audi: '#FF4D4D', alfa: '#C92D4B', cadillac: '#D4AF37',
  renault: '#FFF500', racing_point: '#F596C8', force_india: '#F596C8', lotus_f1: '#FFB800',
  lotus: '#FFB800', team_lotus: '#FFB800', brawn: '#B8FD6E', benetton: '#65C3E8', jordan: '#F7D000',
  tyrrell: '#1E5AA8', brabham: '#1E7A3C', minardi: '#E6E6E6', toyota: '#E0E0E0', honda: '#F5F5F5',
  bar: '#D0D0D0', jaguar: '#0E6B3A', stewart: '#FFFFFF', ligier: '#1560BD', march: '#E03A3E',
};

export function teamColor(constructorId) {
  if (TEAM_COLORS[constructorId]) return TEAM_COLORS[constructorId];
  let h = 0;
  for (const ch of String(constructorId)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 58%)`;
}

// ---------- 連結 ----------
// 車手、車隊頁用「網址參數」告訴頁面要顯示誰，例如 driver.html?id=hamilton&season=2026
export const driverUrl = (id, season) => `driver.html?id=${encodeURIComponent(id)}&season=${season}`;
export const teamUrl = (id, season) => `team.html?id=${encodeURIComponent(id)}&season=${season}`;

export const driverName = (d) => `${d.givenName} ${d.familyName}`;

export function driverLink(driver, season) {
  return `<a class="name-link" href="${driverUrl(driver.driverId, season)}">${esc(driverName(driver))}</a>`;
}

export function teamLink(constructor, season) {
  const color = teamColor(constructor.constructorId);
  return `<a class="name-link team-link" href="${teamUrl(constructor.constructorId, season)}">` +
    `<span class="team-dot" style="--c:${color}"></span>${esc(constructor.name)}</a>`;
}

// 賽段名稱
export const SESSION_LABELS = {
  FirstPractice: '一練 FP1',
  SecondPractice: '二練 FP2',
  ThirdPractice: '三練 FP3',
  SprintQualifying: '衝刺排位',
  SprintShootout: '衝刺排位',
  Sprint: '衝刺賽',
  Qualifying: '排位賽',
  Race: '正賽',
};
