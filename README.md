# 🏁 F1 賽季成績網站

一個會自動更新的 F1 賽季成績網頁，用純 HTML、CSS、JavaScript 寫成，不用任何框架，也不需要 build 步驟。

**功能**
- **總覽**：積分領先者、上一站頒獎台、下一站倒數、前 8 名車手積分走勢圖
- **車手積分 / 車隊積分**：完整積分榜
- **分站成績**：每一站的排位賽（Q1/Q2/Q3 秒數、與竿位的差距）、衝刺賽、正賽（名次、發車位置、名次升降、完賽時間或差距、最快圈、得分）
- **賽程表**：每站所有賽段的時間，自動換算成看網頁的人所在的時區
- **賽季步驟圖**：一眼看出哪些站已經比完、下一站在哪裡。點一下就能跳到該站成績或時間表
- **車手 / 車隊介紹頁**：中文故事、生涯統計、歷年成績
- **賽季下拉選單**：可以切換到 1950 年以後的任何賽季

---

## 🚀 上線到 GitHub Pages（讓家人朋友都能看）

1. 把這個分支合併進 `main`（在 GitHub 開一個 Pull Request，然後按 Merge）。
2. 到 GitHub repo 的 **Settings → Pages**。
3. **Source** 選擇 **GitHub Actions**。
4. 到 **Actions** 分頁，確認 “Deploy to GitHub Pages” 有執行成功（綠色勾勾）。如果還沒開始跑，可以點 “Run workflow” 手動執行。
5. 網址會是 `https://<你的帳號>.github.io/F1/`，把這個網址傳給朋友就可以了。

> 如果 repo 是 private，免費帳號沒辦法用 GitHub Pages，需要先把 repo 改成 public。

之後每次 push 到 `main`，網站都會自動重新部署。另外 GitHub Actions 每 6 小時也會自動抓一份最新資料當作備份。

## 💻 在自己電腦上執行

因為程式用了 ES Modules（`import` / `export`），直接雙擊 `index.html` 打不開，必須透過一個小型網頁伺服器：

```bash
cd F1
python3 -m http.server 8000
# 然後打開瀏覽器，前往 http://localhost:8000
```

---

## 📚 程式架構（學習導覽）

```
F1/
├── index.html            主頁骨架：頁首、步驟圖、分頁按鈕、內容區
├── driver.html           車手介紹頁 (driver.html?id=hamilton)
├── team.html             車隊介紹頁 (team.html?id=ferrari)
├── css/style.css         所有樣式（顏色都放在最上面的 CSS 變數）
├── js/
│   ├── api.js            資料層：呼叫 API、快取、備援
│   ├── utils.js          小工具：時間格式、國旗、車隊顏色、跳脫 HTML
│   ├── main.js           主頁控制：路由 + 五個分頁的畫面
│   ├── timeline.js       賽季步驟圖
│   ├── chart.js          積分走勢圖（手寫 SVG）
│   └── profile.js        車手 / 車隊介紹頁
├── data/stories.json     車手與車隊的中文故事（可以自己編輯！）
├── scripts/snapshot.mjs  由 GitHub Actions 執行，抓一份資料快照
└── .github/workflows/pages.yml   自動部署設定
```

### 建議閱讀順序

1. **`index.html`**：先看頁面骨架。注意分頁按鈕其實就是 `<a href="#drivers">` 這種連結。
2. **`js/api.js`**：資料從哪裡來。重點觀念：
   - `fetch` + `async/await`：怎麼向 API 要資料
   - **請求佇列**：API 有速率限制，所以請求要排隊送出
   - **localStorage 快取**：10 分鐘內重複打開網頁不會重新抓資料
   - **分頁抓取**：API 一次最多回傳 100 筆，所以要分頁抓完再合併
   - **備援**：API 掛掉時改讀 `data/snapshot.json`
3. **`js/main.js`**：資料怎麼變成畫面。重點觀念：
   - **Hash 路由**：網址 `#round/5/qualifying` 就代表「第 5 站排位賽」。點任何連結只是改變網址，`hashchange` 事件觸發後重新畫面，所以上一頁、重新整理、分享網址都能正常運作
   - **樣板字串**：用 `` `...${變數}...` `` 組出 HTML
   - **`esc()` 跳脫**：外部資料放進 HTML 前一定要跳脫，避免 XSS
4. **`js/chart.js`**：不用圖表套件，自己用 SVG 畫折線圖，學習座標換算（scale）。
5. **`js/profile.js`**：`Promise.allSettled` 同時發多個請求，其中一個失敗也不會影響其他資料顯示。

### 資料流程圖

```
使用者打開網頁
   │
   ▼
main.js 讀網址 ?season=2026
   │
   ▼
api.js loadSeason(2026) ──► 快取有效？──是──► 用快取
   │                          │否
   │                          ▼
   │                     呼叫 Jolpica API ──失敗──► 讀 snapshot.json
   ▼
整理成 { races, driverStandings, constructorStandings }
   │
   ▼
main.js render() 依照 #hash 畫出對應的分頁
```

## ✏️ 自己動手改改看

- **新增 / 修改車手故事**：編輯 `data/stories.json`。key 是網址裡的 `id`，例如 `driver.html?id=hamilton` 對應 `"hamilton"`。
- **換主題色**：改 `css/style.css` 最上面的 `--accent`。
- **調整車隊顏色**：`js/utils.js` 的 `TEAM_COLORS`。
- **走勢圖顯示更多車手**：`js/chart.js` 的 `cumulativePoints(data, topN = 8)`。

## 資料來源

[Jolpica F1 API](https://github.com/jolpica/jolpica-f1)：社群維護的免費 F1 資料庫，是舊 Ergast API 的接班人。比賽結束後通常幾小時內就會更新成績。

本站為粉絲專案，與 Formula 1 官方無關。
