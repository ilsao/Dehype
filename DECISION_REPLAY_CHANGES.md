# Decision Replay MVP

## 目前進度

Decision Replay 已完成可操作的基礎事件紀錄原型，現在可以：

- 從 Temu 商品詳細頁建立商品瀏覽紀錄。
- 從 Temu 商品總覽頁點擊商品連結時，立即記錄商品名稱與時間。
- 記錄商品瀏覽順序、商品 ID、商品名稱與可取得的價格。
- 即時顯示目前正在瀏覽的商品與累計停留時間。
- 在切換商品、開啟另一個商品分頁或關閉分頁時結束原商品計時。
- 將 session 與事件保存到 `chrome.storage.local`。
- 透過獨立 side panel 顯示 Timeline、Products Viewed、Intent 與可選的 Gemini analysis。

目前定位是「可執行的 Decision Replay 基礎事件紀錄」，不是完整的購物行為分析或因果推論系統。

## 資料流程

```text
Temu DOM
  -> TemuProductAdapter / ProductInfo
  -> DecisionReplayRecorder
  -> DecisionEvent
  -> content script message
  -> background service worker
  -> chrome.storage.local
  -> side panel broadcast / storage listener
  -> Timeline render
```

既有的 `ProductInfo` 沒有被修改。Replay 使用既有 adapter 的 extraction 結果，另外建立自己的 snapshot 與事件模型。

## 可以從網頁抽取的資料

### 商品詳細頁

Decision Replay 重用 `TemuProductAdapter.extractProductInfo()`。目前可使用的欄位包括：

| ProductInfo 欄位 | Replay 使用方式 | 目前來源 |
|---|---|---|
| `name` | `ProductReplaySnapshot.name` | Temu title selector、`data-testid`、`h1`、metadata fallback |
| `currentPrice` | `ProductReplaySnapshot.currentPrice` | current price selector、`itemprop`、generic price fallback |
| `originalPrice` | `ProductReplaySnapshot.originalPrice` | original price selector、`del`/`s`、generic price fallback |
| `discount` | `ProductReplaySnapshot.discount` | discount selector 與百分比文字 |
| `image` | `ProductReplaySnapshot.image` | product image、`og:image` |
| `description` | `ProductReplaySnapshot.description` | description selector、metadata fallback |
| `stockAmount` | `ProductReplaySnapshot.stockAmount` | stock selector、aria label fallback |

Replay 目前最穩定依賴的資料是：

```text
productId
name
currentPrice
originalPrice
discount?
stockAmount?
description?
image?
url
viewedAt
```

### 商品總覽頁

點擊商品連結時，recorder 不建立第二套 crawler，而是使用既有：

```ts
adapter.isSupportedPage(link.href)
```

只有 href 符合 Temu 商品詳細頁 URL 的 link 才會被視為商品連結，例如：

```text
...-g-123456789.html
```

商品名稱依序從下列位置取得：

1. `aria-label`
2. `title`
3. link 文字
4. `img[alt]`

總覽頁 click event 目前通常只有商品名稱、URL-derived product ID 與 timestamp；價格要等商品詳細頁成功 extraction 後才會補齊。

## Product ID 與 Elem ID

### Replay product ID

Temu 商品詳細頁 URL 中的數字 ID 會轉成：

```text
temu:<id>
```

例如：

```text
https://www.temu.com/ca/ceramic-mug-g-123456789.html
-> temu:123456789
```

如果 URL 沒有符合格式，會使用 URL 與商品名稱的 deterministic hash：

```text
page:<hash>
```

這個 fallback 只保證相同 URL 與名稱下可重現，不代表 Temu 的官方 catalog ID。

### 現有 Elem / ProductElement ID

既有 `ProductElement.id` 仍由 adapter 使用 `data-dehype-element-id` 與 UUID 產生，主要用途是：

- neutralizer 找回原始 DOM。
- rebuilder 插入 neutral replacement。
- persuasion metadata 保存 DOM element reference。

Replay 的 `productId` 與既有 `ProductElement.id` 是不同概念：

- `productId`：商品層級 identity，來自 URL 或 fallback hash。
- `ProductElement.id`：同一份 DOM 中欄位/元素的 local mapping ID。

