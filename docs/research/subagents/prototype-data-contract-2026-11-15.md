# 参考视觉移植：正式目录数据契约与最小映射（2026-11-15）

## 结论与本次范围

正式页面可以采用 `C:/Users/Lenovo/Desktop/search/dist(1)` 的真实页面壳、间距、字号、卡片、筛选条、表格与档案目录结构；数据继续由根应用的 `Catalog` / `Institution` 提供。不要把正式记录转换或断言成参考的 `Home`：它强制携带 `sample: true`、空床、价格、认领、评级、运营主体等本阶段没有的事实，适配到这个模型会迫使系统造值。

最小实施路径是“参考呈现结构 + 正式查询/对比/来源契约”，不搬运参考的 `store`、`seed`、Server Actions、公开 API 或后台。对比页在参考中不存在，应沿用正式对比的行为与语义表格，套用参考同套标题、卡片与表格样式。

用户确认的阶段范围：检索、筛选、对比、机构档案、来源。不实现预约、认领、报错提交、我的页面、商户与运营后台。本报告只读取代码、公开快照与测试，并新增本文；未改代码/数据，未读取私有输入或密钥，未开浏览器、未调用收费或外部研究服务。以下“来源”是本地仓库已保存的来源声明，未在本轮重新核验远端原文。

## 已追踪的真实数据路径

```text
data/raw/family_fields_official.csv + data/raw/id-map.json
  → lib/import.ts: parseOfficialCsv（结构、235条、11区、名称/ID校验）
  → scripts/build-data.ts
      ├─ data/generated/catalog.json
      └─ public/data/guangzhou-institutions.v1.json
  → lib/catalog.ts（只导入公开JSON）
      ├─ app/page.tsx → 复用 app/guangzhou/page.tsx
      ├─ app/guangzhou/jigou/page.tsx
      │   → DirectoryView → lib/search + SearchForm + InstitutionList
      │   → lib/compare（compare选择）
      ├─ app/guangzhou/duibi/page.tsx
      │   → ComparisonView → lib/compare（ids选择）
      ├─ app/guangzhou/jigou/[id]/page.tsx
      │   → ReturnToList + SourceNote + CompanyInfo
      └─ app/rules/page.tsx → SourceNote
```

- `lib/types.ts:1–23` 是公开模型；`lib/catalog.ts:1–7` 是页面读取入口。没有运行时接口或当前在营状态查询。
- 正式快照实读：`schemaVersion: 1`，`snapshotId: gz-20260923`，235 条、11 区。声明原文为《广州市养老机构基本信息表》，发布日 `2026-09-23`，原文 URL 为 `https://mzj.gz.gov.cn/gk/fwjgylb/content/post_11018696.html`。
- 当前快照的电话、备案床位及三个标记均非 null；但类型、导入器与测试明确允许未知值，呈现不得因本版完整而删去 null 分支。
- 三条已知资料提示：`gz-000020` 所属区为越秀、地址含黄埔；`gz-000089` 所属区为荔湾、地址含白云；`gz-000127` 电话疑似占位，`phoneHref: null`。不得自动按地址改所属区，也不得根据电话原文自行恢复拨号链接。
- 已有 `docs/prototype-real-features-2026-11-15.md` 将派生路径写为 `data/generated/guangzhou-institutions.v1.json`，与实际脚本的 `data/generated/catalog.json` 不同。实施说明应引用真实脚本路径；本报告不改该既有文档。

## 参考页面的数据依赖与应拆开的部分

| 参考位置 | 实际数据链 | 可复用的呈现 | 不可直接继承的事实/行为 |
| --- | --- | --- | --- |
| `app/(site)/layout.tsx`、`components/SiteHeader.tsx` | `SITE`、路径函数、路由状态 | 顶部细条、品牌/搜索/导航的三段结构、1200px容器、底部排版 | `force-dynamic`、预约/认领/后台入口、原型承诺文案 |
| `app/(site)/guangzhou/page.tsx` | `listHomes/listServices/listProviders/listReports/listLeads` → `store` → `seed`，另算 stats/rankings | Hero、按钮/chip、统计带、按区格子、签约提示的版式 | 示例机构数、服务商数、认领率、月费、报错处理率、AI预约、榜单、最新业务记录 |
| `app/(site)/guangzhou/jigou/page.tsx` | `listHomes/listReports` → `gradeOf/feeFrom/completeness/riskFlags` | `PageTitle`、`FilterRows`、结果计数与卡片节奏 | 护理/价格/等级/长护险/医疗/可信度筛选，综合和价格排序 |
| `components/cards.tsx: HomeCard` | `Home` + `Grade` + 风险数 + 费用/回访派生 | 标题/副行/徽章、六列Fact网格、卡片边框与间距 | `SampleTag/ClaimTag/GradeBadge/RiskBadge`，费用、空床、性质、收住能力、回访和存管 |
| `app/(site)/guangzhou/jigou/[id]/page.tsx` | `getHome/listReports` → rules、`profile.tsx`；BookingForm → actions | 面包屑、左/顶TOC、居中分段、右侧联系卡、字段三列表格 | 虚构收费、资质、医疗、长护险、探访、回访、主体、历史和在线提交 |
| `components/profile.tsx` | `InfoField`、`Provider`、`Report`、TTL/评级规则 | `FieldTable` 三列表格、`SourcesList` 引用外观 | `confirmedAt`、保鲜期、平台核验、待审值、报错入口、EntityBox中的主体事实 |
| `app/(site)/rules/page.tsx` | 评级、榜单、费用、SLA、政策来源常量 | 标题、章节卡片、目录、字段解释表布局 | 未开展服务的规则和承诺；不得把政策链接当作某家机构的事实依据 |

