# 上海、安徽、江西、河南官方来源再核验（2026-11-17）

本轮仅复核尚未进入公开目录的四地线索；未修改共享 builder、manifest、页面或公开数据。检索工具 Brave Search 本轮八次查询均返回 `fetch failed`，不能据此声称四地没有数据。以下判断以已冻结的官方原件及本轮匿名 HTTP 探测为限；“来源行”不等于去重机构或当前在营机构。

| 地区 | 已取得的官方线索 | 2026-11-17 本轮复核 | 公开接入判断 |
| --- | --- | --- | --- |
| 上海 | [2023 年市民政局保基本养老机构（床位）名单](https://mzj.sh.gov.cn/MZ_zhuzhan23_0-2-8/20230630/94b3d20431e449dbaa7caaef4d86be76.html)的历史 HTML 已冻结，含 516 条来源行；[2026 年新版](https://mzj.sh.gov.cn/2026bsmz/20260722/8c9c94c58ece4859ac4c6675f398584a.html)是图片正文。两者均为保基本子集。 | `curl.exe -L` 访问 `https://data.sh.gov.cn/` 返回 HTTP **412**，仍无法核对操作指南所提同名开放数据集的 ID、匿名下载及许可。 | 民政局表可作私有查漏；现阶段无可核的逐条再发布许可，2026 图片亦未 OCR 复核，不进入公开目录。 |
| 安徽 | [宿州开放平台“养老”搜索](https://www.ahsz.gov.cn/oportal/catalog/index?Q=%E5%85%BB%E8%80%81&page=1)仅发现检查等子集；[养老机构联合检查结果预览](https://www.ahsz.gov.cn/oportal/catalog/viewExcel?file_id=lnLeTnHgGYN4cGFNRDVivvPDZZImwRIv1NbIFlFDFRELIqDhSaw6wtGMM6pFvaYn&excel_type=xlsx)先前核得 18 行且含检查人列。[芜湖优惠价格适用表](https://whfgw.wuhu.gov.cn/fgqd/sqsfqd/8943662.html)先前冻结 57 行，仅四区政策子集。 | 宿州预览匿名 GET 返回 HTTP **200**、14,104 字节；它是检查结果预览，不是宿州或安徽养老机构全量文件。[平台手册](https://www.ahsz.gov.cn/oportal/docs/preview-data.html)说明预览可能只给部分行、下载须登录。 | 不能按 18 或 57 行计入公开机构覆盖；芜湖附件逐条再发布许可亦未核实。 |
| 江西 | [赣州 2026 年养老机构名录页](https://www.ganzhou.gov.cn/zfxxgk/c143793/202606/a73d1b1b1bc14a38a23cf4bb17f9fb30.shtml)为图片正文，前次匿名请求 403、未取得图片或行数。旧开放平台提示迁往新址。 | `curl.exe -L --max-time 12 https://kfpt.jiangxi.cn/` 返回连接超时、HTTP `000`、0 字节。 | 未取得可校验逐名原件、数据期和再发布许可；不能仅凭搜索索引写入公开目录。 |
| 河南 | 旧开放平台 `https://data.hnzwfw.gov.cn/odweb/index.htm` 此前不能定位养老机构数据集。 | 匿名 GET 返回 HTTP **200**，但最终 URL 为 `https://www.hnzwfw.gov.cn/` 通用政务首页，并非数据集或下载文件。 | 无可审计的逐名文件、行数、哈希及许可；不计新增覆盖。 |

## 优先后续动作

1. **上海开放平台优先**：从可访问的官方页面或正常人工界面取得“上海市养老机构”数据集 ID、实际下载、字段和授权文本；当前 412 不应被绕过或解读为无数据。
2. **安徽寻找真正机构名录**：继续在省/地市开放平台查“机构名称＋地址”逐名数据集；检查与价格优惠子集只用于私有交叉核对。
3. **江西、河南确认平台入口**：先取得可访问的新门户目录或民政部门明确可下载表，再核下载权限和再发布许可。
4. 任何新来源接入前，锁定官方 URL、实际文件、SHA-256、表头、真实来源行数、地区与资料期、隐私白名单及授权义务；元数据量和搜索摘要不得补造为记录。

既有详细证据见 [华东及天津官方逐名来源核验](east-official-sources-2026-11-17.md)、[华东中部缺口核验](central-east-gaps-2026-11-17.md)。本轮无新增可公开投影文件，也未部署。
