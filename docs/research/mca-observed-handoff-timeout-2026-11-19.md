# Observed handoff 配额等待与进程生命周期（2026-11-19）

目标：修复 handoff 外层一小时 timeout 将“等待配额 + 实际采集”相加，导致 Windows 只杀 auto controller 而遗留 collector 孙进程的问题。范围仅 observed handoff、对应测试与本说明；保留上游 tree failure 传播/恢复逻辑，不操作 -009 现场。

数据与职责：共享 hourly-request-budget.json 仍是站点账本权威；复用 tree controller 的 next_available_utc 校验 schema、时区、未来请求和限额。handoff 只读该账本，不预留、重置或改写配额。各 collector 仍在现有站点锁下复核预算和 cooldown。

执行流：审计上一阶段 → 选定一个待采批次 → 只读容量预检 → 满额写 waiting 并结束本次调度 / 有容量启动一次有界批次 → 下一轮重新审计。已经全完成或尚未准备好的阶段不因无采集需求而读取账本。缺失/无效账本 fail closed。

超时责任：
- level3-probe 为直接 collector，handoff 继续给3600秒限时。
- small/large pages 和 observed details 启动 auto controller；handoff 外层不再设置杀父 timeout。其已有内部 subprocess.run(timeout=3600) 直接管理 collector 生命周期，且 max-batches=next_number 仅推进一个批次，限额、间隔、抖动不变。
- 容量预检只是调度提示，无法消除预检与子进程获取锁之间的竞争；若此时配额变满，controller 可依原策略等容量，不会被错误的一小时父进程计时器杀死。controller 等待并非硬性总时长保证；支持其已有 stop 文件。未引入新 watchdog 或平台进程树终止机制。

验证：先加入真实临时账本夹具和 runner 边界断言，RED 观察到满额仍启动、controller外层 timeout=3600、缺账本仍启动三处失败。最小修改后16项 observed handoff 测试全部通过，含原上游失败恢复、阶段顺序、单批上限、失败阻断、锁冲突和发布标识。补充断言满额 probe 也不启动且账本字节未变、large/detail 不继承外层 timeout。测试不等待真实一小时，不联网、不启动生产 collector；超时责任由真实脚本读取和 subprocess 调用边界断言验证。
