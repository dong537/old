# 本地浏览器验收：达州官方来源快照

- 日期：2026-11-17；性质：开发者自测，未部署。
- 环境：静态产物 out/，本机预览 http://127.0.0.1:3300/eldercare/，Microsoft Edge headless（系统已安装版本）；Browser 插件未提供，使用 Playwright。
- 测试流程：/quanguo/laiyuan/ → 选择四川省、达州 → 30 条来源记录 → 第二页 10 条 → 第 21 条详情 → 点击官方原文（在新标签打开达州公共数据开放网目录）→ 返回保留第二页筛选。
- 断言：入口 HTTP 200、标题及 H1 与路线相符；筛选后总数 30，第一页 20 条、第二页 10 条；详情名称、来源标题、来源第 21 条、原文链接和冻结 SHA-256 可见；无负责人字段；返回地址保留 province=sichuan&city=dazhou&page=2。无页面错误、console error 或框架报错层。
- 视口：320、375、1440 px 下第二页均显示 10 条，documentElement.scrollWidth === innerWidth；320 px 详情也无整页横向溢出。首屏截图已人工复核。
- 截图：output/playwright/national-dazhou-entry-1440.png、national-dazhou-results-320.png、national-dazhou-results-375.png、national-dazhou-results-1440.png、national-dazhou-detail-320.png、national-dazhou-detail-1440.png（均为 Git 忽略的本地自测工件）。
- 边界：仅实际取得的匿名预览 30 行；目录元数据所称 179 行未取得，不在本站声称全量。未验证外部源站的最终内容加载、原生 200% 浏览器缩放或真实家属使用。

## 山东菏泽增量（快照 v1-b15ff6373851c423）

- 本机 3300 静态预览入口 HTTP 200；地区选项山东省 23 条、菏泽 23 条。筛选后 23 条，第一页 20 条、第二页 3 条。
- 来源范围明确限于鲁西新区 2025-06-27 版本文件 23 条，说明 2026-11-10 版本仅 5 行且缩减原因不明、资料截至日未知，不宣称菏泽或山东全量。
- 第二页末条为“菏泽中智养老护理有限公司”（来源第 23 条）。按完整名称检索匹配 1 条；详情显示同名、来源第 23 条、旧版范围说明及冻结 SHA-256。官方原文链接在新标签打开山东公共数据开放网目录；返回后保留省、市和名称检索，仍匹配 1 条。
- 320 与 1440 px 检索页、320 px 详情页均有可见内容，documentElement.scrollWidth 等于 innerWidth；pageerror 和 console error 均为 0。截图：output/playwright/national-heze-results-1440.png、national-heze-search-320.png、national-heze-search-1440.png、national-heze-detail-320.png、national-heze-detail-1440.png。
- 初次测试发现目录来源范围句末出现“空床。。”；已报告主 Agent。
- 最终静态产物复测：菏泽范围正文现为“空床。发布于 2025-07-28”，无连续句号；HTTP 200、23 条匹配、第一页 20 条、首条详情及返回保留省市仍正常，console/pageerror 均为 0。复测截图：output/playwright/national-heze-final-1440.png。原生 200% 浏览器缩放仍未验收。未更改应用源码或部署。
