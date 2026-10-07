import { describe, expect, it } from 'vitest';
import type { BattleState, TurnPlan } from '@battle/contracts';
import { compileMatch, findPath, generateSolids, getSurface, inSector, matchResult, meteorParameters, moveCost, projectState, resolveTurn, stateHash, traceLine, updateObservations, validatePlan, validateRoster } from '@battle/engine';
import { appendTurn, createReplay, replayFrame, validateReplay } from '@battle/replay';
import { calibrationFixture, fixtureContent, fixtureMap, fixtureRoster } from '../fixtures/battle';
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
function start():BattleState{return compileMatch(fixtureMap(),fixtureContent,{A:fixtureRoster,B:fixtureRoster},12345);}
function isolate(positions:{id:string;cell:string;main?:string;sub?:string;direction?:number;hp?:number;ap?:number}[]):BattleState {const s=start();s.units=positions.map(p=>{const u=copy(s.units.find(u=>u.id===p.id)!);u.surfaceId=`${p.cell}:ground`;u.main=p.main??'none';u.sub=p.sub??'none';u.mainDirection=p.direction??0;u.subDirection=p.direction??0;u.hp=p.hp??100;if(p.ap!==undefined)u.stats.ap=p.ap;return u;});s.observations.A.contacts=[];s.observations.A.contactLinks={};s.observations.B.contacts=[];s.observations.B.contactLinks={};updateObservations(s,fixtureContent);return s;}
const plan=(unitId:string,path:string[]):TurnPlan=>({unitId,planRevision:1,commands:[{kind:'MOVE',path:path.map(c=>`${c}:ground`)}]});
describe('R1.3 integer tick and simultaneous moves',()=>{
  it('R1-T1 completes 17 flat moves with AP17',()=>{const s=isolate([{id:'A-01-01',cell:'c:-8:0'}]);const p=plan(s.units[0]!.id,Array.from({length:17},(_,i)=>`c:${-7+i}:0`)),r=resolveTurn(s,[p],fixtureContent);expect(r.nextState.units[0]!.surfaceId).toBe('c:9:0:ground');expect(r.nextState.units[0]!.ap).toBe(0);expect(r.fullEvents.filter(e=>e.kind==='MOVE_LAND')).toHaveLength(17);expect(r.fullEvents.filter(e=>e.kind==='MOVE_LAND').at(-1)!.tick).toBe(85);expect(r.frames).toHaveLength(151);});
  it('R13-T2 permits chains ending empty and legacy policy refunds and retries cycles',()=>{const a=isolate([{id:'A-01-01',cell:'c:0:0'},{id:'A-01-02',cell:'c:1:0'}]);delete a.effects.movementPolicy;const chain=resolveTurn(a,[plan('A-01-01',['c:1:0']),plan('A-01-02',['c:2:0'])],fixtureContent);expect(chain.frames.find(f=>f.tick===5)!.state.units.map(u=>u.surfaceId)).toEqual(['c:1:0:ground','c:2:0:ground']);const cycle=resolveTurn(a,[plan('A-01-01',['c:1:0']),plan('A-01-02',['c:0:0'])],fixtureContent);expect(cycle.nextState.units.map(u=>u.surfaceId)).toEqual(['c:0:0:ground','c:1:0:ground']);expect(cycle.nextState.units.every(u=>u.ap===17)).toBe(true);expect(cycle.fullEvents.filter(e=>e.kind==='MOVE_RESERVE').slice(0,4).map(e=>e.tick)).toEqual([0,0,10,10]);});
  it('R13-T2 all contenders for one destination stop',()=>{const s=isolate([{id:'A-01-01',cell:'c:0:0'},{id:'B-01-01',cell:'c:2:0'}]),r=resolveTurn(s,[plan('A-01-01',['c:1:0']),plan('B-01-01',['c:1:0'])],fixtureContent);expect(r.nextState.units.map(u=>u.surfaceId)).toEqual(['c:0:0:ground','c:2:0:ground']);});
  it('R13-T1 WAIT settings occupy five ticks and 145 movement never starts',()=>{const s=isolate([{id:'A-01-01',cell:'c:0:0'}]),r=resolveTurn(s,[{unitId:'A-01-01',planRevision:1,commands:[{kind:'WAIT',durationTicks:5,mainDirection:10},{kind:'WAIT',durationTicks:140,mainDirection:20},{kind:'MOVE',path:['c:1:0:ground']}]}],fixtureContent);expect(r.fullEvents.filter(e=>e.kind==='COMMAND_START').map(e=>e.tick)).toEqual([0,5]);expect(r.nextState.units[0]!.surfaceId).toBe('c:0:0:ground');});
  it('R13-T9 invalid commands, directions, paths and secret IDs reject',()=>{const s=start();expect(validatePlan(s,{unitId:s.units[0]!.id,planRevision:0,commands:[{kind:'TRACK',contactId:'B-01-01'}]},fixtureContent).ok).toBe(false);expect(validatePlan(s,{unitId:s.units[0]!.id,planRevision:0,commands:[{kind:'WAIT',mainDirection:360}]},fixtureContent).ok).toBe(false);expect(validatePlan(s,{unitId:s.units[0]!.id,planRevision:0,commands:[{kind:'MOVE',path:[]}]},fixtureContent).ok).toBe(false);expect(validateRoster({...fixtureRoster,base:['bad','p2','p3','p4']},'I',fixtureContent).ok).toBe(false);expect(()=>compileMatch(fixtureMap(),fixtureContent,{A:fixtureRoster,B:fixtureRoster},0)).toThrow('INVALID_SEED');});
});
describe('skip occupied route extension',()=>{
  it('continues through an occupied surface without landing or refunding, paying each legal edge',()=>{
    const s=isolate([{id:'A-01-01',cell:'c:0:0'},{id:'A-01-02',cell:'c:1:0'}]);
    const r=resolveTurn(s,[plan('A-01-01',['c:1:0','c:2:0','c:3:0'])],fixtureContent);
    const f=r.frames.find(f=>f.tick===5)!.state.units[0]!;
    expect(f.surfaceId).toBe('c:0:0:ground');expect(f.pendingMove?.via).toEqual(['c:1:0:ground']);expect(f.ap).toBe(15);
    expect(r.fullEvents.filter(e=>e.kind==='MOVE_LAND').map(e=>[e.tick,e.to])).toEqual([[10,'c:2:0:ground'],[15,'c:3:0:ground']]);
    expect(r.nextState.units[0]!.ap).toBe(14);expect(r.fullEvents.some(e=>e.kind==='MOVE_CONFLICT')).toBe(false);
    expect(s.units[0]!.pendingMove).toBeNull();
  });
  it('skips consecutive occupied surfaces and preserves stable simultaneous contender handling',()=>{
    const s=isolate([{id:'A-01-01',cell:'c:0:0'},{id:'A-01-02',cell:'c:1:0'},{id:'A-02-01',cell:'c:2:0'}]);
    const r=resolveTurn(s,[plan('A-01-01',['c:1:0','c:2:0','c:3:0'])],fixtureContent);
    expect(r.fullEvents.filter(e=>e.kind==='MOVE_SKIP')).toHaveLength(2);expect(r.nextState.units[0]!.surfaceId).toBe('c:3:0:ground');
    expect(r.nextState.units[0]!.ap).toBe(14);
    const a=isolate([{id:'A-01-01',cell:'c:0:0'},{id:'B-01-01',cell:'c:2:0'}]),p=[plan('A-01-01',['c:1:0','c:1:1']),plan('B-01-01',['c:1:0','c:1:-1'])];
    const ar=resolveTurn(a,p,fixtureContent),b=copy(a);b.units.reverse();
    const br=resolveTurn(b,[...p].reverse(),fixtureContent);expect(ar.frames.map(f=>f.stateHash)).toEqual(br.frames.map(f=>f.stateHash));
    expect(ar.fullEvents.filter(e=>e.kind==='MOVE_LAND').map(e=>e.tick)).toEqual([10,10]);
    for(const f of ar.frames){const ids=f.state.units.filter(u=>u.alive).map(u=>u.surfaceId);expect(new Set(ids).size).toBe(ids.length);}
  });
  it('also continues the generated guard route through an occupied intermediate surface',()=>{
    const s=isolate([{id:'A-01-01',cell:'c:0:0'},{id:'A-01-02',cell:'c:1:0'},{id:'A-02-01',cell:'c:4:0'}]);
    s.map={...s.map,cells:s.map.cells.filter(c=>c.r===0)};
    const r=resolveTurn(s,[{unitId:'A-01-01',planRevision:1,commands:[{kind:'GUARD',allyId:'A-02-01',durationTicks:150}]}],fixtureContent);
    expect(r.fullEvents.some(e=>e.kind==='MOVE_SKIP')).toBe(true);expect(r.nextState.units[0]!.surfaceId).toBe('c:3:0:ground');expect(r.nextState.units[0]!.ap).toBe(14);
  });
  it('continues a radar tracking route while keeping the occupied enemy endpoint clear',()=>{
    const s=isolate([{id:'A-01-01',cell:'c:0:0'},{id:'A-01-02',cell:'c:1:0'},{id:'B-01-01',cell:'c:8:0'}]);
    s.map={...s.map,cells:s.map.cells.filter(c=>c.r===0)};
    const contact=s.observations.A.contacts[0]!;expect(contact.channel).toBe('radar');
    const r=resolveTurn(s,[{unitId:'A-01-01',planRevision:1,commands:[{kind:'TRACK',contactId:contact.contactId,durationTicks:150}]}],fixtureContent);
    expect(r.fullEvents.some(e=>e.kind==='MOVE_SKIP')).toBe(true);expect(r.nextState.units[0]!.surfaceId).toBe('c:7:0:ground');
    expect(r.nextState.units[0]!.ap).toBe(10);expect(r.nextState.units[2]!.surfaceId).toBe('c:8:0:ground');
  });
  it('stops once at an occupied endpoint, or when continuation cannot be paid',()=>{
    const a=isolate([{id:'A-01-01',cell:'c:0:0'},{id:'A-01-02',cell:'c:1:0'}]);
    const r=resolveTurn(a,[plan('A-01-01',['c:1:0'])],fixtureContent);expect(r.fullEvents.filter(e=>e.kind==='MOVE_RESERVE')).toHaveLength(1);expect(r.nextState.units[0]!.ap).toBe(17);
    a.units[0]!.stats.ap=1;const short=resolveTurn(a,[plan('A-01-01',['c:1:0','c:2:0'])],fixtureContent);
    expect(short.nextState.units[0]!.surfaceId).toBe('c:0:0:ground');expect(short.nextState.units[0]!.ap).toBe(1);
    expect(short.fullEvents.some(e=>e.kind==='MOVE_STOP'&&e.reasonCode==='AP_INSUFFICIENT')).toBe(true);
  });
  it('does not schedule a skipped continuation that cannot finish before the turn boundary',()=>{
    const s=isolate([{id:'A-01-01',cell:'c:0:0'},{id:'A-01-02',cell:'c:1:0'}]);
    const r=resolveTurn(s,[{unitId:'A-01-01',planRevision:1,commands:[{kind:'WAIT',durationTicks:140},{kind:'MOVE',path:['c:1:0:ground','c:2:0:ground']}]}],fixtureContent);
    expect(r.fullEvents.some(e=>e.kind==='MOVE_SKIP')).toBe(false);expect(r.nextState.units[0]!.ap).toBe(17);
  });
});
describe('combat groups, waits, and result boundaries',()=>{
  it('R13-T4 lethal same-group shots both fire',()=>{const s=isolate([{id:'A-01-01',cell:'c:0:0',main:'blade',direction:0},{id:'B-01-01',cell:'c:1:0',main:'blade',direction:180}]),r=resolveTurn(s,[],fixtureContent);expect(r.frames.find(f=>f.tick===0)!.state.units.every(u=>!u.alive)).toBe(true);expect(r.fullEvents.filter(e=>e.kind==='FIRE'&&e.tick===0)).toHaveLength(2);expect(r.result).toBe(null);expect(r.nextState.turn).toBe(2);});
  it('R13-T3 dual attacks pay AP4 but add five ticks once',()=>{const c=copy(fixtureContent);c.weapons[0]!.basePower=1;c.characters[0]!.defaultLoadout.sub[1]='blade';const s=isolate([{id:'A-01-01',cell:'c:0:0',main:'blade',sub:'blade',direction:0},{id:'B-01-01',cell:'c:1:0',direction:180}]);s.manifest={...s.manifest,contentVersion:c.version,hashes:{...s.manifest.hashes,content:compileMatch(fixtureMap(),c,{A:fixtureRoster,B:fixtureRoster},1).manifest.hashes.content}};const r=resolveTurn(s,[],c),f=r.frames.find(f=>f.tick===0)!.state.units[0]!;expect(f.ap).toBe(13);expect(f.readyAtTick).toBe(5);expect(r.fullEvents.filter(e=>e.kind==='FIRE'&&e.tick===0)).toHaveLength(2);});
  it('R13-T3 separate defended hits add ten ticks even damage zero',()=>{const s=isolate([{id:'A-01-01',cell:'c:0:0',main:'blade',direction:0},{id:'A-01-02',cell:'c:0:1',main:'blade',direction:300},{id:'B-01-01',cell:'c:1:0',sub:'shield',direction:150}]);s.units[2]!.stats.trion=25;s.units[2]!.stats.defense=25;const r=resolveTurn(s,[],fixtureContent),t=r.frames.find(f=>f.tick===0)!.state.units[2]!;expect(t.hp).toBe(100);expect(t.ap).toBe(15);expect(t.readyAtTick).toBe(10);});
  it('R1-T5 and III threshold wait until six turns',()=>{const s=start();s.turn=6;expect(matchResult(s)).toBe(null);s.turn=7;s.manifest={...s.manifest,stage:'III'};s.units.filter(u=>u.team==='B').slice(0,4).forEach(u=>u.alive=false);expect(matchResult(s)?.winner).toBe('draw');s.units.find(u=>u.team==='B'&&u.alive)!.alive=false;expect(matchResult(s)?.winner).toBe('A');});
  it('R1-T4 sector boundaries are inclusive and reverse facing excludes',()=>{expect(inSector({q:0,r:0},{q:1,r:0},60,120)).toBe(true);expect(inSector({q:0,r:0},{q:1,r:0},61,120)).toBe(false);expect(inSector({q:0,r:0},{q:1,r:0},180,120)).toBe(false);});
});
describe('G1 exact geometry, D1 boundaries, observation secrecy',()=>{
  it('discloses shot endpoints for visible actors while withholding a hidden shooter origin and identity',()=>{
    const visible=isolate([{id:'A-01-01',cell:'c:0:0',main:'blade'},{id:'B-01-01',cell:'c:1:0'}]);
    const vr=resolveTurn(visible,[],fixtureContent),shot=vr.frames.find(f=>f.tick===0)!.teamEvents.A.find(e=>e.kind==='FIRE')!;
    expect(shot.targetId).toMatch(/^contact-A-/);expect(shot.details?.visual).toMatchObject({weaponId:'blade',actionKind:'melee',origin:expect.any(Object),aim:expect.any(Object)});
    expect(JSON.stringify(vr.frames[1]!.teamEvents.A)).not.toContain('B-01-01');
    const hidden=isolate([{id:'A-01-01',cell:'c:0:0'},{id:'B-01-01',cell:'c:8:0',main:'egret',direction:180}]);
    hidden.map=copy(hidden.map);const cell=hidden.map.cells.find(c=>c.id==='c:8:0')!;cell.surfaces=[{id:'c:8:0:roof',cellId:cell.id,kind:'roof',z:4,walkable:true}];
    hidden.units[1]!.surfaceId='c:8:0:roof';updateObservations(hidden,fixtureContent);
    expect(projectState(hidden,'A').contacts[0]!.channel).toBe('radar');
    const hr=resolveTurn(hidden,[],fixtureContent),hiddenShot=hr.frames[1]!.teamEvents.A.find(e=>e.kind==='FIRE');
    expect(hiddenShot).toBeDefined();expect(hiddenShot!.actorId).toBeUndefined();expect(hiddenShot!.details).toBeUndefined();
    expect(JSON.stringify(hr.frames[1]!.teamEvents.A)).not.toContain('B-01-01');
  });
  it('M5 movement costs and ascent limits',()=>{const from={id:'a',cellId:'a',kind:'ground' as const,z:0,walkable:true},to={...from,id:'b',z:2};expect(moveCost(from,to)).toBe(3);expect(moveCost(from,{...to,z:3})).toBe(null);expect(moveCost(from,{...to,z:4},true)).toBe(2);expect(moveCost(from,{...to,z:5},true)).toBe(null);expect(moveCost({...from,z:6},to)).toBe(1);});
  it('G1-T1/T4 blocks exact roof tangency and is reversal invariant',()=>{const f=calibrationFixture('residential'),solids=generateSolids(f.map),a={x:'-6000000',y:'0',z:'2800000'},b={x:'10000000',y:'0',z:'2800000'};expect(traceLine(a,b,solids).clear).toBe(false);expect(traceLine(b,a,solids).clear).toBe(false);expect(traceLine({...a,z:'2800001'},{...b,z:'2800001'},solids).clear).toBe(true);expect(traceLine({...a,z:'500000'},{...b,z:'500000'},solids).clear).toBe(false);});
  it('D11-T1 integer meteor budgets and split conservation',()=>{const low=meteorParameters(6),high=meteorParameters(25),split=meteorParameters(25,10000,10000,64);expect(low.budget).toBe(432);expect(low.power).toBe(72);expect(high.budget).toBe(7500);expect(high.power).toBe(1250);expect(split.budget*64).toBeLessThanOrEqual(high.budget);expect(split.radius).toBeLessThan(high.radius);expect(()=>meteorParameters(0)).toThrow('ZERO_METEOR_BUDGET');});
  it('R13-T8 radar only contacts do not include secret height/equipment/IDs',()=>{const s=isolate([{id:'A-01-01',cell:'c:-10:0'},{id:'B-01-01',cell:'c:10:0',main:'ibis'}]),view=projectState(s,'A'),contact=view.contacts[0]!;expect(contact.channel).toBe('radar');expect(contact.surfaceId).toBeUndefined();expect(contact.main).toBeUndefined();expect(JSON.stringify(view)).not.toContain('B-01-01');expect('rngState' in view).toBe(false);expect('geometryRevision' in view).toBe(false);});
  it('R1-T6 Bagworm hides radar and removal updates same tick without requiring a second content argument',()=>{const s=isolate([{id:'A-01-01',cell:'c:-10:0'},{id:'B-01-01',cell:'c:10:0',sub:'bagworm'}]);expect(projectState(s,'A').contacts).toHaveLength(0);s.units[1]!.sub='none';updateObservations(s);expect(projectState(s,'A').contacts[0]!.channel).toBe('radar');s.units[1]!.sub='bagworm';updateObservations(s);expect(projectState(s,'A').contacts[0]!.channel).toBe('lost');});
  it('path uses AP then number of moves then stable IDs',()=>{const m=fixtureMap(8,4),p=findPath(m,'c:0:0:ground','c:2:0:ground');expect(p).toEqual({path:['c:1:0:ground','c:2:0:ground'],cost:2});expect(getSurface(m,'missing')).toBeUndefined();});
});
describe('deterministic hashes and immutable recorded replay',()=>{
  it('R13-T7 input order and repeated runs have identical every-tick hashes',()=>{const a=isolate([{id:'A-01-01',cell:'c:0:0'},{id:'B-01-01',cell:'c:3:0'}]),p=[plan('A-01-01',['c:1:0']),plan('B-01-01',['c:2:0'])],b=copy(a);b.units.reverse();b.map.cells.reverse();expect(stateHash(a)).toBe(stateHash(b));const ar=resolveTurn(a,p,fixtureContent),br=resolveTurn(b,[...p].reverse(),fixtureContent);expect(ar.frames.map(f=>f.stateHash)).toEqual(br.frames.map(f=>f.stateHash));expect(a.turn).toBe(1);expect(a.units[0]!.surfaceId).toBe('c:0:0:ground');});
  it('R1-T9 replay restores actual recorded state and detects corruption',()=>{const s=isolate([{id:'A-01-01',cell:'c:0:0'}]),p=[plan('A-01-01',['c:1:0'])],r=resolveTurn(s,p,fixtureContent),replay=appendTurn(createReplay(s),p,r);expect(validateReplay(replay).ok).toBe(true);expect(stateHash(replayFrame(replay,1,5))).toBe(r.frames.find(f=>f.tick===5)!.stateHash);expect(replayFrame(replay,1,0,'A').units[0]!.surfaceId).toBe('c:0:0:ground');const bad=copy(replay);bad.turns[0]!.frames[6]!.state.units[0]!.hp--;expect(()=>replayFrame(bad,1,5)).toThrow('REPLAY_HASH_MISMATCH');});
});