## DecisionSession 與 DecisionEvent

```ts
interface DecisionSession {
  version: 1;
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  intent?: { budget?: string };
  events: DecisionEvent[];
}
```

```ts
interface DecisionEvent {
  id: string;
  timestamp: number;
  action: DecisionAction;
  productId?: string;
  product?: ProductReplaySnapshot;
  elemId?: string;
  leftAt?: number;
  durationMs?: number;
  tabId?: number;
}
```

目前 side panel 支援輸入並保存：

```text
Intent budget
```

例如 `$30`。

## 可以記錄的事件與 action

### `PRODUCT_CLICK`

商品總覽頁點擊商品詳細頁 link 時立即產生，內容包括商品名稱、URL-derived product ID 與 timestamp。

### `PRODUCT_VIEW`

商品詳細頁成功通過 adapter extraction 後立即產生。Timeline 會先顯示：

```text
Viewing Product A  0s
```

離開時使用相同 event ID 更新 `leftAt` 與 `durationMs`，不會因開始與結束而產生兩筆 view event。

### `ADD_TO_CART`

目前由 document capture click listener 偵測，使用按鈕或 role button 的文字判斷：

```text
Add to cart
Add to bag
加入購物車
加入购物车
```

### `REMOVE_FROM_CART`

目前支援：

```text
Remove from cart
移除購物車
移除购物车
```

### `CHECKOUT`

目前支援：

```text
Checkout
Buy now
立即購買
立即购买
```

### `PRODUCT_CLICK` for variant controls

`select`、radio、checkbox、`role=radio`、`role=option` 或含 variant attribute 的控制項變更，會記錄為 `PRODUCT_CLICK`，並保存可取得的 `data-dehype-element-id`。

## 時間與多分頁機制

### 單一商品頁

```text
商品頁成功 extraction
  -> timestamp / startedAt
  -> 建立 active PRODUCT_VIEW

商品頁離開
  -> leftAt
  -> durationMs = leftAt - timestamp
```

商品總覽頁 click 不會猜測 discount、stock、variant 或價格；這些資料只有在詳細頁由既有 adapter 成功取得後才會加入 snapshot。

### 開啟另一個商品分頁

每個 content script 都會將 event 送到 background。background 依 `sender.tab.id` 加上 `tabId`。

### Action product context

當 `ADD_TO_CART`、`REMOVE_FROM_CART` 或 `CHECKOUT` 發生在有 active product 的詳細頁時，event 會帶入當下的 product snapshot，因此可包含 name、價格、discount、stock、description、image 與 persuasion metadata。

如果 action 發生在 cart 或其他沒有可靠 active product 的頁面，event 仍會保存 action 與 timestamp，但會省略 `productId` 與 `product`，不猜測商品對應。

當新的 tab 產生未完成的 `PRODUCT_VIEW` 時，background 會：

1. 找到其他 tab 尚未完成的 view。
2. 使用新商品 event 的 timestamp 結束舊商品。
3. 直接更新舊商品的 `leftAt` 與 `durationMs`。
4. 通知舊 tab 清除 memory 中的 active view。
5. 保存新商品的 view。

這避免原分頁因為仍然存在而持續計時。

### 關閉商品分頁

content script 會嘗試透過 `pagehide` 收尾；如果 pagehide 沒有及時完成，background 的：

```js
chrome.tabs.onRemoved
```

會依 tab ID 找出未完成 view，寫入 `leftAt` 與 `durationMs`。

### route / SPA 變化

目前 recorder 會監聽：

- `pushState`
- `replaceState`
- `popstate`
- `hashchange`
- `MutationObserver`
- `pagehide`

MutationObserver 只會 debounce 後重新 extraction，不會每個 mutation 建立 event。

## Storage 與 Timeline 刷新

### Storage

session 使用：

```text
chrome.storage.local
key: decisionReplaySession
```

目前 storage 行為：

- session 不存在時自動建立。
- event ID 重複時更新既有 event。
- 最多保留 500 個 events。
- malformed session 會被丟棄並建立新 session。
- service worker restart 後可重新載入 session。

