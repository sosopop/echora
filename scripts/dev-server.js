/**
 * Dev server 启动器
 *
 * 设置 NODE_ENV=development,用 tsx watch 热重载后端。
 */

import { spawn } from 'node:child_process';

process.env.NODE_ENV ||= 'development';

const isWindows = process.platform === 'win32';

const child = spawn(
  isWindows ? 'npx.cmd' : 'npx',
  ['tsx', 'watch', 'server/index.ts'],
  {
    stdio: 'inherit',
    env: process.env,
    shell: isWindows,
  }
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
