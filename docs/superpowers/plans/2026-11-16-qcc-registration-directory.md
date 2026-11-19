# Guangdong QCC Registration Directory Implementation Plan

> **For agentic workers:** Use subagent-driven-development or executing-plans task by task. Checkboxes track verified outcomes; preserve all existing uncommitted work.

**Goal:** 在现有 /eldercare/ 站点独立展示 6,777 条广东登记主体宽口径候选记录，并从 157 个官方来源名称键链接到 158 条候选主体记录，不改变养老机构计数，也不逐条背书养老关联。

**Architecture:** 私有冻结 XLSX 经离线 Python 投影成最小索引、100条左右一块的详情 JSON 与官方来源候选关联 JSON。Next 静态页面按需读取公开 JSON；现有输出隔离扫描只对精确 QCC 投影路径采用严格字段白名单，其他路径继续执行原禁令。

**Tech Stack:** Next.js 15.5、React 19、TypeScript、Tailwind CSS 3、Python 3/openpyxl 3.1.5、Node test、pytest、Nginx 静态发布。

## Global Constraints

- 用户已确认企查查逐家登记字段有公开展示授权；公开版本仍排除手机、电话、邮箱、企业简介及原始 XLSX。
- 6,777 条是登记主体搜索结果，不叫养老机构；官方来源与主体之间只有“同城同名候选”关系，不证明运营。
- 原件 SHA-256 固定为 e573e8072e65385b48185e5645fffc0ce297a2c28aeae11ed5272ac4f926e480；首版要求 37列、6,777行、21市。
- 92条缺代码、2条校验位错误仍保留并标记；注销、事业单位和同名多代码分别处理。既有781条来源、235条广州档案不改。
- 生产仅静态导出到 /eldercare/，保持 noindex；无运行时企查查或查企GO API，保留旧发布版本回滚。
- 原仓库有大量用户未提交改动，只修改本计划列出的文件，不执行宽泛 Git 清理或提交。

## Task 1: 冻结公开主体投影

**Files:** 新增 scripts/build-qcc-public.py、tests/test_qcc_public.py；生成 public/data/qcc/index.v1.json、public/data/qcc/links.v1.json 与 chunk-001.v1.json 等分块文件。输入仅为 data/private/guangdong-eldercare-source/research-batch29-qcc-export-20261116/ 下的原件和公开781条 JSON。

**Interface:** index 记录 id/name/city/subjectType/registrationStatus/chunk；分块记录含 id、原件行号、代码与校验状态、法定代表人、登记状态、成立日期、注册资本、行业分类、地址、经营范围、参保人数及年报期等白名单字段，空值为 null；links 为 sourceRecordId → subjectIds[]。稳定 id 用有效代码的哈希；无代码用名称、城市、原件行号哈希，并检测碰撞。

- [x] 先写失败测试：原件 A1 维度错误时仍读到37列及全部行；坏哈希/变动标题/空值/联系方式/两主体对应一个来源 ID 均有明确断言。执行 python -m pytest tests/test_qcc_public.py -q，确认缺实现而失败。
- [x] 实现投影与 CLI 参数 --check；代码校验按统一社会信用代码标准实现并测试，生成 6,777 条索引、21市、157个链接键/158个主体引用、按100条分块；按导出行号保序。无效代码不写成有效登记身份。
- [x] 运行 python scripts/build-qcc-public.py 与 --check，再运行专项 pytest；输出文件哈希、数量、每块大小及无电话/邮箱字段的审计结果。

## Task 2: 静态隔离门禁

**Files:** 修改 scripts/check-public-output.ts、tests/isolation.test.ts；必要时新增 lib/qcc-public-schema.ts。

- [x] 先写失败测试：只有精确 public/data/qcc/ 版本化 JSON 可包含批准的登记字段；任何一个额外 contact/email/phone 原字段、额外 JSON key、非 QCC 文件中的工商标识、原 XLSX 文件或非预期 schema 均阻断。
- [x] 修改扫描器对 QCC 投影作结构化字段白名单验证和手机号/邮箱特征扫描，保留原有所有其他文件的私有标识扫描；运行 node 测试验证先红后绿。
- [x] 对生成的投影与完整 out/ 运行扫描，记录文件数与错误回显不包含联系人值。

## Task 3: 独立主体目录与详情

**Files:** 新增 lib/qcc-types.ts、lib/qcc-search.ts、components/QccDirectoryView.tsx、components/QccDetailView.tsx、app/guangdong/zhuti/page.tsx、app/guangdong/zhuti/detail/page.tsx、tests/qcc-search.test.ts；修改 components/SiteHeader.tsx。

- [x] 先写检索行为测试：名称/城市/类型/状态组合、20条分页、非法参数纠正、空结果恢复和 ID/分块定位；确认测试因缺功能失败。
- [x] 用 URL q/city/type/status/page 驱动检索，列表加载最小索引，详情按 ID 所在 chunk 加载单块；采用现有 section/tag/notice 风格，缺值明示“导出未提供”，注销显著标记。页面写明来源文件导出日期、行号、代码校验状态与“登记主体不等于养老机构”；不展示联系方式。
- [x] 检查站内路径带 /eldercare 前缀、键盘与触控可用、链接可复制、导航与返回保留过滤条件；运行 typecheck 与专项测试。

## Task 4: 官方来源候选关联

**Files:** 新增 components/QccCandidateLinks.tsx；修改 app/guangdong/jigou/[id]/page.tsx；新增 tests/qcc-links.test.ts。

- [x] 写失败测试：157个来源名称键映射158主体引用；“高州市福康养老服务中心”必须展示两个不同代码候选；未命中者不生成候选区块；不能称“运营主体已确认”。
- [x] 在官方来源详情的“原文条目”后插入候选关联组件，按 sourceRecordId 读取独立 links JSON，不修改官方来源记录 schema 或原有计数；运行专项测试与 typecheck。

## Task 5: 发布验证与回滚

**Files:** 更新 README.md、docs/verification.md、docs/superpowers/specs/2026-11-16-qcc-registration-directory-design.md；服务器新增版本目录并切换 current。线上浏览器发现未压缩的主体索引经代理下载中断，因此同步更新 deploy/nginx-eldercare.conf 的 JSON gzip 设置，备份原 Nginx snippet 并验证配置、响应头与真实浏览器。

- [x] 运行 NEXT_PUBLIC_ELDERCARE_BASE_PATH=/eldercare npm run verify:release；复核 6,777主体、21市、157/158关联、公开联系方式零泄漏、781/235旧目录不回退。
- [x] 本机真实浏览器验证 320/375/768/1024/1440px，搜索→详情→返回、来源关联一对多、注销/缺代码/空结果、键盘焦点与控制台；记录截图和结果。
- [x] 上传 out/ 至新版本目录，校验归档与远端文件哈希并切换 current；线上 HTTP 检查新主体路由、JSON、官方/广州/根站/旁站和 noindex。浏览器若受本机代理阻断则明确标记未验；保留上一版本回滚路径。
