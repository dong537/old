# 原型逐页保真审查（2026-11-15）

## 结论

1. **`prototype/` 确实保存了参考界面源码，根应用并没有恢复这套界面。** 本次未采用 README 的说法作为证据，而是对 `C:/Users/Lenovo/Desktop/search/dist(1)` 与项目 `prototype/` 的同路径文件重新计算 SHA-256：`app/` 37 个、`components/` 14 个、`lib/` 13 个，共 64 个文件；其中 63 个相同，唯一差异为 `app/robots.ts`。参考与原型的 `public/` 均无文件。全部 25 个 `page.tsx`、全部共享界面组件、全局 CSS 及 Tailwind 配置均相同。
2. `prototype/source-manifest.json` 有 65 条记录。本次分别用**参考原文件**与**原型现文件**重算，65 条均与清单值一致。清单覆盖上述相同的 63 个运行时文件，加上 `postcss.config.mjs` 和 `tailwind.config.ts`，不包含有意修改的 robots。因此“清单全通过”不能表述为“整个参考目录所有文件完全相同”。
3. **正式根应用的相同主色不代表原型保真。** 页头、首页区块顺序、列表筛选形态、结果卡片、档案宽度分配、目录行为、方法论结构都有显著改写。`docs/design-contract.md` 还明确记录了上一轮主动删除区块、重组首页与列表的决定；这能解释差异，但不能满足本轮“一比一恢复所有页面”的要求。
4. **参考没有 `/guangzhou/duibi`，也没有独立 compare 组件。** 根应用对比页是新增真实功能，应融入参考的排版体系，不能称为参考页的复刻，也不应因为参考没有就删除已实现的真实对比。
5. 当前真实资料的权威输入仍是 `public/data/guangzhou-institutions.v1.json`：快照 `gz-20260923`，发布日期 `2026-09-23`，235 条广州机构记录。不得为恢复页面密度而把参考 `lib/seed.ts` 的价格、空床、等级、长护险、处罚、回访、预约、认领等示例写进正式目录。

## 范围与证据等级

- 项目：`C:/Users/Lenovo/Desktop/search/eldercare-sources`；参考：同级 `dist(1)`。
- 本次为只读源码审查，只新增本报告；未改应用、原型、数据或配置，未提交 Git，未接受或清理现有未提交文件。
- 已阅读所有 25 个参考页面的源码，以及共享布局、样式、导航、筛选、卡片、档案组件、表单和状态写入入口；核对正式应用核心页面和真实 schema。
- 遵守任务分工，**没有打开浏览器、运行页面交互或生成视觉截图**。下列“结构相同”指源码证据，不是对 3100/3210 实际渲染、字体、响应式和交互的验收结论。
- fast-context 已按 `project_path`、`tree_depth=1`、`max_turns=1` 做过一次粗查，返回 `Windsurf API Key not found`；没有尝试读取任何凭证，改用 `rg`、文件清单和已知文件阅读。未重复同一失败调用。
- 审查时工作区已有大量未提交改动，搜索和对比相关文件也在其中。报告描述的是本次读取的工作区状态，不是干净提交的构建状态；主代理并行修改后的最终状态应另行验证。

## 全量页面与路由清单

表中源码路径均相对于参考根目录；`prototype/` 下有相同路径。路由组 `(site)` 不进入 URL。25 个页面文件包含 1 个根重定向、13 个公开前台页面模板、4 个商户页和 7 个运营页；动态参数会展开为更多实际 URL。

### 公开前台与根入口

