# 全国平台地区首屏采集：保守试跑

入口 `scripts/collect-mca-area-first-pages.py` 仅接受同一私有目录中由 `build-mca-area-seeds.py` 产出的完整地区树种子。每轮在站点独占锁内重新离线审计地区树并比较种子全内容；`treeWalkComplete` 不为真、种子篡改、缓存损坏、共享每小时预算账本缺失或锁冲突时**不发请求**。当前树采集仍在运行时不要启动。

每个官网 `sbcode` 最多请求列表第 **1** 页，`checkSort=1`，单线程，使用现有签名请求、站点冷却及滚动每小时 60 次请求账本。间隔下限 60 秒加随机抖动，含校时 HEAD；每轮默认最多 20 个未缓存地区、20 次站点请求、无业务重试。429、业务码错误、HTTP/解析/缓存校验错误立即停止整轮，并将冷却写入站点级 `rate-limit.json`。预算耗尽属于可续采中断，不自动换地区绕开预算。

地区树完成、正式种子生成且现有采集进程结束后，示例命令：

```powershell
python scripts/collect-mca-area-first-pages.py --run-id firstpage-20261119-001 --max-areas 20 --max-requests 20
```

再次运行须换新 `--run-id`，缓存自动复用。原始首屏响应位于 Git 忽略的 `data/private/mca-institutions-2026-11-18/national-area-first-pages-20261119/area-<sbcode>/pages/00001.json`；同目录 `manifest.json` 保存每个地区的缓存文件哈希、官网响应哈希、总数及首屏行数，每轮状态保存在 `batch-runs/<run-id>.status.json`。退出码 `0` 仅表示全部**首屏**已缓存，`1` 表示批次/请求预算到限且仍有待取地区，`2` 表示错误停止。此数据明确标记 `nationalComplete=false`、`snapshotVerified=false`、`publishable=false`；列表总数、首屏行和唯一机构数不能混用。

2026-11-19 补强：新采集的首屏 wrapper 必须保留原 HTTP body 的 `rawBodyBase64`；缓存复用时逐页核对原始字节的 SHA-256 与解析 JSON，缺失或不一致即停止，不用重新序列化的 JSON 冒充原始响应。旧版首屏若缺原始字节，不得用其作为分页证据完整的依据，需单独审计后在新采集代重新取得。

离线验证：`python -m unittest tests.test_mca_area_first_pages -v`。不要把首屏采集当作全国机构全量；后续仍需逐地区分页稳定性、父级直挂、重叠和详情单独审计。

## 串行批次控制器

完成地区树和正式种子审计、且现有树进程已退出后，可启动保守的无人值守控制器；它和地区树控制器共用控制器锁，子批次仍使用站点独占锁和每小时预算：

```powershell
python scripts/run-mca-area-first-pages-auto.py --batch-prefix firstpage-20261119-auto --max-batches 200
```

每批最多 20 个地区首屏及 20 次站点请求，批次状态 ID 递增为 `firstpage-20261119-auto-0001` 等。满 60 次/滚动小时预算时等待下一可用时刻；只对无错误、无限流的预算中断续下一批。429、业务错误、种子变化、站点锁冲突或缓存冲突即停止，不能自动恢复。重启时读取连续状态链，不覆盖已有批次；中途被杀的运行标记要求人工检查。

优雅停止：在项目根目录创建 `data/private/mca-institutions-2026-11-18/national-area-first-pages-20261119/batch-runs/firstpage-20261119-auto.stop` 空文件；当前批结束后控制器退出。复跑前检查最后一个批次状态、私有缓存与站点冷却，删除该 stop 文件后再用原命令启动。Ctrl+C 可能打断子进程并留下待核状态。控制器离线测试：`python -m unittest tests.test_mca_area_first_pages_auto -v`。
