# 民政部地区树旧批次证据冻结（2026-11-19）

目标：让一次性旧批次 `tree-20261119-auto-001` 在后续批次修改共享 `manifest.json`、滚动小时请求账本和响应目录后，仍能离线核验并安全续跑。采集原始数据仅保存在 `data/private/`，不进入公开目录。

## 证据与 Source of Truth

- 旧批次的原始 `status.json` 和 `attestation.json` 均保持原字节，不覆盖。后者在首次创建时已经校验当时的共享 manifest、请求账本和 41 份响应，保存了各自 SHA-256。
- 在下一批尚未改写共享 manifest 时，将与旧 attestation 哈希一致的原字节冻结为 `batch-runs/tree-20261119-auto-001.attestation.manifest.json`；将按旧批结束时间筛出的 41 份响应文件名与逐文件 SHA-256 冻结为同目录的 `attestation.responses.json`。响应清单再次核对旧 attestation 的响应总摘要。
- 旧请求账本原字节已随滚动预算被覆盖，不能事后还原为已验证的快照。旧 attestation 中的账本 SHA-256 是首次创建时的证明；后续校验不读取当前共享账本来冒充旧批次。新创建的 v2 attestation 会直接冻结 manifest、账本原字节和响应文件清单到单一 sidecar。

## 续跑边界

`resume_state` 只接受连续、已结束、干净预算中断的 status；校验旧批时读取旧 status、冻结 manifest、旧响应清单及源响应文件，不读取现行共享证据。下一批启动前，`check_preconditions` 仍以**上一批**的 owned manifest 与共享 manifest 一致性、站点冷却、独占锁和滚动小时预算为准。任一哈希、状态、计数、树父子关系或批次链不符即拒绝发送请求。

本修复不证明机构列表完整，也不解除分页漂移、字段含义和再展示许可问题；地区树和逐家数据仍为私有采集证据，不自动发布。

验证：`python -m unittest tests.test_mca_legacy_attestation tests.test_mca_tree_auto_resume tests.test_mca_tree_resume -q`；覆盖共享 manifest/账本/响应目录被后续批改动后重启、v1 冻结件核验、冻结件篡改拒绝、下一批 owned manifest 校验。