| 路由 | 源码 | 区块、组件和真实交互契约 | 正式根应用现状 |
| --- | --- | --- | --- |
| `/` | `app/page.tsx` | 服务端重定向到 `/guangzhou` | 重导出广州页面，未执行同样重定向 |
| `/guangzhou` | `app/(site)/guangzhou/page.tsx` | 渐变 hero → 两个主入口 → 自理/半失能/失能/失智及长护险快捷筛选 → 五列统计 → 承诺 → 本月榜单 → 按区找 → 签约前三件事 → 指南/价格双入口 → 最近更新；链接进入列表、榜单和档案 | 仅搜索 hero/范围侧栏、按区卡片、联系前准备三大块；顺序、布局与密度不同 |
| `/guangzhou/jigou` | `app/(site)/guangzhou/jigou/page.tsx` | `PageTitle`、七行 `FilterRows`、已选条件、关联上门服务结果入口、数量/排序工具行、逐个独立 `HomeCard`、空结果；URL 筛选和综合/价格排序 | 搜索框+区下拉、20 条分页、说明侧栏、同一 panel 内分隔列表、附加对比勾选 |
| `/guangzhou/jigou/[id]` | `app/(site)/guangzhou/jigou/[id]/page.tsx` | 面包屑、响应式双形态 `Toc`、概况/风险/收费/存管/等级/医疗长护险/探访/家属回访/主体/变更/来源、右侧预约及报错；表格字段引用、核对日期、到期/争议状态 | 顶部电话卡、五项静态目录、概况/预收费/工商/来源/建议五节；无三栏骨架和滚动高亮 |
| `/guangzhou/shangmen` | `app/(site)/guangzhou/shangmen/page.tsx` | 标题、范围说明 `Notice`、服务区/项目/类型/长护险/考核/预付款/可信度七行筛选、结果数、独立 `ServiceCard`、清空恢复 | 无对应路由 |
| `/guangzhou/shangmen/[id]` | `app/(site)/guangzhou/shangmen/[id]/page.tsx` | 与机构档案同骨架；概况、风险、项目收费、长护险考核、护理员、预付款、体验服务、回访、主体、变更、来源；右栏预约上门评估 | 无对应路由 |
| `/guangzhou/changhuxian` | `app/(site)/guangzhou/changhuxian/page.tsx` | 标题、六个原生 `details/summary` 问答（默认展开“怎么申请”）、机构护理与居家护理双栏名单、解释提示、参考来源；定点筛选和档案链接 | 无对应路由 |
| `/guangzhou/jiage` | `app/(site)/guangzhou/jiage/page.tsx` | 标题、示例价格警示、四种护理月费统计卡、上门服务价格入口 | 无对应路由 |
| `/guangzhou/jiage/[type]` | `app/(site)/guangzhou/jiage/[type]/page.tsx` | `type=zili/banshineng/shineng/shizhi/shangmen`；五个页内类别导航，护理类型为按区中位数/范围/样本表及参与机构，上门为项目/单位/样本/长护险表；非法类型 `notFound` | 无对应路由 |
| `/guangzhou/bangdan` | `app/(site)/guangzhou/bangdan/page.tsx` | `tab=home/service` 双视图、参与池/未发布原因 Notice、三列榜单卡、前十名或整榜不发布状态、每卡原生“怎么算的”展开项 | 无对应路由 |
| `/rules` | `app/(site)/rules/page.tsx` | `PageTitle`、十二锚点导航、十二节方法论与表格，详见后文；不是只有来源说明 | 有路由，但改为窄栏四节说明，没有参考锚点导航与体系 |
| `/claim` | `app/(site)/claim/page.tsx` | 左列表搜索未认领机构，右侧流程/材料勾选申请表/待审核结果；`id/q` 查询参数，`ClaimForm` pending/error/success；材料仅勾选、不上传 | 无对应路由 |
| `/report` | `app/(site)/report/page.tsx` | `id/field` 定位字段；720px 宽表单、字段选择、正确情况、选填联系方式、提交/取消；pending/error/success；无有效对象显示恢复入口 | 无对应路由 |
| `/me` | `app/(site)/me/page.tsx` | 我的预约和报错两节，状态 chip、时间、档案回链、回应及结论；各自空态；源码明确无登录、进程重启清空 | 无对应路由 |

### 商户后台

