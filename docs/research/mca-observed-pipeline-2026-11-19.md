# MCA 全国已观察机构续采流水线（2026-11-19）

## 目标、边界与 Source of Truth

目标是在不申请数据的前提下，低频、断点式保存全国养老服务信息平台公开列表中**实际返回的机构 ID 与详情**。权威输入是官网响应原文及其哈希、请求参数、抓取时间；本地 manifest 只是这些响应的审计索引，接口报告的 total 不是已抓取数，也不证明当前在营。全部产物留在 Git 忽略的 data/private/mca-institutions-2026-11-18，公开网站数据不自动更新。所有阶段的 nationalComplete、snapshotVerified、publishable 均为 false。

## 分阶段数据流

1. 地区树与各地区首屏：原有树控制器和首屏 handoff 完成后，run-mca-observed-stage-handoff.py 才进入下一步。旧 Eldercare-MCA-FirstPages-Handoff 已停用，保留 Eldercare-MCA-Stage-Handoff-20261119；首屏的独立批次链和每页缓存重新审计。
2. 三级节点子级探测：优先调用 probe-mca-level3-children.py，每次最多 20 个父节点、20 次请求。探测到四级节点时记录 level-four-nodes-not-in-area-seeds 缺口及数量，继续采集**既有三级种子覆盖的已观察记录**；四级节点尚未纳入的事实不会被静默抹去，也不能据此宣称全国完整。破损响应、来源树漂移仍硬阻断。
3. 分页观察：collect-mca-area-followup-pages.py 的 small 模式处理 2–3 页分区；large 模式独立保存 4–5000 页分区。large 模式遇跨页重复、total 漂移或异常 areaCode 仍保存可校验的原始响应、继续后续页，标记该分区未核实；业务错误、429、破损缓存或来源漂移则停止。两个模式共用网站锁、至少 60 秒的请求间隔、滚动小时 60 次预算及全站冷却。每批最多 5 个分区、12 次请求。
4. 详情：collect-mca-observed-details.py 只对已观察页面中的 axbe0001 建队列，按 ID 去重并保留每条来源页、哈希及列表异常。已接入 large 模式页面。run-mca-observed-details-auto.py 每批最多 12 个 ID、30 次请求；最多 5,000 批，可容纳 60,000 个已观察 ID，不能把此容量当作已获得数据。两详情端点的原文和断点分别保存；接口失败或 429 不伪装成功。
5. 周期性交接：run-mca-observed-stage-handoff.py 每次调用**只运行一个有界批次**，次序为三级探测 → small 页 → large 页 → 已观察 ID 详情。每次重新核对原始缓存、来源哈希、前一批状态、锁和预算；一个子批次通常少于一小时，不使用持续数周的 Windows 任务。出现中断遗留的 running 状态、锁冲突以外的失败、429 或批次漂移时自动停止，待人工审计；四级节点缺口则写入每次状态并继续已知范围的私有采集。批次日志在私有 batch-runs，子任务不能发布网站数据。

## 本地运行与停止

- 已登记 Windows 任务 Eldercare-MCA-Observed-Stage-Handoff-20261119，执行 python scripts/run-mca-observed-stage-handoff.py；触发间隔 PT5M、期限 P180D、单次上限 PT2H、MultipleInstances=IgnoreNew、StartWhenAvailable=True。2026-11-19 07:34:47（北京时间）首轮定时触发，LastTaskResult=0，下次 07:39:47；私有状态 waiting/first-pages/another MCA collection stage is active，nationalComplete=false，未产生额外机构请求。每次只运行一个短批次，五分钟检查并不放宽官网的 60 秒请求间隔与滚动小时 60 次上限。脚本无 dry-run 选项，首屏具备条件时运行它会启动下一个有界采集批次。
- 已核对 Eldercare-MCA-Stage-Handoff-20261119 为 Ready；旧 Eldercare-MCA-FirstPages-Handoff 为 Disabled，以免两个首屏交接任务竞态。当前树采集仍由原树控制器处理，观察阶段不得并发争抢站点。
- 创建 data/private/mca-institutions-2026-11-18/batch-runs/observed-stage-handoff.stop 可以在下一次调度前暂停。子批次已有各自停止文件和不可覆盖的批次状态；若状态为 blocked 或残留 running，不删除状态或原文强行重跑，先查独立日志、响应哈希与小时账本。
- 回滚代码只影响之后的调度；已存原始响应和批次状态保留供审计。网站公开版本不受此私有流水线影响。

## 验收限制

large 模式的“全部预期页已观察”只表示按首屏 total 访问了每个页号；省级 offset 分页已有跨页重复，且没有稳定游标或冻结快照，不能证明零遗漏。small 模式遇分页异常仍以审计门禁停止。发现的四级节点尚未加入种子；父级直挂集合、跨时间动态变化、服务端未知过滤及公开再展示边界需要独立核验。流水线状态 finished 只表示**当前已观察 ID 队列**的详情已缓存和审计，绝非全国全量、当前在营或网站可发布。按每 ID 两次详情请求估算，约四万个 ID 在 60 次/小时上限下需数周，且前提是站点持续允许访问。

## 离线验证

python -m unittest discover -s tests -p test_mca_*.py -q：201 项通过；python -m compileall -q 对修改的采集/控制脚本通过，git diff --check 通过。新增测试覆盖大分区跨页重复后继续保存、预算中断续采、详情队列接入、12 ID 批次、阶段优先级、短批次和异常阻断。尚未对新模式执行线上批次或浏览器/生产发布验收。

## 已观察的短平台 ID

对旧的省级首屏 JSON 缓存复核，江苏 1 行、浙江 3 行共 4 个不同 `axbe0001` 为 7 位字母数字串；这四行所在旧 wrapper 为 HTTP 200、业务码 0，但未保存原 HTTP 字节，仍需由新阶段原文重取交叉验证。先前详情队列和请求适配器限定 ID 长度至少 8 位，会在遇到此类记录时阻断整批。现将安全字符白名单的长度界改为 7–64 位，保留斜杠、点和更短未知值的拒绝规则；对应队列与详情行为测试先失败后通过。此修复只允许已观察的合法短 ID 进入私有详情队列，不证明其机构真实性、全国覆盖或可公开发布。
