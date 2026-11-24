# 静态数据增量发布提速实施计划

> **For agentic workers:** 使用独立工作树，按下列任务逐项完成 RED/GREEN、审查与验证；不得修改主工作树的未提交采集文件。

**目标：** 数据独立更新时不再因随机 Build ID 改写全站页面，并让旧标签页在目录快照切换后安全恢复。

**架构：** 完整构建、静态扫描、逐文件 SHA、rsync 候选版本和原子切换均保留。`next.config.mjs` 从代码源及部署前缀计算稳定 Build ID；目录客户端遇到旧 manifest 与新 index 不匹配时只刷新一次。

**技术栈：** Next.js 15.5.29、React 19、TypeScript、Node 24、GitHub Actions、Bash/rsync。

## 全局约束

- 资料和文章不参与代码 Build ID；运行时代码、配置及依赖锁参与。
- 不更改现有来源校验、隐私扫描、服务器全量 SHA 校验、原子切换与回滚。
- 只暂存本计划内文件；主工作树的用户未提交文件不进提交。
- 本机 Windows 检出把原始归档和 Issue YAML 转为 CRLF；隔离工作树基线测试已通过 Git blob 字节还原验证，CI Linux 是完整构建的权威检查。

---

### 任务 1：稳定代码版本 Build ID

**文件：** 新增 `scripts/stable-build-id.mjs`、`tests/stable-build-id.test.ts`；修改 `next.config.mjs`。

**接口：** `computeStableBuildId(root, basePath): string`；`generateBuildId` 调用它。输入仅为 `app/`、`components/`、`lib/`、根配置与依赖锁、部署前缀。

- [ ] 先写测试：同输入重复计算相同；改变 `public/data` 或 `content` 后相同；改变 `app`、`package-lock.json` 或 `basePath` 后不同；必需文件缺失时报错。
- [ ] 运行单测并确认因模块不存在而失败。
- [ ] 实现按相对路径排序、带路径边界的 SHA-256，返回短的安全字符 Build ID；在 `next.config.mjs` 接入。
- [ ] 运行单测、`npm run typecheck`，确认均通过。

### 任务 2：跨发布目录缓存恢复

**文件：** 新增 `lib/mca-catalog-release.ts`、`tests/mca-catalog-release.test.ts`；修改 `components/McaPublicDirectoryView.tsx`。

**接口：** 区分快照不匹配与其他解析错误；`claimCatalogReload(storage, snapshotId)` 同一快照仅返回一次允许刷新。

- [ ] 先写测试：首遇旧 manifest/新 index 可刷新；再次不刷新；新快照可刷新；存储异常不被伪装为成功。
- [ ] 运行单测，确认预期失败。
- [ ] 仅在快照 ID 不一致时调用一次 `window.location.reload()`；若持续不一致或存储失败，显示可操作错误与手动刷新入口；网络/格式错误保持原语义。
- [ ] 运行单测与现有目录相关测试，验证检索、详情入口和其他错误态不变。

### 任务 3：静态构建和真实发布验证

**文件：** 如基准证明需要，补充 `docs/superpowers/specs/2026-11-24-stable-data-release-design.md` 的实测结论；不为本次添加部署新通道。

- [ ] 对照独立工作树两次同输入构建的路径与 SHA 差异，确认根因。
- [ ] 在本分支完成两次同输入构建或等价隔离产物比较，确认无全站 Build ID 差异；对单条资料变化抽样确认只影响相关页面和索引。
- [ ] 运行 `npm run typecheck`、`npm test`、`npm run build` 与公开输出扫描；审查只含本任务文件的 diff。
- [ ] 推送特性分支，等 Linux `verify.yml` 成功后快进 `main`；触发预览 CD，核对 `release.txt`、首页、目录、详情、文章与纠错页，并记录 `rsync --stats` 的变化文件数、发送字节与耗时。若浏览器跨发布验证或同步范围不达标，不宣称提速完成。
