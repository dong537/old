# 本地发布门禁重跑记录（2026-11-18，暂未通过）

## 首次失败与占用排查

- 在 NEXT_PUBLIC_ELDERCARE_BASE_PATH=/eldercare 下执行 npm.cmd run verify:local-release，官方快照、企查查来源及关联检查、两组 TypeScript 类型检查和 234/234 项测试先通过；Next.js 已生成 3,399 个静态路由，但导出阶段对 out/quanguo/cankao/sheng/p-e69f6da6173d/page/68/index.html 的 unlink 返回 Windows EBUSY，因此整套门禁退出码为 **1**。日志：output/verify-site-survey-20261118.log。不能将前面的子检查通过等同于发布通过。
- 排查时 3101/3105 端口没有目录预览监听；另有本仓库的独立 prototype/ Next 开发进程使用 3100。错误目标文件在构建进程结束后可用 FileShare.None 独占打开，未找到持续占用该文件的进程。现有证据支持“导出时短暂文件占用”，但不能确认是哪一个进程造成。
- 先校验源/目标的绝对路径都位于本仓库，且目标不存在，再把失败的 out/ 原样移动至 output/build-staging/out-ebusy-20261118-site-survey/；没有清理或覆盖旧产物。

## 重跑暂停

- 从空 out/ 启动第二次 npm.cmd run verify:local-release。其官方来源检查及企查查机构来源检查已开始通过，但主任务随后发现公开 qcc sourceFields 的个人联系方式泄露风险，要求立即暂停重跑与打包；已对第二次运行会话发送 Ctrl-C，退出码 **1**。日志：output/verify-site-survey-20261118-retry.log。本次未生成新的 out/，未打包、未部署。
- 发布状态：**不通过/未验收**。待主任务修复公开字段并增加负例隔离测试后，再重新从头运行完整门禁，确认公开产物隔离扫描通过，再考虑生成本地交付包。不可把此前版本的 234 项测试或 3,399 个路由当作修复后版本验收。
