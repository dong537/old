# 全国平台地区树分区种子：离线生成与审计

`scripts/build-mca-area-seeds.py` 只读取本地私有的官网地区树缓存，**不发网络请求**。它以 `area-tree-20261119/manifest.json` 和 `responses/*.json` 为 Source of Truth，先要求 `treeWalkComplete=true`、无 429/错误、无待访问父节点，随后逐条复验响应原文哈希、官网父子 ID、层级、节点 ID 与 12 位 `sbcode` 唯一性，以及 manifest 与实际缓存数量。任何缺失、额外响应或冲突都拒绝产出。生成过程使用现有站点独占锁，避免读取正在写入的缓存。

树完整并经核对后，在项目根目录执行：

```powershell
python scripts/build-mca-area-seeds.py
```

输出默认为 Git 忽略的 `data/private/mca-institutions-2026-11-18/national-area-tree-seeds-20261119.json`。当前树未完成时不应运行，也不会生成正式种子。单元测试：`python -m unittest tests.test_mca_area_seed_audit -v`。

每个可查询种子保留原始 `rawNode.id`、`rawNode.pid`、`rawNode.sbcode` 及名称、层级、官网节点路径、响应文件与哈希。无 `sbcode` 的节点单列 `uncodedNodes` 并标记覆盖待核，不能按名称猜代码；其有代码的后代也标记 `uncodedAncestorReviewRequired`。未编码的一层根节点不属于本次内地有编码根节点采集范围。存在官网子节点的父节点标记 `directHangStatus=pending_review`，下一阶段必须单独核验父节点直接挂载的机构；最深层尚未请求子节点，标记 `child_scope_not_enumerated`，不能把它误认为已证实叶子。

种子只是下一阶段逐节点列表采集的**查询输入**，不是机构记录。`snapshotVerified=false`、`publishable=false`；即使地区树完整，也不证明机构列表、详情或同一时点全国快照完整。现有只含 32 个一级节点的 `national-shard-seeds-20261119.json` 保持不变，不自动替换任何采集任务配置。