共享壳为 `app/merchant/layout.tsx`：白色顶栏、品牌、示例账号切换、回前台；桌面 200px 白色侧栏，窄屏横向换行导航；内容 `p-6/gap-5`。`MerchantNav` 显示工作台/预约线索/报错回应/信息维护及数量；线索包充值和年费会员是明确的“下一期”文本，不是可执行入口。

| 路由 | 页面与主要区块 | 交互 |
| --- | --- | --- |
| `/merchant` | `app/merchant/page.tsx`；机构名/前台入口，五列统计，风险 Notice，来源条形分布、榜单位置双栏，待办 | 账号切换影响当前示例商户；待办跳线索/报错/维护；统计来自演示 store |
| `/merchant/leads` | `app/merchant/leads/page.tsx`；说明、预约表（预约/需求/来源/状态/申诉）、空态 | 状态下拉保存；48 小时内申诉理由选择/提交，之后显示过期；显示审核中、退额或拒绝 |
| `/merchant/reports` | `app/merchant/reports/page.tsx`；待处理卡片、倒计时、已回应文本、已结案列表 | textarea 回应并提交；无待处理时空态 |
| `/merchant/info` | `app/merchant/info/page.tsx`；说明、机构空床更新表单、字段/值/来源与保鲜期/操作表 | 空床数边界，字段“无变化”确认，锁定字段修改提交审核；官方字段不可改，存管材料更新注明未开放 |

正式根应用没有上述四个路由或商户布局。它们在 `prototype/` 可演示，并不代表正式账号、权限、持久化、额度或业务已实现。

### 运营后台

共享壳为 `app/admin/layout.tsx`：桌面 208px 深灰侧栏 `#262A30`、浅色品牌/导航与计数、右侧内容；窄屏侧栏变整宽顶部。`AdminNav` 中城市合伙人、规则配置、审计日志是“下一期”文本。

| 路由 | 页面与主要区块 | 交互 |
| --- | --- | --- |
| `/admin` | `app/admin/page.tsx`；四列统计、可信度分布表、六类待办 | 各队列入口，回前台；AI 引用率外部脚本明确下一期 |
| `/admin/claims` | `app/admin/claims/page.tsx`；认领材料卡、申请人/登记电话、已处理列表 | 通过，或填写原因后不通过；前台档案回链 |
| `/admin/reports` | `app/admin/reports/page.tsx`；报错卡、原值/家属/机构回应/倒计时 | 输入正确值后“属实，更正”，或“不属实，保留原值” |
| `/admin/appeals` | `app/admin/appeals/page.tsx`；待处理申诉卡、理由、演示联系人/时间 | 属实退回额度，或不属实 |
| `/admin/changes` | `app/admin/changes/page.tsx`；关键字段原/新值对照卡 | 核对生效或退回；档案链接 |
| `/admin/visits` | `app/admin/visits/page.tsx`；探访/体验抽检卡、提交人/日期/照片数量/发现项 | 抽检通过或重新探访 |
| `/admin/freshness` | `app/admin/freshness/page.tsx`；到期日升序的档案/字段/状态/到期日表 | 档案入口，非写入队列 |

正式根应用没有这七个路由。`app/actions.ts` 与 `lib/store.ts` 将这些操作写到进程级 `globalThis.__yanglaoDb`，账号切换只写 merchant cookie，不能复制为真实权限和审计实现。

### 非页面路由与补充文档

- `/api/public/v1/jigou`、`/api/public/v1/shangmen`：两个公开 GET 路由，输出 `sample: true` 的参考示例字段和来源结构。
- `/llms.txt`：原型介绍与 API/档案引用说明。
- `/robots.txt`、`/sitemap.xml`：参考有公开抓取规则和动态站点图；prototype 有意将 robots 改为全禁抓，并为所有路由加 `X-Robots-Tag: noindex, nofollow`。
- `app/not-found.tsx`：24px 标题、说明、回广州首页按钮的集中空白页。不是独立正常页面路由。
- 参考 `docs/养老信源平台介绍与合规说明.html/.pdf`、`方案修改-居家上门服务进第一期.md` 是交付文档，不是 Next 页面；prototype 未复制这三份文档和 PDF 修复脚本，不能算页面缺失。

