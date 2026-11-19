# 全国平台小分区后续页：离线审计与有界试跑

`scripts/collect-mca-area-followup-pages.py` 仅在官网地区树完整、私有分区种子重新离线核验、**所有地区首屏**缓存及其 manifest 完整且一致、共享小时预算账本有效时运行。当前只选首屏 `total/size` 推算为 **2–3 页**的官方区划节点，跳过更大分区；这是基于既有小区县样本的保守试跑，不把省级不稳定分页当作可拼接的全量快照。脚本与地区树/首屏控制器共用控制器锁，实际请求共用站点独占锁、429 冷却与滚动每小时 60 次预算；单线程、最短 60 秒加抖动、无业务重试。

每次只取第 2..N 页，按官方 `sbcode` 查询，最多 5 个未完成分区、12 次站点请求（含校时 HEAD）。每页保留解析后的完整响应、原始 HTTP 响应字节的 base64、SHA-256、请求及获取时点，落在 Git 忽略的 `data/private/mca-institutions-2026-11-18/national-area-followup-pages-20261119/area-<sbcode>/pages/`。同目录 `manifest.json` 记录首屏来源哈希、各区页数、跨页 ID 重复、`total/size` 漂移、页长度以及记录 `areaCode` 是否属于官网节点或其后代；每轮 `batch-runs/<run-id>.status.json` 保存请求、进度和失败。发现漂移或重号时，该区标为**未核实**并停止该区剩余页；429、业务码及响应/缓存校验异常立即停止整个批次，不换区继续。

只有在地区树和首屏控制器已完成、私有种子与首屏审计通过、且无站点冷却后，才手动启动一轮：

```powershell
python scripts/collect-mca-area-followup-pages.py --run-id followup-20261119-001 --max-areas 5 --max-requests 12
```

下一轮换新 `--run-id`，复用已核缓存。退出码 `0` 表示**选中的低量分区**页码与本地 ID 数对账通过；`1` 表示有待取页或未核实分区；`2` 表示错误停止。`snapshotVerified=false`、`institutionListComplete=false`、`nationalComplete=false` 和 `publishable=false` 始终保留：即使页码与本地总数吻合，也没有同一时点冻结快照或跨分区完整性证据。当前代码与测试均为离线准备，尚未向官网发起本阶段请求。离线验证：`python -m unittest tests.test_mca_area_followup_pages -v`。
