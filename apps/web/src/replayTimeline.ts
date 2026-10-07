import type { BattleEvent } from '@battle/contracts';

// Action boundaries are independent of animation frames and private random draws.
export function actionFrameIndices(frames: readonly { tick: number }[], events: readonly BattleEvent[]): number[] {
  const ticks = new Set(events.filter(e => !['RANDOM', 'RANDOM_POWER', 'ATTACK_WAIT'].includes(e.kind)).map(e => e.tick));
  return frames.flatMap((frame, index) => index === 0 || index === frames.length - 1 || ticks.has(frame.tick) ? [index] : []);
}
export function adjacentActionFrame(indices: readonly number[], current: number, delta: -1 | 1): number {
  return delta === 1 ? indices.find(i => i > current) ?? current : [...indices].reverse().find(i => i < current) ?? current;
}
