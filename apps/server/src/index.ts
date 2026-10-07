import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve, extname, relative, isAbsolute } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { content, maps, defaultRoster } from '@battle/content';
import { compileMatch, projectState, resolveTurn, validatePlan, validateRoster } from '@battle/engine';
import { createReplay, serializeReplay } from '@battle/replay';
import { STAGES, stableCompare, type BattleEvent, type BattleState, type Command, type MatchResult, type Point3, type Replay, type Roster, type Stage, type Team, type TurnPlan, type PublicState } from '@battle/contracts';

type Status = 'lobby' | 'roster' | 'planning' | 'resolving' | 'finished';
type Participant = { id: string; name: string; team: Team; token: string; createdAt: number; disconnectedAt: number | null; socket: WebSocket | null; ready: boolean; requests: Map<string, { fingerprint: string; response: object }> };
export type PublicRoom = {
  id: string; inviteCode: string; matchId: string | null; stage: Stage; status: Status;
  hostId: string; revision: number; turn: number; deadline: number | null;
  participants: { id: string; name: string; team: Team; connected: boolean }[];
  leaders: Record<Team, string | null>; roster: Roster; rosterReady: Record<Team, boolean>;
  owners: Record<string, string>; ready: string[]; result: MatchResult | null;
};
export type CompactTurnReplay = { turn: number; maps: PublicState['map'][]; frames: { tick: number; state: Omit<PublicState, 'map'>; mapIndex: number; events: BattleEvent[] }[]; plans?: TurnPlan[] };
export type RoomMessage = { type: 'room'; room: PublicRoom; state?: PublicState; plans: TurnPlan[]; events: BattleEvent[]; turnReplay?: CompactTurnReplay };
export type Session = { roomId: string; inviteCode: string; participantId: string; token: string; team: Team };
export type ClientMessage = { type: 'roster' | 'assign' | 'plan' | 'ready' | 'start' | 'tag'; requestId: string; matchId: string | null; turn: number; revision: number; payload: Record<string, unknown> };
type Room = {
  id: string; inviteCode: string; hostId: string; matchId: string | null; stage: Stage; status: Status;
  revision: number; turn: number; deadline: number | null; participants: Map<string, Participant>;
  leaders: Record<Team, string | null>; rosters: Record<Team, Roster>;
  rosterReady: Record<Team, boolean>; unitIds: Record<Team, string[]>; owners: Map<string, string>; plans: Map<string, TurnPlan>;
  state: BattleState | null; replay: (Replay & { tagHistory: { turn: number; absoluteTick: number; team: Team; contactId: string; tag: string; receivedAt: number }[] }) | null; finishedAt: number | null; result: MatchResult | null;
  events: Record<Team, BattleEvent[]>; playback: Record<Team, { tick: number; state: PublicState; events: BattleEvent[] }[]>;
  disconnectedSince: Record<Team, number | null>; tail: Promise<void>; timer: ReturnType<typeof setTimeout> | null;
};
export type BattleServerOptions = {
  now?: () => number; planningMs?: number; resolvingMs?: number; reconnectMs?: number;
  disconnectMs?: number; replayMs?: number; autoTimers?: boolean; staticDir?: string;
};
class ProtocolError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProtocolError('BAD_MESSAGE', 'オブジェクトを指定してください。');
  return value as Record<string, unknown>;
}
function boundedString(value: unknown, min: number, max: number, code = 'BAD_MESSAGE'): string {
  if (typeof value !== 'string' || [...value].length < min || [...value].length > max || [...value].some(character => character.codePointAt(0)! < 32 || character.codePointAt(0) === 127)) throw new ProtocolError(code, `${min}〜${max}文字で指定してください。`);
  return value;
}
function teamValue(value: unknown): Team {
  if (value !== 'A' && value !== 'B') throw new ProtocolError('BAD_TEAM', '陣営はAまたはBを指定してください。');
  return value;
}
function stageValue(value: unknown): Stage {
  if (value !== 'I' && value !== 'II' && value !== 'III') throw new ProtocolError('BAD_STAGE', '段階はI、II、IIIを指定してください。');
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new ProtocolError('BAD_MESSAGE', '整数を指定してください。');
  return value;
}
function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function errorBody(error: unknown, requestId?: string): object {
  const known = error instanceof ProtocolError;
  return { type: 'error', ...(requestId ? { requestId } : {}), code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : '処理を完了できませんでした。' };
}
function send(socket: WebSocket, message: object): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
function clone<T>(value: T): T { return structuredClone(value); }
function publicPlan(plan: TurnPlan): TurnPlan {
  const point = ({ x, y, z, denominator }: Point3): Point3 => ({ x, y, z, ...(denominator === undefined ? {} : { denominator }) });
  const fields = ['durationTicks', 'contactId', 'allyId', 'slot', 'main', 'sub', 'mainDirection', 'subDirection', 'mainMode', 'subMode', 'effectId', 'chargeBp', 'blastBp', 'divisionCount', 'weaponId', 'targetSurfaceId'] as const satisfies readonly (keyof Command)[];
  return {
    unitId: plan.unitId, planRevision: plan.planRevision,
    commands: plan.commands.map(command => {
      const projected: Command = { kind: command.kind };
      for (const key of fields) if (command[key] !== undefined) Object.assign(projected, { [key]: command[key] });
      if (command.path) projected.path = [...command.path];
      if (command.aim) projected.aim = point(command.aim);
      if (command.waypoints) projected.waypoints = command.waypoints.map(point);
      if (command.chosenEffectIds) projected.chosenEffectIds = [...command.chosenEffectIds];
      return projected;
    }),
  };
}

