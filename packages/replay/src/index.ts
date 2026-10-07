import type { BattleState, PublicState, Replay, Team, TurnPlan, TurnResolution, Validation } from '@battle/contracts';
import { canonicalJSON, prepareImmutableState, projectState, stateHash } from '@battle/engine';
export * from './codec';
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
export function createReplay(initialState:BattleState):Replay {
  if(initialState.manifest.ruleVersion!=='R1.3')throw new Error('UNKNOWN_RULE_VERSION');
  return {version:'replay-R1.3-fullframes-1',manifest:copy(initialState.manifest),contentVersion:initialState.manifest.contentVersion,mapVersion:initialState.manifest.mapVersion,initialState:copy(initialState),turns:[],result:null};
}
export function appendTurn(replay:Replay,plans:TurnPlan[],resolution:TurnResolution):Replay {
  const turn=replay.turns.length+1;if(replay.result||turn>6||resolution.frames[0]?.state.turn!==turn)throw new Error('REPLAY_TURN_SEQUENCE');
  if(canonicalJSON(resolution.frames[0]!.state.manifest)!==canonicalJSON(replay.manifest))throw new Error('REPLAY_MANIFEST_MISMATCH');
  return {...replay,turns:[...replay.turns,{turn,plans:copy(plans),frames:resolution.frames,events:resolution.fullEvents}],result:resolution.result};
}
export function replayFrame(replay:Replay,turn:number,tick:number,team:Team):PublicState;
export function replayFrame(replay:Replay,turn:number,tick:number):BattleState;
export function replayFrame(replay:Replay,turn:number,tick:number,team?:Team):BattleState|PublicState {
  if(replay.version!=='replay-R1.3-fullframes-1'||replay.manifest.ruleVersion!=='R1.3')throw new Error('UNKNOWN_REPLAY_VERSION');
  if(!Number.isInteger(turn)||!Number.isInteger(tick)||turn<1||turn>6||tick< -1||tick>149)throw new Error('INVALID_REPLAY_TIME');
  if(turn===1&&tick===-1&&!replay.turns.length)return team?projectState(replay.initialState,team):copy(replay.initialState);
  const frame=replay.turns.find(t=>t.turn===turn)?.frames.find(f=>f.tick===tick);if(!frame)throw new Error('MISSING_REPLAY_FRAME');
  if(frame.stateHash!==stateHash(prepareImmutableState(frame.state)))throw new Error('REPLAY_HASH_MISMATCH');return copy(team?frame.views[team]:frame.state);
}
export function validateReplay(replay:Replay):Validation {
  const errors:string[]=[];if(!replay||replay.version!=='replay-R1.3-fullframes-1'||replay.manifest.ruleVersion!=='R1.3')return {ok:false,errors:['UNKNOWN_REPLAY_VERSION']};
  if(canonicalJSON(replay.manifest)!==canonicalJSON(replay.initialState.manifest)||replay.contentVersion!==replay.manifest.contentVersion||replay.mapVersion!==replay.manifest.mapVersion)errors.push('REPLAY_MANIFEST_MISMATCH');
  for(let i=0;i<replay.turns.length;i++){const turn=replay.turns[i]!;if(turn.turn!==i+1)errors.push('REPLAY_TURN_SEQUENCE');if(turn.frames.length!==151)errors.push('MISSING_REPLAY_FRAME');for(let index=0;index<turn.frames.length;index++){const frame=turn.frames[index]!;if(frame.tick!==index-1)errors.push('MISSING_REPLAY_FRAME');if(stateHash(prepareImmutableState(frame.state))!==frame.stateHash)errors.push(`REPLAY_HASH_MISMATCH:${turn.turn}:${frame.tick}`);if(canonicalJSON(frame.state.manifest)!==canonicalJSON(replay.manifest))errors.push('REPLAY_MANIFEST_MISMATCH');for(const team of ['A','B'] as const)if(canonicalJSON(frame.views[team])!==canonicalJSON(projectState(frame.state,team)))errors.push(`REPLAY_VIEW_MISMATCH:${turn.turn}:${frame.tick}:${team}`);}}
  return {ok:errors.length===0,errors};
}
