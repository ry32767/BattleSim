import { describe, expect, it } from 'vitest';
import { baseContent } from '@battle/content';
import { compileMatch, hashJSON, projectState, resolveTurn, updateObservations, validatePlan } from '@battle/engine';
import { cellPoint, exactPoint, getSurface, traceLine, generateSolids } from '../../packages/engine/src/geometry';
import { weaponAfterFire, weaponAttack, weaponCommand, weaponCurveClear, weaponMoveExtraCost, weaponTick, weaponValidateCommand } from '../../packages/engine/src/weapon-actions';
import { extraContacts } from '../../packages/engine/src/extra-effects';
import { fixtureContent, fixtureMap, fixtureRoster } from '../fixtures/battle';
import type { BattleState, Command, UnitState } from '@battle/contracts';

const pack = baseContent;
const profile = (number: number) => pack.weapons.find(weapon => weapon.id === `trigger_${String(number).padStart(2, '0')}`)!;
function start() {
  const state = compileMatch(fixtureMap(12, 8), fixtureContent, { A: fixtureRoster, B: fixtureRoster }, 12345);
  const a = state.units.find(unit => unit.id === 'A-01-01')!; const b = state.units.find(unit => unit.id === 'B-01-01')!;
  state.units = [a, b]; a.surfaceId = 'c:0:0:ground'; b.surfaceId = 'c:3:0:ground';
  for (const unit of state.units) { unit.main = 'none'; unit.sub = 'none'; unit.ap = 30; unit.stats.ap = 30; unit.skills = []; }
  updateObservations(state, pack); return { state, a, b };
}
function arm(unit: UnitState, number: number) {
  const weapon = profile(number); const ids = [weapon.id, ...weapon.dependencies];
  unit.loadout = { main: [...ids, 'none', 'trigger_11', 'trigger_35', 'trigger_29', 'trigger_24'].slice(0, 4), sub: ['trigger_35', 'trigger_29', 'trigger_24', 'none'] };
  unit.main = weapon.id; unit.sub = weapon.dependencies[0] ?? 'none'; return weapon;
}
function special(state: BattleState, unit: UnitState, number: number, payload: Partial<Command> = {}, tick = 0) {
  arm(unit, number); const cmd: Command = { kind: 'SPECIAL', weaponId: profile(number).id, ...payload }; unit.activeCommand = cmd;
  return weaponCommand(state, unit, cmd, pack, tick);
}

