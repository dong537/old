# 前端接手指南

> 更新：2026-11-21。给接手公开网站的前端开发者；数据采集、清洗和公开投影由后端／数据开发者负责。先读本页，再按需查 [设计契约](docs/superpowers/specs/2026-11-18-source-led-frontend-redesign.md) 和 [来源与发布说明](README.md)。

## 30 分钟启动

需要 Node.js **≥20.9**、npm。仓库只需公开文件即可运行；不要索取或复制 `data/private/` 中的原始 XLSX、工商资料或密钥。

```powershell
npm ci
npm run dev
```

打开 `http://127.0.0.1:3000/`。依次走：首页按名称检索 → 民政部平台部分采集快照 → 已采详情 → 来源及返回筛选；再走广州官方名单。`npm run dev` 会先从已提交的公开原料重建广州机构与服务 JSON。端口被占用时使用 Next 的 `--port` 参数，但不要同时运行 `next dev` 与 `next build`：二者共用 `.next/`，曾造成构建入口冲突。

## 当前产品边界

主站是 **Next.js 15 + React 19 + TypeScript + Tailwind CSS** 的只读静态目录，`next.config.mjs` 使用 `output: 'export'` 和尾斜杠。浏览器读取仓库的公开 JSON；生产页面没有实时后端 API、账户、预约、商家入驻或实时价格／空床。独立的 `prototype/` 是虚构数据演示，不是正式页面的视觉或业务权威。

四类结果必须分清：民政部平台**部分采集快照**、企查查**机构来源线索**、地方**官方来源观察记录**、企查查**登记主体候选**。它们不是同一份已核验机构名录，不能相加、自动合并或据同名推断在营关系。广州 235 家名单是独立的官方历史快照。备案床位不等于当前空床；预收费“是／否／未知”不是金额；未知也不等于 0。页面上的来源、资料期和原文出口是核心内容，不能被视觉改版移到难找的位置。

新增独立公开路由 `/quanguo/pingtai/`：消费已提交的 public/data/mca-observed 白名单 JSON，仅是 3,726 个平台 ID 的部分采集快照；其中 131 条有详情。详情页按平台 ID 查找，不把同名的企查查来源表行自动认作同一家。私有原件和图片文件 ID 均不进入公开 JSON；下述本机私有预览仍独立。重新导出需在保管私有快照的机器运行 `npm run mca:observed:build`，然后运行 `npm run verify:release`。详细契约见 [接入方案](docs/research/mca-partial-public-integration-2026-11-21.md)。

本机私有开发预览另有 `/quanguo/mca-preview/`：消费已封存的全国养老服务信息平台观察快照，按平台 ID 显示列表、可用详情、原字段与采集证据。它不并入上述公开目录，当前快照固定 `publishable=false`，不代表全国全量或当前在营。镜像更新后运行 `python scripts/build-mca-observed-catalog.py --mirror "镜像目录绝对路径"`，再用 `npm run dev:private` 在 loopback 开发服务器查看；私有快照仅在 `data/private/generated/mca-observed-catalog/`，不能复制到 `public/data/`。缺详情的记录只显示已取得的列表字段。

## 找代码

| 任务 | 入口 |
| --- | --- |
| 全站布局、导航、样式与路径前缀 | `app/layout.tsx`、`components/SiteHeader.tsx`、`app/globals.css`、`tailwind.config.ts`、`lib/site-path.ts` |
| 搜索优先首页 | `app/page.tsx` |
| 广州官方名单、档案、对比 | `app/guangzhou/`、`components/DirectoryView.tsx`、`DirectoryFilters.tsx`、`InstitutionList.tsx`、`ComparisonView.tsx`、`lib/search.ts` |
| 全国机构线索 | `app/quanguo/cankao/`、`components/InstitutionReference*`、`lib/institution-reference-*` |
| 民政部平台部分采集快照 | `app/quanguo/pingtai/`、`components/McaPublic*`、`lib/mca-public-*`、`scripts/build-mca-observed-export.ts` |
| 全国官方来源 | `app/quanguo/laiyuan/`、`components/NationalOfficial*`、`lib/national-official-*` |
| 全国平台已观察记录（仅本机） | `app/quanguo/mca-preview/`、`components/McaPreview*`、`lib/mca-preview-*`、`scripts/build-mca-observed-catalog.py` |
| 登记主体候选 | `app/quanguo/zhuti/`、`app/guangdong/zhuti/`、`components/Qcc*`、`lib/qcc-*` |
| 广东官方来源 | `app/guangdong/jigou/`、`components/Province*`、`lib/province-*` |
| 广州服务记录与长护险指南 | `app/guangzhou/shangmen/`、`app/guangzhou/changhuxian/`、`components/ServiceDirectoryView.tsx` |
| 来源规则与复核提示 | `app/rules/page.tsx`、`components/SourceNote.tsx` |

