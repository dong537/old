# MCA 四级地区观察采集接入（2026-11-19）

## 目标与边界

用户需要把终态三级子节点探针产生的四级地区 overlay 接入独立的首屏、分页与增量详情采集。只查询官方原始响应验证且有 12 位代码的新增四级节点；每批可离线重审来源、缓存和批次链。同一机构 ID 的全部三级和四级来源页可追溯，已有详情不重复抓取。

本次不联网运行采集，不修改运行中的地区树采集器或恢复凭证，不碰 -009 现场，不写公开目录。不以四级节点数、父级 total 或分页完成宣称全国全量。四级子级未枚举、无代码节点、offset 快照漂移和父子直属记录差异保留为缺口。

## Source of Truth 与路径

- 地区树 area-tree-20261119、三级探针 area-level3-probe-20261119 的原 HTTP 字节、包装文件、manifest 与连续批次状态是地区来源真相。旧三级种子 national-area-tree-seeds-20261119.json 已绑定旧采集链，不改写。
- national-area-level4-overlay-seeds.v1.json 是可重建、不可覆盖的私有派生种子。每次采集前重算并逐字段对比，绑定文件 SHA-256；源漂移阻断。无代码节点只进缺口记录。
- 四级独立缓存：national-level4-first-pages-v1、national-level4-followup-pages-v1、national-level4-large-pages-v1、national-level4-observed-details-v1。旧三级页面和详情缓存只读且不重抓。页面保存请求参数、原 HTTP 字节、响应与包装哈希、时间及 areaCode；manifest 和批次状态保存来源指纹。
- 全站互斥锁、冷却文件和 hourly-request-budget.json（滚动 3600 秒最多 60 次）由既有 fetcher 和采集器持有；实际请求最小间隔 60 秒。handoff 只调度一次有界子批。

## 模块与接口

- overlay builder 只构建与审计四级种子，不查询机构。新增观察适配器验证 overlay 与旧三级种子不重码，复用现有首屏、分页、详情采集器的页面审计和限流。
- 首屏采集器允许注入严格种子校验函数；分页沿同一来源校验首屏 manifest，并按官方路径识别四级后代代码。默认调用仍使用旧三级种子和目录。
- 详情阶段离线生成三级与四级页面 ID 的按来源页去重并集，验证旧详情缓存及源清单；仅把旧详情未覆盖 ID 写入增量队列。并集库存、旧详情 manifest 与 overlay 哈希冻结后才发请求。并集保留重叠 ID 的全部来源页及父级直属 ID。
- handoff 在三级探针终态后验证或构建 overlay，再按四级首屏、小分页、大分页、旧范围分页及详情、四级增量详情的依赖逐次推进。每阶段只提交一个有界子批；0 个有码四级种子跳过网络阶段，未知数量不能当 0。失败状态阻断重试。

## 数据流与失败处理

官方地区响应 → 终态树／探针审计 → 不可覆盖四级 overlay → 私有四级首屏 → 四级后续页 → 跨三级／四级来源页 ID 并集 → 仅缺失 ID 的私有详情。下一阶段必须重审原字节、manifest、来源指纹和连续批次链。页面 total 只是本次请求报告值，不是全国总量。

429、5xx、损坏缓存、锁冲突、批次断链及未终态均不得晋级。失败保留现场并写 blocked，人工复核后才能继续。源变化需要新版本设计和独立缓存，不在 v1 原地兼容。回滚仅停用新增 handoff 阶段和独立 overlay 目录；旧树、种子、页面、详情仍按原逻辑审计。

## 离线验收

先写 RED：未终态不能发列表请求；有／无码四级区分；四级独有 ID 增量入队；跨父子重叠 ID 保留双来源且不重抓详情；原父级直属 ID 不丢；四级 areaCode 按官方路径验证；源哈希、页面原字节、批次断链、429、预算和间隔均阻断或等待。然后运行 MCA 相关 unittest、compileall 和只读 Git diff 检查。本轮不执行在线 smoke test；上线仍需真实终态源及人工审计。

## 本轮离线执行证据

已完成独立四级采集入口、handoff 阶段、旧父级分页/详情的四级后代来源绑定。进度审计和列表覆盖审计纳入四级独立目录；原 legacy readiness 对尚未审计的现代与四级页面、详情和 checkpoint 显式计数并保留 publishable=false。相关 149 条 MCA unittest 通过，目标 Python 脚本 compileall 通过，git diff --check 通过。没有向 MCA 发请求，也没有修改正在运行的 tree collector、恢复凭证或 -009 现场。

仍未完成真实终态探针后的在线采集、四级节点自身子级枚举、无代码地区覆盖、offset 冻结快照和父子直属残差人工复核。任何离线绿灯均不改变 nationalComplete=false、snapshotVerified=false、publishable=false。