describe('individual support weapon contracts', () => {
  it('ships all41 explicit enabled profiles for the dispatcher', () => { expect(pack.weapons.filter(profile => profile.enabled)).toHaveLength(41); });
  it('Escudo creates new two-layer solid with total durability300 and changes geometry immutably', () => {
    const { state, a } = start(); const original = state.map;
    const events = special(state, a, 7, { targetSurfaceId: 'c:1:0:ground' });
    expect(events[0].kind).toBe('WEAPON_SPECIAL'); expect(a.ap).toBe(27); expect(a.readyAtTick).toBe(5);
    expect(state.map).not.toBe(original); expect(getSurface(original, 'c:1:0:ground')).toBeDefined();
    expect(getSurface(state.map, 'c:1:0:roof@2')?.z).toBe(2); expect(state.structures.reduce((total, item) => total + item.currentDurability, 0)).toBe(300);
    expect(traceLine(cellPoint({ q: 0, r: 0 }, 0, 560000), cellPoint({ q: 2, r: 0 }, 0, 560000), generateSolids(state.map, state.structures)).clear).toBe(false);
  });
  it('Escudo lifts an occupied target and skill09 drains AP without invented HP damage', () => {
    const { state, a, b } = start(); b.surfaceId = 'c:1:0:ground'; updateObservations(state, pack);
    a.skills = [pack.effects.find(effect => effect.kind === 'escudo-hit')!.id];
    const events = special(state, a, 7, { targetSurfaceId: b.surfaceId });
    expect(events.some(event => event.reasonCode === 'ESCUDO_ATTACK')).toBe(true); expect(b.surfaceId).toBe('c:1:0:roof@2'); expect(b.ap).toBe(27); expect(b.hp).toBe(100); expect(b.readyAtTick).toBe(5);
  });
  it('Chameleon cloaks for the current turn and expires when unequipped', () => {
    const { state, a } = start(); special(state, a, 8); expect(a.effectState.opticalCloak).toBe(true);
    state.absoluteTick = 1; weaponTick(state, pack, 1); expect(a.effectState.opticalCloak).toBe(true);
    a.main = 'none'; state.absoluteTick = 2; weaponTick(state, pack, 2); expect(a.effectState.opticalCloak).toBeUndefined();
  });
  it('Star-maker requires visual contact and gives a per-side one-turn mark', () => {
    const { state, a, b } = start(); const contact = state.observations.A.contacts.find(contact => contact.channel === 'visual')!;
    expect(special(state, a, 14, { contactId: contact.contactId })[0].kind).toBe('WEAPON_SPECIAL'); expect(b.effectState.markTeam).toBe('A'); expect(b.effectState.markUntilTurn).toBe(1);
    state.turn = 2; state.absoluteTick = 150; weaponTick(state, pack, 0); expect(b.effectState.markTeam).toBeUndefined();
    expect(special(state, a, 14, { contactId: b.id })[0].reasonCode).toBe('VISUAL_CONTACT_REQUIRED');
  });
  it('Spider and pistolSpider create bounded zones, add enemy moveAP, and keep the distinct costs', () => {
    const { state, a, b } = start(); expect(special(state, a, 15, { targetSurfaceId: 'c:1:0:ground' })[0].kind).toBe('WEAPON_SPECIAL');
    expect(a.ap).toBe(28); expect(weaponMoveExtraCost(state, b, 'c:1:0:ground')).toBe(1); expect(weaponMoveExtraCost(state, a, 'c:1:0:ground')).toBe(0);
    for (let index = 1; index < 6; index++) special(state, a, 15, { targetSurfaceId: 'c:1:0:ground' }, index * 5);
    expect(special(state, a, 15, { targetSurfaceId: 'c:1:0:ground' }, 30)[0].reasonCode).toBe('WIRE_ZONE_LIMIT');
    const second = start(); special(second.state, second.a, 16); expect(second.a.ap).toBe(29);
  });
  it('Timer attaches a ten-tick Meteor fuse and delays modifiedHound rather than becoming a no-op', () => {
    const { state, a, b } = start(); special(state, a, 19); const modified = weaponAttack(state, a, b, profile(29), pack, 5).synthetic!;
    expect(modified.options!.fuse).toBe(10); weaponAfterFire(a, modified); expect(a.effectState.timerFuseTicks).toBeUndefined();
    special(state, a, 19); expect(a.effectState.timerHoundReady).toBe(true); expect(a.readyAtTick).toBeGreaterThanOrEqual(10);
    const hound = weaponAttack(state, a, b, profile(24), pack, 10); expect(hound.synthetic!.options!.timerDelayed).toBe(true); weaponAfterFire(a, hound.synthetic!); expect(a.effectState.timerHoundReady).toBeUndefined();
  });
  it('Beacon emits only anonymous radar contacts, is limited to3 activations, and expires on execution time', () => {
    const { state, a } = start();
    for (let index = 0; index < 3; index++) expect(special(state, a, 20, { targetSurfaceId: 'c:1:0:ground' }, index * 5)[0].kind).toBe('WEAPON_SPECIAL');
    expect(special(state, a, 20)[0].reasonCode).toBe('USE_LIMIT');
    const contacts = extraContacts(state, 'B', pack); expect(contacts).toHaveLength(3); expect(JSON.stringify(contacts)).not.toContain(a.id); expect(contacts.every(contact => contact.channel === 'radar' && contact.name === undefined && contact.hp === undefined)).toBe(true);
    state.absoluteTick = 150; weaponTick(state, pack, 0); expect(extraContacts(state, 'B', pack)).toHaveLength(0);
  });
  it('Teleporter costs3 and ten ticks, respects known range and empty destinations', () => {
    const { state, a, b } = start(); const before = a.ap;
    expect(special(state, a, 21, { targetSurfaceId: b.surfaceId })[0].reasonCode).toBe('DESTINATION_UNAVAILABLE'); expect(a.ap).toBe(before);
    expect(special(state, a, 21, { targetSurfaceId: 'c:4:0:ground' })[0].kind).toBe('WEAPON_SPECIAL'); expect(a.surfaceId).toBe('c:4:0:ground'); expect(a.ap).toBe(27); expect(a.readyAtTick).toBe(10);
    expect(weaponValidateCommand(state, a, { kind: 'SPECIAL', weaponId: profile(21).id, targetSurfaceId: 'secret' }, pack)).toContain('UNKNOWN_SURFACE');
  });
  it.each([17, 18, 34, 37])('support option trigger_%i prepares a compatible blade and is consumed on actual fire', number => {
    const { state, a, b } = start(); const prepared = arm(a, number); special(state, a, number);
    const blade = pack.weapons.find(profile => profile.id === prepared.dependencies[0])!;
    const modifier = weaponAttack(state, a, b, blade, pack, 5); expect(modifier.powerBp).toBe(Number(prepared.options!.powerBp));
    if (number === 37) expect(modifier.synthetic!.range).toBe(4);
    expect(a.effectState.weaponPrepared).toBe(prepared.id); weaponAfterFire(a, modifier.synthetic ?? blade); expect(a.effectState.weaponPrepared).toBeUndefined();
  });
  it('Mako draws the deterministic injected xorshift, records it, and applies next-blade power once', () => {
    const first = start(); const second = start(); const a = special(first.state, first.a, 41); const b = special(second.state, second.a, 41);
    expect(a[0].random).toEqual(b[0].random); expect(first.state.rngState).toBe(second.state.rngState); expect(a[0].random!.purpose).toBe('mako-power');
    const modifier = weaponAttack(first.state, first.a, first.b, profile(35), pack, 10); expect(modifier.powerBp).toBeGreaterThanOrEqual(8000); expect(modifier.powerBp).toBeLessThanOrEqual(18000);
    weaponAfterFire(first.a, profile(35)); expect(first.a.effectState.weaponPowerBp).toBeUndefined();
  });
  it('Idaten follows a predefined adjacent path with one-tick reservations and corner vulnerability', () => {
    const { state, a } = start(); const path = ['c:1:0:ground', 'c:1:-1:ground', 'c:2:-1:ground'];
    expect(special(state, a, 40, { path })[0].kind).toBe('WEAPON_SPECIAL'); expect(a.ap).toBe(26);
    const events = [];
    for (let tick = 1; tick <= 8; tick++) {
      state.absoluteTick = tick; events.push(...weaponTick(state, pack, tick));
      if (a.pendingMove && a.pendingMove.completesAtTick <= tick) { a.surfaceId = a.pendingMove.to; a.pendingMove = null; }
    }
    expect(a.surfaceId).toBe(path.at(-1)); expect(events.filter(event => event.kind === 'IDATEN_MOVE')).toHaveLength(3); expect(Number(a.effectState.idatenCornerUntil)).toBeGreaterThan(0);
    const other = start(); expect(special(other.state, other.a, 40, { path: ['c:4:0:ground'] })[0].reasonCode).toBe('INVALID_IDATEN_PATH');
  });
});

