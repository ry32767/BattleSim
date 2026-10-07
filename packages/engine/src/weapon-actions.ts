import { stableCompare, type BattleEvent, type BattleState, type Command, type ContentPack, type Point3, type Team, type UnitState, type WeaponProfile } from '@battle/contracts';
import { cellPoint, exactPoint, generateSolids, getSurface, HEIGHT, hexDistance, interpolate, moveCost, rat, surfaceGraph, traceLine } from './geometry';

export type WeaponModifier = { powerBp?: number; lead?: boolean; aimWaypoints?: Point3[]; synthetic?: WeaponProfile; guaranteedHit?: boolean };
export type WireZone = { id: string; ownerId: string; team: Team; cellId: string; enemyMoveAp: number };
type Phantom = { id: string; ownerId: string; team: Team; cellId: string; createdAt: number; expiresAt: number };
const clone = <T>(value: T): T => structuredClone(value);
const option = (profile: WeaponProfile, key: string, fallback: number): number => typeof profile.options?.[key] === 'number' ? profile.options[key] as number : fallback;
function point(state: BattleState, unit: UnitState, offset = 560000): Point3 {
  const surface = getSurface(state.map, unit.surfaceId)!;
  return cellPoint(surfaceGraph(state.map).cells.get(surface.cellId)!, surface.z, offset);
}
function event(state: BattleState, unit: UnitState, tick: number, kind: string, reasonCode: string, details?: Record<string, unknown>): BattleEvent {
  return { id: `weapon:${state.turn}:${tick}:${unit.id}:${unit.commandIndex}:${kind}`, turn: state.turn, tick, groupId: `${tick}:command`, kind, actorId: unit.id, reasonCode, description: kind, commandIndex: unit.commandIndex, details };
}
function profileFor(cmd: Command, content: ContentPack): WeaponProfile | undefined {
  const id = cmd.weaponId ?? (cmd.effectId?.startsWith('trigger_') ? cmd.effectId : undefined);
  return content.weapons.find(profile => profile.id === id && profile.enabled);
}
function publicMap(state: BattleState, unit: UnitState) {
  return { ...state.map, cells: state.observations[unit.team].observedCells, structures: [] };
}
function validPoint(point: unknown): point is Point3 {
  if (!point || typeof point !== 'object') return false;
  const value = point as Point3;
  return [value.x, value.y, value.z].every(part => typeof part === 'string' && part.length <= 40 && /^-?(0|[1-9]\d*)$/u.test(part)) && (value.denominator === undefined || typeof value.denominator === 'string' && value.denominator.length <= 40 && /^[1-9]\d*$/u.test(value.denominator));
}
function containingCell(state: BattleState, unit: UnitState, value: Point3): string | undefined {
  const p = exactPoint(value);
  return state.observations[unit.team].observedCells.find(cell => {
    const center = exactPoint(cellPoint(cell, 0)); const dx = p.x - center.x * p.d; const dy = p.y - center.y * p.d;
    const ax = dx < 0n ? -dx : dx; const ay = dy < 0n ? -dy : dy;
    return ax <= 1732051n * p.d && 1000000n * ax + 1732051n * ay <= 3464102000000n * p.d;
  })?.id;
}
function routeErrors(state: BattleState, unit: UnitState, values: Point3[] | undefined, maxRange: number): string[] {
  if (!values?.length || values.length > 8 || values.some(value => !validPoint(value))) return ['WAYPOINTS_REQUIRED'];
  const known = publicMap(state, unit); const origin = getSurface(known, unit.surfaceId); if (!origin) return ['UNKNOWN_POSITION'];
  const originCell = known.cells.find(cell => cell.id === origin.cellId)!;
  for (const value of values) {
    const id = containingCell(state, unit, value); const cell = known.cells.find(cell => cell.id === id);
    if (!cell || hexDistance(originCell, cell) > maxRange) return ['UNKNOWN_OR_OUT_OF_RANGE_WAYPOINT'];
  }
  return [];
}