## 共享视觉基线与组件契约

### Tokens 与基础尺寸

| 项 | 参考值 | 根应用差异/注意点 |
| --- | --- | --- |
| 容器 | `max-w-site=1200px`，`px-4 sm:px-6` | 宽度 token 相同，但不能由此推导内容布局相同 |
| 主色 | brand `#0F6A6E`，dark `#0B5357`，tint `#EAF5F5`，line `#C9E3E3`，ink `#0B4245` | 根应用保留这一组 |
| 中性色 | ink `#1F2329`，body `#3D434B`，sub `#5C626B`，page `#F6F7F9`，line `#E8EAED`，hair `#F0F1F3` | 根应用缺 hair token |
| 可信度 | A `#1E6B45/#E7F5EC`；B `#2456A6/#EAF1FC`；C `#4A5059/#EEF0F2`；D `#7A4A00/#FFF2D9`，soft `#FFF8EA`，line `#E9C27A` | 根应用以 caution 代替部分 D 色，无 A/B/C 语义。视觉 token 可补，真实机构不据此被赋 A–D |
| 风险/官方来源 | risk `#A1260D/#FDECEA/#F2C1B8`；official `#5B3F99/#F1ECFA` | 根应用未复用；官方来源紫色与青色的语义不同 |
| 后台 | admin.nav `#262A30`，text `#E6E8EB`，muted `#B9BEC6` | 正式根应用无后台壳 |
| 字体 | 中文系统 sans，正文 15px，辅助 13px/12px | 根应用 body `text-base` 为 16px，密度更松；标题也常改为 30–36px |
| 标题 | `PageTitle` 26px/700；首页 28px，sm 32px；`SectionTitle` 18px/600；卡片标题 17px | 根应用首页 30/36px、列表 30px、档案 24/30px，层级不同 |
| 表面 | `.card=rounded-xl/border-line/bg-white`；`.section=card/gap-4/p-5 sm:p-6` | 根应用 `.panel/.section-panel` 相近但 sm 改 p-7，页面组装也不同 |
| 按钮/输入 | `.btn` 44px、gap1.5、px5、8px 圆角；小按钮36px；`.input`44px、边框`#D5D8DD`；textarea同边框 | 根应用 field48px、边框`#767676`，btn 用 min-height；不可把这些都称为相同样式 |
| 表格 | th13px浅灰底、px3/py2；td发丝分隔、px3/py2.5；`.table-wrap`横向滚动 | 正式对比单独写16px padding体系，需与全站表格统一但保留可访问语义 |
| 焦点 | 2px品牌outline、offset2 | 根应用3px/offset4，属于有意增强，不是原型原值；验收需明确允许差异 |

### 页面壳与关键组件

