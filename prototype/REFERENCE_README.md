# 养老信源（暂名）· 原型

养老板块信源平台的 Next.js 原型，按《养老信源平台方案》的第一期做：只做广州，养老机构和上门服务商（居家）两类档案。家属端、机构后台、运营后台三端共用一份数据：家属预约或报错，机构回应，运营处理，结果马上出现在其他两端。

> 数据在内存里，**服务一重启就恢复成示例数据**。页面上所有机构、服务商、主体信息、探访和回访都是虚构的，标「示例」。字段上的来源名称表示上线后这一项从哪里取，不代表这家真的在那份名单里。真实的只有政策和官方公示的引用链接（见 `lib/content.ts`，`checked: true` 的是 2026-11-08 打开原页核对过的）。

平台名称还没定，全站只从 `lib/site.ts` 的 `SITE.name` 取，改一处即可。

## 运行

需要 Node.js 18.18 以上（本机是 22）。

```bash
npm install
npm run dev -- -p 4185      # 打开 http://localhost:4185，会跳到 /guangzhou
npm run build && npm start -- -p 4185
npm run typecheck
```

如果 `npm install` 报 `EACCES`、提示 npm 缓存里有 root 所有的文件，这是本机 `~/.npm` 的权限问题。永久修复要自己执行 `sudo chown -R 501:20 ~/.npm`；临时绕过可以换一个缓存目录：`npm install --cache /tmp/npm-cache`。

## 和兄弟项目的关系

- 技术栈、目录结构、内存存储和 Server Actions 的写法沿用**知底**（`../同城生活服务/zhidi-web`），`lib/time.ts`、`components/icons.tsx`、`Toc`、`JsonLd`、`Ref` 直接复用。
- 可信度 A–D、风险提示和等级分开标、报错 48 小时、榜单不足 5 家不发布、网址第一段是城市，都沿用知底的规则，口径按养老调整。
- 独享线索与 48 小时申诉、回访不足一定条数不显示比例、`llms.txt` 和带来源的公开 API，沿用**教培网**。
- 不同的地方：平台不碰钱（没有报名、收银台、结算），押金和会员费只核验存管状态；用实地探访和平台回访代替开放评价；不收入住返佣。

## 页面

| 端 | 地址 | 内容 |
| --- | --- | --- |
| 家属端 | `/guangzhou` | 城市首页：两个入口（住进去 / 住在家）、透明度数字、对家属的承诺、本月榜单、按区找、签约前看三件事 |
| | `/guangzhou/jigou` | 找养老机构：按区、老人情况、月费、等级、长护险、医疗、可信度筛选，条件写进网址；可按月费排序 |
| | `/guangzhou/jigou/[id]` | 机构档案：概况、风险提示、收费明细（按护理类型拆开）、押金会员费和预收、等级与资质、医疗与长护险、探访记录、家属回访、主体信息、变更记录、来源；右侧预约探访 |
| | `/guangzhou/shangmen` | 找上门服务：按服务区域、项目、类型、长护险、年度考核、预付款筛选 |
| | `/guangzhou/shangmen/[id]` | 上门服务商档案：服务项目与收费（逐项标能否用长护险）、长护险定点与年度考核、护理员持证、预付款、体验服务、回访；右侧预约上门评估 |
| | `/guangzhou/jiage`、`/guangzhou/jiage/[类型]` | 价格参考：`zili` `banshineng` `shineng` `shizhi` 各区月费中位数；`shangmen` 上门服务单价 |
| | `/guangzhou/changhuxian` | 长护险指南：问答、机构护理和居家护理两份定点名单 |
| | `/guangzhou/bangdan` | 榜单，`?tab=service` 看上门服务 |
| | `/rules` | 方法论：不卖什么、收录范围、数据来源、A–D、风险提示、保鲜期、排序、榜单、预约线索、报错、个人信息、平台收费 |
| | `/report?id=…&field=…` | 报错 |
| | `/me` | 我的预约与报错 |
| | `/claim` | 机构认领 |
| 机构后台 | `/merchant` | 工作台：可信度、完整度、预约来源（北极星：来自 AI 的比例）、榜单位置或没进榜的原因、待办。顶部可在两个示例账号间切换：天河康宁颐养院（机构）、家健护理站（上门服务） |
| | `/merchant/leads`、`/merchant/reports`、`/merchant/info` | 预约线索（改状态、48 小时内申诉）、报错回应、信息维护（空床、确认无变化、关键字段改动送审） |
| 运营后台 | `/admin` | 数据看板：北极星、预约到入住、核验覆盖率、报错 48 小时结案率、可信度分布 |
| | `/admin/claims` `reports` `appeals` `visits` `changes` `freshness` | 认领审核、报错处理、线索申诉、探访抽检、关键字段修改、保鲜到期 |
| AI 入口 | `/llms.txt`、`/api/public/v1/jigou`、`/api/public/v1/shangmen`、`/robots.txt`、`/sitemap.xml` | 站点说明；每个字段带来源和核对日期的 JSON；未认领的档案 noindex、不进 sitemap |

## 示例数据里刻意放的情况

