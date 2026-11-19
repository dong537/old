import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// 本机静态产物验收工具；生产直接托管out，不启动Node服务。
const root = path.resolve('out');
const basePath = process.env.ELDERCARE_PREVIEW_BASE_PATH ?? '';
if (basePath && basePath !== '/eldercare') throw new Error('ELDERCARE_PREVIEW_BASE_PATH只支持/eldercare。');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  let target;
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    if (basePath && pathname === basePath) { res.writeHead(308, { Location: `${basePath}/` }); res.end(); return; }
    if (basePath && !pathname.startsWith(`${basePath}/`)) { res.writeHead(404); res.end('Not found'); return; }
    const localPathname = basePath ? pathname.slice(basePath.length) : pathname;
    target = path.resolve(root, `.${localPathname.endsWith('/') ? `${localPathname}index.html` : localPathname}`);
    if (!target.startsWith(`${root}${path.sep}`)) { res.writeHead(400); res.end('Invalid path'); return; }
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      if (target && path.extname(target) === '') { res.writeHead(308, { Location: `${new URL(req.url, 'http://127.0.0.1').pathname}/${new URL(req.url, 'http://127.0.0.1').search}` }); res.end(); return; }
      try { res.writeHead(404, { 'Content-Type': mime['.html'] }); res.end(await readFile(path.join(root, '404.html'))); }
      catch (notFoundError) { console.error(notFoundError); res.writeHead(500); res.end('Build output unavailable. Run npm run build first.'); }
    } else { console.error(error); res.writeHead(500); res.end('Unable to read build output'); }
  }
});
const port = process.env.ELDERCARE_PREVIEW_PORT ?? '3000';
if (!/^[0-9]{1,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
  throw new Error('ELDERCARE_PREVIEW_PORT必须是1024到65535之间的本机端口。');
}
server.listen(Number(port), '127.0.0.1', () => console.log('公开静态预览：http://127.0.0.1:' + port + basePath + '/'));
