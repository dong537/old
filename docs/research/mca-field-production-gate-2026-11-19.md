# MCA 逐字段生产准确性门禁方案与证据

## 目标、边界、成功标准

为既有私有 MCA 观察建立可执行、只读、逐字段来源/时间/未知语义/冲突门禁。新增独立脚本、测试与本文，不改采集、live tree、恢复凭证、任务现场、公开数据和UI；不联网。成功标准是能从现有缓存重算738 ID/详情覆盖，拒绝身份错配、语义混同、坏时间和异常床位，报告只含聚合计数/固定字段路径/证据哈希，不复制机构值。

## 数据来源与流向

1. Source of Truth：`area-*/pages`、`area-*/details` 及新全国 first/followup/large/observed-detail 目录内保存的 endpoint wrapper。请求身份、HTTP/business code、原始bytes/hash、fetchedAtUtc归采集器所有；文件hash只证明本地文件，不补造缺失HTTP原文。
2. 字段字典：`normalize-mca-private.py` 的 FIELD_MAP、PROJECTED_PATHS、受限路径，与已存官网列表JS语义研究共同构成候选契约。代码声明/页面标签不是登记核验、实时状态或完整逐码字典。
3. 既有 normalizer 只生成私有预览；`lib/mca-field-resolution.ts` 的已核关联优先MCA规则仅是独立函数，捕获时间不用于有效期判断，不能直接作为本门禁的冲突放行依据。当前网页公开投影仍为地方官方来源/QCC，未见MCA独立公开导出或页面调用。
4. 新门禁读取缓存 → 校验来源/身份/响应/时间 → 逐路径统计未知状态 → 按同义设施字段比较同ID全部观察 → 聚合门禁stdout。不提供导出、发布或覆盖源值接口。

## 字段所有权和规则

| 字段 | 来源与定义 | 未知/冲突/时效规则 |
| --- | --- | --- |
| 平台身份 | list.axbe0001；两个详情request/body同ID | 平台ID不是信用代码、执照或已核实体关联；短ID单列，不擅自补齐。详情body缺ID与明确错ID分开；不按名称自动合并主体 |
| 机构名称/服务地址 | list + orgBaseDetail的 axbe0003/axbe0013 | 同ID多原值标冲突，不以抓取时间较新自动覆盖；地址不是登记注册地址 |
| 机构类型 | list.axbe0004=code，list.axbe0004Name=label | orgBaseDetail.axbe0004观察为标签且pending-semantics，不能与列表代码直接比较/覆盖。跨类别字典仍未核 |
| 机构运行状态 | 无已核顶层有效路径 | 不从tag、axbe0019、riskLevel、企业登记状态推导在营/停业；阻断当前运行状态结论 |
| 床位 | list与yangLaoOrgDetail的ahae2347/ahae2323 | 机构列示床位≠备案床位≠空床；0保留数值事实但不是实时可用床。拒绝负值/非有限/布尔/非整数，护理床>总床阻断。抓取时间≠该数值生效时间 |
| 联系电话候选 | 既有3条restricted contact路径 | 原字段尚未区分机构公开电话/联系人姓名/个人手机号，禁止推断为现可拨打号码；必须人工核业务用途、公开依据及核验日期 |
| 其它候选/嵌套字段 | 原字典映射和隐私前缀 | pending-semantics/unit、未解释非空和隐私路径继续阻断，不因名称直观或已进私有预览而放行 |

时间契约：逐端点fetchedAtUtc必须带时区、非未来；只报告采集区间，sourceEffectiveAt固定null，freshness=unknown。嵌套createTime/updateTime不作为整家机构更新时间。不任意发明30/90天有效期。

未知契约：分别计missing、null、empty_string、whitespace、empty_container、literal_unknown（NA/N/A等保留）、numeric_zero、string_zero、invalid_type/value。不能把未知转0/false，不把字符串0转数值0。私有normalizer的strip/null或负值保留行为不改变此源级事实账。

## 接口与失败模式

计划新增 `scripts/audit-mca-field-production-gate.py`：`--root`可指定私有fixture，默认真实私有目录；stdout聚合JSON，无落盘选项。全程publishable=false、productionReady=false，域级门槛按实测输出，政策/人工门槛明确待核，不提供随意置true的输入。

