# 跨省官方来源记录 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Each task has its own test cycle. This plan implements the approved source/candidate separation already used in the site; see ../specs/2026-11-17-national-official-source-directory-design.md.

**Goal:** 把重庆 1,725 条与张家港 20 条官方网页原文作为可追溯的跨省来源记录接入本地静态站。

**Architecture:** 离线读取冻结 HTML、校验哈希与表格，输出 manifest、分地区索引和详情块。新路由按需读取公开 JSON，不修改广东来源和企查查主体库，也不把来源行认定为独立在营机构。

**Tech Stack:** Python 3、lxml 6.0.4；Next.js 15.5、React 19、TypeScript、Tailwind 3、node:test；静态 export。

## Global Constraints

- 原件只在 Git 忽略的 `data/private/national-official-source/raw/`；不进入 public/out。
- 来源哈希、行数、表头和序号固定；重庆数字内部空格可审计地规范化，16 个空床位为 null；张家港电话列完全不公开。
- 页面显示来源发布日期、资料期和局部覆盖，禁止宣称当前在营、空床、完整全国机构名录或已核实机构—企业关系。
- 暂不部署；不改现有广东机构、广东来源、跨省登记主体 ID 与路由。

---

### Task 1: 冻结来源及离线投影

**Files:** `scripts/build-national-official.py`、`tests/test_national_official.py`、`data/raw/national-official-source-manifest.json`、生成的 `public/data/national-official/`。

**Interface:** CLI 无参生成、`--check` 只读逐文件比对；输出 schema 与路径由设计文档固定。

- [x] 写测试覆盖两种表头、1…N 序号、37 处序号空格、26 处数量空格、16 个未知床位、6 组重庆同名、来源哈希及联系人字段排除；确认负例失败。
- [x] 实现解析和审计，以冻结原件生成 1,745 行、地区索引和每块最多 100 行的详情；先完整验证再写输出。
- [x] 运行 `python -m unittest tests.test_national_official -v` 与 `python scripts/build-national-official.py --check`，确认首/中/末行来源序号和名称。

### Task 2: 公开构建隔离

**Files:** `scripts/check-public-output.ts`、`tests/national-official-output.test.ts`。

**Interface:** 沿用现有 `npm run build` 后公开文件扫描；只允许设计文档中的 manifest、index、chunk 与字段，不放宽其他数据目录。

- [x] 写负例测试：多余文件、非白名单字段、联系人、来源哈希/快照/地区/行覆盖不一致应使扫描失败。
- [x] 实现精确路径和字段检查，确保 1,745 个 ID、来源行号、索引→分块引用和文件总数一致。
- [x] 运行定向测试与 `npm run typecheck`；以真实 `out/` 完成后再跑公开扫描。

### Task 3: 家属可用的跨省来源查询

**Files:** `lib/national-official-types.ts`、`lib/national-official-search.ts`、`components/NationalOfficialDirectoryView.tsx`、`components/NationalOfficialDetailView.tsx`、`app/quanguo/laiyuan/page.tsx`、`app/quanguo/laiyuan/detail/page.tsx`、`components/SiteHeader.tsx`、`app/rules/page.tsx`、`tests/national-official-search.test.ts`。

**Interface:** 列表 URL `province,city,q,page`；详情 `province,city,id,from`。manifest 白名单决定可读的地区和分块；异常时显示重试/回目录。

- [x] 先写搜索、20 条分页、非法参数、安全返回、跨快照/地区拒绝及渲染口径测试，确认新增模块缺失而失败。
- [x] 实现先选地区后取索引、详情按块读取、字段与来源展示、广东旧入口及民政部全国查询出口；不读取电话列。
- [x] 运行定向测试和类型检查；检查主导航、方法论及 `/eldercare` 前缀。

### Task 4: 本地完整验收

**Files:** `README.md`、`docs/verification.md`；本地 `out/` 与 Git 忽略的交付归档。

- [x] 运行两份来源 `--check`、Python/TypeScript 相关测试、`NEXT_PUBLIC_ELDERCARE_BASE_PATH=/eldercare npm run verify:release` 和 `git diff --check`。
- [x] 用真实浏览器验证重庆/张家港列表→详情→原始来源→返回、无结果和失败恢复、320/375/768/1024/1440px；200% 浏览器缩放若无法验证，明确保留为未验收。
- [x] 对本机新 `out/` 与归档逐文件哈希核对，更新行数、来源、限制和不部署状态；不切换线上站点。
