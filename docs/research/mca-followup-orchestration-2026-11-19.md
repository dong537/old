# MCA 后续页采集编排审查（2026-11-19）

## 目标与边界

目标是让已审计的官方地区首屏之后，能够按单线程、断点、站点预算继续采集 **2–3 页的小分区**。数据继续写入 Git 忽略的 `data/private/mca-institutions-2026-11-18`；现有公开网站 JSON 不接入，所有快照完整性和公开标记仍为 `false`。此控制器不能完成全国所有列表页或详情页。

## 数据与运行路径

- 官方地区树与首屏响应是唯一输入依据；`collect-mca-area-followup-pages.py` 复核种子、首屏 manifest 和全部已存页，再计算下一页。状态、原始响应和哈希存于私有目录，绝不以接口 total 充作已抓取数量。
- 新增 `run-mca-area-followup-auto.py` 作为连续批次控制器；独立锁防重复实例，子进程持有全站锁、同一滚动小时账本、至少 60 秒的请求间隔及 429 全站冷却。每批最多 5 个分区、12 次请求；批次号、种子与首屏哈希、页数及审计异常均需连续一致。异常、限流、源文件漂移或分页重复时停止，不自动换参数、换 IP 或清空状态。
- 只有首屏 `allFirstPagesCached=true` 且离线审计通过，控制器才可启动。手动运行：`python scripts/run-mca-area-followup-auto.py --batch-prefix followup-20261119-auto`；优雅停止：创建私有 `national-area-followup-pages-20261119/batch-runs/followup-20261119-auto.stop`。当前树任务尚运行，**没有启动该命令或增加官网请求**。
- 树阶段的定时任务保留 `Eldercare-MCA-Tree-Auto-20261119`；首屏交接现只保留 `Eldercare-MCA-Stage-Handoff-20261119`。旧 `Eldercare-MCA-FirstPages-Handoff` 已由主 Agent 停用，避免两个交接任务竞态。新后续页控制器尚未注册定时任务，也未与现有 handoff 串联。

## 尚未打通的全国全量路径

1. 后续页采集器硬限制预期页数为 2–3；超过 3 页的分区明确跳过。必须另行设计对大分区的稳定分页与异常隔离，不能简单放大上限后宣称覆盖完整。广东省级 offset 分页已观测跨页重复，省、市直挂记录不能靠区县合集还原。
2. `run-mca-observed-details-auto.py` 有固定来源队列、断点与限速，但当前未定时启动；每批只处理 1 个 ID、最多 9999 批。对于约 4 万条的列表报告值，即使列表完整，现有配置仍不足以处理全部详情；需先确定列表 ID 队列与实际总量，再调整批量和阶段顺序。
3. 没有稳定游标、冻结快照或父级直属记录的可核穷尽方式前，只能记录“已观察机构”，`snapshotVerified` 与 `publishable` 必须保持 `false`。页面字段公开再展示的许可与逐字段核验另行验收。

## 离线验证

`python -m unittest discover -s tests -p test_mca_*.py -q`：179 项通过。新增控制器用例覆盖连续恢复、跨批来源漂移、无进展、停止文件、429 及串行完成；`python -m compileall -q scripts/run-mca-area-followup-auto.py` 与 `git diff --check` 通过。未运行官网请求，也未做真实后续页采集验收。

## 后续扩展

大分区观察、三级子级探测优先级、详情队列接入和单批次周期性交接见 mca-observed-pipeline-2026-11-19.md。本文件保留最初 small 模式审查记录；其中“尚无大分区控制器/阶段交接”等描述是当时状态，不代表当前代码能力。
