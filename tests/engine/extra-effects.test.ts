import { describe, expect, it } from 'vitest';
import { content } from '@battle/content';
import { compileMatch, updateObservations } from '@battle/engine';
import { extraAttack, extraCommand, extraContacts, extraDamage } from '../../packages/engine/src/extra-effects';
import { fixtureContent, fixtureMap, fixtureRoster } from '../fixtures/battle';
import type { Command, UnitState } from '@battle/contracts';
function start() {
  const state = compileMatch(fixtureMap(12,8), fixtureContent, { A: fixtureRoster, B: fixtureRoster }, 41);
  const a = state.units[0], b = state.units.find(u => u.team === 'B')!;
  state.units = [a,b]; a.surfaceId = 'c:0:0:ground'; b.surfaceId = 'c:3:0:ground';
  for (const u of state.units) { u.main = 'none'; u.sub = 'none'; u.ap = 30; u.stats.ap = 30; u.skills = []; }
  updateObservations(state,content); return {state,a,b};
}
const skill = (kind:string) => content.effects.find(e => e.kind === kind)!;
const weapon = (id:number) => content.weapons.find(w => w.id === `trigger_${String(id).padStart(2,'0')}`)!;
function equip(u:UnitState, main:number, sub?:number) { u.main=weapon(main).id; u.sub=sub ? weapon(sub).id : 'none'; u.loadout={main:[u.main,'none','none','none'],sub:[u.sub,'none','none','none']}; }
describe('explicit skill preparations and anonymous phantom identity', () => {
  it('limits modified lead to3 paid preparations and gives zeroHPdamage/threeAPdrain', () => {
    const {state,a,b}=start(), e=skill('lead-custom'); a.skills=[e.id]; equip(a,23);
    for(let i=0;i<3;i++) { expect(extraCommand(state,a,{kind:'SPECIAL',effectId:e.id},content,i*5)[0].kind).toBe('LEAD_READY'); delete a.effectState.leadReady; }
    const before=a.ap; expect(extraCommand(state,a,{kind:'SPECIAL',effectId:e.id},content,15)[0].reasonCode).toBe('USE_LIMIT'); expect(a.ap).toBe(before);
    a.effectState.leadReady=e.id; const modifier=extraAttack(state,a,b,weapon(23),content,0); expect(modifier.synthetic?.basePower).toBe(0); expect(modifier.lead).toBe(true);
    extraDamage(state,b,modifier,content,0); expect(b.hp).toBe(100); expect(b.ap).toBe(27); expect(b.effectState.leadExpiresAt).toBe(30);
  });
  it('requires permitted dualshooter pairing and keeps combinedprofile for nextactualshot', () => {
    const {state,a,b}=start(), e=skill('synthesis'); a.skills=[e.id]; equip(a,22,29);
    const cmd:Command={kind:'SPECIAL',effectId:e.id};
    expect(extraCommand(state,a,cmd,content,0)[0].kind).toBe('SYNTHESIS_READY');
    const combined=extraAttack(state,a,b,weapon(22),content,5).synthetic!;
    expect(combined.id).toBe(`${weapon(22).id}+${weapon(29).id}`); expect(combined.attackAp).toBeGreaterThan(0);
    expect(a.effectState.synthesisReady).toBe(true);
    equip(a,23,29); expect(extraCommand(state,a,cmd,content,10)[0].reasonCode).toBe('DUAL_SHOOTER_REQUIRED');
  });
  it('versatile accepts explicitaptitudes once and excludes synthesis/curve', () => {
    const {state,a}=start(), e=skill('versatile'); a.skills=[e.id];
    expect(extraCommand(state,a,{kind:'SPECIAL',effectId:e.id,chosenEffectIds:['skill_42']},content,0)[0].reasonCode).toBe('INVALID_EFFECT_SELECTION');
    expect(extraCommand(state,a,{kind:'SPECIAL',effectId:e.id,chosenEffectIds:['skill_38','skill_39']},content,0)[0].kind).toBe('VERSATILE_SELECT');
    expect(a.skills).toContain('skill_38'); expect(extraCommand(state,a,{kind:'SPECIAL',effectId:e.id,chosenEffectIds:['skill_40']},content,5)[0].reasonCode).toBe('INVALID_EFFECT_SELECTION');
  });
  it('curve validates allsegments and requiresViper/atmost8points', () => {
    const {state,a}=start(), e=skill('curved-shot'); a.skills=[e.id]; equip(a,26);
    const p={x:'3464102',y:'0',z:'560000'};
    expect(extraCommand(state,a,{kind:'SPECIAL',effectId:e.id,waypoints:[p]},content,0)[0].kind).toBe('CURVED_SHOT_READY');
    expect(extraCommand(state,a,{kind:'SPECIAL',effectId:e.id,waypoints:Array(9).fill(p)},content,5)[0].reasonCode).toBe('WAYPOINTS_REQUIRED');
  });
  it('phantom numbers stay stable when olderphantoms expire and neverembedtrueIDs', () => {
    const {state,a}=start(); state.effects.decoys=[{id:`${a.id}-secret1`,ownerId:a.id,team:'A',cellId:'c:1:0',createdAt:0,expiresAt:5},{id:`${a.id}-secret2`,ownerId:a.id,team:'A',cellId:'c:2:0',createdAt:0,expiresAt:10}];
    const original=extraContacts(state,'B',content); expect(original.map(c=>c.number)).toEqual(['D01','D02']); expect(JSON.stringify(original)).not.toContain(a.id);
    state.absoluteTick=6; expect(extraContacts(state,'B',content)[0].contactId).toBe(original[1].contactId);
  });
});
