# ClipPay — Solana / Anchor 移植方案

状态：方案，尚未开工。Stellar 版（本仓库）保持不变，继续作为已上线 testnet 的版本。

目标是在 2–3 周内做出一个能在 Solana devnet 上完整跑通的 ClipPay：品牌方锁预算 → 创作者提交作品 → 按播放量自动结算 → 活动结束退款。另外加两样 Stellar 版没有的东西：**Blinks 入口**，以及**用 zkTLS 证明播放量**（缩小对验证服务的信任）。

对外怎么讲：Stellar 版是原版，Solana 版是移植。简历和面试里都这么说：“同一个产品在两条链上各实现过一遍”，并说清两边账户模型、授权和手续费模型的差别（见第 8 节）。

---

## 0. 组件对照

| Stellar 版 | Solana 版 | 复用程度 |
|---|---|---|
| `contracts/campaign-pool`（Soroban） | `solana/programs/clippay`（Anchor） | 规则照搬，代码重写 |
| `packages/campaign-pool-bindings`（从 Wasm 生成） | `packages/sol-client`（Codama 从 Anchor IDL 生成，基于 `@solana/kit`） | 重写 |
| `packages/pool-client`（金额、手续费、分页、错误信息） | 同一套接口，换一个 Solana 实现 | 接口复用 |
| `verifier/src/views.ts`、`checks.ts` | 原样复用 | 基本不改 |
| `verifier/src/core.ts` | 抽一层 `Chain` 接口（`listSubmissions` / `settle`），实现两份 | 小改 |
| `verifier/src/relay.ts`（`{func, auth}` 代付） | Worker 里的 Solana 代付端点（规则同 Kora），见第 2 节 | 重写 |
| OZ 智能账户 + smart-account-kit（passkey） | Swig 或 LazorKit 智能钱包（secp256r1 预编译） | 换 SDK |
| Freighter（品牌方） | Phantom / Solflare（Wallet Standard） | 换 SDK |
| SEP-45 + SEP-24 出金到银行 | **不在范围内**：Solana 没有统一的出金协议 | 删 |
| Durable Object 每分钟结算 + `/settle/:id` | 不变 | 复用 |

建议放在本仓库，新建 `solana/` 目录（Anchor workspace），由 pnpm workspace 统一管理。这样 `views.ts` / `checks.ts` / 前端组件可以直接共用。

---

## 1. 程序与账户设计

### 1.1 账户（PDA）

Soroban 用的是 `DataKey` 键值存储；Solana 上每条状态都是一个独立账户，地址由 seeds 推导。

| 账户 | Seeds | 内容 | 对应 Stellar |
|---|---|---|---|
| `Config` | `["config"]` | `owner`、`pending_owner`、`verifier`、`treasury`、`fee_bps`、`settle_grace`、`paused`、`next_id`、`version` | instance storage |
| `AllowedMint` | `["mint", mint]` | `decimals`、`token_program`（SPL Token 或 Token-2022） | `DataKey::Token(addr)` |
| `Campaign` | `["campaign", id.to_le_bytes()]` | `Campaign` 结构原样搬过来，金额改为 `u64`，另加 `mint`、`bump`、`vault_bump` | `DataKey::Campaign(id)` |
| 资金账户 `vault` | `["vault", campaign]` | 一个 token account，authority 是 `Campaign` PDA | 合约自身余额 |
| `Submission` | `["sub", campaign, creator]` | `creator`、`post_id`（规范化后的视频 ID，不存原始 URL）、`submitted_at`、`views`、`paid`、`fee`、`held`、`last_proof_at`、`rent_payer` | `DataKey::Submission(id, creator)` |
| `Post` | `["post", campaign, sha256(post_id)]` | `creator` | **新增**，见下 |

几处和 Stellar 版刻意不同的地方：

- **不再需要 `Creator(id, n)` 分页索引。** Stellar 上要自己维护顺序索引才能翻页；Solana 上直接用 `getProgramAccounts` 加 `memcmp` 过滤（判别符 8 字节之后紧跟 `campaign` 字段）就能列出某个活动的全部提交。注意公共 RPC 常禁用 gPA，devnet 用 Helius 之类的 RPC。
- **“一个作品只付给一个人”从验证服务移到链上。** `submit` 时 `init` 一个 `Post` PDA；同一个视频第二次提交，账户已存在，`init` 直接失败。Stellar 版目前靠验证服务的检查（`checks.ts`）实现这一条，Solana 版免费得到链上保证。
- **租金是可退押金，不是持续租赁。** Stellar 那套 `RentPolicy` / `extend` / TTL 全部删掉。取而代之：账户创建时押 rent-exempt 押金，活动结束后可以关闭账户退押金（见 1.3）。`Submission.rent_payer` 记录押金是谁付的，因为代付时付款方是代付账户，不是创作者。
- **金额改用 `u64`**（SPL 代币就是 u64），乘法在 `u128` 里算：
  `earned = min(views as u128 * rate_per_1k as u128 / 1000, cap_per_creator)`，结果必然 ≤ cap，可以安全转回 u64。