/** Input checks use observed geometry; hidden occupancy is checked only at execution. */
export function weaponValidateCommand(state: BattleState, unit: UnitState, cmd: Command, content: ContentPack): string[] {
  if (cmd.kind !== 'SPECIAL' || !(cmd.weaponId || cmd.effectId?.startsWith('trigger_'))) {
    if (cmd.waypoints) return routeErrors(state, unit, cmd.waypoints, content.weapons.find(w => w.id === (cmd.main ?? unit.main))?.range ?? 8);
    return [];
  }
  const profile = profileFor(cmd, content);
  if (!profile || ![...unit.loadout.main, ...unit.loadout.sub].includes(profile.id)) return ['WEAPON_NOT_OWNED'];
  const action = profile.options?.specialAction;
  if (typeof action !== 'string') return ['NO_WEAPON_COMMAND'];
  if (profile.dependencies.length && !profile.dependencies.some(id => [...unit.loadout.main, ...unit.loadout.sub].includes(id))) return ['MISSING_DEPENDENCY'];
  const map = publicMap(state, unit); const from = getSurface(map, unit.surfaceId)!;
  if (['escudo', 'spider', 'beacon', 'teleport'].includes(action)) {
    const to = getSurface(map, cmd.targetSurfaceId ?? unit.surfaceId);
    if (!to) return ['UNKNOWN_SURFACE'];
    const graph = surfaceGraph(map);
    if (hexDistance(graph.cells.get(from.cellId)!, graph.cells.get(to.cellId)!) > option(profile, 'range', 4)) return ['WEAPON_RANGE'];
    if (action === 'escudo' && map.cells.find(cell => cell.id === to.cellId)?.buildingId) return ['ESCUDO_REQUIRES_OPEN_CELL'];
  }
  if (action === 'star-maker' && !state.observations[unit.team].contacts.some(contact => contact.contactId === cmd.contactId && contact.channel === 'visual')) return ['VISUAL_CONTACT_REQUIRED'];
  if (action === 'idaten') {
    if (!cmd.path?.length || cmd.path.length > option(profile, 'maxSteps', 5)) return ['IDATEN_PATH_LIMIT'];
    let previous = from;
    for (const id of cmd.path) {
      const next = getSurface(map, id);
      if (!next || hexDistance(surfaceGraph(map).cells.get(previous.cellId)!, surfaceGraph(map).cells.get(next.cellId)!) !== 1 || moveCost(previous, next) === null) return ['INVALID_IDATEN_PATH'];
      previous = next;
    }
  }
  if (cmd.waypoints) return routeErrors(state, unit, cmd.waypoints, 12);
  return [];
}

