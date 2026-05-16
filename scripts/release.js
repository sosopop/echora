/**
 * Release 脚本
 *
 * 流程:
 *   1. rm release/
 *   2. npm run build (tsc + vite build)
 *   3. 拷贝 dist-server / dist-web / migrations 到 release/
 *   4. 生成精简 release/package.json(只含运行依赖 + start)
 *   5. 写 release/README.md 启动指引
 *
 * 不复制 .env / data/ / db/ / node_modules/。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RELEASE = path.join(ROOT, 'release');

function rmRf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
}

function run(cmd, args) {
  const isWin = process.platform === 'win32';
  const result = spawnSync(isWin ? `${cmd}.cmd` : cmd, args, {
    stdio: 'inherit',
    cwd: ROOT,
    shell: isWin,
  });
  if (result.status !== 0) {
    console.error(`[release] ${cmd} ${args.join(' ')} 失败,退出码 ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

console.log('[release] 1) 清理 release/');
rmRf(RELEASE);

console.log('[release] 2) npm run build');
run('npm', ['run', 'build']);

console.log('[release] 3) 拷贝产物');
fs.mkdirSync(RELEASE, { recursive: true });
copyRecursive(path.join(ROOT, 'dist-server'), path.join(RELEASE, 'dist-server'));
copyRecursive(path.join(ROOT, 'dist-web'), path.join(RELEASE, 'dist-web'));
copyRecursive(path.join(ROOT, 'migrations'), path.join(RELEASE, 'migrations'));

console.log('[release] 4) 生成精简 package.json');
const rootPkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
);
const releasePkg = {
  name: rootPkg.name,
  version: rootPkg.version,
  private: true,
  type: 'module',
  description: rootPkg.description,
  engines: rootPkg.engines,
  scripts: {
    start: 'node dist-server/server/index.js',
    migrate: 'node dist-server/server/db/migrate.js',
  },
  dependencies: rootPkg.dependencies,
};
fs.writeFileSync(
  path.join(RELEASE, 'package.json'),
  JSON.stringify(releasePkg, null, 2),
  'utf8'
);

console.log('[release] 5) 写 README');
fs.writeFileSync(
  path.join(RELEASE, 'README.md'),
  `# Echora · Release

## 启动

\`\`\`bash
npm install --production
# 配置环境(必须显式设置 JWT_SECRET 与必要的 DATABASE_PATH)
export JWT_SECRET=...
export DATABASE_PATH=./db/echora.db
npm run migrate
npm start
\`\`\`

## 包含

- dist-server/ 后端编译产物
- dist-web/ 前端构建产物(由网关或 Express 反代静态文件)
- migrations/ 数据库迁移
- package.json 仅含运行依赖

## 不含

- .env / 任何密钥
- 运行时 data/ db/
- node_modules/(部署时执行 npm install)

## 静态文件

dist-web/ 不在 Express 自动托管列表内,如需同源服务请在反向代理(nginx 等)
将根路径指向 dist-web,API 路径 /api/* 转发到后端 SERVER_PORT。
`,
  'utf8'
);

console.log('[release] ✓ 完成,产物位于 release/');