- **前台页头**（参考 `components/SiteHeader.tsx:10–90`）：第一层灰色信息条+我的预约/认领/商户/运营入口；第二层 48px Logo、24px 品牌及名称注释、城市 chip、flex 搜索表单；第三层七项横向可滚动主导航。搜索由受控输入提交 `q` 到机构列表，活动项有底部 3px 青线与 `aria-current`。根应用只有信息条和品牌/三项导航，没有全站搜索及四个辅助入口。
- **前台壳**（`app/(site)/layout.tsx`）：纵向 flex、main `flex/gap-6/py-6`、底部小号（12px）说明和六个入口。根应用 main `py-7 sm:py-10`，footer更高、14px且只有来源/JSON两个入口。
- **机构筛选**（`components/FilterRows.tsx`）：72px 固定标签列、每行“全部”及带数量的 chip；选中填青、零结果选项变灰但仍可访问；已选条件可逐一移除，也可清空；每次链接保留其他筛选。`countBy` 的数量为“应用其他条件后再统计本项”。根应用下拉筛选不能替代这一结构。
- **机构结果卡**（`components/cards.tsx`）：每家独立 white/card/p5、标题与示例/认领/等级/风险徽标两端排列；副标题一行区/性质/床位/收住；下方 `grid-cols-2 sm:3 lg:6` 六项事实；底部回访文本。根应用结果为一个 panel 内 divide-y，多一颗“查看档案”outline按钮，视觉节奏完全不同。
- **档案目录**（`components/Toc.tsx`）：`xl` 以上120px左栏sticky；`xl`以下为顶部sticky横向条。监听滚动/resize、以requestAnimationFrame更新当前项、滚到底部选最后一项；点击平滑滚动并replace hash；横向条自动让当前项可见；侧栏有报错/返回顶部。根应用静态190px目录缺这些行为。
- **档案主内容与右栏**：参考内容 `flex min-w-0 flex-1 gap-5`；`lg`以上右侧320px sticky预约/报错栏，`lg`以下在正文末尾；`xl`以上再增加左目录，形成120px/弹性正文/320px三栏。根应用是190px/弹性正文两栏，电话卡在目录之前。
- **来源字段表**（`components/profile.tsx` 的 `FieldTable/buildRefs/SourcesList`）：项目/内容/来源与核对日期三列，来源去重编号，`Ref`为来源锚点，逐字段“这项有误”、保鲜期/争议/待审状态。根应用 `SourceNote` 只标单份名单总来源，无逐字段表。
- **告知与空态**：参考通过 `Notice` 的info/warn/risk/ok四种语义和`Empty`虚线框区分，不应统一为一种黄色提示；真实未知不是零、否或“正常”。

## 核心页面结构差异与可执行修复清单

优先级描述恢复次序，不授权额外引入假数据或真实写入系统。根应用现有 URL 检索、稳定 ID、返回筛选、对比、公开/私有隔离应继续保留。

