# MCA 长期采集可靠性只读审查（2026-11-19）

## 范围与限制

审查 tree auto、两级 handoff、first/followup/detail collector、共享限流与 Windows Task Scheduler 现场配置。仅读取代码、本地私有状态和任务信息；没有启动、停止、重启采集，没有访问 MCA 官网，没有修改代码、任务或采集状态。仅新增本报告。现场状态会继续变化，以下是审查时快照。未执行网络集成或故障注入，静态推导与实际发生的故障分开标明。

## 结论

现有实现可靠地 fail closed，能防止坏数据被当作全国完成，但不是可跨重启、跨暂时失败而自行恢复的长期无人值守管线。当前已实际停在 tree auto 008；下游五分钟任务仍报告 waiting/exit 0，不能作为管线健康证明。最先需要保存失败原文和显式恢复证据，不能直接放宽校验、删除失败状态或重置配额。

## P0：008 实际失败原文丢失，且失败批次使整个链不可自动续跑

- `batch-runs/tree-20261119-auto-008.status.json`：startedAtUtc `2026-11-19T00:28:49.544780+00:00`，endedAtUtc `2026-11-19T00:33:20.476477+00:00`，即北京时间 08:33:20 结束；不是推测的 08:35。requestsThisRun=4，savedResponseDelta=2，savedResponses=124，pendingAfter=253，rateLimited=false，requestBudgetReached=false，collectorExitCode=1。
- lastError 为 `ValueError: 61c11934c4e04524af2b935e81acb580: invalid official sbcode`。`fetch-mca-area-tree.py:35,92-94` 只接受 null 或恰好 12 位字符串。现有证据不能判断本次原值是空字符串、数字、其他长度还是含异常字符；不要编造原值。
- `fetch-mca-area-tree.py:253-256` 先 fetch/checked_response，再 save_json。现场 `responses/61c11934c4e04524af2b935e81acb580.json` 不存在。fetch 已取得的 rawBodyBase64 未落盘，schema 错误导致取证丢失。
- `run-mca-tree-auto-resume.py:resume_state` 拒绝任何非 clean_partial/clean_complete 状态。008 不是干净预算停止；即使修好校验、再次启动同一命令，也会在读取旧链时停止。

最小补强：响应到达后、业务 schema 校验前，先写独立 immutable quarantine/attempt 记录（raw bytes、时间、HTTP、URL、run ID、SHA），成功后再进入可信 responses。失败状态引用该证据。对 008 制定单独、可审计的 recovery/attestation 路径，保留原状态与 hash，验证已存 124 个响应和失败 frontier 后接新 run；不能把原失败状态改成预算停止。当前丢失原文无法离线补出，本次审查没有补请求。

同类缺陷：followup `collect-mca-area-followup-pages.py:329-334` 在校验失败后删除 candidate；detail `fetch-mca-institutions.py:623-636` 先校验再保存 checkpoint。应统一保存 rejected response，不能将其混入可信缓存。

## P1：调度成功掩盖上游故障

- `observed-stage-handoff.status.json` 在 `2026-11-19T00:34:51.170493+00:00` 仍为 waiting / first-pages / all official-area first pages are not cached；树已在 00:33:20Z 失败。Observed Windows 任务 LastTaskResult=0。
- `run-mca-observed-stage-handoff.py:79-101` 先判断 first page chain 是否完成，未完成就返回；没有读到上游 tree failure，也不会传播 stage handoff 的错误。
- tree task 现场 LastTaskResult=2、Ready，说明“任务可触发”不等于“采集正在推进”。现场进程查询没有采集 Python 进程（查询自身 PowerShell 被正则匹配，不计入）。

最小补强：独立只读 health snapshot 汇总各任务、最上游 blocker、lastSuccessfulResponseAt、无进展时长、cooldownUntil、nextEligibleAt、批次预算余量。waiting 必须区分正常排队和 upstream_failed；保持 publishable=false。健康检查可以报警/提供本地可见失败，但不能自动绕过失败批次。

## P1：Windows 配置有明确时间边界和登录/电池依赖

现场 `Get-ScheduledTask` / `Get-ScheduledTaskInfo`：

|任务|启用/状态|重复|执行上限|其他|
|---|---|---|---|---|
|Eldercare-MCA-Tree-Auto-20261119|启用/Ready，last=2|每小时，P14D；起点 11-19 06:51:25 +08|P2D|RestartCount=0|
|Eldercare-MCA-Stage-Handoff-20261119|启用/Ready|每小时，P14D；起点 11-19 06:30:23 +08|P7D|RestartCount=0|
|Eldercare-MCA-Observed-Stage-Handoff-20261119|启用/Ready|每 5 分钟，P180D|PT2H|StopIfGoingOnBatteries=true|
|Eldercare-MCA-FirstPages-Handoff|Disabled|每小时 P30D|P7D|旧任务已停用|

以上任务均 Principal.LogonType=3（Interactive）、StartWhenAvailable=true、WakeToRun=false、MultipleInstances=2（IgnoreNew）。Roots/Tree 单次旧任务 NextRun=null，不能承担长期恢复。

Tree Auto/Stage 的重复窗口到北京时间 2026-12-03 约 06:51/06:30 就结束，不能覆盖任意数周。Interactive 意味着不能假设重启后未登录仍执行。Observed 的电池切换停止条件与其他主任务不一致。

