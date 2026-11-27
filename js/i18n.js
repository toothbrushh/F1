// ============================================================
// i18n.js — 多語言（中文 / English）
//
// 用法：
//   import { t, lang } from './i18n.js';
//   t('drivers.title', { season: 2026 })  →  "2026 車手積分榜" / "2026 Drivers' Championship"
//
// 語言決定順序：網址 ?lang=en → 上次選擇（localStorage）→ 瀏覽器語言 → 中文
// HTML 裡固定的文字用 data-i18n="key" 標記，applyStatic() 會自動換成對應語言。
// 想加新語言：在 SUPPORTED 加代號，再在 DICT 加一份同樣 key 的翻譯即可。
// ============================================================

export const SUPPORTED = ['zh', 'en'];
const STORAGE_KEY = 'f1-lang';

function detect() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (SUPPORTED.includes(fromUrl)) {
    // 記住網址指定的語言，點到其他頁面（網址沒有 ?lang=）時才不會跳回別的語言
    try { localStorage.setItem(STORAGE_KEY, fromUrl); } catch { /* ignore */ }
    return fromUrl;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(saved)) return saved;
  } catch { /* 私密模式等情況讀不到 localStorage */ }
  const nav = (navigator.languages?.[0] || navigator.language || 'zh').toLowerCase();
  return nav.startsWith('zh') ? 'zh' : 'en';
}

export const lang = detect();
/** 給 Intl 用的地區代碼（日期、數字格式） */
export const locale = lang === 'en' ? 'en-GB' : 'zh-TW';
/** <html lang="…"> 用的代碼 */
const HTML_LANG = { zh: 'zh-Hant', en: 'en' };

/** 切換語言：記住選擇，並重新載入頁面（網址上的 ?lang= 也一起更新） */
export function setLang(next) {
  if (!SUPPORTED.includes(next) || next === lang) return;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) url.searchParams.set('lang', next);
  // 網址沒變（只有 #hash）時，設定 location.href 不會重新載入，所以要明確 reload()
  if (url.toString() === location.href) location.reload();
  else location.href = url.toString();
}

const PODCAST_LINKS = `<a href="https://podcasts.apple.com/us/podcast/%E5%BD%8E%E9%81%93%E4%B9%8B%E9%96%93/id6825404943" target="_blank" rel="noopener">Apple Podcasts</a>、<a href="https://open.spotify.com/show/0EjmlKCBFgUCu76mfZAycP" target="_blank" rel="noopener">Spotify</a>`;
const JOLPICA = '<a href="https://github.com/jolpica/jolpica-f1" target="_blank" rel="noopener">Jolpica F1 API</a>';
const OPENF1 = '<a href="https://openf1.org" target="_blank" rel="noopener">OpenF1</a>';

