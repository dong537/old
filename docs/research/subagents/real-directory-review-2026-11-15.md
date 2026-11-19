# 真实目录前端独立审查（2026-11-15）

## 结论

根代理真实浏览器曾确认 2 项 Important：慢导航时快速连续勾选会丢失先前选择；键盘移除对比列后焦点落到 BODY（详见下节）。两项均已最小修复，本审查完成定向静态复核，并独立读取根代理最终浏览器脚本及结果后关闭。当前没有未关闭的 Critical / Important 缺陷。最新的“对比 → 档案 → 返回目录”链接也已包含 `from=encodeURIComponent(addUrl)`，可恢复对比选择。

本审查者覆盖代码、既有测试内容、最终浏览器脚本与结果阅读；下文明确归因的动态复现和回归由根代理执行，不冒充本审查者亲自执行，也不作为真实用户验证。本次按委派要求没有重跑测试，没有修改实现、测试、原型或数据。结论仅适用于本轮只读目录改动及已记录验证范围，仍保留下文历史全套测试失败、来源可访问性和原生缩放覆盖限制。

## 已确认并关闭的问题

### Important：异步 URL 导航造成连续勾选覆盖

- 位置：`components/DirectoryView.tsx:20-30`（待修复前代码）。
- 原因：每次 toggle 都基于当前 render 的 `useSearchParams()` 选择快照，随后调用异步 `router.replace`。前一次 RSC 导航尚未提交时，第二次 toggle 仍从空选择计算，发起的新 URL 取代第一次选择。
- 真实复现（根代理提供）：在 Playwright `page.route` 中给 `_rsc` 请求增加 300ms 延迟，依次立即调用第 0、1 个 checkbox 的 `click()`。两次 RSC 请求分别只带 `compare=gz-000001` 与 `compare=gz-000002`；最终 URL 仅保留 `compare=gz-000002`，界面也只选中第二家。
- 影响：用户看似完成两次加入操作，实际只保留最后一次；慢网、慢渲染或快速键盘操作会损失 URL 选择状态，违反多家选择可恢复的核心要求。
- 修复方向：为纯静态客户端视图状态使用同步 URL 更新并确保连续更新读取最新选择，或提供同等可靠的同步选择状态和 URL 协调；不能继续以尚未提交的导航快照累计选择。需同时检查对比页快速移除的同类更新路径。
- 修复复核：当前 `DirectoryView.tsx:20-31` 使用 `window.location.search` 读取最新选择，通过 `window.history.replaceState` 同步写入 URL；不再依赖未提交的 RSC 导航快照。`SearchForm` 在目录内始终保留 compare 隐藏字段，提交时从实时 URL 刷新它，覆盖初次勾选后立刻提交的窗口。`ComparisonView` 移除也按最新 location 计算并同步写入。
- 最终回归：独立读取 `final-regressions.js` 与 `final-regressions-output.txt`，脚本对 `_rsc` 请求持续注入 300ms 延迟；连续选择前两家后 URL 与 checkbox 均保留 2 家，连续加入第三/第四家保持前三家并显示上限提示；勾选后立即筛选保留选择，清空后立即筛选无有效选择，连续移除两家只剩正确第三家。
- 当前状态：已关闭；代码修复、静态复核和根代理真实 Chrome headless 定向动态回归均有证据。

### Important：键盘移除对比列后焦点丢失

- 位置：`components/ComparisonView.tsx:19,44-47`（待修复前代码）。
- 真实复现（根代理提供）：3 家对比时聚焦第一列的“移出对比”按钮并按 Enter；等待 URL 已剩 2 家且下一列移除按钮完成 render 后，`document.activeElement` 仍为 BODY。
- 原因：被操作的按钮随列一起删除，没有为删除后的可用操作设置焦点；所选数量也未作为明确的动态状态区域播报。
- 影响：键盘用户连续调整选择时丢失操作位置，需重新遍历页面；从 1 家删到 0 家时也需要稳定、可理解的恢复入口。
- 修复方向：删除后将焦点放到相邻剩余列的移除按钮；没有剩余项时放到“返回目录选择机构”链接，并提供当前选择数量反馈。
- 修复复核：当前 `ComparisonView.tsx:18-36,54-64` 以 DOM ref 保存可用按钮和返回链接，记录删除后选择 key 与相邻目标；effect 仅在该选择已经 render 后设置焦点。删中间/首列去下一列，删末列去前列，无剩余去返回目录；数量状态常驻并带 `role=status`、`aria-live=polite`、`aria-atomic=true`。
- 最终回归：独立读取最终结果，键盘 Enter 从 3→2 后焦点为颐康机构的移除 BUTTON；2→1 后为祺美机构的移除 BUTTON；1→0 后为“返回目录选择机构 →”链接，0 家 status 可见。脚本使用实际 `document.activeElement` 检查，并非仅确认目标按钮存在。
- 当前状态：已关闭；代码修复、静态复核和根代理 3→2→1→0 键盘动态回归均有证据。