读前流式保存文件SHA256，逐个解析后立即聚合并释放载荷，输出前流式复读摘要与文件集复核；漂移、损坏、原文缺失、ID错配、未来/缺失时间均显式阻断，不返回“空集合=成功”。哈希路径可审计但不输出原始路径中的机构ID。测试用合成fixture隔离网络，只测真实校验逻辑；真实数据只读复核。

## 初始离线盘点

现有审计本轮重算：41切片、93列表文件、894观察行、738去重ID、36双端点详情、702缺详情。列表/详情165个wrapper均无rawBodyBase64；不能借整个pipeline中新增tree原字节证明机构端点也有原文。字典148观察路径、25私有已投影、31未解释非空、6候选未投影、3受限联系、70隐私待审路径（含父子）。列表/详情axbe0004有36字面差异，已知为code/label语义差，不计为同义字段冲突。

变更不接入发布链，因此不存在UI完成声明；后续真正发布还需要批量再展示/隐私依据、字段人工核验、全国覆盖与快照一致性、严格公开投影/页面及构建验收。

## 已实现门禁及复核结果

实现文件：`scripts/audit-mca-field-production-gate.py`；行为测试：`tests/test_mca_field_production_gate.py`。只读执行：

```powershell
rtk python scripts/audit-mca-field-production-gate.py
rtk python -m unittest discover -s tests -p test_mca_field_production_gate.py -v
```

CLI退出码：有发布阻断返回1（正常审计结果，不是运行崩溃）；输入不可读/无法出报告返回2；本保守版本不接受人工批准参数，productionReady/publishable恒false，不能用命令行开关绕过人工审查。stdout按现有候选字典逐路径输出owner、semanticStatus、privateProjection、原值状态/类型计数、invalidValueCount、rawVerifiedObservationCount、采集起止时间，productionUse统一withheld。未知动态路径只输出聚合数量，不把源JSON键或机构原值外传。

2026-11-19T01:39:55Z只读重算：

| 检查 | 结果与解释 |
| --- | --- |
| ID与详情覆盖 | 738已观察ID；36个有双端点响应；702缺完整详情；4个短平台ID需原样核验，不补齐 |
| 原始证据 | 165列表/详情wrapper全部缺HTTP原始bytes；本地文件SHA不能替代它；不把tree的原始字节算作机构端点证据 |
| 身份一致/缺证 | request与显式body ID未发现矛盾；但36个端点body没有axbe0001。因此endpoint_identity_consistent=true而detail_body_identity_present=false：未知不能写成冲突，也不能写成身份证明完成 |
| 同义字段冲突 | 名称、服务地址、机构列示床位、护理床位均0个同ID多值；只表示现有有限观察未见冲突，不证明当前准确 |
| 类型code/label | 基本详情axbe0004继续pending-semantics且不投影；不会把36个code/label字面差异误计为同义事实矛盾 |
| 床位 | 1个ID护理床位大于机构床位，阻断；894列表观察中机构床位数字0有1次、护理床位数字0有30次，均保留数字0语义，不解释空床/可预约 |
| 时间 | 列表采集区间2026-11-18T12:48:23.935244Z至20:55:21.471067Z；基本详情相关字段13:01:09.877055Z至18:15:03.931643Z。没有因此生成任何sourceEffectiveAt或当前时效声明 |
| 联系字段 | list.ahae0012共876非空、18null观察；类型未判定为公开业务电话，全部withheld。该分母894含重复切片，不是738家占比 |
| 字典与隐私 | 148观察路径；31未解释非空、70隐私待审、3受限联系路径；均不是已核可发布字段数 |
| 门禁结果 | CLI exit1、productionReady=false、publishable=false；12项阻断代码显式输出 |

本次输入文件集摘要（仅129个列表/详情文件，不含manifest/tree，算法独立）：`0170e5aa869b32a05dbd7326bf2d56597aeceb977a1a650cc9b4178262557831`。实际执行候选映射/私有投影/受限路径/比较契约摘要：`a78a9da9b29d5c1911368a75a3e77096fe9776640050da6d7dc51b28961eec2c`。这些摘要与其它审计算法范围不同，不能交叉替代。

