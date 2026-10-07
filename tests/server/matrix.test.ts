import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { defaultRoster } from '@battle/content';
import { initializeHashing, stateHash } from '@battle/engine';
import { deserializeReplay } from '@battle/replay';
import { STAGES, type Stage, type Team } from '@battle/contracts';
import { createBattleServer, type RoomMessage, type Session } from '../../apps/server/src/index';

type Reply = { type: 'ack' | 'error'; requestId: string; revision: number; code?: string };
type Packet = RoomMessage | Reply;
class Peer {
  latest!: RoomMessage;
  private counter = 0;
  private waiting: { accepts: (packet: Packet) => boolean; resolve: (packet: Packet) => void; timer: ReturnType<typeof setTimeout> }[] = [];
  private replies: Reply[] = [];
  constructor(readonly socket: WebSocket, readonly session: Session) {
    socket.on('message', data => {
      const packet = JSON.parse(data.toString()) as Packet;
      if (packet.type === 'room') this.latest = packet;
      const index = this.waiting.findIndex(waiter => waiter.accepts(packet));
      if (index >= 0) { const [waiter] = this.waiting.splice(index, 1); clearTimeout(waiter.timer); waiter.resolve(packet); }
      else if (packet.type !== 'room') this.replies.push(packet);
    });
  }
  private next<T extends Packet>(accepts: (packet: Packet) => boolean): Promise<T> {
    const index = this.replies.findIndex(accepts);
    if (index >= 0) return Promise.resolve(this.replies.splice(index, 1)[0] as T);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { const index = this.waiting.findIndex(waiter => waiter.timer === timer); if (index >= 0) this.waiting.splice(index, 1); reject(new Error('Server matrix response timed out')); }, 30_000);
      this.waiting.push({ accepts, resolve: packet => resolve(packet as T), timer });
    });
  }
  room(accepts: (packet: RoomMessage) => boolean): Promise<RoomMessage> {
    return this.latest && accepts(this.latest) ? Promise.resolve(this.latest) : this.next<RoomMessage>(packet => packet.type === 'room' && accepts(packet));
  }
  async update(type: string, payload: Record<string, unknown> = {}): Promise<void> {
    const requestId = `matrix-${++this.counter}`; const { matchId, turn, revision } = this.latest.room;
    this.socket.send(JSON.stringify({ type, requestId, matchId, turn, revision, payload }));
    const reply = await this.next<Reply>(packet => packet.type !== 'room' && packet.requestId === requestId);
    expect(reply.type, reply.code ?? type).toBe('ack');
    await this.room(packet => packet.room.revision >= reply.revision);
  }
}
const activeApps: ReturnType<typeof createBattleServer>[] = [];
const activeSockets: WebSocket[] = [];
beforeAll(async () => { await initializeHashing(); });
afterEach(async () => {
  for (const socket of activeSockets.splice(0)) socket.terminate();
  for (const app of activeApps.splice(0)) await app.close();
});

