# MCA -008 可审计恢复批次链（2026-11-19）

## 目标与边界

为已审核的湖州父节点 `61c11934c4e04524af2b935e81acb580` 的精确 sbcode 校验失败建立恢复链接，继续全国机构树采集。原 `tree-20261119-auto-008` status / owned manifest 保留失败事实，不覆盖、不改为预算停止、不删除缓存。此任务不自动联网、不启动任务、不生成现场恢复凭证。

## 数据权威与模块

- 原失败 status + 其 `collectorManifestSha256` 指向的 owned manifest 是失败事实来源。shared manifest 必须仍等于该原件才允许首次授权。
- 124 份缓存 wrapper 的原始文件哈希、HTTP body 哈希、官方父子关系及连通性一起复核；时间边界核对 122 份运行前缓存和 2 份本次新增缓存。首次授权冻结每文件哈希。该冻结是在审核时建立，不冒充运行前已存在的逐文件快照。
- diagnostics 中 00:41 重取的原 HTTP wrapper 是独立诊断证据，并非 00:33 失败请求原件；只声明重取内容已审核，不证明前后远端响应相同。固定 body SHA `0dd6d5d80e1708b13f46c6823903a99affa7af813452ff9a5843223063881559`，另冻结 wrapper 原件哈希。诊断不会导入 collector cache。
- `attest-mca-tree-recovery.py` 只离线审核并新建 `.recovery.json` 侧车；要求非空显式授权说明，使用站点排他锁和独占创建。代码不修改失败状态或账本。
- `run-mca-tree-resume.py` 校验恢复凭证，仍执行现有新 run ID、所有未完成任务、manifest 所属、site lock / cooldown 等门槛。恢复前要求缓存文件集合未变；新批次记录 `priorRecoveryAttestationSha256`。
- `run-mca-tree-auto-resume.py` 从连续 status 重建链；对 -008 的这一特定失败验凭证，对 -009 验凭证哈希链接。任何其他失败仍阻断。后续新增缓存允许存在，但原124份须一直匹配冻结哈希。

## 恢复数据流与失败行为

原失败 + 原缓存 + 单次重取诊断 → 当前严格 validator 离线通过 → 显式授权凭证 → 新批次 -009 → 原 collector 复用缓存、仅请求缺失 pending 父节点 → 独立 owned manifest/status → 自动批次正常链。

原失败必须严格匹配预定错误、非429、非预算停止、collector/外层 exit=1；任何状态/计数/时间/来源/诊断/缓存漂移、validator 源码哈希变动、站点冷却、未完成运行或新错误均 fail closed。限流不属于恢复适用范围，不增加重试、不清账本。原 collector 20 请求/批、60秒间隔加抖动、共享60次/小时与错误停止策略保持不变。

授权凭证还固定 `fetch-mca-area-tree.py` 与 `build-mca-area-seeds.py` 的源码哈希。未来变动会使审核失效，需要单独设计后续审核流程；不能覆盖旧凭证。凭证是本地审核链，并非第三方签名，也不是远端数据新鲜度证明。

## 操作（由主代理审阅后执行）

```powershell
python scripts/attest-mca-tree-recovery.py --authorize-recovery "operator authorized reviewed exact-code recovery; preserve failed -008; bounded pending-only retry"
python scripts/run-mca-tree-resume.py --previous-run-id tree-20261119-auto-008 --run-id tree-20261119-auto-009
```

- 首条命令零网络请求，仅新增私有 sidecar；重复执行拒绝覆盖。
- 第二条命令真实启动一次有界采集。检查 -009 `phase=finished`、owned manifest hash、recovery link 和无新增错误后，原 auto controller 才可重启；自动链仍以 `tree-20261119-a` 为 initial run、`tree-20261119-auto` 为 prefix。
- 若恢复验证失败，保留所有原件及凭证，不以删除/改写历史回滚。无需数据迁移。

## 验证证据

TDD：新恢复能力不存在时 5 项断言 RED；实现后通过。补充自动链缺失 recovery link 的测试，先观察 RED，再实现链接校验 GREEN。最终恢复 7项、resume 10项、auto 8项全部通过；legacy attestation 回归另记录于主任务。测试仅写临时目录，无网络。

现场首次生成凭证时，历史初始批次 `tree-20261119-a.status.json` 没有 `phase` 字段，严格遍历将它误判为未完成；当时零请求、未生成凭证。新增离线回归后，仅允许该精确初始批次的 `phase=null`、`collectorExitCode=0`、`exitCode=1` 且具有效结束时间，其余运行状态继续严格阻断。恢复测试现为 8 项；随后生成私有 `.recovery.json`，保留原 `-008` 失败状态与 124 份冻结缓存。

现场只读 `evidence()` 已通过当前精确 validator；返回124份缓存，inventory SHA `39065c2559b86933d74960215b6e8dabd90c15fbafc07acb8cbc6c497a4efe76`，status SHA `336fa6cd709606b49495c9504647a724f3a14e62f7a11e27315260f768f88c55`，manifest SHA `d5421a5799b91606eeb940a140f17c1fa4f21dc488784c75256bf3df8c4a71c6`。无现场写入。