参考 `lib/seed.ts:22–25` 明说机构、服务商、主体、探访、回访全部虚构，字段“来源名称”只表示未来取数方向；不能因页面带官方来源徽章就把 seed 当真实记录。`store.ts` 使用 `globalThis.__yanglaoDb` 进程内状态，重启恢复示例；不是可直接接到正式目录的 repository。

## 字段映射：只映射有来源的事实

| 正式字段/派生 | 参考视觉中的落点 | 正式显示规则 | 禁止推断 |
| --- | --- | --- | --- |
| `id` | 卡片档案链接、档案编号、对比列身份 | 保留 `gz-000001` 格式与既有稳定URL | 参考 seed 的英文ID、名称slug、根据数组位置重建ID |
| `sourceRow` | 档案来源/对比行 | “官方原表第 N 条”；默认按其升序 | 当前优先级、推荐位、评分 |
| `name` | 标题/卡片标题/对比列头 | 保留原表全称，允许换行 | 机构简称替代权威名称、同名主体已核验 |
| `district` | 面包屑、区chip、筛选项 | 正式值包含“区”（如“越秀区”），URL也保留全称 | 参考的 `h.district + '区'` 会生成“越秀区区”；不可照搬 |
| `address` | 卡片地址、概况表、对比 | 原文；冲突提示与之相邻 | 地址反推所属区、地图坐标、距离、周边医院 |
| `phone` + `phoneHref` | 卡片、右侧联系卡、档案表、对比 | 仅 `phoneHref` 非null才提供拨号；原文可复制 | 拨号点击成功=已接通/已预约；把疑似占位号码做tel链接 |
| `registeredBeds` | 副行/Fact/概况/对比 | 明确标“备案床位”，null为“原表未提供”，0仍为“0 张” | `vacantBeds`、实时规模、入住率、收住能力 |
| `advanceFee` | Fact或“预收费标记”表 | 是/否/原表未提供；注明2026-09-23快照 | 预收几个月、金额、是否合规 |
| `deposit` | Fact或预收费表 | “收取押金：是/否/原表未提供” | 押金金额、银行存管、退费保障 |
| `membershipFee` | Fact或预收费表 | “收取会员费：是/否/原表未提供” | 会员费金额或会员权益 |
| `qualityNotes` | 卡片资料提示、概况Notice、对比行 | 原表冲突/电话格式提示；无提示显示“本表未标注”或省略 | 处罚、违法、服务质量差；空数组=无风险/已核验 |
| `catalog.source`、`snapshotId` | 来源列、SourceNote、来源页 | “名单发布日期：2026-09-23”“官方公开快照”，链接原文 | “平台核对于今天”、实时更新、逐机构现场核验日期 |
| 235/11/1等公开聚合 | 首页Stat带/按区数量 | 可展示235份机构档案、11个区、1份官方名单、名单日期；数量从catalog推导 | 把未接入的数据写成0家/0条，伪装已完成统计 |

为最大限度贴近六列卡片，可把六个Fact依次用“备案床位、联系电话、预收服务费、收取押金、收取会员费、名单发布日期”；区在副行、地址单独一行。这个映射不需要扩展公开schema。若视觉契约要求继续保留“月费/空床/等级/长护险/医疗/存管”这些原始标签，则六项只能明确写“本名单未提供”，不能塞入备案床位或收费标记；相应筛选控件不能保持可点击的有效外观。

## 未知值与暂未开放控件

