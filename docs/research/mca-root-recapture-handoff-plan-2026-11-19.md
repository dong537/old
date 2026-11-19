# 地区树完成后的根原文再捕获自动衔接方案（2026-11-19）

目标：仅未来tree真实完结且批次链/最终owned manifest一致后，定时handoff先完成两份旧根独立HTTP再捕获，再建种子并启动首屏。当前任务只改代码与离线测试，不执行现场脚本、请求、锁探测或状态写入。

权威数据：tree原manifest、最终run status/owned manifest和旧根缓存保持不变；recapture原脚本负责source_plan、raw校验、逐节点payload比较、独立manifest/status链与共享预算。新handoff只编排并复审；原HTTP缺失标记不因当前再现而升级。

状态/数据流：定时tick → 独立handoff非阻塞锁 → 原running/blocked拒绝自动重跑 → tree完成与链/hash核对 → controller与site均空闲 → 再捕获独立链审核 → 未开始/clean partial且有配额时最多执行一批2请求 → complete且两payload相同才build seeds → first_auto。partial写waiting，下轮仅请求尚缺根；drift/429/异常/孤儿cache/中断状态写blocked并保留原件；现有complete只复审，不再请求。

Windows重入：handoff持有自身锁贯穿子进程；第二tick不覆盖运行status。外层不杀仍带子采集进程的controller；再捕获是直接collector，可设600秒上限（两次60秒+jitter+30秒HTTP，额外留裕量）。中断running须人工审核。child仍自行获取已有controller/site锁，父级预检不替代子锁；竞态失败明确阻断。

停止与配额：handoff stop文件阻止新子任务；满额等待下一tick，不修改hourly账本；cooldown阻断；所有执行仍由既有60秒间隔/10秒抖动、60每小时和单线程控制。

首屏预算：取消固定200批，依据builder产出的真实seedCount设置保守批次天花板（至少200、目标每种子2批、受first_auto既有9999硬上限），并明确它不保证无限零进度重试。种子数量超出可支持天花板时阻断而不静默截断。

验证：先RED证明完整树会绕过recapture、partial不续链/漂移不阻断、重复tick竞争与200批不足，再GREEN；真实临时tree/seed/recapture缓存复审测试 + 模拟runner只隔离网络边界，保留已有recapture回归。无现场迁移/回滚；停任务后回退仅代码，不删历史产物。

## 实现与运行状态（代码交付，不启动现场）

- run-mca-stage-handoff.py 的 readiness 现在要求最终status/runId/collectorExitCode、shared与owned manifest字节及SHA一致、pending为空；持有controller/site锁复查一次，锁占用仅waiting，不抢占。
- recapture_state 复用原source_plan/scan_cache/prior_batch，复核两份raw及完整manifest；terminal complete才向后推进。原响应payload和文件永不覆盖；新再现仍originalHttpBodyVerified=false。
- 干净partial必须error=null、rateLimited=false、requestBudgetReached=true、请求数0..2；handoff写waiting，下次按batchNumber递增，只请求pending根。drift/429/损坏/孤儿/中断均blocked，后续tick不改写原blocked。
- root再捕获实现文件（recapture、fetch核心、tree fetch、seed builder）SHA写入handoff状态；partial续跑或成功后重审发现源码变化则阻断。首次采用已有完整recapture仅验证现有证据，不伪造其历史代码版本。
- 单独stage-handoff-lock涵盖完整子进程生命周期；Windows重复tick无法覆盖正在运行状态。停止文件为batch-runs/stage-handoff.stop。ROOT未完成时不获取site/controller锁、更不启动再捕获。
- 首屏天花板为 min(9999,max(200,2*seedCount))：1854种子→3708批，4000→8000批；种子>9999或非法计数拒绝。每批20请求、60秒+抖动、共享60/h均未改。它是有限安全上限，不保证无限零进度预算停止仍必然完成。
- 与已有Windows任务兼容，无新增CLI参数；下一个计划tick运行现有脚本即可。此任务不启动计划任务、不改XML、不删除/重写现场状态。原running/blocked需人工审计，不能因新增自动编排擅自解锁。

## 测试证据

先观察5项RED：缺少再捕获步骤、partial错误进入后续阶段、drift未阻断、固定200批、owned manifest漂移漏检；实现后GREEN。另观察实现指纹漂移测试RED后加门禁GREEN。临时真实树/锁定seed/recapture文件驱动现有run_batch，仅替换HTTP fetch边界，核对原根字节不变、下一tick只补余根、已complete不重抓、满额不启动、429、stop、重复scheduler锁及旧blocked不重试。全部测试只写临时目录。

## 覆盖审计的补采证明衔接（2026-11-19）

audit-mca-list-coverage.py 不改旧地区树缓存，只把独立 area-root-http-recapture-20261119/ 作为可撤销的补充来源。原树 responsesWithoutOriginalHttpBody 继续记录历史缺口；当缺字节的节点集合恰好等于锁定种子的两根、地区树完整、现有 recapture_state 逐项核验锁定种子和旧文件哈希、两份原始 HTTP 字节及请求身份、完整 manifest/status 链，并确认新旧 payload 完全一致时，sourceTree.rootRecapture.verified 才为 true，汇总理由中才不再列 area_tree_original_http_body_missing。补采目录的全部文件进入审计指纹，审计期间变化立即撤销证明。

缺目录、部分补采、篡改、身份错误、payload 漂移或树仍在运行均保留缺原文理由；报告只输出聚合状态码，不输出机构、节点或个人信息。该补充证明仅消除这一个历史来源缺口，zeroOmissionProven、nationalComplete、snapshotVerified、publishable 仍为 false；分页冻结、深层地区、父子直属残差、详情和再展示另行验收。回滚时停用该审计代码即可恢复原缺口理由，旧缓存和独立补采文件不迁移、不覆盖。
