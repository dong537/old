# 全国平台地区树根节点 HTTP 独立重取

## 目的与证据边界

2026-11-18 锁定种子中的根节点 `-1` 与广东节点 `9a94f430a4604063bb357fca8b616080` 只保留了 JSON 响应体，没有当时的原始 HTTP 字节。此脚本在原地区树**完整并通过离线审计后**，依次重取两份当前 HTTP 响应，存入独立私有目录，逐节点比较新增、删除、字段变化和顺序变化。即使两次响应内容与旧 JSON 相同，也只能称“当前内容复现”；不能倒推旧 HTTP 字节曾被验证，也不构成全国养老机构名录完整性证明。

原始种子 `data/private/mca-filter-retry-20261118.json` 的 SHA-256 固定为 `4bb165aa8ea4d2066540dc01139ff7a1d79c468d0ac729d9662237c48e330f73`。旧树、旧种子和旧 manifest 均不得由本脚本改写。新响应保存到 Git 忽略的 `data/private/mca-institutions-2026-11-18/area-root-http-recapture-20261119/`；其中可能包含不宜公开的源数据，不能直接复制到 `public/`。

## 执行顺序

在项目根目录先做**只读预检**：

```powershell
python scripts/recapture-mca-tree-roots.py
```

预检不创建输出目录，也不请求网络。只有 `ready: true` 且 `pendingParentIds` 尚有值时，才具备请求前置条件。它会复用 `build-mca-area-seeds.py` 离线审计全部地区树响应；若原树 `treeWalkComplete=false`、缓存损坏、种子 SHA 不符、共享小时账本异常或站点仍在冷却期，均不会执行请求。2026-11-19 的当前预检结果为 `ready: false`，因为原地区树尚有待采集父节点。

等原树完成且没有其他 MCA 采集作业运行后，显式启动**至多两次站点请求**的单批次：

```powershell
python scripts/recapture-mca-tree-roots.py --execute --batch-number 1
```

请求串行。脚本同时占用现有树控制器锁与全站采集锁，使用同一个滚动小时预算账本（60 次/小时上限）和站点 429 冷却文件；默认请求间隔至少 60 秒，再加随机抖动。签名时钟校准的 HEAD 也计入请求预算，所以两次预算可能只完成一个或零个 GET。批次结果为 `partial` 时，再运行只读预检，根据 `nextBatchNumber` 启动下一批；不要猜测或跳过批次号。

每份新响应必须保留原始 HTTP 响应体、SHA-256、来源 URL 和响应 JSON，并通过原地区树的父子节点校验。每次批次结束写入独立 manifest 和状态文件，下一批重新计算原树指纹及新响应文件清单，发现改动即拒绝继续。发现根节点内容漂移时，保存新响应证据但**不请求第二份**；429 时立即停止并记录全站冷却；其他异常也停止。对于 `drift` 或 `blocked`，不通过修改状态文件强行续跑，应先人工分析源站与缓存证据。

## 离线验证

```powershell
python -m unittest tests.test_mca_tree_root_recapture -v
python -m unittest tests.test_mca_area_tree tests.test_mca_area_seed_audit tests.test_mca_tree_resume tests.test_mca_tree_auto_resume -q
python -m compileall -q scripts/recapture-mca-tree-roots.py
git diff --check
```

结果中的 `currentReproductionMatchesLockedPayload` 只表示新旧 JSON 内容匹配；`originalHttpBodyVerified`、`snapshotVerified`、`publishable` 均固定为 `false`。该阶段只补地区树根种子的证据缺口，不发布机构资料，也不声称已经穷尽全国机构。