### 可执行验证

- 首批7个测试先RED（脚本缺失），实现后GREEN；随后缺body身份与超大整数测试分别复现错误分类/OverflowError，费用对象与服务数组测试复现漏校验，再修复。
- 新门禁11/11；既有私有normalization13/13；production readiness5/5；field dictionary followup5/5，共34项通过。
- 具体覆盖：缺失/null/空白/NA/数字0/字符串0、抓取不冒充有效日期、联系信息不输出、ID错配拒绝、缺ID单列、码/标签不混比、同义冲突不选新值、负数/布尔/超大数/对象等坏类型、护理床>总床、未来采集时间、原文缺失、运行期间新增文件、只读文件不变。
- 未跑前端build/浏览器：没有前端或公开投影改动，未声称任何UI或上线结果。

### 必须人工核实的字段与证据

1. **机构身份/法律主体**：平台ID与真实设施、登记主体、地方来源的显式关联；短ID和缺body ID端点须确认官方契约，不能以同名替代。
2. **当前在营状态**：有效状态字段/字典、更新责任方、生效时点及停业/迁址处理；企业登记状态与平台标签都不能代替。
3. **床位**：机构列示/护理/备案/可用床的定义与生效日期，1处护理床>总床异常的来源核实；不能自动平衡或截断。
4. **联系电话**：区分机构公开业务电话、联系人姓名与个人手机；确认公开再展示依据和最近人工核验日期。本轮未拨打、未补猜号码。
5. **类型、费用、星级及未知字段**：完整详情标签/逐码字典、单位、零值含义、有效期；已有列表JS标签和相等样本不能替代这些证明。

本次不改原normalizer或resolveMcaFacilityField的已有行为：前者保留私有预览，后者对已核关联可优先MCA非空值但不核时效；它们不是生产放行依据。网页接入前必须显式消费门禁结果和经核字段投影，不能把本报告只留作旁路文档。


## 2026-11-19 后续修正方案（实施前）
范围仅此文、逐字段门禁脚本及其测试；只读离线，不接触采集状态与公开投影。
- 明确枚举三类 national-level4 页面及 level4 observed details。
- 将详情形状有效与来源批次可信分开。现代合并详情核对两个 checkpoint；manifest/queue 缺失显式记录。即使文件齐全，也不凭声明的 source* SHA 或 mergedItems/items 自证完整来源链；未重建上游来源链的现代批次 fail-closed，不进入 validDetailPairFiles/覆盖成功计数。字段观察可继续用于诊断，来源门禁保持阻断。
- 文件逐个解析并立即聚合；只保留文件摘要、ID 集、逐字段计数/时间边界和每 ID 每比较字段至多两个 SHA256。结束时流式重算摘要及重新枚举，包含现代 checkpoint/manifest/queue 的增删与变更。
- 回归先 RED：四级详情缺席、缺来源证据误计有效；12 个 500KB 详情的原实现峰值 22,544,092 bytes，超过 10MiB 限制。修复后同测试 GREEN，并运行既有字段语义回归。

### 修正结果与验证

