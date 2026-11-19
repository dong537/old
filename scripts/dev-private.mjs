import { spawn } from 'node:child_process';

// 仅开发预览，绑定loopback；生产配置会拒绝此标记。
const port = process.env.ELDERCARE_PRIVATE_PORT ?? '3001';
if (!/^\d{1,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
  throw new Error('ELDERCARE_PRIVATE_PORT必须是1024到65535之间的本机端口。');
}
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', port], {
  stdio: 'inherit', env: { ...process.env, ELDERCARE_PRIVATE_PREVIEW: '1' },
});
child.on('exit', code => { process.exitCode = code ?? 1; });
child.on('error', error => { console.error(error); process.exitCode = 1; });
