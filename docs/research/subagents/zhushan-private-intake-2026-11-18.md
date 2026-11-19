# 珠山区养老机构名单：私有解析准备（2026-11-18）

## 范围与证据

本次只处理已冻结的珠山区官方页面及附件，供私有来源核验；未修改公开 manifest、公开数据、UI 或赣州解析。来源获取与许可初查见 [既有缺口审计](other-gap-official-2026-11-18.md)。

- 官方发布页：<https://www.jdzzsq.gov.cn/qmzj/zdly/shgysy/yl/t1059845.shtml>。冻结 HTML 为 data/private/national-official-source/raw/jiangxi-jingdezhen-zhushan-eldercare-20251204.html，43,455 字节，SHA-256 d3df4e46d95ff7bb832f0d4996a80dba38951105d99ff4a4340b4ea60e20c03c。页面标题/ArticleTitle 均为“2025年养老服务领域公开养老机构信息名单”，PubDate 为 2025-12-04 10:56，ContentSource 为“珠山区民政局珠山区人民政府”，附件链接为 ./P020251204394048702723.xlsx。
- 官方附件：<https://www.jdzzsq.gov.cn/qmzj/zdly/shgysy/yl/P020251204394048702723.xlsx>。冻结 XLSX 为 data/private/national-official-source/raw/jiangxi-jingdezhen-zhushan-eldercare-20251204.xlsx，108,556 字节，SHA-256 cf5b6e271c80826dfc6846268e900f7f7c1573e8c043d90ede07e9488861e75f。

## 解析边界

scripts/zhushan_official_rows.py 固定校验原件字节、页面元数据、31 列表头、工作簿名、连续序号及省/市/区县。工作表“景德镇市”的第 5–11 行为 7 条，序号 1–7；格式污染使表观范围扩展至 1856 行、16384 列。解析只用 openpyxl 读取前 31 列、前 11 行，再扫描 XLSX sheet XML 的实际带值单元格，以拒绝尾部新增数据，不按格式化区域推算记录数。

返回字段仅为原序号、Excel 物理行、单位名称、省、市、区县、地址、床位总数。床位总数接受原件中的整数或数字字符串并归一为非负整数；这是 2025-12-04 发布来源中的**总床位快照**，并非空床数或当前容量。K/L 列的负责人姓名及联系方式不读取到返回对象，不进入审计表格或公开投影。

## 验证记录

1. 先写 tests/test_zhushan_official_rows.py，运行 python -m unittest tests.test_zhushan_official_rows -v：4 项均因 ModuleNotFoundError: scripts.zhushan_official_rows 失败，确认 RED。
2. 实现解析器并修正测试所需的 XLSX 结构变异后，重复同一命令：4 项通过，最终复跑耗时 1.564 秒。覆盖真实 7 行、原序号/物理行、允许字段、页面元数据/附件及 SHA；变异覆盖表头、地域、序号、负数床位、额外第 8 行、发布时间及附件链接，另验证原件字节漂移被拒绝。
3. python -m py_compile scripts/zhushan_official_rows.py tests/test_zhushan_official_rows.py：通过。

## 限制与下一步

页面“主动公开”不等同于再展示授权；既有调查尚未取得对非个人字段的明确再利用许可。**这 7 条仍仅为私有候选，不得写入 public/ 或公开 manifest。** 需向珠山区民政局确认许可范围后，另行审查可公开字段与日期新鲜度。此次解析只验证冻结来源的结构，不证明机构在 2026-11-18 仍运营、床位数仍有效或存在空床。
