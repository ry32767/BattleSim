import type { BattleEvent } from '@battle/contracts';
export type CombatEffect = 'shot' | 'slash' | 'shield' | 'evade' | 'damage' | 'blast' | 'activate';
/** Only called with already disclosed events and equipment. */
export function combatEffect(event: BattleEvent, actionKind?: string): CombatEffect | null {
  if (/CANCEL|STOP|CONFLICT|RANDOM|WAIT|RESERVE|BEGIN|LAND|DETECT|LOST|DISCARD/.test(event.kind)) return null;
  if (/FIRE|IBIS_TRACE/.test(event.kind)) return actionKind === 'melee' ? 'slash' : 'shot';
  if (/DEFEND|GUARD_REDIRECT/.test(event.kind)) return 'shield';
  if (event.kind === 'EVADE') return 'evade';
  if (/DAMAGE|DEFEAT/.test(event.kind)) return 'damage';
  if (/DETONATE|EXPLOSION/.test(event.kind)) return 'blast';
  if (event.kind === 'COMMAND_START' || /SPECIAL|READY|SELECT|ACTIVATE|IDATEN_MOVE/.test(event.kind) || event.apAfter !== undefined && event.apBefore !== undefined && event.apAfter < event.apBefore) return 'activate';
  return null;
}
