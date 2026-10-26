# ClipPay 演示视频脚本（P0-6）

> 时长 3:00 · 英文旁白（约 430 词，每分钟 145 词左右）· 1080p 或以上，16:9
> 线上：<https://clippay.hr.edu.kg> · 仓库：<https://github.com/fdddf/clippay>
> 配套 deck（10 页，可下载 PPTX / PDF）：<https://claude.ai/artifact/TP72iKFWvUCQPgvMxvBcGR>（默认私有，提交前在页面的 Share 菜单里开启分享）。第 10 页的团队信息是占位符，需要填写。

## 已渲染的版本

已上传到 YouTube（不公开，有链接即可观看）：<https://youtu.be/f8TsMh9pCKw>，上传配置在 [video/youtube.yaml](../video/youtube.yaml)（`tubectl upload youtube.yaml`，含字幕、章节和缩略图）。

`video/` 里有一个自动生成的版本（2:22，1080p）：用无头 Chrome 在线上网站真实操作录屏，旁白由本地 Kokoro（am_liam）生成，Remotion 合成字幕和结尾的架构动画。做法和重新生成的命令见 [video/README.md](../video/README.md)。产物在 `video/out/`（不进 git）：`clippay-demo.mp4` 和字幕 `clippay-demo.srt`。

和下面手动录制方案的区别：创作者用 Chrome 的虚拟 passkey 认证器签名（钱包创建、提交、到账、提现都是真实的测试网交易）；品牌建活动用开发环境的只读预览，停在 Review 页，没有真的用 Freighter 签名。旁白相应改成"One signature in Freighter puts the budget in escrow"，画面不显示签名过程。如果想展示真实的 Freighter 签名，可以按下面的方案手动补录第 5 段。

## 录制前准备（预计 30 分钟）

数字会随时间变化（模拟播放量每分钟都在涨），旁白里不念具体金额，只念屏幕上能看到的结构。

**两个浏览器窗口，分别登录两个角色：**

