import type { ContentPack, Loadout, WeaponProfile } from '../../contracts/src/index';
import { C2_COEFFICIENTS } from './calibration';

export const EFFECT_KINDS = new Set(['melee-link', 'shot-link', 'dual-power', 'suppress-shot', 'suppress-sniper', 'blade-parry', 'close-shooter', 'escudo-hit', 'stealth-kill', 'learn-defense', 'guaranteed-hit', 'instinct-evasion', 'mobile-sniper', 'vital-hit', 'hearing', 'melee-defense', 'strong-legs', 'sniper-pressure', 'mixed-dual', 'precise-sniper', 'attack-cost', 'spear-range', 'twin-snipe', 'trion-range', 'quick-shot', 'pin-sniper', 'random-power', 'composite-dual', 'no-melee-penalty', 'option-ap', 'loadout-aptitude', 'special-power', 'guard-defense', 'silencer-hit', 'distance-power', 'option-wait', 'special-random-floor', 'lead-hit', 'wire-boost', 'decoy', 'lead-custom', 'lead-sniper', 'lead-hound', 'synthesis', 'versatile', 'curved-shot']);
const STAT_KEYS = ['ap', 'trion', 'attack', 'defense', 'evasion', 'support', 'technique'] as const;
const fail = (message: string): never => { throw new Error(`Content compile: ${message}`); };
const int = (value: unknown, min: number, max: number, label: string): void => {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) fail(`${label} must be an integer ${min}..${max}`);
};
const unique = (values: { id: string }[], label: string): void => {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value.id !== 'string' || !value.id || seen.has(value.id)) fail(`${label} duplicate/missing ID: ${value.id}`);
    seen.add(value.id);
  }
};

