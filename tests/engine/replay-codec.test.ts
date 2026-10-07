import { expect, it } from 'vitest';
import { compileMatch, resolveTurn } from '@battle/engine';
import { appendTurn, createReplay, deserializeReplay, serializeReplay, validateReplay } from '@battle/replay';
import { fixtureContent, fixtureMap, fixtureRoster } from '../fixtures/battle';
it('compact replay preserves shared terrain, every hash, and recorded observations',()=>{
  const state=compileMatch(fixtureMap(12,8),fixtureContent,{A:fixtureRoster,B:fixtureRoster},41);
  state.units=state.units.slice(0,1); const resolution=resolveTurn(state,[],fixtureContent);
  const record=appendTurn(createReplay(state),[],resolution), text=serializeReplay(record), decoded=deserializeReplay(text);
  expect(text.length).toBeLessThan(JSON.stringify(record).length/3);
  expect(decoded.turns[0].frames[0].state.map).toBe(decoded.turns[0].frames[1].state.map);
  expect(validateReplay(decoded)).toEqual({ok:true,errors:[]});
  decoded.turns[0].frames[7].state.units[0].hp--;
  expect(validateReplay(decoded).ok).toBe(false);
});
it('rejects malformed references, cycles, and prototype keys',()=>{
  const graph=(nodes:unknown[],root:unknown={$ref:0})=>JSON.stringify({format:'closed-battle-replay-graph-1',root,nodes});
  expect(()=>deserializeReplay(graph([],{$ref:4}))).toThrow('INVALID_REPLAY_REFERENCE');
  expect(()=>deserializeReplay(graph([{child:{$ref:0}}]))).toThrow('CYCLIC_REPLAY');
  expect(()=>deserializeReplay('{"format":"closed-battle-replay-graph-1","root":{"$ref":0},"nodes":[{"__proto__":null}]}')).toThrow('INVALID_REPLAY_KEY');
});
