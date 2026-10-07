import { useEffect, useRef, useState } from 'react';
import type { BattleEvent, Frame, PublicState, Replay, Team, TurnPlan } from '@battle/contracts';
import { Board } from './Board';
import { actionFrameIndices, adjacentActionFrame } from './replayTimeline';
import { downloadReplay } from './storage';
import type { TeamFrame } from './network';
import { eventCategoryMatches, eventReason, eventTitle } from './events';

type Props = { replay?: Replay; teamFrames?: { turn: number; frames: TeamFrame[]; plans?:TurnPlan[] }; allowedFull: boolean; team: Team; planningRemaining?: number; onClose: () => void };
export function ReplayModal({ replay, teamFrames, allowedFull, team, planningRemaining, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const [turnIndex, setTurnIndex] = useState(Math.max(0, (replay?.turns.length ?? 1) - 1));
  const [index, setIndex] = useState(0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1);
  const [perspective, setPerspective] = useState<Team | 'full'>(allowedFull ? 'full' : team);
  const [selected, setSelected] = useState<string | null>(null), [filter, setFilter] = useState('all'), [unitFilter, setUnitFilter] = useState('all');
  const [teamFilter,setTeamFilter]=useState('all'), [routeExpanded,setRouteExpanded]=useState(false);
  const [flat, setFlat] = useState(false), [focus, setFocus] = useState<{ cellId: string; serial: number } | null>(null);
  const [sidePanel,setSidePanel]=useState<'radar'|'events'|null>(null), [radarOpen,setRadarOpen]=useState(false);
  useEffect(() => { const d = dialog.current; const previous = document.activeElement as HTMLElement | null; d?.showModal(); closeButton.current?.focus(); return () => { d?.close(); previous?.focus(); }; }, []);
  const turn = replay?.turns[turnIndex], frames = turn?.frames ?? [];
  const count = teamFrames?.frames.length ?? frames.length;
  useEffect(() => { if (!playing) return; const id = setInterval(() => setIndex(i => { if (i >= count - 1) { setPlaying(false); return i; } return i + 1; }), 100 / speed); return () => clearInterval(id); }, [playing, speed, count]);
  const frame = frames[Math.min(index, frames.length - 1)], tf = teamFrames?.frames[Math.min(index, (teamFrames?.frames.length ?? 1) - 1)];
  let view: PublicState | undefined = tf?.state;
  if (frame) {
    view = frame.views[perspective === 'full' ? team : perspective];
    if (perspective === 'full' && allowedFull) view = { ...view, units: frame.state.units, contacts: [], map: frame.state.map, projectiles: frame.state.projectiles.map(p => ({ id: p.id, position: p.position, radius: p.radius, kind: 'blast' as const })), visibleCells: frame.state.map.cells.map(c => c.id) };
  }
  const events = tf ? teamFrames!.frames.flatMap(f => f.events) : turn ? perspective === 'full' && allowedFull ? turn.events : turn.frames.flatMap(f => f.teamEvents[perspective === 'full' ? team : perspective]) : [];
  const unique = [...new Map(events.map(e => [e.id, e])).values()];
  const actionIndices = actionFrameIndices(teamFrames?.frames ?? frames, unique);
  const actionIndex = Math.max(0, actionIndices.filter(i=>i<=index).length-1);
  const stepAction = (delta: -1 | 1) => { setPlaying(false); setIndex(i=>adjacentActionFrame(actionIndices,i,delta)); };
  const eventTeam=(id:string|undefined)=>id?view?.units.find(u=>u.id===id)?.team ?? (view?.contacts.some(c=>c.contactId===id)?(view.team==='A'?'B':'A'):undefined):undefined;
  const shown = unique.filter(e => eventCategoryMatches(e,filter) && (unitFilter === 'all' || e.actorId === unitFilter || e.targetId === unitFilter) && (teamFilter==='all'||eventTeam(e.actorId)===teamFilter||eventTeam(e.targetId)===teamFilter));
  const currentEvents = tf?.events ?? frame?.[perspective === 'full' && allowedFull ? 'events' : 'teamEvents'];
  const boardEvents: BattleEvent[] = Array.isArray(currentEvents) ? currentEvents : currentEvents?.[perspective === 'full' ? team : perspective] ?? [];
  const jumpEvent = (e: BattleEvent) => {
    const all = teamFrames?.frames ?? frames;
    const ix = all.findIndex(f => f.tick >= e.tick); setIndex(ix < 0 ? count - 1 : ix); setPlaying(false);
    if (e.actorId || e.targetId) setSelected(e.actorId ?? e.targetId ?? null);
    const from = e.to ?? e.from; if (from && view) { const c = view.map.cells.find(c => c.surfaces.some(s => s.id === from)); if (c) setFocus({ cellId: c.id, serial: Date.now() }); }
  };
  const tick = tf?.tick ?? frame?.tick ?? 0;
  const stepEvent = (delta: number) => { const evs = unique.filter(e => delta > 0 ? e.tick > tick : e.tick < tick); const ordered = evs.sort((a,b)=>a.tick-b.tick); const e = delta > 0 ? ordered[0] : ordered[ordered.length - 1]; if (e) jumpEvent(e); };
  const visibleOwnIds=new Set(view?.units.map(u=>u.id));
  const disclosedPlans=(teamFrames?.plans ?? turn?.plans ?? []).filter(p=>visibleOwnIds.has(p.unitId));
  const selectedPlan=disclosedPlans.find(p=>p.unitId===selected), planned=selectedPlan?.commands.filter(c=>c.kind==='MOVE').flatMap(c=>c.path??[])??[];
  const movements=unique.filter(e=>e.actorId===selected&&['MOVE_LAND','IDATEN_MOVE','FORCED_FALL'].includes(e.kind)&&e.to);
  const actual=movements.map(e=>e.to!), origin=(teamFrames?.frames[0]?.state.units ?? (perspective==='full'&&allowedFull?frames[0]?.state.units:frames[0]?.views[perspective==='full'?team:perspective].units))?.find(u=>u.id===selected)?.surfaceId;
  let common=0;while(common<planned.length&&common<actual.length&&planned[common]===actual[common])common++;
  const stopEvents=unique.filter(e=>(e.actorId===selected||e.targetId===selected)&&/CANCEL|STOP|CONFLICT|DEFEND|EVADE|DEFEAT/.test(e.kind));
  const selectUnit=(id:string)=>{setSelected(id||null);const unit=view?.units.find(u=>u.id===id),contact=view?.contacts.find(c=>c.contactId===id),cell=unit?view?.map.cells.find(c=>c.surfaces.some(s=>s.id===unit.surfaceId)):view?.map.cells.find(c=>c.id===contact?.reportedCell);if(cell)setFocus({cellId:cell.id,serial:Date.now()});};
  return <dialog ref={dialog} className="replay-dialog" onCancel={onClose}>
    <div className="replay-header"><div><span className="eyebrow">BATTLE RECORD</span><h2>戦闘リプレイ</h2></div><div className="row">
      {planningRemaining !== undefined && <span className="timer small">行動設定 残り {planningRemaining}秒</span>}
      {replay && <button onClick={() => downloadReplay(replay)}>JSON保存</button>}<button ref={closeButton} onClick={onClose}>閉じて設定へ戻る ×</button>
    </div></div>
    <div className="replay-options"><label>ターン <select value={turnIndex} onChange={e => { setTurnIndex(Number(e.target.value)); setIndex(0); setPlaying(false); }}>
      {(replay?.turns ?? [{ turn: teamFrames?.turn ?? 1 }]).map((t, i) => <option key={i} value={i}>TURN {t.turn}</option>)}</select></label>
      <label>視点 <select aria-label="視点" value={perspective} onChange={e => { setPerspective(e.target.value as Team | 'full'); setSelected(null);setUnitFilter('all');setTeamFilter('all'); }}><option value={team}>自陣営の当時視点</option>{allowedFull && <><option value={team === 'A' ? 'B' : 'A'}>相手陣営の当時視点</option><option value="full">試合後の全体視点</option></>}</select></label>
      <label>注目するユニット <select value={selected??''} onChange={e=>selectUnit(e.target.value)}><option value="">全体</option>{view?.units.map(u=><option key={u.id} value={u.id}>{u.team} {u.name}-{u.copy}</option>)}{view?.contacts.map(c=><option key={c.contactId} value={c.contactId}>{c.tag||c.number}{c.channel==='visual'?` ${c.name}`:''}</option>)}</select></label>
      <button onClick={() => setFlat(x => !x)}>{flat ? '斜め俯瞰に切替' : '平面に切替'}</button><button onClick={()=>setRadarOpen(true)}>レーダーを拡大</button><span>記録から復元 · 再抽選なし</span></div>
    {view ? <div className="replay-layout"><div className="replay-board" data-frame-tick={tick} data-perspective={perspective}><Board key={perspective} view={view} selected={selected} animate={playing} playbackSpeed={speed} onSelect={selectUnit} flat={flat} focus={focus} events={boardEvents} sectors allSectors plans={disclosedPlans} plannedOrigin={origin} actualPath={origin?[origin,...actual]:actual} />
      {selected&&view.units.some(u=>u.id===selected)&&<div className={`route-comparison ${routeExpanded ? 'expanded' : ''}`}><button className="route-toggle" aria-expanded={routeExpanded} onClick={()=>setRouteExpanded(v=>!v)}>{routeExpanded ? '閉じる' : '詳細'}</button><strong>ターン全体の経路比較</strong><p>┄ 予定 {planned.length}辺 / ━ 実移動 {actual.length}辺（追跡・護衛などを含む）</p>{planned.length>0&&<p>{common===planned.length?'予定の移動先をすべて順に通過':`最初の相違: ${planned[common]} → ${actual[common]??'未到達'}`}</p>}{stopEvents.length>0&&<p>記録された消費・中断: {stopEvents.slice(0,4).map(e=><button key={e.id} onClick={()=>jumpEvent(e)}>{(e.tick/10).toFixed(1)}秒 {eventTitle(e)}</button>)}</p>}</div>}
      <div className="replay-player"><div className="row"><button onClick={() => stepAction(-1)}>前の行動tick</button><button className="primary" onClick={() => setPlaying(p => !p)}>{playing ? '停止' : '再生'}</button><button onClick={() => stepAction(1)}>次の行動tick</button><button onClick={() => stepEvent(-1)}>前の出来事</button><button onClick={() => stepEvent(1)}>次の出来事</button><label>速度 <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[.25, .5, 1, 2].map(s => <option key={s} value={s}>{s}倍</option>)}</select></label></div>
      <input aria-label="リプレイ時刻" type="range" min={0} max={Math.max(0, actionIndices.length - 1)} value={actionIndex} onChange={e => { setIndex(actionIndices[Number(e.target.value)] ?? 0); setPlaying(false); }} /><div className="row spread"><span className="mono" data-action-tick={tick}>{tick<0?'開始':`行動tick ${tick}`} · {(Math.max(0, tick % 150) / 10).toFixed(1)} / 15.0秒</span><span className="mono hash">{frame?.stateHash.slice(0, 20) ?? '陣営公開記録'}</span></div></div>
    </div><nav className="replay-panel-tabs tabs compact"><button aria-expanded={sidePanel==='radar'} onClick={()=>setSidePanel(p=>p==='radar'?null:'radar')}>レーダー {sidePanel==='radar'?'⌄':'⌃'}</button><button aria-expanded={sidePanel==='events'} onClick={()=>setSidePanel(p=>p==='events'?null:'events')}>出来事・原因 {sidePanel==='events'?'⌄':'⌃'}</button></nav><aside className={`replay-side-panels mobile-${sidePanel??'closed'}`}><section className="replay-radar-panel" aria-label="リプレイ同期レーダー" data-frame-tick={tick} data-perspective={perspective}><div className="replay-radar-header"><h3>RADAR</h3><span className="mono">{(Math.max(0, tick % 150) / 10).toFixed(1)}秒 · 盤面と同期</span></div><Board view={view} selected={selected} onSelect={selectUnit} radar sectors={false} paths={false} events={boardEvents} animate={playing} playbackSpeed={speed} /></section><section className="replay-events"><h3>出来事と原因</h3><div className="row"><select aria-label="出来事の陣営" value={teamFilter} onChange={e=>setTeamFilter(e.target.value)}><option value="all">両陣営</option><option value="A">陣営 A</option><option value="B">陣営 B</option></select><select aria-label="出来事の種類" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">すべて</option><option value="attack">攻撃</option><option value="defend">防御</option><option value="damage">被害</option><option value="defeat">撃破</option><option value="move">移動</option><option value="stop">中断</option><option value="detect">探知</option></select><select aria-label="出来事のユニット" value={unitFilter} onChange={e => setUnitFilter(e.target.value)}><option value="all">全ユニット</option>{view.units.map(u => <option key={u.id} value={u.id}>{u.name}-{u.copy}</option>)}{view.contacts.map(c=><option key={c.contactId} value={c.contactId}>{c.tag || c.number}{c.channel === 'visual' ? ` · ${c.name}` : ''}</option>)}</select></div>
      <div className="event-list">{shown.length ? shown.map(e => <button key={e.id} className={`event-row ${e.tick === tick ? 'active' : ''}`} onClick={() => jumpEvent(e)}><span className="mono">{((e.tick % 150) / 10).toFixed(1)}s · {e.kind}</span><strong>{eventTitle(e)}</strong><small>{eventReason(e)}{e.apBefore !== undefined ? ` · AP ${e.apBefore} → ${e.apAfter}` : ''}{e.damage !== undefined ? ` · 被害 ${e.damage}` : ''}{e.reduction !== undefined ? ` · 軽減 ${e.reduction}` : ''}</small><small>同時群 {e.groupId}</small></button>) : <p className="empty">該当する出来事はありません。</p>}</div>
    </section></aside></div> : <p className="empty">この記録には再生できるフレームがありません。</p>}
    {radarOpen && view && <ExpandedReplayRadar view={view} selected={selected} onSelect={selectUnit} onClose={()=>setRadarOpen(false)} />}
  </dialog>;
}
function ExpandedReplayRadar({view,selected,onSelect,onClose}:{view:PublicState;selected:string|null;onSelect:(id:string)=>void;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
  return <dialog ref={ref} className="simple-dialog radar-dialog" aria-label="拡大リプレイレーダー" onCancel={onClose}><div className="row spread"><h2>拡大レーダー</h2><button autoFocus onClick={onClose}>閉じる ×</button></div><div className="expanded-radar" data-frame-tick={view.absoluteTick}><Board radar radarControls view={view} selected={selected} onSelect={onSelect}/><p>北↑ · 盤面と同期</p></div></dialog>;
}
export function publicFrame(frame: Frame, team: Team): TeamFrame { return { tick: frame.tick, state: frame.views[team], events: frame.teamEvents[team] }; }