### Timeline 即時刷新

background 儲存 event 後會 broadcast：

```text
DEHYPE_REPLAY_SESSION_UPDATED
```

side panel 透過以下方式更新：

1. `chrome.runtime.onMessage`
2. `chrome.storage.onChanged`
3. 每秒只重新 render UI，以顯示 active view 的即時 duration

每秒 render 不會每秒寫 storage，也不會每秒呼叫 AI。

## Decision Reflection analysis

Replay raw events 會先透過純函式：

```text
DecisionSession
  -> buildDecisionTrace()
  -> deterministic statistics
  -> optional Gemini interpretation
```

`DecisionTrace` 目前計算：

- unique products explored
- total completed product view duration
- per-product total duration
- attention share
- view count
- comparison count
- revisit count
- final product from reliable `ADD_TO_CART` or product-linked `CHECKOUT`
- final price
- budget alignment
- persuasion signal counts by type and product

不完整的 active view duration 不會被當成已完成 decision time；沒有可靠 product ID 的 checkout 也不會被猜測成 final choice。

Gemini 接收包含 deterministic trace 的壓縮 payload，回傳 structured JSON：

- `summary`
- `journeyInsights`
- `attentionInsights`
- `potentialInfluences`
- `reflection`
- `uncertainty`

System prompt 要求 Gemini 只解讀已計算資料，使用 `may have`、`coincided with`、`temporal association` 等不確定語言，不宣稱 persuasion caused a purchase，也不產生 influence score。

Gemini 失敗時，deterministic dashboard 仍可使用，side panel 只顯示 analysis unavailable/error。

## Persuasion 標記

Replay 可保存既有 adapter 偵測到的 persuasion metadata：

```ts
interface PersuasionRecord {
  elemId: string;
  persuasionType: string;
  strength: "rule-detected";
  originalText: string;
  neutralized: boolean;
}
```

目前可由既有 rules 分類的類型包括：

- `countdown`
- `scarcity`
- `social-proof`
- `promotion`
- `gamification`
- `upsell`
- `recommendation`

這些是頁面環境資訊，不是使用者 action。系統不會將它們記錄成 `USER_EXPOSED_TO_PERSUASION`，也不會宣稱 persuasion caused a purchase。

`neutralized` 代表當下 DOM 是否已被既有 neutralizer 加上 suppression/deemphasis marker；它不是因果結果或影響分數。

## Side panel 已完成的顯示功能

目前 side panel 可以顯示：

- session event count
- session started time
- budget intent
- Timeline
- 商品名稱
- product ID 對應的 product event
- current price（若詳細頁取得）
- original price（若詳細頁取得）
- discount 與 stock amount（若詳細頁取得）
- active view 的即時秒數
- 已結束 view 的 duration
- Products Viewed
- 每個商品的累計 view duration
- Reset session
- Optional Gemini analysis
- Decision Reflection dashboard
- KPI cards for products, decision time, comparisons, revisits, final choice, and budget alignment
- Attention Share bars
- Decision Journey sequence
- Price Path when prices are available
- Persuasion Signals Encountered bars
- structured AI reflection sections

Timeline action label 包括：

```text
Viewing
Viewed
Compared
Selected
Removed
Checkout
```

## Gemini analysis

Gemini 只在 side panel 按下 Analyze 時呼叫，不參與事件收集。

送出的 payload 是壓縮資料：

```text
intent
products and optional product facts
view sequence
view duration
user actions
persuasion records
```

不會送出整份 webpage HTML、screenshot、cookie、password、checkout form 或 payment information。

Gemini failure 只會顯示 analysis unavailable/error，Replay collection 仍會繼續。

## Privacy 與效能現況

目前 Replay 不收集：

- password
- cookies
- authentication token
- payment information
- full HTML
- screenshot
- mouse movement
- 每秒 event
- 每個 DOM mutation 的完整內容

目前效能策略：

- MutationObserver 只做 debounce extraction trigger。
- 事件只在有意義的商品/action lifecycle 發生時保存。
- active duration 每秒只在 side panel UI 計算與 render。
- Gemini 不會因為 click 或 mutation 自動呼叫。
- storage 事件數量上限為 500。

