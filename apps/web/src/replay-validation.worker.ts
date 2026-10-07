import type { Replay } from '@battle/contracts';
import { initializeHashing } from '@battle/engine';
import { validateReplay } from '@battle/replay';
self.onmessage = async (e: MessageEvent<Replay>) => {
  try { await initializeHashing(); self.postMessage(validateReplay(e.data)); }
  catch (e) { self.postMessage({ ok: false, errors: [e instanceof Error ? e.message : 'INVALID_REPLAY'] }); }
};
