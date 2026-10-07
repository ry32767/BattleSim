import type { BattleEvent } from '@battle/contracts';
const kinds: Record<string,string> = {
  RADAR_DETECT:'レーダーに反応', VISUAL_DETECT:'目視で確認', CONTACT_LOST:'接触を喪失',
  COMMAND_START:'行動開始', MOVE_RESERVE:'移動開始', MOVE_LAND:'移動完了', MOVE_CONFLICT:'移動競合', MOVE_SKIP:'重複マスを通過', MOVE_STOP:'移動中断', MOVE_CANCEL_TERRAIN:'地形による移動中断', FIRE:'攻撃', ATTACK_CANCEL:'攻撃中断', ATTACK_WAIT:'攻撃の待ち', MISS:'攻撃が外れた', EVADE:'回避', DEFEND:'防御', DAMAGE:'被害', BLAST_DAMAGE:'爆発による被害', DEFEAT:'ベイルアウト', GUARD_REDIRECT:'味方を護衛', FOLLOWUP_PREPARED:'追撃準備', PROJECTILE_FIRE:'弾を発射', PROJECTILE_FUSE:'時限起爆待ち', PROJECTILE_DISCARD:'試合末に弾を終了', DETONATE:'起爆', IBIS_TRACE:'貫通射撃', TERRAIN_CHANGE:'地形の変化', FORCED_FALL:'足場を失い下降', WEAPON_SPECIAL:'装備アクション', SPECIAL_CANCEL:'固有行動中断', LEAD_READY:'鉛弾の準備', SYNTHESIS_READY:'合成弾の準備', VERSATILE_SELECT:'適正を選択', CURVED_SHOT_READY:'曲折経路の準備', DECOY_DEBUFF:'攻撃者の防御低下', IDATEN_MOVE:'韋駄天で移動', IDATEN_STOP:'韋駄天が中断', RANDOM:'命中・回避抽選', RANDOM_POWER:'威力抽選',
};
const reasons: Record<string,string> = {
  OCCUPIED_CONTINUE:'重複マスへの着地を省略して次の面へ移動', DEFAULT_HOLD:'設定した行動が終わり警戒を継続', OBSERVATION_CHANGED:'観測状態が変化',
  OCCUPIED_OR_CYCLE:'移動先の占有または循環する移動', TERRAIN_LOSS:'必要な足場が消失', DESTINATION_LOST:'移動先の足場が消失', NO_ROUTE:'移動できる経路がない', DEFEATED:'ベイルアウト済み', CONDITIONS_CHANGED:'射線・視認・射程などの条件が変化', AP_OR_EFFECT_UNAVAILABLE:'行動力または固有効果の条件を満たさない',
  AP_INSUFFICIENT:'行動力が不足', TURN_TIME_INSUFFICIENT:'ターン内に完了できない', SURFACE_OCCUPIED:'移動先が占有されている', DESTINATION_CONFLICT:'複数の駒が同じ面へ移動', MOVE_CYCLE:'循環する移動', MOVEMENT_STOPPED:'移動条件が変化', DESTINATION_UNAVAILABLE:'移動先を利用できない', MISSING_DEPENDENCY:'必要な装備を満たさない', VISUAL_CONTACT_REQUIRED:'現在の視認が必要', WAYPOINTS_REQUIRED:'経由点の設定が必要', CURVE_BLOCKED:'経由区間の射線が遮られた', USE_LIMIT:'使用回数の上限', WIRE_ZONE_LIMIT:'ワイヤー設置の上限', WEAPON_RANGE:'装備の射程外', WEAPON_NOT_OWNED:'装備を所持していない', UNKNOWN_SURFACE:'報告されていない面', UNKNOWN_OR_OUT_OF_RANGE_WAYPOINT:'経由点が未観測か射程外', DUAL_SHOOTER_REQUIRED:'適合する射手弾が両側に必要', INVALID_EFFECT_SELECTION:'選択した適正を利用できない', ESCUDO_ATTACK:'エスクードで足場を隆起', SIX_TURNS_COMPLETE:'6ターン完了', MATCH_END:'試合終了', SUPPORT_RAISED:'支持面が上昇', SPECIAL_EFFECT:'固有効果を適用',
};
export const eventTitle = (event: BattleEvent) => event.description && event.description !== event.kind ? event.description : kinds[event.kind] ?? event.kind;
export const eventReason = (event: BattleEvent) => reasons[event.reasonCode] ?? kinds[event.reasonCode] ?? event.reasonCode;
export function eventCategoryMatches(event: BattleEvent, category: string): boolean {
  const k=event.kind;
  return category==='all' || (category==='attack' ? /FIRE|ATTACK|MISS|IBIS_TRACE/.test(k) : category==='defend' ? /DEFEND|EVADE|GUARD/.test(k) : category==='damage' ? /DAMAGE|DECOY_DEBUFF/.test(k) : category==='defeat' ? /DEFEAT/.test(k) : category==='move' ? /MOVE|IDATEN|FORCED_FALL/.test(k) : category==='stop' ? /CANCEL|STOP|CONFLICT/.test(k) : category==='detect' ? /DETECT|CONTACT_LOST/.test(k) : false);
}