- 原始字段缺失：`null` → “原表未提供”；布尔值用严格比较，false是“否”，不是未知；金额0与未知不能混用。
- 当前数据范围不含：收费金额、当前空床、机构性质、收住能力、等级、长护险、医疗、处罚、平台评级/探访/回访 → “本名单未提供，需另行核实”。不要写“非定点”“无医疗”“未评定”“无处罚”“未存管”，这些都断言了未获证据的否定事实。
- 本阶段没有认领系统，不能把每家记成 `claimed: false` 再解释“机构未认领”。统一表述“本目录未开通认领/预约”，避免把平台能力缺失归因于机构。
- 工商字段应继续由 `CompanyInfo` 分模式呈现。公开版：“工商资料暂未公开”；不得从空公开实现推断“无企业主体/未登记”。
- 搜索与区筛选有真实效果；只支持 `name/district/address` 的多词检索。不能保留“海珠 失智”示例后静默忽略“失智”，也不能搜索私有企业名。
- 护理、价格、等级、长护险、医疗、可信度筛选：没有输入字段。最小实现仅开放区域行；若必须保留参考筛选区的高度/分组，用明确的静态“暂无可核验数据”说明，不制造有效计数、可点击空链接或请求成功提示。
- 排序固定“官方名单原始顺序”，不保留综合/月费排序的可执行链接。不以缺失数据计算完整度或A–D分数。
- 预约、认领、报错、后台、我的流程不能复制 `BookingForm/ClaimForm/ReportForm` 或 `app/actions.ts`。右侧原预约卡的版式可改成“联系机构”，仅提供真实电话、原表说明与来源入口；不能用提交成功、预约号、48小时处理等替代真实承接流程。
- 上门服务、价格参考、榜单、长护险指南在本阶段不创建演示业务路由。导航可沿用参考视觉，但有效链接只指向正式已有能力；不能用 `href="#"` 或现有机构页冒充目标功能。

## 最小文件/模块实施映射

1. `app/globals.css`、`tailwind.config.ts`：按参考的 `.card/.section/.chip/.input/.table-wrap/.btn` 及字阶、宽度、断点还原；这是呈现层，不能顺带搬进admin主题或业务状态规则。已有正式a11y、focus和布局规则要核对合并，避免双套相似class控制同一元素。
2. `components/SiteHeader.tsx` + `app/layout.tsx`：采用参考头尾视觉；搜索仍用GET与正式字段/URL，保留跳转主要内容、本机私有横幅及noindex。不要复制参考 `(site)/layout.tsx` 的 `force-dynamic`。
3. `app/guangzhou/page.tsx`：把参考首页的视觉结构应用到真实catalog聚合；不存在的业务统计/榜单等不得继续用seed占位。`app/page.tsx` 继续复用广州首页，不开第二份状态源。
4. `components/DirectoryView.tsx` + `SearchForm.tsx`：保留查询/URL/compare状态逻辑，以参考 `PageTitle/FilterRows` 的布局呈现区域、已选条件与结果数。筛选chip必须保留q/compare、重置page。参考原版 `FilterRows` 的“清空”直接跳base会丢compare，不能原样替换。
5. `components/InstitutionList.tsx`：直接接收 `Institution[]`，采用 `HomeCard` 的DOM层级与Fact样式；保留现有档案from参数、原生checkbox、最大3项提示和资料异常提示。不引入 `Home/Grade` 类型。
6. `app/guangzhou/jigou/[id]/page.tsx`：采用参考TOC/section/右侧联系布局；内容仍为正式概况、预收费标记、工商、来源、联系核对建议。保留 `dynamicParams=false`、`generateStaticParams` 与 `notFound()`。不搬运参考 `generateMetadata`、`Offer` 结构化数据及费用/资质断言。
7. 可从 `components/ui.tsx` 提取真正纯呈现的Logo/SectionTitle/PageTitle/Notice/Stat；不要整文件复制带来的 `lib/rules/SITE/Grade` 依赖。TOC可移入根components，但将报错入口改为可选，保留现有 `#overview/#fees/#company/#sources/#checklist` 锚点；不为相似外观重命名已存在的深链接。
8. 来源表可在档案内直接用现有 `Institution` 字段与 `catalog.source` 组合三列展示；没有第二处复杂调用前，不必新造通用Provider适配层。来源列标题用“来源与名单发布日期”，避免把发布日填进参考 `InfoField.confirmedAt`。
9. `components/ComparisonView.tsx`：保留全部业务逻辑、原生table、caption、scope、局部横滚、status与focus refs，只采用参考表格/标题/section外观。参考没有对应对比实现，不能借换皮重写选择控制。
10. `app/rules/page.tsx` + `SourceNote.tsx`：沿用参考方法论布局，解释真实字段与限制；不用参考收费/评级/报错SLA规则替换本项目事实。`lib/types/catalog/import/search/compare`、原始CSV、ID map、公开JSON均不需要因视觉移植而改动。

## URL、快照、来源与私有隔离必须保留

