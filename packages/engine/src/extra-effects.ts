import type { BattleEvent, BattleState, Command, Contact, ContentPack, EffectDefinition, Point3, Team, UnitState, WeaponProfile } from '@battle/contracts';
import { stableCompare } from '@battle/contracts';
import { cellPoint, getSurface, traceLine, generateSolids } from './geometry';
import { weaponAttack, weaponCommand } from './weapon-actions';

export const EXTRA_EFFECT_KINDS = ['decoy', 'lead-custom', 'lead-sniper', 'lead-hound', 'synthesis', 'versatile', 'curved-shot'];
type Modifier = { powerBp?: number; lead?: boolean; aimWaypoints?: Point3[]; synthetic?: WeaponProfile; guaranteedHit?: boolean };
type Phantom = { id: string; ownerId: string; team: Team; cellId: string; createdAt: number; expiresAt: number };
function effects(u: UnitState, content: ContentPack): EffectDefinition[] { return content.effects.filter(e => e.enabled && u.skills.includes(e.id)).sort((a, b) => a.priority - b.priority || stableCompare(a.id, b.id)); }
const cell = (state: BattleState, u: UnitState) => state.map.cells.find(c => c.surfaces.some(s => s.id === u.surfaceId))!;
function event(state: BattleState, u: UnitState, tick: number, kind: string, reason: string, description: string, target?: string): BattleEvent { return { id: `extra-${state.turn}-${tick}-${u.id}-${kind}`, turn: state.turn, tick: state.absoluteTick, groupId: `${tick}:command`, kind, actorId: u.id, targetId: target, reasonCode: reason, description, commandIndex: u.commandIndex }; }
function pay(state: BattleState, u: UnitState, tick: number, cost: number, wait: number, kind: string, text: string): BattleEvent[] {
  if (u.ap < cost) return [event(state, u, tick, 'SPECIAL_CANCEL', 'AP_INSUFFICIENT', '固有行動のAPが不足しています')];
  const before = u.ap; u.ap -= cost; u.readyAtTick = Math.max(u.readyAtTick, tick) + wait * 5;
  return [{ ...event(state, u, tick, kind, 'SPECIAL_EFFECT', text), apBefore: before, apAfter: u.ap }];
}
export function extraCommand(state: BattleState, u: UnitState, cmd: Command, content: ContentPack, tick: number): BattleEvent[] {
  const weaponEvents = weaponCommand(state, u, cmd, content, tick);
  if (cmd.kind !== 'SPECIAL' || !cmd.effectId) return weaponEvents;
  const e = effects(u, content).find(e => e.id === cmd.effectId); if (!e || !EXTRA_EFFECT_KINDS.includes(e.kind)) return weaponEvents;
  const cancel = (reason: string) => [event(state, u, tick, 'SPECIAL_CANCEL', reason, '固有行動の依存条件を満たしません')];
  if (e.kind.startsWith('lead-')) {
    const main = content.weapons.find(w => w.id === u.main), sub = content.weapons.find(w => w.id === u.sub);
    const compatible = e.kind === 'lead-sniper' ? main?.id === String(e.values.weapon) : e.kind === 'lead-hound' ? main?.family === 'ハウンド' : main?.options?.gunClass === 'pistol';
    if (!compatible || e.kind !== 'lead-custom' && ![main, sub].some(w => w?.family === '鉛弾')) return cancel('MISSING_DEPENDENCY');
    const key = `uses:${e.id}`, used = Number(u.effectState[key] ?? 0), max = e.kind === 'lead-custom' ? Number(e.values.maxUses ?? 3) : 1000;
    if (used >= max) return cancel('USE_LIMIT');
    const paid = pay(state, u, tick, Math.max(1, e.ap), e.wait, 'LEAD_READY', '鉛弾を準備しました。次の適合射撃でAP低下・回避封鎖を付与');
    if (paid[0]?.kind === 'SPECIAL_CANCEL') return paid;
    u.effectState.leadReady = e.id; u.effectState[key] = used + 1; return [...weaponEvents, ...paid];
  }
  if (e.kind === 'synthesis') {
    const main = content.weapons.find(w => w.id === u.main), sub = content.weapons.find(w => w.id === u.sub);
    const aliases: Record<string,string> = { 'アステロイド':'asteroid', 'ハウンド':'hound', 'バイパー':'viper', 'メテオラ':'meteor' };
    const allowed = String(e.values.allowedPairs ?? '').split(',');
    const pair = `${aliases[main?.family ?? '']}+${aliases[sub?.family ?? '']}`, reverse = pair.split('+').reverse().join('+');
    if (!main || !sub || main.options?.gunClass || sub.options?.gunClass || !['shot', 'blast'].includes(main.actionKind) || !['shot', 'blast'].includes(sub.actionKind) || main.requiredSlots !== 1 || sub.requiredSlots !== 1 || !allowed.includes(pair) && !allowed.includes(reverse)) return cancel('DUAL_SHOOTER_REQUIRED');
    if (Number(u.effectState.synthesisUses ?? 0) >= Number(e.values.maxUses ?? 2)) return cancel('USE_LIMIT');
    const paid = pay(state, u, tick, Math.max(2, e.ap), Math.max(1, e.wait), 'SYNTHESIS_READY', '両側の射手弾を合成。次のMAIN射撃へ合成プロフィールを適用');
    if (paid[0]?.kind === 'SPECIAL_CANCEL') return paid;
    u.effectState.synthesisMain = main.id; u.effectState.synthesisSub = sub.id; u.effectState.synthesisReady = true; u.effectState.synthesisUses = Number(u.effectState.synthesisUses ?? 0) + 1; return [...weaponEvents, ...paid];
  }
  if (e.kind === 'versatile') {
    const chosen = cmd.chosenEffectIds ?? [];
    const excluded = String(e.values.excluded ?? '').split(','), allowed = String(e.values.allowed ?? '').split(',');
    if (u.effectState.versatileSelected || !chosen.length || chosen.length > Number(e.values.maxSelections ?? 2) || new Set(chosen).size !== chosen.length || chosen.some(id => !allowed.includes(id) || excluded.includes(id) || !content.effects.some(e => e.id === id && e.enabled && !['versatile', 'synthesis', 'curved-shot'].includes(e.kind)))) return cancel('INVALID_EFFECT_SELECTION');
    // Acquired skills are explicit selections and last for this match, never inferred from names.
    const paid = pay(state, u, tick, Math.max(2, e.ap), e.wait, 'VERSATILE_SELECT', `選択した${chosen.length}種の技能を習得`);
    if (paid[0]?.kind === 'SPECIAL_CANCEL') return paid;
    u.skills = [...new Set([...u.skills, ...chosen])].sort(stableCompare); u.effectState.versatileSelected = chosen.join(','); return [...weaponEvents, ...paid];
  }
  if (e.kind === 'curved-shot') {
    const main = content.weapons.find(w => w.id === u.main);
    if (main?.family !== 'バイパー' || !cmd.waypoints?.length || cmd.waypoints.length > 8) return cancel('WAYPOINTS_REQUIRED');
    const position = cell(state, u), surface = getSurface(state.map, u.surfaceId)!;
    let start = cellPoint(position, surface.z, 560000);
    const solids = generateSolids(state.map, state.structures);
    for (const end of cmd.waypoints) { if (!traceLine(start, end, solids).clear) return cancel('CURVE_BLOCKED'); start = end; }
    const paid = pay(state, u, tick, Math.max(2, e.ap), e.wait, 'CURVED_SHOT_READY', `曲射の経由点${cmd.waypoints.length}個を設定`);
    if (paid[0]?.kind === 'SPECIAL_CANCEL') return paid;
    u.effectState.curvedWaypoints = JSON.stringify(cmd.waypoints); return [...weaponEvents, ...paid];
  }
  return weaponEvents;
}
export function extraAttack(state: BattleState, u: UnitState, target: UnitState | undefined, profile: WeaponProfile, content: ContentPack, tick: number): Modifier {
  const result = weaponAttack(state, u, target, profile, content, tick);
  if (u.effectState.leadReady) {
    const e = content.effects.find(e => e.id === u.effectState.leadReady);
    if (e) { result.lead = true; result.synthetic = { ...profile, basePower: 0, range: Number(e.values.range ?? profile.range), baseHit: Number(e.values.hit ?? profile.baseHit), guardable: false, defenseAp: null }; }
  }
  if (u.effectState.synthesisReady && profile.id === u.effectState.synthesisMain) {
    const sub = content.weapons.find(w => w.id === u.effectState.synthesisSub);
    if (sub) result.synthetic = { ...profile, id: `${profile.id}+${sub.id}`, name: `${profile.name}＋${sub.name}`, basePower: (profile.basePower ?? 0) + (sub.basePower ?? 0), range: Math.min(profile.range ?? 0, sub.range ?? 0), baseHit: Math.min(profile.baseHit ?? 100, sub.baseHit ?? 100), requiredSlots: 2, attackAp: Math.max(1, (profile.attackAp ?? 0) + (sub.attackAp ?? 0) - 1), waitUnits: Math.max(profile.waitUnits, sub.waitUnits), powerModel: profile.powerModel, options: { ...profile.options, synthetic: true } };
  }
  if (profile.family === 'バイパー' && u.effectState.curvedWaypoints) { try { result.aimWaypoints = JSON.parse(String(u.effectState.curvedWaypoints)); } catch { /* Invalid persistent data is not activated. */ } }
  return result;
}
export function extraDamage(state: BattleState, target: UnitState, flags: { lead?: boolean }, _content: ContentPack, _tick: number): void {
  if (flags.lead) { target.effectState.lead = true; target.effectState.leadExpiresAt = state.absoluteTick + 30; target.ap = Math.max(0, target.ap - 3); }
}
export function extraContacts(state: BattleState, team: Team, _content: ContentPack): Contact[] {
  const phantoms = (state.effects.decoys ?? []) as Phantom[];
  const key = `phantomLinks:${team}`;
  const links = (state.effects[key] ??= {}) as Record<string, string>;
  return phantoms.filter(p => p.team !== team && p.createdAt <= state.absoluteTick && p.expiresAt > state.absoluteTick).map(p => {
    // Public identifiers must never contain the phantom owner's true unit ID.
    const number = links[p.id] ??= `D${String(Object.keys(links).length + 1).padStart(2, '0')}`;
    return { contactId: `decoy-${team}-${number}`, number, reportedCell: p.cellId, observedAtTick: state.absoluteTick, channel: 'radar' as const, tag: '' };
  });
}
