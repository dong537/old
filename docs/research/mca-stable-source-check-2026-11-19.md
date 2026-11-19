# 全国养老服务信息平台公开下载与稳定分页复核（2026-11-19）

## 结论

本轮未找到可证实的免申请、全国、逐家、可直接下载的官方机构整表，也未在已保存的官方机构列表前端脚本中找到稳定游标、按唯一机构 ID 排序或批量导出调用。全国列表仍须标为「已观察记录」而非「已穷尽」；不能以 `total`、收齐页码、递归区县或重复采集两轮推断零遗漏。这是所核入口和脚本范围内的结论，不证明官方绝无其他渠道。

## 可复核的技术证据

- 官方机构列表页：<https://yanglao.mca.gov.cn/?#/index/institutionList>。本地已存脚本 `data/private/mca-institutions-2026-11-18/static-js/chunk-3d5896b7.22ca4f71.js`，SHA-256 `fbacdc322a8ca108c4ed0327113ee9c8d5ab44b56b4f12fd940891ef8bd577c1`。本轮只读检查该脚本，没有调用机构列表 API，也未修改运行中的采集任务。
- `InstitutionServicesList.getList` 将 `current`、`size`、名称 `axbe0003`、`areaCode` 和机构属性筛选参数提交给 POST `queryOrganizationDataList`。`FilterPane` 提供 `levelSort`、`priceSort`、`checkSort` 等；默认 `filterParams` 有 `ahae0635=1`。该脚本中 `queryOrganizationDataList` 出现 1 次，`download` 和 `cursor` 字符串各出现 0 次；`export` 字符串出现于 webpack 模块样板，不能当数据导出证据。源码有 `queryOrganizationDetail` 和 `queryOrganizationServiceDetail`，说明逐家详情需另查。
- 已有分页实测见 [分页稳定性记录](./mca-pagination-stability-2026-11-18.md)：`size=100` 被服务端限制为 10；广东默认排序前 20 页 200 行仅 145 个不同机构 ID；`checkSort=1` 的广东尾页亦有跨页重复/轮次漂移。现有代码未给出唯一 ID 次序、快照令牌或可核的「只查本级直属」条件，不能证明稳定穷尽。地区树、父级直挂和详情的验收条件见 [完整性核验方法](./mca-full-coverage-method-2026-11-19.md)。
- 2026-11-19 对 <https://yanglao.mca.gov.cn/robots.txt> 作一次普通 GET，返回 HTTP 200、`text/html; charset=utf-8`，内容开头是标题为「全国养老服务信息平台」的 SPA `<!DOCTYPE html>`，而非机器人指令文件。因此不能从该路径断言存在允许或禁止批量抓取的有效 robots 规则；也不能把页面可匿名读取等同于再展示许可。

## 公开下载候选与去重

- [湖南省民政厅《养老服务机构信息表（2025年版）》](https://mzt.hunan.gov.cn/mzt/xxgk/tzgg/202604/t20260414_33953898.html) 有直链 XLSX：<https://mzt.hunan.gov.cn/mzt/xxgk/tzgg/202604/33953898/files/20e64faae4254f05a710b719aa04ab88.xlsx>。本轮 HEAD 返回 HTTP 200、XLSX MIME、131,638 字节；临时读取后核对 SHA-256 `014521751d040e339edbef8ca53aecf01d451d59bdc52e5bdfcd4f5189e02f97`，工作表 1,770 行含标题和字段行，实为 1,768 数据行、5 列。它已存在于项目 `data/private/national-official-source/raw/hunan-2025.xlsx`，`data/raw/national-official-source-manifest.json` 记录同一哈希、字节数与 1,768 行，不可重复算作新增。该表只覆盖湖南省，并且题目是「养老服务机构」，须按原类型核对，不能直接代替全国养老机构名录。
- 其他已研究的地方文件与旧查询入口见 [公开下载渠道复核](./mca-public-download-alternatives-2026-11-19.md)。本轮搜索未发现比该研究新增的全国逐家免申请整表；地方文件可做区域查漏，不能与全国平台 `total` 直接对账。

## 对当前采集的约束

继续现有单进程、低速率、站点独占锁与断点流程；429、业务码错误或缓存审计不一致时停站点请求，不通过代理、切换身份或并发绕过。每个节点保留原响应、请求参数、时间、ID、`total`、重复和失败日志。只有独立解决稳定穷尽、直属残差、全量详情与逐字段使用边界，才能将 `snapshotVerified` 或 `publishable` 置为 `true`。
