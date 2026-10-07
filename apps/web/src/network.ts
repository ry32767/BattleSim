import type { BattleEvent, PublicState, Roster, Stage, Team, TurnPlan } from '@battle/contracts';
export type Session = { roomId: string; inviteCode: string; participantId: string; token: string; team: Team };
export type PublicRoom = { id: string; inviteCode: string; matchId: string | null; stage: Stage; status: string; hostId: string; revision: number; turn: number; deadline: number | null;
  participants: { id: string; name: string; team: Team; connected: boolean }[]; leaders: Record<Team, string | null>;
  roster: Roster | null; rosterReady: Record<Team, boolean>; owners: Record<string, string>; ready: string[]; result: unknown;
};
export type TeamFrame = { tick: number; state: PublicState; events: BattleEvent[] };
export type Snapshot = { type: 'room'; room: PublicRoom; state?: PublicState; plans: TurnPlan[]; events: BattleEvent[]; playback?: TeamFrame[]; turnReplay?: { turn: number; frames: TeamFrame[]; plans?: TurnPlan[] } };
type WireSnapshot = Omit<Snapshot, 'turnReplay'> & { turnReplay?: { turn: number; plans?: TurnPlan[]; maps: PublicState['map'][]; frames: { tick: number; state: Omit<PublicState, 'map'>; mapIndex: number; events: BattleEvent[] }[] } };
export function hydrateSnapshot(wire: WireSnapshot): Snapshot {
  if (!wire.turnReplay) return wire as Snapshot;
  const frames = wire.turnReplay.frames.map(f => {
    const map = wire.turnReplay!.maps[f.mapIndex]; if (!map) throw new Error('INVALID_FRAME_MAP');
    return { tick: f.tick, state: { ...f.state, map }, events: f.events };
  });
  return { ...wire, turnReplay: { turn: wire.turnReplay.turn, frames, plans:wire.turnReplay.plans }, ...(wire.room.status === 'resolving' ? { playback: frames.filter(f => f.tick >= 0) } : {}) };
}
export class RoomConnection {
  private ws: WebSocket | null = null;
  private counter = 0;
  constructor(readonly session: Session, readonly onSnapshot: (snapshot: Snapshot) => void, readonly onError: (text: string) => void, readonly onStatus: (status: string) => void, readonly onAck?: (id: string) => void) {}
  connect() {
    this.onStatus('接続中'); const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); this.ws = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ type: 'authenticate', roomId: this.session.roomId, token: this.session.token })); this.onStatus('接続済み'); };
    ws.onmessage = e => { try { const msg = JSON.parse(e.data); if (msg.type === 'room') this.onSnapshot(hydrateSnapshot(msg)); else if (msg.type === 'error') this.onError(msg.message || '更新が拒否されました'); else if (msg.type === 'ack') this.onAck?.(msg.requestId); } catch { this.onError('サーバーの応答を読み込めません'); } };
    ws.onerror = () => this.onError('対戦サーバーへ接続できません'); ws.onclose = () => this.onStatus('切断 / 再接続できます');
  }
  send(type: string, room: PublicRoom, payload: Record<string, unknown>) {
    if (this.ws?.readyState !== WebSocket.OPEN) { this.onError('再接続してから操作してください'); return; }
    const requestId = `web-${++this.counter}-${crypto.randomUUID()}`;
    this.ws.send(JSON.stringify({ type, requestId, revision: room.revision, turn: room.turn, matchId: room.matchId, payload })); return requestId;
  }
  close() { if (this.ws) { this.ws.onclose = null; this.ws.close(); } this.ws = null; }
}
export async function createRoom(name: string, stage: Stage): Promise<Session> {
  return post('/api/rooms', { name, stage, team: 'A' });
}
export async function joinRoom(name: string, inviteCode: string, team: Team): Promise<Session> { return post('/api/rooms/join', { name, inviteCode, team }); }
async function post(url: string, body: unknown): Promise<Session> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.message || data.error || 'ルーム操作に失敗しました'); return data;
}
export async function reconnectRoom(session: Session) { return post('/api/rooms/reconnect', { roomId: session.roomId, token: session.token }); }