- schemaVersion 升为 2。shapeValidDetailPairFiles/idsWithShapeValidDetailPairs 包含端点结构有效的现代观察；validDetailPairFiles/idsWithValidDetailPairs 仅保留既有 legacy 端点检查口径，不再把未经来源链验证的现代详情计为成功覆盖。字段统计仍含现代观察，用 fieldObservationMeaning 明示这一诊断范围。
- detail_source_batches_verified 固定 false，sourceBatchVerification=not_performed_no_batch_is_attested；legacy 的 valid 计数同样不是批次证明。现代批次即使 manifest/queue/checkpoint 全存在，仍需独立重建 items/mergedItems 与 source* SHA 的上游证据链后才能将此门禁改为可信判断。本次选择保守阻断，没有假实现批次认证。
- checkpointMatchedModernDetailPairs 仅说明合并文件与两份 checkpoint 相等；缺少或不同计 modern_detail_checkpoint_missing_or_mismatched；缺 manifest/queue 计 modern_detail_batch_metadata_missing；全部现代形状有效文件计 modern_detail_source_batch_unverified。
- 输入摘要增加实际存在的现代 manifest.json、queue.json、detail-checkpoints/*/*.json；其增删或内容变化会阻断快照稳定性。未读取 tree、未更改采集器状态，也未读取或输出恢复凭证。历史摘要表为当时输入范围，不能当作新数据覆盖声明。
- 内存保留 O(文件数 + ID数 + 字段路径数) 的摘要与聚合状态，单文件解析仍依赖最大文件大小；不是常数内存或已完成4万详情实测。每ID每同义字段最多保留2个32字节SHA，不累积所有值；时间仅保留最早/最晚，不保留所有时间数组。
- 12×500KB 详情 fixture 使用 tracemalloc：旧实现峰值22,544,092 bytes，新实现4,729,211 bytes；回归上限10MiB。真实缓存在2026-11-19T01:54:29.799009Z只读重算仍为93页面、894行、738 ID、36 legacy双详情；当时现代详情0，不能以此代替现代真实批次验证，现代路径由合成行为fixture覆盖。
- 新门禁15/15、normalization13/13、production-readiness6/6、field-dictionary-followup5/5，共39项通过；compileall通过。补充覆盖三类四级页面与四级详情、缺checkpoint/manifest、checkpoint不匹配、伪complete不放行、queue运行期间漂移、只读不落盘与内存约束。
- 仅指定3文件修改；未运行前端构建或浏览器，本轮没有UI/公开投影变更。未提交Git，未stage，未调整其它agent文件。


## 现代详情来源链可验收方案（2026-11-19，实施前）
权威输入为现有 collector 的队列、manifest、连续 batch-runs、checkpoint 和原始HTTP bytes；仅离线读取，禁止调用会加锁/改状态的 preflight/state/run。门禁仅证明已观察队列来源及详情收集链，不宣称全国覆盖、法律主体、业务有效期或树种子生成过程已认证。
三级队列逐项核对源页面实际存在的ID、文件SHA、HTTP原文SHA和时间，重算有序队列inventory；sourceSeed/各页面manifest SHA须匹配本地对应文件，manifest与queue一致。四级mergedItems须包含三级所有来源与四级来源，items必须恰为去除已验证三级ID后的增量，重算overlay及合并inventory，核对base manifest SHA。
状态按单一合法前缀从0001连续到最终完成；每批时间单调、计数增量一致、来源SHA相同、无错误/限流，首批从零开始。每个checkpoint原文、请求ID、时间必须可归属到一个批次；已保存的详情响应数不得超过每批requestsThisRun，实际完成数与newlySavedDetails逐一一致。requestsThisRun还包含校时HEAD及未产生详情文件的尝试，这部分单列为未对应已保存详情的请求数，不能误认成详情响应。仅完整证据链通过才提升现代详情覆盖；失败、额外/缺失文件、审计期间变更均不提升。
可扩展性：队列数组逐项解析/哈希，详情逐文件，不累计HTTP正文；保留ID、源页引用摘要、批次计数与文件摘要。先以合成真实格式证据构造可通过路径，再篡改queue/manifest/status/checkpoint/raw/source验证必败。

### schemaVersion 3：已实现的来源验收

本节取代上一轮 schemaVersion 2 中“detail_source_batches_verified 恒 false”的临时方案。该门禁现在是计算结果；只有至少一个现代来源阶段存在、全部存在阶段来源链通过且全量输入摘要复核不变时为 true。productionReady、publishable、snapshotVerified 仍固定 false，其他业务/隐私/覆盖门禁不因来源验证通过而放宽。

1. 三级检查：从实际保存的现代源页逐文件验证官方请求URL/参数、响应形状、ID、rawBodyBase64与SHA、采集时间；队列 sourcePages 必须逐个匹配实际源页成员、次数、文件SHA、响应SHA、行政码、页号和时间，不能漏掉或添加观察。按采集器相同canonical JSON顺序流式重算 sourceInventorySha256（包含可选descendant seed SHA）。
2. 外部引用：seed与页面manifest采用固定已知路径，不跟随任意外部路径读取；校验 sourceSeed/first/followup/large/descendant/base-detail SHA与实际文件摘要。seed基本结构/行政码清单、页面manifest对seed/first的关联和时间需一致；不读取或重建live tree，行政树来源语义仍由独立覆盖门禁负责。
3. 四级增量：三级来源链必须先通过；其descendant SHA必须等于四级seed SHA。mergedItems保留三级来源前缀并包含全部三级/四级源页观察；items恰等于 merged IDs 减三级已验证 IDs，内容一致；重算 overlay库存和合并库存SHA；base manifest摘要、复用数和合并数需一致。四级批次不能早于三级最终完成。
4. 批次：唯一合法前缀（detail-YYYYMMDD-auto 或 l4detail-v1）从0001连续到最终完成；来源/总数稳定，首批从零累计，新增数与累计数差值一致；每批已结束、时间有时区且单调、无错误/限流，只有最后一批exit0且完成。中途允许真实预算停止以及一个ID的两个端点跨批次恢复。
5. 详情：文件ID清单、checkpoint清单必须与所选队列严格一致；每个双端点请求身份、显式body ID、HTTP原始字节/hash与checkpoint相等。requested/fetched时间必须归属某个批次，且不晚于最终manifest审计时间；逐批已保存端点数不得超过requestsThisRun，实际完整ID数对齐newlySavedDetails。多出的站点请求可能是校时HEAD或未保存的请求尝试，只报告差额，不分类断言。缺证据、额外文件、乱序或错误均不得提升。
6. 快照：包含源seed/manifest、详情queue/manifest、连续status、checkpoint和列表/详情文件的摘要；结束时重新枚举/流式重算。若漂移，撤销本轮所有来源提升，stage code改为input_changed_during_audit。报告不输出ID、原文或动态异常消息，只输出固定阶段名、代码和计数。

sourceVerifiedModernDetailPairFiles 是新可解释计数；verified阶段的现代详情才进入validDetailPairFiles/idsWithValidDetailPairs。sourceBatchVerification按阶段报告verified、固定code、成功时的detailCount/batchCount/requestsWithoutSavedDetailResponse。后者不是HEAD的精确计数；采集器尚无逐请求类型日志。legacy valid计数仍只代表旧端点检查，不是现代批次认证。

### 本轮验证与边界

- RED：两个完整链用例在恒false实现上失败；随后新增“损坏四级源页静默缺席”“四级早于三级完成”“manifest早于详情响应”的回归先失败再修复。GREEN：逐字段门禁25项全部通过，包含三级全链、四级增量、共享ID复用、连续两批分端点恢复；每类proof缺失、hash/计数/时间篡改、缺批次和审计后状态变化均阻断。
- 另外normalization13项、production-readiness6项、dictionary-followup5项通过，共49项；compileall与指定路径git diff --check通过。未调用collect/run/state/preflight；无联网、采集状态修改或公开导出。
- 队列解析用40000条含中文的合成条目验证跨buffer边界及重复顶层成员拒绝，tracemalloc峰值1,271,056 bytes（断言低于3MiB）；12×500KB详情内存回归继续通过。此数仅是队列解析器，不冒充40000机构全链端到端内存测量。全链保留 O(文件数+ID数+源页引用数+批次数) 的摘要状态，不保存全部详情正文；单个过大JSON条目仍受其自身大小约束。
- 2026-11-19T02:29:39.127482Z现场只读复核：93列表文件、894行、738 ID、36 legacy双详情，现代来源批次尚无证据，sourceVerifiedModernDetailPairFiles=0、detail_source_batches_verified=false。输入摘要仍为0170e5aa869b32a05dbd7326bf2d56597aeceb977a1a650cc9b4178262557831；该时间点数据不能作为今后的实时状态。
- 通过说明的是本地保存证据链内部一致，不是服务器数字签名证明，也不认证树种子生成、全国机构覆盖、队列中的业务覆盖解释、主体法律关系、当前在营、联系方式发布权利或字段时效。来源完整不等于生产可发布；这批检查不替代其独立门禁。