/** The compiler never fills a missing field or silently drops an effect. */
export function compileContent(input: unknown): ContentPack {
  if (!input || typeof input !== 'object') fail('pack is missing');
  const pack = structuredClone(input) as ContentPack;
  if (!['C1.0-sandbox','C2.0-calibrated'].includes(pack.version) || pack.ruleVersion !== 'R1.3') fail('unsupported content/rule version');
  if (pack.calibrated !== (pack.version === 'C2.0-calibrated')) fail('content calibration/version mismatch');
  for (const key of ['characters', 'weapons', 'effects', 'overrides', 'teams'] as const) if (!Array.isArray(pack[key])) fail(`${key} must be an array`);
  unique(pack.characters, 'character'); unique(pack.weapons, 'weapon'); unique(pack.effects, 'effect');
  if (pack.version === 'C2.0-calibrated') {
    const ibis = pack.weapons.find(w => w.id === 'trigger_01');
    if (ibis?.options?.localFractureCoefficient !== C2_COEFFICIENTS.ibisLocalFractureCoefficient || ibis.options.penetrationBudget !== C2_COEFFICIENTS.ibisPenetrationBudget) fail('C2 Ibis calibration coefficient mismatch');
    for (const [id,baseline] of [['trigger_29',12],['trigger_30',14],['trigger_31',10]] as const) if (pack.weapons.find(w=>w.id===id)?.options?.blastBudget !== Math.round(baseline*C2_COEFFICIENTS.meteorBlastBudget/C2_COEFFICIENTS.baselineMeteorBlastBudget)) fail(`C2 Meteor calibration coefficient mismatch ${id}`);
  }
  const weapons = new Map(pack.weapons.map(w => [w.id, w]));
  const effects = new Map(pack.effects.map(e => [e.id, e]));
  for (const w of pack.weapons) {
    if (!w.name || !w.family || typeof w.enabled !== 'boolean') fail(`weapon metadata missing ${w.id}`);
    if (!['melee','shot','sniper','blast','support','option'].includes(w.actionKind) || !['attack','trion','fixed','ibis','meteor','none'].includes(w.powerModel)) fail(`unknown weapon action/model ${w.id}`);
    for(const key of ['penetration','projectile','friendlyFire','guardable','evadable'] as const) if(typeof w[key]!=='boolean') fail(`missing profile flag ${w.id}.${key}`);
    int(w.waitUnits, 0, 30, `${w.id}.waitUnits`); int(w.sector, 0, 360, `${w.id}.sector`);
    if (![1, 2].includes(w.requiredSlots) || !Array.isArray(w.dependencies)) fail(`weapon slot/dependency missing ${w.id}`);
    for (const dependency of w.dependencies) if (!weapons.has(dependency)) fail(`unknown dependency ${dependency}`);
    const attack = ['melee', 'shot', 'sniper', 'blast'].includes(w.actionKind);
    if (attack) {
      int(w.attackAp, 1, 40, `${w.id}.attackAp`); int(w.basePower, 1, 10000, `${w.id}.basePower`);
      int(w.baseHit, 1, 100, `${w.id}.baseHit`); int(w.range, 1, 64, `${w.id}.range`);
      int(w.structureDamage, 0, 10000, `${w.id}.structureDamage`);
      if (w.powerModel === 'none') fail(`attack profile missing ${w.id}`);
    } else if (w.attackAp !== null || w.basePower !== null || w.baseHit !== null || w.range !== null || w.structureDamage !== null || w.powerModel !== 'none') fail(`non-attack fields must be null ${w.id}`);
    if (w.defenseModel !== null) {
      if (!['shield','raygust','kogetsu'].includes(w.defenseModel)) fail(`unknown defense model ${w.id}`);
      int(w.defenseAp, 1, 40, `${w.id}.defenseAp`);
    } else if (w.defenseAp !== null) fail(`defense AP without defense model ${w.id}`);
    if (!w.status || !Array.isArray(w.sourceIds)) fail(`weapon evidence missing ${w.id}`);
  }
  for (const e of pack.effects) {
    if (!e.name || !e.description || !e.triggerHook || !e.stackKey || !e.values || !e.status || typeof e.enabled !== 'boolean') fail(`effect metadata missing ${e.id}`);
    if (!['manual','passive'].includes(String(e.values.activation))) fail(`effect activation missing ${e.id}`);
    if (!['TURN_START','COMMAND_START','SELECT_TARGET','BEFORE_FIRE','HIT','EVADE','DEFEND','DAMAGE','DEFEAT','GROUP_END','TURN_END'].includes(e.triggerHook) || !['tick','turn','match','action'].includes(e.duration)) fail(`unsupported effect hook/duration ${e.id}`);
    int(e.priority, 0, 100, `${e.id}.priority`); int(e.ap, 0, 40, `${e.id}.ap`); int(e.wait, 0, 150, `${e.id}.wait`); int(e.maxStacks, 1, 100, `${e.id}.maxStacks`);
    if (e.enabled && !EFFECT_KINDS.has(e.kind)) fail(`unsupported effect kind ${e.id}/${e.kind}`);
  }
  for (const c of pack.characters) {
    if (!c.stats) fail(`missing stats ${c.id}`);
    for (const key of STAT_KEYS) int(c.stats[key], key === 'ap' ? 1 : 0, key === 'ap' ? 40 : 60, `${c.id}.${key}`);
    if (!c.snapshot || !c.assetId || !c.status || typeof c.enabled !== 'boolean' || typeof c.strongLegsIncluded !== 'boolean' || !Array.isArray(c.skills) || !c.rangeOverride) fail(`character metadata missing ${c.id}`);
    if (!['normal', 'training', 'supplemented'].includes(c.mode)) fail(`invalid preset mode ${c.id}`);
    if (c.mode === 'normal' && c.enabled) fail(`C1 normal ownership is unconfirmed ${c.id}`);
    validateLoadout(c.defaultLoadout, weapons, c.enabled);
    for (const skill of c.skills) {
      const effect = effects.get(skill);
      if (!effect || (c.enabled && !effect.enabled)) fail(`missing/disabled effect ${c.id}/${skill}`);
    }
    for (const [id, value] of Object.entries(c.rangeOverride)) {
      if (!weapons.has(id)) fail(`unknown range weapon ${c.id}/${id}`);
      int(value, 1, 64, `${c.id}.rangeOverride.${id}`);
    }
    if (c.mode !== 'normal') for (const field of STAT_KEYS) {
      if (!pack.overrides.some(o => o.characterId === c.characterId && o.field === field && o.value === c.stats[field])) fail(`missing per-field provenance ${c.id}/${field}`);
    }
  }
  for (const o of pack.overrides) {
    if (!o.snapshot || !o.transformationVersion || !o.rationale || !Array.isArray(o.referenceIds) || !Array.isArray(o.sourceIds) || !Array.isArray(o.validationCaseIds) || !o.validationCaseIds.length || !Array.isArray(o.plausibleRange) || o.plausibleRange.length !== 2 || o.value < o.plausibleRange[0] || o.value > o.plausibleRange[1]) fail(`incomplete override ${o.characterId}/${o.field}`);
    if(!Number.isSafeInteger(o.value) || !o.plausibleRange.every(Number.isSafeInteger) || o.plausibleRange[0]>o.plausibleRange[1] || !pack.characters.some(c=>c.characterId===o.characterId)) fail(`invalid override value/character ${o.characterId}/${o.field}`);
    if (o.evidenceStatus === 'original' && o.sourceIds.length) fail(`original value must not claim observed sources ${o.characterId}/${o.field}`);
  }
  if (!pack.helpPools) fail('help pools missing');
  for (const stage of ['I', 'II', 'III'] as const) {
    const pool = pack.helpPools[stage];
    if (!Array.isArray(pool) || pool.length !== ({ I: 4, II: 7, III: 9 }[stage]) || new Set(pool).size !== pool.length) fail(`invalid help pool ${stage}`);
    for (const id of pool) if (!pack.characters.some(c => c.id === id && c.enabled)) fail(`unusable help preset ${id}`);
  }
  for (const team of pack.teams) if (team.members.length !== 4 || new Set(team.members).size !== 4 || team.members.some(id => !pack.characters.some(c => c.id === id))) fail(`invalid team ${team.number}`);
  return pack;
}

