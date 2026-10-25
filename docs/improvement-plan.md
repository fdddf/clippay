# ClipPay 产品打磨与改进计划

> 版本 v2 · 2026-10-25 18:40 WET（v1：16:40）· 作者：产品负责人（Claude，代拟）
> 状态：执行中。P0 已完成 6/7 项（只差视频和 deck），P1 的限时代码部分已完成。最新进度见[第 8 节](#8-实施顺序与进度)。
>
> 在线演示：<https://clippay.umesok.workers.dev> · 仓库：<https://github.com/fdddf/clippay>

## 0. 这份计划回答什么

ClipPay 目前是一个能在 testnet 上跑通全流程的黑客松 MVP：品牌锁定预算 → 创作者用 passkey 钱包提交作品 → 按验证后的播放量自动结算 → 通过 SEP-24 anchor 提现到银行。

接下来要把它当成一个**商业项目**来打磨。分三个阶段：

| 阶段 | 时间 | 目标 | 成功标准 |
|---|---|---|---|
| **P0 参赛提交** | 现在 → 10/26 12:00（约 19 小时） | 拿到评委能打开、能看懂、能信任的作品 | 公网 URL、演示视频、README/架构文档、链上交易证据齐全；评分维度无明显短板 |
| **P1 试点** | 赛后 2–6 周 | 3 个设计合作品牌在 testnet/小额 mainnet 上真实跑活动 | 合约 v2 上线；真实播放量验证；USDC 支付；SCF 申请提交 |
| **P2 主网 Beta** | 赛后 2–3 个月 | 公开可用的商业产品 | 审计完成；主网部署；生产 anchor；监控和运营手册到位 |

### 依据的官方资料

本计划的技术条目都对照了以下官方资料。条目里用 `[来源]` 标注。

- **[SC-SEC]** Stellar 智能合约安全清单（漏洞类别 1–11、Contract/Client-side checklist）。
- **[DAPP-UX]** Stellar dApp 交易 UX 清单。
- **[MAINNET]** Stellar 主网部署三道关卡（Gate 1–3）。
- **[SEP]** SEP-1 / 10 / 12 / 24 / 38 / 41 / 45 / 46 / 49 / 55；CAP-58 / 67。
- **[OZ]** OpenZeppelin Stellar Contracts：`stellar-access`、`stellar-contract-utils`（Pausable/Upgradeable）、`stellar-accounts`；OZ Relayer (Channels)；OZ Monitor。
- **[SAK]** stellar/smart-account-kit 文档。
- **[SCF]** Stellar Community Fund 评审标准，包括常见红旗和加分项。
- **[CF]** Cloudflare Workers / Durable Objects 最佳实践（部署时使用）。

> **关于文档 MCP：** 本机配置的 `stellar-raven` 和 Cloudflare MCP 需要授权后才能用。要授权，请在终端的 `claude` 里运行 `/mcp`。授权后，实施阶段会用它们复核本计划里引用的 API 细节。在那之前，依据是本机安装的官方技能文档和 developers.stellar.org。

---

## 1. 产品定位（商业视角）

### 1.1 一句话

**按效果付费的创作者赏金平台：品牌只为验证过的播放量付钱，全球创作者几秒钟拿到钱，还能直接提现到本地银行。**

### 1.2 目标客户（ICP）与用户

| 角色 | 是谁 | 核心痛点 | ClipPay 给的价值 |
|---|---|---|---|
| 品牌（付费方） | Web3 项目、移动应用工作室、独立音乐/游戏发行方，已经在付钱给剪辑者/UGC 创作者 | 预付给中介不知道效果；对接海外创作者付款麻烦；刷量 | 预算锁在合约里，只按验证播放量付款，剩余自动退回；全程链上可查 |
| 创作者（收款方） | 拉美、东南亚、非洲的剪辑者和短视频创作者 | 账期长；PayPal 等通道费率高或不可用；不懂加密钱包 | Face ID 登录、零手续费、秒级到账、通过 anchor 提现到本地银行 |
| 平台（我们） | — | 需要可持续收入、低欺诈、低运营成本 | 抽成（见 1.3）；合约托管、无资金池托管风险 |

### 1.3 商业模式（待验证假设）

- **平台费**：结算时从每笔付款中按比例（bps）划给平台金库，比例在合约里可配置。这比按预算预收更公平，也和"只为效果付费"的叙事一致。
- **增值服务（P2）**：高级反作弊验证、多平台聚合数据、品牌数据看板、白标。
- **成本结构**：
  - 每次结算约 0.001 XLM。
  - 创作者入驻的钱包部署租金：testnet 上约 26 XLM，主网需要实测（P1-B6）。
  - 代付手续费：P1 起统一由 relay 承担，计入获客成本（CAC）。

### 1.4 关键指标（北极星 + 漏斗）

- **北极星**：月度结算给创作者的金额（Paid-out GMV）。
- **品牌侧**：活动数、锁定预算、实际千次成本（我们已经在 UI 里展示）、预算消耗率、复购率。
- **创作者侧**：激活数（建钱包）→ 提交数 → 首次到账 → 提现到银行比例；到账时延。
- **风控**：被拒付或判定为刷量的比例；relay 单个用户成本。

### 1.5 竞争与差异

- **参照对象**：现有的 clipping / content rewards 平台（如 Whop Content Rewards）、传统网红中介。
- **差异点**：
  - 资金托管在合约，平台不碰钱；
  - 创作者零门槛（passkey + 代付）；
  - 提现到银行（anchor）；
  - 链上透明的效果账本。
- **短板**：播放量验证依赖平台 API 和反作弊（见 P1-V 系列），这是商业化最大的风险点。

---

## 2. 现状盘点

> 本节是 v1（10/25 16:40）时的盘点，保留作为基线。其中大部分差距已在当天处理，当前状态见第 8 节。

### 2.1 已完成且验证过的

| 能力 | 验证方式 |
|---|---|
| CampaignPool 合约：建活动/补充预算/提交/结算/退款，8 个单元测试 | `cargo test`；testnet 部署 `CCAN5IDE…LP2W` |
| 验证服务：mock / YouTube 两种播放量来源；定时结算 + HTTP 触发 | testnet 实测 |
| `/relay` 手续费代付（与 OZ Relayer `{func, auth}` 协议兼容），白名单 + 费用上限 | 软件 passkey e2e + 真实 Touch ID |
| passkey 智能钱包（smart-account-kit / OZ 智能账户） | 真实 Touch ID 走查 |
| SEP-45 + SEP-24 提现到银行（muxed 地址带 memo） | testanchor 状态 `completed` |
| 首页数据条、三步说明、品牌 "Your campaigns"、创作者进度条、手机宽度、深色模式 | 浏览器走查 |

### 2.2 已知差距（按来源归类）

**合约 [SC-SEC][MAINNET]：**
- 假定代币是 7 位小数；代币不在白名单上。
- 创作者列表是单个持久存储条目里的 `Vec`（最多 200 个）。每次提交都要整体重写，读取也没有分页（漏洞类别 #10：资源耗尽 / 费用攻击）。
- 没有暂停、没有升级路径、没有平台费。
- TTL 只续到 7 天，比长期活动的周期短。
- 没有 SEP-55 可验证构建。

**服务端：**
- 只有单一验证者、单一 sponsor 密钥。
- 没有限流、没有监控告警。
- RPC 事件只保留 7 天，没有索引，历史数据会丢失。
- 播放量即使已经封顶也会继续提交 `settle` 交易，白白花手续费。

**前端 [DAPP-UX]：**
- 合约类型是手写的，没用官方生成的 bindings。
- 品牌端只支持 Freighter。
- 错误提示不完整：用户拒签、余额不足、缺少 trustline、passkey 取消都没有专门的文案。
- 用的是 hash 路由，分享链接不友好。
- 提现前没有读取 anchor 的 min/max 限额。

**工程：**
- 没有 git 历史，没有 CI，没有 lint。
- 配置分散在多份 `.env` 里，同一个合约 ID 写了好几处。
- 没有部署到公网。

**商业：**
- 没有平台费，没有条款和隐私政策。
- 没有广告披露（#ad）检查。
- 没有设计合作伙伴，没有 SCF 申请。

---

## 3. P0：参赛提交（截止 10/26 12:00 WET）

评分权重：赛道契合 20、用户价值 20、技术执行 15、创新 15、本周末进度 10、市场潜力 10、设计/UX 10。异步评审，看的是视频、链接、deck、仓库和提交答卷。

P0 只做**直接影响评分、且 19 小时内能做完**的事。时间按从多到少排序预留。

| # | 事项 | 为什么（评分项） | 验收标准 | 工作量 |
|---|---|---|---|---|
| P0-1 | **git 初始化 + 推到公开 GitHub 仓库** | 硬性要求；"本周末进度"靠提交历史体现 | 公开仓库；`.env` 和密钥不入库；README 齐全 | S |
| P0-2 | **集中配置：`deployments/testnet.json`** 作为合约 ID、wasm hash、代币、智能账户基础设施和 anchor 的唯一来源，web 和 verifier 都从这里读 | [MAINNET] Gate 1 "contract ID location documented"；部署时少出错 | 改一个 ID 只需改一处；`deploy.sh` 写入该文件 | S |
| P0-3 | **公网部署（Cloudflare：静态前端 + Worker/Durable Object 验证服务 + Cron）** | 硬性要求：评委能打开的公网 URL | 公网 URL 能完成：浏览 → passkey 建钱包 → 提交 → 结算 → 提现 | M |
| P0-4 | **演示数据 seed 脚本**：3 个像样的品牌活动（不同费率/上限/截止时间）+ 若干创作者提交 | 设计/UX、用户价值：首页不再出现 example.com 和 e2e 链接 | `pnpm seed` 一键生成；首页有真实感 | S |
| P0-5 | **快速修复（低风险高收益）** | 技术执行、UX | 见下方子项 | S |
| P0-6 | **演示视频（3 分钟）+ Deck（10 页）** | 评审主要材料 | 覆盖问题、方案、现场流程、架构、商业模式、路线图 | M |
| P0-7 | **README / ARCHITECTURE 定稿**：合约 ID、交易证据、信任模型、"本周末新做的内容" | 硬性要求；评审最先看的材料 | 按官方提交要求逐项对照 | S |

**P0-5 快速修复子项：**

- **a. 验证服务跳过无效结算**：`earned == paid`（已封顶或播放量没涨）时不发交易。目前每轮都在浪费手续费，日志里也会出现大量 `paid 0`。
- **b. 提现前读取 anchor 的 SEP-24 `/info`**：显示单笔最小/最大额，并校验输入。testanchor 的范围是 1–10。[SEP-24]
- **c. 错误文案补全**（[DAPP-UX] 清单）：passkey 取消（`NotAllowedError`）、Freighter 拒签、余额不足、网络不匹配、交易超时，都给出人话提示。
- **d. 品牌建活动前做余额预检**：预算大于余额时直接提示，不让用户签名后才失败。
- **e. 前端的合约错误码**：保持和 `lib.rs` 的 `Error` 枚举一一对应；补一个测试防止两边不同步。[SC-SEC]"error codes never renumbered"

**P0 不做**（明确延后，避免分心）：合约 v2、USDC 切换、真实反作弊、Wallets Kit、i18n。

---

## 4. P1：试点（赛后 2–6 周）

### 4.1 合约 v2（CampaignPool）

**待决策 D1（实施前确认）：** 是否改用 OpenZeppelin 官方库 `stellar-access` / `stellar-contract-utils`。

- 0.8.0 版要求 `soroban-sdk ^28`，我们现在用的是 29。
- **选项 A**：降到 SDK 28，直接用官方的 Ownable / Pausable / Upgradeable。经过审计，省代码量。
- **选项 B**：留在 SDK 29，按 OZ 的接口自己实现，等 OZ 发布兼容 29 的版本后再迁移。
- **建议选 A**。审计过的代码对商业项目更重要，SDK 28 合约在 protocol 29 网络上可以正常运行。

| # | 改进 | 依据 | 验收标准 | 工作量 |
|---|---|---|---|---|
| P1-C1 | **管理员体系**：Ownable 两步转移；验证者、sponsor 白名单角色化 | [OZ] stellar-access；[SC-SEC]#1 | 所有特权函数从存储加载授权；单元测试覆盖未授权调用 | M |
| P1-C2 | **暂停开关**：暂停后禁止建活动、提交、结算，但仍允许退款 | [OZ] Pausable；[MAINNET] Gate 1 | 暂停时资金仍可退回品牌（测试覆盖） | S |
| P1-C3 | **升级路径**：管理员可升级 wasm；附带版本号和迁移函数 | [SEP-49]；[OZ] Upgradeable | 升级的成功和失败路径都有测试；文档写明升级 SOP | M |
| P1-C4 | **代币白名单 + 记录小数位**：建活动时校验代币在白名单内，读取并存储 `decimals()` | [SC-SEC] token-consumer review | 非白名单代币拒绝；前端按存储的小数位显示 | S |
| P1-C5 | **创作者存储分页化**：`Submission(id, n)` 加计数器，替代单个 `Vec`；`get_submissions(id, start, limit)` | [SC-SEC]#10 资源耗尽 | 1,000 个创作者时单次提交的费用不随人数增长；读取分页 | M |
| P1-C6 | **平台费**：结算时按 `fee_bps` 划入金库，上限写死在合约里（如不超过 20%） | 商业模式 1.3 | 不变式成立：`paid_creator + fee + remaining == budget`；有属性测试 | M |
| P1-C7 | **结算成熟期 + 争议窗口**：播放量上报后经过 N 小时才可支付，期间品牌可以对某个提交发起争议 | 反刷量；保护品牌 | 争议冻结该创作者的未付金额；有超时自动解冻的测试 | L |
| P1-C8 | **TTL 策略**：TTL 按活动周期续期；读路径也续期；文档说明谁付租金 | [SC-SEC]#8；CAP-53 | 30 天活动全程不会被归档（测试中推进账本序号验证） | S |
| P1-C9 | **安全工具链**：Scout、OZ detectors 进 CI；用 proptest 做属性/模糊测试，验证资金守恒不变式 | [SC-SEC] Tooling | CI 绿；不变式模糊测试跑 10k 例 | M |
| P1-C10 | **可验证构建**：SEP-55 元数据（`source_repo`、`home_domain`）+ GitHub attestation 发布流程 | [SEP-55]；[SC-SEC] checklist | 链上 wasm hash 能追溯到某次提交 | S |

### 4.2 验证与风控（商业化最大风险）

| # | 改进 | 验收标准 | 工作量 |
|---|---|---|---|
| P1-V1 | **真实数据源**：YouTube Data API 上线（已有实现，要配 key 和配额管理）；TikTok / Instagram 列入调研 | 真实视频的播放量和链上记录一致；配额超限时降级为排队 | M |
| P1-V2 | **作品归属验证**：描述里的 `clippay:` 标签默认开启；P2 改为 OAuth 绑定频道 | 未带标签的作品不结算，并在 UI 中提示原因 | S |
| P1-V3 | **反刷量规则 v1**：播放量增速异常、互动率异常、频道年龄过低 → 标记为人工复核 | 规则可配置；被标记的提交暂停结算并通知品牌 | M |
| P1-V4 | **广告披露检查**：要求描述或标题包含 #ad / #sponsored | 合规（FTC 等地区规定）；不合规不结算 | S |
| P1-V5 | **多验证者（2-of-3）路线**：先在合约里预留"验证者集合 + 阈值"接口 | 设计文档 + 合约接口 | M |

### 4.3 服务端与基础设施

| # | 改进 | 依据 | 验收标准 | 工作量 |
|---|---|---|---|---|
| P1-B1 | **Worker 生产化**：Durable Object 串行发交易、Cron 定时结算、结构化日志 | [CF] | 并发请求不再出现序列号冲突；有日志查询 | M |
| P1-B2 | **relay 生产化**：按 IP 和钱包限流；sponsor 余额低于阈值时告警；正式环境改用 OZ Channels | [OZ] Relayer；[SAK] | 单 IP 每分钟最多 N 次；余额告警能送达 | M |
| P1-B3 | **事件索引**：订阅合约事件写入 D1（或 Mercury），提供活动历史、创作者收益历史 | RPC 事件只保留约 7 天 | 7 天前的结算记录仍可查询 | M |
| P1-B4 | **监控**：OZ Monitor 或自建，监控管理员操作、大额转账、暂停状态、结算失败率 | [MAINNET] Gate 3 | 告警规则有文档，有测试告警 | M |
| P1-B5 | **密钥管理**：verifier 和 sponsor 密钥放进 Worker secrets；轮换 SOP；管理员用硬件钱包或多签 | [MAINNET] Gate 1 Operational | 运行手册里有轮换演练记录 | S |
| P1-B6 | **主网成本实测**：在主网（或 futurenet）实测钱包部署、提交、结算的租金和手续费，回填定价模型 | 商业模式 1.3 | 成本表进入 deck 和定价 | S |

### 4.4 前端与体验

| # | 改进 | 依据 | 验收标准 | 工作量 |
|---|---|---|---|---|
| P1-F1 | **官方生成的 TS bindings**：`stellar contract bindings typescript` 生成 `packages/campaign-pool-bindings`，替换手写接口；部署脚本自动重新生成 | 官方 CLI | 合约改动后类型自动同步；删除手写的 `CampaignPool` 接口 | S |
| P1-F2 | **Stellar Wallets Kit**：品牌端支持 Freighter、xBull、Lobstr、Albedo 等 | [DAPP] 推荐的多钱包方案 | 至少 3 种钱包能完成建活动 | M |
| P1-F3 | **USDC 支付**：活动默认用 USDC；品牌端检查 trustline；提现走 USDC | [SC-SEC] client checklist（trustline）；[SEP-24] | 新活动默认 USDC；没有 trustline 时引导用户添加 | M |
| P1-F4 | **SEP-38 报价**：提现前显示"到账 X 当地货币"和汇率 | [SEP-38] | 报价和 anchor 最终金额一致 | M |
| P1-F5 | **路由与分享**：改为 history 路由；活动页生成 OG 分享卡片 | 品牌传播活动的刚需 | 分享到 X/Telegram 时有预览卡片 | S |
| P1-F6 | **创作者主页**：我的所有提交、收益历史、提现记录 | 依赖 P1-B3 | 跨活动汇总正确 | M |
| P1-F7 | **品牌活动详情增强**：活动简介富文本和示例视频（链下元数据 JSON 存 R2，链上存 hash）；导出 CSV | 品牌运营 | 元数据被篡改时页面显示警告 | M |
| P1-F8 | **无障碍**：弹窗焦点锁定、ESC 关闭、键盘操作、颜色对比度达到 AA | WCAG | axe 检查 0 个严重问题 | S |
| P1-F9 | **Playwright e2e**：用 Chrome 虚拟身份验证器（CDP WebAuthn）在 CI 里跑 passkey 全流程 | 回归保障 | CI 每晚跑通建钱包 → 提交 → 结算 | M |

### 4.5 商业与合规

| # | 事项 | 验收标准 |
|---|---|---|
| P1-M1 | **3 个设计合作品牌**（优先 Stellar 生态里需要宣传的项目），每家跑一个小额活动 | 签订意向；收集反馈 |
| P1-M2 | **定价页 + 平台费公示** | 上线 |
| P1-M3 | **条款、隐私政策、内容授权说明**（创作者授予品牌转载权的边界） | 法务审阅（外部） |
| P1-M4 | **SCF 申请**：用 `scf-submission-drafter` 和 `scf-budget-builder` 准备 Build Award 材料，对照评审红旗逐条自查 | [SCF]：Soroban 是核心组件、有可量化里程碑、预算按条目列出 |
| P1-M5 | **合规梳理**：我们是非托管模式（资金在合约里，不经过平台账户）；KYC 由 anchor 承担（SEP-12）；品牌 KYB 门槛；税务表格问题 | 外部法律意见 |

---

## 5. P2：主网 Beta（赛后 2–3 个月）

| # | 事项 | 依据 |
|---|---|---|
| P2-1 | 第三方审计（申请 SDF Audit Bank，SCF 资助项目可以申请补贴） | [SC-SEC] Audits |
| P2-2 | 完整走一遍主网 Gate 1–3：部署 SOP、多签管理员、监控、生态登记（stellar.expert / lumenloop） | [MAINNET] |
| P2-3 | 生产 anchor 接入：按目标国家选择支持 SEP-24 USDC 提现的 anchor，逐个验证可用性 | [SEP-24/12/38] |
| P2-4 | 我们自己的 `stellar.toml`（SEP-1）+ SEP-45 `client_domain` 签名，让 anchor 能识别 ClipPay | [SEP-1][SEP-45] |
| P2-5 | 多平台：TikTok / Instagram；创作者用 OAuth 绑定频道 | P1-V2 延伸 |
| P2-6 | i18n：西班牙语、葡萄牙语、印尼语、中文 | 目标创作者地区 |
| P2-7 | 智能钱包策略：创作者钱包加提现限额（OZ spending-limit policy）和恢复方式 | [SAK][OZ] stellar-accounts |
| P2-8 | 品牌 SaaS 看板：投放效果、千次成本趋势、创作者质量分 | 商业模式增值项 |

---

## 6. 项目结构优化（基于官方工具链）

### 6.1 目标目录结构

```
clippay/
├── contracts/
│   └── campaign-pool/            # Soroban 合约（P1 起依赖 OZ stellar-access / contract-utils）
├── packages/
│   ├── campaign-pool-bindings/   # 官方 CLI 生成：stellar contract bindings typescript（替代手写接口）
│   ├── pool-client/              # 业务辅助：金额换算、错误码映射、earnedAt（变薄）
│   └── anchor/                   # SEP-1 / SEP-45 / SEP-24 客户端（已有）
├── apps/
│   └── web/                      # 前端（原 web/）
├── services/
│   └── verifier/                 # 验证 + relay；Node 入口 + Worker 入口共用 core.ts（原 verifier/）
├── deployments/
│   ├── testnet.json              # 唯一配置来源：合约 ID、wasm hash、代币、智能账户、anchor
│   └── mainnet.json
├── scripts/                      # deploy / seed / bindings 生成
├── docs/                         # ARCHITECTURE、THREAT_MODEL、RUNBOOK、本计划
└── .github/workflows/            # ci.yml（测试/lint/scout）、release.yml（SEP-55 可验证构建）
```

### 6.2 结构调整清单

| # | 调整 | 依据 / 理由 | 阶段 |
|---|---|---|---|
| S1 | `deployments/<network>.json` 作为单一配置来源；`.env` 只放密钥 | [MAINNET]；减少重复 | P0 |
| S2 | `web/` → `apps/web/`，`verifier/` → `services/verifier/` | 业界常见的 monorepo 约定；分清应用和服务 | P1（赛后统一迁移，避免赛前打乱路径） |
| S3 | 生成 bindings 包，`pool-client` 只保留业务辅助函数 | 官方 CLI；类型和合约规范自动一致 | P1 |
| S4 | 验证服务拆成 `core.ts` + 两个入口（Node / Worker） | 已完成一半：`core.ts` 和 Node 入口已拆好 | P0（随部署完成） |
| S5 | CI：`cargo fmt/clippy/test`、Scout、`pnpm typecheck/build`、契约-前端错误码一致性测试 | [SC-SEC] Tooling | P1 |
| S6 | Release 工作流：soroban-build-workflow（SEP-55），从 release 产物部署 | [SEP-55] | P1 |
| S7 | 文档：`ARCHITECTURE.md`（从 README 拆出）、`THREAT_MODEL.md`（信任假设：验证者、relay、anchor）、`RUNBOOK.md`（sponsor 充值、密钥轮换、暂停应急） | [SC-SEC] 审计前准备 | P1 |
| S8 | Lint/格式化：Biome（TS）+ rustfmt/clippy；提交前钩子 | 工程卫生 | P1 |

---

## 7. 风险登记

| 风险 | 影响 | 可能性 | 应对 |
|---|---|---|---|
| 刷量导致品牌预算被骗 | 高 | 高 | P1-V3 反刷规则、P1-C7 成熟期和争议窗口、单人上限（已有） |
| 验证者私钥泄露 | 高 | 低 | 只能在单人上限和既定费率内转移预算；P1-C2 暂停；P1-V5 多验证者 |
| sponsor 被滥用耗尽 | 中 | 中 | 白名单 + 费用上限（已有）；P1-B2 限流和余额告警 |
| testnet 租金异常高，导致演示成本偏高 | 低 | 已发生 | 演示用量可控；主网成本实测（P1-B6） |
| smart-account-kit / relay 未审计 | 高 | — | 只在 testnet 使用；主网前审计（P2-1） |
| 平台 API 配额或条款变化 | 中 | 中 | 多平台、多数据源；配额管理 |
| 法规（资金传输、税务、广告披露） | 高 | 中 | 非托管架构；KYC 交给 anchor；P1-M5 法律意见；P1-V4 广告披露检查 |

---

## 8. 实施顺序与进度

### 8.0 总览（2026-10-25 18:40 WET，距提交截止约 17 小时）

| 阶段 | 进度 | 说明 |
|---|---|---|
| P0 参赛提交 | 6/7 | 只剩 P0-6 视频 + deck（录制需要你本人） |
| P1 限时代码部分 | 已完成 | 合约 v2、校验规则、relay 限流、bindings、无障碍、CI、文档；需要外部参与的条目延后 |
| P2 | 未开始 | — |

当前线上部署：

| | |
|---|---|
| 网站 + API | <https://clippay.umesok.workers.dev>（Cloudflare Worker，账号为当前 wrangler 登录账号） |
| 演示合约（v2） | `CBYEMM7I4OXD5DTWGKCKT7NDLRB357W5Q32ZUX3Z7E5MQP37UQQYWVXT`，Wasm `0b58c98a…`，与仓库代码一致 |
| 预发合约（v2，做过链上升级） | `CAH4SE2CYMGWWTEY4HKJOQ2XAYFEJLC64DR4VZBWX2YBFEC3IVYNGAR2` |
| 线上验证者 | `GCDOZOD74VZJB7FPKYPGEWK5V4QDIPKPRR5CWNMEHARVQCSNDVVOER6I`（`clippay-verifier-prod`，只在 Worker secret 里） |
| 平台费金库 | `GCBQ55XIHJZGOJGSJHUWIL7CZL7DDYWBZXB6AFW226JV52MN4374MLQ7`（5%） |
| CI | GitHub Actions：合约（fmt/clippy/Wasm 构建/测试 + 2,000 例属性测试）、TypeScript（typecheck/三套测试/web 构建），全部通过 |

### 8.1 P0 进度

- [x] P0-1 git 初始化 + 公开仓库：<https://github.com/fdddf/clippay>，按模块分次提交；活动照片和赛事笔记没有入库
- [x] P0-2 / S1 集中配置 `deployments/testnet.json`：web、verifier、e2e 脚本、Worker 都从这里读；`.env` 只放密钥和可调参数
- [x] P0-3 公网部署：一个 Worker 同时提供静态网站（SPA 路由）和 `/api`；`/api` 由单个 Durable Object 运行验证服务和 relay，交易串行发出；Durable Object 用自己的 alarm 每分钟结算一次（cron 只负责补设 alarm）
- [x] P0-4 演示数据：`pnpm seed` 建了 3 个虚构品牌的活动（简报在 `docs/briefs/`）和 7 个提交；mock 播放量改成"先快后平"的曲线，预算不会在一小时内被耗光
- [x] P0-5 快速修复
  - a 已封顶或没有应付金额时不发交易
  - b 提现前读取 anchor 的 SEP-24 `/info`：显示单笔范围（testanchor 为 1–10 XLM），超出范围或超过余额时在弹窗和 passkey 之前拦下，有单元测试
  - c 钱包取消、拒签、余额不足、网络不匹配、超时等错误文案
  - d 建活动前做余额预检
  - e 合约错误码与前端文案、生成的 bindings 一致性测试
- [ ] P0-6 视频脚本 + deck：脚本见 [demo-video.md](demo-video.md)，deck 已完成（链接在脚本开头）；剩余：填写 deck 的团队信息、录制视频
- [x] P0-7 README：在线地址、试用步骤、当前合约 ID 和交易证据、Cloudflare 部署说明、演示数据说明、本周末进度

**线上验证过的内容：**
- 首页和活动页读取链上实时数据；手机宽度无横向滚动；控制台无报错。
- 通过公网 relay 跑通 passkey 全流程：建钱包 → 免手续费提交 → 结算。交易：钱包部署 `58bb1d87…`、提交 `ca49f1e3…`、结算 `77c2cf1b…`。
- 无人操作时每分钟自动结算（日志和链上交易均可见）。

### 8.2 P1 进度（赛前限时版）

| 状态 | 条目 |
|---|---|
| ✅ 完成 | C1 Ownable 两步转移 + 所有特权函数测试未授权调用 · C2 暂停（退款不受影响）· C3 升级 + `migrate` + `scripts/upgrade.sh` + RUNBOOK SOP（已在预发合约上链上执行）· C4 代币白名单 + 记录小数位 · C5 创作者分页存储（提交成本不随人数增长，有测试）· C6 平台费 + 资金守恒属性测试 · C8 可由 owner 调整的 `RentPolicy` · V2 归属标签默认开启 · V3 反刷量规则 v1（转人工复核 + `/review` 接口）· V4 #ad 披露检查 · B2 relay 按 IP/钱包限流 + sponsor 余额告警 · F1 生成的 TS bindings（CLI 的 bindings 命令已弃用，改用 JS SDK 的 `stellar-js generate`）· F8 无障碍（axe 明暗两种主题 0 个 serious/critical）· S3 · S5 CI（已在 GitHub 上运行并通过）· S7 THREAT_MODEL、RUNBOOK |
| ◐ 部分 | C9：属性测试本地跑过 10,000 例、CI 跑 2,000 例；Scout 未接入 · B1：Worker + Durable Object 串行发交易 + 每分钟结算 + Cloudflare 日志已上线；帖子状态和复核结论还只存在 Durable Object 内存里，重启会丢 · B5：线上验证者用独立密钥，密钥都在 Worker secrets 里，并已通过 `set_verifier` 实际轮换过一次；管理员仍是单个密钥 · F5：已改为 history 路由（旧 `#/` 链接自动跳转）；OG 分享卡片未做 |
| ⏭ 延后 | C7 争议窗口 · C10 可验证构建（SEP-55 release 工作流）· V1（需要 YouTube API key）· V5 多验证者 · B3 事件索引 · B4 监控 · B6 主网成本实测 · F2/F3/F4/F6/F7/F9 · M1–M5（需要外部参与）· S2/S6/S8 |

**testnet 成本实测（补充 B6）：**
- 上传 26 KB 合约 Wasm：约 7,400 XLM。
- 租金策略：最初把实例 TTL 绑到活动周期，建一个活动要花约 28,000 XLM，所以改成了 owner 可调的租金策略。testnet 上设为活动结束后再留 1 天、实例 7 天续期。
- sponsor 代付：钱包部署约 41 XLM，首次提交约 107 XLM（新建两个 7 天的持久条目）。relay 的单笔费用上限在 testnet 上调到 250 XLM。
- 结算：约 0.001 XLM。

### 8.3 下一步

1. **UX 提升**：见 [ux-plan.md](ux-plan.md)。按完整质量实施第 12.1 节的阶段 A1–A9（Tailwind + shadcn/ui、landing page、统一用户中心，以及它们需要的 P1-B3 事件索引和 P1-F7 链下元数据），约 28.5 小时；需要先确认截止后能否更新在线版本。
2. **P0-6 视频 + deck**：先由我写好 3 分钟视频脚本（按线上网站逐步点击）和 10 页 deck，你来录制。
3. 可选，提交前：活动页 OG 分享卡片（F5 剩余部分）；把帖子状态和复核结论写进 Durable Object 存储（B1 剩余部分）。
4. 赛后：C10 可验证构建、C7 争议窗口、V1 接真实 YouTube 数据，以及第 4 节其余条目。

**需要留意：**
- 有人在 18:06 部署之后给这个 Worker 绑定了自定义域名 `clippay.hr.edu.kg`，不是本会话做的。如果不是你加的，请在 Cloudflare 控制台确认。
- 公网 e2e 测试在 Kitebase 活动里留下一条 `e2e-…` 链接的提交，已经上链，无法删除。
- 另一个会话在 5173/8787 端口运行的旧服务仍指向旧合约。本地验证服务使用 `clippay-verifier` 密钥，已不能给线上合约结算，因此不会和线上验证者冲突。
- 本地开发要给新合约结算时，可以用 `clippay-verifier-prod` 的密钥，但不要和线上 Worker 同时运行。

### 8.4 已决策（2026-10-25）

1. **D1**：降到 soroban-sdk 28，使用 OZ 0.8.0 官方库（`stellar-access` Ownable、`stellar-contract-utils` Pausable/Upgradeable）。
2. **平台费**：结算时从每笔付款中收取，默认 5%（500 bps），合约硬上限 20%，每个活动创建时固定费率。
3. **执行顺序**：先做限时的代码类 P1，再做 P0 发布动作。
4. **公网部署**：使用当前 wrangler 登录的 Cloudflare 账号；仓库 `fdddf/clippay`（公开）。