describe('distinct programmed and special projectile profiles', () => {
  it('modifiedHound recomputes an explicit curved route from current visible target position', () => {
    const { state, a, b } = start(); const first = weaponAttack(state, a, b, profile(24), pack, 0).aimWaypoints!;
    expect(first).toHaveLength(2); b.surfaceId = 'c:3:1:ground'; const second = weaponAttack(state, a, b, profile(24), pack, 5).aimWaypoints!;
    expect(second.at(-1)).not.toEqual(first.at(-1)); expect(exactPoint(first[0]).z).toBeGreaterThan(560000n);
  });
  it.each([26, 27])('Viper trigger%i requires explicit points, never substitutes a straight line, and traces each segment', number => {
    const { state, a, b } = start(); const weapon = arm(a, number);
    expect(weaponAttack(state, a, b, weapon, pack, 0).synthetic!.attackAp).toBeNull();
    a.activeCommand = { kind: 'FIRE_AT', aim: cellPoint({ q: 3, r: 0 }, 0, 490000), waypoints: [cellPoint({ q: 1, r: -1 }, 0, 560000), cellPoint({ q: 2, r: -1 }, 0, 560000)] };
    const curve = weaponAttack(state, a, b, weapon, pack, 0).aimWaypoints!; expect(curve).toHaveLength(3); expect(weaponCurveClear(state, a, curve)).toBe(true);
    special(state, a, 7, { targetSurfaceId: 'c:1:-1:ground' }); expect(weaponCurveClear(state, a, curve)).toBe(false);
  });
  it('grenade and rifle Meteor retain separate blast budgets and speed; grenade travels over its explicit arc', () => {
    const { state, a, b } = start(); const grenade = weaponAttack(state, a, b, profile(30), pack, 0); const rifle = weaponAttack(state, a, b, profile(31), pack, 0);
    expect(grenade.synthetic!.options!.blastBudget).toBe(14); expect(rifle.synthetic!.options!.blastBudget).toBe(10); expect(profile(29).options!.blastBudget).toBe(12);
    expect(grenade.synthetic!.options!.projectileSpeed).not.toBe(rifle.synthetic!.options!.projectileSpeed); expect(grenade.aimWaypoints).toHaveLength(2); expect(rifle.aimWaypoints).toBeUndefined();
    expect(exactPoint(grenade.aimWaypoints![0]).z).toBeGreaterThan(2800000n);
  });
  it('standard and customLead enforce firearm compatibility, zeroHP power and actual three-use custom limit', () => {
    const { state, a, b } = start(); special(state, a, 38); const lead = weaponAttack(state, a, b, profile(32), pack, 5);
    expect(lead.lead).toBe(true); expect(lead.synthetic!.basePower).toBe(0); expect(lead.synthetic!.requiredSlots).toBe(2); expect(lead.synthetic!.guardable).toBe(false);
    expect(weaponAttack(state, a, b, profile(35), pack, 5).lead).toBeUndefined(); weaponAfterFire(a, lead.synthetic!);
    for (let use = 0; use < 3; use++) {
      expect(special(state, a, 39)[0].kind).toBe('WEAPON_SPECIAL'); const shot = weaponAttack(state, a, b, profile(3), pack, 5).synthetic!; weaponAfterFire(a, shot);
    }
    expect(special(state, a, 39)[0].reasonCode).toBe('USE_LIMIT'); expect(a.effectState['weaponUses:trigger_39']).toBe(3);
  });
  it('public projection and phantom contacts contain no newly generated true unit IDs', () => {
    const { state, a } = start(); special(state, a, 20); const bytes = JSON.stringify({ state: projectState(state, 'B'), contacts: extraContacts(state, 'B', pack) });
    expect(bytes).not.toContain('phantom-A-01-01'); expect(extraContacts(state, 'B', pack)[0].contactId).not.toContain(a.id);
  });
});

