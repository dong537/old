# 北京 62 条新名称与养老机构网的三条路径重叠核验（2026-11-18）

## 范围与证据

- 北京完整列表的 new-to-both-name-indexes.json 有 62 条未命中现有两套名称索引。本次只处理 organId 36106、37628、37258；按 NFKC 及去空白比对，其官方原始名或展示名各与 commercial/inventory.json 中唯一一条 /institution/ 路径标签同名。
- 北京原始响应分别为 beijing-full/page-14-response.json、page-18-response.json、page-42-response.json。逐页 SHA-256 与索引中记录一致，三条原始对象的 organId、insId、institutionName、sfInstitutionName、address 与索引提取值一致。原始列表的 source_date 均为 null，不能据此推断现时状态。
- 根据已归档的 commercial/robots.txt，仅低频请求这三个公开 /institution/ URL；不带查询参数、不跟随重定向，也不访问 /wp-json/、登录或其他受限入口。每页请求前间隔 1.5 秒，HTTP 超时 30 秒，没有绕过或重试。

## 实得与逐项比较

- 2026-11-18 09:06:58–09:07:05 UTC，3/3 页面返回 HTTP 200；原始 HTML 共 230,051 字节。3/3 均可直接提取可见 H1 和地址，且页面都显示“信息待核验”。
- 比较只采用原文直接相等与 NFKC 加去空白严格文本相等；任何非空不等均标为文本冲突，不做地址简称、别名或行政区推断。私有 manifest.json 保存双方原文、完整 URL、取得时间、原件哈希、字段 XPath/行号和每项比较布尔值。

| organId | 北京原始名 ↔ H1 | 北京展示名 ↔ H1 | 北京地址 ↔ 页面地址 | 说明 |
| --- | --- | --- | --- | --- |
| 36106 | 文本冲突 | 文本匹配 | 文本冲突 | 官方地址包含页面地址未显示的街道、楼栋信息。 |
| 37628 | 文本匹配 | 文本冲突 | 文本冲突 | 地址中的小区名称用字及街道层级不同。 |
| 37258 | 文本匹配 | 文本匹配 | 文本冲突 | 地址的门牌/区域表述不同。 |

三条地址不一致都保留为冲突，未因名称相同而合并。这里的“文本匹配”仅指两段文字相同，不是同一机构身份确认，更不代表当前在营、床位或商业描述已经核实。

## 留存与复核

- 仅在 data/private/eldercare-multisource-b3-20261118/commercial/beijing62-overlap/ 写入 3 份 HTML、3 份逐页元数据、manifest.json、collect_overlap.py 与 verify_overlap.py；未改既有样本、商业清单、公开数据或业务代码。
- 离线运行 python data/private/eldercare-multisource-b3-20261118/commercial/beijing62-overlap/verify_overlap.py：3/3 北京原始响应 SHA、站点 HTML SHA、可见文本 XPath/行号和三项比较结果核对通过。此脚本不请求网站。
- 后续若要确认身份，须回到北京官方原件与机构主体资料逐项核实名称、详细地址和时间；本次保留三条候选和所有冲突，不产出确认机构数或营业状态。