| 优先级 | 页面/差异 | 执行动作 | 复用来源 | 验收要点 |
| --- | --- | --- | --- | --- |
| P0 | 正式入口仍是另一套页面 | 明确正式根应用恢复的是参考的界面结构；不能只把默认dev指向3100后宣告3210/正式目录已恢复 | 根 `package.json`、`scripts/prototype.mjs`与根页面 | 正式目录端口直接访问所见与交付说明一致；不会进入示例store |
| P0 | 页头/页脚全局结构不同 | 按参考恢复三层页头、Logo尺寸、搜索、主导航间距、主区域间距和页脚；各入口必须到真实页面或诚实的未接入说明 | `prototype/components/SiteHeader.tsx`、`components/ui.tsx`、`app/(site)/layout.tsx`、`app/globals.css`、`tailwind.config.ts` | 同视口首屏比对；搜索/活动项/横向导航键盘可用；无假链接 |
| P0 | 首页从8组区块降为3组，hero改成双栏搜索 | 恢复参考的单栏hero、双用途入口、快捷条件位置及后续区块顺序；数据缺失使用真实范围/未知/未接入状态，不再自行重组为另一种首页 | `prototype/app/(site)/guangzhou/page.tsx:40–190`、`Stat/SectionTitle` | 逐块勾对8组；统计可追到235快照或明确未建立，不能出现示例价格/转化率 |
| P0 | 机构检索用表单和侧栏替代行式筛选 | 恢复宽内容区与筛选行外观；现有q/district和真实字段可执行，照护/价格/等级等没有数据的条件明确不可用，不能变为暗中的空结果过滤 | `prototype/components/FilterRows.tsx`、`app/(site)/guangzhou/jigou/page.tsx`；根`lib/search.ts`保留 | 搜索AND语义/非法参数/空态/分页/compare选择保留；未支持条件不伪装可用 |
| P0 | 机构卡共用外框且信息结构不同 | 按HomeCard独立卡片结构展示真实名称、区、地址、备案床位、电话、来源；六项事实所缺数据标未知。对比勾选以现有功能加入卡片操作区 | `prototype/components/cards.tsx`、根`InstitutionList.tsx` | 卡片间gap、p5、标题17px和响应式事实网格对齐；备案床位不会显示为空床 |
| P0 | 档案两栏替代三栏，多数参考分节消失 | 先恢复120/弹性/320宽度及响应式目录行为，再逐节恢复结构；费用、存管、等级、长护险、探访、回访、变更等保留明确无资料状态。右栏显示真实电话和“在线预约尚未接入”，不提交演示预约 | `prototype/app/(site)/guangzhou/jigou/[id]/page.tsx`、`Toc.tsx`、`profile.tsx`、`ui.tsx`；根`ReturnToList/CompanyInfo/SourceNote`保留 | 目录所有锚点可达/滚动高亮/不遮标题；右栏在lg断点重排；235真实ID均正确 |
| P0 | 方法论来源页被压缩 | 复用参考PageTitle、锚点导航、section/table排版；针对当前真实能力填充收录/来源/未知/顺序/更新/隐私等事实。未开通的评级/排行/预约必须标未运行，不能照搬SLA和收费承诺 | `prototype/app/(site)/rules/page.tsx`、根`app/rules/page.tsx` | `#sources`等已链接锚点真实存在；来源日期不被称为逐条复核日期；全部主张有实现或资料支持 |
| P1 | 参考导航其余页面在正式应用404 | 按本报告路由逐个恢复页面壳、标题、区块与原生交互；资料/功能未接入的页展示准确状态、来源及返回路径；运营/商户演示继续隔离，正式生产入口不能无鉴权可写 | 各对应`prototype/app/(site)`页面与布局 | 所有导航不404；没有示例机构/价格/评级冒充真实；明确完成范围 |
| P1 | 对比是新增页面，视觉沿用旧目录 | 保留真实2–3家URL对比，把页头、标题、表格、来源和按钮节奏对齐参考；保留移除后的焦点恢复和URL选择 | 根`ComparisonView/compare.ts` + 参考`ui/globals.css` | 0/1/2/3家、未知/重复/超额ID、移除/返回添加均正确；按表格比较官方字段 |
| P1 | 全局字号/spacing不同 | 以参考15px正文、26px页面标题、18px节标题、卡片padding和main gap为基线逐项迁移；不要只加一层颜色覆盖旧布局 | `prototype/app/globals.css`、`tailwind.config.ts`、`ui.tsx` | 同视口截图检查内容密度；明确记录仅为可访问性保留的差异 |
| P1 | 来源/未知/风险语义混合 | 恢复来源标签与风险视觉分工，但不把“数据缺失”标为“机构风险”，也不为未知机构计算D | `prototype/ui.tsx`、`profile.tsx`；根真实schema | 原表无处罚记录不等于无处罚；资料待核对不等于服务质量结论 |

### 五个重点页面的区块对照

**首页**：参考的八组为 ①hero及快捷筛选 ②五统计 ③承诺 ④本月榜单 ⑤按区找 ⑥签约前三件事 ⑦指南/价格双入口 ⑧最近更新。根应用只有“搜索及范围双栏/地区/联系准备”，保留了大致颜色和部分文案题材，不能算同版。恢复时，真实可统计的是235机构、11区、来源日期及已公开字段；没有真实服务商、预约、价格或变更事件时分别说明未收录/未接入，不造“0条真实业务”数据。

**机构检索**：参考无分页，所有匹配结果独立卡片；根应用有20条分页，这是235条数据下已有可用能力，不能为了照抄小样本取消。可以保留分页并恢复参考筛选/工具行/卡片，记录为真实数据规模带来的受控差异。参考综合排序依据A–D及完整度，根应用按官方sourceRow，不应套用虚构评分；工具行需说明实际排序。

**机构档案**：参考固定主体章节为overview/fees/custody/level/medical/visits/followups/entity/history/sources，risk按有证据才出现；根应用是overview/fees/company/sources/checklist。`fees` 在根应用被用于三项预收费标记，和参考“分项月费”含义不同；迁移时保留真实字段含义并调整清楚的节标题/锚点，不能把是/否放进金额表。参考`entity`也不等于根应用已验证工商运营主体。

