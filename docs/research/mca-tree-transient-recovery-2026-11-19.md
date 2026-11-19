# 地区树 -017 校时失败的精确恢复（2026-11-19）

## 事实与边界

tree-20261119-auto-016 提交了 276 份地区树响应，剩 101 个父节点。后续 -017 在校时 HEAD 阶段失败，错误为 FetchError: server clock calibration failed: invalid or slow HTTP Date response。当前日志只给出组合错误，无法区分非 200 状态、Date 缺失还是往返超过 5 秒。该批 requestsThisRun=1、savedResponseDelta=0、rateLimited=false，没有新增地区响应；不是干净的请求预算中断，旧自动控制器按设计阻断，不能简单重启或清除错误。

失败状态、独立 manifest 和日志分别固定 SHA-256：3051814ad5e9db89f98d066123a45be8da824418587c3fd0ec8084d77af8b768、88b3e67a3feb951fcf2b5c0b668a6d0fc83dbde22885ee2a265f97630863cb23、ee8c56302399018dbeccbddc74f3c93e0b86fdd2411038d8f9ada36259d770b7。补采不得改写这些原件。

## 恢复契约

scripts/attest-mca-tree-transient-recovery.py 只读复核这三个固定哈希、-016 干净预算中断、-017 状态与 manifest 的请求数、缓存数、待查队列、全部已存响应与官方地区树父子关系，以及共享小时预算账本；在控制器锁和站点锁下创建一次性私有 sidecar，不发请求。历史原件保持不变。旧 -008 的独立恢复路径保持原样。

续跑入口 run-mca-tree-resume.py 仅在 -017 的 sidecar 仍可重验时允许新批次；run-mca-tree-auto-resume.py 要求下一批状态包含该 sidecar 的 SHA 链接。已有 429 冷却、站点互斥、单线程、60 秒最小间隔、滚动每小时 60 次预算和严格校时规则均不改变。任何旧源漂移、冷却生效、运行中进程、账本缺失或 sidecar 无效均阻断。

待主代理完成回归审查后，先执行离线 sidecar 创建，再由现有 Tree Auto 调度续跑；不能直接运行第二采集器。只读 live evidence 预检在 276 响应、1 次请求、0 新增响应状态通过。新增 8 项定向离线测试及原有 49 项 tree 回归通过；尚未在线续跑，因此不能宣称本轮地区树已恢复或全国数据已齐。

## Sidecar 大小写排序复核

实际 sidecar 创建后，首次 verify_attestation 在 response_inventory 报 frozen response filenames invalid。根因是 WindowsPath 冻结缓存时按大小写折叠排序，而旧验证代码使用大小写敏感的 sorted(set(names))；276 个文件中有两个大写 ID，索引 128 首次错位。既有 sidecar 与缓存均正确，不应改写。以混合大小写 ID 做 RED 后，统一新库存、冻结名单与重试前文件集为 casefold 顺序，并拒绝大小写碰撞。随后原 sidecar 验证通过，真实现场 -017 到 -018 的只读 preflight 也通过：276 缓存、101 待查、0 官网请求。新增定向测试共 10 项；仍须由主代理确认原 Tree Auto 任务唯一运行后恢复在线采集。

## 后续稳定性判断

一次无效或过慢 HEAD 就终止批次会反复触发人工恢复。可另做独立改动：仅对此类校时失败，在同一个共享 limiter 下最多再试一次 HEAD，每次都记入小时预算且遵守最小间隔；429 和其他校验错误仍硬停止。需先为第二次校时成功、持续慢响应、429、预算耗尽及不重复 POST 建 RED/GREEN 测试，再考虑上线。本次精确恢复不修改在线时钟行为。
