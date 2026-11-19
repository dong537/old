# MCA 只读采集健康快照

目标：给本地运维输出 tree → firstPages → probe → pages（small/large）→ details 的当前阶段和最上游阻断、可信成功响应时间及距今时长、共享冷却和小时预算。只读磁盘、stdout 输出，不联网、不加锁、不写状态，不把等待/批次退出 0/遍历完成解释成全国采全。`publishable`、`nationalComplete` 恒 false。

Source of Truth：各阶段现有 manifest、batch status、缓存响应；共享 `rate-limit.json` 与 `hourly-request-budget.json`。响应原始 bytes/hash 和官方 URL/method/business code 校验复用只读 progress audit 工具；新脚本负责选择阶段、严格脱敏投影与时间计算。manifest 声称完成只标 `reported_complete`，不代替不可变批次链和覆盖审计。

接口：`python scripts/mca-collection-health.py [--root PATH]`，stdout JSON，时间均 UTC ISO，时长 seconds。未知时间用 null，未知计数不补 0。响应时间晚于快照时间或格式错误不算成功；最后成功响应时间不采用 manifest 更新时间。无进展时长仅定义为距最后可信成功响应的时间，不证明进程存活/死亡。

错误：畸形 manifest/status、缓存 hash/source 错误和未来时间显式代码化；最上游未完成阶段优先，源错误高于共享节流等待；下游 waiting 不掩盖上游失败。小时预算滑动 3600 秒、60 次，严格校验既有 ledger schema；预算缺失视为 unknown 而非可发请求授权。

输出只含固定枚举、计数、布尔和标准化时间；不转发 error/reason/name/ID/URL/路径/records/原始字段。运行中逐文件快照非原子，记录 `atomicSnapshot=false`，不自动重试或修正源文件。

验证：离线 fixture，覆盖空缓存、等待、上游失败、损坏缓存、未来时间、冷却/预算边界、只读性、各阶段状态和隐私；不改其它脚本与真实运行状态。

补充状态规则：small/large pages 各自选最新批次，不能用另一分支的新成功掩盖失败。合法新状态可以越过有时间序的旧版无 phase 状态，但输出 `historicalInvalidStatusCount`；无法排序或最新畸形状态仍阻断。较新 running 批次尚未提交 manifest 时，旧 manifest 错误以 `running_prior_manifest_error` 和 `manifestErrorPresent=true` 明示，不判作已恢复成功；status age 不代表进程存活检查。stage handoff 的 waiting/running/blocked 也纳入五阶段投影。

验证结果（2026-11-19）：

- 新脚本首次 RED 8 项；补充 handoff、双分页分支、状态年龄、畸形字段、旧状态/旧manifest 边界分别确认失败后修复。最终 `rtk python -m unittest discover -s tests -p test_mca_collection_health.py -v`：15/15。
- 复用模块回归 `rtk python -m unittest discover -s tests -p test_mca_pipeline_progress.py -v`：4/4。
- `rtk python -m compileall -q scripts/mca-collection-health.py tests/test_mca_collection_health.py`：exit 0。
- 只读真实缓存 smoke，2026-11-19T00:58:33Z：tree 125 个本地有效响应、manifest 仍记录124；状态 running_prior_manifest_error；最后成功响应00:58:25Z，距快照8秒；小时预算36/60，冷却已过期，publishable=false。这是该时点观察，不作后续实时保证。
- 未改真实运行文件；快照扫描期间其它采集器可能正常继续写缓存，故显式 `atomicSnapshot=false`。未检验进程存活、完整不可变批次链或全国覆盖，不能用本快照替代生产发布审计。

## 后续修复：handoff 的新轮询时间不代表新批次失败

现场 `observed-stage-handoff.status.json` 在01:04:51Z重新读取旧 tree manifest，并以固定原因 `upstream area tree failed or rate limited` 记录 blocked；其 checkedAtUtc 晚于 -009 的 startedAtUtc，旧实现因单纯比较时间误覆盖了 running。

精确修复条件：当前 tree 已由批次记录判断为 `running_prior_manifest_error`，observed handoff 的 stage=area-tree、phase=blocked、reason 为该固定上游旧manifest原因，且没有 error 或非零 childExitCode/firstPageExitCode。此时保留批次的 running 和原始开始时间，另记 `historicalHandoffBlockCount`、`lastHistoricalHandoffBlockAtUtc` 与 `downstreamHandoffCode=blocked_on_prior_tree_manifest`。后者时间是**轮询时间**，历史性指阻断来源是旧manifest；不是把这个观测时间改写为过去。

未知原因、真实子进程非零退出、新manifest错误或缺少新running批次仍保留阻断。新增 `processLivenessVerified=false`，running 明确仅为状态文件记录，不能把无进程证明或没有成功响应当成成功。

TDD：先新增较晚 handoff 轮询 fixture，观察 `blocked != running` 的 RED；修复后17/17健康快照测试通过，包括 childExitCode=2 不被此例外覆盖、没有running批次仍blocked。只读现场复核2026-11-19T01:07:19Z：132份有效响应、tree running_prior_manifest_error、历史handoff阻断1条、最后成功01:06:16Z、无进展63秒、publishable=false。未改任何现场状态文件。

## 后续修复：干净预算中断不是批次故障

- -009 的 collectorExitCode=0，而 one-shot wrapper 约定 exitCode=1、固定 PARTIAL_ERROR、requestBudgetReached=true 表示“预算用完但树尚未完成”。health 原先按通用非零退出错误判断，误报 source_error。
- 最新 finished tree 批次现在复用 auto controller 的 `clean_partial`，再只读核验 owned manifest 原始 bytes SHA、runId、时间窗、计数和状态字段，以及当前 manifest 与 owned manifest 一致；全部通过才显示 `partial / request_budget_reached`、`latestBudgetStopVerified=true`。缺少或伪造SHA仍blocked，不以匹配错误文案单独判定可续跑。
- `historicalFailureCount` 单列被更新批次取代的真正失败；历史符合干净预算中断格式的批次不当成失败。最新状态仍按各独立批次组选择，small/large分支不会互相掩盖。
- finished批次使用有效结束时间作为状态观察时间；在其之前的旧handoff blocked进入历史计数，不能把已提交的最新干净批次再次判成当前故障。
- TDD先复现 `blocked != partial`，修复后18/18健康快照测试通过，含SHA伪造阻断和旧失败/旧handoff保留。现场只读复核01:25:04Z时已进入后续批次：tree running，144有效响应，manifest143/234pending，historicalFailureCount=1，manifestErrorPresent=false；这反映现场继续推进，不将-009误写回当前状态。
