# 家属决策流程验收记录（2026-11-16）

本轮只改广州目录的预收费标记筛选、对比页打印核对单、全站搜索关键词同步与手机档案联系电话位置；官方名单、服务记录与工商数据未改。对照设计见 docs/superpowers/plans/2026-11-16-family-decision-workflow.md。

## 自动检查

- 带 NEXT_PUBLIC_ELDERCARE_BASE_PATH=/eldercare 执行 verify:release：目录及原型类型检查通过；首次构建在导出后遇到 Windows EBUSY 文件锁而退出 1，单独重跑 build 成功。两项独立审查缺陷修复后，最终再次完整运行 verify:release，退出 0，115/115 项测试通过，静态生成 1,281 页、2,662 个公开文件通过隔离扫描。没有将首次失败记录成通过。
- git diff --check 退出 0。未新增 npm 依赖、生产写入端点、账户或数据源。

## 浏览器自测

Playwright CLI 真实 Chromium，先用根路径产物检查筛选及打印，再用 /eldercare/ 构建复核发布路径；均为开发者自测，不是家属用户验收。

- 目录从 deposit=yes 进入，点击 membershipFee=no 后 URL 保留两项筛选，结果为 139 家；选中两家后 URL 保留筛选及 compare ID，进入对比页能显示打印入口、逐家来源日期和待核对问题。对比页按 print 媒体呈现时，普通导航和对比表计算样式为 display:none，核对单为 display:block；浏览器生成了 PDF。打印截图：.playwright-cli/page-2026-11-16T14-26-41-537Z.png；桌面对比截图：.playwright-cli/page-2026-11-16T14-33-48-664Z.png。
- 审查发现合法 80 字中文检索在 URL 编码后超过原返回地址上限，已调整并用回归测试覆盖。审查还发现跨页打印的第二家没有来源日期；最终 PDF（.playwright-cli/page-2026-11-16T14-56-16-774Z.pdf）为 2 页，逐页文本提取证实每页仅有对应一家机构，且均包含核对单标题、官方来源、2026-09-23 名单日期和待核对问题。
- 375px 手机端用键盘 Enter 搜索“颐福居”，URL 保留 deposit=yes，搜索框值同步为“颐福居”；进入档案看到可拨打的公开电话，返回后 URL 保留关键词和押金条件。手机目录截图：.playwright-cli/page-2026-11-16T14-27-59-516Z.png；联系卡截图：.playwright-cli/element-2026-11-16T14-30-34-439Z.png。
- 目录与对比页在 320、375、768、1024、1440px 的 document.scrollWidth 均等于视口宽度。首次用 CSS zoom 200% 在 375px 发现“有医疗保障（含签约医院）”禁用按钮导致 442px 横向溢出；按钮允许换行后重新构建，在 375px 与 320px 的 CSS zoom 200% 下均无整页横向溢出。此项是 CSS zoom 模拟，不等同浏览器原生缩放。
- /eldercare/ 静态预览打开广州目录，筛选链接保持 /eldercare/ 前缀，控制台 0 错误、0 警告；未重复上线到远端。打印 PDF 留在 Git 忽略的 .playwright-cli/ 临时目录。

## 剩余边界

尚未做真实家属测试、浏览器原生 200% 缩放及远端部署后的回归。在线预约、认领和报错提交依赖合作方、权限与受理流程，仍未开放；打印单上的询问项是家属待核事项，不是平台已核结论。
