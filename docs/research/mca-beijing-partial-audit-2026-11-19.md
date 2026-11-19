# MCA 北京省级部分缓存离线审计（2026-11-19）

本记录只核对已保存的原始响应。未访问民政部网站，未修改公开站点数据；以下数字不是全国抓取完成数，也不证明机构当前在营。原始响应保留在 Git 忽略的私有目录，不在本报告输出名称、电话、个人字段或字段值。

## 来源与范围

接口：<https://yanglao.mca.gov.cn/ylxxptapi/ylfwpt/ylfw/queryOrganizationDataList>。本次核对的完整相对路径：

- 北京省级筛选：data/private/mca-institutions-2026-11-18/area-110000000000-check-sort-1-capture-trial20261119b/
- 北京东城区筛选：data/private/mca-institutions-2026-11-18/area-110101000000-check-sort-1/
- 河南杞县筛选：data/private/mca-institutions-2026-11-18/area-410221000000-check-sort-1/
- 广州番禺区筛选：data/private/mca-institutions-2026-11-18/area-440113000000-check-sort-1/
- 对照用的广东省旧缓存：data/private/mca-institutions-2026-11-18/area-440000000000/

各目录的 pages/*.json 为列表响应；有详情的目录另有 details/*.json。解析口径以列表项的 axbe0001 作为平台内 ID，跨页、跨范围去重；不把名称键或接口 total 当作已保存的唯一机构数。各目录 manifest.json 记录过滤、总数、缺页及完成状态。

## 列表与详情核对

| 切片 | 已存页 / 接口预期页 | 接口报告 total | 已存行 | 唯一平台 ID | 已存详情 | 采集时间 UTC |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 北京省级，checkSort=1 | 22 / 63 | 630 | 220 | 220 | 0 | 2026-11-18 18:40:11—18:45:05 |
| 东城区，checkSort=1 | 2 / 2 | 16 | 16 | 16 | 16 | 2026-11-18 17:51:47—17:52:02 |
| 杞县，checkSort=1 | 2 / 2 | 19 | 19 | 19 | 19 | 2026-11-18 18:04:50—18:05:01 |
| 番禺区，checkSort=1 | 3 / 3 | 22 | 22 | 22 | 0 | 2026-11-18 17:08:46—17:09:19 |

北京省级 220 行的 areaCode 分布：110105000000 朝阳 84、110106000000 丰台 59、110102000000 西城 35、110107000000 石景山 24、110101000000 东城 16、110108000000 海淀 2。东城 16 个 ID 全部在北京省级 220 个 ID 内；其余三组范围两两不重叠。因此四组并集是 **261 个平台 ID**，不能直接相加成 277。详情覆盖为东城 16/16、杞县 19/19、番禺 0/22、北京省级 0/220；已保存详情共 35 份。此前把番禺写成已有 22 份详情的说法不符合本地文件。

北京省级 manifest.json 标记 complete=false：第 23 页收到 HTTP 429 后停止，缺 23—63 页，站点级冷却记录至 2026-11-18 19:45:17 UTC。接口 total=630 仅是当时响应，已存 220/630 不等于稳定的 34.9% 完整快照；缺少冻结快照和唯一排序，跨时段续取仍须审计重复、漏项与总量漂移。

对照用广东省旧缓存保存的是 1—16、27—30 页，共 200 行、145 个不同 ID；接口报告 total=1422、预期 143 页，缓存明显不完整。它与番禺切片 22 个 ID 在已存页中交集为 0。**不能由此推断两个筛选口径不同或番禺不在省级名录**：省级已存页尚可能没有翻到番禺记录，跨时段排序变动也会影响观察。旧广东省缓存的 145 个 ID 与上述四组并集相加后，五组观察并集为 406；这仍只是部分缓存的去重数。

## 字段缺口

四组列表样本各出现同样 35 个顶层字段。对照 scripts/normalize-mca-private.py 的 FIELD_MAP 和 RESTRICTED_PREFIXES：23 个字段已有映射或待定语义/单位标记，1 个字段限制使用，11 个顶层路径尚未审查。未审查路径完整列于下方，只给字段名，不给字段值：

- list.ahae0019
- list.ahae2343
- list.ahae2592
- list.ahde8404
- list.axbe0017
- list.axbe0019
- list.axbe0021
- list.hae5List
- list.infoDatail
- list.point
- list.tag

北京 220 行中，名称、设施类型、地区代码与路径、地址、总床位、护理床位、收费原始字段均为 220/220 非空；服务功能代码及标签为 218/220 非空。非空不等于字段含义、计量单位或发布日期已验证。当前映射中的 ahae0702、ahae0702Name、bedCost、careCost、eatCost 在北京 220 行均为空；不得用零代替未知，也不得把收费原始值解释为月费或实时报价。

东城和杞县共 35 份双接口详情。orgBaseDetail 顶层出现 44 个字段：已有映射 10、限制使用 6、尚未审查 28；yangLaoOrgDetail 顶层出现 6 个字段：已有映射 2、限制使用 2、尚未审查 2。详情未审查的完整顶层路径：

- orgBaseDetail.ahae0633
- orgBaseDetail.ahae0633Name
- orgBaseDetail.ahae0635
- orgBaseDetail.ahae0642
- orgBaseDetail.ahae0643
- orgBaseDetail.ahae0644
- orgBaseDetail.ahae0645
- orgBaseDetail.ahae0701
- orgBaseDetail.ahae0702
- orgBaseDetail.ahae0702Name
- orgBaseDetail.ahae2592
- orgBaseDetail.ahae2601
- orgBaseDetail.ahae2602
- orgBaseDetail.ahae3075
- orgBaseDetail.ahae3076
- orgBaseDetail.ahae3077
- orgBaseDetail.assessmentOrgDetailVo
- orgBaseDetail.axbe0017
- orgBaseDetail.axbe9003
- orgBaseDetail.axbe9004
- orgBaseDetail.chuangXiOrgVo
- orgBaseDetail.evaluationCount
- orgBaseDetail.homeServiceOrgDetailVo
- orgBaseDetail.overallEvaluation
- orgBaseDetail.riTuoOrgVo
- orgBaseDetail.riskLevel
- orgBaseDetail.tag
- orgBaseDetail.yangLaoOrgVo
- yangLaoOrgDetail.ahae0019
- yangLaoOrgDetail.ahae2343

orgBaseDetail.orgBaseInfo、orgBaseDetail.orgServiceInfo、orgBaseDetail.hae5List、yangLaoOrgDetail.hae4List、yangLaoOrgDetail.hae8List 等路径受现有受限字段规则约束；顶层字段清单并不代表嵌套字段已完成逐项审查。地址/床位等同名概念也须核对不同来源的定义与日期，再决定是否覆盖原数据。

## 结论与后续核验

北京省级缓存因 429 中断，其他完整区县缓存仅证明特定过滤与时间的列表/详情已存。全部内容仍应留在私有研究层；在完成快照一致性、字段定义、联系字段权限及来源再展示范围核对前，不得并入公开机构目录。后续若取得新增公开数据，先离线核对页数、ID、范围重叠和详情覆盖，再单独决定是否投影至网站。