### 1.2 指令

| 指令 | 签名者 | 关键检查 | 对应 Stellar |
|---|---|---|---|
| `initialize` | 升级权限方（upgrade authority） | 只能调用一次（`Config` 用 `init`） | `__constructor` |
| `allow_mint` / `disallow_mint` | owner | 从 mint 账户读 `decimals`；Token-2022 的 mint 若带转账手续费或 transfer hook 扩展则拒绝 | `allow_token` |
| `create_campaign` | brand | 未暂停；金额 > 0；`deadline > now`；mint 在白名单；预算转入 `vault` | 同名 |
| `top_up` | 任何出资方 | 活动未结束 | 同名 |
| `submit` | creator（+ 代付方作为 payer） | 未暂停、未截止；`init` `Submission` 和 `Post`；按需创建创作者的 ATA | 同名 |
| `settle` | verifier | 截止时间 + `settle_grace` 之内；`views` 不能减少；`held == false`；按 Stellar 版公式算 `owed`；`vault` 用 PDA 签名转给创作者和 treasury | 同名 |
| `set_hold` | verifier | 设置或清除 `held`。验证服务能暂停付款，但编不出播放量（配合第 4 节） | 新增（原来只在链下） |
| `settle_with_proof` | 任何人 | 见第 4 节 | 新增 |
| `refund` | 任何人（钱退给 brand） | 宽限期已过；未退款过 | 同名 |
| `close_submission` | 任何人 | 活动已退款；押金退给 `rent_payer` | 新增 |
| `close_campaign` | brand | 已退款，且 `creators == closed_submissions`；关闭 `vault` 和 `Campaign`，押金退给 brand | 新增 |
| `pause` / `unpause`、`set_verifier`、`set_fee`、`transfer_owner` / `accept_owner` | owner | `fee_bps <= 2000`；暂停时 `refund` 仍可用 | OZ Ownable / Pausable |

**升级：** Solana 程序默认可升级，由 upgrade authority 控制。Stellar 版的 `upgrade` + `migrate` 在这里变成两件事：程序本身用 `solana program deploy` 升级；账户结构变化靠每个账户里的 `version: u8` 加 `realloc`。mainnet 上 upgrade authority 交给 Squads 多签。

**事件：** 用 `emit_cpi!`，不用 `emit!`。`emit!` 写在日志里，可能被 RPC 截断。事件名和字段保持和 Stellar 版一致（`CampaignCreated`、`Submitted`、`Settled`、`Refunded`），前端和索引器少改。

**错误码：** Anchor 的自定义错误从 6000 开始。保持和 Stellar 版**相同的顺序**（`CampaignNotFound` = 6000 + 0 …），沿用“错误码冻结”的那条测试：合约、生成的客户端、前端文案三者一致。

**时间：** `Clock::get()?.unix_timestamp`（i64）。存储和比较都用 i64，不要和 u64 混着用。

### 1.3 资金不变量与测试

- 不变量和 Stellar 版一样：`Σ paid + Σ fee + remaining == budget`，且任何作品的花费都不超过 cap。此外，在 Solana 上还要成立 `vault.amount >= remaining`（有人直接往 vault 打钱会让余额多于记账，但绝不会少于记账）。
- 单元和集成测试用 **LiteSVM**（Rust 测试里直接跑程序，比 `solana-test-validator` 快几个数量级）。
- 属性测试：把 Stellar 版跑 10,000 轮随机操作的那套 `proptest` 移植过来，在 LiteSVM 上运行。
- 未授权调用测试：每个 owner / verifier 指令都要有“换个签名者就失败”的用例。另外专门测试**账户替换攻击**：传入别的活动的 `vault`、别的 mint、伪造的 `Submission`。Anchor 的 `has_one` / `seeds` / `constraint` 必须全部覆盖到。这是 Solana 特有、Soroban 基本不会遇到的一类漏洞，面试必问。

---

## 2. Passkey 钱包与交易代付

### 2.1 问题

