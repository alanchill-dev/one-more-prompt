import type { SessionQuotaResponse } from "@/bindings"
import { fixturePoint, fixtureWorkdayMinutes } from "./fixture-trend"
import { mergeCostLines, type PromptUsageCostLine } from "@/lib/prompt-usage-cost"
import type { PromptUsageAgent, PromptUsageProject, PromptUsageSession, PromptUsageTokens, PromptUsageTurn } from "@/lib/prompt-usage"
export { getGuideProjects } from "./localized-projects"

// Synthetic practice history; illustrative prices never touch native Codex data or caches.
const exampleRates = {
  "gpt-6.1-sol": { input: 2, cacheRead: 0.1, output: 10 },
  "gpt-6-astra": { input: 1, cacheRead: 0.1, output: 4 },
  "gpt-6-luna": { input: 0.4, cacheRead: 0.04, output: 1.6 },
} as const
type Model = keyof typeof exampleRates
type Fees = NonNullable<PromptUsageTurn["costBreakdown"]>
type SessionSpec = { id: string; title: string; days: number; hour: number; total: number; prompts: string[] }
const models = Object.keys(exampleRates) as Model[]
const frozenNow = new Date()
const dayAnchor = new Date(frozenNow)
dayAnchor.setHours(0, 0, 0, 0)
export const FEATURED_SESSION_ID = "story-homepage"
export const FEATURED_PROMPT_ID = "story-homepage-responsive"
function time(days: number, hour = 0, minute = 0) {
  const value = new Date(dayAnchor)
  value.setDate(value.getDate() - days)
  value.setHours(hour, minute, 0, 0)
  return value
}
const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
export const DEMO_NOW = time(0, 17, 40).getTime()
export const DEMO_DAY_KEY = dateKey(time(11))
export const DEMO_DAY_ISO = time(11).toISOString()
const sumTokens = (items: readonly { tokens: PromptUsageTokens }[]) => items.reduce<PromptUsageTokens>((sum, item) => ({
  totalTokens: sum.totalTokens + item.tokens.totalTokens, inputTokens: sum.inputTokens + item.tokens.inputTokens,
  cachedInputTokens: sum.cachedInputTokens + item.tokens.cachedInputTokens, outputTokens: sum.outputTokens + item.tokens.outputTokens,
  reasoningOutputTokens: sum.reasoningOutputTokens + item.tokens.reasoningOutputTokens,
}), { totalTokens: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 })
const sumFees = (items: readonly { costBreakdown?: Fees | null }[]) => items.reduce<Fees>((sum, item) => ({
  inputUsd: sum.inputUsd + (item.costBreakdown?.inputUsd ?? 0), cacheReadUsd: sum.cacheReadUsd + (item.costBreakdown?.cacheReadUsd ?? 0),
  cacheWriteUsd: 0, outputUsd: sum.outputUsd + (item.costBreakdown?.outputUsd ?? 0),
}), { inputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, outputUsd: 0 })
function agent(id: string, model: Model, total: number, seed: number, name = "Main Agent", role: string | null = null): PromptUsageAgent {
  const outputTokens = Math.round(total * [0.026, 0.012, 0.048, 0.018, 0.035][seed % 5])
  const inputTokens = total - outputTokens
  const cachedInputTokens = Math.round(inputTokens * [0.72, 0.86, 0.43, 0.91, 0.63, 0.78][seed % 6])
  const ordinaryInput = inputTokens - cachedInputTokens
  const tokens = { totalTokens: total, inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens: Math.round(outputTokens * [0.35, 0.58, 0.22][seed % 3]) }
  const rates = exampleRates[model]
  const costBreakdown = { inputUsd: ordinaryInput / 1e6 * rates.input, cacheReadUsd: cachedInputTokens / 1e6 * rates.cacheRead, cacheWriteUsd: 0, outputUsd: outputTokens / 1e6 * rates.output }
  const costUsd = costBreakdown.inputUsd + costBreakdown.cacheReadUsd + costBreakdown.outputUsd
  const costLine: PromptUsageCostLine = { model, tokens: { input: ordinaryInput, cacheRead: cachedInputTokens, cacheWrite: 0, output: outputTokens }, rates: { ...rates, cacheWrite: null }, fees: costBreakdown, costUsd, estimationStatus: "current_rate", observedAt: frozenNow.toISOString(), issues: [] }
  return { id, kind: role ? "subagent" : "main", name, role, tokens, models: [{ name: model, ...tokens, reasoningEfforts: [seed % 4 === 0 ? "xhigh" : seed % 3 === 0 ? "medium" : "high"] }], costBreakdown, costUsd, costLines: [costLine], estimationStatus: "current_rate" }
}
function session(spec: SessionSpec, seed: number): PromptUsageSession {
  const followups = [
    ["補充一下，窄視窗的返回按鈕也請一起檢查。", "第二版我看過了，這次請把交接需要的內容整理給同事。"],
    ["再確認一次，這個操作不應改到原始檔。", "暫時先停在這裡，實機長時間測試結果回來後再調整。"],
    ["現場回報的這組資料也請比對看看，沒有量到的部分直接標明。", "請保留設備離線時的最後更新時間，方便現場人員判斷。"],
    ["這個差異先列為觀察，還不夠支持原因判斷。", "再附一份查詢範圍與樣本數，讓同事能重算。"],
    ["剛試過快速重開的情境，結果可以；取消那條路徑再確認一次。", "請把維護時需要手動處理的步驟留在交接裡。"],
    ["這份對我來說太長了，保留可以直接執行的部分就好。", "我先照這份安排試一週，之後再看哪些地方需要改。"],
    ["這次的方向比較清楚了，先保留這一版做人工檢查。", "再把小視窗與長文字的限制整理出來，避免只看展示畫面。"],
  ][Math.floor(seed / 9)]
  const desiredCount = [5, 6, 7, 8, 9, 10][seed % 6]
  const prompts = [...spec.prompts]
  if (spec.id === FEATURED_SESSION_ID) prompts.splice(5, 0, ...prompts.splice(7, 1))
  if (spec.id !== FEATURED_SESSION_ID) {
    while (prompts.length > desiredCount) prompts.splice(1, 2, `${prompts[1]}\n\n${prompts[2]}`)
    prompts.push(...followups.slice(0, Math.max(0, desiredCount - prompts.length)))
  }
  // Moving the featured workday into the month must not multiply its original usage.
  const total = spec.total * (spec.days >= 7 && spec.days !== 11 ? 3 : 1)
  const weights = prompts.map((_, index) => [0.55, 1.48, 0.82, 2.1, 0.39, 1.17, 0.71, 0.9, 1.35, 0.52][(index + seed) % 10])
  const weightTotal = weights.reduce((sum, value) => sum + value, 0)
  const sizes = weights.map(value => Math.round(total * value / weightTotal))
  sizes[sizes.length - 1] += total - sizes.reduce((sum, value) => sum + value, 0)
  if (spec.id === FEATURED_SESSION_ID) sizes.splice(0, sizes.length, 460000, 1280000, 730000, 1920000, 2150000, 18000000, 840000, 2720000, 1460000, 940000)
  let minute = (seed * 13) % 28
  const turns = prompts.map((prompt, index): PromptUsageTurn => {
    const featured = spec.id === FEATURED_SESSION_ID && index === 5
    const id = featured ? FEATURED_PROMPT_ID : `${spec.id}-${index + 1}`
    const start = spec.id === FEATURED_SESSION_ID ? time(11, 0, [452, 469, 491, 506, 519, 542, 585, 608, 646, 678][index])
      : spec.days === 11 ? time(11, 0, fixtureWorkdayMinutes[spec.id][index]) : spec.days === 0 ? time(0, spec.hour, Math.round(index * (spec.hour === 16 ? 70 : 120) / (prompts.length - 1))) : time(spec.days, spec.hour, minute)
    const total = sizes[index]
    const multi = featured || (seed + index) % 5 === 1
    const mainSize = multi ? Math.round(total * (featured ? 0.55 : 0.68)) : total
    const secondSize = featured ? Math.round(total * 0.25) : total - mainSize
    const agents = [agent(`${id}-main`, featured ? "gpt-6.1-sol" : models[(seed + Math.floor(index / 3)) % 3], mainSize, seed + index)]
    if (multi) agents.push(agent(`${id}-worker`, featured ? "gpt-6-astra" : "gpt-6-luna", secondSize, seed + index + 1, featured ? "響應式版面" : "實作與回歸", "worker"))
    if (featured) agents.push(agent(`${id}-review`, "gpt-6-luna", total - mainSize - secondSize, seed + index + 2, "鍵盤與視覺檢查", "reviewer"))
    const duration = spec.id === FEATURED_SESSION_ID ? [675, 980, 640, 610, 1130, 2160, 1090, 1700, 1510, 480][index] : 145 + ((seed * 131 + index * 277) % (spec.days === 0 ? 750 : 1190))
    const missingTime = !featured && (seed * 8 + index) % 47 === 13
    const interrupted = !featured && (seed * 8 + index) % 89 === 37
    minute += Math.ceil(duration / 60) + [3, 7, 2, 11, 5][(seed + index) % 5]
    return { id, prompt, startedAt: start.toISOString(), completedAt: missingTime ? null : new Date(start.getTime() + duration * 1000).toISOString(), timeLabel: start.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), model: agents[0].models[0].name, reasoningEfforts: agents[0].models[0].reasoningEfforts, tokens: sumTokens(agents), agents, isActive: false, interrupted, tokenUsageRecorded: true, costUsd: agents.reduce((sum, item) => sum + item.costUsd!, 0), costBreakdown: sumFees(agents), costLines: mergeCostLines(agents), estimationStatus: "current_rate", quotaObservation: null }
  })
  return { id: spec.id, title: spec.title, createdAt: turns[0].startedAt, updatedAt: turns.map(turn => turn.completedAt ?? turn.startedAt!).sort().slice(-1)[0], promptCount: turns.length, isActive: false, codexOrder: seed, turns, descendantThreadIds: turns.flatMap(turn => turn.agents.filter(item => item.kind === "subagent").map(item => item.id)), costUsd: turns.reduce((sum, turn) => sum + turn.costUsd!, 0), costBreakdown: sumFees(turns), costLines: mergeCostLines(turns), estimationStatus: "current_rate" }
}
const s = (id: string, title: string, days: number, hour: number, total: number, prompts: string[]): SessionSpec => ({ id: `story-${id}`, title, days, hour, total, prompts })
const data: { id: string; name: string; sessions: SessionSpec[] }[] = [
  { id: "story-product", name: "禾頁產品網站", sessions: [
    s("homepage", "首頁改版", 11, 7, 30500000, [ "先看現有首頁的資訊層級。我們做的是小型團隊的訂閱服務，訪客現在要捲兩屏才知道產品做什麼。先提出內容順序，暫時不要改程式。",
      "首屏保留『把散落的工作，整理成下一步』，副標說明團隊協作即可。請把三個同樣醒目的按鈕收斂成一個主要入口。",
      "可以，先完成桌面版。價格段落放在功能之後，客戶案例不要用輪播，讓人能直接比較。",
      "首屏現在空白偏多。請縮短標題與示意畫面的距離，但保留區塊之間的節奏；視窗 1440 與 1280 都需要檢查。",
      "功能區的三張圖大小不一致，請統一內容基線。第二張圖可以裁切外圍空白，不要把整張圖硬縮小。",
      "導覽列在平板寬度剛好擠成兩行。請找出實際換行點，再決定何時收合選單，不要只依裝置名稱切版。",
      "接著處理手機版：先保留『問題 → 使用方式 → 成果』的敘事順序，案例改為單欄。320px、390px 和橫向平板都要能讀。",
      "請完成首頁的響應式版面，並檢查鍵盤操作。\n\n1. 主要按鈕不能在窄視窗被擠到下一列。\n2. 手機選單開啟後，焦點留在選單內；關閉時回到原按鈕。\n3. 降低動態效果的使用者應看到穩定的畫面。\n\n版面實作與無障礙檢查可以分開進行，最後合併驗證，並附上桌面、平板和手機的截圖。",
      "390px 的按鈕間距可以了，但頁尾焦點框被 overflow 裁掉。請一起檢查跳至主要內容連結，修好後再跑一次鍵盤流程。",
      "這版可以。請整理改動、已測尺寸和剩餘限制，再產出一份可供同事檢查的預覽。", ]),
    s("checkout", "結帳流程與付款重試", 11, 9, 4900000, [ "客服收到幾筆重複扣款疑慮，先追結帳從送出到回傳的流程，確認哪些地方可能重複建立訂單。",
      "先補測試重現：慢速網路下連按兩次付款、付款回應超時，以及重新整理結果頁。",
      "付款請求可以加防重，但不能只把按鈕 disabled。請以訂單識別碼確保後端重試仍然安全。",
      "卡片資料驗證失敗時，收件資訊不該被清空；錯誤訊息要指到欄位，並把焦點放到第一個錯誤。",
      "優惠碼從九折換成免運後，總額有一瞬間跳回原價。請一起更新明細，避免使用者看到不一致金額。",
      "請加入銀行暫時拒絕付款後改用另一張卡的情境，已成立的訂單不能再多建立一筆。",
      "結果頁文案改成『付款確認中』，只有收到成功通知才顯示完成。不要讓查詢中看起來像付款失敗。",
      "再比對測試紀錄與訂單筆數，確認沒有重複交易，然後整理客服可以使用的狀態說明。", ]),
    s("accessibility", "註冊表單鍵盤檢查", 11, 10, 2100000, [ "請只用鍵盤走一次註冊流程，把無法完成或看不出焦點的地方記下來。",
      "密碼顯示切換會重設游標位置，先修這項。切換按鈕也要有可理解的讀屏名稱。",
      "表單送出失敗時，錯誤摘要放在表單前面，連結可以回到對應欄位，別只改邊框顏色。",
      "同意條款目前只能點小方框，請讓文字也可點選，同時保留獨立的條款連結。",
      "縮放到 200% 後，送出按鈕被固定頁尾蓋住了。請調整版面，再檢查 320px 寬度。",
      "驗證信重寄倒數不需要每秒朗讀，僅在可以重寄時通知一次即可。",
      "請以螢幕閱讀器重新走完一次，確認錯誤出現與修正之後都能理解現在狀態。",
      "完成，列出這輪修正和人工檢查項目，未測過的瀏覽器請分開寫。", ]),
    s("search", "搜尋篩選與網址同步", 4, 13, 6400000, [ "商品搜尋的篩選條件重新整理後會消失，請先整理目前網址、元件狀態與請求參數的關係。",
      "類別與排序放進網址，頁碼從 1 開始。搜尋字串需保留空白與中文，不要手動拼接查詢字串。",
      "切換類別應回到第一頁；只改排序時保留其他條件。請先加這兩個測試。",
      "瀏覽器上一頁回到原本搜尋結果時，輸入框和已選篩選要一起恢復。",
      "快速輸入三個關鍵字時，較慢的舊回應覆蓋了新結果，請取消過期請求並確認載入狀態。",
      "無結果時把目前條件列出，提供清除篩選；不要把整個搜尋區藏起來。",
      "請加入含空格、斜線和繁體中文的網址往返測試，並確認分享連結能直接還原同一組結果。",
      "這版結果一致了。整理網址參數規則，再檢查手機篩選面板的返回行為。", ]),
    s("accounts", "團隊邀請與權限", 8, 9, 3800000, [ "邀請信有時會寄給已加入的成員，先檢查邀請狀態與成員資格的判斷。",
      "已接受的邀請不能再次啟用，過期邀請則允許管理員重新寄送。請明確分開兩種狀態。",
      "邀請連結的角色必須從伺服器讀取，不能相信網址裡的 role。",
      "把管理員降為一般成員時，確認團隊仍然至少保留一位管理員。",
      "錯誤訊息不要透露不存在的帳號資訊；可以說明邀請已無效，讓使用者聯繫團隊管理員。",
      "請測試兩位管理員同時撤回同一封邀請，結果應一致且不會重複通知。",
      "成員列表加上邀請中狀態，讓管理員能分辨人還沒加入或只是尚未活躍。",
      "整理權限矩陣與回歸結果，尤其是最後一位管理員保護。", ]),
    s("web-release", "網站版本發佈檢查", 12, 15, 1750000, [ "先比對這輪差異，列出首頁、登入和結帳需要人工檢查的路徑。",
      "預覽環境的付款一律走測試模式，畫面上要有清楚標記，避免誤認正式交易。",
      "請檢查所有導覽連結，行動版選單關閉後捲動位置不要跳回頁頂。",
      "這個標題截斷是字型尚未載入造成的嗎？量一次載入前後的版面位移。",
      "字型保留目前版本，先縮小載入範圍，避免加一整套沒有用到的字重。",
      "再確認搜尋分享連結與邀請信使用正式站點的正確網址。",
      "把已通過與仍需人工檢查的項目分開，先不要發佈。",
      "人工檢查已完成，整理本次更新摘要，文案以使用者看得懂的行為變化為主。", ]),
    s("content", "案例頁內容整理", 19, 10, 940000, [ "這三個案例都在說提升效率，請找出各自真正不同的成果，先提供內容大綱。",
      "第二個案例的重點是交接清楚，不是處理速度。請調整開頭，保留原訪談的限制條件。",
      "數據沒有來源的地方不要補百分比，改成可核對的具體描述。",
      "把導入前後的工作方式並排，避免用太多形容詞堆出成效。",
      "引用只保留一段，其他內容用摘要，不要讓整頁看起來像逐字稿。",
      "手機版小標請短一點，但不能只剩抽象詞。先給兩組文案。",
      "採第二組，案例底部連到相關功能即可，不用每段都放試用按鈕。",
      "請整理成可交給設計的內容稿，標清楚哪些圖片仍缺素材。", ]),
    s("mobile-nav", "手機選單開關行為", 26, 11, 2300000, [ "目前手機選單關閉後，頁面偶爾還不能捲動。請追查鎖定 body 的生命週期。",
      "先用路由切換重現，再加快速開關選單與視窗改寬兩種情境。",
      "修正時把原本的捲動狀態完整還原，不要假設 overflow 原本就是空字串。",
      "選單打開時背景仍能點到連結，請一起處理指標與鍵盤焦點範圍。",
      "按 Esc 關閉要把焦點交回入口；點導覽連結後則移到新頁的標題。",
      "iPhone 橫向時項目超出高度，選單內部可以捲動，外部頁面保持固定。",
      "降低動態設定下直接切換狀態，正常設定保留短暫位移，別加入彈跳。",
      "檢查結果可以，整理觸控、鍵盤與視窗縮放的測試範圍。", ]),
    s("homepage-followup", "首頁上線前細節核對", 0, 9, 2450000, [ "先看同事昨晚留下的預覽回饋，今天只處理看得出差異的版面問題。", "客戶案例的圖片在 1280px 被裁掉標題，請保留文字可讀的範圍。",
      "搜尋引擎預覽仍沿用舊副標，請核對分享圖片與頁面描述。", "手機橫向的按鈕間距可以了，再看文字放大後會不會擠出畫面。",
      "以相同內容重新截桌面和平板預覽，讓同事能直接比較。", "整理這次修正與還沒收到回覆的項目，先交給內容同事確認。", ]),
  ] },
  { id: "story-photo", name: "光盒相片庫", sessions: [
    s("photo-upload", "背景上傳斷線續傳", 11, 9, 4200000, [ "一批 280 張照片在網路切換後停住，請從狀態紀錄判斷是排程中斷還是單一請求卡住。",
      "請保留原檔和雜湊驗證，先不要調高併發。找出同一個資產為什麼重複進入待傳佇列。",
      "把上傳結果與確認完成拆開，只有遠端回讀通過才標成完成。",
      "Wi-Fi 轉行動網路時允許暫停，回到允許的網路後從尚未確認的項目繼續。",
      "取消操作要停止新的排程，已經送出的請求則等結果，避免產生不知道是否成功的狀態。",
      "請用重複資產、斷線與重新啟動的組合做驗證，確認不會漏檔也不會多算已完成數量。",
      "列表上的『等待網路』比『上傳中』準確，請讓狀態文案和實際佇列一致。",
      "先整理本機測試證據，真實雲端與實機的結果另列，不能混在一起。", ]),
    s("photo-index", "相片索引重新整理", 3, 14, 3600000, [ "相片庫重新掃描時會卡住捲動，先量索引、縮圖與列表更新各花多少時間。",
      "先處理主執行緒上重複排序的地方，輸入筆數保持一致再比對前後差異。",
      "索引改為增量更新，但已刪除資產仍需移除，不能只處理新增。",
      "請加入同一天跨時區拍攝的照片，列表日期應依拍攝當地時間呈現。",
      "縮圖暫時拿不到時保留原位置，避免列表一直跳動。",
      "大量資產處理到一半離開頁面，背景工作可以繼續，回來要顯示可信的進度。",
      "重新跑同一組 5000 筆索引，記下總時間與記憶體峰值。",
      "差異確認了，文件只寫實際量到的改善和仍然慢的部分。", ]),
    s("photo-recovery", "備份中斷後的恢復", 7, 10, 5100000, [ "恢復備份會把部分成功資產又傳一次，先畫出本機狀態和遠端確認之間的轉換。",
      "先補重啟情境：資料已送達但尚未寫回本機確認時關閉程式。",
      "恢復時先查遠端是否已存在，找到同一版本後要做內容驗證，不能只比檔名。",
      "如果遠端查詢暫時失敗，保留未確認狀態，不能當成不存在直接重傳。",
      "請把重試次數與最後錯誤留下來，讓使用者知道哪些檔案需要再次嘗試。",
      "加上影片與原始格式的混合批次，不同大小的資產都要驗證。",
      "重複執行恢復三次後總筆數應保持相同，請確認遠端和本機計數。",
      "把恢復規則整理成簡短流程，另外列出必須人工處理的衝突。", ]),
    s("photo-duplicates", "重複照片辨識", 11, 9, 2700000, [ "重複照片先限定完全相同檔案，這一輪不要加入相似畫面判斷。",
      "同檔名不代表同內容，請用內容雜湊，再把大小作為提前排除條件。",
      "兩個相簿引用同一個資產時，只算一份原檔，但保留兩邊的相簿關聯。",
      "建立測試：同圖改檔名、同名不同圖，以及同圖不同壓縮版本。",
      "請把預覽改成『可移除的重複副本』，原始檔必須明確標出。",
      "使用者取消整理時不能修改相簿內容，選取結果也不要寫回正式索引。",
      "處理一批後先重新讀取確認，再更新節省空間的數值。",
      "這輪只提供分析與預覽，移除檔案保持另外確認。", ]),
    s("photo-privacy", "分享照片移除位置", 15, 15, 1450000, [ "請檢查分享出去的照片還帶哪些中繼資料，位置和拍攝日期要分開處理。",
      "預設移除位置，但保留使用者明確選擇保留的選項，分享前要能看懂狀態。",
      "這個操作只產生分享副本，原始相片不能被改寫。",
      "請測試沒有位置、已有位置，以及定位資料格式不完整的檔案。",
      "影片也需要相同保護，先確認現有匯出流程能否保留畫質。",
      "處理失敗時要停止分享並說明原因，不能悄悄退回原檔。",
      "比對分享副本的中繼資料，再核對原檔雜湊沒有改變。",
      "把設定說明縮短成一句：分享前移除拍攝位置，原始檔保持不變。", ]),
    s("photo-download", "原始檔批次下載", 21, 11, 3150000, [ "批次下載需要能中途取消，先看目前的暫存檔和完成檔如何區分。",
      "下載中先使用暫存名稱，驗證通過後再移到目標位置。",
      "請測試磁碟空間不足，錯誤訊息需要說明哪幾個檔案未完成。",
      "重試不能覆蓋使用者已存在的不同檔案，遇到同名時保留兩者或明確詢問。",
      "進度同時顯示已完成檔數與目前檔案大小，不要只靠平均百分比。",
      "取消後清理這次產生的暫存檔，其他批次與既有下載不能受到影響。",
      "用一個大影片和多張小照片測試，確認失敗重試的計數不會增加。",
      "整理測試紀錄並附上下載後的完整性檢查結果。", ]),
    s("photo-albums", "相簿封面與空白狀態", 29, 13, 860000, [ "相簿封面現在每次重新開都換一張，請先確認排序是否穩定。",
      "使用者未指定封面時，採第一張可顯示的照片；刪除該照片後才換下一張。",
      "空相簿不需要巨大的插畫，保留名稱、照片數和加入照片入口。",
      "長名稱可以顯示兩行，但日期與筆數維持一行，避免卡片高度失控。",
      "請檢查深色背景上的封面邊界，使用細線即可，不要加重陰影。",
      "正在同步的相簿要能分辨等待與失敗，狀態不能只有一顆旋轉圖示。",
      "加上零張、一張和大量照片三種預覽，確認排列一致。",
      "採這版，最後核對鍵盤焦點與可點範圍。", ]),
    s("photo-upload-check", "續傳修正後批次驗證", 0, 11, 3700000, [ "昨天的續傳修改已合併，今天用照片和大影片混合批次再跑一次。", "先切換網路，記下每批從等待到恢復的時間，不要只看最後有沒有完成。",
      "這三個重複檔案要共用原始內容，但不同相簿的關聯都必須保留。", "重新開啟後請比對已確認數量與遠端清單，失敗項目不要算成完成。",
      "把兩次結果用相同的起算點比較，另外列出網路條件。", "這批確認一致了，整理給實機測試者的重現步驟與觀察欄位。", ]),
  ] },
  { id: "story-redfish", name: "機櫃監控台", sessions: [
    s("thermal", "溫度感測器更新節奏", 11, 9, 3300000, [ "監控頁每次更新都會閃一下，請先記錄畫面、請求次數與回應時間，暫時不要修改輪詢間隔。",
      "同一顆感測器被兩個元件各查一次，先共用同一份快照，保留讀取失敗狀態。",
      "數值相同時只更新取得時間，圖表不要整張重繪。",
      "感測器值為 null 和讀取超時要分開，不能都顯示成 0°C。",
      "請加入高溫警戒前後的資料，警戒顏色變化要穩定，避免邊界值不停閃。",
      "斷線恢復後先取新快照，再恢復自動更新；不能把舊數值當成即時。",
      "用相同資料流量比較修正前後的請求數，保留量測條件。",
      "整理結果，硬體端尚未驗證的部分直接註明。", ]),
    s("sensor-map", "感測器名稱對應", 2, 10, 2400000, [ "目前進風和出風感測器名稱對不上，先列出資源位置、識別碼和顯示名稱。",
      "不要依列表順序猜位置，請使用資源提供的關聯欄位。",
      "缺少位置資訊時顯示原始識別碼，保留追查入口。",
      "同名感測器需要帶上模組名稱，讓現場人員知道是哪一組。",
      "請補上單位轉換檢查，轉速、百分比與溫度不能共用同一組門檻。",
      "把停用的感測器從即時警戒中移除，但詳情仍能查到停用狀態。",
      "比對兩份測試快照，確認排序變動不會錯配數值。",
      "將欄位對應與未知情況整理給後續整合的人看。", ]),
    s("events", "事件紀錄分頁", 6, 14, 3900000, [ "事件紀錄一多就載入很慢，先確認服務端支援的分頁方式與下一頁連結。",
      "按下一頁要沿用服務端提供的連結，不要自己猜 offset。",
      "新事件進來時不應把正在看的舊頁擠動，顯示有新紀錄的提示即可。",
      "請測試最後一頁、空列表，以及下一頁連結暫時讀取失敗。",
      "嚴重程度篩選應該清楚標出查詢範圍，只在已載入資料篩選不能假裝是全量。",
      "事件時間保留原始時區，顯示時轉為本機時間，詳情可查看原值。",
      "匯出只包含使用者選定範圍，請在下載前列出筆數。",
      "比對頁面加總與測試資料原筆數，再整理錯誤處理規則。", ]),
    s("power", "電力趨勢缺值處理", 13, 9, 2650000, [ "電力圖在資料中斷時畫出一條斜線，看起來像正常下降。請先定義缺值顯示方式。",
      "缺值區間直接斷開，不補成 0，也不要用上一筆一路延伸。",
      "時間格子要固定，收到延遲資料時放回原時間位置。",
      "平均功率只算有效樣本，旁邊顯示採樣涵蓋時間。",
      "請測試跨午夜、夏令時間和相同時間戳重複回應。",
      "有效值太少時不顯示趨勢判斷，改成資料不足的狀態。",
      "游標停在缺值區間時顯示未取得資料，避免跳去很遠的上一筆。",
      "最後核對圖表、摘要與匯出使用同一組樣本。", ]),
    s("device-auth", "登入逾時與重新驗證", 20, 13, 1850000, [ "登入逾時後頁面一直重試請求，請先分辨驗證失敗和設備暫時不可達。",
      "收到未授權回應就停止一般輪詢，顯示重新登入入口。",
      "使用者正在編輯的內容先保留在畫面，不要直接清空整頁。",
      "登入成功後確認權限，再恢復輪詢，不能先送出剛才未完成的修改。",
      "錯誤紀錄只能留下狀態和端點，不可以記錄權杖。",
      "請測試密碼錯誤、憑證問題和權限不足的不同提示。",
      "登出需要清除這次連線狀態，其他設備的登入不應受影響。",
      "整理各狀態的畫面與回復步驟，方便現場測試。", ]),
    s("inventory", "設備清單識別資訊", 28, 11, 1250000, [ "設備名稱太像，先找哪些識別欄位能幫使用者分辨機櫃與模組。",
      "主列表顯示名稱、位置和狀態，序號留在詳情，不要全部塞成同一行。",
      "缺少型號資訊時保留『未提供』，不能沿用前一台設備的快取值。",
      "排序改成自然數字順序，Rack 2 應該放在 Rack 10 前面。",
      "離線設備仍保留最後取得時間，讓人知道狀態有多久沒更新。",
      "請檢查多位元組文字和很長的設備名稱，欄位不能推擠狀態圖示。",
      "詳情複製按鈕保留完整識別碼，畫面截斷不代表複製也截斷。",
      "這輪先完成呈現與排序，不加自動探索功能。", ]),
    s("thermal-followup", "感測器快照回歸比對", 0, 13, 1900000, [ "現場給了新快照，先核對溫度、時間與設備識別碼是否對得上。", "離線期間的空值不要補成零，趨勢圖在這段應該斷開。",
      "這顆風扇的單位是百分比，別用轉速的警戒門檻。", "輪詢恢復後先顯示取得時間，再判斷是否已回到即時狀態。",
      "比對修正前後同一批資料的請求數，保留測試時間窗。", "整理這次可確定的差異，尚未在設備上跑過的項目分開列。", ]),
  ] },
  { id: "story-analysis", name: "營運觀測", sessions: [
    s("funnel", "試用轉換漏斗", 11, 10, 2850000, [ "這週試用註冊上升但付費沒增加，先確認事件定義與重複觸發，別急著解釋原因。",
      "同一個人跨裝置登入後只算一位，匿名與帳號識別的合併規則請列出來。",
      "漏斗時間窗採註冊後七天，最近七天註冊但尚未走完的人要分開。",
      "按流量來源拆開比較，樣本太小的渠道不要排出看似精準的名次。",
      "自然搜尋在手機的第二步流失偏高，請先核對頁面錯誤事件與裝置分布。",
      "給我三張圖：整體漏斗、裝置差異、每週成熟群組，數字要能追到查詢。",
      "報告裡把觀察、可能原因與待驗證事項分開，不要直接說改版造成變化。",
      "請輸出摘要與查詢範圍，附上資料更新時間。", ]),
    s("report", "每週成效報告", 0, 5, 1800000, [ "整理上週完整七天的核心指標，週期從星期一開始，保留與前週的比較。",
      "營收以完成付款計算，取消和退款分開呈現，先核對總額。",
      "新客與回訪客的轉換率都要帶樣本數，不能只比較百分比。",
      "把異常高峰標出，但先查追蹤部署紀錄，避免把補送事件當成真實增長。",
      "第三張圖的兩條線太接近，改為每週差值，保留原數據表。",
      "文字先說最值得注意的兩個變化，再補限制，不需要每個指標都寫一段。",
      "請核對圖表、表格和摘要中的日期與數字一致。",
      "完成，匯出一份可分享版本與一份保留查詢連結的內部版本。", ]),
    s("cohorts", "留存群組比較", 5, 9, 3250000, [ "想比較不同月份註冊的留存，先確認什麼行為算回訪，登入一次不一定代表有使用。",
      "採建立或完成工作作為有效活動，去掉內部測試帳號。",
      "每個群組的第 0 週都從註冊週開始，尚未發生的週不要填 0。",
      "請把不完整的近期群組用淡色或空白表達，避免讀成留存突然歸零。",
      "找出第 2 週差異最大的兩組，再核對當時的產品版本與來源組成。",
      "不要把關聯寫成因果，報告先呈現可確定的差異。",
      "補上每格人數與分母，檢查小群組是否放大了百分比波動。",
      "整理成一頁說明，最後列出下一輪值得追的兩個問題。", ]),
    s("cleanup", "匯入資料日期清理", 10, 14, 1450000, [ "這批資料有三種日期格式，先統計各格式筆數和無法解析的內容。",
      "原始檔保留，清理結果寫入新檔；每筆保留來源列號。",
      "沒有時區的時間先按來源系統設定處理，不要直接當 UTC。",
      "跨午夜後日期不同是合理結果，請不要為了對齊舊報表強制改回去。",
      "重複紀錄依來源識別碼比對，內容不同時列為衝突，不要直接去重。",
      "核對清理前後總筆數、唯一識別碼數和金額總和。",
      "把 14 筆無法解析的資料另列，提供可人工修正的原值。",
      "請輸出清理摘要與欄位規則，讓下一次匯入可以重複使用。", ]),
    s("attribution", "渠道歸因欄位檢查", 17, 10, 2100000, [ "直接流量占比突然提高，先查來源欄位是不是在登入跳轉時被清掉。",
      "整理首次來源與本次造訪來源，兩者不能共用同一個欄位。",
      "外部付款返回不該變成新的獲客來源，請先列出需要排除的自有網域。",
      "測試帶中文活動名稱的網址，解碼後的內容要能完整保留。",
      "沒有同意追蹤的使用者不補猜測來源，保留未知分類。",
      "回溯資料只修正可驗證的紀錄，不能依目前規則推斷過去缺失值。",
      "比較修正前後渠道分布，把資料缺漏和真實變化分開。",
      "用簡單例子說明欄位差異，給行銷團隊確認。", ]),
    s("retention-mail", "回訪郵件實驗分析", 24, 13, 1250000, [ "先檢查實驗分組是否均衡，並確認寄送失敗的人如何計入。",
      "以原始分組分析，不能只挑有開信的人算轉換。",
      "主要指標是七天內完成一次工作，開信率與點擊率放次要。",
      "排除實驗開始前已排定的郵件，避免兩組收到不同數量的提醒。",
      "請算出差異範圍，不要只給一個看起來很精準的提升百分比。",
      "目前樣本不足就直接說不足，不替結果下成功結論。",
      "整理要繼續觀察多久和什麼條件下停止，別反覆挑有利時間點。",
      "把分析假設和資料範圍附在最後，摘要保持一段。", ]),
  ] },
  { id: "story-workflow", name: "團隊自動化", sessions: [
    s("build", "預覽建置排程", 11, 9, 2950000, [ "預覽建置在同一分支連續更新時跑了三次，先追觸發來源和排隊順序。",
      "同一分支只保留最新等待中的工作，已開始的工作要安全取消並留下狀態。",
      "取消不能刪掉上一個可用的預覽，新的完成前仍然提供舊網址。",
      "請區分編譯失敗、上傳失敗與使用者取消，通知不要全部顯示紅色失敗。",
      "快取鍵應包含鎖檔與工具版本，跨版本不能共用編譯產物。",
      "補上快速推三次、工作逾時與取消後重新執行的測試。",
      "預覽成功的訊息只保留最新一則，附上來源提交與完成時間。",
      "整理排程規則與測試結果，這輪先不要加多平台建置。", ]),
    s("calendar", "會議提醒時間校正", 0, 7, 910000, [ "提醒比行事曆早了一小時，先比對事件時區、系統時區和排程時間。",
      "全天事件不應套用一般會議的提前十分鐘規則，請分開處理。",
      "重複會議只有單次異動時，要使用該次的新時間，不要改整個系列。",
      "夏令時間切換週補測試，排程應以事件當地時間計算。",
      "會議取消後移除尚未送出的提醒，已送出的不用追加一串通知。",
      "電腦休眠錯過提醒時，只補近期仍有意義的會議，過去整天的不要一次跳出。",
      "請顯示本次提醒對應的實際時間，讓使用者能自行核對。",
      "確認結果後整理時區案例，保留原始事件資料。", ]),
    s("notifications", "通知去重與靜音", 14, 13, 1400000, [ "同一個工作完成會收到兩則通知，先找出 UI 和背景服務各自送出的位置。",
      "以工作識別碼和狀態去重，不要靠訊息文字相同判斷。",
      "使用者正在看該工作時，可以更新畫面狀態，不必再彈系統通知。",
      "靜音只影響通知，不要停止背景工作或改變成功失敗狀態。",
      "通知標題說明發生什麼事，細節只保留最需要的一項。",
      "請測試取消後重跑、同名工作及重啟後收到延遲結果。",
      "點通知的行為先維持目前設計，不要新增會自動開啟未知位置的流程。",
      "完成，列出使用者能調整的選項和預設值。", ]),
    s("exports", "每日摘要匯出", 18, 10, 2350000, [ "每天的摘要偶爾重複兩份，先檢查排程重啟和檔名生成的關係。",
      "以日期和範圍建立輸出識別，重試寫暫存檔，成功後再取代這次產物。",
      "資料查詢失敗時保留上一份成功檔案，不能輸出一份看似正常的空報告。",
      "摘要日期以設定時區為準，跨午夜執行也要落在同一天的範圍。",
      "請把排程延遲和真正無資料分開，報告上顯示取得時間。",
      "測試關機後補跑，只產出缺少的日期，不覆蓋人工修改過的檔案。",
      "把執行結果整理成簡短日誌，避免記錄報告的私密內容。",
      "確認總筆數與檔案數一致後，留下重試步驟。", ]),
    s("review-bot", "程式碼檢查摘要", 25, 14, 1600000, [ "檢查摘要太長，先把會影響使用者的問題和一般風格建議分開。",
      "每個問題需要具體位置、觸發條件和影響，不能只說可能不安全。",
      "沒有證據的猜測留在待確認，不要和已重現的問題同樣顯著。",
      "同一個根因造成多處症狀時合併說明，避免看起來像十個獨立問題。",
      "已修正的項目不要再次提出，先比對目前差異與測試。",
      "請用這三個範例檢查輸出長度，保留證據但不要逐檔重述。",
      "摘要開頭直接說有幾項需要處理，若沒有發現也要交代檢查邊界。",
      "採這版格式，先保留人工閱讀後再決定是否送出。", ]),
  ] },
  { id: "story-personal", name: "個人生活", sessions: [
    s("travel", "週末山城小旅行", 11, 9, 710000, [ "想安排兩天一夜山城旅行，不租車，先用火車和公車規劃兩種節奏，不用塞滿景點。",
      "我們想下午再出發，第一天留一段可以坐下來喝茶的時間。",
      "步行路段有坡度的請標出，同行的人膝蓋不適，避免連續走長階梯。",
      "如果下雨，第二天換成室內展覽或小店，路線不要來回折返。",
      "住宿先列選擇條件，不用替我訂房：靠近車站、安靜、晚上有地方吃飯。",
      "費用估計分交通、住宿和餐食，沒有確認的票價直接標成待查。",
      "把行程壓成一頁，時間留彈性，最後列出出發前要確認的班次。",
      "這個安排可以，幫我整理行李清單與雨天備案。", ]),
    s("meals", "一週晚餐備料", 3, 18, 350000, [ "下週平日只想煮三次，兩個人吃，先安排能共用食材的晚餐。",
      "週二回家比較晚，需要十五分鐘能完成；週三可以煮一鍋留到隔天。",
      "冰箱還有半顆高麗菜、兩顆馬鈴薯和雞腿，優先用完。",
      "少一點重複的醬油口味，加一道清爽的湯或拌菜。",
      "把採買量換成兩人份，不用寫成精確到一克，給容易購買的單位。",
      "備料步驟按週日能一次完成的順序列出，生熟器具分開。",
      "週四若臨時外食，哪些食材能冷凍保留？",
      "最後整理成採買清單和貼在冰箱上的簡短菜單。", ]),
    s("study", "英文閱讀練習", 6, 19, 480000, [ "想每天用二十分鐘練英文閱讀，程度大約能讀產品文件但長文章容易失去耐心。",
      "先給一段和設計工作有關的短文，生字不要超過六個。",
      "這裡的 trade-off 我能理解，但整句主詞有點找不到，請拆句說明。",
      "先不要給中文翻譯，問三個能確認我看懂內容的問題。",
      "我的第二題回答少了限制條件，請用英文幫我改得自然一點。",
      "用同一組生字換一段不同情境的文章，確認不是只記住原句。",
      "幫我整理今天常漏看的連接詞，搭配各一個簡單例句。",
      "明天繼續這個難度，最後給我五分鐘的複習清單。", ]),
    s("budget", "家庭固定支出整理", 18, 18, 520000, [ "我想把每月固定支出整理清楚，先給分類方式，不需要投資或理財建議。",
      "房租、水電、網路和訂閱分開，年繳費用換算月平均但保留實際繳費月份。",
      "兩個人共同支出和個人支出用不同欄位，不要全部混成一個總額。",
      "不確定的金額留空，避免和確定是零的項目混淆。",
      "請提供可以貼到試算表的欄位與三筆示例，示例明確標示是假資料。",
      "表格右邊加下次到期日，逾期與即將到期用文字也能分辨。",
      "總額只算已填金額，同時顯示還有幾項未填。",
      "整理每月十分鐘更新一次的流程即可，不需要自動串接帳戶。", ]),
    s("reading-list", "閱讀清單與筆記", 22, 20, 290000, [ "我收藏很多文章但很少回看，想用簡單方法分出要讀、讀完和有用的內容。",
      "先不要加標籤系統，只保留主題、來源、狀態和一句自己的筆記。",
      "讀完不代表有價值，另外留一個是否值得回看的欄位。",
      "幫我寫五個閱讀後可以問自己的問題，避免只抄原文摘要。",
      "其中兩題太抽象，改成能連回實際工作或生活的問題。",
      "每週整理只挑三篇，沒讀完的可以刪掉，不要變成新的待辦壓力。",
      "給我一份一頁模板，手機上也能方便輸入。",
      "採這版，清單先保持短小，等真的用一陣子再調整。", ]),
  ] },
  { id: "story-design", name: "介面設計研究", sessions: [
    s("chart", "用量圖表互動原型", 11, 10, 2450000, [ "圖表的浮動卡會蓋住正在看的柱子，先分析指標移動與卡片定位的關係。",
      "每個日期保留完整高度的感應區，讓很小的柱子也能容易選到。",
      "卡片放到柱子側邊，右側空間不足時改左側，圖表本身不要位移。",
      "滑鼠往卡片按鈕移動時會經過其他日期，請設計連續的可操作路徑。",
      "鍵盤焦點也需要同樣詳情，不能只有 hover 能看到。",
      "圖表顏色先依目前期間用量排序，期間切換後的變化要有清楚說明。",
      "請做小視窗和長模型名稱的案例，確認資料與按鈕都完整可讀。",
      "比較這兩種定位後採第二種，整理需要在實際資料驗證的邊界。", ]),
    s("onboarding-notes", "操作導覽敘事草稿", 2, 14, 1200000, [ "新使用者進來不知道先看什麼，先列出完成第一件有價值的事需要哪些資訊。",
      "以『找到某天做了什麼』作為主線，不要把所有按鈕逐一介紹。",
      "每步只留一個主要動作，說明文字要能讓人理解為什麼要做。",
      "缺少歷史紀錄也要能體驗，請安排一組有前後脈絡的示範工作。",
      "對閱讀步驟和實際操作步驟做區別，操作完成後仍由使用者按下一步。",
      "先把說明卡位置畫出來，不能遮住目標或滑鼠前往按鈕的路徑。",
      "返回前一步要保留操作成果，退出則回到自己的工作區。",
      "這輪只確認腳本，動畫與實作下一輪再討論。", ]),
    s("settings-copy", "設定頁文案收斂", 7, 16, 760000, [ "設定頁同一個選項有三段解釋，請先找出重複資訊和容易誤解的名詞。",
      "標題說明控制什麼，輔助文字只說影響，不要重複標題。",
      "『啟用自動更新狀態』太抽象，改成能看懂動作與頻率的文案。",
      "成功提示只保留必要回饋，切換開關已能看到結果就不用再彈一則。",
      "涉及登入或資料存取的項目仍需說明清楚，不能為了簡短刪掉條件。",
      "請用英文版檢查長度，標題不要任意換行或推擠開關。",
      "給我調整前後的對照，逐條說明保留了哪些意思。",
      "這組可以，最後統一標點和用詞，避免同功能有兩種名稱。", ]),
    s("dark-palette", "深色介面層次", 12, 9, 980000, [ "目前所有區塊幾乎一樣黑，請從資訊層級重新規劃底色，不要先加卡片。",
      "Header 維持黑色，工作區用幾種灰分層，橘色只用在選取與主要動作。",
      "中間摘要要比列表深，詳情可以稍亮，分隔線保持細緻。",
      "改底色時文字不要跟著降低透明度，白色和橘色需保持清楚。",
      "請用滿資料和空白狀態都試一次，避免只有展示圖看起來好。",
      "選取列橘色底會讓小字失去對比，請重新量背景與文字搭配。",
      "不同面板盡量貼齊，不要每層再留一圈外距。",
      "保留這版層次，整理色票用途與不能互換的角色。", ]),
    s("empty-states", "空白與錯誤狀態", 21, 15, 690000, [ "目前沒資料、載入失敗和沒有搜尋結果都用同一段話，請先分出狀態。",
      "首次使用說明去哪裡開始，搜尋無結果則顯示目前條件與清除入口。",
      "載入失敗要保留已取得的內容，重試按鈕只重做失敗的查詢。",
      "權限不足時說明如何重新登入，不要顯示像程式錯誤的代碼。",
      "空白畫面不需要大面積裝飾，主要動作必須一眼能找到。",
      "請加入小視窗預覽，錯誤說明不能把重試按鈕推到看不到。",
      "文字改成具體狀態，刪掉『發生未知的問題』這類沒有幫助的句子。",
      "將各狀態與觸發條件整理，確認沒有用假成功掩蓋錯誤。", ]),
    s("palette-review", "圖表配色與辨識檢查", 0, 16, 1400000, [ "配色原型我看過了，今天用模型多、柱子很小的情況檢查辨識度。", "切到三十天後排名會不同，顏色應跟目前用量順序一起更新。",
      "先調整第三個色槽，觀察圖例和整張圖是否同步預覽。", "關閉但沒套用時要回到原來的顏色，不能留下半套修改。",
      "再核對深色背景與鍵盤焦點，色彩不要成為唯一的辨識方式。", "這版先交給同事檢查，留下目前色票與還需人工確認的情境。", ]),
  ] },
]

