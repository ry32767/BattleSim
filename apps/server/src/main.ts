import { createBattleServer } from './index';
import { initializeHashing } from '@battle/engine';

await initializeHashing();
const app = createBattleServer();
const port = Number(process.env.PORT ?? 3001);
await app.listen(port, process.env.HOST ?? '127.0.0.1');
console.info(`BattleSim server ready at http://127.0.0.1:${port}`);
let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await app.close();
  process.exitCode = 0;
}
process.on('SIGINT', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