Solana 交易的签名必须是 Ed25519，而 passkey 只能出 P-256（secp256r1）签名，所以 passkey 不能直接当 Solana 钱包的私钥用。2025 年 6 月起 Solana 有了原生的 secp256r1 验签预编译（SIMD-0075），可以在链上**验证** passkey 签名。所以做法和 Stellar 版一样：passkey 控制一个**智能钱包**，交易由别人签名并付费。

| 方案 | 做法 | 取舍 |
|---|---|---|
| **A. Swig 或 LazorKit 智能钱包（推荐）** | 钱包是一个 PDA，权限方是 passkey 公钥。每笔操作带一条 secp256r1 验签指令，钱包程序校验后代为执行 | 和 Stellar 版的 OZ 智能账户最接近，面试时好对比。Swig 支持基于角色的权限，LazorKit 的钱包程序在 mainnet 上，并经过审计 |
| B. 嵌入式 / MPC 钱包（Privy、Para 等） | passkey 只解锁一把托管的 Ed25519 密钥 | 接入最快，但离“智能账户”的技术故事最远 |
| C. 自己在 ClipPay 程序里验 passkey | `submit` 通过 instructions sysvar 读取 secp256r1 验签指令，用 passkey 公钥的哈希当创作者身份 | 学习价值高，但消息绑定和防重放都得自己做，容易出安全问题。只作为第 3 周有余力时的探索项 |

**第 1 天的 spike：** 分别用 Swig 和 LazorKit 在 devnet 上跑通“创建钱包 → 用 passkey 签名调用任意程序 → 代付”。选文档和 SDK 更顺手的那个。

结算付款打到**钱包 PDA 的 ATA**。`submit` 时用 `init_if_needed` 创建这个 ATA，押金由代付方支付，这样 `settle` 时 verifier 不需要再创建账户。

### 2.2 代付

Solana 原生支持“付款人和操作人不是同一个账户”：交易里的 fee payer 由代付方签名即可。比 Stellar 简单，但风险点不同。

- **参考实现：** Solana Foundation 的 **Kora**（paymaster 型 JSON-RPC 服务，规则可配置：允许哪些程序、哪些代币、禁用哪些账户）。
- **推荐部署方式：** 在现有 Cloudflare Worker 里写一个 `POST /relay/sol`，按 Kora 的规则模型自己做校验，这样仍然是一个 Worker 包办全部服务。Kora 是 Rust 服务，跑不进 Worker；想用它就得另起一台机器，第 3 周有余力再考虑。
- **必须做的校验**（对应 `relay.ts` 现有规则）：
  1. 交易里只能出现这些程序：ClipPay、所选钱包程序、secp256r1 预编译、Token / Token-2022、ATA、ComputeBudget；
  2. 代付账户只能作为 fee payer，以及作为**白名单内账户**（`Submission`、`Post`、创作者 ATA、钱包）的 `init` payer，不能作为任何转账的来源，也不能在其他位置可写；
  3. compute unit price 和 limit 有上限；
  4. 先模拟再签名；
  5. 沿用 `limits.ts` 的按 IP / 按钱包限流。
- **Solana 特有的风险：** 代付方为 `Submission` / `Post` / ATA 垫付押金，有人刷提交就能慢慢耗光代付账户。对策：限流；每个活动设创作者上限；活动结束后 `close_submission` 把押金收回给 `rent_payer`。

品牌方不走代付，直接用 Phantom / Solflare 签名（Wallet Standard）。

---

## 3. Blinks 入口

Solana Actions 是一个 HTTP 规范：服务端对请求返回一笔待签名交易；Blinks 负责在 X、网页等界面上把它渲染成按钮。

| 端点 | 作用 |
|---|---|
| `GET /actions.json`（站点根目录） | 把 `/c/:id` 映射到 `/api/actions/campaign/:id` |
| `GET /api/actions/campaign/:id` | 标题、每千次播放的价格、剩余预算、截止时间；图标复用 `og.ts` 生成的分享图；一个“参加活动”按钮，参数是作品链接 |
| `POST /api/actions/campaign/:id` | 收到 `{ account, data: { url } }`，规范化成 `post_id`，构造 `submit` 交易返回给钱包签名 |
| `GET/POST /api/actions/campaign/:id/fund` | 品牌方或任何人给活动 `top_up` |

要点：

- **Blink 走的是普通钱包（Phantom），不是 passkey。** 所以有两条创作者入口：Blink（已有 Solana 钱包的人）和网页（passkey，零门槛）。程序只认 `creator: Pubkey`，两边互不影响。
- 提交成功后要告诉创作者“在视频描述里加上 `clippay:<地址前 16 位>`”。用 Action 的后续消息（action chaining）展示这一步。**Chaining 的格式需要在第 2 周对照 solana.com/docs/tools/actions 的当前版本确认。**
- CORS：所有 Action 端点（包括 OPTIONS）都返回 `Access-Control-Allow-Origin: *`。
- 在 X 上展开成按钮还依赖钱包扩展和 Blink 注册表。**需要确认当前的注册流程**；即使不能在 X 上展开，`dial.to` 之类的 Blink 页面也能用来演示。

