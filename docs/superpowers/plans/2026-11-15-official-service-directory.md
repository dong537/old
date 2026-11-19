# 官方服务公开记录与长护险指南实施计划

> 用户已批准“静态官方服务目录 + 长护险指南”。使用 writing-plans、subagent-driven-development、test-driven-development 和 verification-before-completion；2026-11-15，Codex GPT-6。保留当前工作区已有改动，不整体覆盖或提交。

## 目标、范围与成功标准

家属从原型的上门服务入口进入官方公开记录，按名称、地址、资料类型、所属区与年度考核等次查找，打开一条记录核对字段和原文，再通过指南理解长护险申请路径。继续沿用 `dist(1)` 已还原的页头、横向筛选行、列表卡、档案和指南 FAQ 风格。

仅提供资料查询；不开放预约、认领、后台、支付、价格、当前空床与质量排名。不把历史考核名单当作当前全量定点名单，不把所有护理机构当作上门服务商。颐康中心缺完整逐条名单，本轮不根据报道统计或名称匹配生成目录。

## Source of Truth、模型与数据流

- 来源：广州医保官方 2025 年度考核结果（2026-05-09发布，250条记录）与2026-09-01新增定点评估合格公示（1条）。两者分别保留，不按名称合并实体。
- 官方HTML → `data/raw/services/`归档及SHA256 manifest → `lib/service-import.ts`校验 → `scripts/build-service-data.ts`离线构建 → `public/data/guangzhou-services.v1.json` → 构建期档案/客户端URL筛选。构建不联网；导入失败阻断，不返回空目录。
- 来源字段：id、title、url、publisher、publishedAt、accessedAt、kind、period、limitations。记录：id、sourceId、sourceRow、name、address、district、districtBasis、recordType、providerType、assessmentGrade、serviceCategory、serviceItems。缺失字段为null；来源未区分的护理方式不可推断。由地址提取的区标为address-text，不表示服务覆盖范围。
- ID属于“来源记录”，采用来源日期/年度与原始行号，不冒充统一机构ID。每个字段均可通过记录sourceId/sourceRow回到原始行；与235家民政目录不建立自动运营关系。
- `lib/ltci-guide.ts`维护有出处的静态政策问答/流程，页面负责组合；具体待遇与资格仍由官方核定。
- 无写接口、权限角色或数据库；公开数据不含私有工商快照，不使用查企GO积分。仅URL视图状态，无个人资料收集。

## 模块及接口

- `lib/service-types.ts`导出 ServiceSource、ServiceRecord、ServiceCatalog。
- `lib/service-search.ts`导出 `searchServices(records, params)` 和 `serviceListHref(params)`：q最长80字，空格分词AND匹配名称/地址；district只接受广州11区；recordType只接受annual-assessment/designation-notice；grade只接受公开表的等次；page为正整数，每页20条，来源顺序排序。返回校正后的filters、items、total、page、pageCount及issues。非法参数说明纠正，不造成空目录误解。
- `lib/services.ts`仅导入公开JSON，提供serviceCatalog与getServiceRecord。
- `/guangzhou/shangmen/`保留原型入口，标题“养老服务公开记录”，说明其数据边界；URL为筛选唯一状态源，原生GET表单/筛选链接支持刷新与返回。无JS预渲染首20条和数据下载出口。
- `/guangzhou/shangmen/[id]/`静态记录详情：记录类型/期间→原表字段→联系前核对→来源原行；无电话时明确“原表未提供”，提供官方原文，不借用同名机构电话。
- `/guangzhou/changhuxian/`原型FAQ形式，改用已核验政策，不沿用示例名单和无出处的政策结论。
- 首页、SiteHeader、方法论、README接入上述入口，更新“未开放”旧说明。全站搜索根据当前服务页进入服务目录，其余仍查机构；不制造跨目录混合搜索。

## UI manifest 与设计依据

