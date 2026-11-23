# 机构详情页与后续 CSV 字段契约（2026-11-23）

> 历史阶段设计：本文记录导入前的详情布局与字段判断。3,497 行 CSV 的正式接入、51 个非图片字段 DTO、合并目录及发布验证，以 [全国机构 CSV 接入与统一详情契约](./mca-csv-public-integration-2026-11-23.md) 为准。下文“将来接入”和“不直接发布 stale”等描述不再代表当前实现。

## 目标与范围

家属进入全国机构详情后，应在首屏读到名称、地区、地址、可核对的来源与采集时间，并能快速比较来源记录中的床位、月费和服务。先改现有公开的民政部平台详情页及其展示 DTO；列表、来源投影与发布权限保持现状。当前 `养老机构_已爬取_2026-11-23.csv` 是后续批量接入的字段样本，不把其原件或未经审查的列直接放进公开目录。

成功标准：现有 131 条公开详情保持可访问；显示已有真实值，缺失、冲突、0 分别表达；手机 320px 不横溢；来源原码完整可查但不阻断家属阅读；无预约、认领、实时床位或自行推断等级。

## Source of Truth 与字段映射

当前公开真值仍为 `public/data/mca-observed` 版本化投影，由 `mcaPublicLoader` 读取。`McaPreviewPlatformDetailDto` 保留 `observed/missing/conflict`，详情展示 DTO 仅按用户任务重组，不改变值或来源。官方页面链接是核对出口，采集时间不是官方资料截至日期。

CSV 为 UTF-8 BOM、52 列、3,497 个唯一 ID，其中 3,494 行 `ok`、3 行 `stale`，仅覆盖北京、天津、河北、山西、内蒙古；`org_id` 可按平台 ID 与现有索引关联，但不能据此宣称全国全量。字段组及未来接入边界：

| 展示组 | CSV 列 | 当前公开 DTO |
| --- | --- | --- |
| 身份与位置 | `org_id,name,org_type,area,area_code,address,found_date,building_area,tags,point,risk_level,status,updated_at` | `identity,tags,areaSqm,pointRaw`；`found_date/risk_level/status/updated_at` 暂不冒充官方在营、评级或资料日期 |
| 床位与月费 | `total_beds,beds,nursing_beds,fee_month_*,fee_bed_*,fee_care_*,fee_meal_*` | `beds,feeSummary`；`beds` 是全托，费用是来源区间而非报价 |
| 服务与介绍 | `services,intro,service_detail,service_team,service_time,service_radius,service_radius_explain` | `introduction,service` |
| 分项与子服务 | `fee_detail_json,cx_*,rt_*,home_*,assess_*` | `charges,subServices`；与机构养老床位、月费分开 |
| 联系与媒体、评价 | `contact,phone,images_json,evaluation,eval_count` | `contactName,contactPhone,photoCount,evaluation`；图片只有文件名，不拼 URL |

`risk_level` 的 01/02/03 语义未核，不呈现为风险结论。`status=ok/stale` 是采集器状态，不是机构登记状态。`updated_at` 无时区，为采集器时间。0 元不等于免费，评价 0 不等于零分差评。

## 页面与模块

`lib/mca-public-detail-display.ts` 将已审核公开详情映射为首屏摘要、收费、服务、来源四组；`components/McaPublicDetailView.tsx` 只渲染这些组。桌面为紧凑双栏（本页目录／正文），手机为单列与可横向滚动的锚点；主阅读流中不重复列床位，原码、坐标及全部索引字段置于可展开的“来源原值”。已存在的金额/服务细项继续显示。

将来 CSV 接入须先走可复现、锁定 SHA-256 的私有原件 → 明确类型/空值/冲突的公开投影 → 严格校验 → 目录/详情静态路由；不得绕过 `check-public-output` 对 `data/mca-*` 的拦截。31 个与现有详情重合的 ID 保留已有带原始观察证据的记录；`stale` 不直接发布。

## 失败与验证

字段缺失显示“采集快照未提供”，冲突显示“观察值冲突”；加载失败仍由现有路由处理，不返回空详情。回滚仅撤销本轮展示 DTO、详情组件和相关测试，不更改现有快照。验证 DTO 边界测试、现有详情测试、类型检查、静态构建及 320/375/768/1024/1440px 浏览器检查；发布仍以完整公开输出扫描为准。
