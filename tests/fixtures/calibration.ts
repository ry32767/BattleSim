import type { BattleState, ContentPack, TurnPlan } from '@battle/contracts';
import { compileMatch, resolveTurn, updateObservations } from '@battle/engine';
import { calibrationFixture, fixtureContent, fixtureRoster } from './battle';

/** Only profile identities are adapted; production numeric fields stay unchanged. */
export function calibrationContent(pack: ContentPack): ContentPack {
  const production = new Map([['ibis','trigger_01'],['meteor','trigger_29']]);
  return {
    ...structuredClone(fixtureContent), version: pack.version, calibrated: pack.calibrated,
    weapons: fixtureContent.weapons.map(profile => {
      const id = production.get(profile.id), actual = pack.weapons.find(w => w.id === id);
      if (id && !actual) throw new Error(`Missing calibration profile ${id}`);
      return actual ? { ...structuredClone(actual), id: profile.id } : structuredClone(profile);
    }),
  };
}

export function measureCalibration(kind: 'residential' | 'mall', trion: number, pack = fixtureContent): {
  initialElements: number; removedElements: number; remainingElements: number; removedVolumeRatio: number;
  targetMet: boolean; calibrated: boolean; state: BattleState;
} {
  const fixture = calibrationFixture(kind);
  const state = compileMatch(fixture.map, pack, { A: fixtureRoster, B: fixtureRoster }, 19);
  const actor = state.units[0]!;
  state.units = [actor]; actor.surfaceId = fixture.originSurface; actor.stats.trion = trion;
  actor.main = kind === 'residential' ? 'ibis' : 'meteor'; actor.sub = 'none';
  actor.mainDirection = 0; actor.subDirection = 0;
  updateObservations(state, pack); state.observations.A.visibleCells = [...state.observations.A.visibleCells, fixture.aimCell];
  const plan: TurnPlan = { unitId: actor.id, planRevision: 1, commands: [{ kind: 'FIRE_AT', slot: 'main', aim: fixture.aim, chargeBp: 10000, blastBp: 10000, divisionCount: 1 }] };
  const nextState = resolveTurn(state, [plan], pack).nextState;
  const removedElements = nextState.structures.filter(element => element.currentDurability === 0).length;
  const removedVolumeRatio = removedElements / fixture.initialVolume;
  return {
    initialElements: fixture.initialVolume, removedElements, remainingElements: fixture.initialVolume - removedElements,
    removedVolumeRatio, targetMet: kind === 'residential' ? removedVolumeRatio >= .75 : removedVolumeRatio >= .4 && removedVolumeRatio <= .6,
    calibrated: pack.calibrated, state: nextState,
  };
}