export function weaponCommand(state: BattleState, unit: UnitState, cmd: Command, content: ContentPack, tick: number): BattleEvent[] {
  if (unit.effectState.opticalCloak && unit.main !== 'trigger_08' && unit.sub !== 'trigger_08') delete unit.effectState.opticalCloak;
  if (cmd.kind !== 'SPECIAL' || !(cmd.weaponId || cmd.effectId?.startsWith('trigger_'))) return [];
  const profile = profileFor(cmd, content);
  const cancel = (reason: string) => [event(state, unit, tick, 'SPECIAL_CANCEL', reason)];
  const errors = weaponValidateCommand(state, unit, cmd, content); if (errors.length || !profile) return cancel(errors[0] ?? 'WEAPON_NOT_OWNED');
  const action = String(profile.options?.specialAction);
  if (!['escudo', 'chameleon', 'star-maker', 'spider', 'timer', 'beacon', 'teleport', 'thruster', 'genyo', 'senku', 'lead', 'lead-custom', 'idaten', 'mako'].includes(action)) return cancel('UNSUPPORTED_WEAPON_ACTION');
  let cost = option(profile, 'ap', 1); let wait = option(profile, 'wait', 1);
  for (const effect of content.effects.filter(e => e.enabled && unit.skills.includes(e.id))) {
    if (effect.kind === 'option-ap' && effect.values.weapon === profile.id) cost = Math.max(0, cost + Number(effect.values.amount ?? 0));
    if (effect.kind === 'option-wait' && effect.values.weapon === profile.id) wait = Math.ceil(wait / Number(effect.values.divisor ?? 1));
  }
  if (!unit.alive || unit.ap < cost) return cancel('AP_INSUFFICIENT');
  const target = getSurface(state.map, cmd.targetSurfaceId ?? unit.surfaceId);
  const current = getSurface(state.map, unit.surfaceId)!;
  if (['escudo', 'spider', 'beacon', 'teleport'].includes(action) && !target) return cancel('DESTINATION_UNAVAILABLE');
  if (action === 'teleport') {
    if (state.units.some(other => other.alive && other.surfaceId === target!.id) || state.units.some(other => other.pendingMove?.to === target!.id)) return cancel('DESTINATION_UNAVAILABLE');
  }
  if (action === 'escudo' && state.map.cells.find(cell => cell.id === target!.cellId)?.buildingId) return cancel('DESTINATION_UNAVAILABLE');
  const usedKey = `weaponUses:${profile.id}`;
  if (['beacon', 'lead-custom'].includes(action) && Number(unit.effectState[usedKey] ?? 0) >= option(profile, 'maxUses', 3)) return cancel('USE_LIMIT');
  if (action === 'spider' && ((state.effects.wireZones ?? []) as WireZone[]).filter(zone => zone.ownerId === unit.id).length >= option(profile, 'maxZones', 6)) return cancel('WIRE_ZONE_LIMIT');
  let marked: UnitState | undefined;
  if (action === 'star-maker') {
    const linked = Object.entries(state.observations[unit.team].contactLinks).find(([, contactId]) => contactId === cmd.contactId)?.[0];
    marked = state.units.find(other => other.id === linked && other.alive);
    if (!marked) return cancel('VISUAL_CONTACT_REQUIRED');
  }
  if (action === 'idaten' && tick + (cmd.path?.length ?? 0) * 2 >= 150) return cancel('TURN_TIME_INSUFFICIENT');
  const before = unit.ap; const waitBefore = unit.readyAtTick;
  unit.ap -= cost; unit.readyAtTick = Math.max(unit.readyAtTick, tick) + wait * 5;
  const accepted = event(state, unit, tick, 'WEAPON_SPECIAL', action.toUpperCase(), { weaponId: profile.id, action });
  accepted.apBefore = before; accepted.apAfter = unit.ap; accepted.waitBefore = waitBefore; accepted.waitAfter = unit.readyAtTick;
  const result = [accepted];
  if (action === 'escudo') {
    const counter = Number(state.effects.structureCounter ?? 0) + 1; state.effects.structureCounter = counter;
    const id = `escudo-${String(counter).padStart(5, '0')}`; const height = option(profile, 'height', 2); const durability = option(profile, 'durability', 300);
    const cell = state.map.cells.find(cell => cell.id === target!.cellId)!;
    const elements = Array.from({ length: height }, (_, index) => ({ id: `${id}:${index}`, buildingId: id, cellId: cell.id, layerIndex: target!.z - cell.groundHeight + index, materialId: 'trion-barrier', maxDurability: Math.ceil(durability / height), currentDurability: Math.ceil(durability / height), supportIds: index ? [`${id}:${index - 1}`] : [] }));
    state.structures = [...state.structures, ...elements].sort((a, b) => stableCompare(a.id, b.id));
    const z = target!.z + height;
    state.map = { ...state.map, cells: state.map.cells.map(value => value.id === cell.id ? { ...value, buildingId: id, roofHeight: z, terrain: 'building', surfaces: [{ id: `${cell.id}:roof@${z}`, cellId: cell.id, kind: 'roof', z, walkable: true }], occluder: { kind: 'solidColumn', minZ: cell.groundHeight, maxZ: z } } : value), buildings: [...state.map.buildings, { id, name: 'エスクード', cellIds: [cell.id], roofKind: 'flat', category: 'barrier', materialId: 'trion-barrier' }], structures: state.structures };
    state.geometryRevision++;
    // The constructor knows its own accepted barrier geometry even below the roof.
    const ownObservation = state.observations[unit.team];
    ownObservation.observedCells = ownObservation.observedCells.map(observed => observed.id === cell.id ? state.map.cells.find(current => current.id === cell.id)! : observed);
    ownObservation.teamGeometryRevision++;
    accepted.details = { ...accepted.details, cellId: cell.id, height, durability, geometryRevision: state.geometryRevision };
    for (const lifted of state.units.filter(other => other.alive && other.surfaceId === target!.id).sort((a, b) => stableCompare(a.id, b.id))) {
      const from = lifted.surfaceId; lifted.surfaceId = `${cell.id}:roof@${z}`;
      if (lifted.pendingMove) { lifted.ap += lifted.pendingMove.cost; lifted.pendingMove = null; }
      const attack = lifted.team !== unit.team ? content.effects.find(effect => effect.enabled && unit.skills.includes(effect.id) && effect.kind === 'escudo-hit') : undefined;
      if (attack) { lifted.ap = Math.max(0, lifted.ap - Number(attack.values.apDrain ?? 3)); lifted.readyAtTick = Math.max(lifted.readyAtTick, tick) + Number(attack.values.wait ?? 1) * 5; }
      const liftedEvent = event(state, unit, tick, 'ESCUDO_LIFT', attack ? 'ESCUDO_ATTACK' : 'SUPPORT_RAISED');
      result.push({ ...liftedEvent, id: `${liftedEvent.id}:${lifted.id}`, targetId: lifted.id, from, to: lifted.surfaceId, details: { apDrain: attack ? Number(attack.values.apDrain ?? 3) : 0, damage: 0 } });
    }
  } else if (action === 'chameleon') {
    unit.effectState.opticalCloak = true; unit.effectState.cloakUntilTurn = state.turn;
  } else if (action === 'star-maker') {
    marked!.effectState.markTeam = unit.team; marked!.effectState.markUntilTurn = state.turn;
    accepted.targetId = marked!.id;
  } else if (action === 'spider') {
    const counter = Number(state.effects.wireCounter ?? 0) + 1; state.effects.wireCounter = counter;
    const zones = (state.effects.wireZones ?? []) as WireZone[];
    state.effects.wireZones = [...zones, { id: `wire-${counter}`, ownerId: unit.id, team: unit.team, cellId: target!.cellId, enemyMoveAp: option(profile, 'enemyMoveAp', 1) }];
    accepted.details = { ...accepted.details, cellId: target!.cellId };
  } else if (action === 'timer') {
    unit.effectState.timerFuseTicks = option(profile, 'fuseTicks', 10);
    const active = [unit.main, unit.sub].find(id => profile.dependencies.includes(id));
    if (active === 'trigger_24' || !active && unit.loadout.main.includes('trigger_24') || !active && unit.loadout.sub.includes('trigger_24')) {
      unit.effectState.timerHoundReady = true; unit.readyAtTick = Math.max(unit.readyAtTick, tick + option(profile, 'fuseTicks', 10)); accepted.waitAfter = unit.readyAtTick;
    }
  }
  else if (action === 'beacon') {
    const counter = Number(state.effects.phantomCounter ?? 0) + 1; state.effects.phantomCounter = counter;
    const decoys = (state.effects.decoys ?? []) as Phantom[];
    state.effects.decoys = [...decoys, { id: `phantom-${counter}`, ownerId: unit.id, team: unit.team, cellId: target!.cellId, createdAt: state.absoluteTick, expiresAt: state.absoluteTick + 150 }];
    unit.effectState[usedKey] = Number(unit.effectState[usedKey] ?? 0) + 1;
  } else if (action === 'teleport') {
    const from = unit.surfaceId; unit.surfaceId = target!.id; unit.pendingMove = null;
    accepted.from = from; accepted.to = target!.id;
  } else if (['thruster', 'genyo', 'senku'].includes(action)) {
    unit.effectState.weaponPrepared = profile.id; unit.effectState.weaponPowerBp = option(profile, 'powerBp', 12500);
    if (action === 'senku') unit.effectState.weaponRange = option(profile, 'range', 4);
    unit.effectState.special = action;
  } else if (action === 'lead' || action === 'lead-custom') {
    unit.effectState.leadWeaponReady = profile.id;
  } else if (action === 'idaten') {
    unit.effectState.idatenPath = JSON.stringify(cmd.path); unit.effectState.idatenIndex = 0;
    unit.effectState.idatenNextTick = tick + 1; unit.effectState.idatenEndsAt = state.absoluteTick + cmd.path!.length * 2 + 2;
    unit.effectState.idatenTurn = state.turn; unit.effectState.idatenDirection = '';
  } else if (action === 'mako') {
    let minimum = option(profile, 'minBp', 8000); const maximum = option(profile, 'maxBp', 18000);
    for (const effect of content.effects.filter(e => e.enabled && unit.skills.includes(e.id))) if (effect.kind === 'special-random-floor' && effect.values.special === 'mako') minimum = Math.max(minimum, Number(effect.values.minBp));
    let value = state.rngState; value = (value ^ (value << 13)) >>> 0; value = (value ^ (value >>> 17)) >>> 0; value = (value ^ (value << 5)) >>> 0; state.rngState = value;
    const multiplier = minimum + value % (maximum - minimum + 1);
    unit.effectState.weaponPrepared = profile.id; unit.effectState.weaponPowerBp = multiplier; unit.effectState.special = 'mako';
    accepted.random = { purpose: 'mako-power', value, percent: 100 }; accepted.details = { ...accepted.details, minimumBp: minimum, maximumBp: maximum, selectedBp: multiplier };
  } else return cancel('UNSUPPORTED_WEAPON_ACTION');
  // Storing explicit program points never resolves contacts through hidden unit IDs.
  if (cmd.waypoints?.length) unit.effectState.weaponWaypoints = JSON.stringify(cmd.waypoints);
  if (current.id !== unit.surfaceId) accepted.details = { ...accepted.details, movementKind: 'teleport' };
  return result;
}