const matrix = (['I', 'II', 'III'] as Stage[]).flatMap(stage => [1, 4].map(players => ({ stage, players })));
describe('P9 all stages × one/four participants per team', () => {
  it.each(matrix)('stage $stage with $players players per team completes six authoritative turns', async ({ stage, players }) => {
    let clock = 1_000;
    // Only test-clock durations are shortened. Production remains 150s +15s.
    const app = createBattleServer({ now: () => clock, planningMs: 1_500, resolvingMs: 150, autoTimers: false });
    activeApps.push(app); const port = await app.listen(0); const base = `http://127.0.0.1:${port}`;
    async function post(path: string, body: object): Promise<Session> {
      const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      expect(response.status).toBe(201); return response.json() as Promise<Session>;
    }
    async function connect(session: Session): Promise<Peer> {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`); activeSockets.push(socket); const peer = new Peer(socket, session);
      await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
      socket.send(JSON.stringify({ type: 'authenticate', roomId: session.roomId, token: session.token }));
      await peer.room(() => true); return peer;
    }
    const host = await connect(await post('/api/rooms', { name: 'A1', team: 'A', stage }));
    const parties: Record<Team, Peer[]> = { A: [host], B: [] };
    for (const team of ['A', 'B'] as const) for (let index = team === 'A' ? 1 : 0; index < players; index++) {
      parties[team].push(await connect(await post('/api/rooms/join', { inviteCode: host.session.inviteCode, name: `${team}${index + 1}`, team })));
    }
    const peers = [...parties.A, ...parties.B];
    await Promise.all(peers.map(peer => peer.room(packet => packet.room.participants.length === players * 2 && packet.room.participants.every(participant => participant.connected))));
    for (const team of ['A', 'B'] as const) {
      const leader = parties[team][0];
      await leader.room(packet => packet.room.revision >= host.latest.room.revision);
      await leader.update('roster', { roster: defaultRoster(stage, team) });
      await Promise.all(peers.map(peer => peer.room(packet => packet.room.rosterReady[team])));
      if (players === 4) {
        const ids = Object.keys(leader.latest.room.owners).sort();
        for (let index = 0; index < ids.length; index++) await leader.update('assign', { unitId: ids[index], participantId: parties[team][index % players].session.participantId });
      }
      const revision = leader.latest.room.revision;
      await Promise.all(peers.map(peer => peer.room(packet => packet.room.revision >= revision)));
    }
    await host.update('start');
    await Promise.all(peers.map(peer => peer.room(packet => packet.room.status === 'planning')));
    const expectedCount = STAGES[stage].total;
    for (const peer of peers) {
      const ids = new Set(parties[peer.session.team].map(member => member.session.participantId));
      expect(peer.latest.state!.units).toHaveLength(expectedCount); expect(Object.keys(peer.latest.room.owners)).toHaveLength(expectedCount);
      expect(peer.latest.state!.units.every(unit => unit.team === peer.session.team && ids.has(peer.latest.room.owners[unit.id]))).toBe(true);
      expect(peer.latest.plans).toEqual([]);
      if (players === 4) expect(new Set(Object.values(peer.latest.room.owners)).size).toBe(4);
    }
    for (let turn = 1; turn <= 6; turn++) {
      clock = host.latest.room.deadline!; await app.sweep();
      await Promise.all(peers.map(peer => peer.room(packet => packet.room.status === 'resolving' && packet.room.turn === turn)));
      for (const peer of peers) {
        const playback = peer.latest.turnReplay!;
        expect(playback.turn).toBe(turn); expect(playback.frames).toHaveLength(151);
        expect(playback.frames.every(frame => frame.state.team === peer.session.team && frame.state.units.length === expectedCount && !!playback.maps[frame.mapIndex])).toBe(true);
        expect(peer.latest.state!.units.every(unit => unit.team === peer.session.team)).toBe(true);
      }
      clock = host.latest.room.deadline!; await app.sweep();
      await Promise.all(peers.map(peer => peer.room(packet => turn === 6 ? packet.room.status === 'finished' : packet.room.status === 'planning' && packet.room.turn === turn + 1)));
    }
    const response = await fetch(`${base}/api/replays/${host.session.roomId}`, { headers: { Authorization: `Bearer ${host.session.token}` } });
    expect(response.status).toBe(200); const replay = deserializeReplay(await response.text());
    expect(replay.turns).toHaveLength(6); expect(replay.initialState.units).toHaveLength(expectedCount * 2);
    expect(replay.initialState.manifest.stage).toBe(stage); expect(replay.result!.threshold).toBe(STAGES[stage].threshold);
    expect(['A', 'B', 'draw']).toContain(replay.result!.winner); expect(replay.result).toEqual(host.latest.room.result);
    expect(replay.turns[0].plans).toHaveLength(expectedCount * 2);
    expect(replay.turns.every(turn => turn.plans.every(plan => plan.commands.length === 1 && plan.commands[0].kind === 'WAIT'))).toBe(true);
    for (const turn of replay.turns) {
      expect(turn.frames).toHaveLength(151); expect(turn.frames.every((frame, index) => frame.tick === index - 1)).toBe(true);
      for (const frame of [turn.frames[0], turn.frames.at(-1)!]) {
        expect(frame.stateHash).toBe(stateHash(frame.state)); expect(frame.state.units).toHaveLength(expectedCount * 2);
        expect(frame.views.A.units).toHaveLength(expectedCount); expect(frame.views.B.units).toHaveLength(expectedCount);
      }
    }
  }, 120_000);
});
