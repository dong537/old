# 全国官方来源覆盖视图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在官方来源目录明确展示 31 个省级地区中哪些已有本站逐名官方来源、哪些仍待补，给每个地区可用的下一步入口。

**Architecture:** 只用现有三份公开快照：全国机构线索 manifest 定义地区全集和线索入口，跨省官方 manifest 与广东来源 JSON 定义本站已有官方来源行。纯函数按省名严格关联并校验，不把线索数或来源行数称为机构数；服务端页面渲染覆盖列表，不在浏览器批量下载所有城市索引。

**Tech Stack:** Next.js 15 静态导出、React 19、TypeScript、Tailwind CSS 3、Node test。

## Global Constraints

- 页面只读；不写数据、不请求第三方运行时接口、不展示未经批准的原表详细字段。
- 41,955 条机构线索、8,500 条官方来源观察、登记主体候选是不同口径；0 条官方来源不代表当地没有机构。
- 保留 `/quanguo/laiyuan/` 既有省市检索和详情、`/quanguo/cankao/` 既有 URL 及返回条件；广州独立 235 家档案不并入来源行。
- 输入快照缺省、重复地区或官方地区无法匹配时构建失败，不显示伪造的完整覆盖。

## Source of Truth、接口和数据流

- Owner：`public/data/qcc-institutions/manifest.v1.json` 的 `provinces` 是可检索线索的 31 地区全集；`public/data/national-official/manifest.v1.json` 的 `provinces` 是省外已公开官方来源；`public/data/guangdong-source-records.v1.json` 的 `records` 是广东来源行。公开数据由既有离线脚本生成与 `--check` 核验。
- `lib/official-coverage.ts` 导出 `buildOfficialCoverage(referenceProvinces, officialProvinces, guangdongCount)`，返回按线索 manifest 顺序排列的 `{name, referenceSlug, referenceCount, officialSlug, officialRowCount}` 及可用/待补计数。地区用规范名称关联，链接用各自 slug，不能复用另一 manifest 的 slug。
- `app/quanguo/laiyuan/page.tsx` 在静态构建时读取三份 JSON、调用上述函数，并在现有检索器之后组合 `OfficialCoverageView`。组件仅生成本地官方检索或线索页链接；无状态写入、权限或缓存新路径。
- 请求路径：静态 HTML → 覆盖列表；点击已收录地区 → `/quanguo/laiyuan/?province=<officialSlug>` 后选城市；点击待补地区 → `/quanguo/cankao/sheng/<referenceSlug>/` 查来源线索。资料时间与单条来源仍由原有档案显示。

## Task 1：覆盖映射与行为测试

**Files:** Create `lib/official-coverage.ts`, `tests/official-coverage.test.ts`。

- [x] 写失败测试：两地样本中一地有官方来源，一地待补；断言不同 slug、来源行数和异常输入。
- [x] 运行 `node_modules/.bin/tsx.cmd --test tests/official-coverage.test.ts`，确认因模块缺失而失败。
- [x] 实现纯函数、唯一地区与非负安全整数校验，重新运行测试。

## Task 2：页面呈现与全国快照验收

**Files:** Create `components/OfficialCoverageView.tsx`; Modify `app/quanguo/laiyuan/page.tsx`; Extend `tests/official-coverage.test.ts`。

- [x] 写失败测试：真实快照显示 31 地区、13 地区有本站官方来源、18 地区待补、8,500 条来源观察，并核对广东与上海的链接文案。
- [x] 实现可折叠的 31 地区覆盖列表：首屏说明覆盖数，已收录与待补分别列出；链接有明确目的地，不将来源行标成机构数。
- [x] 运行相关测试、typecheck、完整发布校验；浏览器检查入口、地区链接、375/1440px、键盘和控制台。

## 失败、回滚与验证

构建失败时保持上一版静态产物，不用空数组降级；源快照更新后由现有数据构建及本测试重新验收。回滚仅撤销本次纯函数、组件与页面组合，不改变任何来源 JSON、ID 或详情路由。真实浏览器按“官方来源→待补省份→线索页→返回”检查；无官方来源的地区不得显示 0 家机构。
