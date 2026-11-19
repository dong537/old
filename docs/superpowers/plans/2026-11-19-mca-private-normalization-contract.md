# 民政部平台现代采集的私有规范化契约（2026-11-19）

## 目标与边界

面向后续数据审核人员，把已保存的民政部平台机构列表和两类详情整理为可逐值追溯的私有证据。成功标准：输入批次及文件均可重验；每个已观察机构 ID 保留每次列表观察、详情观察、空值状态、来源时间和文件哈希；字段只取已审定的非联系方式白名单。当前不改网站入口、不生成公开 JSON、不部署，不以抓到的局部页面替代全国名单。

## Source of Truth 与数据流

- 原始 HTTP 响应包装文件、首屏/后续页 manifest、队列、详情 checkpoint、批次 status 和地区种子是来源真相，均位于被 Git 忽略的 data/private/mca-institutions-2026-11-18/。列表与详情的当前值只是机构及平台当时提供的观察，不自动证明登记主体、现在在营、床位实时可用。
- scripts/audit-mca-field-production-gate.py 独立复核现代批次的 sourceBatchVerification、原始响应字节、请求身份、队列清单与完整详情链，并给出 inputFileSetSha256。规范化程序只依赖这些稳定的来源证明及队列的 sourceInventorySha256，不依赖 legacy/modern 字段观测计数的展示口径。
- scripts/normalize-mca-observed-private.py 的生产 CLI 固定使用项目 data/private/mca-institutions-2026-11-18/，不接受任意来源根或输出目录；测试函数可注入临时根。程序只在上述来源链终态且输入前后哈希一致时，原子写入私有 national-observed-normalized-private.v1.json。失败不创建或替换旧产物。公开投影和主体关联是后续独立审核与发布步骤。

数据流：官方响应 → 私有原件/批次凭据 → 离线来源审计 → 私有逐字段证据 → 人工复核/法律与隐私审核 → 单独的公开投影与网站页面。

## 输出接口与不变量

- 顶层含 schemaVersion、scope、sourceInventorySha256、sourceInputFileSetSha256、sourceBatches、records、recordCount；publishable=false、nationalComplete=false 与 snapshotVerified=false 固定。机构 ID 只作为该平台的来源键，不自动等同于营业执照主体或独立场所。
- 每条 record 含 mcaId、listCoverage、listObservationCount 和 fields。listCoverage 保留队列给出的 verified 与 issues；即使出现 total 漂移、重复 ID 或分页缺口，只要来源文件链完整且可重验，也保留异常、重复观察与字段冲突供私有审查；发布门禁须另行阻断。
- fields 是逐次观察数组，不提前做“最新值”或冲突覆盖。每个观察保存 value（若源字段存在）、state、source；source 含接口、私有相对文件名、文件/响应 SHA-256、请求及获取 UTC 时间，列表还含地区、页码、行号及当时的覆盖标记。missing、null、空字符串、空白、字符串 0 与数值 0 分别保留；未知不转成零。
- 详情响应可省略 axbe0001：经来源审计确认请求参数、文件路径、原始字节与队列 ID 一致后，缺失值记为 source.responseIdState=absent；响应实际携带但与请求 ID 冲突时拒绝。不能把响应未给出的 ID 伪装为来源字段。
- 字段白名单仅含机构名称/类型、地区路径、地址、总床位与护理床位。电话号码、联系人和未审定叙述字段不写入产物；该产物仍留在私有目录，因为名称及地址等逐家资料的公开权利和时效尚待单独判定。

## 失败、恢复与验收

### 已观察详情批次的离线终端交接

- observed-stage handoff 只有在原有首屏、分页、三级/四级观察与全部已观察 ID 的详情阶段均审计完成后，才进入 private-normalization；该阶段只运行固定的项目内规范化脚本，不消耗站点请求预算，也不修改采集速率。
- 启动前再次运行规范化器的 verified_chain，要求现代来源批次、原始文件与输入文件集哈希通过门禁；子进程退出 0 仅写 waiting。下次调度完整解析私有产物，核对来源输入哈希、队列哈希、记录数及记录 ID 与来源队列逐项一致，并在解析后重验来源指纹，才能写 finished；finished 始终维持 publishable=false、nationalComplete=false。
- finished 状态保存输出 SHA-256 与来源指纹；相同指纹再次调度时复核产物后幂等退出。非零退出、产物缺失/损坏或来源漂移写 blocked，需要人工核查，不把子进程退出码或旧产物冒充完成。

- 未终态的详情批次、缺少 checkpoint、错误的请求/响应身份、哈希变化、队列断链、非法字段类型或写入期间来源漂移均返回显式错误，绝不把空集合或局部成功当作完整。只有重新取得一致的原件和批次凭据后才重跑，不原地修饰已保存的官方响应。
- 输入文件变化时保留旧私有产物，临时文件清理；旧产物带原输入哈希，不会冒充新来源。回滚只需停止使用该版本私有产物；不涉及线上目录。
- 行为测试覆盖正常基础链、四级增量、重复观察及覆盖异常、未完成链、来源篡改和敏感字段隔离。运行 python -m unittest discover -s tests -p test_mca_observed_private_normalization.py -v；再与字段门禁测试一起执行、检查 compileall 与 git diff --check。真实全国采集仍需地区树终态、首屏及分页/详情完整性、限流与快照一致性审核；离线测试不改变这项结论。