## 已完成程度

### 已完成

- [x] DecisionSession / DecisionEvent domain model
- [x] Temu detail page ProductInfo reuse
- [x] 商品 product ID 解析
- [x] 商品總覽頁 click 紀錄
- [x] 商品名稱紀錄
- [x] current/original price snapshot
- [x] optional discount/stock/description/image snapshot enrichment
- [x] action event product context when active product is reliable
- [x] analysis payload optional product context
- [x] 商品 view event
- [x] 即時 active view 顯示
- [x] dwell duration
- [x] 新商品分頁切換時結束舊 tab view
- [x] 關閉 tab 時結束 view
- [x] Add to Cart 基礎文字偵測
- [x] Remove from Cart 基礎文字偵測
- [x] Checkout 基礎文字偵測
- [x] chrome.storage.local persistence
- [x] event upsert / duplicate protection
- [x] side panel 即時 broadcast refresh
- [x] local replay payload builder
- [x] optional Gemini analysis
- [x] deterministic DecisionTrace metrics
- [x] attention share and comparison/revisit metrics
- [x] budget alignment and final-choice detection without guessing
- [x] persuasion signal aggregation
- [x] structured Gemini Decision Reflection output
- [x] Decision Reflection dashboard charts and KPI cards
- [x] existing neutralizer/rebuilder compatibility

### 尚未完整完成

- [ ] 真實 Temu 登入後商品列表與詳細頁的全面 DOM/selector 驗證
- [ ] cart page 的商品 item 到 product ID mapping
- [ ] checkout page 的可靠 product ID 保留
- [ ] 多商品 cart 的每個 item action mapping
- [ ] Add to Cart / Checkout 的 stable data attribute detection
- [ ] 多 tab 的 session grouping / window grouping
- [ ] `tabId` 以外的永久瀏覽 context identity
- [ ] variant option value 的結構化保存
- [ ] ProductInfo 未明確可靠的其他 context 欄位
- [ ] 真正的 product card price extraction
- [ ] 真實 Chrome end-to-end workflow test
- [ ] 完整 replay history / 多 session 管理
- [ ] causal inference 或 influence score

## 已驗證狀態

目前 repository 驗證結果：

- Full tests：89 passed
- TypeScript typecheck：passed
- ESLint：passed
- Production build：passed
- Manifest/build validation：passed

測試已覆蓋：

- product ID 解析
- ProductInfo extraction contract
- product click event
- active PRODUCT_VIEW
- view event duration update
- cross-tab view stop logic
- closed-tab storage finalization
- session validation
- event upsert
- replay analysis payload sequence
- optional snapshot field propagation
- action context propagation
- no guessed productId for cart/checkout actions
- deterministic DecisionTrace metrics
- structured Gemini analysis parsing and failure handling
- Decision Reflection payload context
- existing neutralizer/rebuilder behavior

真實 Temu end-to-end 測試仍受登入/verification、地區與頁面可用性影響，不能將 fixture tests 等同於完整 production DOM 驗證。

## 主要檔案

### Shared

- `extension/src/shared/decisionReplay.ts`
- `extension/src/shared/decisionReplay.test.ts`

### Content

- `extension/src/content/decisionReplayRecorder.ts`
- `extension/src/content/decisionReplayRecorder.test.ts`
- `extension/src/content/index.ts`

### Background

- `extension/src/background/decisionReplayStorage.js`
- `extension/src/background/decisionReplayStorage.test.js`
- `extension/src/background/decisionReplayStorage.close.test.js`
- `extension/src/background/decisionReplayAnalysis.js`
- `extension/src/background/background.js`

### UI

- `extension/src/sidepanel/decisionReplay.html`
- `extension/src/sidepanel/decisionReplay.css`
- `extension/src/sidepanel/decisionReplay.js`

### Existing integration points

- `extension/src/adapters/productAdapter.ts`
- `extension/src/adapters/temuProductAdapter.ts`
- `extension/src/shared/productInfo.ts`
- `extension/src/content/inlineRebuilder.ts`
- `extension/manifest.json`
- `vite.config.ts`
