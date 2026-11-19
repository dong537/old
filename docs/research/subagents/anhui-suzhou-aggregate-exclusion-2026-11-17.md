# 安徽宿州“养老服务业务报表”排除记录（2026-11-17）

结论：此目录确为宿州市民政局标注“无条件开放”的公开数据，但匿名 XLSX 预览呈现的是区县养老服务工作**汇总报表**，不是逐家养老机构名录；不进入本站机构目录、企查查同名关联或官方观察行计数。本轮没有取得 XLSX 原文件，不推断未预览的其他工作表内容。

- 官方目录：https://www.ahsz.gov.cn/oportal/catalog/f49f9873b14840d2984235a1b19c996d 。目录题为《养老服务业务报表》，发布时间 2024-10-29，更新时间 2026-09-10，文件标签为《2024年8月养老服务业务报表.xlsx》。目录显示无条件开放许可；许可不改变数据粒度。
- 匿名预览：https://www.ahsz.gov.cn/oportal/catalog/viewExcel?file_id=7VgQU5iITZWJZCF2rdm3G5TvHGI8wWACVvAFqIHQqLXcaiagUfsZCD7OARtnJpr6&excel_type=xlsx 。普通 GET 为 HTTP 200，HTML 表格共 10 个 tr、每行 43 个单元格；首列为“地区”，字段包含养老食堂、社区设施配建、床位结构、补贴和培训等汇总指标。预览未见“机构名称”逐家字段；区县汇总数不得拆成机构行。
- Git 忽略的原始证据：data/private/national-official-source/raw/anhui-suzhou-business-report-catalog-20261117.html，51,992 字节，SHA-256 4da7415691c38a3f358839d31ee6796168a1aa41b99ac9e37bcb882cad7b0422；data/private/national-official-source/raw/anhui-suzhou-business-report-preview-20261117.html，21,629 字节，SHA-256 69d69f457c3929c7e4f19fea911e2f18284e69adbe3d16eb449322584b12692b。哈希对应本机保存的 HTTP 正文字节。

因此本来源可用于查找地区层面的养老服务指标，不用于本站逐家机构覆盖或缺漏判断。若日后需要地区统计专题，应先核对 XLSX 全部工作表、字段口径与资料期，再独立设计，不能把报表混入机构目录。
