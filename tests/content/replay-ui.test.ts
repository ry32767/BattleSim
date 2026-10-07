import { describe, expect, it, vi } from 'vitest';
import type { BattleEvent } from '@battle/contracts';
import { actionFrameIndices, adjacentActionFrame } from '../../apps/web/src/replayTimeline';
import { combatEffect } from '../../apps/web/src/combatEffects';
import { displayIconUrl, officialIconUrl, officialIcons } from '../../apps/web/src/officialIcons';
const event=(tick:number,kind:string):BattleEvent=>({id:`${tick}:${kind}`,turn:1,tick,kind,groupId:`${tick}:1`,reasonCode:kind,description:kind});
describe('battle display boundaries',()=>{
  it('uses authored public badges unless private external icons are explicitly enabled',()=>{
    try {
      vi.stubEnv('VITE_USE_OFFICIAL_ICONS',undefined);expect(displayIconUrl('char_27')).toBeUndefined();
      vi.stubEnv('VITE_USE_OFFICIAL_ICONS','false');expect(displayIconUrl('char_27')).toBeUndefined();
      vi.stubEnv('VITE_USE_OFFICIAL_ICONS','true');expect(displayIconUrl('char_27')).toBe(officialIconUrl('char_27'));
    } finally { vi.unstubAllEnvs(); }
  });
  it('steps across action ticks once per simultaneous group and skips empty animation/random frames',()=>{
    const frames=Array.from({length:151},(_,i)=>({tick:i-1}));
    const indices=actionFrameIndices(frames,[event(0,'COMMAND_START'),event(5,'FIRE'),event(5,'DEFEND'),event(6,'RANDOM'),event(10,'MOVE_LAND')]);
    expect(indices).toEqual([0,1,6,11,150]);expect(adjacentActionFrame(indices,2,1)).toBe(6);expect(adjacentActionFrame(indices,8,-1)).toBe(6);
    expect(adjacentActionFrame(indices,150,1)).toBe(150);expect(adjacentActionFrame([],0,1)).toBe(0);
  });
  it('uses only the events supplied by the chosen perspective',()=>{
    expect(actionFrameIndices([{tick:-1},{tick:0},{tick:1},{tick:2}],[])).toEqual([0,3]);
  });
  it('has distinct combat effects and activation feedback while suppressing bookkeeping and cancellation',()=>{
    expect(combatEffect(event(0,'FIRE'),'melee')).toBe('slash');expect(combatEffect(event(0,'FIRE'),'shot')).toBe('shot');
    for(const kind of ['WEAPON_SPECIAL','LEAD_READY','SYNTHESIS_READY','VERSATILE_SELECT','SPECIAL','COMMAND_START'])expect(combatEffect(event(0,kind))).toBe('activate');
    expect(combatEffect(event(0,'DEFEND'))).toBe('shield');expect(combatEffect(event(0,'DETONATE'))).toBe('blast');
    for(const kind of ['SPECIAL_CANCEL','MOVE_SKIP','ATTACK_WAIT','RANDOM'])expect(combatEffect(event(0,kind))).toBeNull();
  });
  it('resolves verified official identities and leaves unlisted identities unassigned',()=>{
    expect(officialIconUrl('char_27-training')).toBe('https://worldtrigger.info/img/quiz/top/01.jpg');
    expect(officialIconUrl('char_28-supplemented')).toContain('/63.jpg');expect(officialIconUrl('unknown')).toBeUndefined();
    expect(new Set(Object.values(officialIcons)).size).toBe(Object.keys(officialIcons).length);
  });
});