const integrationContent = { ...fixtureContent, version: 'individual-weapons-integration', weapons: [...fixtureContent.weapons, ...pack.weapons], effects: pack.effects };
function integrated() {
  const result = start(); result.state.manifest = { ...result.state.manifest, contentVersion: integrationContent.version, hashes: { ...result.state.manifest.hashes, content: hashJSON(integrationContent) } };
  result.a.mainDirection = 0; result.a.subDirection = 0; result.b.mainDirection = 180; result.b.subDirection = 180;
  for (const team of ['A', 'B'] as const) { result.state.observations[team].contacts = []; result.state.observations[team].contactLinks = {}; result.state.observations[team].nextContactNumber = 1; }
  updateObservations(result.state, integrationContent); return result;
}
describe('weapon dispatch through the full integer-tick resolver', () => {
  it('builds Escudo from accepted SPECIAL input and records the projected terrain update', () => {
    const { state, a } = integrated(); arm(a, 7); a.sub = 'none';
    const plan = { unitId: a.id, planRevision: 0, commands: [{ kind: 'SPECIAL' as const, weaponId: profile(7).id, effectId: profile(7).id, targetSurfaceId: 'c:1:0:ground' }] };
    expect(validatePlan(state, plan, integrationContent).ok).toBe(true);
    const resolution = resolveTurn(state, [plan], integrationContent);
    expect(resolution.frames.find(frame => frame.tick === 0)!.state.geometryRevision).toBe(1); expect(resolution.fullEvents.some(event => event.reasonCode === 'ESCUDO')).toBe(true);
    expect(resolution.frames.find(frame => frame.tick === 0)!.views.A.map.cells.find(cell => cell.id === 'c:1:0')!.roofHeight).toBe(2);
  });
  it('enforces cloak before automatic targeting and restores visibility on the exact unequip tick', () => {
    const { state, a, b } = integrated(); arm(a, 8); a.sub = 'none'; arm(b, 2); b.sub = 'none'; a.hp = 1;
    const resolution = resolveTurn(state, [{ unitId: a.id, planRevision: 0, commands: [{ kind: 'SPECIAL', weaponId: profile(8).id, effectId: profile(8).id }, { kind: 'WAIT', main: 'none' }] }], integrationContent);
    expect(resolution.fullEvents.filter(event => event.kind === 'FIRE' && event.actorId === b.id)[0].tick).toBe(5);
    expect(resolution.frames.find(frame => frame.tick === 0)!.state.units.find(unit => unit.id === a.id)!.alive).toBe(true);
  });
  it('charges Spider extraAP through normal MOVE instead of only exposing metadata', () => {
    const { state, a, b } = integrated(); arm(a, 15); a.sub = 'none'; b.surfaceId = 'c:2:0:ground'; updateObservations(state, integrationContent);
    const resolution = resolveTurn(state, [{ unitId: a.id, planRevision: 0, commands: [{ kind: 'SPECIAL', weaponId: profile(15).id, effectId: profile(15).id, targetSurfaceId: 'c:1:0:ground' }] }, { unitId: b.id, planRevision: 0, commands: [{ kind: 'MOVE', path: ['c:1:0:ground'] }] }], integrationContent);
    const move = resolution.fullEvents.find(event => event.kind === 'MOVE_BEGIN' && event.actorId === b.id)!;
    expect(move.apBefore! - move.apAfter!).toBe(2); expect(resolution.nextState.units.find(unit => unit.id === b.id)!.surfaceId).toBe('c:1:0:ground');
  });
  it('launches the grenade along explicit waypoints with its own blastBudget and retained profile', () => {
    const { state, a, b } = integrated(); arm(a, 30); a.sub = 'none'; b.surfaceId = 'c:5:0:ground'; updateObservations(state, integrationContent);
    const resolution = resolveTurn(state, [], integrationContent); const projectile = resolution.frames.find(frame => frame.tick === 0)!.state.projectiles[0];
    expect(projectile).toBeDefined(); expect(projectile.budget).toBe(14 * a.stats.trion * a.stats.trion); expect(projectile.waypoints).toHaveLength(2); expect(projectile.profile!.options!.blastBudget).toBe(14);
  });
  it('executes Idaten one-tick reservations to the fixed path terminus', () => {
    const { state, a } = integrated(); arm(a, 40); a.main = 'trigger_40'; a.sub = 'trigger_35';
    const path = ['c:1:0:ground', 'c:1:-1:ground', 'c:2:-1:ground'];
    const resolution = resolveTurn(state, [{ unitId: a.id, planRevision: 0, commands: [{ kind: 'SPECIAL', weaponId: profile(40).id, effectId: profile(40).id, path }] }], integrationContent);
    expect(resolution.nextState.units.find(unit => unit.id === a.id)!.surfaceId).toBe(path.at(-1)); expect(resolution.fullEvents.filter(event => event.kind === 'IDATEN_MOVE')).toHaveLength(3);
  });
  it('projects enemy weapon events with side-local IDs and no internal identity in the raw disclosed bytes', () => {
    const { state, a, b } = integrated(); arm(b, 7); b.sub = 'none';
    const resolution = resolveTurn(state, [{ unitId: b.id, planRevision: 0, commands: [{ kind: 'SPECIAL', weaponId: profile(7).id, effectId: profile(7).id, targetSurfaceId: 'c:3:1:ground' }] }], integrationContent);
    const frame = resolution.frames.find(frame => frame.tick === 0)!;
    expect(frame.teamEvents.A.some(event => event.actorId?.startsWith('contact-A-'))).toBe(true);
    expect(JSON.stringify({ state: frame.views.A, events: frame.teamEvents.A })).not.toContain(b.id);
    expect(frame.teamEvents.A.every(event => event.id.startsWith('A:'))).toBe(true); expect(frame.views.A.units[0].id).toBe(a.id);
  });
});
