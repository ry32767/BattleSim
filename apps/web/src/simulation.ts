import type { BattleState, Replay, TurnPlan, TurnResolution, Validation } from '@battle/contracts';
export function simulate(state: BattleState, plans: TurnPlan[]): Promise<{ allPlans: TurnPlan[]; resolution: TurnResolution }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = e => { worker.terminate(); if (e.data.ok) resolve(e.data); else reject(new Error(e.data.error)); };
    worker.onerror = e => { worker.terminate(); reject(new Error(e.message || '戦闘計算に失敗しました')); };
    worker.postMessage({ state, plans });
  });
}
export function verifyReplay(record: Replay): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./replay-validation.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<Validation>) => { worker.terminate(); if (e.data.ok) resolve(); else reject(new Error(e.data.errors.slice(0,3).join(' / '))); };
    worker.onerror = e => { worker.terminate(); reject(new Error(e.message || '記録の検証に失敗しました')); };
    worker.postMessage(record);
  });
}