export function weaponAttack(state: BattleState, unit: UnitState, target: UnitState | undefined, profile: WeaponProfile, content: ContentPack, _tick: number): WeaponModifier {
  const result: WeaponModifier = {};
  let synthetic = profile;
  if (unit.effectState.weaponPrepared && profile.actionKind === 'melee') {
    const prepared = content.weapons.find(w => w.id === unit.effectState.weaponPrepared);
    if (prepared?.dependencies.includes(profile.id)) {
      result.powerBp = Number(unit.effectState.weaponPowerBp ?? 10000);
      if (unit.effectState.weaponRange) synthetic = { ...synthetic, range: Number(unit.effectState.weaponRange) };
    }
  }
  if (unit.effectState.leadWeaponReady) {
    const lead = content.weapons.find(w => w.id === unit.effectState.leadWeaponReady);
    if (lead?.dependencies.includes(profile.id)) {
      result.lead = true;
      synthetic = { ...synthetic, basePower: 0, powerModel: 'fixed', requiredSlots: lead.id === 'trigger_38' ? 2 : 1, range: Math.max(1, Math.floor((profile.range ?? 0) * option(lead, 'rangeBp', 5000) / 10000)), baseHit: Math.max(5, (profile.baseHit ?? 100) - 25), structureDamage: 0, penetration: false, guardable: false, options: { ...synthetic.options, lead: true, leadOptionId: lead.id, projectileSpeedBp: option(lead, 'speedBp', 5000) } };
    }
  }
  const aim = unit.activeCommand?.aim ?? (target ? point(state, target, 490000) : undefined);
  if (profile.id === 'trigger_24' && aim) {
    const origin = point(state, unit); const middle = interpolate(origin, aim, rat(1n, 2n));
    const value = exactPoint(middle); middle.z = String(value.z + HEIGHT * value.d);
    result.aimWaypoints = [middle, clone(aim)];
    synthetic = { ...synthetic, options: { ...synthetic.options, homing: true, maxCurvePoints: 2, timerDelayed: !!unit.effectState.timerHoundReady } };
  }
  if (profile.id === 'trigger_26' || profile.id === 'trigger_27') {
    let waypoints = unit.activeCommand?.waypoints;
    if (!waypoints && unit.effectState.weaponWaypoints) { try { waypoints = JSON.parse(String(unit.effectState.weaponWaypoints)) as Point3[]; } catch { waypoints = undefined; } }
    if (!waypoints?.length || routeErrors(state, unit, waypoints, profile.range ?? 8).length) synthetic = { ...synthetic, attackAp: null };
    else result.aimWaypoints = clone(aim ? [...waypoints, aim] : waypoints);
  }
  if (profile.id === 'trigger_30' || profile.id === 'trigger_31') {
    const grenade = profile.id === 'trigger_30';
    synthetic = { ...synthetic, options: { ...synthetic.options, blastBudget: option(profile, 'blastBudget', grenade ? 14 : 10), projectileSpeed: option(profile, 'projectileSpeed', grenade ? 1299038 : 2598076), maxAgeTicks: option(profile, 'maxAgeTicks', grenade ? 60 : 40), arcHeight: option(profile, 'arcHeight', grenade ? 2800000 : 0), gravity: option(profile, 'gravity', grenade ? 140000 : 0), fuse: Number(unit.effectState.timerFuseTicks ?? option(profile, 'fuse', grenade ? 3 : 0)) } };
    if (grenade && aim) { const middle = interpolate(point(state, unit), aim, rat(1n, 2n)); const value = exactPoint(middle); middle.z = String(value.z + BigInt(option(synthetic, 'arcHeight', 2800000)) * value.d); result.aimWaypoints = [middle, clone(aim)]; }
  } else if (profile.powerModel === 'meteor' && unit.effectState.timerFuseTicks) synthetic = { ...synthetic, options: { ...synthetic.options, fuse: Number(unit.effectState.timerFuseTicks) } };
  if (synthetic !== profile) result.synthetic = synthetic;
  return result;
}