**对比**：无参考对应页。正式比较九行（行政区、地址、备案床位、电话、预收养老服务费、押金、会员费、资料提示、源行号）可继续使用；只有样式需要接轨。不能照搬HomeCard六项未知状态去覆盖这些已有真值。

**来源/方法论**：参考十二节为commitments/scope/sources/grades/risk/freshness/sorting/rankings/leads/reports/privacy/fees。根应用四节为当前范围/字段解释/局限/更新核对，且仅有`#limits`锚点。`/rules#commitments`、`#sources`、`#sorting`等若随参考页头和卡片引入，应一并建立对应内容，不能形成无效页内跳转。

## 复用文件与数据隔离边界

### 建议直接以现有prototype源码为视觉提取源

- `prototype/tailwind.config.ts`、`prototype/app/globals.css`：完整tokens、基础字号、table/按钮/card/section契约。
- `prototype/components/icons.tsx`、`ui.tsx`：品牌、标题、统计、告知、空态等；`GradeBadge/ClaimTag`依赖业务事实，不能无条件搬到真实机构。
- `prototype/components/SiteHeader.tsx`、`app/(site)/layout.tsx`：三层前台壳。需要将导航、文案和搜索参数接到真实能力，不把参考原型免责声明误用于生产或删除必要数据说明。
- `prototype/components/FilterRows.tsx`：行式筛选组件与URL保留契约可复用；过滤规则应继续以真实schema为权威，缺字段的count不能按假数据计算。
- `prototype/components/cards.tsx`：提取卡片DOM/间距与响应式事实grid；不要把正式`Institution`强行cast成参考`Home`以满足props。
- `prototype/components/Toc.tsx`：可复用双形态目录、scrollspy、hash行为。原版平滑滚动未判断`prefers-reduced-motion`，正式版本应保留用户已有的减少动效支持，不能因保真退回可访问性。
- `prototype/components/profile.tsx`、`Ref.tsx`：字段表、来源去重、来源列表的结构；逐字段“核对”日期只能用真实数据，名单发布日期不能冒充人工核验日期。
- `prototype/app/(site)/guangzhou/*`、`app/(site)/rules/page.tsx`：逐页区块顺序、标题级别和主要断点。可逐页转接现有数据，不要全body重写后丢失真实路由与状态。

### 必须继续由根应用负责的真实逻辑

- `lib/catalog.ts`、`lib/types.ts`与公开JSON：235条源数据和稳定ID；源日期为名单发布日期。
- `lib/search.ts`、`DirectoryView.tsx`、`SearchForm.tsx`：80字符上限、多词AND、非法区/页码反馈、分页与筛选URL。
- `lib/compare.ts`、`ComparisonView.tsx`、列表compare参数：最多3家、至少2家开始比较、参数纠正、选择保留和移除焦点恢复。
- `ReturnToList.tsx`：原筛选返回；`SourceNote.tsx`：单源、快照、字段口径；`CompanyInfo.tsx`与`@company-data`隔离：公开构建不泄露本机第三方工商快照。
- `next.config.mjs`的静态export/预生成边界及公开输出检查。参考`force-dynamic`、server actions、cookies不能直接复制到该静态生产路径。

### 只允许保留在隔离演示中的参考实现

`prototype/lib/seed.ts`、`store.ts`、`merchant.ts`、`admin.ts`、`rankings.ts`、`stats.ts`与`app/actions.ts`不是生产事实或后端。`BookingForm/ClaimForm/ReportForm`的提交成功、SLA、额度返还和示例身份也不是已上线能力。其界面可以作为结构参考；正式可写业务要有后端持久化、权限、审计和真实失败反馈，不能把演示内存操作当作恢复完成。