演示亮点：发一条推文，推文里直接就能报名，30 秒后创作者钱包到账。

---

## 4. 用 zkTLS 证明播放量

### 4.1 现在的信任模型

Stellar 版的 `settle(id, creator, views)` 只认 verifier 签名：验证服务说多少播放量，合约就按多少付。验证服务的密钥一旦泄露或作恶，就能编一个播放量把预算全部付出去。这是评委和面试官都会追问的点。

### 4.2 目标

**让验证服务只能“暂停付款”，不能“编造数字”。**

```
 Verifier ──zkFetch(YouTube API, videos?id=X&part=statistics)──► Reclaim attestor
    │                                                              │ 签名 { videoId, viewCount, timestamp }
    ▼                                                              ▼
 settle_with_proof(campaign, creator, proof) ── 任何人都能提交，不需要 verifier 签名
    程序检查：
      1. attestor 签名有效，且 attestor 在 Config 记录的公钥集合里
      2. 请求 provider 与 Config 里记录的 provider 哈希一致（只接受“YouTube 视频统计”这一种请求模板）
      3. 证明里的 videoId == Submission.post_id
      4. proof.timestamp > Submission.last_proof_at（防重放），viewCount >= Submission.views
      5. Submission.held == false
    然后按原公式结算
```

- **zkFetch** 允许服务端发起请求，同时把 API key 等参数隐藏在证明之外，所以证明由验证服务生成，创作者不需要做任何事。
- 验证服务仍然保留反作弊权：`checks.ts` 发现刷量、频道太新、缺 `#ad` 等问题时，调用 `set_hold`。它能**延迟**付款，但不能**伪造**金额。
- 原来的 `settle`（只要 verifier 签名）保留在 `Config.allow_unproven_settle` 开关后面，devnet 演示和 mock 数据用；mainnet 上关闭。

### 4.3 需要第 1 天验证的未知项

Reclaim 的 Solana 程序在 GitHub 的 `reclaim-solana-sdk` 仓库（Anchor 程序在 `programs/reclaim`）。要确认：

1. **签名怎么验：** CPI 调用 Reclaim 程序验证，还是自己用 `secp256k1_recover` 验 attestor 签名？哪种更省计算单元？
2. **交易大小：** Solana 单笔交易 1232 字节上限，证明 + 签名 + 提取的参数能不能放下？只提取 `videoId` 和 `viewCount` 两个字段。放不下就先写进一个 `ProofBuffer` PDA，分两笔交易提交。
3. **YouTube provider：** zkFetch 能不能直接打 YouTube Data API v3 的 `videos` 端点，并把 `statistics.viewCount` 提取出来。

**备选方案（spike 失败时）：** 保留 verifier 签名的 `settle`，但每次结算把完整 zkTLS 证明存进 R2，并在 `Settled` 事件里带上证明哈希。任何人都能事后核对。信任程度不如链上验证，但做到了“可审计”。

**第 3 周有余力再做：** 用同一个机制证明视频描述里有 `clippay:<tag>`（Reclaim provider 支持用正则提取），把归属检查也搬到链上。

---

## 5. 链下改动

| 模块 | 改动 |
|---|---|
| `verifier/src/core.ts` | 抽象出 `Chain` 接口，Stellar 和 Solana 各实现一份；`views.ts` / `checks.ts` 不动 |
| 索引 | `getProgramAccounts` 列提交；结算后用 `getSignaturesForAddress` 或 Helius webhook 刷新。取代 `indexer.ts` 的 Soroban 事件轮询 |
| 证明 | 新增 `proofs.ts`，用 zkFetch 生成证明并提交 `settle_with_proof` |
| Worker | Durable Object 的每分钟结算循环不变，只换 `Chain` 实现；新增 `/relay/sol` 和 `/api/actions/*` |
| `web` | 品牌方：`@solana/wallet-adapter`（或 Wallet Standard）；创作者：Swig 或 LazorKit 的 passkey SDK；金额和小数位逻辑复用 `pool-client`；交易链接改到 Solana Explorer 或 Solscan |
| 部署 | `deployments/devnet.json`（程序 ID、mint、verifier、treasury），与 `testnet.json` 并列 |

---

## 6. 时间表（3 周，按优先级削减）

**第 1 周：程序**

