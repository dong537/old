# 民政部机构样本离线清洗与字段缺口（2026-11-18）

运行命令：python scripts/normalize-mca-private.py --root data/private/mca-institutions-2026-11-18 --area-code 440000000000。脚本不发网络请求，只读取采集器保存的原始响应，在同一私有区域生成 normalized-preview.json、field-gap-report.json 和 quality-report.json。原始响应不改写。三个派生文件均在 Git 忽略的 data/private/，不是网站数据包。

## 当前可核验结果

- 广东接口当次返回的 total=1,422，预计 143 页；现存 19 页、190 条分页观察、139 个不同平台 ID，重复 ID 出现 51 次，只有 1 个 ID 有两种详情响应。sourceManifestComplete=false，其余 124 页缺失，不能称作全量、不能据此填充生产目录。
- 当前私有样本观察到 93 个字段路径：映射到既有同义字段 4 个、与既有字段定义不同 5 个、新字段 15 个、单位待核 7 个、语义待核 4 个、受限字段或嵌套区 17 个、尚未解释 41 个。这是按路径统计，不是 93 项可公开字段；详细类型及缺值次数在 field-gap-report.json。
- 当前样本中重复 ID 的原始列表行没有差异；这不证明不同页没有遗漏。详情的列表/详情床位差异、床位不合理值、费用上下限倒置及类型异常均单独统计，不默默修正。
- quality-report.json 同时记录采集清单声称的 manifestClaimsComplete 和重新计算的 sourceManifestComplete。后者要求页数覆盖、每页长度符合 total/size 推导出的页长、无重复 ID、页内 total/size 不漂移且观察行数等于 total；不能仅信任采集清单的 complete 标记。例如总量 15、每页 10 时，第 1 页 9 条、第 2 页 6 条即便总计 15 个不同 ID 也判不完整，并在 pageLengthMismatchPages 中列出两页。

## 清洗口径

normalized-preview.json 按“页码、页内位置、平台 ID”保留每次观察，不把跨页重复强行合并。安全映射的字段包括平台 ID、机构名称与类型、区域原码和原标签、场所地址、列示床位与护理床位、原始费用上下限、服务功能码/标签、网络码、平台评分与评价次数。详情只投影已辨明的名称、地址、区域、面积和两种床位；原始接口仍保存所有字段。

零与 null 保持不同；NaN/Infinity 拒绝进入派生 JSON 并计入异常。费用原值尚未确认单位，不把 0/0 呈现为免费；列示床位与广州市备案床位分别存储。脚本不从名称猜城市，不把平台 ID 当统一社会信用代码，不把联系方式、联系人、嵌套自由文本或未解释键的值复制到派生预览。字段审计只记录路径、类型、出现及非空次数。单区域审计只读取指定 areaCode，避免其他省份的字段混入广东报告。详情必须分别通过两个端点的 HTTP 200、业务码 0 和请求平台 ID 核验；不合格文件列入 invalidDetailFiles，不计入已取得详情或字段目录。

字段对照只是待落地契约，不是已公开的 schema 迁移。公开投影还要满足稳定完整采集、逐字段含义核对、联系人/自由文本检查、再展示授权及同一场所关联复核。只有确认同一场所且字段同义，才可按用户指定优先展示民政部平台的非空值，并保留既有来源原值与日期。

验证：python -m unittest tests.test_mca_private_normalization tests.test_mca_field_audit tests.test_mca_fetch -v；针对页长错位的测试使用 9+6 两页、15 个不同 ID 的反例。下一步需取得可复现的批量全量资料或稳定且获准的分页方案，再补 41 个未解释路径的页面标签和数据字典。
