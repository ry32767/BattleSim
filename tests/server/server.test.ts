import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createBattleServer, type RoomMessage, type Session } from '../../apps/server/src/index';
import { defaultRoster } from '@battle/content';
import { initializeHashing } from '@battle/engine';
import { deserializeReplay, validateReplay } from '@battle/replay';
import type { Stage } from '@battle/contracts';

type Running = Awaited<ReturnType<typeof start>>;
type Reply = { type: string; requestId?: string; code?: string; revision?: number; turn?: number };
const running: ReturnType<typeof createBattleServer>[] = [];
const clients: WebSocket[] = [];
let requestCounter = 0;
beforeAll(async () => { await initializeHashing(); });

async function start(options: Parameters<typeof createBattleServer>[0] = {}) {
  let time = 10_000;
  let clockReads = 0;
  const app = createBattleServer({ now: () => { clockReads++; return time; }, autoTimers: false, ...options });
  running.push(app); const port = await app.listen(0);
  return { app, base: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/ws`, setTime: (value: number) => { time = value; }, time: () => time, clockReads: () => clockReads };
}
async function post(server: Running, path: string, body: unknown) {
  const response = await fetch(server.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
class Client {
  room!: RoomMessage;
  messages: unknown[] = [];
  private waiting: { test: (value: any) => boolean; accept: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }[] = [];
  private pending: any[] = [];
  constructor(readonly socket: WebSocket) {
    socket.on('message', data => {
      const value = JSON.parse(data.toString()); this.messages.push(value);
      if (value.type === 'room') this.room = value;
      const index = this.waiting.findIndex(item => item.test(value));
      if (index >= 0) { const [waiter] = this.waiting.splice(index, 1); clearTimeout(waiter.timer); waiter.accept(value); }
      else if (value.type !== 'room') this.pending.push(value);
    });
  }
  next<T = any>(test: (value: any) => boolean): Promise<T> {
    const index = this.pending.findIndex(test);
    if (index >= 0) return Promise.resolve(this.pending.splice(index, 1)[0]);
    return new Promise<T>((accept, reject) => {
      const timer = setTimeout(() => { const index = this.waiting.findIndex(item => item.timer === timer); this.waiting.splice(index, 1); reject(new Error('Timed out waiting for server response')); }, 10_000);
      this.waiting.push({ test, accept, reject, timer });
    });
  }
  async message(type: string, payload: Record<string, unknown> = {}, override: Record<string, unknown> = {}): Promise<Reply> {
    const requestId = `request-${++requestCounter}`;
    const packet = { type, requestId, matchId: this.room.room.matchId, turn: this.room.room.turn, revision: this.room.room.revision, payload, ...override };
    this.socket.send(JSON.stringify(packet));
    return this.next<Reply>(value => value.requestId === packet.requestId);
  }
  async roomWhere(test: (room: RoomMessage) => boolean): Promise<RoomMessage> {
    if (this.room && test(this.room)) return this.room;
    return this.next(value => value.type === 'room' && test(value));
  }
  async disconnect() { if (this.socket.readyState === WebSocket.CLOSED) return; await new Promise<void>(accept => { this.socket.once('close', () => accept()); this.socket.close(); }); }
}
async function connect(server: Running, session: Session): Promise<Client> {
  const socket = new WebSocket(server.ws); clients.push(socket); const client = new Client(socket);
  await new Promise<void>((accept, reject) => { socket.once('open', accept); socket.once('error', reject); });
  socket.send(JSON.stringify({ type: 'authenticate', roomId: session.roomId, token: session.token }));
  await client.next(value => value.type === 'room'); return client;
}
async function pair(server: Running, stage: Stage = 'I') {
  const created = await post(server, '/api/rooms', { name: '隊長A', team: 'A', stage }); expect(created, JSON.stringify(created.body)).toMatchObject({ status: 201 });
  const aSession = created.body as Session;
  const a = await connect(server, aSession);
  const bSession = (await post(server, '/api/rooms/join', { inviteCode: aSession.inviteCode, name: '隊長B', team: 'B' })).body as Session;
  const b = await connect(server, bSession);
  await a.roomWhere(value => value.room.participants.length === 2);
  return { a, b, aSession, bSession };
}
async function begin(server: Running, stage: Stage = 'I') {
  const result = await pair(server, stage);
  expect((await result.a.message('roster', { roster: defaultRoster(stage, 'A') })).type).toBe('ack');
  await result.b.roomWhere(value => value.room.rosterReady.A);
  expect((await result.b.message('roster', { roster: defaultRoster(stage, 'B') })).type).toBe('ack');
  await result.a.roomWhere(value => value.room.rosterReady.B);
  expect((await result.a.message('start')).type).toBe('ack');
  await Promise.all([result.a.roomWhere(value => value.room.status === 'planning'), result.b.roomWhere(value => value.room.status === 'planning')]);
  return result;
}
afterEach(async () => {
  for (const socket of clients.splice(0)) socket.terminate();
  for (const app of running.splice(0)) await app.close();
});

describe('authoritative invite-room server', () => {
  it('caps each side at four, validates names, and rejects new participants after start', async () => {
    const server = await start(); const { aSession } = await pair(server);
    for (let index = 1; index < 4; index++) expect((await post(server, '/api/rooms/join', { inviteCode: aSession.inviteCode, name: `A${index}`, team: 'A' })).status).toBe(201);
    expect((await post(server, '/api/rooms/join', { inviteCode: aSession.inviteCode, name: '5人目', team: 'A' })).body.code).toBe('ROOM_FULL');
    expect((await post(server, '/api/rooms', { name: '', team: 'A', stage: 'I' })).body.code).toBe('BAD_NAME');
    const second = await start(); const live = await begin(second);
    expect((await post(second, '/api/rooms/join', { inviteCode: live.aSession.inviteCode, name: '遅刻', team: 'A' })).body.code).toBe('ROOM_STARTED');
  });

  it('requires leader roster approval and host start, rejects duplicate bases and loadout targets', async () => {
    const server = await start(); const { a, b, aSession } = await pair(server);
    const memberSession = (await post(server, '/api/rooms/join', { inviteCode: aSession.inviteCode, name: '担当A', team: 'A' })).body as Session;
    const member = await connect(server, memberSession); await a.roomWhere(value => value.room.participants.length === 3);
    expect((await member.message('roster', { roster: defaultRoster('I') })).code).toBe('FORBIDDEN');
    const duplicate = defaultRoster('I'); duplicate.base[1] = duplicate.base[0];
    expect((await a.message('roster', { roster: duplicate })).code).toBe('INVALID_ROSTER');
    const aliases = defaultRoster('I'); aliases.base[1] = 'char_27-supplemented';
    expect((await a.message('roster', { roster: aliases })).code).toBe('INVALID_ROSTER');
    const repeated = defaultRoster('I'); repeated.changes = [{ unitIndex: 0, loadout: { main: ['x', 'y', 'z', 'w'], sub: ['x', 'y', 'z', 'w'] } }, { unitIndex: 0, loadout: { main: ['x', 'y', 'z', 'w'], sub: ['x', 'y', 'z', 'w'] } }];
    expect((await a.message('roster', { roster: repeated })).code).toBe('INVALID_ROSTER');
    expect((await a.message('start')).code).toBe('NOT_READY');
    await b.roomWhere(value => value.room.participants.length === 3);
    expect((await b.message('start')).code).toBe('FORBIDDEN');
    expect((await a.message('roster', { roster: defaultRoster('I') })).type).toBe('ack');
    await a.roomWhere(value => value.room.rosterReady.A);
    expect((await a.message('roster', { roster: defaultRoster('I') })).code).toBe('ROSTER_LOCKED');
  });

  it('enforces unit ownership, assignment generation, and preserves plans when responsibility changes', async () => {
    const server = await start(); const { a, b, aSession } = await pair(server);
    const session = (await post(server, '/api/rooms/join', { inviteCode: aSession.inviteCode, name: '担当', team: 'A' })).body as Session;
    const member = await connect(server, session); await a.roomWhere(value => value.room.participants.length === 3);
    await a.message('roster', { roster: defaultRoster('I') }); await b.roomWhere(value => value.room.rosterReady.A);
    await b.message('roster', { roster: defaultRoster('I') }); await a.roomWhere(value => value.room.rosterReady.B);
    await a.message('start'); await Promise.all([a.roomWhere(value => value.room.status === 'planning'), member.roomWhere(value => value.room.status === 'planning'), b.roomWhere(value => value.room.status === 'planning')]);
    const unitId = a.room.state!.units[0].id; const enemy = b.room.state!.units[0].id;
    expect((await a.message('plan', { unitId: enemy, commands: [{ kind: 'WAIT' }] })).code).toBe('FORBIDDEN');
    expect((await member.message('plan', { unitId, commands: [{ kind: 'WAIT' }] })).code).toBe('FORBIDDEN');
    expect((await a.message('plan', { unitId, commands: [{ kind: 'WAIT' }] })).type).toBe('ack');
    await a.roomWhere(value => value.plans.length === 1); const oldRevision = a.room.room.revision;
    expect((await a.message('assign', { unitId: enemy, participantId: aSession.participantId })).code).toBe('FORBIDDEN');
    expect((await a.message('assign', { unitId, participantId: session.participantId })).type).toBe('ack');
    await member.roomWhere(value => value.room.owners[unitId] === session.participantId);
    expect(member.room.plans[0].commands[0].kind).toBe('WAIT');
    expect((await a.message('plan', { unitId, commands: [] }, { revision: oldRevision })).code).toBe('STALE_REVISION');
    await a.roomWhere(value => value.room.revision > oldRevision);
    expect((await a.message('plan', { unitId, commands: [] })).code).toBe('FORBIDDEN');
    expect((await member.message('plan', { unitId, commands: [] })).type).toBe('ack');
  });

  it('serializes requests idempotently and rejects deadline equality and old turns', async () => {
    const server = await start(); const { a } = await begin(server);
    const unitId = a.room.state!.units[0].id;
    const packet = { type: 'plan', requestId: 'same', matchId: a.room.room.matchId, turn: 1, revision: a.room.room.revision, payload: { unitId, commands: [{ kind: 'WAIT' }] } };
    a.socket.send(JSON.stringify(packet)); const first = await a.next(value => value.requestId === 'same');
    a.socket.send(JSON.stringify(packet)); const second = await a.next(value => value.requestId === 'same'); expect(second).toEqual(first);
    a.socket.send(JSON.stringify({ ...packet, payload: { unitId, commands: [] } })); expect((await a.next(value => value.requestId === 'same')).code).toBe('REQUEST_REUSED');
    expect((await a.message('plan', { unitId, commands: [] }, { turn: 0 })).code).toBe('STALE_TURN');
    expect((await a.message('plan', { unitId, commands: [] }, { matchId: 'another-match' })).code).toBe('MATCH_MISMATCH');
    server.setTime(a.room.room.deadline! - 1);
    let release!: () => void;
    const room = server.app.rooms.get(a.room.room.id)!; room.tail = new Promise<void>(accept => { release = accept; });
    const beforeRead = server.clockReads(); const pending = a.message('plan', { unitId, commands: [{ kind: 'WAIT' }] });
    while (server.clockReads() === beforeRead) await new Promise<void>(accept => setImmediate(accept));
    server.setTime(a.room.room.deadline!); release();
    expect((await pending).type).toBe('ack'); // Received before the deadline, processed afterward.
    server.setTime(a.room.room.deadline!); expect((await a.message('plan', { unitId, commands: [] })).code).toBe('DEADLINE');
  });

  it('projects every downlink for its side and keeps full replay gated until finish', async () => {
    const server = await start(); const { a, b, aSession, bSession } = await begin(server);
    const ownIds = new Set(a.room.state!.units.map(unit => unit.id)); const enemyIds = new Set(b.room.state!.units.map(unit => unit.id));
    const ownId = a.room.state!.units[0].id; const enemyId = b.room.state!.units[0].id;
    expect((await a.message('plan', { unitId: ownId, commands: [{ kind: 'WAIT', mainDirection: 23 }] })).type).toBe('ack');
    expect((await b.message('plan', { unitId: enemyId, commands: [{ kind: 'WAIT', mainDirection: 17 }] })).type).toBe('ack');
    server.setTime(a.room.room.deadline!); await server.app.sweep();
    await Promise.all([a.roomWhere(value => value.room.status === 'resolving'), b.roomWhere(value => value.room.status === 'resolving')]);
    const previousPlans = a.room.turnReplay!.plans!;
    expect(previousPlans).toHaveLength(ownIds.size);
    expect(previousPlans.every(plan => ownIds.has(plan.unitId) && !enemyIds.has(plan.unitId))).toBe(true);
    expect(previousPlans.find(plan => plan.unitId === ownId)!.commands[0]).toEqual({ kind: 'WAIT', mainDirection: 23 });
    expect(b.room.turnReplay!.plans!.every(plan => enemyIds.has(plan.unitId) && !ownIds.has(plan.unitId))).toBe(true);
    expect(JSON.stringify(b.room.turnReplay!.plans)).not.toContain('mainDirection":23');
    // Internal additions to the stored full replay must never become downlink fields.
    Object.assign(server.app.rooms.get(aSession.roomId)!.replay!.turns[0].plans[0].commands[0], { internalMarker: 'private-plan-field' });
    server.setTime(a.room.room.deadline!); await server.app.sweep();
    await Promise.all([a.roomWhere(value => value.room.status === 'planning' && value.room.turn === 2), b.roomWhere(value => value.room.status === 'planning' && value.room.turn === 2)]);
    expect(a.room.plans).toEqual([]); expect(a.room.turnReplay!.turn).toBe(1); expect(a.room.turnReplay!.plans).toEqual(previousPlans);
    expect((await a.message('plan', { unitId: ownId, commands: [{ kind: 'WAIT', mainDirection: 42 }] })).type).toBe('ack');
    await a.roomWhere(value => value.plans.some(plan => plan.commands[0].mainDirection === 42));
    expect(a.room.turnReplay!.plans).toEqual(previousPlans);
    const bytes = JSON.stringify(a.messages);
    expect(bytes).not.toContain('"seed"'); expect(bytes).not.toContain('rngState'); expect(bytes).not.toContain('contactLinks');
    expect(bytes).not.toContain(aSession.token); expect(bytes).not.toContain(bSession.token); expect(bytes).not.toContain('mainDirection":17'); expect(bytes).not.toContain('private-plan-field');
    expect(a.room.state!.units.every(unit => unit.team === 'A')).toBe(true);
    expect(a.room.state!.contacts.filter(item => item.channel !== 'visual').every(item => item.hp === undefined && item.main === undefined && item.presetId === undefined && item.surfaceId === undefined)).toBe(true);
    const denied = await fetch(server.base + '/api/replays/' + aSession.roomId, { headers: { Authorization: `Bearer ${aSession.token}` } }); expect(denied.status).toBe(409);
    expect((await fetch(server.base + '/api/replays/' + aSession.roomId)).status).toBe(401);
  });

  it('shares contact tags only within a team, serializes tag edits, and forbids guessed opposing contacts', async () => {
    const server = await start(); const { a, b } = await begin(server);
    const contactId = a.room.state!.contacts[0].contactId;
    expect((await a.message('tag', { contactId, tag: '屋根？' })).type).toBe('ack');
    await a.roomWhere(value => !!value.state?.contacts.some(item => item.tag === '屋根？'));
    expect(JSON.stringify(b.messages)).not.toContain('屋根？');
    expect((await a.message('tag', { contactId, tag: '1234567890123' })).code).toBe('BAD_MESSAGE');
    expect((await b.message('tag', { contactId, tag: '侵入' })).code).toBe('UNKNOWN_CONTACT');
    expect((await a.message('tag', { contactId, tag: '' })).type).toBe('ack');
    await a.roomWhere(value => !!value.state && value.state.contacts.every(item => item.tag !== '屋根？'));
  });

  it('reconnects the same identity within sixty seconds and rejects strangers and expiry', async () => {
    const server = await start(); const { a, b, aSession } = await begin(server);
    await a.disconnect(); await b.roomWhere(value => value.room.participants.some(item => item.id === aSession.participantId && !item.connected));
    expect((await post(server, '/api/rooms/reconnect', { roomId: aSession.roomId, token: 'foreign' })).status).toBe(401);
    server.setTime(server.time() + 60_000);
    expect((await post(server, '/api/rooms/reconnect', { roomId: aSession.roomId, token: aSession.token })).body.participantId).toBe(aSession.participantId);
    const again = await connect(server, aSession); expect(again.room.room.owners[again.room.state!.units[0].id]).toBe(aSession.participantId);
    await b.roomWhere(value => value.room.participants.some(item => item.id === aSession.participantId && item.connected));
    await again.disconnect(); await b.roomWhere(value => value.room.participants.some(item => item.id === aSession.participantId && !item.connected));
    server.setTime(server.time() + 60_001);
    expect((await post(server, '/api/rooms/reconnect', { roomId: aSession.roomId, token: aSession.token })).body.code).toBe('RECONNECT_EXPIRED');
  });

  it('forfeits after a whole team is absent for 120 seconds, and aborts when both are absent', async () => {
    const server = await start(); const { a, b, aSession } = await begin(server);
    await a.disconnect(); await b.roomWhere(value => value.room.participants.some(item => item.id === aSession.participantId && !item.connected));
    server.setTime(server.time() + 119_999); await server.app.sweep(); expect(b.room.room.status).toBe('planning');
    server.setTime(server.time() + 1); await server.app.sweep(); await b.roomWhere(value => value.room.status === 'finished'); expect(b.room.room.result!.winner).toBe('B');
    const other = await start(); const both = await begin(other); await both.a.disconnect(); await both.b.disconnect();
    await new Promise(accept => setTimeout(accept, 10));
    other.setTime(other.time() + 120_000); await other.app.sweep();
    expect(other.app.rooms.get(both.aSession.roomId)!.result!.winner).toBe('aborted');
  });

  it('resolves six turns with unset WAIT plans, retains team playback and participant-only replay for 24 hours', async () => {
    const server = await start(); const { a, b, aSession } = await begin(server);
    for (let turn = 1; turn <= 6; turn++) {
      server.setTime(a.room.room.deadline!); await server.app.sweep();
      await Promise.all([a.roomWhere(value => value.room.status === 'resolving' && value.room.turn === turn), b.roomWhere(value => value.room.status === 'resolving' && value.room.turn === turn)]);
      expect(a.room.turnReplay!.frames.every(frame => frame.state.team === 'A')).toBe(true);
      expect(a.room.turnReplay!.maps.length).toBeLessThan(10);
      expect(a.room.turnReplay!.frames.every(frame => a.room.turnReplay!.maps[frame.mapIndex] && !('map' in frame.state))).toBe(true);
      const turnPlans = a.room.turnReplay!.plans!;
      expect(turnPlans).toHaveLength(9);
      expect(turnPlans.every(plan => a.room.state!.units.some(unit => unit.id === plan.unitId) && plan.commands[0].kind === 'WAIT')).toBe(true);
      server.setTime(a.room.room.deadline!); await server.app.sweep();
      await a.roomWhere(value => turn === 6 ? value.room.status === 'finished' : value.room.status === 'planning' && value.room.turn === turn + 1);
      if (turn < 6) { expect(a.room.turnReplay!.turn).toBe(turn); expect(a.room.turnReplay!.plans).toEqual(turnPlans); }
    }
    const response = await fetch(server.base + '/api/replays/' + aSession.roomId, { headers: { Authorization: `Bearer ${aSession.token}` } }); expect(response.status).toBe(200);
    const replay = deserializeReplay(await response.text()); expect(replay.turns).toHaveLength(6); expect(replay.manifest.seed).toBeGreaterThan(0); expect(replay.initialState.units).toHaveLength(18);
    expect(validateReplay(replay)).toEqual({ ok: true, errors: [] });
    expect(replay.turns[0].plans.every((plan: any) => plan.commands[0].kind === 'WAIT')).toBe(true);
    expect((await fetch(server.base + '/api/replays/' + aSession.roomId, { headers: { Authorization: 'Bearer stranger' } })).status).toBe(401);
    server.setTime(server.time() + 86_400_000); expect((await fetch(server.base + '/api/replays/' + aSession.roomId, { headers: { Authorization: `Bearer ${aSession.token}` } })).status).toBe(410);
    await server.app.sweep(); expect(server.app.rooms.has(aSession.roomId)).toBe(false);
  }, 120_000);
});
