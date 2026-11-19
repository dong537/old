# MCA 私有字段覆盖与缺口（2026-11-19，离线）

本次只读取 `data/private/mca-institutions-2026-11-18/` 已保存的原始响应；没有请求民政部站点，没有写入 `public/`，也没有输出姓名、电话或自由文本原值。原始 JSON 仍是字段值的 Source of Truth；`normalized-preview.json` 只是私有、可丢弃的规范化预览，不能替代原件或视为可发布数据。

## 审计范围与定义

| 已存切片 | 列表行 / 详情文件 | 原始字段路径 | 实际投影 / 校验 ID | 联系人或电话受限 | 隐私待审 | 未投影（非空 / 全空） |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 北京省级 `area-110000000000-check-sort-1-capture-trial20261119b` | 220 / 0 | 35 | 19 / 0 | 1 | 1 | 10 / 4 |
| 北京东城 `area-110101000000-check-sort-1` | 16 / 16 | 148 | 25 / 1 | 3 | 70 | 37 / 12 |
| 河南杞县 `area-410221000000-check-sort-1` | 19 / 19 | 148 | 25 / 1 | 3 | 70 | 36 / 13 |
| 广州番禺 `area-440113000000-check-sort-1` | 22 / 0 | 35 | 19 / 0 | 1 | 1 | 10 / 4 |

`scripts/normalize-mca-private.py` 的字段缺口报告现为 schema v2。每条观察到的原始路径都有 `presentCount`、`nonNullCount`、JSON 类型、语义审查 `status`、实际 `projectionStatus` 与可选 `projectedTo`。后两者把“拟映射/待核单位/待核语义”和**已经进入预览**区别开。路径计数包括对象/数组父路径与子路径，不是 148 个相互独立的业务字段。完整逐路径清单及计数存于各切片的私有 `field-gap-report.json`；报告只含键名和计数，不含值。东城、杞县、番禺的 `normalized-preview.json`、`quality-report.json` 已离线重建；北京试跑目录只生成字段缺口报告。

## 尚未投影的原始路径

以下是东城详情样本中的**非空**缺口；杞县同样有这些路径，但 `orgBaseDetail.ahae3077` 在杞县全空。北京与番禺仅有列表，对应的是第一行列出的 10 个路径。代码型字段不从数值或键名猜业务含义；`ahae0635` 只是待核请求筛选相关原值，不据此宣称机构补贴资格。

| 来源前缀 | 非空且未投影的原始键 |
| --- | --- |
| `list.` | `ahae0019`、`ahae0635`、`ahae2343`、`ahae2592`、`ahde8404`、`axbe0017`、`axbe0019`、`axbe0021`、`point`、`tag` |
| `orgBaseDetail.` | `ahae0633`、`ahae0633Name`、`ahae0635`、`ahae0642`、`ahae0643`、`ahae0644`、`ahae0645`、`ahae0701`、`ahae2592`、`ahae2601`、`ahae2602`、`ahae3075`、`ahae3076`、`ahae3077`、`areaCodeName`、`axbe0004`、`axbe0017`、`axbe8003`、`axbe8004`、`axbe9003`、`axbe9004`、`evaluationCount`、`overallEvaluation`、`riskLevel`、`tag` |
| `yangLaoOrgDetail.` | `ahae0019`、`ahae2343` |

另有全空、未投影的路径：`list.bedCost`、`list.careCost`、`list.eatCost`、`list.infoDatail`；东城/杞县详情还有 `orgBaseDetail.ahae0702`、`ahae0702Name`、`assessmentOrgDetailVo`、`axbe0004Name`、`chuangXiOrgVo`、`homeServiceOrgDetailVo`、`riTuoOrgVo`、`yangLaoOrgVo`。杞县 `orgBaseDetail.ahae3077` 也全空。全空表示样本没有值，不能转成零、否或全站永不提供。列表 `ahae0702` 等虽已有规范化目标，在多数样本里也为空。

## 联系与隐私边界

