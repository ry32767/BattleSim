import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { baseContent, content, compileContent, createCalibratedContent, C2_COEFFICIENTS, C2_CALIBRATION_RECORD } from '../../packages/content/src/index';
import { calibrationFixture } from '../fixtures/battle';
import { calibrationContent, measureCalibration } from '../fixtures/calibration';

const cases = [['residentialT6','residential',6],['residentialT25','residential',25],['mallT6','mall',6],['mallT25','mall',25]] as const;
const rawB1 = Object.fromEntries(cases.map(([id,kind,trion])=>[id,measureCalibration(kind,trion)]));
const actualB1 = Object.fromEntries(cases.map(([id,kind,trion])=>[id,measureCalibration(kind,trion,calibrationContent(baseContent))]));
const actualC2 = Object.fromEntries(cases.map(([id,kind,trion])=>[id,measureCalibration(kind,trion,calibrationContent(content))]));
const values = (measurement: ReturnType<typeof measureCalibration>) => ({ initialElements: measurement.initialElements, removedElements: measurement.removedElements, remainingElements: measurement.remainingElements, targetMet: measurement.targetMet });

describe('C2 project target calibration with preserved B1',()=>{
  it('retains raw B1 residential success and mall failure',()=>{
    expect(baseContent.version).toBe('C1.0-sandbox'); expect(baseContent.calibrated).toBe(false);
    for (const [id] of cases) {
      expect(values(rawB1[id]),id).toEqual(C2_CALIBRATION_RECORD.baseline[id]);
      expect(values(actualB1[id]),id).toEqual(values(rawB1[id]));
      expect(rawB1[id].calibrated).toBe(false);
    }
    expect(rawB1.mallT25.targetMet).toBe(false);
    expect(rawB1.residentialT25.targetMet).toBe(true);
  });
  it('U-D1/U-D2 uses actual C2 profiles and meets both T25 targets with T6 controls',()=>{
    expect(content.version).toBe('C2.0-calibrated'); expect(content.calibrated).toBe(true);
    const aliases = calibrationContent(content);
    for (const [alias,id] of [['ibis','trigger_01'],['meteor','trigger_29']]) expect(aliases.weapons.find(w=>w.id===alias)).toEqual({...content.weapons.find(w=>w.id===id)!,id:alias});
    for (const [id] of cases) expect(values(actualC2[id]),id).toEqual(C2_CALIBRATION_RECORD.calibrated[id]);
    expect(actualC2.residentialT25.removedVolumeRatio).toBeGreaterThanOrEqual(.75);
    expect(actualC2.mallT25.removedVolumeRatio).toBeGreaterThanOrEqual(.4);
    expect(actualC2.mallT25.removedVolumeRatio).toBeLessThanOrEqual(.6);
    expect(actualC2.mallT25.remainingElements).toBeGreaterThan(0);
    for (const kind of ['residential','mall']) expect(actualC2[`${kind}T6`].removedElements).toBeLessThan(actualC2[`${kind}T25`].removedElements);
  });
  it('preserves fixed fixture geometry and 300/600/1200 material contract',()=>{
    const residential = calibrationFixture('residential'), mall = calibrationFixture('mall');
    for (const [kind,fixture] of [['residential',residential],['mall',mall]] as const) expect(createHash('sha256').update(JSON.stringify(fixture)).digest('hex')).toBe(C2_CALIBRATION_RECORD.fixtureHashes[kind]);
    expect(residential.initialVolume).toBe(8); expect(mall.initialVolume).toBe(108);
    expect(new Set(residential.map.structures!.map(s=>s.maxDurability))).toEqual(new Set([300]));
    expect(new Set(mall.map.structures!.map(s=>s.maxDurability))).toEqual(new Set([1200]));
    expect(C2_CALIBRATION_RECORD.materials).toEqual({residential:300,industrial:600,reinforced:1200});
    for (const fixture of [residential,mall]) for (const structure of fixture.map.structures!) expect(structure.currentDurability).toBe(structure.maxDurability);
  });
  it('uses a shared Meteor scale, preserves character data and rejects false certification',()=>{
    expect(createCalibratedContent(baseContent)).toEqual(content);
    expect(content.characters).toEqual(baseContent.characters); expect(content.effects).toEqual(baseContent.effects);
    for (const weapon of baseContent.weapons.filter(w=>w.powerModel==='meteor')) expect(content.weapons.find(w=>w.id===weapon.id)!.options!.blastBudget).toBe(Math.round(Number(weapon.options!.blastBudget)*C2_COEFFICIENTS.meteorBlastBudget/C2_COEFFICIENTS.baselineMeteorBlastBudget));
    for (const bad of [
      {...structuredClone(baseContent),calibrated:true},
      {...structuredClone(content),calibrated:false},
      {...structuredClone(content),version:'C2-unmeasured'},
    ]) expect(()=>compileContent(bad)).toThrow(/Content compile/);
    const bad = structuredClone(content); bad.weapons.find(w=>w.id==='trigger_29')!.options!.blastBudget=12;
    expect(()=>compileContent(bad)).toThrow(/C2 Meteor/);
  });
});