| 档案 | 演示什么 |
| --- | --- |
| `kangning` 天河康宁颐养院 | A 级；机构后台默认账号；空床有 1 条报错在核实 |
| `jinxiu` 荔湾锦绣老年公寓 | B 级，同时有 2 条风险提示（行政处罚、会员费未存管），不能进榜 |
| `tianhe-anyang`、`zengcheng-zhongxin` 等 | 未认领，C 级，只有官方字段和官方登记的入住价格，只能打电话 |
| `huadu-yile` | 空床和收费过了保鲜期，D 级 |
| `nansha-haibin` | 收费有 2 条未结报错，D 级 |
| `tianhe-xinyuan` | 刚认领 10 天，B 级但不进榜 |
| `baiyun-kangtai` | 有认领申请等运营审核 |
| `jiajian` 家健护理站 | 上门服务 A 级，长护险考核优秀；机构后台第二个账号 |
| `panyu-anxin` | 长护险年度考核不合格，进风险提示 |
| 上门服务榜单 | 能参与排名的只有 3 家，不足 5 家，本月不发布 |

## 演示路线

1. 打开 `/guangzhou/jigou/kangning?src=doubao`（模拟家属从豆包点进来），在右侧预约探访。先不勾同意提交，会提示要同意；勾上再提交，拿到预约号。到 `/me` 看预约，到 `/merchant/leads` 看这条线索：来源记为「AI 助手 · 豆包」，手机号打码，线索余额少 1 条。
2. 在 `/merchant/leads` 对 48 小时内的线索申诉；到 `/admin/appeals` 判属实，回机构后台看余额退回。
3. 打开 `/guangzhou/jigou/xiangyang`，对「收费明细」报错两次，档案降为 D。到 `/admin/reports` 判「属实，更正」并填正确的值，档案回到 B，收费区出现「平台核实后的收费」，变更记录里有一条。
4. 到 `/claim` 认领一家未认领的机构，到 `/admin/claims` 通过：档案变为 B，开放在线预约。
5. 到 `/admin/visits` 让越秀福利院的探访通过抽检，档案从 B 升为 A。
6. 在 `/merchant/info` 改空床（直接生效），或改「服务费预收」（送审），到 `/admin/changes` 通过后档案更新。顶部切到「家健护理站」看上门服务商的后台。
7. 看 `/guangzhou/bangdan`：机构的三个榜都发布了；切到上门服务，两个榜都不发布，并写明原因。

以上流程都在浏览器里跑通过（桌面 1280 宽和手机 375 宽），服务端没有报错。

## 目录

```
app/
  (site)/guangzhou/   城市首页、找机构、机构档案、找上门服务、服务商档案、价格参考、长护险指南、榜单
  (site)/rules|report|me|claim/   方法论、报错、我的、机构认领
  merchant/           机构后台
  admin/              运营后台
  api/public/v1/      公开 API
  llms.txt/  robots.ts  sitemap.ts
  actions.ts          所有写操作（Server Actions）
components/           ui、cards（列表卡片）、profile（档案页的各个模块）、FilterRows、BookingForm、ReportForm、ClaimForm、Toc 等
lib/
  types.ts            数据结构：Home（养老机构）、ServiceProvider（上门服务商）、Lead、Report、Claim
  rules.ts            可信度、风险提示、保鲜期、完整度、回访统计
  rankings.ts         榜单定义、参与条件、计算
  stats.ts            价格参考、北极星、报错时效
  seed.ts             示例数据
  store.ts            内存存储；接后端时替换这里的函数
  content.ts          外部来源（标注是否核对过）、签约前看三件事
  site.ts             平台名称、城市、区、护理类型、AI 来源识别
```

## 规则在代码里的位置

- **可信度**（`lib/rules.ts` 的 `gradeOf`）：任一字段 2 条以上未结报错或过了保鲜期 → D；未认领或认领未核验 → C；探访（体验服务）在有效期内且通过抽检 → A；其余 → B。
- **风险提示**（`riskFlags`）：官方负面记录；公办、公建民营收会员费；押金或会员费没有存管证明；押金超过月床位费 12 倍；服务费预收超过 12 个月；长护险年度考核不合格。依据七部门《关于加强养老机构预收费监管的指导意见》，已打开原文核对。
- **保鲜期**（`TTL`）：空床 7 天、收费 90 天、信用 30 天、存管和医疗 365 天，都是方案里的建议值。提醒窗口一般 14 天，短保鲜期按 30% 算。
- **榜单**（`lib/rankings.ts`）：参与条件是已认领并核验、满 30 天、B 级及以上、没有风险提示；能参与的不足 5 家整个榜不发布。公式写在 `RANKINGS` 里，榜单页直接显示。
- **预约来源**（`components/BookingForm.tsx` 的 `detectSource`）：先看 `?src=`，再看来源页，按 `lib/site.ts` 里的 AI 助手和搜索引擎列表归类。

## 还没做

- 登录和账号体系；材料上传、OCR、短信验证（原型里只勾选）
- 线索包充值、年费会员、城市合伙人后台、往月榜单存档
- 官方数据的自动接入（全国养老服务信息平台的详情页是脚本加载的，能不能批量获取还要人工确认）
- AI 引用率的月度测试脚本
- 上门服务的套餐、储值卡是否适用预收费存管规定，要请律师确认；确认前页面只标「收不收、最多预收多久」
- 照片：用文字说明代替