/** Server-clock timing is kept outside the pure, integer-tick battle engine. */
export function createBattleServer(options: BattleServerOptions = {}) {
  const now = options.now ?? Date.now;
  const durations = { planning: options.planningMs ?? 150_000, resolving: options.resolvingMs ?? 15_000, reconnect: options.reconnectMs ?? 60_000, disconnect: options.disconnectMs ?? 120_000, replay: options.replayMs ?? 86_400_000 };
  const rooms = new Map<string, Room>();
  const inviteRooms = new Map<string, string>();
  const staticDir = resolve(options.staticDir ?? 'dist');
  let closing = false;

  function enqueue<T>(room: Room, operation: () => T | Promise<T>): Promise<T> {
    const result = room.tail.then(operation);
    room.tail = result.then(() => undefined, () => undefined);
    return result;
  }
  function findRoom(id: string): Room {
    const room = rooms.get(id);
    if (!room) throw new ProtocolError('NOT_FOUND', 'ルームが見つかりません。', 404);
    return room;
  }
  function authenticate(room: Room, token: string, reconnect = true): Participant {
    const participant = [...room.participants.values()].find(item => sameToken(item.token, token));
    if (!participant) throw new ProtocolError('UNAUTHORIZED', '参加者認証に失敗しました。', 401);
    if (reconnect && participant.disconnectedAt !== null && now() - participant.disconnectedAt > durations.reconnect) throw new ProtocolError('RECONNECT_EXPIRED', '再接続できる時間を過ぎました。', 401);
    return participant;
  }
  function session(room: Room, participant: Participant): Session {
    return { roomId: room.id, inviteCode: room.inviteCode, participantId: participant.id, token: participant.token, team: participant.team };
  }
  function ownUnits(room: Room, team: Team): string[] {
    if (room.state) return room.state.units.filter(unit => unit.team === team).map(unit => unit.id).sort(stableCompare);
    return room.unitIds[team];
  }
  function snapshot(room: Room, participant: Participant): RoomMessage {
    const ownIds = new Set(ownUnits(room, participant.team));
    const publicRoom: PublicRoom = {
      id: room.id, inviteCode: room.inviteCode, matchId: room.matchId, stage: room.stage, status: room.status,
      hostId: room.hostId, revision: room.revision, turn: room.turn, deadline: room.deadline,
      participants: [...room.participants.values()].map(item => ({ id: item.id, name: item.name, team: item.team, connected: item.socket?.readyState === WebSocket.OPEN })),
      leaders: { A: room.leaders.A, B: room.leaders.B }, roster: clone(room.rosters[participant.team]),
      rosterReady: { A: room.rosterReady.A, B: room.rosterReady.B },
      owners: Object.fromEntries([...room.owners.entries()].filter(([unitId]) => ownIds.has(unitId))),
      ready: [...room.participants.values()].filter(item => item.team === participant.team && item.ready).map(item => item.id), result: room.result && clone(room.result),
    };
    const result: RoomMessage = { type: 'room', room: publicRoom, plans: [...room.plans.values()].filter(plan => ownIds.has(plan.unitId)).map(clone), events: clone(room.events[participant.team]) };
    if (room.state) result.state = projectState(room.state, participant.team);
    if (room.playback[participant.team].length) {
      const maps: PublicState['map'][] = []; const indices = new Map<PublicState['map']['cells'], number>();
      const frames = room.playback[participant.team].map(frame => {
        const { map, ...state } = frame.state;
        let mapIndex = indices.get(map.cells);
        if (mapIndex === undefined) { mapIndex = maps.length; indices.set(map.cells, mapIndex); maps.push(map); }
        return { tick: frame.tick, state, mapIndex, events: frame.events };
      });
      const resolvedTurn = room.replay?.turns.at(-1);
      result.turnReplay = {
        turn: resolvedTurn?.turn ?? (room.status === 'resolving' || room.status === 'finished' ? room.turn : room.turn - 1), maps, frames,
        ...(resolvedTurn ? { plans: resolvedTurn.plans.filter(plan => ownIds.has(plan.unitId)).map(publicPlan) } : {}),
      };
    }
    return result;
  }
  function broadcast(room: Room): void {
    for (const participant of room.participants.values()) if (participant.socket) send(participant.socket, snapshot(room, participant));
  }
  function assignDefaults(room: Room, team: Team): void {
    const leader = room.leaders[team];
    if (!leader) return;
    for (const unitId of ownUnits(room, team)) if (!room.owners.has(unitId)) room.owners.set(unitId, leader);
  }
  function connectionStatus(room: Room, at: number): void {
    for (const team of ['A', 'B'] as const) {
      const members = [...room.participants.values()].filter(item => item.team === team);
      if (members.some(item => item.socket?.readyState === WebSocket.OPEN)) room.disconnectedSince[team] = null;
      else if (members.length && room.disconnectedSince[team] === null) room.disconnectedSince[team] = at;
    }
  }
  function resultFor(room: Room, winner: Team | 'aborted', reason: string): MatchResult {
    const survivors = { A: room.state?.units.filter(item => item.team === 'A' && item.alive).length ?? STAGES[room.stage].total, B: room.state?.units.filter(item => item.team === 'B' && item.alive).length ?? STAGES[room.stage].total };
    return { winner, survivors, difference: Math.abs(survivors.A - survivors.B), threshold: STAGES[room.stage].threshold, reason, points: { A: winner === 'A' ? STAGES[room.stage].points[0] : 0, B: winner === 'B' ? STAGES[room.stage].points[0] : 0 } };
  }
  function finish(room: Room, result: MatchResult): void {
    room.status = 'finished'; room.result = result; room.finishedAt = now(); room.deadline = null;
    if (room.replay) room.replay.result = clone(result);
    if (room.timer) clearTimeout(room.timer);
    room.timer = null; room.revision++;
    broadcast(room);
  }
  function arm(room: Room): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    if (options.autoTimers === false || closing) return;
    const deadlines: number[] = [];
    if (room.deadline !== null) deadlines.push(room.deadline);
    if (room.status === 'planning' || room.status === 'resolving') for (const team of ['A', 'B'] as const) if (room.disconnectedSince[team] !== null) deadlines.push(room.disconnectedSince[team]! + durations.disconnect);
    if (room.finishedAt !== null) deadlines.push(room.finishedAt + durations.replay);
    if (!deadlines.length) return;
    room.timer = setTimeout(() => { void enqueue(room, () => { advanceRoom(room); arm(room); }); }, Math.max(1, Math.min(...deadlines) - now()));
    room.timer.unref();
  }
  function resolvePlanning(room: Room): void {
    if (!room.state || !room.replay) throw new ProtocolError('BAD_STATE', '試合が開始されていません。');
    const plans = room.state.units.filter(unit => unit.alive).map(unit => room.plans.get(unit.id) ?? { unitId: unit.id, planRevision: room.revision, commands: [{ kind: 'WAIT' as const }] }).sort((a, b) => stableCompare(a.unitId, b.unitId));
    try {
      const resolution = resolveTurn(room.state, plans, content);
      room.replay.turns.push({ turn: room.turn, plans: clone(plans), frames: resolution.frames, events: resolution.fullEvents });
      for (const team of ['A', 'B'] as const) {
        room.events[team] = [...room.events[team], ...resolution.frames.flatMap(frame => frame.teamEvents[team])];
        room.playback[team] = resolution.frames.map(frame => ({ tick: frame.tick, state: frame.views[team], events: frame.teamEvents[team] }));
      }
      room.state = resolution.nextState;
      room.result = resolution.result;
      room.status = 'resolving'; room.deadline = now() + durations.resolving;
      broadcast(room); arm(room);
    } catch {
      finish(room, resultFor(room, 'aborted', 'server-error'));
    }
  }
  function advanceRoom(room: Room): void {
    const at = now();
    if (room.finishedAt !== null && at >= room.finishedAt + durations.replay) {
      if (room.timer) clearTimeout(room.timer);
      for (const participant of room.participants.values()) participant.socket?.close(1000, 'Replay expired');
      room.replay = null; rooms.delete(room.id); inviteRooms.delete(room.inviteCode); return;
    }
    if (room.status !== 'planning' && room.status !== 'resolving') return;
    connectionStatus(room, at);
    const absent = (['A', 'B'] as const).filter(team => room.disconnectedSince[team] !== null && at >= room.disconnectedSince[team]! + durations.disconnect);
    if (absent.length) {
      finish(room, resultFor(room, absent.length === 2 ? 'aborted' : absent[0] === 'A' ? 'B' : 'A', absent.length === 2 ? 'both-teams-disconnected' : 'team-disconnected')); return;
    }
    if (room.deadline === null || at < room.deadline) return;
    if (room.status === 'planning') resolvePlanning(room);
    else if (room.turn >= 6) finish(room, room.result ?? resultFor(room, 'aborted', 'missing-result'));
    else {
      room.turn++; room.revision++; room.status = 'planning'; room.deadline = at + durations.planning;
      room.plans.clear(); room.events = { A: [], B: [] };
      for (const participant of room.participants.values()) participant.ready = false;
      broadcast(room);
    }
  }
  function newParticipant(room: Room, name: string, team: Team): Participant {
    if ([...room.participants.values()].filter(item => item.team === team).length >= 4 || room.participants.size >= 8) throw new ProtocolError('ROOM_FULL', 'この陣営は4人までです。', 409);
    const participant: Participant = { id: randomUUID(), name, team, token: randomBytes(32).toString('base64url'), createdAt: now(), disconnectedAt: null, socket: null, ready: false, requests: new Map() };
    room.participants.set(participant.id, participant);
    room.leaders[team] ??= participant.id;
    assignDefaults(room, team);
    if (room.leaders.A && room.leaders.B) room.status = 'roster';
    return participant;
  }
  function checkedRoster(value: unknown, stage: Stage): Roster {
    const input = object(value);
    if (!Array.isArray(input.base) || !Array.isArray(input.help) || !Array.isArray(input.changes) || input.base.length !== 4 || input.help.length !== STAGES[stage].help || input.changes.length > STAGES[stage].total) throw new ProtocolError('INVALID_ROSTER', '編成の人数または装備変更数が不正です。');
    const base = input.base.map(item => boundedString(item, 1, 100, 'INVALID_ROSTER'));
    const help = input.help.map(item => boundedString(item, 1, 100, 'INVALID_ROSTER'));
    const helperIds = new Set(Object.values(content.helpPools).flat());
    if (new Set(base).size !== 4 || new Set(help).size !== help.length || base.some(id => helperIds.has(id))) throw new ProtocolError('INVALID_ROSTER', '基礎4名とヘルプはそれぞれ重複できません。基礎枠へヘルプは選べません。');
    const baseCharacters = base.map(id => content.characters.find(preset => preset.id === id)?.characterId ?? id);
    const helpCharacters = help.map(id => content.characters.find(preset => preset.id === id)?.characterId ?? id);
    if (new Set(baseCharacters).size !== 4 || new Set(helpCharacters).size !== help.length) throw new ProtocolError('INVALID_ROSTER', '同じキャラクターの別プリセットを複数枠へ選べません。');
    const listedChanges = input.changes.map(item => {
      const change = object(item); const loadout = object(change.loadout);
      if (!Array.isArray(loadout.main) || !Array.isArray(loadout.sub) || loadout.main.length !== 4 || loadout.sub.length !== 4) throw new ProtocolError('INVALID_ROSTER', 'MAIN/SUBは各4枠です。');
      return { unitIndex: integer(change.unitIndex), loadout: { main: loadout.main.map(id => boundedString(id, 1, 100, 'INVALID_ROSTER')), sub: loadout.sub.map(id => boundedString(id, 1, 100, 'INVALID_ROSTER')) } };
    });
    if (new Set(listedChanges.map(change => change.unitIndex)).size !== listedChanges.length || listedChanges.some(change => change.unitIndex >= STAGES[stage].total)) throw new ProtocolError('INVALID_ROSTER', '装備変更の対象が不正です。');
    const expanded = [...base.flatMap(id => Array<string>(STAGES[stage].copies).fill(id)), ...help];
    const changes = listedChanges.filter(change => {
      const preset = content.characters.find(item => item.id === expanded[change.unitIndex]);
      return !preset || JSON.stringify(change.loadout) !== JSON.stringify(preset.defaultLoadout);
    });
    const roster = { base, help, changes };
    const validation = validateRoster(roster, stage, content);
    if (!validation.ok) throw new ProtocolError('INVALID_ROSTER', validation.errors.join(' / '));
    return roster;
  }
  function handleMessage(room: Room, participant: Participant, raw: unknown, receivedAt: number): void {
    let requestId: string | undefined;
    let fingerprint: string | undefined;
    try {
      const message = object(raw);
      requestId = boundedString(message.requestId, 1, 128);
      fingerprint = JSON.stringify(message);
      const previous = participant.requests.get(requestId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new ProtocolError('REQUEST_REUSED', '同じrequestIdで異なる操作を送れません。');
        if (participant.socket) send(participant.socket, previous.response); return;
      }
      if (participant.requests.size >= 10_000) throw new ProtocolError('REQUEST_LIMIT', 'このルームの操作件数上限に達しました。');
      const payload = object(message.payload);
      if (message.matchId !== room.matchId) throw new ProtocolError('MATCH_MISMATCH', '試合IDが異なります。');
      if (integer(message.turn) !== room.turn) throw new ProtocolError('STALE_TURN', 'ターンが更新されています。');
      if (integer(message.revision) !== room.revision) throw new ProtocolError('STALE_REVISION', '担当または編成が更新されています。');
      const leader = room.leaders[participant.team] === participant.id;
      if (message.type === 'roster') {
        if (!leader) throw new ProtocolError('FORBIDDEN', '自陣営リーダーのみ編成を確定できます。', 403);
        if (room.status !== 'lobby' && room.status !== 'roster') throw new ProtocolError('BAD_PHASE', '編成フェーズではありません。');
        if (room.rosterReady[participant.team]) throw new ProtocolError('ROSTER_LOCKED', '確定済みの編成は変更できません。');
        room.rosters[participant.team] = checkedRoster(payload.roster, room.stage);
        room.rosterReady[participant.team] = true; room.revision++; assignDefaults(room, participant.team);
      } else if (message.type === 'assign') {
        if (!leader) throw new ProtocolError('FORBIDDEN', '自陣営リーダーのみ担当を変更できます。', 403);
        if (!['lobby', 'roster', 'planning'].includes(room.status)) throw new ProtocolError('BAD_PHASE', '担当を変更できるフェーズではありません。');
        if (room.status === 'planning' && (room.deadline === null || receivedAt >= room.deadline)) throw new ProtocolError('DEADLINE', '設定締切を過ぎています。');
        const unitId = boundedString(payload.unitId, 1, 100); const ownerId = boundedString(payload.participantId, 1, 100);
        const owner = room.participants.get(ownerId);
        if (!ownUnits(room, participant.team).includes(unitId) || !owner || owner.team !== participant.team) throw new ProtocolError('FORBIDDEN', '自陣営のユニットと参加者のみ指定できます。', 403);
        room.owners.set(unitId, ownerId); room.revision++;
        const plan = room.plans.get(unitId); if (plan) plan.planRevision = room.revision;
      } else if (message.type === 'start') {
        if (room.hostId !== participant.id) throw new ProtocolError('FORBIDDEN', 'ホストのみ試合を開始できます。', 403);
        if (room.status !== 'roster' || !room.rosterReady.A || !room.rosterReady.B) throw new ProtocolError('NOT_READY', '両陣営の編成を確定してください。');
        const state = compileMatch(maps[room.stage], content, room.rosters, randomBytes(4).readUInt32LE() || 1);
        if (state.units.some(unit => !room.owners.get(unit.id))) throw new ProtocolError('NOT_READY', '全ユニットへ担当を割り当ててください。');
        room.state = state; room.matchId = randomUUID(); room.turn = 1; room.status = 'planning'; room.revision++;
        room.replay = { ...createReplay(state), tagHistory: [] };
        room.deadline = now() + durations.planning; room.disconnectedSince = { A: null, B: null }; connectionStatus(room, now());
      } else if (message.type === 'plan') {
        if (room.status !== 'planning' || !room.state) throw new ProtocolError('BAD_PHASE', '設定フェーズではありません。');
        if (room.deadline === null || receivedAt >= room.deadline) throw new ProtocolError('DEADLINE', '設定締切を過ぎています。');
        const unitId = boundedString(payload.unitId, 1, 100);
        if (room.owners.get(unitId) !== participant.id || !room.state.units.some(unit => unit.id === unitId && unit.team === participant.team)) throw new ProtocolError('FORBIDDEN', '担当ユニットのみ更新できます。', 403);
        if (!Array.isArray(payload.commands) || payload.commands.length > 32) throw new ProtocolError('INVALID_PLAN', 'コマンドは32件までです。');
        const plan: TurnPlan = { unitId, planRevision: room.revision, commands: clone(payload.commands) as TurnPlan['commands'] };
        const validation = validatePlan(room.state, plan, content, participant.team);
        if (!validation.ok) throw new ProtocolError('INVALID_PLAN', validation.errors.join(' / '));
        room.plans.set(unitId, plan); participant.ready = false;
      } else if (message.type === 'ready') {
        if (room.status !== 'planning' || room.deadline === null || receivedAt >= room.deadline) throw new ProtocolError('BAD_PHASE', '設定フェーズではありません。');
        if (typeof payload.ready !== 'boolean') throw new ProtocolError('BAD_MESSAGE', 'readyに真偽値を指定してください。');
        participant.ready = payload.ready;
      } else if (message.type === 'tag') {
        if (!room.state || !['planning', 'resolving'].includes(room.status)) throw new ProtocolError('BAD_PHASE', '試合中のみタグを編集できます。');
        const contactId = boundedString(payload.contactId, 1, 100); const tag = boundedString(payload.tag, 0, 12);
        const contact = room.state.observations[participant.team].contacts.find(item => item.contactId === contactId);
        if (!contact) throw new ProtocolError('UNKNOWN_CONTACT', '自陣営の接触情報を指定してください。');
        contact.tag = tag;
        const event: BattleEvent = { id: randomUUID(), turn: room.turn, tick: room.state.absoluteTick, groupId: 'team-tag', kind: 'tag', reasonCode: 'TAG_UPDATED', description: tag ? '接触タグを設定しました。' : '接触タグを解除しました。', details: { contactId, tag, participantId: participant.id, receivedAt } };
        room.events[participant.team].push(event);
        if (room.replay) {
          room.replay.tagHistory.push({ turn: room.turn, absoluteTick: room.state.absoluteTick, team: participant.team, contactId, tag, receivedAt });
          const turn = room.replay.turns.at(-1);
          if (room.status === 'resolving' && turn) {
            turn.events.push(clone(event));
          }
        }
      } else throw new ProtocolError('UNKNOWN_MESSAGE', '不明な操作です。');
      const response = { type: 'ack', requestId, revision: room.revision, turn: room.turn };
      participant.requests.set(requestId, { fingerprint, response });
      if (participant.socket) send(participant.socket, response);
      broadcast(room); arm(room);
    } catch (error) {
      const response = errorBody(error, requestId);
      if (requestId && fingerprint && participant.requests.size < 10_000 && !participant.requests.has(requestId)) {
        participant.requests.set(requestId, { fingerprint, response });
      }
      if (participant.socket) send(participant.socket, response);
    }
  }
  async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
    let size = 0; const chunks: Buffer[] = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 65_536) throw new ProtocolError('PAYLOAD_TOO_LARGE', '送信内容が大きすぎます。', 413);
      chunks.push(chunk);
    }
    try { return object(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch (error) { if (error instanceof ProtocolError) throw error; throw new ProtocolError('BAD_JSON', 'JSON形式で送信してください。'); }
  }
  function json(response: ServerResponse, status: number, body: object): void {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(body));
  }
  async function http(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/api/health') { json(response, 200, { ok: true }); return; }
      if (request.method === 'GET' && url.pathname === '/api/catalog') { json(response, 200, { content, maps }); return; }
      if (request.method === 'POST' && url.pathname === '/api/rooms') {
        const body = await readBody(request); const name = boundedString(body.name, 1, 20, 'BAD_NAME'); const team = teamValue(body.team); const stage = stageValue(body.stage);
        const id = randomUUID(); let inviteCode = randomBytes(6).toString('hex').toUpperCase();
        while (inviteRooms.has(inviteCode)) inviteCode = randomBytes(6).toString('hex').toUpperCase();
        const rosters = { A: defaultRoster(stage, 'A'), B: defaultRoster(stage, 'B') };
        const preview = compileMatch(maps[stage], content, rosters, 1);
        const unitIds = { A: preview.units.filter(unit => unit.team === 'A').map(unit => unit.id).sort(stableCompare), B: preview.units.filter(unit => unit.team === 'B').map(unit => unit.id).sort(stableCompare) };
        const room: Room = { id, inviteCode, hostId: '', matchId: null, stage, status: 'lobby', revision: 0, turn: 0, deadline: null, participants: new Map(), leaders: { A: null, B: null }, rosters, rosterReady: { A: false, B: false }, unitIds, owners: new Map(), plans: new Map(), state: null, replay: null, finishedAt: null, result: null, events: { A: [], B: [] }, playback: { A: [], B: [] }, disconnectedSince: { A: null, B: null }, tail: Promise.resolve(), timer: null };
        const participant = newParticipant(room, name, team); room.hostId = participant.id;
        rooms.set(id, room); inviteRooms.set(inviteCode, id); json(response, 201, session(room, participant)); return;
      }
      if (request.method === 'POST' && url.pathname === '/api/rooms/join') {
        const body = await readBody(request); const code = boundedString(body.inviteCode, 1, 40).toUpperCase();
        const room = findRoom(inviteRooms.get(code) ?? ''); const name = boundedString(body.name, 1, 20, 'BAD_NAME'); const team = teamValue(body.team);
        const joined = await enqueue(room, () => {
          if (room.status !== 'lobby' && room.status !== 'roster') throw new ProtocolError('ROOM_STARTED', '開始済みのルームへ新規参加できません。', 409);
          const participant = newParticipant(room, name, team); room.revision++; broadcast(room); return session(room, participant);
        });
        json(response, 201, joined); return;
      }
      if (request.method === 'POST' && url.pathname === '/api/rooms/reconnect') {
        const body = await readBody(request); const room = findRoom(boundedString(body.roomId, 1, 100)); const token = boundedString(body.token, 1, 100);
        const result = await enqueue(room, () => session(room, authenticate(room, token))); json(response, 200, result); return;
      }
      const replayPath = /^\/api\/replays\/([^/]+)$/u.exec(url.pathname);
      if (request.method === 'GET' && replayPath) {
        const room = findRoom(replayPath[1]);
        const authorization = request.headers.authorization;
        if (!authorization?.startsWith('Bearer ')) throw new ProtocolError('UNAUTHORIZED', '参加者認証が必要です。', 401);
        authenticate(room, authorization.slice(7), false);
        const replay = await enqueue(room, () => {
          if (room.status !== 'finished' || !room.replay) throw new ProtocolError('REPLAY_NOT_READY', '完全リプレイは試合終了後に取得できます。', 409);
          if (room.finishedAt === null || now() >= room.finishedAt + durations.replay) throw new ProtocolError('REPLAY_EXPIRED', 'リプレイの保存期間を過ぎています。', 410);
          return room.replay;
        });
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `attachment; filename="battle-${room.id}.json"` }); response.end(serializeReplay(replay)); return;
      }
      if (url.pathname.startsWith('/api/') || url.pathname === '/ws') throw new ProtocolError('NOT_FOUND', 'APIが見つかりません。', 404);
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new ProtocolError('METHOD_NOT_ALLOWED', 'この操作は許可されていません。', 405);
      let path: string;
      try { path = decodeURIComponent(url.pathname); } catch { throw new ProtocolError('BAD_PATH', '不正なパスです。'); }
      const candidate = resolve(staticDir, `.${path}`); const within = relative(staticDir, candidate);
      if (within.startsWith('..') || isAbsolute(within) || path.includes('\u0000') || path.includes('\\')) throw new ProtocolError('BAD_PATH', '不正なパスです。');
      let filePath = candidate;
      try { if (!(await stat(filePath)).isFile()) filePath = resolve(staticDir, 'index.html'); }
      catch { filePath = extname(candidate) ? candidate : resolve(staticDir, 'index.html'); }
      let data: Buffer;
      try {
        const resolvedRoot = await realpath(staticDir); const resolvedFile = await realpath(filePath); const resolvedWithin = relative(resolvedRoot, resolvedFile);
        if (resolvedWithin.startsWith('..') || isAbsolute(resolvedWithin)) throw new ProtocolError('BAD_PATH', '不正なパスです。');
        data = await readFile(resolvedFile);
      } catch (error) { if (error instanceof ProtocolError) throw error; throw new ProtocolError('NOT_FOUND', 'ファイルが見つかりません。', 404); }
      const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
      response.writeHead(200, { 'Content-Type': types[extname(filePath)] ?? 'application/octet-stream', 'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); response.end(request.method === 'HEAD' ? undefined : data);
    } catch (error) { json(response, error instanceof ProtocolError ? error.status : 500, errorBody(error)); }
  }
  const server = createServer((request, response) => { void http(request, response); });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 65_536, perMessageDeflate: true });
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws' || url.search) { socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    sockets.handleUpgrade(request, socket, head, ws => { sockets.emit('connection', ws, request); });
  });
  sockets.on('connection', socket => {
    let boundRoom: Room | null = null; let boundParticipant: Participant | null = null;
    const authTimer = setTimeout(() => socket.close(1008, 'Authentication required'), 5000); authTimer.unref();
    socket.on('error', () => undefined);
    socket.on('message', data => {
      const receivedAt = now();
      let parsed: unknown;
      try { parsed = JSON.parse(data.toString()); } catch { send(socket, errorBody(new ProtocolError('BAD_JSON', 'JSON形式で送信してください。'))); return; }
      if (!boundRoom || !boundParticipant) {
        try {
          const message = object(parsed);
          if (message.type !== 'authenticate') throw new ProtocolError('UNAUTHORIZED', '最初に参加者認証が必要です。', 401);
          const room = findRoom(boundedString(message.roomId, 1, 100)); const token = boundedString(message.token, 1, 100);
          void enqueue(room, () => {
            const participant = authenticate(room, token);
            if (participant.socket && participant.socket !== socket) participant.socket.close(4001, 'Session replaced');
            boundRoom = room; boundParticipant = participant; participant.socket = socket; participant.disconnectedAt = null;
            clearTimeout(authTimer); connectionStatus(room, now()); broadcast(room); arm(room);
          }).catch(error => { send(socket, errorBody(error)); socket.close(1008, 'Authentication failed'); });
        } catch (error) { send(socket, errorBody(error)); socket.close(1008, 'Authentication failed'); }
      } else {
        const room = boundRoom; const participant = boundParticipant;
        void enqueue(room, () => { if (participant.socket !== socket) throw new ProtocolError('SESSION_REPLACED', '接続が置き換えられています。', 401); handleMessage(room, participant, parsed, receivedAt); }).catch(error => send(socket, errorBody(error)));
      }
    });
    socket.on('close', () => {
      clearTimeout(authTimer);
      if (!boundRoom || !boundParticipant || closing) return;
      const room = boundRoom; const participant = boundParticipant;
      void enqueue(room, () => {
        if (participant.socket !== socket) return;
        participant.socket = null; participant.disconnectedAt = now(); participant.ready = false;
        const connected = [...room.participants.values()].filter(item => item.team === participant.team && item.socket?.readyState === WebSocket.OPEN).sort((a, b) => stableCompare(a.id, b.id));
        if (room.leaders[participant.team] === participant.id && connected.length) room.leaders[participant.team] = connected[0].id;
        connectionStatus(room, now()); broadcast(room); arm(room);
      });
    });
  });
  return {
    server, rooms,
    async listen(port = 3001, host = '127.0.0.1'): Promise<number> {
      await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); accept(); }); });
      const address = server.address(); return typeof address === 'object' && address ? address.port : port;
    },
    async sweep(): Promise<void> { for (const room of rooms.values()) await enqueue(room, () => { advanceRoom(room); arm(room); }); },
    async close(): Promise<void> {
      closing = true;
      for (const room of rooms.values()) { if (room.timer) clearTimeout(room.timer); if (room.status === 'planning' || room.status === 'resolving') finish(room, resultFor(room, 'aborted', 'server-shutdown')); }
      for (const socket of sockets.clients) socket.terminate();
      await new Promise<void>(accept => sockets.close(() => accept()));
      if (server.listening) await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()));
    },
  };
}