/** Consume preparation only after a legal accepted fire, preserving canceled intent state. */
export function weaponAfterFire(unit: UnitState, profile: WeaponProfile): void {
  if (profile.actionKind === 'melee' && unit.effectState.weaponPrepared) {
    for (const key of ['weaponPrepared', 'weaponPowerBp', 'weaponRange', 'special']) delete unit.effectState[key];
  }
  if (profile.options?.lead) {
    const key = `weaponUses:${profile.options.leadOptionId}`; unit.effectState[key] = Number(unit.effectState[key] ?? 0) + 1; delete unit.effectState.leadWeaponReady;
  }
  if (profile.powerModel === 'meteor' || profile.id === 'trigger_24') { delete unit.effectState.timerFuseTicks; delete unit.effectState.timerHoundReady; }
}

/** Run once per execution tick; no setup-clock time enters persistent effect expiration. */
export function weaponTick(state: BattleState, _content: ContentPack, tick: number): BattleEvent[] {
  if (state.effects.weaponTickAt === state.absoluteTick) return [];
  state.effects.weaponTickAt = state.absoluteTick;
  const events: BattleEvent[] = [];
  state.effects.decoys = ((state.effects.decoys ?? []) as Phantom[]).filter(phantom => phantom.expiresAt > state.absoluteTick);
  const zones = (state.effects.wireZones ?? []) as WireZone[];
  for (const unit of [...state.units].sort((a, b) => stableCompare(a.id, b.id))) {
    const surface = getSurface(state.map, unit.surfaceId);
    unit.effectState.wire = !!surface && zones.some(zone => zone.team === unit.team && zone.cellId === surface.cellId);
    if (Number(unit.effectState.cloakUntilTurn ?? state.turn) < state.turn || unit.main !== 'trigger_08' && unit.sub !== 'trigger_08') delete unit.effectState.opticalCloak;
    if (Number(unit.effectState.markUntilTurn ?? state.turn) < state.turn) { delete unit.effectState.markTeam; delete unit.effectState.markUntilTurn; }
    if (unit.effectState.lead && Number(unit.effectState.leadExpiresAt ?? state.absoluteTick + 1) <= state.absoluteTick) { delete unit.effectState.lead; delete unit.effectState.leadExpiresAt; }
    if (!unit.effectState.idatenPath) continue;
    if (!unit.alive || unit.effectState.idatenTurn !== state.turn || state.absoluteTick >= Number(unit.effectState.idatenEndsAt) || tick + 1 >= 150) {
      for (const key of Object.keys(unit.effectState)) if (key.startsWith('idaten')) delete unit.effectState[key]; continue;
    }
    if (unit.pendingMove || tick < Number(unit.effectState.idatenNextTick) || !surface) continue;
    const path = JSON.parse(String(unit.effectState.idatenPath)) as string[]; const index = Number(unit.effectState.idatenIndex ?? 0); const next = getSurface(state.map, path[index]);
    if (!next || moveCost(surface, next) === null || hexDistance(surfaceGraph(state.map).cells.get(surface.cellId)!, surfaceGraph(state.map).cells.get(next.cellId)!) !== 1) {
      delete unit.effectState.idatenPath; events.push(event(state, unit, tick, 'IDATEN_STOP', 'DESTINATION_UNAVAILABLE')); continue;
    }
    const fromCell = surfaceGraph(state.map).cells.get(surface.cellId)!; const toCell = surfaceGraph(state.map).cells.get(next.cellId)!;
    const direction = `${toCell.q - fromCell.q},${toCell.r - fromCell.r}`;
    if (unit.effectState.idatenDirection && unit.effectState.idatenDirection !== direction) unit.effectState.idatenCornerUntil = state.absoluteTick + 3;
    unit.effectState.idatenDirection = direction;
    const wireCost = zones.some(zone => zone.team !== unit.team && zone.cellId === next.cellId) ? 1 : 0;
    if (unit.ap < wireCost) { delete unit.effectState.idatenPath; events.push(event(state, unit, tick, 'IDATEN_STOP', 'AP_INSUFFICIENT')); continue; }
    unit.ap -= wireCost; unit.pendingMove = { from: surface.id, to: next.id, completesAtTick: tick + 1, cost: wireCost };
    unit.effectState.idatenIndex = index + 1; unit.effectState.idatenNextTick = tick + 2;
    if (index + 1 === path.length) delete unit.effectState.idatenPath;
    events.push({ ...event(state, unit, tick, 'IDATEN_MOVE', 'ACCELERATED_PRESET_PATH'), from: surface.id, to: next.id, details: { completesAtTick: tick + 1, cornerVulnerableUntil: unit.effectState.idatenCornerUntil ?? 0 } });
  }
  return events;
}

export function weaponMoveExtraCost(state: BattleState, unit: UnitState, toSurfaceId: string): number {
  const to = getSurface(state.map, toSurfaceId);
  return to && ((state.effects.wireZones ?? []) as WireZone[]).some(zone => zone.team !== unit.team && zone.cellId === to.cellId) ? 1 : 0;
}

export function weaponCurveClear(state: BattleState, unit: UnitState, values: Point3[]): boolean {
  let from = point(state, unit); const solids = generateSolids(state.map, state.structures);
  for (const to of values) { if (!validPoint(to) || !traceLine(from, to, solids).clear) return false; from = to; }
  return true;
}