| 字段/能力 | 当前正式Source of Truth | 恢复时允许展示 | 禁止推断 |
| --- | --- | --- | --- |
| 名称/区/地址/电话 | 235快照，保留原表及qualityNotes | 真值与明确异常提示 | 同名即运营主体、电话已接通 |
| 床位 | `registeredBeds` | 备案床位 | 当前空床、入住率 |
| 三项预收费 | nullable boolean | 是/否/原表未提供 | 金额、服务免费、存管已核验 |
| 等级/照护/长护险/医疗 | 当前快照无字段 | 未收录、需核实 | false/非定点、低等级、风险、推荐 |
| 价格/统计/排行 | 无真实支持 | 尚无可核统计；解释缺少哪些来源 | 示例中位数、假0、A–D评级 |
| 工商关联 | 本机私有派生快照且关系未核实 | 公开不展示，私有解释匹配依据 | 已确认运营/签约主体 |
| 预约/认领/纠错/后台 | 无正式写入实现 | 清楚的未接入状态或隔离演示入口 | 生产提交成功、真实SLA、登录身份 |

## 原型一致性中的有意差异

- `prototype/app/robots.ts`：参考允许前台/API抓取，原型全禁抓。
- `prototype/next.config.mjs`：仅允许`ELDERCARE_PROTOTYPE_LOCAL=1`的development phase，所有路由加noindex/nofollow头，关闭devIndicators；禁止production build/start。与参考普通Next配置不同。
- `prototype/package.json`：只保留本地原型名称/private，依赖从根目录复用；参考Next为15.5.28，根依赖为15.5.29，React同为19.1.10。源码相等不能排除依赖版本的渲染/运行差异。
- `prototype/README.md`为本地说明，原参考README另存；参考package-lock、交付说明文档及构建缓存不属于本次页面源码SHA覆盖。
- 根`npm run dev`已指向`dev:prototype`，默认3100；`dev:directory`及公开`build/preview`仍走根应用。**启动默认项变化不会自动改变正式静态产物。** 实际端口3210来自本轮运行方式，不能由package脚本反推。

## 主代理接续验证清单

本报告没有浏览器完成证据，以下为交付所需的接续工作，不是本次已通过的断言。

1. 在同一机器和依赖下，以3100参考原型与正式目录分别逐路由截图；覆盖至少1440×900、390×844、320×844，并按项目既有要求补375/768/1024与200%缩放。要验证所有25个参考模板的对应状态，不能只看首页。
2. 按导航进入页面，验证回退/刷新/直接URL；检索q、多词、区、空结果、非法参数和分页；235档案稳定ID；对比0/1/2/3/超额/未知ID与返回筛选；来源锚点与原文出口。
3. 档案在lg/xl两侧验证目录/正文/右栏布局；逐项点击锚点、滚动高亮、目录横向可见、返回顶部、减少动效，检查焦点、遮挡与横向溢出。
4. 对没有真实数据或业务的页面，断言展示的是正确未知/未接入状态；没有示例机构混入正式JSON、schema/JSON-LD或API，没有可点击的假支付/假预约/假认领成功。
5. 直接读取真实package scripts后运行相关测试、两套typecheck与正式build/公开产物检查；恢复样式不应破坏搜索、对比、ID或私有隔离的已有测试。构建通过不能代替浏览器任务验证。
6. 最终列出逐页保留的差异：真数据带来的文案/数量、未知态、20条分页、原表排序、真实对比、无真实写入、可访问性增强。除这些有理由的差异外，以参考DOM/样式契约核对，不再自行重新设计。

## 本报告验证

- SHA核查：65条清单对参考与原型均通过；运行时64文件中仅robots不同；25页面源码均相同。
- 全页阅读：公开13、根入口1、商户4、运营7，另读API/404/布局/关键组件；未把文档HTML/PDF算作站内页面。
- 真实数据核对：只读取公开JSON的source/snapshotId/count，确认235及2026-09-23；未访问私有数据或任何密钥。
- 本次不运行浏览器、不改生产代码、不操作演示表单；最终UI保真和正式流程仍待主代理完成真实浏览器验收。