## 审查依据与范围

- 需求依据：`docs/prototype-real-features-2026-11-15.md`；已有 235 家广州官方名单快照；多线索 AND 检索、行政区筛选、20 条分页、2 至 3 家 URL 对比、档案和来源；对比选择在筛选、翻页、档案往返后可恢复。
- 检查时 HEAD：`51758e2`（审查对象为其上的工作区变更，包含未跟踪的新对比文件，并非一个已提交的 Git range）。
- 本轮已跟踪变更：`components/DirectoryView.tsx`、`components/InstitutionList.tsx`、`components/SearchForm.tsx`、`lib/search.ts`、`tests/search.test.ts`、`README.md`、`.gitignore`。
- 明确阅读的新文件：`app/guangzhou/duibi/page.tsx`、`components/ComparisonView.tsx`、`lib/compare.ts`、`tests/compare.test.ts`。
- 追踪的已有边界：`components/ReturnToList.tsx`、`components/SourceNote.tsx`、列表与档案路由、`lib/catalog.ts`、`lib/types.ts`、`components/CompanyInfo.tsx`、`lib/companies-public.ts`、`next.config.mjs`、`app/layout.tsx`、`app/globals.css`、构建和公开隔离检查脚本。
- 未读取、复制或更改私有工商记录；未修改 `prototype/`。`git diff --numstat -- prototype` 无输出，当前已跟踪的本轮变更不包含原型文件。本审查没有独立重算原型 SHA。

## 核对结果

### 检索与 URL 状态

- `lib/search.ts:5-19` 先规范空白、限制查询长度，再对每个词执行 AND 匹配；每个词可以分别命中名称、行政区、地址，仍按官方原表序号排序。非法地区、页码及超范围页码保留显式提示，无结果仍有可用的第 1 页与清除条件入口。
- `components/DirectoryView.tsx:16-40` 的选择来自 URL `compare`，不依赖分页后的可见列表；翻页链接同时带上规范化查询、行政区、页码和已选 ID。
- `components/SearchForm.tsx:3-6` 使用 GET 表单和隐藏的 `compare` 字段，重新筛选时保留选择并回到首个结果页；清除筛选也保留选择。
- `components/InstitutionList.tsx:13-20` 将当前完整列表 URL 编入档案 `from`，经 `ReturnToList` 返回后可恢复筛选、页码和选择。
- `components/ComparisonView.tsx:18,45` 的档案链接将包含所有当前选择的 `addUrl` 编入 `from`。`components/ReturnToList.tsx:7-9` 仅接受 `/guangzhou/jigou/` 列表路径及其查询串，未扩大为任意外部跳转。
- 范围说明：对比页的 `ids` URL 只持有选择；对比页返回目录、对比页进入档案再返回目录，会恢复选择，不会恢复进入对比前的 `q/district/page`。本次按委派明确要求的“选择恢复”审查，此行为不列为缺陷；如将整个列表上下文跨对比往返恢复作为验收要求，则需要另行补充来源状态。

### 比较与错误恢复

- `lib/compare.ts:5-21` 限制链接长度，只接受公开快照的已知 ID，去重并保留请求顺序，最多 3 家，未知或超额输入有可见纠正说明。
- `lib/compare.ts:24-27` 可取消已有选择，第 4 家不能加入并返回明确提示。
- `components/ComparisonView.tsx:35-38` 在空选择或仅 1 家时提供返回目录继续选择的入口；保留下来的单家资料仍可访问与移除。删除到 0 家后也有恢复出口。
- `tests/compare.test.ts` 覆盖已知/未知/重复/超额/过长 ID、请求顺序、URL 编码、上限和移除；`tests/search.test.ts` 新增跨字段多词 AND 检索。本审查没有运行这些测试，不能据此宣称其本轮执行通过。

### 来源与私有边界