URL 是筛选与回访状态的来源：广州目录使用 `q`、`district`、三项预收费标记、`page`、`compare`；全国目录使用 `province`、`city`、`q`、`page`；详情的 `from` 只能指向允许的站内列表。新增筛选先确认公开数据中有该字段，再更新相应的 `lib/*-search.ts`、URL 构造和测试。站内路径统一经过 `sitePath()`，不要在组件里手拼 `/eldercare`。

## 与后端／数据开发者的接口

```text
公开脱敏原料 data/raw/ + 私有原件 data/private/（不入 Git）
  → scripts/ 离线校验与投影
  → public/data/ 版本化公开 JSON
  → lib/ 类型、加载与检索
  → app/ 路由 + components/ 交互与呈现
```

后端／数据开发者维护原料来源、字段语义、稳定 ID、脱敏规则、投影脚本与公开 JSON 的完整性；前端开发者维护任务路径、路由、组件、可访问性、响应式布局和浏览器状态。`lib/*-types.ts`、`lib/*-search.ts` 和 `public/data/` 是双方交界：**变更字段或文件路径时，在同一 PR 里写清 schema、来源／资料期、未知值、兼容或迁移办法，并更新前端消费和测试**。不得让 UI 用本地 mock、默认 0 或“已核验”文案掩盖缺失或加载失败。

大目录采用 manifest → 省市索引 → 详情分块按需加载：`public/data/qcc-institutions/`、`national-official/`、`qcc-national/` 分别服务机构线索、官方来源和登记主体。全国线索详情还有独立候选关联分块；关联失败不应伪装为“无关联”，核心档案仍须可读。公开 JSON 是网页的构建／运行输入，不要直接从 `data/private/` 导入页面。`data/raw/family_fields_official.csv` 是可提交的脱敏副本，完整官方 CSV 只留在本机私有目录。

## 开发、验证和提交

建议从 `main` 拉取后各自使用 `feat/frontend-*`、`feat/data-*` 分支；前端 PR 标出改动路由、宽度与任务路径，涉及数据契约时请另一位开发者复核。先保证真实内容与来源口径，再改视觉。参考站布局研究及采用／舍弃理由见 [改版验收记录](docs/research/2026-11-19-source-led-frontend-acceptance.md)。

```powershell
npm run typecheck
npm test
npm run build
```

`build` 会运行公开产物隔离扫描；失败时不要发布。`.github/workflows/verify.yml` 在 push 与 PR 上运行 `npm run verify:release`。触及数据投影、来源或候选关联时，再与后端共同运行 `npm run verify:local-release`；它依赖项目方本机保管的冻结私有原件，普通前端克隆不应为通过检查而造假数据。

静态部署前缀为 `/eldercare`，构建和预览变量必须成对设置：

```powershell
$env:NEXT_PUBLIC_ELDERCARE_BASE_PATH = '/eldercare'
npm run build
$env:ELDERCARE_PREVIEW_BASE_PATH = '/eldercare'
npm run preview
# 本机打开 http://127.0.0.1:3000/eldercare/
```

上述 `preview` 只在本机托管 `out/` 做验收，**不是生产 Node 服务**；推送 GitHub 也不等于部署。前端交付至少自测首页→筛选→详情→来源→返回、空结果与恢复、键盘操作、320/375/768/1024/1440px 和 200% 缩放，并检查控制台、遮挡与横向溢出。最近一次本机改版自测和未验证项见验收记录；截图不能代替真实用户测试。

## 不要提交或宣传

- 不提交 `data/private/`、`.env*`、`out/`、`.next*/`、`output/`、原始 XLSX、私有截图或凭据；提交前查看 `git status` 和暂存区。公开版还必须通过 `scripts/check-public-output.ts`。
- 不把登记主体候选、同名／同代码关系、历史官方来源行写成“已核验在营机构”；不添加无来源支撑的价格、空床、星级、预约、地图点位或服务资格。
- 当前没有公众纠错渠道，部分来源的再展示许可与更新责任仍待落实；正式发布与搜索收录需由项目负责人单独决策。