// 值可以是字串（{name} 會被替換）或函式（需要依數字變化時，例如英文單複數）
const DICT = {
  zh: {
    'lang.switch': 'EN',
    'lang.switchTitle': 'Switch to English',

    'site.title': 'F1 賽季成績',
    'site.titleSeason': '{season} F1 賽季成績',
    'site.description': 'F1 賽季積分、分站排位賽與正賽成績、賽程表，自動更新最新數據。',
    'site.brand': '賽季成績',
    'header.season': '賽季',
    'header.seasonSelect': '選擇賽季',
    'header.refresh': '↻ 更新',
    'header.refreshTitle': '清除快取並重新抓取最新資料',
    'common.loading': '載入中…',
    'common.loadingApi': '正在從 F1 資料庫抓取資料…',
    'common.retry': '重試',

    'timeline.label': '賽季進度',
    'timeline.title': '{season} 賽季進度 · {done} / {total} 站',
    'timeline.done': '已完賽',
    'timeline.next': '下一站',
    'timeline.todo': '待賽',
    'timeline.pending': '成績待更新',
    'timeline.empty': '這個賽季還沒有公布賽程。',
    'timeline.sprint': '衝刺賽週末',

    'tabs.label': '主要分頁',
    'tabs.summary': '總覽',
    'tabs.drivers': '車手積分',
    'tabs.teams': '車隊積分',
    'tabs.round': '分站成績',
    'tabs.schedule': '賽程表',

    'podcast.title': '聽 Podcast《彎道之間》',
    'podcast.desc': 'F1 賽後雙人聊天：每站大獎賽賽後上架，聊賽果、爭議與下一站預測。（中文節目）',
    'footer.main': `資料來源：${JOLPICA}、輪胎資料 ${OPENF1}。時間皆以你的裝置時區顯示（<span id="tz"></span>）。照片來源：Wikipedia / Wikimedia Commons（依各圖片授權）。本站為粉絲專案，與 Formula 1 官方無關。🎧 本站的 F1 podcast《彎道之間》：${PODCAST_LINKS}。`,
    'footer.profile': `資料來源：${JOLPICA}。故事內容為本站整理。照片來源：Wikipedia / Wikimedia Commons（依各圖片授權）。🎧 本站的 F1 podcast《彎道之間》：${PODCAST_LINKS}。`,

    // 總覽
    'summary.driverLeader': '車手積分領先',
    'summary.teamLeader': '車隊積分領先',
    'summary.statLine': '<b>{points}</b> 分 · {wins} 勝',
    'summary.lead': ' · 領先 P2 {gap} 分',
    'summary.lastRace': '上一站 · R{round}',
    'summary.fullResults': '完整成績 →',
    'summary.nextRace': '下一站 · R{round}',
    'summary.raceAt': '正賽：{when}',
    'summary.timeTbc': '{date}（時間未定）',
    'summary.sprintWeekend': ' · 衝刺賽週末',
    'summary.fullSchedule': '完整時間表 →',
    'summary.noData': '這個賽季還沒有資料。',
    'summary.progress': '已完成 <b>{done}</b> / {total} 站',
    'summary.standingsRound': '（積分統計至第 {round} 站）',
    'summary.driversTop5': '車手積分 Top 5',
    'summary.teamsTop5': '車隊積分 Top 5',
    'summary.all': '全部 →',
    'summary.chartTitle': '積分走勢（前 8 名車手）',
    'banner.notStarted': '🗓 {season} 賽季還沒開始',
    'banner.notStartedBody': '目前已公布 <b>{count}</b> 站賽程，揭幕戰是 {opener}（{date}）。積分與成績會在開賽後出現。賽程有時會調整，以最新公布為準。',
    'banner.viewSchedule': '查看完整賽程 →',
    'banner.future': '📅 <b>{year} 賽季賽程已公布</b>（{count} 站）',
    'banner.futureLink': '查看 {year} 賽程 →',
    'upcoming.title': '接下來三天的賽程',
    'upcoming.nextWeekend': '下一個比賽週末 · {race}',
    'upcoming.days': ['今天', '明天', '後天'],
    'upcoming.fullSchedule': '完整賽程 →',
    'upcoming.live': '● 進行中',
    'upcoming.tzNote': '時間為你的當地時間（{tz}）。',

    // 積分榜
    'table.pos': '名次',
    'table.driver': '車手',
    'table.team': '車隊',
    'table.drivers': '車手',
    'table.wins': '勝場',
    'table.points': '積分',
    'table.gap': '差距',
    'table.noStandings': '尚無積分資料。',
    'table.noTeamStandings': '這個賽季沒有車隊積分（車隊冠軍從 1958 年才開始）。',
    'table.listSep': '、',
    'drivers.title': '{season} 車手積分榜',
    'drivers.hint': '點名字看車手故事',
    'teams.title': '{season} 車隊積分榜',
    'teams.hint': '點車隊看車隊歷史',

    // 分站
    'round.noSchedule': '這個賽季還沒有賽程。',
    'round.qualifying': '排位賽',
    'round.sprint': '衝刺賽',
    'round.race': '正賽',
    'round.tyres': '輪胎策略',
    'round.prev': '上一站',
    'round.next': '下一站',
    'round.select': '選擇分站',
    'round.raceAt': '正賽 {when}',
    'round.loadingTyres': '正在載入輪胎資料…',
    'round.provisional': `⏳ 暫定成績（資料來源：${OPENF1}）。正式成績與積分榜更新後會自動換成正式資料。`,
    'round.notStarted': '這一站還沒開始比賽。',
    'round.notPublished': '成績尚未公布，請稍後再回來看看。',
    'round.viewSchedule': '查看這一站的時間表 →',
    'round.noTyres': '在 OpenF1 找不到這場比賽的輪胎資料（剛比完的比賽可能要過一陣子才會有）。',
    'round.liveSession': '🏁 現在有 F1 賽事正在進行，OpenF1 在賽事期間暫停免費查詢。',
    'round.liveSessionNote': '這一站的輪胎資料還沒存檔，等賽事結束後再回來看就可以了。',
    'round.tyresFailed': '輪胎資料載入失敗：{msg}',
    'round.tryLater': '稍後再試試看。',
    'round.fastest': '⏱ 最快圈：{driver} <b>{time}</b>（第 {lap} 圈）',
    'round.grid': '發車',
    'round.change': '升降',
    'round.laps': '圈數',
    'round.timeGap': '時間 / 差距',
    'round.fastestLap': '最快圈',
    'round.scored': '得分',
    'round.pitLane': '維修區',
    'round.qualiNote': 'Q1 淘汰最慢的車手、Q2 再淘汰一批，前 10 名進入 Q3 爭奪竿位。紫色 = 該節最快。',
    'round.gapToPole': '與竿位差距',

    // 賽程表
    'schedule.all': '全部',
    'schedule.tz': '時區：{tz}',
    'schedule.timeTbc': '時間未定',
    'schedule.winner': '🏆 {driver} 奪冠 · 查看成績 →',
    'schedule.none': '沒有符合的分站。',
    'schedule.futureOption': '{year}（賽程）',

    // 倒數
    'countdown.prefix': '⏱ 倒數 {time}',
    'countdown.now': '進行中 / 即將開始',
    'countdown.dh': '{d} 天 {h} 小時',
    'countdown.hm': '{h} 小時 {m} 分',
    'countdown.m': '{m} 分鐘',

    // 資料狀態
    'status.archive': '✓ 歷史賽季（已存檔的完整成績）',
    'status.snapshot': '⚠ 即時 API 暫時無法連線，目前顯示備份資料（{time}）',
    'status.live': '✓ 已更新至最新資料（{time}）',
    'status.cached': '資料時間：{time}（快取，每 10 分鐘自動更新）',
    'status.failed': '⚠ 無法取得資料',
    'status.refreshing': '重新抓取中…',
    'error.fetch': '抓取資料失敗：{msg}',
    'error.fetchHint': '可能是網路問題或 API 暫時忙碌，稍等幾秒再試一次。',

    // 賽段
    'session.FirstPractice': '一練 FP1',
    'session.SecondPractice': '二練 FP2',
    'session.ThirdPractice': '三練 FP3',
    'session.SprintQualifying': '衝刺排位',
    'session.SprintShootout': '衝刺排位',
    'session.Sprint': '衝刺賽',
    'session.Qualifying': '排位賽',
    'session.Race': '正賽',

    // 走勢圖
    'chart.needTwo': '至少要比完兩站才會顯示走勢圖。',
    'chart.aria': '前 {n} 名車手累積積分走勢',

    // 輪胎
    'tyre.SOFT': '軟胎',
    'tyre.MEDIUM': '中性胎',
    'tyre.HARD': '硬胎',
    'tyre.INTERMEDIATE': '半雨胎',
    'tyre.WET': '全雨胎',
    'tyre.UNKNOWN': '未知',
    'tyre.none': '這場比賽沒有輪胎資料。',
    'tyre.tip': '第 {from}–{to} 圈 · {compound} · {laps} 圈',
    'tyre.used': '（舊胎，起跑時已用 {age} 圈）',
    'tyre.new': '（新胎）',
    'tyre.noData': '沒有資料',
    'tyre.stops': '{n} 停',
    'tyre.usedLegend': '斜紋 = 舊胎',
    'tyre.common': '最常見的策略：',
    'tyre.commonItem': '（{n} 人）',
    'tyre.aria': '各車手輪胎策略，共 {laps} 圈',
    'tyre.laps': '圈數',
    'tyre.note': `滑鼠移到色條上（手機用長按）可以看每一段的圈數。資料來源：${OPENF1}。`,

    // 介紹頁
    'profile.back': '← 回到 {season} 賽季',
    'profile.backDefault': '← 回到賽季',
    'profile.driverTitle': '{name} · F1 車手',
    'profile.teamTitle': '{name} · F1 車隊',
    'profile.driverPage': 'F1 車手',
    'profile.teamPage': 'F1 車隊',
    'profile.truncated': '部分較早的賽季還沒存檔，暫時沒有列出（存檔會自動補齊）。',
    'profile.wiki': '在 Wikipedia 看更多 →',
    'profile.story': '故事',
    'profile.noStory': '還沒有撰寫 {name} 的中文介紹。你可以在 <code>data/stories.json</code> 裡自己加上去！',
    'profile.highlights': '生涯亮點',
    'profile.nickname': '「{nick}」',
    'profile.noRaces': '這個賽季還沒有正賽成績。',
    'profile.stripTip': 'R{round} {race}：{result}，{points} 分',
    'profile.place': '第 {pos} 名',
    'profile.stripLegend': '金色 = 冠軍、銀色 = 頒獎台、有底色 = 有拿分。點方塊看該站成績。',
    'profile.born': ' · 生日 {date}',
    'profile.age': '（{age} 歲）',
    'profile.titles': '世界冠軍',
    'profile.wins': '分站冠軍',
    'profile.podiums': '頒獎台',
    'profile.poles': '竿位',
    'profile.polesNote': '1994 年起有排位資料',
    'profile.starts': '出賽',
    'profile.seasons': '參賽季數',
    'profile.seasonsNote': '含練習賽',
    'profile.seasonResults': '{season} 賽季每站成績',
    'profile.history': '歷年成績',
    'profile.debut': '（{year} 年出道）',
    'profile.season': '賽季',
    'profile.team': '車隊',
    'profile.finalPos': '年度名次',
    'profile.teamDrivers': '{season} 車手：',
    'profile.teamTitles': '車隊冠軍',
    'profile.teamTitlesNote': '1958 年起',
    'profile.races': '參賽站數',
    'profile.firstEntry': '{year} 年首次參賽',
    'profile.seasonPoints': '{season} 賽季每站得分',
    'profile.teamBarTip': 'R{round} {race}：{points} 分，最佳 P{best}',
    'profile.teamHistory': '歷年車隊積分',
    'profile.noTeamHistory': '沒有車隊積分紀錄（車隊冠軍從 1958 年開始）。',
    'profile.failed': '載入失敗：{msg}',
    'profile.failedHint': '可能是網路問題或 API 暫時忙碌，稍後再試。',

    // 賽道介紹
    'tabs.circuits': '賽道',
    'circuits.title': '{season} 賽季賽道',
    'circuits.hint': '點賽道看國家、歷史、賽道解析、輪胎與天氣',
    'circuits.loading': '正在載入賽道介紹…',
    'circuits.noInfo': '這條賽道還沒有介紹',
    'circuit.link': '🏟 賽道介紹 →',
    'circuit.page': 'F1 賽道',
    'circuit.title': '{name} · F1 賽道',
    'circuit.back': '← 回到 {season} 賽程',
    'circuit.length': '賽道長度',
    'circuit.km': '{n} 公里',
    'circuit.turns': '彎道數',
    'circuit.turnsCount': '{n} 個彎',
    'circuit.laps': '正賽圈數',
    'circuit.raceDistance': '約 {n} 公里',
    'circuit.firstGP': '首次舉辦 F1',
    'circuit.direction': '方向',
    'circuit.dir.cw': '順時針',
    'circuit.dir.acw': '逆時針',
    'circuit.dir.fig8': '8 字形',
    'circuit.type': '類型',
    'circuit.type.permanent': '常設賽道',
    'circuit.type.street': '街道賽道',
    'circuit.type.hybrid': '半街道賽道',
    'circuit.ratings': '賽道特性',
    'circuit.rating.tyreStress': '輪胎負擔',
    'circuit.rating.downforce': '下壓力需求',
    'circuit.rating.overtaking': '超車容易度',
    'circuit.ratingsNote': '1–5 分，本站的概略評估。',
    'circuit.countryHistory': '國家與賽道歷史',
    'circuit.trackGuide': '賽道解析',
    'circuit.sectors': '三個區段',
    'circuit.sector': 'S{n}',
    'circuit.features': '特色',
    'circuit.tyres': '輪胎',
    'circuit.tyreRange': '常見選胎：',
    'circuit.tyreRange.hard': '偏硬的組合',
    'circuit.tyreRange.mid': '中間的組合',
    'circuit.tyreRange.soft': '偏軟的組合',
    'circuit.lastTyres': '{year} 年這裡的實際策略',
    'circuit.compoundsUsed': '使用的輪胎：',
    'circuit.winnerStrategy': '冠軍 {driver} 的策略：<b class="ty-strat">{strategy}</b>（{stops}）',
    'circuit.fullTyreChart': '看完整輪胎策略圖 →',
    'circuit.noTyreData': '還沒有這條賽道的輪胎資料（2023 年起才有）。',
    'circuit.weather': '天氣',
    'circuit.forecast': '比賽週末天氣預報',
    'circuit.forecastNote': '預報來源：<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>，以賽道當地日期顯示。',
    'circuit.rainChance': '降雨機率 {n}%',
    'circuit.thisSeason': '{season} 賽季 · 第 {round} 站',
    'circuit.notThisSeason': '{season} 賽季沒有在這裡比賽。',
    'circuit.viewResults': '看這一站成績 →',
    'circuit.viewSchedule': '看這一站時間表 →',
    'circuit.winners': '最近的冠軍',
    'circuit.winnersEmpty': '沒有歷屆冠軍資料。',
    'circuit.year': '年份',
    'circuit.map': '在 Google 地圖上看 →',
    'circuit.mapTitle': '賽道平面圖',
    'circuit.mapStart': '起點 / 終點',
    'circuit.mapStraight': '直線 {km} 公里',
    'circuit.mapLegendStraight': '直線段',
    'circuit.mapLegendArrow': '行進方向',
    'circuit.mapAria': '{name} 賽道平面圖',
    'circuit.mapLegendCorner': '官方彎道編號',
    'circuit.mapLegendSectors': '計時區段 S1 / S2 / S3',
    'circuit.mapNote': '北方朝上。賽道外形來自 <a href="https://github.com/bacinger/f1-circuits" target="_blank" rel="noopener">bacinger/f1-circuits</a>（MIT 授權）；直線段與長度是依外形自動計算的，僅供參考。',
    'circuit.mapTimingNote': '彎道編號來自 <a href="https://multiviewer.app" target="_blank" rel="noopener">MultiViewer</a>（非官方），計時線與區段分界依 <a href="https://openf1.org" target="_blank" rel="noopener">OpenF1</a> {year} 年正賽最快圈的計時與位置推算，誤差約數十公尺。',
    'circuit.mapNoTiming': '這條賽道還沒有彎道編號與計時區段資料（要等這裡比過一場正賽後才有）。',
    'circuit.noStory': '還沒有撰寫這條賽道的介紹。你可以在 <code>data/circuits.json</code> 裡加上去！',
  },

  en: {
    'lang.switch': '中文',
    'lang.switchTitle': '切換成中文',

    'site.title': 'F1 Season Results',
    'site.titleSeason': '{season} F1 Season Results',
    'site.description': 'F1 standings, qualifying and race results for every round, and the full calendar — updated automatically.',
    'site.brand': 'Season Results',
    'header.season': 'Season',
    'header.seasonSelect': 'Choose season',
    'header.refresh': '↻ Refresh',
    'header.refreshTitle': 'Clear the cache and fetch the latest data',
    'common.loading': 'Loading…',
    'common.loadingApi': 'Fetching data from the F1 database…',
    'common.retry': 'Retry',

    'timeline.label': 'Season progress',
    'timeline.title': '{season} season · {done} / {total} rounds',
    'timeline.done': 'Completed',
    'timeline.next': 'Next',
    'timeline.todo': 'Upcoming',
    'timeline.pending': 'Results pending',
    'timeline.empty': 'The calendar for this season has not been published yet.',
    'timeline.sprint': 'Sprint weekend',

    'tabs.label': 'Main sections',
    'tabs.summary': 'Overview',
    'tabs.drivers': 'Drivers',
    'tabs.teams': 'Constructors',
    'tabs.round': 'Results',
    'tabs.schedule': 'Calendar',

    'podcast.title': 'Listen to our podcast “彎道之間”',
    'podcast.desc': 'A two-host F1 chat show released after every Grand Prix: results, controversies and predictions. (In Mandarin.)',
    'footer.main': `Data: ${JOLPICA}; tyre data from ${OPENF1}. All times are shown in your device’s time zone (<span id="tz"></span>). Photos: Wikipedia / Wikimedia Commons (under each image’s licence). This is a fan project and is not affiliated with Formula 1. 🎧 Our F1 podcast “彎道之間”: ${PODCAST_LINKS.replace('、', ', ')}.`,
    'footer.profile': `Data: ${JOLPICA}. Stories written by this site. Photos: Wikipedia / Wikimedia Commons (under each image’s licence). 🎧 Our F1 podcast “彎道之間”: ${PODCAST_LINKS.replace('、', ', ')}.`,

    'summary.driverLeader': 'Drivers’ leader',
    'summary.teamLeader': 'Constructors’ leader',
    'summary.statLine': ({ points, wins }) => `<b>${points}</b> pts · ${wins} ${wins === '1' || wins === 1 ? 'win' : 'wins'}`,
    'summary.lead': ' · {gap} pts ahead of P2',
    'summary.lastRace': 'Last race · R{round}',
    'summary.fullResults': 'Full results →',
    'summary.nextRace': 'Next race · R{round}',
    'summary.raceAt': 'Race: {when}',
    'summary.timeTbc': '{date} (time TBC)',
    'summary.sprintWeekend': ' · Sprint weekend',
    'summary.fullSchedule': 'Full timetable →',
    'summary.noData': 'No data for this season yet.',
    'summary.progress': '<b>{done}</b> / {total} rounds completed',
    'summary.standingsRound': ' (standings after round {round})',
    'summary.driversTop5': 'Drivers’ top 5',
    'summary.teamsTop5': 'Constructors’ top 5',
    'summary.all': 'All →',
    'summary.chartTitle': 'Points progression (top 8 drivers)',
    'banner.notStarted': '🗓 The {season} season hasn’t started yet',
    'banner.notStartedBody': '<b>{count}</b> rounds have been announced so far. The season opens with {opener} ({date}). Standings and results will appear once racing begins. The calendar may still change.',
    'banner.viewSchedule': 'View full calendar →',
    'banner.future': '📅 <b>The {year} calendar is out</b> ({count} rounds)',
    'banner.futureLink': 'View the {year} calendar →',
    'upcoming.title': 'Next three days',
    'upcoming.nextWeekend': 'Next race weekend · {race}',
    'upcoming.days': ['Today', 'Tomorrow', 'In 2 days'],
    'upcoming.fullSchedule': 'Full calendar →',
    'upcoming.live': '● Live',
    'upcoming.tzNote': 'Times are in your local time zone ({tz}).',

    'table.pos': 'Pos',
    'table.driver': 'Driver',
    'table.team': 'Team',
    'table.drivers': 'Drivers',
    'table.wins': 'Wins',
    'table.points': 'Pts',
    'table.gap': 'Gap',
    'table.noStandings': 'No standings yet.',
    'table.noTeamStandings': 'No constructors’ standings this season (the Constructors’ Championship began in 1958).',
    'table.listSep': ', ',
    'drivers.title': '{season} Drivers’ Championship',
    'drivers.hint': 'Click a name for the driver’s story',
    'teams.title': '{season} Constructors’ Championship',
    'teams.hint': 'Click a team for its history',

    'round.noSchedule': 'No calendar for this season yet.',
    'round.qualifying': 'Qualifying',
    'round.sprint': 'Sprint',
    'round.race': 'Race',
    'round.tyres': 'Tyre strategy',
    'round.prev': 'Previous round',
    'round.next': 'Next round',
    'round.select': 'Choose round',
    'round.raceAt': 'Race {when}',
    'round.loadingTyres': 'Loading tyre data…',
    'round.provisional': `⏳ Provisional results (source: ${OPENF1}). They will be replaced automatically once the official results and standings are published.`,
    'round.notStarted': 'This round hasn’t started yet.',
    'round.notPublished': 'Results haven’t been published yet — please check back later.',
    'round.viewSchedule': 'View this round’s timetable →',
    'round.noTyres': 'No tyre data for this race on OpenF1 (it can take a while after a race finishes).',
    'round.liveSession': '🏁 An F1 session is live right now, and OpenF1 pauses free access during sessions.',
    'round.liveSessionNote': 'Tyre data for this round hasn’t been archived yet — check back after the session ends.',
    'round.tyresFailed': 'Couldn’t load tyre data: {msg}',
    'round.tryLater': 'Please try again later.',
    'round.fastest': '⏱ Fastest lap: {driver} <b>{time}</b> (lap {lap})',
    'round.grid': 'Grid',
    'round.change': '+/−',
    'round.laps': 'Laps',
    'round.timeGap': 'Time / Gap',
    'round.fastestLap': 'Fastest lap',
    'round.scored': 'Pts',
    'round.pitLane': 'Pit lane',
    'round.qualiNote': 'The slowest drivers are knocked out in Q1, more in Q2, and the top 10 fight for pole in Q3. Purple = fastest in that session.',
    'round.gapToPole': 'Gap to pole',

    'schedule.all': 'All',
    'schedule.tz': 'Time zone: {tz}',
    'schedule.timeTbc': 'TBC',
    'schedule.winner': '🏆 Won by {driver} · View results →',
    'schedule.none': 'No matching rounds.',
    'schedule.futureOption': '{year} (calendar)',

    'countdown.prefix': '⏱ In {time}',
    'countdown.now': 'Live / starting soon',
    'countdown.dh': '{d}d {h}h',
    'countdown.hm': '{h}h {m}m',
    'countdown.m': '{m} min',

    'status.archive': '✓ Past season (archived final results)',
    'status.snapshot': '⚠ The live API is unreachable — showing backup data ({time})',
    'status.live': '✓ Up to date ({time})',
    'status.cached': 'Data as of {time} (cached, refreshes every 10 minutes)',
    'status.failed': '⚠ Couldn’t load data',
    'status.refreshing': 'Refreshing…',
    'error.fetch': 'Failed to fetch data: {msg}',
    'error.fetchHint': 'This may be a network problem or the API may be busy. Wait a few seconds and try again.',

    'session.FirstPractice': 'Practice 1',
    'session.SecondPractice': 'Practice 2',
    'session.ThirdPractice': 'Practice 3',
    'session.SprintQualifying': 'Sprint Qualifying',
    'session.SprintShootout': 'Sprint Shootout',
    'session.Sprint': 'Sprint',
    'session.Qualifying': 'Qualifying',
    'session.Race': 'Race',

    'chart.needTwo': 'The chart appears once at least two rounds have been completed.',
    'chart.aria': 'Cumulative points of the top {n} drivers',

    'tyre.SOFT': 'Soft',
    'tyre.MEDIUM': 'Medium',
    'tyre.HARD': 'Hard',
    'tyre.INTERMEDIATE': 'Intermediate',
    'tyre.WET': 'Wet',
    'tyre.UNKNOWN': 'Unknown',
    'tyre.none': 'No tyre data for this race.',
    'tyre.tip': 'Laps {from}–{to} · {compound} · {laps} laps',
    'tyre.used': ' (used, {age} laps old at start)',
    'tyre.new': ' (new)',
    'tyre.noData': 'No data',
    'tyre.stops': ({ n }) => `${n} ${n === 1 ? 'stop' : 'stops'}`,
    'tyre.usedLegend': 'Striped = used set',
    'tyre.common': 'Most common strategies: ',
    'tyre.commonItem': ({ n }) => ` (${n} ${n === 1 ? 'driver' : 'drivers'})`,
    'tyre.aria': 'Tyre strategy of each driver over {laps} laps',
    'tyre.laps': 'Lap',
    'tyre.note': `Hover over a bar (long-press on mobile) to see each stint’s laps. Source: ${OPENF1}.`,

    'profile.back': '← Back to {season}',
    'profile.backDefault': '← Back to season',
    'profile.driverTitle': '{name} · F1 Driver',
    'profile.teamTitle': '{name} · F1 Team',
    'profile.driverPage': 'F1 Driver',
    'profile.teamPage': 'F1 Team',
    'profile.truncated': 'Some earlier seasons haven’t been archived yet and aren’t listed (the archive fills in automatically).',
    'profile.wiki': 'Read more on Wikipedia →',
    'profile.story': 'Story',
    'profile.noStory': 'No English story for {name} yet. You can add one in <code>data/stories.en.json</code>!',
    'profile.highlights': 'Career highlights',
    'profile.nickname': '“{nick}”',
    'profile.noRaces': 'No race results this season yet.',
    'profile.stripTip': 'R{round} {race}: {result}, {points} pts',
    'profile.place': 'P{pos}',
    'profile.stripLegend': 'Gold = win, silver = podium, shaded = points. Click a box to see that round’s results.',
    'profile.born': ' · Born {date}',
    'profile.age': ' (age {age})',
    'profile.titles': 'World titles',
    'profile.wins': 'Wins',
    'profile.podiums': 'Podiums',
    'profile.poles': 'Poles',
    'profile.polesNote': 'Qualifying data from 1994',
    'profile.starts': 'Starts',
    'profile.seasons': 'Seasons',
    'profile.seasonsNote': 'Incl. practice-only',
    'profile.seasonResults': '{season} results by round',
    'profile.history': 'Career history',
    'profile.debut': ' (debut {year})',
    'profile.season': 'Season',
    'profile.team': 'Team',
    'profile.finalPos': 'Final pos.',
    'profile.teamDrivers': '{season} drivers: ',
    'profile.teamTitles': 'Constructors’ titles',
    'profile.teamTitlesNote': 'Since 1958',
    'profile.races': 'Races',
    'profile.firstEntry': 'First entered {year}',
    'profile.seasonPoints': '{season} points by round',
    'profile.teamBarTip': 'R{round} {race}: {points} pts, best P{best}',
    'profile.teamHistory': 'Constructors’ standings history',
    'profile.noTeamHistory': 'No constructors’ standings (the championship began in 1958).',
    'profile.failed': 'Failed to load: {msg}',
    'profile.failedHint': 'This may be a network problem or the API may be busy. Please try again later.',

    'tabs.circuits': 'Circuits',
    'circuits.title': '{season} circuits',
    'circuits.hint': 'Click a circuit for its country, history, track guide, tyres and weather',
    'circuits.loading': 'Loading circuit guides…',
    'circuits.noInfo': 'No guide for this circuit yet',
    'circuit.link': '🏟 Circuit guide →',
    'circuit.page': 'F1 Circuit',
    'circuit.title': '{name} · F1 Circuit',
    'circuit.back': '← Back to {season} calendar',
    'circuit.length': 'Lap length',
    'circuit.km': '{n} km',
    'circuit.turns': 'Corners',
    'circuit.turnsCount': '{n} corners',
    'circuit.laps': 'Race laps',
    'circuit.raceDistance': 'about {n} km',
    'circuit.firstGP': 'First F1 race',
    'circuit.direction': 'Direction',
    'circuit.dir.cw': 'Clockwise',
    'circuit.dir.acw': 'Anticlockwise',
    'circuit.dir.fig8': 'Figure of eight',
    'circuit.type': 'Type',
    'circuit.type.permanent': 'Permanent',
    'circuit.type.street': 'Street circuit',
    'circuit.type.hybrid': 'Semi-street',
    'circuit.ratings': 'Track character',
    'circuit.rating.tyreStress': 'Tyre stress',
    'circuit.rating.downforce': 'Downforce level',
    'circuit.rating.overtaking': 'Ease of overtaking',
    'circuit.ratingsNote': 'Scored 1–5; a rough guide by this site.',
    'circuit.countryHistory': 'Country & history',
    'circuit.trackGuide': 'Track guide',
    'circuit.sectors': 'The three sectors',
    'circuit.sector': 'S{n}',
    'circuit.features': 'Key features',
    'circuit.tyres': 'Tyres',
    'circuit.tyreRange': 'Typical selection: ',
    'circuit.tyreRange.hard': 'harder end of the range',
    'circuit.tyreRange.mid': 'middle of the range',
    'circuit.tyreRange.soft': 'softer end of the range',
    'circuit.lastTyres': 'What teams actually did here in {year}',
    'circuit.compoundsUsed': 'Compounds used: ',
    'circuit.winnerStrategy': 'Winner {driver}’s strategy: <b class="ty-strat">{strategy}</b> ({stops})',
    'circuit.fullTyreChart': 'Full tyre strategy chart →',
    'circuit.noTyreData': 'No tyre data for this circuit yet (available from 2023).',
    'circuit.weather': 'Weather',
    'circuit.forecast': 'Race weekend forecast',
    'circuit.forecastNote': 'Forecast by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>, shown in the circuit’s local dates.',
    'circuit.rainChance': '{n}% chance of rain',
    'circuit.thisSeason': '{season} season · Round {round}',
    'circuit.notThisSeason': 'There is no race here in the {season} season.',
    'circuit.viewResults': 'View this round’s results →',
    'circuit.viewSchedule': 'View this round’s timetable →',
    'circuit.winners': 'Recent winners',
    'circuit.winnersEmpty': 'No past winners found.',
    'circuit.year': 'Year',
    'circuit.map': 'View on Google Maps →',
    'circuit.mapTitle': 'Track map',
    'circuit.mapStart': 'Start / Finish',
    'circuit.mapStraight': 'Straight {km} km',
    'circuit.mapLegendStraight': 'Straights',
    'circuit.mapLegendArrow': 'Racing direction',
    'circuit.mapAria': 'Track map of {name}',
    'circuit.mapLegendCorner': 'Official corner numbers',
    'circuit.mapLegendSectors': 'Timing sectors S1 / S2 / S3',
    'circuit.mapNote': 'North is up. Track outline from <a href="https://github.com/bacinger/f1-circuits" target="_blank" rel="noopener">bacinger/f1-circuits</a> (MIT licence); straights and their lengths are calculated automatically from the outline and are approximate.',
    'circuit.mapTimingNote': 'Corner numbers from <a href="https://multiviewer.app" target="_blank" rel="noopener">MultiViewer</a> (unofficial). The timing line and sector boundaries are worked out from the timing and car positions of the fastest race laps in {year} (via <a href="https://openf1.org" target="_blank" rel="noopener">OpenF1</a>), accurate to within a few tens of metres.',
    'circuit.mapNoTiming': 'No corner numbers or timing sectors for this circuit yet (they become available after a race has been held here).',
    'circuit.noStory': 'No guide for this circuit yet. You can add one in <code>data/circuits.json</code>!',
  },
};