| 契约 | 当前实现与应保留行为 |
| --- | --- |
| 入口 | `/` 与 `/guangzhou/`；正式列表 `/guangzhou/jigou/`；档案 `/guangzhou/jigou/gz-000001/`；来源 `/rules/`；继续尾斜杠静态导出 |
| 查询 | `q`最多80个Unicode字符，空白归一化；分词AND，每个词可分别命中名称/区/地址；不更改已有URL查询语义 |
| 地区与分页 | district使用“越秀区”等正式值；20条/页；非法区、非法页/超页码明示修正；默认原表顺序 |
| 对比 | 列表 `compare=id1,id2`；对比页 `/guangzhou/duibi/?ids=id1,id2`；去重且保序，最多3家，未知ID跳过提示，输入超过512字符拒绝；至少2家才发起比较 |
| 选择状态 | URL是唯一持久视图状态；勾选/清空/移除用当前 `location.search` + 同路由 `history.replaceState`，防止快速操作覆盖；GET提交前同步隐藏compare；分页/筛选保留选择 |
| 档案返回 | 列表链接携带 `from`；`ReturnToList`只接受 `/guangzhou/jigou/` 及其query的安全路径。不要为了对比返回扩成任意URL。当前从对比进入档案只恢复compare，不恢复进入对比前q/district/page；这是已知边界，不应宣称完整恢复 |
| 来源 | 所有卡片/档案/对比基于同一版本JSON；官方链接、发布日、sourceRow、snapshotId一致。不能用当前日期刷新外观，不替换原文为搜索结果或站点首页 |
| JSON契约 | `/data/guangzhou-institutions.v1.json` 公开出口、schemaVersion 1、snapshotId/source/institutions保留；不要为卡片外观把JSON改成参考Home列表 |
| 公私模块 | `@company-data`的生产别名必须继续为companies-public；私有实现server-only、显式development且本机模式。不要将CompanySnapshot/CompanyPreview传入'use client'组件或用CSS隐藏 |
| 构建屏障 | `next.config.mjs`生产拒绝私有模式；输出扫描拒绝工商schema字段及已知私有标识。参考 `EntityBox` 中即使是示例的工商字段也不能混入公开输出 |
| 原型隔离 | 不修改 `prototype/` 的SHA锁定副本；不让正式目录依赖prototype源码/seed；不改变原型仅本机、禁止production、noindex/nofollow约束 |

## 测试保留点与本轮证据

已检查以下公共行为测试：

- `tests/data.test.ts:11–77`：235/11区、稳定ID、原表顺序、三个收费标记计数；两处区地址冲突与疑似电话；重排后ID保持；schema/缺行/身份变化阻断；null不降格成0/false。本文只静态检查该文件，未运行其末尾会读取私有CSV的测试。
- `tests/search.test.ts`：20条分页/共12页/末页15条、多词跨字段AND、非法q/district/page有提示、空结果仍可恢复到第1页。
- `tests/compare.test.ts`：已知唯一ID保序、URL编码、未知/超额/超长输入的显式处理、3家上限与移除。
- `tests/isolation.test.ts`：公开工商空实现、输出字段与标识扫描、缺输出不能伪通过、私有模块在生产导入前拒绝。定向执行未读取私有快照。
- `tests/config.test.ts`：生产阶段拒绝私有alias，公开构建始终指向空实现。
- `tests/prototype.test.ts`：完整参考副本SHA与manifest不漂移；本机开关、非开发拒绝、全路由noindex/nofollow、非法PORT立即终止。

2026-11-15在仓库根目录运行：

```powershell
rtk proxy node --import tsx --test tests/search.test.ts tests/compare.test.ts tests/isolation.test.ts tests/config.test.ts tests/prototype.test.ts
```

结果：19项通过，0失败，退出码0。未运行 `data:build/build/typecheck`，以免只读研究改动生成物或缓存；未运行全套测试以避免读取私有CSV；本报告不把历史文档中的构建/浏览器结果当成本轮验证。

视觉实施后必须补真实浏览器回归（本轮未开浏览器）：入口→多词/区筛选→跨页勾选→3家对比→档案→来源→返回；300ms慢网下快速勾选、立即提交、清空后立即提交；键盘移除3→2→1→0后焦点交接及0家播报；未知ID与空结果恢复；320/375/768/1024/1440px、真实200%缩放、长名地址、三条异常、table局部横滚。单元测试不覆盖这些呈现、竞态、焦点与布局行为。

实施失败/回滚边界：仅回滚本任务的呈现层补丁；不能用重置工作区、覆盖脏文件、删原型或放宽隔离测试恢复。开始研究时根仓库已有大量未提交/未跟踪改动，均视为用户/其他工作流所有。本文不提供像素一致的完成结论；源代码阅读只能确定映射与约束，像素一致需主代理用参考与正式页面的同视口截图核验。
