// ============================================================
// photos.js — 車手 / 車隊照片
//
// F1 資料 API 裡每位車手、每支車隊都附有 Wikipedia 連結（url 欄位）。
// Wikipedia 有公開的摘要 API，會回傳該頁面的代表照片：
//   https://en.wikipedia.org/api/rest_v1/page/summary/Lewis_Hamilton
// 照片來自 Wikimedia Commons，授權允許在註明出處的情況下使用。
//
// 做法：先在 HTML 放一個「佔位圈圈」（顯示名字縮寫），
// 畫面出來後再由 hydratePhotos() 找出所有佔位圈圈，逐一換成真正的照片。
// 這樣照片慢慢載入也不會拖慢整個頁面。
// ============================================================
import { esc } from './utils.js';

const CACHE_PREFIX = 'f1img:v1:';
const TTL = 14 * 24 * 60 * 60 * 1000; // 照片很少換，快取 14 天
const inflight = new Map(); // 同一張照片同時被要求多次時，只發一次請求

/** 從 Wikipedia 網址取出頁面標題，例如 ".../wiki/Nico_H%C3%BClkenberg" → "Nico_Hülkenberg" */
function titleFromUrl(url) {
  const m = /wikipedia\.org\/wiki\/([^#?]+)/.exec(url || '');
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function cacheRead(title) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + title);
    if (!raw) return undefined;
    const { t, src } = JSON.parse(raw);
    return Date.now() - t < TTL ? src : undefined; // src 可能是 null（代表這頁沒有照片）
  } catch {
    return undefined;
  }
}

function cacheWrite(title, src) {
  try {
    localStorage.setItem(CACHE_PREFIX + title, JSON.stringify({ t: Date.now(), src }));
  } catch { /* 空間滿了就不快取 */ }
}

/** 取得照片網址；沒有照片或失敗時回傳 null */
export function photoFor(wikiUrl) {
  const title = titleFromUrl(wikiUrl);
  if (!title) return Promise.resolve(null);
  const cached = cacheRead(title);
  if (cached !== undefined) return Promise.resolve(cached);
  if (!inflight.has(title)) {
    const api = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`;
    inflight.set(title, fetch(api)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const src = json?.thumbnail?.source || null;
        if (json) cacheWrite(title, src); // 只有真的拿到回應才快取，網路錯誤下次再試
        return src;
      })
      .catch(() => null)
      .finally(() => inflight.delete(title)));
  }
  return inflight.get(title);
}

function initials(name) {
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/**
 * 產生照片佔位的 HTML
 * @param {string} wikiUrl  API 給的 Wikipedia 連結
 * @param {string} name     名字（照片載入前顯示縮寫，也當作 alt 文字）
 * @param {string} size     'sm' | 'md' | 'lg'
 * @param {string} shape    'round'（車手）| 'square'（車隊）
 */
export function avatar(wikiUrl, name, size = 'sm', shape = 'round') {
  return `<span class="avatar avatar-${size} avatar-${shape}" data-wiki="${esc(wikiUrl || '')}" data-name="${esc(name)}"
    aria-hidden="true"><span class="avatar-initials">${esc(initials(name))}</span></span>`;
}

/** 把畫面上所有還沒載入的照片佔位換成真正的照片 */
export function hydratePhotos(root = document) {
  root.querySelectorAll('.avatar[data-wiki]:not([data-done])').forEach(async (el) => {
    el.dataset.done = '1';
    const src = await photoFor(el.dataset.wiki);
    if (!src) return; // 沒照片就保留縮寫
    const img = new Image();
    img.alt = el.dataset.name || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => el.classList.add('has-photo');
    img.src = src;
    el.append(img);
  });
}