/**
 * 取得翻譯文字。找不到時退回中文，再找不到就回傳 key 本身（方便發現漏翻）。
 * 注意：回傳值會直接放進 innerHTML，所以傳進來的「外部資料」要先 esc()。
 */
export function t(key, vars = {}) {
  const value = DICT[lang][key] ?? DICT.zh[key];
  if (value == null) return key;
  if (typeof value === 'function') return value(vars);
  if (typeof value !== 'string') return value;
  return value.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * 把 HTML 裡固定的文字換成目前語言：
 *   data-i18n="key"            → 換 textContent
 *   data-i18n-html="key"       → 換 innerHTML（只用在字典裡自己寫的 HTML）
 *   data-i18n-attr="title:key;aria-label:key" → 換屬性
 * 也會加上切換語言的按鈕（[data-lang-toggle]）。
 */
export function applyStatic(root = document) {
  document.documentElement.lang = HTML_LANG[lang];
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
  root.querySelectorAll('[data-lang-toggle]').forEach((btn) => {
    const other = lang === 'zh' ? 'en' : 'zh';
    btn.textContent = t('lang.switch');
    btn.title = t('lang.switchTitle');
    btn.setAttribute('lang', HTML_LANG[other]);
    btn.addEventListener('click', () => setLang(other));
  });
}
