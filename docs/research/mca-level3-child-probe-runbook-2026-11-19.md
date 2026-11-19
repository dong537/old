# 全国平台三级地区节点子级探测：断点阶段（2026-11-19）

## 目的与当前证据

现有地区树采集器设置 maxLevel=3，只请求三级节点的父节点；三级节点下面是否还有四级节点，现有缓存**不能证明**。新脚本 scripts/probe-mca-level3-children.py 为每个已核三级节点单独查询一次官方子节点接口，结果仅保存在私有目录 data/private/mca-institutions-2026-11-18/area-level3-probe-20261119/。它不改写原地区树、首屏列表缓存或网站公开数据。发现四级节点后只证明其存在；四级节点下是否仍有子级需另行核验。

## 运行门槛

1. 原地区树 manifest 必须显示 maxLevel=3、treeWalkComplete=true、无错误和限流；脚本重新离线验证全部源响应、树闭包及哈希。当前树尚未完成，**本轮未发送任何官网请求**。
2. stage-handoff.status.json 必须显示 phase=finished 且 firstPageExitCode=0，表示原树和首屏任务均已结束。脚本同时持有原控制器锁 tree-auto-controller.lock 与全站 collector.lock；控制器运行、采集器运行或交接中都拒绝启动。
3. 全站冷却必须结束，共享 hourly-request-budget.json 必须存在且有效。每批最多 20 个三级节点、最多 20 次站点请求，单线程，间隔至少 60 秒加抖动；签名时钟校准 HEAD 也消耗请求预算。429 立即熔断并留存全站冷却，不能换分区或代理继续。

## 离线检查与未来单批执行

在项目根目录，默认命令只做离线审计，不发站点请求：

```powershell
python scripts/probe-mca-level3-children.py
```

原树和首屏阶段完成后，每次手动执行一批；后续编号严格递增，不自动重试：

```powershell
python scripts/probe-mca-level3-children.py --execute --batch-number 1 --max-parents 20 --max-requests 20 --interval 60 --jitter 10
```

只在上批 status 的 outcome=partial、phase=finished、无错误与限流，且源树指纹和全部缓存哈希仍一致时，才用 batch-number 2、3……继续。complete 表示所有**已审计三级节点的子接口**均得到响应，不表示全国机构名录完整。blocked、running、缺失状态、源树漂移、响应损坏或含四级以外越级节点时停止，人工审计后再处理；不能直接换编号重启。返回码：0 完成，1 干净的部分批次，2 拒绝/阻断。

## 验收

每批 batch-runs/batch-NNNN.status.json 记录来源指纹、请求数、已存响应、待查节点和库存摘要。manifest.json 汇总 plannedParentCount、savedResponses、pendingParents、parentsWithChildren、level4NodeCount、uncodedLevel4NodeCount、allLevel3ChildrenEnumerated 与 level4TerminalVerified，并始终保持 snapshotVerified=false、publishable=false。逐父响应文件含官方子节点原文及哈希；恢复前全部重验，排查跨父重复 ID/代码和与原树冲突的 ID/代码。

只有 allLevel3ChildrenEnumerated=true 且 level4NodeCount=0，才能在该源树范围内判断没有观察到四级节点；若 level4NodeCount>0，需要另建四级以下枚举及直属机构对账。两种情况都不能消除机构列表分页漂移与父级直挂的独立阻断。离线验证：python -m unittest tests.test_mca_level3_probe -v；python -m py_compile scripts/probe-mca-level3-children.py。