有来源证据的受限联系人/电话路径仅为 `list.ahae0012`、`orgBaseDetail.ahae2572`、`orgBaseDetail.ahae2573`。前者曾含电话，后两者在既有字段核对中对应联系人、联系电话；三者均不进入预览或报告的值。它们的 `status=restricted` 不表示已取得第三方再展示权利。

下列路径整棵子树仍**隐私待审**，而非一概断定其所有子字段都是个人资料：`list.hae5List`、`orgBaseDetail.ahae2574`、`orgBaseDetail.orgBaseInfo`、`orgBaseDetail.orgServiceInfo`、`orgBaseDetail.hae5List`、`yangLaoOrgDetail.hae4List`、`yangLaoOrgDetail.hae8List`。东城/杞县的 70 条 `privacy-review` 路径包括这些父子路径；其中可能混有设施、服务、收费或内部审计字段，须逐项查页面标签、业务口径和个人信息风险后才可决定映射。现阶段全部不投影；原件保留在私有目录。

## 列表与两个详情端点是否可替代

对东城 16 与杞县 19 个同 ID 的列表、基本详情、养老详情逐条配对，只比较**原始顶层键集合**。两地观察结果相同：列表 35 键，orgBaseDetail 44 键，yangLaoOrgDetail 6 键；两个详情端点的键交集为 **0**，因而没有任何一个详情端点完全覆盖另一个。列表与基本详情同名 21 键，与养老详情同名 4 键；两个详情端点合计 50 个不同顶层键，其中 **25 键在列表根本不存在**（基本详情独有 23、养老详情独有 2）。缺失的养老详情键为 hae4List 与 hae8List；基本详情缺失键包含 orgBaseInfo、orgServiceInfo、面积、内部费用/评价与联系相关字段。完整键名在私有报告的 endpointTopLevelComparison 中逐项列出。

同名也不能自动视为等价。35 组配对中，列表与 orgBaseDetail 共有的 axbe0004、axbe0004Name、hae5List 原值均有差异；列表 hae5List 全空，基本详情对应列表均非空。列表与 yangLaoOrgDetail 共有 4 键在这 35 组中原值相等，但只证明该样本的字面相等，不证明定义、时效和其他地区仍相同。基本详情的 orgBaseInfo、orgServiceInfo 与养老详情的 hae4List、hae8List 均在样本中出现非空结构，列表缺少这些详情内容。

因此，在**现有已观察到的接口**里，要取得每家机构的全部已观察详情字段，列表不能代替详情，两个详情端点也不能互代，原则上需对每个 ID 分别获取两份详情响应。这是接口字段覆盖结论，不是全国 ID 数或未来请求总量推算；其他批量渠道、稳定快照和合法使用边界仍未验证。字段缺口报告只记录键名集合及覆盖布尔值，并注明“同名键不等于语义等价”。

## 可复核性与生产阻塞

东城、杞县、番禺可分别执行 `python scripts/normalize-mca-private.py --root data/private/mca-institutions-2026-11-18 --area-code <12位区划码> --check-sort`，区划码依次为 110101000000、410221000000、440113000000。北京试跑目录带采集后缀，可离线调用同脚本的 `field_gap_report(root, '110000000000-check-sort-1-capture-trial20261119b', set())` 复算字段报告。检查每个报告中 `projected + validated + restricted + withheld + unprojected = fieldPathCount`；东城和杞县均为 `25 + 1 + 3 + 70 + 49 = 148`。运行 `python -m unittest discover -s tests -p 'test_mca_*.py'` 覆盖规范化、字段审计和其他 MCA 流程。

这次只修正**私有字段覆盖账**，不是全量生产验收。四个切片 manifest 均标记 `complete=false`；北京仅存 22/63 页且第 23 页遇到 429；番禺没有详情；东城与杞县虽分别已有 16/16、19/19 份详情，但缺稳定同一时点快照、可验证的完整全国分区对账、未知字段/单位解释和第三方逐项再展示边界。现有 `readyForFullProjection=false` 应保持；任何字段不得因“表内有拟映射名称”就进入公开数据。
