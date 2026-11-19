# 官网已观察机构详情：私有断点阶段

脚本 scripts/collect-mca-observed-details.py 只从**已离线核验的完整地区树种子、全部地区首屏缓存，以及已保存且经核验的后续页**提取 axbe0001。同一 ID 在父子分区出现多次时保留所有来源页，但只进入一次详情队列。若首屏不完整、来源页原始字节/哈希或既有详情缓存损坏，本轮不发新请求。合法响应里的总数漂移、跨页重号等业务问题记录在 queue.json 的 areaIssues、各 ID 的 listCoverageIssues 和 listCoverageVerified 中；仍可采已观察 ID 的详情，但不能据此宣称分区全量。该队列不等于全国现行机构全量名录，输出始终为 nationalComplete=false、snapshotVerified=false、publishable=false。

每轮串行处理最多 1 个新 ID，默认站点请求上限 6 次（包含校时请求）、请求间隔至少 60 秒加抖动，并共用地区树控制器锁、站点独占锁、滚动每小时 60 次预算及 429 站点级冷却。两个详情端点 orgBaseDetail、yangLaoOrgDetail 分别保存原始 HTTP 字节的 base64、SHA-256、请求时间和解析结果；任一端点失败会停批，下轮只续取缺失端点。业务错误不跨 ID 重试。

仅在共享私有账本及来源检查通过、无站点冷却、且上游采集控制器未运行时，从项目根目录执行：

~~~powershell
python scripts/collect-mca-observed-details.py --run-id detail-20261119-001 --max-ids 1 --max-requests 6
~~~

复跑要换新 run-id。私有输出位于 data/private/mca-institutions-2026-11-18/national-observed-details-20261119/：queue.json 记录 ID 与所有来源页，detail-checkpoints/ 保存各端点，details/ 保存合并结果，manifest.json 和 batch-runs/ 记录进度。退出码 0 只表示**队列中已观察 ID**均有两端点详情；1 表示仍有待处理 ID；2 表示来源、缓存、限流或接口错误，须先审查状态后再运行。该阶段尚未启动真实采集；离线验证命令为 python -m unittest discover -s tests -p test_mca_observed_details.py -v。

## 固定队列的无人值守串行控制器

待上游地区树采集结束、全部首屏来源完整、共享账本有效且详情单批次验收后，可在项目根目录启动：

~~~powershell
python scripts/run-mca-observed-details-auto.py --batch-prefix detail-20261119-auto --max-batches 5000
~~~

控制器每批固定最多 1 个 ID、6 次站点请求和至少 60 秒请求间隔；子进程仍负责共享地区树控制器锁、站点锁、小时预算、原始响应校验和 429 冷却。控制器自己的锁仅防止两个详情控制器重复启动。首批锁定来源队列 SHA-256；每批将该哈希传给子进程，来源页增长或改动时在发请求前停止，不把新 ID 自动纳入同一任务。恢复时核验连续的四位批次序号、来源哈希、唯一 ID 总数及完成数；中断、429、业务错误、状态缺口或数据变化均需人工审查，不能自动续跑。

优雅停止：在详情输出目录的 batch-runs/ 下创建 detail-20261119-auto.stop 空文件，当前有界子批次结束后不再启动下一批。删除该文件前先核对最后状态与私有缓存；重启须使用原 batch-prefix。控制器退出码 0 仅代表锁定的已观察 ID 队列详情完成，3 代表 stop 文件，4 代表配置的批次上限，2 代表错误。离线验证命令为 python -m unittest discover -s tests -p test_mca_observed_details_auto.py -v。**本次仅实现并离线验证，未启动该控制器或官网采集。**
