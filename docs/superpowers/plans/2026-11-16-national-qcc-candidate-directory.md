# 跨省登记主体候选目录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** 将用户提供的 25 份企查查导出作为可追溯、脱敏、按省市加载的独立候选主体目录接入现有静态站。

**Architecture:** 离线 Python 校验 25 份 XLSX 并生成 manifest、城市轻量索引和详情块；Next.js 页面按需读取 JSON，严格区分登记主体候选与官方养老机构目录。现有广东单文件链不改动。

**Tech Stack:** Python 3 + openpyxl 3.1.5；Next.js 15.5、React 19、TypeScript、Tailwind CSS 3；项目现有 node:test、静态 export。

## Global Constraints

- 输入目录为 C:/Users/Lenovo/Desktop/search/example；原件不复制进 public、out 或 Git。
- 141,364 原始行、25 文件、30 省级地区、广东 0 行；城市占位的 3 行保留在“城市未提供”组。
- 不将候选行数宣称为养老机构数；不添加预约、评分或当前在营判断。
- 不公开电话、手机号、邮箱、企业简介；自由文本中的手机号/邮箱整字段遮蔽。
- 发布路径保持静态与 /eldercare 前缀，保持 noindex；旧广东路由和 ID 不变。

---

### Task 1: 输入审计与离线投影

**Files:** Create scripts/build-qcc-national.py, tests/test_qcc_national.py, data/raw/qcc-national-source-manifest.json；generate public/data/qcc-national/ and data/private/qcc-national-audit.json。哈希/行数锁定清单可跟踪，原 XLSX 仍私有。不得修改现有 build-qcc-public.py。

**Interfaces:** CLI 接受 --source-dir 和 --check，默认用户给定目录；输出 manifest.v1.json 包含 schemaVersion、snapshotId、exportedAt、rowCount、sourceFiles、provinces，各城市条目包含 slug、name、count、indexPath。城市 index.v1.json 包含 schemaVersion、snapshotId、provinceSlug、citySlug、records；详情 chunk-NNN.v1.json 包含同一快照 ID 和 records。每条记录以 sourceId + rowNumber 追溯。

- [ ] 先写测试：标题漂移/文件或行数漂移报错；缺码与异常码保留；自由文本手机/邮箱整体遮蔽；城市占位不被推断；ID 与快照确定；输出无联系字段。运行 python -m unittest tests.test_qcc_national，确认因模块缺失失败。
- [ ] 实现最小校验与投影，读取 XLSX 时重置错误 dimension；公开字段沿用广东已审阅的登记字段集合，固定输入哈希和逐文件行数；生成 320 个省市分片及约 100 条详情块。再次运行定向测试至通过。
- [ ] 在真实 25 文件上生成快照与审计，核对总行数、省份/城市组合、缺码 2,161、异常码 9、重复组 1、字段脱敏计数；运行 --check 应只读比对成功。

### Task 2: 前端检索与来源详情

**Files:** Create lib/qcc-national-types.ts, lib/qcc-national-search.ts, components/QccNationalDirectoryView.tsx, components/QccNationalDetailView.tsx, app/quanguo/zhuti/page.tsx, app/quanguo/zhuti/detail/page.tsx, tests/qcc-national-search.test.ts；modify components/SiteHeader.tsx。

**Interfaces:** 列表 URL 参数 province、city、q、type、status、page；详情 URL 参数 province、city、id、from。manifest 是唯一可加载路径白名单；读取城市索引/块必须校验 snapshotId 和地区。返回路径仅接受本目录已知查询键。

- [ ] 先写测试：省市与名称/类型/状态搜索、20 条分页、非法 URL、深链接、快照不一致、返回筛选状态、basePath；确认因新模块缺失失败。
- [ ] 实现页面：首屏先选地区，广东引导至既有候选库；选城后才取城市索引；详情只取所需块；状态页提供重试和列表出口。注册全站导航和搜索新路由。运行定向 TS 测试与 typecheck。

### Task 3: 公开隔离与说明

**Files:** Modify scripts/check-public-output.ts、README.md、docs/verification.md；create tests/qcc-national-output.test.ts。

- [ ] 先写失败测试：全国目录中多余文件、未批准字段、手机号/邮箱、错误 snapshotId 必须使扫描报错；确认测试失败。
- [ ] 为全国路径加精确文件名规则和 manifest/index/chunk 字段白名单；原件与私有路径不得进入静态产物。更新 README 的导入、可见口径与复核命令；运行定向测试。

### Task 4: 发布前验收

**Files:** Update docs/verification.md with command, route, viewport and observed results only。

- [ ] 运行 npm run typecheck、npm test、npm run build，记录退出码与具体通过数；核对 out 内无 XLSX/CSV/联系字段及所有 141,364 行可定位。
- [ ] 真实浏览器走首访→选省市→筛选→详情→来源→返回、无结果/错误恢复、首/中/末行；复核 320/375/768/1024/1440px、200% zoom 与 /eldercare 前缀。未实际完成的检查标未验证，不宣称已生产发布。
- [ ] 核对 git diff/status，只纳入本轮文件，不重置或提交其他既存未提交内容；如部署，走既有版本化目录切换并保留回滚版本。
