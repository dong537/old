# MCA 私有采集跨阶段进度审计（2026-11-19）

`scripts/audit-mca-pipeline-progress.py` 是只读源数据的离线审计器：扫描既有地区树、历史列表切片、未来的官方地区首屏、小/大分区后续页及双端点详情；默认将**仅含计数、哈希、状态和异常类别**的 JSON 原子写入 Git 忽略的 `data/private/mca-institutions-2026-11-18/pipeline-progress-audit.json`。它不请求官网、不复制名称、地址、电话或机构 ID 到输出，也不修改采集器或公开站点。`--output` 只能指向该私有缓存目录内部。

运行：

```powershell
python scripts/audit-mca-pipeline-progress.py
python -m unittest tests.test_mca_pipeline_progress -v
```

## 口径与首次校对

- `tree.responseFiles` 是实际落盘的地区树响应文件数；`tree.manifestSavedResponses` 是上一个已提交 manifest 的数字。采集中两者可能暂时不同，不能把 manifest 滞后当作数据损坏，也不能把树节点数当机构数。两份较早根种子只有带来源标记的规范化 JSON 载荷，原 HTTP 字节不可复核；新增响应保存原文与 SHA-256。
- `pages.<stage>.pageFiles / validPages / rows / uniqueIds` 分别是文件、结构可读取的页面、实际行数和该阶段去重 ID 数。历史阶段的一个 `total=0` 首屏被算作结构有效页面，所以本审计的历史有效页口径为 93；旧生产就绪审计把这页另列为 `zeroTotalProbePages=1`、有记录有效页 92。两种口径均对应 894 行、738 个去重 ID。
- `observed.uniqueIdsFromValidPages` 跨历史和新阶段去重；`idsWithValidDetailPairs` 只计两端点均通过结构/来源/原文检查的 ID；`idsStillMissingDetailPairs` 是**已观察 ID** 的缺详情数，不是全国缺口。列表中同 ID 的名称、地址和地区码若出现不同原值，仅输出逐字段字面差异计数，不擅自解释为哪一份正确。
- `integrity.rawHttpBodyVerified` 代表保存的原始 HTTP 字节与 SHA-256/解析 JSON 一致；`originalHttpBodyUnavailable` 代表旧缓存仅有解析 JSON。文件集哈希只固定本地 wrapper 字节，不是官方快照签名。
- `statuses` 反映**最近保存的状态文件**，其中 `phase=running` 不等于进程已证实存活；实际运行还须查询进程或计划任务。`rateLimit` 反映记录的 429 与冷却截止时间。缺失阶段返回 `not_started`，`reported` manifest 数字与实际文件数分开。

2026-11-19 07:40 北京时间的审计样本：地区树 97 份响应，其中 95 份可复算原 HTTP 字节，2 份根种子无原 HTTP；历史列表 93 页、894 行、738 个唯一 ID；36 个 ID 有有效双端点详情。发现 4 行、4 个唯一的 7 字符机构 ID（江苏 1 行、浙江 3 行），这 4 行所在旧 wrapper 均没有原 HTTP 字节；新审计器保留整页并标记异常。详情队列和详情请求入口已另由主 Agent 改为接受 7–64 字符的字母/数字/下划线/连字符 ID，6 字符及路径符号仍拒绝；短 ID 的旧原文不可复核状态不因代码放宽而消失。以上仅是本地观察样本，不构成全国完整或可发布证明。

审计输出的 `nationalComplete`、`snapshotVerified`、`publishable` 始终为 `false`。树、分页和详情的真实完整性，还需稳定分页/直属记录穷尽、同口径时间窗口、字段语义与再展示边界的独立验收。