- 用户：家属，低频查找与反复核对。首屏判断：这是什么资料、哪个时点、是否支持自己的需求；主操作为搜索公开记录。
- 依据：本地 `prototype/app/(site)/guangzhou/shangmen/page.tsx` 与 `changhuxian/page.tsx`（用户明确指定的原型，2026-11-15读取）；外部官方表格页面为信息分组/字段顺序证据，不声称完成竞品视觉调研。保留导航位置、青色语义token、横向筛选/卡片与原生details；替换示例字段为真实公开记录；删除示例质量等级、服务价格、虚构联系电话和预约结果。
- 任务线框：标题与资料范围→指南入口/资料日期→检索与筛选行→记录数/原文排序→记录卡→分页；档案为面包屑→记录类型/名称→字段与来源→返回原条件；指南为标题→FAQ→申请步骤→名单类型区别→官方参考。
- 状态：初始、URL校正提示、空结果与清空、来源缺字段、未知/无等次、过期/历史快照。静态数据无远端loading/写入pending/权限状态，故N/A。
- 视口320/375/768/1024/1440，200%重排；原生link/button/input/select/details语义，键盘焦点可见。字号与密度沿用现有tokens，不重新设计品牌。

## 执行与验收

- [x] 数据任务：验证导入和校验；保存两份官方HTML、逐行CSV与SHA-256 manifest；定向导入/筛选测试通过。
- [x] 指南任务：核验官方政策与流程，将出处结构化并实现带引用的FAQ、申请步骤和目录入口。
- [x] 检索任务：覆盖多词、非法参数、交叉筛选、分页、未知区和等次；实现领域查询和URL生成。
- [x] 页面接入：服务列表、记录档案、首页/导航/方法论；保留现有机构目录与对比流程。
- [x] 验证：完整typecheck、生产构建和公开隔离扫描通过；独立复核完成；真实浏览器完成服务筛选→档案→返回→指南、空态恢复、非法URL恢复、键盘及320/375/720/768/1024/1440视口验收。原生浏览器200%缩放未验，720px只作有效布局宽度复核；当前全套72项测试与省级数据新基线均已通过，详见验证记录。
- [x] 记录结果、剩余限制与回滚文件。生产仍静态托管out；未指定域名，维持noindex，不部署。

## 失败模式与回滚

官方变更/403：归档快照供复核，保留原文URL与访问日期，不能伪装实时；下载失败不覆盖快照。HTML行数/表头/校验值改变：构建报错，人工审阅后再更新输入。不合格等次仅标为相应年度结果，不扩展为当前质量定性。重复名多行各自保留，计数使用“条记录”。仅撤销本轮新文件及其明确集成hunk，机构数据、私有数据、隔离原型和既有未提交改动不动。

## 最终验收补记

2026-11-15再次对最终公开构建运行 `npm.cmd run build`，497条静态页面导出成功，1,018个文件通过私有数据隔离扫描。`npm.cmd run typecheck`（正式目录和隔离原型）退出码0。完整 `npm.cmd test` 为66项中65项通过；唯一失败仍是 `tests/province-pipeline.test.ts:161` 对批次数据计数期望564、实际596，与服务目录/指南功能无关。服务导入、搜索、指南专项测试12/12通过。

独立只读审查重新核对了归档HTML、逐行CSV、SHA-256及公开JSON：两份官方表格分别对应250条年度考核记录、1条新增定点公示；公开JSON 251条、251个唯一来源记录ID，未将同名记录合并，也未推断年度考核记录提供居家护理能力。此前发现的服务档案页头搜索误跳机构目录已按真实浏览器复现后修正，现统一将服务列表和服务档案的页头搜索送入服务目录。

本机公开静态预览 `http://127.0.0.1:3210` 上由Playwright CLI完成自测：档案搜索及返回保留查询、非法“新增公示+等次”URL恢复、键盘提交空结果与恢复、指南FAQ键盘切换、字段来源链接以及区字段整理提示均通过；服务列表、档案、指南在320/375/720/768/1024/1440px下无页面级横向溢出，本站console/runtime错误为0。截图保存在Git忽略的 `output/playwright/service-directory-final-1440.png`、`service-directory-final-320.png`、`service-record-final-1440.png` 和 `ltci-guide-final-1440.png`。验收者为开发者自测，不是养老家庭用户测试。

原生浏览器缩放到200%未完成；720px视口仅作为有效布局宽度检查，不能替代浏览器缩放、字形与控件复核。无JavaScript时服务列表显示原始顺序前20条，并明确提示筛选未应用。公开记录是有日期的官方历史资料，不是当前全量定点名单；来源未给联系电话，指南未核验统一直达办事URL。项目仍未部署，维持noindex。

## 工具与验证日志

fast-context于2026-11-15返回“Windsurf API Key not found”；改用rg和直接读取调用链，不重复无效请求。项目未启用Trellis，沿用docs/superpowers/plans和docs/research；无新增长期抽象或新运行时。
