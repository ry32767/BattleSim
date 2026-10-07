import type { Replay } from '@battle/contracts';
type Value = null | string | number | boolean | { $ref: number };
type Graph = { format: 'closed-battle-replay-graph-1'; root: Value; nodes: (Value[] | Record<string, Value>)[] };
/** Intern shared immutable terrain/checkpoints instead of duplicating each map for every tick. */
export function serializeReplay(replay: Replay): string {
  const ids = new Map<object, number>(), nodes: Graph['nodes'] = [];
  function visit(value: unknown): Value {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('INVALID_REPLAY_NUMBER'); return value; }
    if (typeof value !== 'object') throw new Error('INVALID_REPLAY_VALUE');
    const found = ids.get(value); if (found !== undefined) return { $ref: found };
    const index = nodes.length; ids.set(value, index); nodes.push([]);
    nodes[index] = Array.isArray(value) ? value.map(visit) : Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).map(([key, val]) => [key, visit(val)]));
    return { $ref: index };
  }
  const root = visit(replay); return JSON.stringify({ format: 'closed-battle-replay-graph-1', root, nodes } satisfies Graph);
}
export function deserializeReplay(text: string): Replay {
  if (text.length > 256 * 1024 * 1024) throw new Error('REPLAY_SIZE_LIMIT');
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object') throw new Error('INVALID_REPLAY');
  if (!('format' in raw)) return raw as Replay;
  const graph = raw as Graph;
  if (graph.format !== 'closed-battle-replay-graph-1' || !Array.isArray(graph.nodes) || graph.nodes.length > 2000000) throw new Error('UNKNOWN_REPLAY_FORMAT');
  const decoded: unknown[] = new Array(graph.nodes.length), visiting = new Set<number>();
  function visit(value: Value, depth: number): unknown {
    if (depth > 200) throw new Error('REPLAY_DEPTH_LIMIT');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object' || !Number.isSafeInteger(value.$ref) || value.$ref < 0 || value.$ref >= graph.nodes.length || Object.keys(value).length !== 1) throw new Error('INVALID_REPLAY_REFERENCE');
    const index = value.$ref;
    if (visiting.has(index)) throw new Error('CYCLIC_REPLAY');
    if (decoded[index] !== undefined) return decoded[index];
    const node = graph.nodes[index]; if (!node || typeof node !== 'object') throw new Error('INVALID_REPLAY_NODE');
    visiting.add(index);
    if (Array.isArray(node)) decoded[index] = node.map(v => visit(v, depth + 1));
    else { const result: Record<string, unknown> = {}; for (const [key, val] of Object.entries(node)) { if (['__proto__','constructor','prototype'].includes(key)) throw new Error('INVALID_REPLAY_KEY'); result[key] = visit(val, depth + 1); } decoded[index] = result; }
    visiting.delete(index); return decoded[index];
  }
  const replay = visit(graph.root, 0); if (!replay || typeof replay !== 'object') throw new Error('INVALID_REPLAY_ROOT'); return replay as Replay;
}
