import { content } from '@battle/content';
import { createFixedPlans, initializeHashing, resolveTurn } from '@battle/engine';
import type { BattleState, TurnPlan } from '@battle/contracts';
self.onmessage = async (e: MessageEvent<{ state: BattleState; plans: TurnPlan[] }>) => {
  try {
    await initializeHashing();
    const allPlans = [...e.data.plans, ...createFixedPlans(e.data.state, 'B', content)];
    const resolution = resolveTurn(e.data.state, allPlans, content);
    self.postMessage({ ok: true, allPlans, resolution });
  } catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
};
