import { spawn } from 'node:child_process';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = ['dev:server', 'dev:web'].map(script => spawn(npm, ['run', script], { stdio: 'inherit', shell: process.platform === 'win32' }));
function stop() { for (const child of children) child.kill(); process.exit(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
for (const child of children) child.on('exit', code => { if (code && code !== 0) stop(); });
