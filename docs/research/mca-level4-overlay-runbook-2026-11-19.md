# MCA 四级地区私有 overlay 种子：离线构建（2026-11-19）

## 边界与数据流

脚本 scripts/build-mca-level4-overlay-seeds.py 只读取已审计的三级地区树和三级子节点探针，不发官网请求。地区树、探针原始响应与批次状态仍是 Source of Truth；overlay 是可重建的私有派生物，不替换已由首屏任务绑定的 national-area-tree-seeds-20261119.json。它不包含机构列表，也不写入 public/。

默认运行是只读预检：

    python scripts/build-mca-level4-overlay-seeds.py

树未终态、探针尚未运行或尚未枚举所有三级子节点时，返回 status=pending 和原因，**不返回四级数量**，也不创建文件。只有树与探针均终态，且逐份响应、原始 HTTP 字节哈希、父 ID、四级层级、12 位代码与跨父重复、探针 manifest 和连续批次链均通过复核，才返回 status=ready 及观察到的四级数量。地区树会被原有两个构建入口分别读取；构建器将第一份完整树文档按探针的规范化方式重算 sourceFingerprint，与第二次读取生成的指纹严格对照，阻断读取间的短暂来源漂移。探针按固定三级父节点顺序逐个保存响应；构建器以终态原始包装文件重算每批已保存父节点前缀的库存哈希，逐批对照 status 中的 responseInventorySha256。无法重建或任一批不一致就阻断，不能仅凭最终 manifest 冒充完整批次链。限流、错误、状态断链或来源漂移不能产生 overlay。

确认终态后显式写入：

    python scripts/build-mca-level4-overlay-seeds.py --write

输出严格限定在项目可信的 data/private/mca-institutions-2026-11-18/，拒绝表面包含 data/private、实际位于 public/ 的别名路径。固定文件名为 national-area-level4-overlay-seeds.v1.json；先在同目录私有临时文件中完整序列化并同步，再通过不覆盖的原子硬链接发布，失败时删除临时文件，避免残片占用 v1。每个节点保存官方 ID、父 ID、名称、原始 sbcode、完整官方祖先路径、来源响应文件和原始响应 SHA-256、响应包装文件 SHA-256、抓取时间。所有节点都从同一批经再次计算库存指纹的内存响应字节派生，阻断审计与逐行读取之间的来源变化。有码节点进入 seeds；无码节点只进入 uncodedNodes 并保留缺口标志，不能推造查询代码。overlay 保留树、探针 manifest、终态批次和响应库存指纹；源变化时须重新审计并另建版本，不原地恢复或改写。

allLevel3ChildrenEnumerated=true 只证明该树范围内的三级子接口已逐个获得响应。四级节点自己的子级尚未探测；即使终态观察到零四级，也不代表全国机构零遗漏。文件始终标记 snapshotVerified=false、publishable=false。

## 后续在线阶段（本次未执行）

若终态探针发现四级节点，还需有界探测其子级；仅对新增且有码的四级代码另建首屏和分页缓存，沿用站点互斥锁、冷却与请求预算。随后合并来源页级 ID、增量补详情，并验收父子与直属机构残差、分页漂移和快照一致性。本脚本不启动上述阶段，不改变现行采集器或网站公开数据。

离线验证：

    python -m unittest tests.test_mca_level4_overlay tests.test_mca_level3_probe tests.test_mca_area_seed_audit -v
    python -m compileall -q scripts/build-mca-level4-overlay-seeds.py tests/test_mca_level4_overlay.py