最小补强：先导出任务 XML 留回滚，明确长期截止期、登录账户执行条件和供电策略，再更新有限范围设置；增加启动后/定期健康审计。不要因为 StartWhenAvailable=true 就声称支持无人登录重启恢复。本次未改任何设置。

## P1：进程崩溃/重启后的锁会释放，running 状态不会自愈

- tree、first/followup/detail 在请求前持久化 phase=running。tree resume_state、各 auto 的 audit_status 拒绝未完成状态。
- `run-mca-stage-handoff.py:74-75` 与 `run-mca-observed-stage-handoff.py:217-224` 将既有 running/blocked 直接视为人工审计；重复调用不能恢复。
- 操作系统文件锁用于互斥，不是进程恢复凭证；没有把 stale lock 文件当成活锁是正确的。当前问题是状态机缺少已审计恢复转换，而不是锁文件需要删除。

最小补强：独立离线 reconcile：确认无活进程并取得锁，核对 immutable manifest、响应 hashes、last durable checkpoint、配额账本，区分“子进程已完成但父状态未提交”和“半批次中断”。生成追加的恢复证明/新批次，不改写旧证据。证明不足保持 blocked。用本地 fixture 覆盖终止于响应写入前后、manifest 写入前后、status 提交前后。

## P1：Observed 外层一小时超时包含配额等待，可能杀掉父控制器留下子进程

- `run-mca-observed-stage-handoff.py:276` 对 followup/detail **控制器** subprocess.run(timeout=3600)。控制器先 wait_for_capacity，再子 collector；自身也有 timeout=3600。
- `run-mca-tree-auto-resume.py:next_available_utc` 的容量等待最坏接近一小时，独立于一批请求执行时间。detail 最多 30 次，60–70 秒间隔，再含请求耗时与本地全缓存审计。外层一个小时并没有覆盖“容量等待 + 正常批次”。
- Python subprocess.run 超时杀的是直接子进程；这里直接子进程为 controller，collector 为孙进程。tree auto 代码已有避免 orphan grandchild 的注释，但 observed 外层仍有该结构。此为已定位代码路径风险，未现场触发超时验证。

最小补强：调度器发现无容量时只记 waiting/nextEligibleAt 返回；一次调度直接运行一个有界 collector，避免两层控制器。若保留结构，使用受控进程组/Windows Job Object 和明确的协作退出，超时需重新核对活子进程及提交状态；不能仅删除 timeout。

## P1：429/网络临时错误均转为永久人工状态，冷却结束不等于恢复

- 共享 RateLimiter 每小时 60、60 秒加 jitter、HEAD 校时纳入预算，429 至少冷却一小时并支持更长 Retry-After；这些约束应保留。
- tree clean_partial 与 detail/followup audit_status 要求 rateLimited=false/error=null。429 批次写入失败链，后续即使 rate-limit.json 已到期也不能跨过旧失败批次；handoff 还会写 blocked。
- tree fetch_child 对 URLError/TimeoutError 直接停止，普通临时连接失败同样进入不可自动跨越状态。当前 008 并非 429。

最小补强：区分 cooldown_wait、transport_interrupted、schema_rejected、integrity_failed；对允许恢复类别必须走追加恢复证明并保留账本/Retry-After，不换地区绕限制。不能将所有 error 改为 retry。连续失败达到明确上限转人工。

## P2：静态批次上限、多周源漂移与持续全量审计

- tree max-batches=32 同时硬编码于任务和 stage readiness；first=200 同时硬编码于 stage/observed；observed command_for<=5000，detail<=5000。只改任务参数会与下游门槛不一致。
- detail 每批最多 12 IDs、30 requests、每 ID 两 endpoint；5000 批理论最多 60000 IDs（实际可能更少），并不证明全国队列可容纳。当前队列尚未形成，不能断言上限一定不足。先离线得到固定队列规模和预算模型，再一致调整并记录。
- first/followup/detail 绑定源 hash、固定 queue，源更换会阻断，这是正确的快照语义；数周采集后页面 total/ID 改动也会被 audit 捕获，不能将多时间观察冒充同一时点全国快照。保留 lastObservedAt 和 drift evidence，重新采集应创建新 generation 而非改旧 source hash。
- detail `scan_detail_cache` 每次检查所有旧 checkpoint 和 combined detail，run_batch 每个完成 ID 后再次扫描；这是随缓存增长的重复全量 IO，可能侵占 timeout，但未测量真实规模性能，不能断言已形成瓶颈。先基准测量，必要时按 immutable digest 索引做增量审计，定期全审。

## 建议实施顺序与验收

1. 保存失败原文/失败原因；对 008 做明确恢复设计，不重置现有证据。
2. 修复上游失败传播与健康摘要，使任务 result=0 不再遮蔽实际停摆。
3. 设计并离线验证 interrupted/cooldown 的追加恢复状态转换与进程生命周期。
4. 对齐任务期限、登录与供电策略、外层 timeout 与滚动配额等待。
5. 队列形成后预算/期限估算、漂移策略与大缓存审计性能基准。

本审查只有读证据与静态分析，没有做重启、429、网络请求或生产批次实验；这些验收必须在隔离 fixture 中先通过，再由主任务按授权决定现场上线。
