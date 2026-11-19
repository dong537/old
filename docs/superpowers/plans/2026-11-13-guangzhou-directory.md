# 广州真实机构目录实施计划

> **For agentic workers:** 使用 subagent-driven-development 分任务实施与审查；不重复请求已批准的实现授权。

**Goal:** 家属可以搜索235家广州官方机构，打开档案核对来源；本机单独查看已有工商快照。

**Architecture:** Next静态生成与客户端URL筛选，官方与私有工商分别编译。权威数据、关系与未知分离，导入失败阻止构建。

**Tech Stack:** Next15、React19、TS5、Tailwind3、csv-parse、tsx/node:test。

## Global Constraints

- 235条官方记录、11区；床位是备案数，不是空床。
- 126个工商主体关联144条机构；候选主体名与登记名126完全一致、18仅括号差异，不用于声称机构运营关系已核实。
- 86无明示主体、5待复核；不伪造登记、收费金额、空床、评级、预约、榜单。
- 私有数据留在gitignore，公开模块不导入私有JSON，私有模式只允许development与loopback。
- ID固定gz-000001至gz-000235，snapshotId=gz-20260923，源日期2026-09-23。
- 原型只读，新工程独立Git；无运行时付费请求、数据库、常驻生产Node服务或Docker。

### Task 1：真实数据导入与领域查询（子任务）

Files：lib/types.ts、lib/import.ts、lib/catalog.ts、lib/search.ts、lib/companies-public.ts、lib/companies-local.ts、scripts/build-data.ts、scripts/check-public-output.ts、data/raw/*、tests/data.test.ts、tests/search.test.ts、tests/isolation.test.ts。

Interfaces：`Institution`字段id/sourceRow/name/district/address/phone/phoneHref/registeredBeds/advanceFee/deposit/membershipFee/qualityNotes；三个标记为boolean|null。`catalog`为{schemaVersion:1,snapshotId,source:{title,url,publishedAt},institutions:Institution[]}。`districts`为string[]。

`searchInstitutions(institutions, {q?,district?,page?})` 返回{items,total,page,pageCount,q,district,issues:string[]}，每页20、默认源序、规范化空格、匹配名/区/地址、越界页修正并提示。`getCompanyPreview(id)`返回null或{company:Company,link:InstitutionCompanyLink}；`privatePreview:boolean`。Company含name、creditCode、legalRepresentative、status、establishedAt、registeredCapital、paidInCapital、enterpriseType、approvedAt、region、authority、address、businessScope。Link含candidateName、matchType:'exact'|'parentheses'、evidence、relationshipVerified:false、queriedAt。`getCompanyStatus(id)`返回'matched'|'unidentified'|'review'用于本机，公开一律'not-published'；类型可加该项。

- [x] 先写实际CSV235行、异常、稳定ID、126/144关联、非法输入/分页等行为测试，运行失败。
- [x] 导入CSV严格校验，生成官方catalog.json与public/data/guangzhou-institutions.v1.json；公开常量模块只读公开JSON。
- [x] 私有模式仅从已留存CSV读取，不复制原始回包或密钥；输出data/private/generated/company-preview.json，public实现始终null；本机模块只供webpack别名。
- [x] 公共输出扫描私有字段与信用代码；无私有输入时仍扫描字段特征。测试隔离失败fixture。
- [x] 运行`npm run data:build`、`npm run data:private`、`npm test`，记录RED/GREEN证据，明确源表哈希/异常报告，不擅改UI/config。

### Task 2：真实页面与工程（主任务）

Files：app/*、components/*、scripts/dev-private.mjs、scripts/preview.mjs、README.md、docs/verification.md、next.config.mjs。

- [x] 使用Task1接口，首页GET搜索、11区入口、名单日期；仅真实入口。
- [x] 列表由客户端URL状态驱动，GET表单/区select/原生分页链接、空态/非法参数提示/重置；浏览器返回恢复。
- [x] 预生成235档案，电话疑似占位禁拨，预收费标记来源日期明确，私有工商分来源显示、匹配≠运营核验；无效ID404。
- [x] 规则页解释来源、字段、限制、核验建议；无假表单。页头/页尾/跳过导航、焦点、响应式沿用原型tokens。
- [x] 私有dev仅127.0.0.1，禁止production；默认public build与本机静态preview，测试真实路由404。

### Task 3：验证与审查

- [x] `npm test`覆盖数据、搜索、隔离；`npm run typecheck`、`npm run build`通过。
- [x] 浏览器完成首页→检索→区过滤→档案→来源→返回；空态/非法参数/404、Back、电话、键盘。外站在测试浏览器403，已记录。
- [ ] 截图320/375/768/1024/1440及200%缩放；检查无溢出、无console/runtime错误；记录自测与证据路径。前五个宽度及720px有效视口已完成，真实200%浏览器缩放因工具连接不可用而待复核。
- [x] 独立代码审查，修正问题后复验；README记录公开/私有启动、数据更新、产物、发布与回滚边界。
- [x] 更新计划状态与验证记录，明确未部署/授权限制；Git保留可审查提交。
