import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const port = process.env.PORT ?? '3100';
if (!/^[0-9]{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error('PORT 必须是 1 到 65535 之间的整数。');
  process.exit(1);
}

const prototype = fileURLToPath(new URL('../prototype/', import.meta.url));
const nextCli = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));

console.log(`本机原型：http://127.0.0.1:${Number(port)}/guangzhou`);
console.log('完整复用 dist(1) 演示内容；演示数据和操作不会写入真实机构目录。');

const child = spawn(process.execPath, [nextCli, 'dev', prototype, '--hostname', '127.0.0.1', '--port', String(Number(port))], {
  cwd: prototype,
  env: { ...process.env, ELDERCARE_PROTOTYPE_LOCAL: '1', NEXT_TELEMETRY_DISABLED: '1' },
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error('原型服务启动失败：', error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
