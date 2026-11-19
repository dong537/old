# MCA 私有缓存 ACL 收紧（2026-11-19）

目标仅为 `data/private/mca-institutions-2026-11-18`；未触碰其他数据目录，也未发送网络请求。

## 发现

执行前，根目录及已有原始页从父目录继承 `BUILTIN\Users: Modify`。目录内共 146 个对象，均未设置独立 ACL，也没有重解析点。Python 的 `chmod(0o600)` 不能替代 Windows NTFS ACL 控制。

## 修复与复验

执行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/secure-mca-private-cache.ps1`。脚本只允许当前账户、SYSTEM、Administrators 完全控制；目标根目录关闭继承，子项继承该白名单。它逐项核对现有对象，并新建一份临时文件验证后续继承，随后删除临时文件。重新执行不会改动已正确的根 ACL。

本机运行结果：146/146 个对象通过白名单检查；新文件继承验证通过。独立运行 `icacls data/private/mca-institutions-2026-11-18 /verify /T`，结果为 146 成功、0 失败。代表性原始页仅含三项继承的完全控制 ACE。脚本使用 UTF-8 BOM，兼容本机 Windows PowerShell 5.1。

## 范围限制

父目录 `data/private` 仍继承 `BUILTIN\Users: Modify`；本次严格按目标范围，只保护 MCA 缓存树。若威胁模型包括本机其他普通账户对父目录的操作，应单独评估并收紧整个私有数据父目录。管理员与 SYSTEM 仍可访问，这是 Windows 管理边界。

