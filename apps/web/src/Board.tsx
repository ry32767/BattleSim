import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { BattleEvent, BattleMap, Cell, Command, Contact, PublicState, TurnPlan, UnitState, Point3 } from '@battle/contracts';
import { generateSolids, hexDistance } from '@battle/engine';
import { content } from '@battle/content';
import { displayIconUrl } from './officialIcons';
import { combatEffect } from './combatEffects';
import { eventTitle } from './events';
import { drawPawn, PAWN_HEIGHT, type PawnAction, type PawnOptions } from './pawns';
import { boardBasis, boardDepth, boardDirection, boardWorldDepth, containsBoardHex, HEX_HALF_WIDTH, HEX_VERTICES, normalizeDirection, projectBoard, projectCell } from './boardProjection';

type Camera = { x: number; y: number; zoom: number };
type Props = {
  expanded?: boolean; onExpand?: () => void; onActionFlow?: () => void;
  view: PublicState; selected: string | null; plans?: TurnPlan[]; flat?: boolean;
  sectors?: boolean; allSectors?: boolean; radarControls?: boolean; vision?: boolean; paths?: boolean; radar?: boolean; autoNumbers?: boolean;
  events?: BattleEvent[]; focus?: { cellId: string; serial: number } | null;
  onSelect: (id: string) => void; onSurface?: (id: string) => void;
  onDirection?: (slot: 'main' | 'sub', direction: number) => void;
  onDirectionCommit?: (slot: 'main' | 'sub', direction: number) => void;
  onContextMenu?: (id: string, point: { x: number; y: number }) => void;
  onDoubleClick?: (id: string) => void;
  equipment?: Pick<Command, 'main' | 'sub' | 'mainDirection' | 'subDirection' | 'mainMode' | 'subMode'>;
  surfacePicking?: boolean;
  animate?: boolean; playbackSpeed?: number;
  reducedMotion?: boolean; monochrome?: boolean; actualPath?: string[]; plannedOrigin?: string;
};
const HEX_X = HEX_HALF_WIDTH;
const EMPTY_EVENTS: BattleEvent[] = [];
const vertices = HEX_VERTICES;
function pathHex(ctx: CanvasRenderingContext2D, x: number, y: number, flat: boolean, yaw: number, scale = 1) {
  ctx.beginPath(); vertices.forEach(([a, b], i) => {
    const [vx, vy] = projectBoard(a, b, 0, flat, yaw), px = x + vx * scale, py = y + vy * scale;
    if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }); ctx.closePath();
}
function palette() {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(['navy', 'navy-raised', 'white', 'ink', 'muted', 'blue', 'cyan', 'amber', 'ground', 'road', 'alley', 'roof', 'roof-selected', 'wall-left', 'wall-right', 'grid', 'fog', 'main-fill', 'sub-fill', 'unit-a', 'unit-b', 'danger'].map(k => [k, style.getPropertyValue('--' + k).trim()]));
}
// Physical bodies and larger identification badges share authored vector designs.
function combatPawn(ctx:CanvasRenderingContext2D,x:number,y:number,options:PawnOptions,selected:boolean,p:Record<string,string>,zoom:number,layer:'physical'|'badge') {
  if(layer==='physical') {
  if(selected){ctx.strokeStyle=p.cyan;ctx.lineWidth=1.5/zoom;ctx.beginPath();ctx.ellipse(x,y,10/zoom,5/zoom,0,0,Math.PI*2);ctx.stroke();}
  drawPawn(ctx,x,y,{...options,scale:8.4/PAWN_HEIGHT}); return;
  }
  const badgeY=y-14/zoom;
  ctx.strokeStyle=p.muted;ctx.lineWidth=.7/zoom;ctx.beginPath();ctx.moveTo(x,y-8.4);ctx.lineTo(x,badgeY);ctx.stroke();
  ctx.fillStyle=p.white;ctx.globalAlpha=.92;ctx.beginPath();ctx.arc(x,badgeY-13/zoom,18/zoom,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  drawPawn(ctx,x,badgeY,{...options,scale:1/zoom});
}
export function Board({ expanded = false, onExpand, onActionFlow, view, selected, plans = [], flat = false, sectors = true, allSectors = false, radarControls = false, vision = false, paths = true, radar = false, autoNumbers = true, events = EMPTY_EVENTS, focus, equipment, surfacePicking, animate = false, playbackSpeed = 1, reducedMotion=false, monochrome=false, actualPath=[], plannedOrigin, onSelect, onSurface, onDirection, onDirectionCommit, onContextMenu, onDoubleClick }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null), host = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 560 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [yaw, setYaw] = useState(0);
  const isFlat = flat || radar, rotation = isFlat ? 0 : yaw;
  const center = (cell: Cell, z: number, useFlat: boolean): [number, number] => projectCell(cell, z, useFlat, rotation);
  const drawHex = (ctx: CanvasRenderingContext2D, x: number, y: number, useFlat: boolean) => pathHex(ctx, x, y, useFlat, rotation);
  const [overlap, setOverlap] = useState<{x:number;y:number;items:{id:string;label:string}[]} | null>(null);
  const motionReduced=reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [paintTime, setPaintTime] = useState(0);
  const [effectTrail, setEffectTrail] = useState<BattleEvent[]>([]);
  useEffect(() => {
    const tick = view.absoluteTick % 150;
    setEffectTrail(old => {
      const next = [...new Map([...old.filter(e => e.turn === view.turn && e.tick <= tick && e.tick >= tick - 4), ...events].map(e => [e.id, e])).values()];
      return next.length === old.length && next.every((e,i)=>e.id===old[i].id) ? old : next;
    });
  }, [events, view.turn, view.absoluteTick]);
  const transition = useMemo(() => ({ arrival: performance.now() }), [view]);
  const solids = useMemo(() => generateSolids(view.map), [view.map]);
  const bases = useMemo(()=>new Set(solids.map(s=>`${s.cellId}:${s.bottom}`)),[solids]);
  const colors = useMemo(palette,[]);
  useEffect(() => {
    if (!animate || radar || motionReduced || !view.units.some(u => u.pendingMove) && !view.projectiles?.length && !effectTrail.some(e=>combatEffect(e))) return;
    let frame = 0, last = 0;
    const draw = (now: number) => { if (now - last >= 1000 / 30) { setPaintTime(now); last = now; } frame = requestAnimationFrame(draw); };
    frame = requestAnimationFrame(draw); return () => cancelAnimationFrame(frame);
  }, [view, radar, animate, motionReduced, effectTrail]);
  const drag = useRef<{ x: number; y: number; camera: Camera; yaw: number; moved: boolean; rotate?: boolean; direction?: 'main' | 'sub'; value?: number } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null), held = useRef(false);
  const cancelHold = () => { if(holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current=null; };
  useEffect(() => () => { if (clickTimer.current) clearTimeout(clickTimer.current); if(holdTimer.current) clearTimeout(holdTimer.current); }, []);
  const cells = view.map.cells, cellMap = useMemo(() => new Map(cells.map(c => [c.id, c])), [cells]);
  const chosen = view.units.find(u => u.id === selected);
  const contact = view.contacts.find(c => c.contactId === selected);
  const unitLocation = (u: UnitState): { q:number; r:number; z:number } | null => {
    const originId = u.pendingMove?.via?.at(-1) ?? u.surfaceId;
    const c = cellForSurface(view.map, originId); if (!c) return null;
    const z = radar ? 0 : c.surfaces.find(s => s.id === originId)?.z ?? 0;
    if (!radar && u.pendingMove && !u.pendingMove.awaitingContinuation && !motionReduced) {
      const destination = cellForSurface(view.map, u.pendingMove.to);
      if (destination) {
        const endZ = destination.surfaces.find(s => s.id === u.pendingMove!.to)!.z;
        const elapsed = animate ? Math.min(1, Math.max(0, paintTime - transition.arrival) * playbackSpeed / 100) : 0;
        const progress = Math.max(0, Math.min(1, (5 - (u.pendingMove.completesAtTick - view.absoluteTick % 150 - elapsed)) / 5));
        return { q:c.q+(destination.q-c.q)*progress, r:c.r+(destination.r-c.r)*progress, z:z+(endZ-z)*progress };
      }
    }
    return { q:c.q, r:c.r, z };
  };
  const unitPosition = (u: UnitState): [number,number] | null => {
    const location = unitLocation(u); return location ? projectCell(location,location.z,isFlat,rotation) : null;
  };
  // Contacts always use the current report. Radar never interpolates toward another frame.
  const contactPosition = (ct: Contact): [number, number] | null => {
    const c = cellMap.get(ct.reportedCell); if (!c) return null;
    const z = !radar && ct.channel === 'visual' && ct.surfaceId ? c.surfaces.find(s => s.id === ct.surfaceId)?.z ?? 0 : 0;
    return center(c, z, isFlat);
  };
  const toCanvas = ([x, y]: [number, number]) => ({ x: dimensions.width / 2 + (x + camera.x) * camera.zoom, y: dimensions.height / 2 + (y + camera.y) * camera.zoom });
  const contactPositions = view.contacts.filter(c => !c.defeated).flatMap(c => {
    const pos = contactPosition(c);
    return pos ? [{ id: c.contactId, contactId: c.contactId, channel: c.channel, reportedCell: c.reportedCell, ...toCanvas(pos) }] : [];
  });
  const unitPositions = view.units.filter(u => u.alive).flatMap(u => {
    const pos = unitPosition(u); return pos ? [{ id: u.id, ...toCanvas(pos) }] : [];
  });
  const handles = !radar && chosen && equipment ? (['main', 'sub'] as const).flatMap(slot => {
    const pos = unitPosition(chosen); if (!pos) return [];
    const direction = equipment[slot === 'main' ? 'mainDirection' : 'subDirection'] ?? chosen[slot === 'main' ? 'mainDirection' : 'subDirection'];
    const a = direction * Math.PI / 180, [dx, dy] = projectBoard(Math.cos(a), Math.sin(a), 0, isFlat, rotation), length = Math.hypot(dx, dy);
    const origin = toCanvas(pos), radius = slot === 'main' ? 65 : 112;
    return [{ slot, direction, x: origin.x + dx / length * radius, y: origin.y + dy / length * radius, origin }];
  }) : [];
  const fit = useCallback(() => {
    if (dimensions.width <= 0 || dimensions.height <= 0 || !view.map.cells.length) return;
    const points = view.map.cells.map(c => center(c, flat || radar ? 0 : c.roofHeight ?? 0, flat || radar));
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const loX = Math.min(...xs) - 30, hiX = Math.max(...xs) + 30, loY = Math.min(...ys) - 30, hiY = Math.max(...ys) + 30;
    const zoom = Math.max(.01, Math.min(4, Math.max(1, dimensions.width - 28) / (hiX - loX), Math.max(1, dimensions.height - 28) / (hiY - loY)));
    setCamera({ x: -(loX + hiX) / 2, y: -(loY + hiY) / 2, zoom });
  }, [view.map, dimensions.width, dimensions.height, flat, radar, rotation]);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => setDimensions({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) }));
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  useEffect(() => { fit(); }, [view.map.id, dimensions.width, dimensions.height, flat, radar]);
  useEffect(() => {
    if (!focus || radar || dimensions.width <= 0 || dimensions.height <= 0) return;
    const c = view.map.cells.find(c => c.id === focus.cellId); if (!c) return;
    const [x, y] = center(c, c.roofHeight ?? 0, flat);
    setCamera(old => ({ x: -x, y: -y, zoom: Math.max(old.zoom, 1.5) }));
  }, [focus?.serial, flat, dimensions.width, dimensions.height]);
  useEffect(() => {
    if (dimensions.width <= 0 || dimensions.height <= 0 || camera.zoom <= 0) return;
    const el = canvas.current; if (!el) return;
    const ctx = el.getContext('2d'); if (!ctx) return;
    el.dataset.renderedFrames = String(Number(el.dataset.renderedFrames ?? 0) + 1);
    const dpr = window.devicePixelRatio || 1;
    if(el.width!==dimensions.width*dpr) el.width = dimensions.width * dpr;
    if(el.height!==dimensions.height*dpr) el.height = dimensions.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    el.dataset.sectorActors=JSON.stringify(!radar&&sectors?[...view.units.filter(u=>u.alive&&(allSectors||u.id===selected)).map(u=>u.id),...view.contacts.filter(c=>c.channel==='visual'&&!c.defeated&&(allSectors||c.contactId===selected)).map(c=>c.contactId)]:[]);
    el.dataset.effectKinds=JSON.stringify(!radar?effectTrail.flatMap(e=>{const k=combatEffect(e);return k?[k]:[];}):[]);
    const p = colors; ctx.fillStyle = radar ? p.navy : p.ground; ctx.fillRect(0, 0, dimensions.width, dimensions.height);
    ctx.translate(dimensions.width / 2, dimensions.height / 2); ctx.scale(camera.zoom, camera.zoom); ctx.translate(camera.x, camera.y);
    const visible = new Set(view.visibleCells);
    const depth = (c: Pick<Cell,'q'|'r'>, height=0) => isFlat ? c.r * 1000 + c.q : boardDepth(c, rotation, height);
    const worldDraws: { id: string; depth: number; layer: number; draw: () => void }[] = [];
    const sorted = [...cells].sort((a, b) => depth(a) - depth(b) || a.id.localeCompare(b.id));
    const selectedPlan = plans.find(plan => plan.unitId === selected);
    const route = selectedPlan?.commands.flatMap(c => c.path ?? []) ?? [];
    const routeSet = new Set(route);
    for (const c of sorted) {
      const [x, y] = center(c, 0, isFlat);
      drawHex(ctx, x, y, isFlat);
      ctx.fillStyle = radar ? (c.buildingId ? p['navy-raised'] : p.navy) : c.terrain === 'road' ? p.road : c.roadClass === 'alley' ? p.alley : p.ground;
      ctx.fill(); ctx.strokeStyle = radar ? p['navy-raised'] : p.grid; ctx.lineWidth = .45 / camera.zoom; ctx.stroke();
    }
    // Physical prisms and bodies share camera depth; identification badges stay above them.
    if (!radar) for (const solid of solids) {
      const c=cellMap.get(solid.cellId)!;
      worldDraws.push({ id: solid.id, depth: depth(c, Number(solid.bottom + solid.top) / 200000), layer: 0, draw: () => {
      const z=Number(solid.top)/1400000, bottom=Number(solid.bottom)/1400000;
      const [x,y]=center(c,z,isFlat), [bx,by]=center(c,0,isFlat);
      if (!isFlat) {
        // Exposed faces only; shared internal faces are omitted.
        const adjacent = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
        for (let j = 0; j < 6; j++) {
          const a = vertices[j], b = vertices[(j + 1) % 6];
          const pa = projectBoard(...a, 0, false, rotation), pb = projectBoard(...b, 0, false, rotation);
          if (pb[0] >= pa[0] - 1e-9) continue;
          const neighbor = cellMap.get(`c:${c.q + adjacent[j][0]}:${c.r + adjacent[j][1]}`);
          const nz = Math.max(bottom, Math.min(z, neighbor?.roofHeight ?? 0)); if (nz === z) continue;
          const vertex = (v: [number, number], xx: number, yy: number) => { const [vx, vy] = projectBoard(...v, 0, false, rotation); return [xx + vx, yy + vy]; };
          const at = vertex(a, x, y), bt = vertex(b, x, y), bb = vertex(b, bx, by - 14 * nz), ab = vertex(a, bx, by - 14 * nz);
          ctx.beginPath(); ctx.moveTo(...at as [number, number]); ctx.lineTo(...bt as [number, number]); ctx.lineTo(...bb as [number, number]); ctx.lineTo(...ab as [number, number]); ctx.closePath();
          ctx.fillStyle = pb[1] > pa[1] ? p['wall-right'] : p['wall-left']; ctx.fill(); ctx.strokeStyle = p.grid; ctx.stroke();
        }
      }
      if (bases.has(`${solid.cellId}:${solid.top}`)) return;
      drawHex(ctx, x, y, isFlat); ctx.fillStyle = routeSet.has(c.surfaces[0]?.id) ? p['roof-selected'] : p.roof; ctx.fill(); ctx.strokeStyle = p.grid; ctx.stroke();
      if (z===c.roofHeight) { ctx.fillStyle = p.ink; ctx.textAlign = 'center'; ctx.font = `${Math.max(8, 10 / camera.zoom)}px Consolas`; ctx.fillText(String(z), x, y + 3); }
      } });
    }
    const drawOverlays = () => {
    if (vision && !radar) for (const c of cells) {
      if (visible.has(c.id)) continue;
      const [x, y] = center(c, c.roofHeight ?? 0, isFlat); drawHex(ctx, x, y, isFlat); ctx.globalAlpha = .35; ctx.fillStyle = p.fog; ctx.fill(); ctx.globalAlpha = 1;
    }
    if (paths && !radar && chosen) {
      const origin=plannedOrigin ?? chosen.surfaceId;
      const start = cells.find(c => c.surfaces.some(s => s.id === origin));
      if (start) {
        const [x, y] = center(start, start.surfaces.find(s => s.id === origin)?.z ?? 0, isFlat);
        ctx.beginPath(); ctx.moveTo(x, y);
        for (const id of route) { const c = cells.find(c => c.surfaces.some(s => s.id === id)); if (c) { const pos = center(c, c.surfaces.find(s => s.id === id)?.z ?? 0, isFlat); ctx.lineTo(...pos); } }
        ctx.strokeStyle = p.blue; ctx.lineWidth = 2 / camera.zoom; ctx.setLineDash([5 / camera.zoom, 4 / camera.zoom]); ctx.stroke(); ctx.setLineDash([]);
      }
      if(actualPath.length) { ctx.beginPath(); let started=false; for(const id of actualPath) { const cell=cells.find(c=>c.surfaces.some(s=>s.id===id)); if(!cell)continue; const pos=center(cell,cell.surfaces.find(s=>s.id===id)!.z,isFlat); if(started)ctx.lineTo(...pos);else{ctx.moveTo(...pos);started=true;} } ctx.strokeStyle=p.amber;ctx.lineWidth=2.5/camera.zoom;ctx.stroke(); }
    }
    if (sectors && !radar) {
      const sectorActors = [
        ...view.units.filter(u=>u.alive && (allSectors || u.id===selected)).map(u=>({id:u.id,pos:unitPosition(u),main:u.main,sub:u.sub,mainDirection:u.mainDirection,subDirection:u.subDirection,mainMode:u.mainMode,subMode:u.subMode,ranges:u.rangeOverride})),
        ...view.contacts.filter(c=>c.channel==='visual'&&!c.defeated&&(allSectors||c.contactId===selected)).map(c=>({id:c.contactId,pos:contactPosition(c),main:c.main,sub:c.sub,mainDirection:c.mainDirection,subDirection:c.subDirection,mainMode:c.mainMode,subMode:c.subMode,ranges:{} as Record<string,number>})),
      ].sort((a,b)=>Number(a.id===selected)-Number(b.id===selected));
      for (const actor of sectorActors) {
        if (!actor.pos) continue;
        const emphasized=actor.id===selected, edited=emphasized?equipment:undefined;
        for (const slot of ['main','sub'] as const) {
          const directionKey=slot==='main'?'mainDirection':'subDirection',modeKey=slot==='main'?'mainMode':'subMode';
          const deg=edited?.[directionKey]??actor[directionKey], profile=content.weapons.find(w=>w.id===(edited?.[slot]??actor[slot]));
          if (!profile || deg===undefined) continue;
          const isDefense=profile.actionKind==='support'||(edited?.[modeKey]??actor[modeKey])==='shield';
          const half=(profile.sector??120)*Math.PI/360,angle=deg*Math.PI/180;
          const radius=isDefense||!profile.range?52:(actor.ranges[profile.id]??profile.range)*HEX_X*2;
          ctx.save();ctx.translate(...actor.pos);ctx.transform(...boardBasis(isFlat,rotation),0,0);
          ctx.globalAlpha=emphasized?1:.32;
          ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,radius,angle-half,angle+half);ctx.closePath();
          ctx.fillStyle=slot==='main'?p['main-fill']:p['sub-fill'];ctx.fill();ctx.strokeStyle=slot==='main'?p.blue:p.amber;
          ctx.setLineDash(slot==='main'?[]:[4/camera.zoom,3/camera.zoom]);ctx.lineWidth=(emphasized?3:1)/camera.zoom;ctx.stroke();ctx.setLineDash([]);
          if(emphasized){ctx.fillStyle=slot==='main'?p.blue:p.amber;ctx.font=`bold ${12/camera.zoom}px Consolas`;ctx.fillText(slot==='main'?'M':'S',Math.cos(angle)*(radius+8),Math.sin(angle)*(radius+8));}
          ctx.restore();
        }
      }
    }
    };
    const actionFor=(id:string,main:string|undefined):PawnAction=>{
      if(effectTrail.some(e=>e.kind==='DEFEAT'&&e.targetId===id))return 'defeat';
      if(effectTrail.some(e=>/DAMAGE/.test(e.kind)&&e.targetId===id))return 'damage';
      if(effectTrail.some(e=>e.kind==='EVADE'&&e.actorId===id))return 'evade';
      if(effectTrail.some(e=>e.kind==='DEFEND'&&e.actorId===id))return 'defend';
      if(effectTrail.some(e=>/FIRE/.test(e.kind)&&e.actorId===id))return content.weapons.find(w=>w.id===main)?.actionKind==='melee'?'melee':'fire';
      return 'idle';
    };
    const motionProgress=animate?Math.max(0,Math.min(1,(paintTime-transition.arrival)*playbackSpeed/100)):.5;
    const drawUnit = (u: UnitState, layer:'physical'|'badge') => {
      if (radar && layer==='badge') return;
      const pos = unitPosition(u); if (!pos) return;
      const [x, y] = pos, isSelected = selected === u.id;
      if (radar) { ctx.fillStyle = p.cyan; ctx.beginPath(); ctx.arc(x, y, (isSelected ? 5 : 3) / camera.zoom, 0, Math.PI * 2); ctx.fill(); }
      else {
        combatPawn(ctx,x,y,{presetId:u.presetId,name:u.name,copy:u.copy,teamColor:p[u.team===view.team?'unit-a':'unit-b'],direction:normalizeDirection(u.mainDirection + rotation),main:u.main,sub:u.sub,mainMode:u.mainMode,subMode:u.subMode,stealth:u.activeCommand?.kind==='STEALTH',moving:!!u.pendingMove,action:actionFor(u.id,u.main),motionProgress,reducedMotion:motionReduced},isSelected,p,camera.zoom,layer);
        if (layer==='physical') return;
        ctx.fillStyle=p.ink;ctx.font=`bold ${8/camera.zoom}px Consolas`;ctx.textAlign='center';ctx.fillText(u.team,x+17/camera.zoom,y-12/camera.zoom);
        if (isSelected || camera.zoom > 1.1) {
          ctx.font = `${10 / camera.zoom}px 'Yu Gothic UI'`; ctx.textAlign = 'center'; ctx.fillStyle = p.white; const label = `${u.name.replace(/\s/g, '')}-${u.copy}`;
          const w = ctx.measureText(label).width + 8 / camera.zoom; ctx.fillRect(x - w / 2, y + 4 / camera.zoom, w, 14 / camera.zoom); ctx.fillStyle = p.ink; ctx.fillText(label, x, y + 14 / camera.zoom);
        }
      }
    };
    const drawContact = (c: Contact, contactIndex: number, layer:'physical'|'badge') => {
      if (radar && layer==='badge' || !radar && c.channel!=='visual' && layer==='physical') return;
      if (c.defeated) return;
      const cell = cellMap.get(c.reportedCell); if (!cell) return;
      const pos = contactPosition(c); if (!pos) return;
      const [x, y] = pos; ctx.globalAlpha = c.channel === 'lost' ? .5 : 1;
      const label = c.tag || (autoNumbers ? c.number : '');
      if (radar) {
        ctx.beginPath();ctx.moveTo(x,y-4/camera.zoom);ctx.lineTo(x+4/camera.zoom,y+3/camera.zoom);ctx.lineTo(x-4/camera.zoom,y+3/camera.zoom);ctx.closePath();ctx.fillStyle=p['unit-b'];ctx.fill();
        const labelY=y+(14+(contactIndex%5)*11)/camera.zoom;
        ctx.strokeStyle=p['unit-b']; ctx.globalAlpha=.4; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+4/camera.zoom,labelY-3/camera.zoom); ctx.stroke(); ctx.globalAlpha=1;
        ctx.fillStyle = p.white; ctx.font = `${9 / camera.zoom}px Consolas`; ctx.textAlign = 'left'; ctx.fillText(label, x + 4 / camera.zoom, labelY);
      } else {
        if (c.channel === 'visual') combatPawn(ctx,x,y,{presetId:c.presetId??'',name:c.name,teamColor:p['unit-b'],direction:normalizeDirection((c.mainDirection ?? 0) + rotation),main:c.main,sub:c.sub,mainMode:c.mainMode,subMode:c.subMode,action:actionFor(c.contactId,c.main),motionProgress,reducedMotion:motionReduced},selected===c.contactId,p,camera.zoom,layer);
        else { ctx.beginPath(); ctx.arc(x, y - 8 / camera.zoom, 10 / camera.zoom, 0, 2 * Math.PI); ctx.fillStyle = p['navy-raised']; ctx.fill(); ctx.strokeStyle = p.amber; ctx.setLineDash(c.channel === 'lost' ? [2 / camera.zoom, 2 / camera.zoom] : []); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = p.white; ctx.font = `bold ${14 / camera.zoom}px Consolas`; ctx.textAlign = 'center'; ctx.fillText('?', x, y - 3 / camera.zoom); }
        if (layer==='physical') return;
        ctx.font = `${10 / camera.zoom}px 'Yu Gothic UI'`; ctx.fillStyle = p.amber; ctx.textAlign = 'center'; ctx.fillText(`${c.channel === 'visual' ? c.name ?? '' : ''} ${label}`, x, y + 12 / camera.zoom);
        if(c.channel==='visual'){ctx.fillStyle=p.ink;ctx.font=`bold ${8/camera.zoom}px Consolas`;ctx.fillText(view.team==='A'?'B':'A',x+17/camera.zoom,y-12/camera.zoom);}
      } ctx.globalAlpha = 1;
    };
    const actors = [
      ...view.units.filter(u => u.alive || events.some(e => e.kind === 'DEFEAT' && e.targetId === u.id)).flatMap(u => {
        const location = unitLocation(u); return location ? [{ id: u.id, depth: depth(location,14*location.z+4.2), draw: (layer:'physical'|'badge') => drawUnit(u,layer) }] : [];
      }),
      ...[...view.contacts].sort((a, b) => a.reportedCell.localeCompare(b.reportedCell)).flatMap((c, i) => {
        const cell = cellMap.get(c.reportedCell); return cell && !c.defeated ? [{ id: c.contactId, depth: depth(cell, c.channel==='visual'?14*(cell.surfaces.find(s=>s.id===c.surfaceId)?.z??0)+4.2:0), draw: (layer:'physical'|'badge') => drawContact(c,i,layer) }] : [];
      }),
    ];
    for (const actor of actors) worldDraws.push({ id: actor.id, depth: actor.depth, layer: 1, draw: () => actor.draw('physical') });
    if (!radar) for (const projectile of view.projectiles ?? []) {
      const d=Number(projectile.position.denominator ?? 1), worldX=Number(projectile.position.x)/d/100000, worldY=Number(projectile.position.y)/d/100000, worldZ=Number(projectile.position.z)/d/100000;
      const [x,y]=projectBoard(worldX,worldY,worldZ,isFlat,rotation);
      worldDraws.push({ id: projectile.id, depth: isFlat ? worldY/30*1000+(worldX/HEX_X-worldY/30)/2 : boardWorldDepth(worldX,worldY,worldZ,rotation), layer: 2, draw: () => {
      ctx.fillStyle=projectile.kind==='blast'?p.amber:p.cyan; ctx.beginPath(); ctx.arc(x,y,Math.max(2/camera.zoom,Math.min(8/camera.zoom,Number(projectile.radius)/100000)),0,Math.PI*2); ctx.fill();
      } });
    }
    worldDraws.sort((a,b)=>a.depth-b.depth || a.layer-b.layer || a.id.localeCompare(b.id)).forEach(item=>item.draw());
    drawOverlays();
    actors.sort((a,b)=>a.depth-b.depth || a.id.localeCompare(b.id)).forEach(actor=>actor.draw('badge'));
    if (!radar) for (const e of effectTrail) {
      const actor=view.units.find(u=>u.id===e.actorId)??view.contacts.find(c=>c.channel==='visual'&&c.contactId===e.actorId);
      const visual=e.details?.visual as {weaponId?:string;actionKind?:string;origin?:Point3;aim?:Point3}|undefined;
      const profile=content.weapons.find(w=>w.id===(visual?.weaponId??e.details?.weaponId??(e.slot==='sub'?actor?.sub:actor?.main)));
      const kind=combatEffect(e,visual?.actionKind??profile?.actionKind); if(!kind)continue;
      const eventPosition=(id?:string)=>{const u=view.units.find(u=>u.id===id);if(u)return unitPosition(u);const c=view.contacts.find(c=>c.contactId===id&&c.channel==='visual');return c?contactPosition(c):null;};
      const pointPosition=(point:Point3)=>{const d=Number(point.denominator??1)*100000;return projectBoard(Number(point.x)/d,Number(point.y)/d,Number(point.z)/d,isFlat,rotation);};
      const ap=visual?.origin?pointPosition(visual.origin):eventPosition(e.actorId),bp=visual?.aim?pointPosition(visual.aim):eventPosition(e.targetId);
      const at=kind==='blast'&&e.details?.origin?pointPosition(e.details.origin as Point3):kind==='damage'?eventPosition(e.targetId):ap??bp;if(!at)continue;
      const age=Math.max(0,view.absoluteTick%150-e.tick),fraction=animate&&!motionReduced?Math.max(0,Math.min(1,(paintTime-transition.arrival)*playbackSpeed/100)):0;
      const progress=animate&&!motionReduced?Math.min(1,(age+fraction)/5):.5;
      const direction=(e.slot==='sub'?actor?.subDirection:actor?.mainDirection)??0,a=direction*Math.PI/180;
      const delta=projectBoard(Math.cos(a)*60,Math.sin(a)*60,0,isFlat,rotation);
      const end=bp??[at[0]+delta[0],at[1]+delta[1]];
      ctx.save();ctx.globalAlpha=animate?Math.max(.25,1-progress):.95;ctx.lineWidth=3/camera.zoom;ctx.strokeStyle=kind==='damage'?p.danger:kind==='blast'?p.amber:p.cyan;ctx.fillStyle=ctx.strokeStyle;
      if(kind==='shot') {
        const t=motionReduced ? .7 : progress,tail=Math.max(0,t-.22);
        ctx.beginPath();ctx.moveTo(at[0]+(end[0]-at[0])*tail,at[1]+(end[1]-at[1])*tail-6/camera.zoom);ctx.lineTo(at[0]+(end[0]-at[0])*t,at[1]+(end[1]-at[1])*t-6/camera.zoom);ctx.stroke();
        ctx.beginPath();ctx.arc(at[0]+(end[0]-at[0])*t,at[1]+(end[1]-at[1])*t-6/camera.zoom,4/camera.zoom,0,Math.PI*2);ctx.fill();
      } else if(kind==='slash') {
        ctx.translate(...at);ctx.transform(...boardBasis(isFlat,rotation),0,0);ctx.lineWidth=5/camera.zoom;
        ctx.beginPath();ctx.arc(0,0,26+progress*22,a-.9+progress*.6,a+.5+progress*.6);ctx.stroke();
      } else if(kind==='shield') {
        ctx.fillStyle=p['main-fill'];ctx.lineWidth=3/camera.zoom;ctx.beginPath();ctx.ellipse(at[0],at[1]-10/camera.zoom,(18+progress*5)/camera.zoom,24/camera.zoom,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      } else {
        const radius=(kind==='blast'?18+progress*42:kind==='activate'?12+progress*15:8+progress*15)/camera.zoom;
        ctx.beginPath();ctx.arc(at[0],at[1]-8/camera.zoom,radius,0,Math.PI*2);ctx.stroke();
        if(kind==='damage')for(let ray=0;ray<6;ray++){const angle=ray*Math.PI/3;ctx.beginPath();ctx.moveTo(at[0]+Math.cos(angle)*radius*.5,at[1]-8/camera.zoom+Math.sin(angle)*radius*.5);ctx.lineTo(at[0]+Math.cos(angle)*radius,at[1]-8/camera.zoom+Math.sin(angle)*radius);ctx.stroke();}
      }
      if(kind==='activate'||kind==='shield'||kind==='slash'){
        const label=kind==='activate'?(e.description!==e.kind?eventTitle(e):profile?.name??eventTitle(e)):kind==='shield'?'シールド':'斬撃';
        ctx.font=`bold ${11/camera.zoom}px 'Yu Gothic UI'`;ctx.textAlign='center';ctx.fillStyle=p.white;ctx.strokeStyle=p.ink;ctx.lineWidth=3/camera.zoom;ctx.strokeText(label,at[0],at[1]-48/camera.zoom);ctx.fillText(label,at[0],at[1]-48/camera.zoom);
      }
      ctx.restore();
    }
    if(!radar) for(const event of effectTrail) {
      const targetId=/DAMAGE|DEFEAT/.test(event.kind)?event.targetId:event.actorId;
      const unit=view.units.find(u=>u.id===targetId), ct=view.contacts.find(c=>c.contactId===targetId);
      const pos=unit?unitPosition(unit):ct?contactPosition(ct):null;
      const symbol=/DEFEAT/.test(event.kind)?'×':/DAMAGE/.test(event.kind)?`−${event.damage??'!'}`:/DEFEND/.test(event.kind)?'◇':/EVADE/.test(event.kind)?'↷':/ATTACK_CANCEL|MOVE_CONFLICT|MOVE_STOP/.test(event.kind)?'!':null;
      if(!pos||!symbol)continue;ctx.font=`bold ${14/camera.zoom}px Consolas`;ctx.textAlign='center';ctx.fillStyle=/DAMAGE|DEFEAT/.test(event.kind)?p.danger:p.ink;ctx.fillText(symbol,pos[0]+15/camera.zoom,pos[1]-25/camera.zoom);
    }
    for (const handle of handles) {
      const origin = unitPosition(chosen!); if (!origin) continue;
      const hx = (handle.x - dimensions.width / 2) / camera.zoom - camera.x, hy = (handle.y - dimensions.height / 2) / camera.zoom - camera.y;
      ctx.strokeStyle = handle.slot === 'main' ? p.blue : p.amber; ctx.lineWidth = 2 / camera.zoom;
      ctx.setLineDash(handle.slot === 'sub' ? [4 / camera.zoom, 3 / camera.zoom] : []);
      ctx.beginPath(); ctx.moveTo(...origin); ctx.lineTo(hx, hy); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = radar ? p.cyan : p.muted;
    ctx.font = '11px Consolas'; ctx.textAlign = 'left';
    const north = projectBoard(0, -1, 0, isFlat, rotation), northLength = Math.hypot(...north), nx = north[0] / northLength, ny = north[1] / northLength;
    ctx.fillText('N', 25 + nx * 14, 30 + ny * 14); ctx.beginPath(); ctx.moveTo(25 - nx * 6, 26 - ny * 6); ctx.lineTo(25 + nx * 7, 26 + ny * 7); ctx.strokeStyle = radar ? p.cyan : p.muted; ctx.lineWidth = 1.5; ctx.stroke();
    if (!radar) { ctx.fillText(`MAP ${view.map.version}   ${Math.round(camera.zoom * 100)}%`, 12, dimensions.height - 12); ctx.textAlign = 'right'; ctx.fillText(isFlat ? 'ホイール: 拡縮 / 背景: 移動' : '背景: 移動 / Shift+背景: 回転', dimensions.width - 12, dimensions.height - 12); }
  }, [allSectors, effectTrail, view, selected, plans, dimensions, camera, flat, sectors, vision, paths, radar, autoNumbers, events, equipment, paintTime, solids, transition, bases, colors, animate, playbackSpeed, motionReduced, actualPath, plannedOrigin, rotation]);
  const screenPoint = (e: { clientX: number; clientY: number }) => { const rect = canvas.current!.getBoundingClientRect(); return { x: (e.clientX - rect.left - dimensions.width / 2) / camera.zoom - camera.x, y: (e.clientY - rect.top - dimensions.height / 2) / camera.zoom - camera.y }; };
  const nearbyAt = (e: { clientX: number; clientY: number }) => {
    const point = screenPoint(e);
    const candidates: { id: string; x: number; y: number }[] = [];
    for (const u of view.units.filter(u => u.alive)) { const pos = unitPosition(u); if (pos) candidates.push({ id: u.id, x: pos[0], y: pos[1] }); }
    for (const ct of view.contacts.filter(c => !c.defeated)) { const pos = contactPosition(ct); if (pos) candidates.push({ id: ct.contactId, x: pos[0], y: pos[1] }); }
    return candidates.map(c=>({...c,d:Math.min(Math.hypot(point.x-c.x,point.y-c.y+(radar?0:7/camera.zoom)),radar?Infinity:Math.hypot(point.x-c.x,point.y-c.y+28/camera.zoom))})).filter(c=>c.d<(radar?10:17)/camera.zoom).sort((a,b)=>a.d-b.d || a.id.localeCompare(b.id));
  };
  const selectAt = (e: { clientX: number; clientY: number }) => {
    const point = screenPoint(e), nearby = nearbyAt(e);
    const near=nearby[0];
    if (near) {
      if(surfacePicking && onSurface && !radar) { const u=view.units.find(u=>u.id===near.id), ct=view.contacts.find(c=>c.contactId===near.id); const surface=u?.surfaceId ?? ct?.surfaceId ?? cells.find(c=>c.id===ct?.reportedCell)?.surfaces[0]?.id; if(surface){onSurface(surface);return;} }
      if(nearby.length>1&&!radar) { const rect=canvas.current!.getBoundingClientRect(); setOverlap({x:Math.min(e.clientX-rect.left,dimensions.width-180),y:Math.min(e.clientY-rect.top,dimensions.height-160),items:nearby.map(candidate=>{const unit=view.units.find(u=>u.id===candidate.id),ct=view.contacts.find(c=>c.contactId===candidate.id);return{id:candidate.id,label:unit?`${unit.name}-${unit.copy}`:ct?.tag||ct?.number||'接触'};})});return; }
      setOverlap(null);onSelect(near.id); return;
    }
    if (onSurface && !radar) {
      const c = [...cells].sort((a, b) => isFlat ? b.r - a.r || b.q - a.q : boardDepth(b, rotation) - boardDepth(a, rotation) || b.id.localeCompare(a.id)).find(c => containsBoardHex(point.x, point.y, center(c, c.roofHeight ?? 0, isFlat), isFlat, rotation));
      if (c?.surfaces[0]) onSurface(c.surfaces[0].id);
    }
  };
  const pointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { d.moved = true; cancelHold(); }
    if (d.direction && chosen && equipment) {
      const pos = unitPosition(chosen); if (!pos) return;
      const pt = screenPoint(e); if (Math.hypot(pt.x - pos[0], pt.y - pos[1]) < 1 / camera.zoom) return;
      d.value = boardDirection(pt.x - pos[0], pt.y - pos[1], isFlat, rotation);
      onDirection?.(d.direction, d.value);
    } else if (d.rotate && d.moved) setYaw(normalizeDirection(d.yaw + dx * .5));
    else if (d.moved && !radar) setCamera({ ...d.camera, x: d.camera.x + dx / d.camera.zoom, y: d.camera.y + dy / d.camera.zoom });
  };
  const pointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    cancelHold();
    const d = drag.current; drag.current = null;
    if (held.current) { held.current=false; return; }
    if (!d) return;
    if (d.direction) { if (d.value !== undefined && equipment) onDirectionCommit?.(d.direction, d.value); return; }
    if (d.moved || d.rotate) return;
    const point = { clientX: e.clientX, clientY: e.clientY };
    if (onDoubleClick && nearbyAt(point).length) {
      if (clickTimer.current) clearTimeout(clickTimer.current);
      clickTimer.current = setTimeout(() => { clickTimer.current = null; selectAt(point); }, 250);
    } else selectAt(point);
  };
  return <div ref={host} className={`${radar ? 'radar-canvas' : 'battle-canvas'}${monochrome?' monochrome':''}`}>
    <canvas ref={canvas} aria-label={radar ? 'レーダー。敵は接触番号と点で表示' : '六角形の市街地戦闘マップ。ユニット一覧からも選択できます'}
      data-view-tick={view.absoluteTick} data-rotation={rotation}
      data-contact-positions={JSON.stringify(contactPositions)} data-unit-positions={JSON.stringify(unitPositions)}
      data-direction-handles={JSON.stringify(handles.map(({ slot, x, y, direction }) => ({ slot, x, y, direction })))}
      onWheel={e => { if (radar) return; e.preventDefault(); const factor = e.deltaY > 0 ? .9 : 1.1; const pt = screenPoint(e); setCamera(c => ({ zoom: Math.max(.3, Math.min(4, c.zoom * factor)), x: c.x + pt.x * (1 / factor - 1), y: c.y + pt.y * (1 / factor - 1) })); }}
      onPointerDown={e => {
        if (e.button !== 0) return;
        cancelHold(); held.current=false;
        const near=nearbyAt(e)[0], point={x:e.clientX,y:e.clientY};
        if(e.pointerType!=='mouse' && near && onContextMenu) holdTimer.current=setTimeout(()=>{holdTimer.current=null;held.current=true;drag.current=null;if(clickTimer.current){clearTimeout(clickTimer.current);clickTimer.current=null;}setOverlap(null);onContextMenu(near.id,point);},500);
        canvas.current?.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, camera, yaw, moved: false, rotate: !isFlat && e.shiftKey && !nearbyAt(e).length };
      }}
      onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { cancelHold(); held.current=false; drag.current = null; }}
      onContextMenu={e => {
        const near = nearbyAt(e)[0]; if (!near || !onContextMenu) return;
        e.preventDefault(); cancelHold(); if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
        drag.current = null; setOverlap(null); onContextMenu(near.id, { x: e.clientX, y: e.clientY });
      }}
      onDoubleClick={e => {
        const near = nearbyAt(e)[0]; if (!near || !onDoubleClick) return;
        e.preventDefault(); cancelHold(); if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
        drag.current = null; setOverlap(null); onDoubleClick(near.id);
      }} />
    {!radar && [...view.units.filter(u=>u.alive).flatMap(u=>{const pos=unitPosition(u),src=displayIconUrl(u.presetId);return pos&&src?[{id:u.id,name:u.name,src,...toCanvas(pos)}]:[];}),...view.contacts.filter(c=>c.channel==='visual'&&!c.defeated).flatMap(c=>{const pos=contactPosition(c),src=displayIconUrl(c.presetId??'');return pos&&src?[{id:c.contactId,name:c.name??'',src,...toCanvas(pos)}]:[];})].map(icon=><img key={icon.id} className={`official-icon ${icon.id===selected?'selected':''}`} data-unit-id={icon.id} src={icon.src} alt={icon.name} draggable={false} referrerPolicy="no-referrer" style={{left:icon.x-17,top:icon.y-44}} onError={e=>{e.currentTarget.style.visibility='hidden';}} />)}
    {handles.map(handle => <button key={handle.slot} type="button" data-direction-slot={handle.slot}
      aria-label={handle.slot === 'main' ? 'MAINの向きをドラッグ' : 'SUBの向きをドラッグ'}
      title={`${handle.slot.toUpperCase()} ${handle.direction}° · ドラッグで方向変更`}
      style={{ position: 'absolute', left: handle.x - 22, top: handle.y - 22, width: 44, height: 44, minWidth: 44, minHeight: 44, padding: 0, borderRadius: '50%', border: `3px ${handle.slot === 'main' ? 'solid' : 'dashed'} ${handle.slot === 'main' ? colors.blue : colors.amber}`, color: colors.ink, background: colors.white, boxShadow: '0 2px 6px #0005', fontSize: 18, fontWeight: 800, cursor: 'grab', touchAction: 'none', zIndex: 2 }}
      onPointerDown={e => {
        if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, camera, yaw, moved: false, direction: handle.slot, value: handle.direction };
      }} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { cancelHold(); held.current=false; drag.current = null; }}
      onKeyDown={e => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
        e.preventDefault(); const degrees = e.key === 'Home' ? 0 : normalizeDirection(handle.direction + (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 1) * (e.shiftKey ? 15 : 5));
        onDirection?.(handle.slot, degrees); onDirectionCommit?.(handle.slot, degrees);
      }}>{handle.slot === 'main' ? 'M' : 'S'}</button>)}
    {(!radar || radarControls) && <div className="map-controls" style={{ flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 'calc(100% - 60px)', zIndex: 3 }}>
      <button style={{ minHeight: 44 }} onClick={() => setCamera(c => ({ ...c, zoom: Math.min(4, c.zoom * 1.2) }))} aria-label="拡大">＋</button>
      <button style={{ minHeight: 44 }} onClick={() => setCamera(c => ({ ...c, zoom: Math.max(.01, c.zoom / 1.2) }))} aria-label="縮小">−</button>
      <button style={{ minHeight: 44 }} onClick={fit}>全体表示</button>
      {onExpand && <button aria-pressed={expanded} onClick={onExpand}>{expanded ? '表示を戻す' : '盤面を広く表示'}</button>}
      {onActionFlow && <button onClick={onActionFlow}>行動一覧</button>}
      {!isFlat && <><button style={{ minWidth: 44, minHeight: 44 }} onClick={() => setYaw(y => normalizeDirection(y - 30))} aria-label="左へ回転">↶</button>
        <button style={{ minWidth: 44, minHeight: 44 }} onClick={() => setYaw(y => normalizeDirection(y + 30))} aria-label="右へ回転">↷</button>
        <button style={{ minWidth: 44, minHeight: 44 }} onClick={() => setYaw(0)} aria-label="回転をリセット">北へ</button></>}
    </div>}
    {overlap&&!radar&&<div className="overlap-picker" style={{left:Math.max(0,overlap.x),top:Math.max(0,overlap.y)}} role="group" aria-label="重なった駒の選択">{overlap.items.map(item=><button key={item.id} onClick={()=>{onSelect(item.id);setOverlap(null);}}>{item.label}</button>)}<button onClick={()=>setOverlap(null)}>閉じる</button></div>}
    {!radar && contact && <div className="map-note">{contact.tag || contact.number} · {contact.channel === 'visual' ? '現在視認' : contact.channel === 'radar' ? '探知のみ / 高さ不明' : '失探 / 最終報告位置'}</div>}
    {!radar && chosen && <div className="map-coordinate">{chosen.name}-{chosen.copy} · {chosen.surfaceId} · HP {chosen.hp} / AP {chosen.ap}</div>}
  </div>;
}
export function cellForSurface(map: BattleMap, surface: string): Cell | undefined { return map.cells.find(c => c.surfaces.some(s => s.id === surface)); }
export function contactDistance(map: BattleMap, unit: UnitState, contact: Contact): number { const a = cellForSurface(map, unit.surfaceId), b = map.cells.find(c => c.id === contact.reportedCell); return a && b ? hexDistance(a, b) : 0; }