- 第 1 天：两个 spike，各限半天：passkey 钱包（Swig 和 LazorKit 选一个），Reclaim 在 Solana 上的验证（4.3 的三个问题）。
- 第 2–4 天：Anchor 程序，第 1 节的全部指令（不含 `settle_with_proof`）；LiteSVM 测试；账户替换攻击测试。
- 第 5 天：资金不变量属性测试；错误码冻结测试；部署到 devnet；Codama 生成客户端。

**第 2 周：跑通产品**

- `Chain` 抽象，Solana 版验证服务在 devnet 上自动结算（mock 数据和 YouTube 两种 provider 都要通）。
- `/relay/sol` 代付，加上第 2.2 节的校验和测试（尤其是“代付账户不能被拿来转账”）。
- 网页：品牌方用 Phantom 建活动；创作者用 passkey 创建钱包并提交；到账展示。
- Blinks：`actions.json` 和活动的 GET / POST，在 dial.to 上跑通。

**第 3 周：差异化与交付**

- `settle_with_proof` 加验证服务的证明生成；spike 不顺就走 4.3 的备选方案。
- `set_hold` 接入 `checks.ts`。
- 部署 Worker、录 2 分钟演示视频、写 README（含 devnet 交易链接，格式同 Stellar 版的部署表）。
- 有余力：`close_*` 押金回收的前端入口、Kora 替换自建 relay、方案 C（自己验 passkey）。

**削减顺序**（时间不够时从下往上砍）：

1. 必须：程序 + 测试、验证服务结算、网页（Phantom 创作者也算）、devnet 部署、演示视频
2. 应该：passkey + 代付、Blinks
3. 可以：zkTLS 链上验证（至少做到备选方案的“可审计”）、`close_*`、描述标签证明

---

## 7. 风险

| 风险 | 影响 | 对策 |
|---|---|---|
| passkey 钱包 SDK 不成熟或文档不全 | 第 2 周卡住 | 第 1 天 spike；不行就先让创作者用 Phantom，passkey 降为“应该” |
| Reclaim 证明放不进一笔交易，或 YouTube provider 不可用 | 第 3 周卡住 | `ProofBuffer` 分笔提交；或走“可审计”备选方案 |
| 代付账户被刷押金或被构造交易掏空 | devnet 上无所谓，但面试会问 | 2.2 的校验清单 + 测试；押金可回收 |
| 账户替换和缺失约束 | Solana 最常见的漏洞类型 | 每个账户写 `seeds` / `has_one`，专门的负向测试 |
| YouTube API 配额 | 与 Stellar 版相同 | 沿用现有缓存；演示用 mock provider |
| Token-2022 扩展（转账手续费、hook）破坏金额计算 | 实际到账少于记账 | 白名单拒绝带这些扩展的 mint |

---

## 8. 面试和简历怎么讲

如实写成：

> **ClipPay** — 按播放量付费的创作者赏金平台。先在 Stellar/Soroban 上实现并上线 testnet（passkey 智能账户、交易代付、SEP-24 出金），之后移植到 Solana/Anchor：PDA 资金池、链上保证“一个作品只付一人”、Blinks 报名入口、用 zkTLS（Reclaim）证明播放量，让结算服务只能暂停付款、不能编造数字。

能讲出深度的对比点：

- **状态模型：** Soroban 是合约自有的键值存储，按 TTL 收租金；Solana 是程序拥有的独立账户，押金可退，地址由 seeds 推导。所以分页索引不再需要，“作品唯一”可以用 PDA 是否已存在来保证。
- **授权：** Soroban 的 `require_auth` 加上可以由别人提交的 auth entry，天然支持代付；Solana 是交易级签名，fee payer 和操作人分开，智能钱包要在指令层面验 passkey。
- **安全关注点：** Soroban 基本不存在账户替换问题（存储由合约自己寻址）；Solana 上这是头号漏洞，必须靠约束来防。
- **代付的风险模型：** Stellar 侧防的是有人借 source-account 授权花代付方的钱；Solana 侧防的是代付账户被放进可写位置，以及押金被刷光。

---

## 参考

- Solana passkeys 与 secp256r1 预编译：<https://www.helius.dev/blog/solana-passkeys>
- LazorKit：<https://solanacompass.com/projects/lazorkit>
- Swig：<https://solanacompass.com/projects/swig>
- Kora（代付 / paymaster）：<https://solana.com/docs/tools/kora/getting-started>
- Solana Actions 与 Blinks：<https://solana.com/docs/tools/actions>
- Reclaim Protocol 的 Solana 集成：<https://docs.reclaimprotocol.org/onchain/solana/quickstart>