| 窗口 | 角色 | 准备 |
|---|---|---|
| A：Chrome，装 Freighter | 品牌 | Freighter 切到 **Testnet**，账户用 [Friendbot](https://lab.stellar.org/account/fund?$=network$id=testnet) 充值（10,000 XLM）。在 ClipPay 点 **Sign in → I run a brand → Connect Freighter** 登录一次。 |
| B：Safari 或另一个 Chrome 配置 | 创作者 | **不要提前登录**。录制时现场创建 passkey 钱包，这是视频的亮点之一。 |

**提前 30 分钟做一次彩排，同时为提现镜头准备余额：**

1. 在窗口 B 打开 Kitebase 活动（`/c/2`，1.20 XLM / 1k，每分钟约 0.7 XLM 进账）→ **Sign in & join** → **Create a wallet**（填一个设备名）→ **Create wallet** → 按页面上的标签发一个 YouTube Shorts 链接（任何链接都可以，测试网用的是模拟播放量，不检查标签）→ 提交。
2. 等 5 分钟以上，钱包余额超过 2 XLM（testanchor 单笔提现范围是 1–10 XLM）。
3. 用这个钱包录第 6 段（收入和提现）。第 3 段的"现场创建钱包"可以在另一个浏览器配置里重新创建一次，或者直接剪进彩排时录下的创建过程。

**其它：**
- 浏览器缩放 110%，关掉书签栏和其它扩展的图标，系统切到浅色模式（暗色模式可以在结尾闪一下）。
- 每个镜头单独录，后期拼接；签名和等待上链的地方剪掉等待时间，但保留 `TxProgress` 的四步进度条闪过。
- 品牌建活动请用小额（如 50 XLM），避免把演示账户的余额用光。

## 分镜与旁白

### 1 · 问题（0:00–0:20）· Landing 首屏

画面：打开 `/`，停在首屏，鼠标慢慢移到右侧的"Featured campaign"和"Latest payouts"。

> Brands already pay creators per thousand views to clip and post about their products. But the money moves badly both ways. Brands prepay agencies and hope the views are real. Creators — mostly in Latin America, Southeast Asia and Africa — wait weeks to get paid and lose a slice to PayPal and wire fees, if they can get paid at all.

### 2 · 方案（0:20–0:40）· Landing 指标与信任区

画面：滚动到"Live on Stellar testnet"指标条，点 **Check every number on-chain** 打开合约（新标签页闪一下 Stellar Expert），回来再滚到"Three steps"。

> ClipPay fixes both sides. A brand locks its budget in a Soroban escrow contract and sets a rate per thousand views. Creators post, and the contract pays them as their views are verified — every minute, straight to their wallet. Whatever isn't earned goes back to the brand. Every number on this page is on-chain and checkable.

### 3 · 创作者参加（0:40–1:15）· `/campaigns` → `/c/0`

画面：
1. 点 **Find paid campaigns** → 活动市场，点一下 Platform 筛选，再点 Pixel Harbor 的卡片。
2. 详情页：扫过 Brief 页签，指向右侧参加卡的 **Earn up to** 和 "you keep 95%"。
3. 点 **Sign in & join** → 登录弹窗 → **Create a wallet** → 填设备名 → **Create wallet** → 系统 Face ID / Touch ID 弹窗 → 欢迎说明（一闪而过）。
4. 参加卡出现个人标签 `clippay:xxxxxx #ad`，粘贴帖子链接 → 提交 → `TxProgress` 四步走完 → "我的提交"时间线出现 Submitted。

> Here's the creator side. A creator browses open campaigns, picks one, and sees exactly what to make and how much they can earn. To join, they sign in with Face ID. That creates a smart wallet secured by their passkey — no seed phrase, no extension, and no XLM for fees, because ClipPay sponsors them. They post their clip with their personal tag and paste the link. That's it.

### 4 · 到账与凭证（1:15–1:35）· 同一页面

画面：
1. 点 **Refresh my views**（或剪到一分钟后），时间线变成 Verified → Paid，toast 带 **View receipt**。
2. 切到 **Creators** 页签，展开一个创作者，显示逐笔付款及交易链接。
3. 点 **Share campaign** → 打开分享菜单；新标签页打开 `/api/og/c/0.png` 显示自动生成的分享卡片。

> Views are checked every minute, and each check pays the difference between what the creator has earned and what they've already received — in seconds, for a fraction of a cent. Every payout has a receipt on Stellar. And each campaign gets its own share card, so brands can post the link anywhere.

### 5 · 品牌建活动（1:35–2:10）· 窗口 A，`/new`

画面：
1. **Launch a campaign** → 第 1 步 Brief：填标题，点 **Start from a template** 生成简报，右侧预览卡实时变化。**Continue**。
2. 第 2 步 Budget：预算 50、每千次 1.00、每人上限 10；点 **14 days** 快捷选项；指向计算器（最多可买的播放量、可覆盖的创作者数、创作者实得）。**Continue**。
3. 第 3 步 Review：扫过锁定金额、网络费估算、可退款时间 → **Lock 50.00 XLM & launch** → Freighter 签名 → `TxProgress` → 成功页（分享链接、查看活动）。

> Now the brand. Launching a campaign takes three steps: the brief, with a live preview of what creators will see; the budget, where the calculator shows how many views and creators it buys; and a review of exactly what gets locked, the fees and when the unspent budget can be refunded. One signature in Freighter, and the budget is in escrow.

### 6 · 品牌管理（2:10–2:30）· `/dashboard/campaigns/0`

画面：用 Pixel Harbor 的品牌账户（数据最多）。如果录制账户没有这个活动，就用刚建的活动，但图表会比较空，建议提前一小时建好。扫过 KPI（Spent、Verified views、**Cost per 1k views**、Budget left 与预计耗尽时间）、两张趋势图、创作者列表与状态，指向 **Refund** 和 **Export creators (CSV)**。

> In the dashboard, the brand sees what it actually paid per thousand views, spend and views over time, and every creator's post and status. Posts that break the rules are held with a reason instead of paid. When the campaign ends, the rest of the budget comes back with one click.

### 7 · 收入与提现到银行（2:30–2:50）· 窗口 B，`/dashboard`

画面：
1. Overview（余额、本月收入、最近动态）→ **Earnings**（按活动汇总、逐笔付款）。
2. **Wallet → Cash out to bank**：输入 2 → 显示限额和手续费 → passkey 登录 anchor → 在 anchor 页面填银行信息（testanchor 的测试表单）→ **Confirm with passkey** → 状态进入 pending / completed。

> Creators get their own dashboard with every payout and its receipt. And they can cash out to a bank: ClipPay connects to a Stellar anchor using SEP-45 and SEP-24, the creator confirms with their passkey, and the anchor pays out locally.

### 8 · 架构与结尾（2:50–3:00）· deck 的架构页或 `/security`

画面：切到 deck 第 6 页（架构图），最后停在 landing 首屏和网址。

> Under the hood: a Soroban escrow contract built on OpenZeppelin, passkey smart accounts, sponsored fees, contract events indexed on Cloudflare, and an anchor for cash-out. ClipPay — pay creators for views that actually happen. Try it live on Stellar testnet.

## 出问题时的备选

| 情况 | 处理 |
|---|---|
| Face ID 弹窗没出现或失败 | 换 Touch ID 或手机扫码（浏览器的"使用其它设备"）；或者剪入彩排时录的创建过程 |
| 提交后一分钟内没到账 | 点 **Refresh my views**；仍不行就剪到下一次核验（每分钟一次） |
| Freighter 报网络不对 | Freighter 设置里切 Testnet；页面会提示 "Switch Freighter to Testnet" |
| 提现页 anchor 慢 | testanchor 有时要几十秒，剪掉等待；状态停在 pending 也可以，旁白不提"已到账" |
| 余额不够提现 | 在提现前多等几分钟，或提交到每千次报酬更高的 Kitebase 活动 |

## 上传信息（YouTube / 提交表单）

**标题：** ClipPay — pay creators per verified view, on Stellar (HackMeridian 2026)

**简介：**

```
ClipPay is a pay-per-view creator bounty platform on Stellar.
Brands lock a budget in a Soroban escrow contract and set a rate per 1,000 views.
Creators sign in with a passkey, post a clip, and get paid every minute as views are verified — no seed phrase, no fees.
Unspent budget refunds to the brand. Creators can cash out to a bank through a Stellar anchor (SEP-45 + SEP-24).

Live demo (testnet): https://clippay.hr.edu.kg
Code: https://github.com/fdddf/clippay

0:00 The problem
0:20 How ClipPay works
0:40 Creator joins with a passkey
1:15 Payouts and receipts
1:35 Brand launches a campaign
2:10 Brand dashboard
2:30 Earnings and cash-out to bank
2:50 Architecture
```