export function validateLoadout(loadout: Loadout, weapons: Map<string, WeaponProfile>, requireEnabled = true): void {
  if (!loadout || !Array.isArray(loadout.main) || !Array.isArray(loadout.sub)) fail('missing loadout');
  for (const slot of ['main', 'sub'] as const) {
    if (loadout[slot].length !== 4) fail(`${slot} requires exactly four slots`);
    const equipped = loadout[slot].filter(id => id !== 'none');
    if (new Set(equipped).size !== equipped.length) fail(`${slot} contains duplicate equipped weapon`);
    for (const id of loadout[slot]) {
      if (id === 'none') continue;
      const w = weapons.get(id);
      if (!w || (requireEnabled && !w.enabled)) return fail(`unknown/disabled loadout weapon ${id}`);
      if (requireEnabled && w.dependencies.length && !w.dependencies.some(d => [...loadout.main, ...loadout.sub].includes(d))) fail(`dependency missing ${id}`);
    }
  }
}

/** Checks active MAIN/SUB and weapon-dependent special selection without charging AP. */
export function validateWeaponAction(pack: ContentPack, loadout: Loadout, main: string, sub: string, specialWeaponId?: string): string[] {
  const errors: string[] = [];
  const ids = [...loadout.main, ...loadout.sub];
  for (const [slot, id] of [['main', main], ['sub', sub]] as const) {
    if (id === 'none') continue;
    const w = pack.weapons.find(w => w.id === id);
    if (!w || !w.enabled || !loadout[slot].includes(id)) errors.push(`illegal ${slot} weapon ${id}`);
    else {
      if (w.requiredSlots === 2 && (slot !== 'main' || sub !== 'none')) errors.push(`two-slot weapon ${id} occupies MAIN and SUB`);
      if (w.dependencies.length && !w.dependencies.some(d => ids.includes(d))) errors.push(`dependency missing ${id}`);
    }
  }
  if (specialWeaponId) {
    const w = pack.weapons.find(w => w.id === specialWeaponId);
    if (!w || !w.enabled || !w.options?.specialAction || !ids.includes(specialWeaponId)) errors.push(`unavailable special ${specialWeaponId}`);
    else if (w.dependencies.length && !w.dependencies.some(d => d === main || d === sub)) errors.push(`active dependency missing ${specialWeaponId}`);
  }
  return errors;
}