export const projects: PromptUsageProject[] = data.map((source, projectIndex) => {
  const sessions = source.sessions.map((spec, index) => session(spec, projectIndex * 9 + index))
  return { id: source.id, name: source.name, kind: "project", sessions, sessionCount: sessions.length, updatedAt: sessions.map(item => item.updatedAt!).sort().slice(-1)[0], promptCount: sessions.reduce((sum, item) => sum + item.promptCount, 0), isActive: false, codexOrder: projectIndex }
})
const sessions = projects.flatMap(item => item.sessions)
const turns = sessions.flatMap(item => item.turns)
export const trendPoints = Array.from({ length: 30 }, (_, index) => {
  const day = time(29 - index)
  return fixturePoint(day, turns.filter(turn => dateKey(new Date(turn.startedAt!)) === dateKey(day)), `${day.getMonth() + 1}/${day.getDate()}`)
})
export const hourlyPoints = Array.from({ length: 24 }, (_, hour) => fixturePoint(time(0, hour), turns.filter(turn => {
  const started = new Date(turn.startedAt!)
  return dateKey(started) === dateKey(time(0)) && started.getHours() === hour
}), `${String(hour).padStart(2, "0")}:00`))
export const quotaFixture: SessionQuotaResponse = { dataAsOf: frozenNow.toISOString(), entries: sessions.map((item, index) => ({ threadId: item.id, weeklyPercent: item.id === FEATURED_SESSION_ID ? 20.03 : item.id === "story-checkout" ? 8.35 : index % 9 === 4 ? null : Math.round((0.42 + ((index * 317) % 485) / 100) * 100) / 100, status: index % 9 === 4 ? "unavailable" : index % 7 === 5 ? "partial" : "available" })) }
const totalTokens = turns.reduce((sum, turn) => sum + turn.tokens.totalTokens, 0)
const peak = [...trendPoints].sort((a, b) => b.value! - a.value!)[0]
export const fixtureStats = { projects: projects.length, sessions: sessions.length, prompts: turns.length, agents: turns.reduce((sum, turn) => sum + turn.agents.length, 0), totalTokens, last7Tokens: trendPoints.slice(-7).reduce((sum, point) => sum + point.value!, 0), last30Tokens: totalTokens, activeDays: trendPoints.filter(point => point.value! > 0).length, missingDurations: turns.filter(turn => !turn.completedAt).length, peakDay: dateKey(new Date(peak.startAt!)), peakTokens: peak.value!, featuredDaySessions: sessions.filter(item => item.turns.some(turn => dateKey(new Date(turn.startedAt!)) === DEMO_DAY_KEY)).length, featuredPromptNewestIndex: [...sessions.find(item => item.id === FEATURED_SESSION_ID)!.turns].sort((a, b) => b.startedAt!.localeCompare(a.startedAt!)).findIndex(turn => turn.id === FEATURED_PROMPT_ID) }
function assertFixture(condition: boolean, message: string): asserts condition { if (!condition) throw new Error(`Interactive guide fixture: ${message}`) }
const close = (left: number, right: number) => Math.abs(left - right) < 1e-7
for (const turn of turns) {
  assertFixture(turn.tokens.totalTokens === turn.tokens.inputTokens + turn.tokens.outputTokens, `${turn.id} token sum`)
  assertFixture(turn.tokens.totalTokens === turn.agents.reduce((sum, item) => sum + item.tokens.totalTokens, 0), `${turn.id} agents`)
  assertFixture(close(turn.costUsd!, turn.agents.reduce((sum, item) => sum + item.costUsd!, 0)), `${turn.id} agent costs`)
  assertFixture(close(turn.costUsd!, Object.values(turn.costBreakdown!).reduce((sum, value) => sum + value, 0)), `${turn.id} fee sum`)
}
assertFixture(new Set(turns.map(turn => turn.id)).size === turns.length, "unique prompt identities")
assertFixture(trendPoints.reduce((sum, point) => sum + point.value!, 0) === totalTokens, "chart and prompt token totals")
assertFixture(close(trendPoints.reduce((sum, point) => sum + point.costUsd!, 0), turns.reduce((sum, turn) => sum + turn.costUsd!, 0)), "chart and prompt costs")
assertFixture(trendPoints.every(point => point.value === point.modelUsage!.reduce((sum, item) => sum + item.tokens!, 0)), "model and daily token totals")
assertFixture(fixtureStats.projects === 7 && fixtureStats.sessions >= 42 && fixtureStats.prompts >= 250 && fixtureStats.prompts <= 450, "history richness")
assertFixture(fixtureStats.peakDay === DEMO_DAY_KEY && fixtureStats.featuredDaySessions >= 9, "featured day is peak with overlapping work")
assertFixture(fixtureStats.featuredPromptNewestIndex === 4 && turns.find(turn => turn.id === FEATURED_PROMPT_ID)?.tokens.totalTokens === 18000000, "featured target and list position")
