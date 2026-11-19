# 首屏完成链必须重新验证原始字节（2026-11-19）

## 缺陷与修复

原 first_auto 从历史成功 status 推断 complete 后，仅预检种子和小时账本，即返回“全部首屏已缓存”。这会跳过新引入的 rawBodyBase64 校验，也忽略缺失或漂移的首屏 manifest。

现在该分支在现有站点锁内重新读取并验证种子、复核 seed SHA，调用既有 scan_cache 校验每个首屏原始HTTP字节、响应哈希、请求参数与既有文件哈希，再按真实缓存重建 progress_document。只有缓存覆盖全部种子且 manifest 的所有覆盖/来源/观察字段与重算值完全一致才返回0；auditedAtUtc 是原审计时间，不与当前重算时间比较。

不会重取缺原始字节的旧缓存，不以序列化JSON伪造原HTTP原件，不改历史status/manifest，不改变限流与站点锁。缺字节、篡改、缺页或 manifest 不一致均返回2并零请求，保留原件供单独审核。

## 测试与操作

- RED：真实临时树和 collector fixture 先建立完整成功链，再删 raw / 改 manifest reportedTotal / 删除 manifest；原 complete 分支3项失败（实际错误地返回0）。
- GREEN：新增完成复审后3项通过；同一夹具的正常完成返回0，缺页也返回2。
- 真正执行 fetch_page → request_json → checked_page → save_json，仅HTTP transport与校时边界隔离：保留前导空格/尾部换行原字节，校验文件SHA和 rawBodyBase64；旧位置参数默认调用仍不新增raw。
- raw变化但SHA未改，以及解析JSON变化但raw未改，两类测试均返回2、零请求、不覆盖原manifest。
- 本任务不执行生产first_auto或改tree现场。无需迁移；已有缺raw的完成链将阻断，需要另立获批恢复方案，不能原地补造。

验证命令：python -m unittest discover -s tests -p test_mca_area_first_pages_auto.py；同样运行 test_mca_area_first_pages.py、test_mca_fetch.py、test_mca_area_followup_pages.py、test_mca_list_coverage.py。
