# MCA 官方区划树一次性后续批次（2026-11-19）

目标是取得已核官网一级节点下的市、区县代码，为省级分页漂移后的细分采集提供真实分区；不下载机构详情，不生成公开站点数据。原始地区树响应在 Git 忽略的 `data/private/mca-institutions-2026-11-18/area-tree-20261119/`，每条保留官网节点 ID、父 ID、原始响应和哈希；本地 manifest 是派生审计。

入口 `scripts/run-mca-tree-after-roots.py` 仅在北京时间 2026-11-19 05:00 后，且 `roots-20261119-a` 的状态与唯一批次摘要同时证明 32/32 一级分区首页取得、无 429 时才调用 `fetch-mca-area-tree.py`。后者复用全站锁、冷却和滚动 60 次/小时账本。此批次单线程、请求至少间隔 60 秒加 0–10 秒抖动，最多 20 次请求（包含签名校时 HEAD），没有自动重试或循环。根批次仍运行、失败、摘要不唯一或站点冷却有效时，本次不发送请求。

20 次请求通常不足以走完全国市区县树；包装脚本会保存已有原件、`manifest.json`、日志和 `batch-runs/tree-20261119-a.status.json`，对 `treeWalkComplete=false` 明确返回退出码 1。该退出码表示**未完成全国树**，不能把缓存视作全量。429、接口错误、损坏缓存和预算限制均保持可见；不会改动已有机构响应。区划树后续使用前要核对官方父子关系、代码唯一性、未访问节点及前后批次变化。

一次性任务已在当前 Windows 用户会话登记为 `Eldercare-MCA-Tree-20261119`。32/32 根节点首页批次于 04:58 成功结束，因此实际触发时间提前至北京时间 **05:03:25**。省级首页任务曾在第 4 区因“请求已过期”非零退出，随后用同一 capture ID 断点续采；本包装脚本依据最终 status 的起止时间，只接受落在该次成功运行区间内的唯一批次摘要，不会因旧失败摘要而误判，也不会把旧成功摘要当作新运行结果。本机若睡眠、离线或根批次未成功，树任务不会取得数据。下列命令是任务登记方式的复现参考，运行前须先核对同名任务不存在。

```powershell
$project = (Resolve-Path .).Path
$python = (Get-Command python).Source
$script = Join-Path $project 'scripts/run-mca-tree-after-roots.py'
$action = New-ScheduledTaskAction -Execute $python -Argument ('"' + $script + '"') -WorkingDirectory $project
$trigger = New-ScheduledTaskTrigger -Once -At ([datetime]'2026-11-19 05:03:25')
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Eldercare-MCA-Tree-20261119' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description '一次性受控采集 MCA 官方区划树'
```

验收时读取该任务 `LastTaskResult`、私有 status 与 log，并对照地区树 manifest 的 `treeWalkComplete`、`savedResponses`、`pendingParentIds`、`requestsThisRun`、`rateLimited`、`lastError`。只报告已实际保存的响应，不将官网节点、机构列表 `total` 或目录候选数混用。取消任务时精确执行 `Unregister-ScheduledTask -TaskName 'Eldercare-MCA-Tree-20261119' -Confirm:$false`；不会删除缓存。