- `lib/catalog.ts` 实际仅导入 `public/data/guangzhou-institutions.v1.json`。新增客户端组件只接收这个公开 Catalog / Institution 数据，没有导入私有工商模块、原型 seed 或外部 API。
- 对比表仅使用原表的行政区、地址、备案床位、电话、三项预收费标记、质量提示和原表序号；空值与 false 分开显示，不把未知值补成 0。
- 对比页明确解释快照、备案床位与当前空床的区别、预收费标记与金额的区别，并提供同一来源的发布日期和官方出口。每列名称可进入带来源序号和 SourceNote 的档案。
- `SourceNote` 给外部链接附带新窗口说明及 `noopener noreferrer`。公开工商适配器返回“不公开”状态；构建期保持公开/私有 alias 分离。本轮无价格、预约、当前空床、质量排名或真实鉴权等伪造成功路径。
- `app/layout.tsx` 的 noindex 及静态导出配置未被本轮改变。

### 可访问性静态检查

- 选择使用原生 checkbox，名称包含具体机构且区分加入/移除；按钮使用原生 button，分页有导航名称与 `aria-current`，结果与纠正提示有 status 区域。
- 比较使用真实 table、caption、列/行表头 scope；滚动容器可聚焦且有可访问名称，窄屏滚动有可见说明。
- 表单 label、输入和行政区 select 的关联仍在；已有全局 focus-visible 样式保留。本审查者未自行操作浏览器或实际屏幕阅读器；根代理键盘回归证据见下节，不能由此声称所有辅助技术体验均通过。

## 最终动态证据复核

证据目录：本机 `%TEMP%/eldercare-qa-20261115/`。本审查只读以下最终文件，没有操作根代理的 `eldercare-new` 会话：

- `final-regressions.js`、`final-regressions-output.txt`：12/12 检查通过、failed 为空、运行时/console 错误为 0。覆盖慢请求下快速选择、3 家上限、原生提交竞态、连续移除、键盘焦点和 0 家状态。
- 独立解析最终 `delayedRscRequests`：19 条捕获请求全部带 `next-router-prefetch: 1`。它们是预取请求，不据此误判为选择/移除引起的 RSC 导航；同步 history 修复后的选择正确性由实际 URL 和勾选状态验证。路由钩子仍保持 300ms 延迟，不是撤掉延迟才通过。
- 首次回归脚本曾把 prefetch 计作导航并未等完 route 回调；根代理已修正为 `unrouteAll({ behavior: 'wait' })` 并记录请求 headers。这里只采用最终退出码 0 的结果，不将旧脚本误报当产品缺陷或隐去复验过程。
- `flow-output.txt`：13/13 检查通过、failed 为空。覆盖多词+区筛选、刷新、列表与对比的档案往返、三列对比、320/375/768/1024/1440px 下无页面横向溢出；窄屏由对比表局部滚动。
- `edges-output.txt`：16/16 检查通过、failed 为空。覆盖键盘勾选、分页保留选择、空结果恢复、清空、单家/空/非法对比恢复、滚动区域键盘焦点及 CSS 200% 重排。
- 根代理报告最新完整 typecheck 退出码 0；最新 build 退出码 0，静态导出 244 页，公开隔离扫描 508 文件通过。此两项执行结果由根代理提供，本审查未重跑。

## 保留限制

1. 本轮搜索/对比 8 项测试已由实现代理和根代理验证通过；历史全套 `npm test` 是 41 项中 40 项通过。唯一失败仍为 `tests/province-pipeline.test.ts:161` 对私有可变 CSV 历史行数的断言（期望 564、现为 596），未为迎合测试修改私有输入或旧测试；不能声称全套测试全绿。
2. 根代理实测 `SourceNote` 当前正确的官方来源 URL 返回远端 403。保持真实来源地址，记录为外部可访问限制；不以替换虚假或未核实来源来伪造可访问成功。
3. 200% 验证使用 CSS `document.documentElement.style.zoom`，不是浏览器原生缩放，也不声称替代了原生缩放验收。未执行实际屏幕阅读器或真实用户测试；现有辅助技术结论限于语义静态检查、DOM 状态、键盘操作和焦点。
4. 对比 URL 与对比往返恢复选择，不携带进入对比前的完整列表查询上下文；按本次“选择可恢复”的明确范围验收，不扩大成另一个导航功能。

## 工具与限制

优先尝试 fast-context（正确 project_path、tree_depth=1、max_turns=1），工具返回缺少 Windsurf API Key，未重复相同失败；随后改用定向文件读取、`rg` 和只读 Git diff。`rtk` 已可调用但提示未安装 hook。没有触碰本机私有可变数据或与本轮无关的未跟踪数据流水线文件。

本轮变更是局部只读前端能力，未引入新的长期架构/数据协议；审查结果保存在本任务记录，不新增或修改项目 spec。
