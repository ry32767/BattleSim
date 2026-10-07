import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { compileContent, content, defaultRoster, maps, validateWeaponAction, catalogManifest, presetRestrictions } from '../../packages/content/src/index';
import sourceLock from '../../data/runtime/source-lock.json';
import { compileMatch, validateRoster } from '../../packages/engine/src/index';

describe('C1 compiler and source preservation', () => {
  it('audits 64 individualized supplemental characters, 41 weapons, 55 named effects', () => {
    expect(content.characters.filter(c=>c.mode==='supplemented')).toHaveLength(64);
    expect(new Set(content.characters.filter(c=>c.mode==='supplemented').map(c=>c.characterId)).size).toBe(64);
    expect(content.weapons).toHaveLength(41); expect(content.effects).toHaveLength(55);
    expect(content.weapons.every(w=>w.enabled)).toBe(true);expect(content.effects.every(e=>e.enabled)).toBe(true);
    expect(content.overrides.filter(o=>!o.field.startsWith('rangeOverride'))).toHaveLength(64*7);
    expect(catalogManifest.counts.normalEnabled).toBe(0);
    expect(content.characters.filter(c=>c.mode==='normal').every(c=>!c.enabled)).toBe(true);
    expect(presetRestrictions).toHaveLength(64);
  });
  it('preserves all four complete observed stats and every partial observed stat', () => {
    const ledger=JSON.parse(readFileSync('closed-battle-spec-v0.2/closed-battle-spec/data/characters.json','utf8'));
    for (const row of ledger) {
      const c=content.characters.find(c=>c.id===`${row.id}-supplemented`)!;
      for (const [field,value] of Object.entries(row.simulation_stats)) if(value!==null) expect(c.stats[field as keyof typeof c.stats]).toBe(value);
    }
    expect(content.characters.filter(c=>c.mode==='training').map(c=>c.characterId).sort()).toEqual(['char_26','char_27','char_28','char_35']);
  });
  it('has not rewritten an observation ledger or M1.0/M1.1', () => {
    for (const [path,hash] of Object.entries(sourceLock)) {
      expect(createHash('sha256').update(readFileSync(`closed-battle-spec-v0.2/closed-battle-spec/data/${path}`)).digest('hex')).toBe(hash);
    }
  });
  it('rejects missing stats, duplicate preset IDs, unknown/disabled effects and absent provenance', () => {
    for (const mutate of [
      (p:any)=>{delete p.characters.find((c:any)=>c.enabled).stats.ap;},
      (p:any)=>{p.characters[1].id=p.characters[0].id;},
      (p:any)=>{p.characters.find((c:any)=>c.enabled).skills=['unresolved-effect'];},
      (p:any)=>{p.characters.find((c:any)=>c.enabled).skills=['skill_10'];p.effects.find((e:any)=>e.id==='skill_10').enabled=false;},
      (p:any)=>{p.overrides=p.overrides.filter((o:any)=>!(o.characterId==='char_01'&&o.field==='ap'));},
      (p:any)=>{p.calibrated=!p.calibrated;},
      (p:any)=>{delete p.effects[0].enabled;},
      (p:any)=>{delete p.effects[0].values.activation;},
      (p:any)=>{delete p.characters.find((c:any)=>c.enabled).enabled;},
      (p:any)=>{p.weapons[0].structureDamage='12';},
      (p:any)=>{p.characters[0].defaultLoadout.main[1]=p.characters[0].defaultLoadout.main[0];},
    ]) {
      const pack=structuredClone(content);mutate(pack);expect(()=>compileContent(pack)).toThrow(/Content compile/);
    }
  });
  it('rejects dependency and active two-slot violations', () => {
    const loadout={main:['trigger_33','trigger_17','trigger_11','none'],sub:['trigger_28','trigger_09','trigger_11','none']};
    expect(validateWeaponAction(content,loadout,'trigger_33','trigger_28','trigger_17')).toEqual([]);
    expect(validateWeaponAction(content,loadout,'trigger_11','trigger_28','trigger_17')).toContain('active dependency missing trigger_17');
    expect(validateWeaponAction(content,{main:['trigger_06','trigger_11','none','none'],sub:['trigger_11','trigger_28','none','none']},'trigger_06','trigger_11')).toContain('two-slot weapon trigger_06 occupies MAIN and SUB');
  });
  it('requires distinct usable stage help presets and separates training from normal', () => {
    for (const stage of ['I','II','III'] as const) {
      for(const team of ['A','B'] as const){const roster=defaultRoster(stage,team);expect(roster.base).toHaveLength(4);expect(new Set(roster.base).size).toBe(4);expect(roster.help).toHaveLength({I:1,II:2,III:4}[stage]);expect(new Set(roster.help).size).toBe(roster.help.length);}
      expect(content.helpPools[stage]).toHaveLength({I:4,II:7,III:9}[stage]);
    }
    const pack=structuredClone(content);pack.helpPools.I[1]=pack.helpPools.I[0];expect(()=>compileContent(pack)).toThrow(/help pool/);
  });
  it('generates M1.2 cell/layer material structures with strictly lower supports', () => {
    for(const map of Object.values(maps)){
      expect(map.version).toBe('M1.2');expect(map.geometryVersion).toBe('G1-D1.1');
      expect(map.structures!.length).toBeGreaterThan(map.buildings.length);
      const elements=new Map(map.structures!.map(s=>[s.id,s]));
      for(const s of map.structures!){expect(s.maxDurability).toBe({residential:300,industrial:600,reinforced:1200}[s.materialId as 'residential']);for(const id of s.supportIds)expect(elements.get(id)!.layerIndex).toBe(s.layerIndex-1);}
    }
  });
  it('uses R1.3 sniper outputs and null attack fields for support profiles',()=>{
    expect(content.weapons.find(w=>w.id==='trigger_06')!.basePower).toBe(140);
    expect(content.weapons.find(w=>w.id==='trigger_32')!.basePower).toBe(80);
    for(const w of content.weapons.filter(w=>['support','option'].includes(w.actionKind))){expect(w.basePower).toBeNull();expect(w.baseHit).toBeNull();expect(w.range).toBeNull();}
  });
  it('offers only six manual skill actions and identifies Raygust shield mode explicitly',()=>{
    expect(content.effects.filter(e=>e.values.activation==='manual').map(e=>e.id)).toEqual(['skill_35','skill_36','skill_37','skill_42','skill_51','skill_52']);
    expect(content.effects.find(e=>e.id==='skill_09')!.values.activation).toBe('passive');
    expect(content.effects.find(e=>e.id==='skill_50')!.values.activation).toBe('passive');
    expect(content.weapons.filter(w=>w.options?.supportsShieldMode).map(w=>w.id)).toEqual(['trigger_33']);
  });
  it('compiles every supplemental preset in its legitimate base or stage help slot',()=>{
    const candidates=content.characters.filter(c=>c.mode==='supplemented');
    for(const preset of candidates){
      const helperStage=(['I','II','III'] as const).find(stage=>content.helpPools[stage].includes(preset.id));
      const stage=helperStage??'I', total={I:9,II:14,III:24}[stage],helpCount={I:1,II:2,III:4}[stage];
      const source=maps[stage],spawnSlots=source.spawnSlots.filter(s=>s.index<total);
      const cellIds=new Set(spawnSlots.map(s=>source.cells.find(c=>c.surfaces.some(surface=>surface.id===s.surfaceId))!.id));
      const map={...source,id:'content-compile-fixture',cells:source.cells.filter(c=>cellIds.has(c.id)),buildings:[],structures:[],spawnSlots};
      const roster=helperStage?{...defaultRoster(stage),help:[preset.id,...content.helpPools[stage].filter(id=>id!==preset.id).slice(0,helpCount-1)]}:{base:[preset.id,...['char_27-supplemented','char_28-supplemented','char_26-supplemented','char_35-supplemented'].filter(id=>id!==preset.id).slice(0,3)],help:defaultRoster(stage).help,changes:[]};
      expect(validateRoster(roster,stage,content),preset.id).toEqual({ok:true,errors:[]});
      const state=compileMatch(map,content,{A:roster,B:defaultRoster(stage,'B')},901);
      expect(state.units).toHaveLength(total*2);expect(new Set(state.units.map(u=>u.id)).size).toBe(total*2);
      expect(preset.snapshot).toBeTruthy();expect(preset.referenceIds?.length).toBeGreaterThan(0);
    }
  });
  it('treats compatible options as alternatives and rejects unavailable base prerequisites',()=>{
    const pack=structuredClone(content);const c=pack.characters.find(c=>c.id==='char_02-supplemented')!;
    c.defaultLoadout={main:['trigger_05','trigger_11','trigger_08','trigger_20'],sub:['trigger_28','trigger_10','trigger_11','none']};
    expect(()=>compileContent(pack)).not.toThrow();
    const roster={...defaultRoster('I'),base:['char_02-supplemented','char_27-training','char_28-training','char_26-training']};
    expect(validateRoster(roster,'I',pack).ok).toBe(true);
    c.defaultLoadout.main[0]='trigger_12';expect(()=>compileContent(pack)).toThrow(/dependency/);
  });
});
