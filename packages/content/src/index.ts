import type { BattleMap, ContentPack, Roster, Stage, Team } from '../../contracts/src/index';
import runtimePack from '../../../data/runtime/content-pack.json';
import baselinePack from '../../../data/runtime/content-pack-b1.json';
import mapI from '../../../data/maps/M1.2/city-I.json';
import mapII from '../../../data/maps/M1.2/city-II.json';
import mapIII from '../../../data/maps/M1.2/city-III.json';
import manifestData from '../../../data/runtime/manifest.json';
import restrictionData from '../../../data/runtime/preset-restrictions.json';
import { compileContent } from './compiler';
export { compileContent, validateLoadout, validateWeaponAction, EFFECT_KINDS } from './compiler';
export { createCalibratedContent, C2_COEFFICIENTS, C2_CALIBRATION_RECORD } from './calibration';

export const baseContent: ContentPack = compileContent(baselinePack);
export const content: ContentPack = compileContent(runtimePack);
export const maps: Record<Stage, BattleMap> = { I: mapI as BattleMap, II: mapII as BattleMap, III: mapIII as BattleMap };
export const catalogManifest = manifestData;
export const presetRestrictions = restrictionData;
export function defaultRoster(stage: Stage, team: Team = 'A'): Roster {
  const count = { I: 1, II: 2, III: 4 }[stage];
  const pool = content.helpPools[stage];
  const start = team === 'A' ? 0 : Math.max(0, pool.length-count);
  return { base: ['char_27-training', 'char_28-training', 'char_26-training', 'char_35-training'], help: pool.slice(start,start+count), changes: [] };
}
