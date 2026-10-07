import type { ContentPack } from '../../contracts/src/index';

export const C2_COEFFICIENTS = {
  ibisPenetrationBudget: 12,
  ibisLocalFractureCoefficient: 500000,
  meteorBlastBudget: 26,
  baselineMeteorBlastBudget: 12,
} as const;

export const C2_CALIBRATION_RECORD = {
  id: 'C2-U-D1-U-D2', version: 'C2.0-calibrated', baselineVersion: 'C1.0-sandbox',
  evaluatedAt: '2026-10-06', scope: 'project-fixture-targets-only',
  ruleVersion: 'R1.3', materials: { residential: 300, industrial: 600, reinforced: 1200 },
  fixtureHashes: {
    residential: '94d01df695b33a34376873895c5fd6303e9daf4dad7ef7fac92ff6b28cadfa59',
    mall: 'b171fbe7a33d9d5beb6093bbadba0eafd8f52c4e17ac81037d199d6741a21b50',
  },
  coefficients: C2_COEFFICIENTS,
  conditions: { seed: 19, chargeBp: 10000, blastBp: 10000, divisionCount: 1, residentialMinimum: .75, mallMinimum: .4, mallMaximum: .6, ibisGeometry: 'exact finite fracture cylinder', ibisTerrainRay: 'clicked aim supplies direction; stop at horizontal profile range, first body, or exhausted penetration budget' },
  baseline: {
    residentialT6: { initialElements: 8, removedElements: 4, remainingElements: 4, targetMet: false },
    residentialT25: { initialElements: 8, removedElements: 8, remainingElements: 0, targetMet: true },
    mallT6: { initialElements: 108, removedElements: 0, remainingElements: 108, targetMet: false },
    mallT25: { initialElements: 108, removedElements: 18, remainingElements: 90, targetMet: false },
  },
  calibrated: {
    residentialT6: { initialElements: 8, removedElements: 4, remainingElements: 4, targetMet: false },
    residentialT25: { initialElements: 8, removedElements: 8, remainingElements: 0, targetMet: true },
    mallT6: { initialElements: 108, removedElements: 0, remainingElements: 108, targetMet: false },
    mallT25: { initialElements: 108, removedElements: 51, remainingElements: 57, targetMet: true },
  },
  validationCaseIds: ['U-D1-C2-residential-T25', 'U-D2-C2-mall-T25', 'U-D1-C2-T6-control', 'U-D2-C2-T6-control'],
  rationale: 'Unchanged independent fixtures and material durability; preserve passing Ibis B1 values and tune one shared Meteor budget scale. No character or fixture branches.',
  limitations: ['These are project fixture acceptance targets, not official manga scale measurements', 'C1 character values and unknown normal skill ownership remain unchanged'],
} as const;

/** A new content version changes profile coefficients, leaving C1 and R1.3 intact. */
export function createCalibratedContent(base: ContentPack): ContentPack {
  if (base.version !== 'C1.0-sandbox' || base.calibrated !== false) throw new Error('C2 requires an unchanged C1 B1 baseline');
  const result = structuredClone(base);
  result.version = C2_CALIBRATION_RECORD.version; result.calibrated = true;
  for (const profile of result.weapons) {
    if (profile.powerModel === 'ibis') {
      profile.options = { ...profile.options, penetrationBudget: C2_COEFFICIENTS.ibisPenetrationBudget, localFractureCoefficient: C2_COEFFICIENTS.ibisLocalFractureCoefficient };
    } else if (profile.powerModel === 'meteor') {
      const baselineBudget = profile.options?.blastBudget;
      if (!Number.isSafeInteger(baselineBudget) || Number(baselineBudget) < 1) throw new Error(`Missing B1 Meteor coefficient ${profile.id}`);
      profile.options = { ...profile.options, blastBudget: Math.round(Number(baselineBudget) * C2_COEFFICIENTS.meteorBlastBudget / C2_COEFFICIENTS.baselineMeteorBlastBudget) };
    } else continue;
    profile.referenceIds = [...new Set([...(profile.referenceIds ?? []), C2_CALIBRATION_RECORD.id])];
    profile.rationale = `${profile.rationale ?? ''} C2校正: 独立fixtureのプロジェクト目標を満たす共通係数。原作実寸の観測値ではない。`;
  }
  return result;
}
