import type { BattleMap, Cell, Point3, StructureElement, Surface } from '@battle/contracts';

export const X = 1732051n, Y = 3000000n, HEIGHT = 1400000n;
export type Rational = { n: bigint; d: bigint };
export type ExactPoint = { x: bigint; y: bigint; z: bigint; d: bigint };
export type Solid = { id: string; cellId: string; x: bigint; y: bigint; bottom: bigint; top: bigint; element?: StructureElement };
export type Intersection = { solid: Solid; enter: Rational; exit: Rational; point: Point3 };
export const rat = (n: bigint, d = 1n): Rational => d < 0n ? { n: -n, d: -d } : { n, d };
export const compareRational = (a: Rational, b: Rational): number => a.n*b.d < b.n*a.d ? -1 : a.n*b.d > b.n*a.d ? 1 : 0;
export const exactPoint = (p: Point3): ExactPoint => ({ x: BigInt(p.x), y: BigInt(p.y), z: BigInt(p.z), d: BigInt((p as Point3 & { denominator?: string }).denominator ?? '1') });
export function pointJSON(p: ExactPoint): Point3 {
  const gcd = (a: bigint,b: bigint): bigint => b === 0n ? (a < 0n ? -a : a) : gcd(b,a%b);
  const g = gcd(gcd(gcd(p.x,p.y),p.z),p.d) || 1n;
  const result: Point3 & { denominator?: string } = {x:String(p.x/g),y:String(p.y/g),z:String(p.z/g)};
  if (p.d/g !== 1n) result.denominator = String(p.d/g);
  return result;
}
export function interpolate(a: Point3,b: Point3,t: Rational): Point3 {
  const p=exactPoint(a),q=exactPoint(b),d=p.d*q.d*t.d;
  return pointJSON({x:p.x*q.d*(t.d-t.n)+q.x*p.d*t.n,y:p.y*q.d*(t.d-t.n)+q.y*p.d*t.n,z:p.z*q.d*(t.d-t.n)+q.z*p.d*t.n,d});
}
export function cellPoint(cell: Pick<Cell,'q'|'r'>,z: number,offset=0): Point3 {
  return {x:String(X*BigInt(2*cell.q+cell.r)),y:String(Y*BigInt(cell.r)),z:String(HEIGHT*BigInt(z)+BigInt(offset))};
}
export const hexDistance = (a: {q:number;r:number},b: {q:number;r:number}): number => Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r));
export function integerSqrt(n: bigint): bigint {
  if(n<0n)throw new Error('NEGATIVE_SQUARE_ROOT'); if(n<2n)return n;
  let x=1n << BigInt(Math.ceil(n.toString(2).length/2));
  for(;;){const y=(x+n/x)/2n;if(y>=x)return x;x=y;}
}
export const ceilSqrt = (n: bigint): bigint => {const s=integerSqrt(n);return s*s===n?s:s+1n;};
export function integerCubeRoot(n: bigint): bigint {
  if(n<0n)throw new Error('NEGATIVE_CUBE_ROOT'); let lo=0n,hi=1n << BigInt(Math.ceil(n.toString(2).length/3)+1);
  while(hi-lo>1n){const m=(lo+hi)/2n;if(m*m*m<=n)lo=m;else hi=m;}return lo;
}
export function distanceSquared(a:Point3,b:Point3): Rational {
  const p=exactPoint(a),q=exactPoint(b),d=p.d*q.d,x=p.x*q.d-q.x*p.d,y=p.y*q.d-q.y*p.d,z=p.z*q.d-q.z*p.d;
  return {n:x*x+y*y+z*z,d:d*d};
}
export function distanceCeil(a:Point3,b:Point3): bigint {
  const v=distanceSquared(a,b),s=integerSqrt(v.n/v.d);return s*s*v.d===v.n?s:s+1n;
}
export function generateSolids(map:BattleMap,structures:StructureElement[]=map.structures??[]): Solid[] {
  const cells=new Map(map.cells.map(c=>[c.id,c]));
  if(structures.length)return structures.filter(e=>e.currentDurability>0).map(e=>{const c=cells.get(e.cellId)!;return {id:e.id,cellId:c.id,x:X*BigInt(2*c.q+c.r),y:Y*BigInt(c.r),bottom:HEIGHT*BigInt(c.groundHeight+e.layerIndex),top:HEIGHT*BigInt(c.groundHeight+e.layerIndex+1),element:e};}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  return map.cells.filter(c=>c.buildingId!==null&&c.roofHeight!==null).map(c=>({id:`${c.buildingId}/${c.id}`,cellId:c.id,x:X*BigInt(2*c.q+c.r),y:Y*BigInt(c.r),bottom:HEIGHT*BigInt(c.groundHeight),top:HEIGHT*BigInt(c.roofHeight!)}));
}
type ClipLine={d:bigint;start:bigint[];delta:bigint[];a:Point3;b:Point3;numeric:{start:number[];delta:number[];safe:boolean}};
const constants=new WeakMap<Solid,bigint[]>();
function lineData(a:Point3,b:Point3):ClipLine {
  const p=exactPoint(a),q=exactPoint(b),d=p.d*q.d,px=p.x*q.d,py=p.y*q.d,pz=p.z*q.d,dx=q.x*p.d-px,dy=q.y*p.d-py,dz=q.z*p.d-pz;
  const start=[px,-px,1000000n*px+X*py,1000000n*px-X*py,-1000000n*px+X*py,-1000000n*px-X*py,pz,-pz],delta=[dx,-dx,1000000n*dx+X*dy,1000000n*dx-X*dy,-1000000n*dx+X*dy,-1000000n*dx-X*dy,dz,-dz],ns=[Number(p.x)/Number(p.d),Number(p.y)/Number(p.d),Number(p.z)/Number(p.d)],ne=[Number(q.x)/Number(q.d),Number(q.y)/Number(q.d),Number(q.z)/Number(q.d)];
  return {a,b,d,start,delta,numeric:{start:ns,delta:ne.map((v,i)=>v-ns[i]!),safe:[...ns,...ne].every(v=>Number.isFinite(v)&&Math.abs(v)<Number.MAX_SAFE_INTEGER/4)}};
}
/** Closed convex hex-prism clipping. Only contact confined to an endpoint is excluded. */
function clip(line:ClipLine,s:Solid,includeEndpoints:boolean):{enter:Rational;exit:Rational}|null {
  let plane=constants.get(s);if(!plane){plane=[s.x+X,-s.x+X,1000000n*s.x+X*s.y+2000000n*X,1000000n*s.x-X*s.y+2000000n*X,-1000000n*s.x+X*s.y+2000000n*X,-1000000n*s.x-X*s.y+2000000n*X,s.top,-s.bottom];constants.set(s,plane);}
  let lo=rat(0n),hi=rat(1n);for(let i=0;i<8;i++){const v=line.delta[i]!,w=plane[i]!*line.d-line.start[i]!;if(v===0n){if(w<0n)return null;continue;}const t=rat(w,v);if(v>0n){if(compareRational(t,hi)<0)hi=t;}else if(compareRational(t,lo)>0)lo=t;if(compareRational(lo,hi)>0)return null;}
  if(!includeEndpoints&&(hi.n<=0n||lo.n>=lo.d))return null;return {enter:lo,exit:hi};
}
export function intersectSolid(a:Point3,b:Point3,s:Solid,includeEndpoints=false):Intersection|null {const hit=clip(lineData(a,b),s,includeEndpoints);return hit?{solid:s,...hit,point:interpolate(a,b,hit.enter)}:null;}
type Bounds={solid:Solid;min:number[];max:number[]};
const solidBounds=new WeakMap<Solid[],{bounds:Bounds[];grid:Map<string,Bounds[]>}>();
function numericOverlap(start:number[],delta:number[],min:number[],max:number[],dimensions=3):boolean {let lo=0,hi=1;for(let i=0;i<dimensions;i++){const v=delta[i]!,p=start[i]!;if(v===0){if(p<min[i]!||p>max[i]!)return false;continue;}const t1=(min[i]!-p)/v,t2=(max[i]!-p)/v;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return false;}return true;}
function candidates(line:ClipLine,solids:Solid[]):Bounds[] {
  let index=solidBounds.get(solids);if(!index){const bounds=solids.map(solid=>({solid,min:[Number(solid.x-X)-1,Number(solid.y-2000000n)-1,Number(solid.bottom)-1],max:[Number(solid.x+X)+1,Number(solid.y+2000000n)+1,Number(solid.top)+1]})),grid=new Map<string,Bounds[]>();for(const bound of bounds)for(let x=Math.floor(bound.min[0]!/4000000);x<=Math.floor(bound.max[0]!/4000000);x++)for(let y=Math.floor(bound.min[1]!/4000000);y<=Math.floor(bound.max[1]!/4000000);y++){const key=`${x}:${y}`,list=grid.get(key)??[];list.push(bound);grid.set(key,list);}index={bounds,grid};solidBounds.set(solids,index);}if(!line.numeric.safe)return index.bounds;
  const {start,delta}=line.numeric,minX=Math.floor((Math.min(start[0]!,start[0]!+delta[0]!)-1)/4000000),maxX=Math.floor((Math.max(start[0]!,start[0]!+delta[0]!)+1)/4000000),minY=Math.floor((Math.min(start[1]!,start[1]!+delta[1]!)-1)/4000000),maxY=Math.floor((Math.max(start[1]!,start[1]!+delta[1]!)+1)/4000000);if((maxX-minX+1)*(maxY-minY+1)>10000)return index.bounds.filter(bound=>numericOverlap(start,delta,bound.min,bound.max));
  const selected=new Set<Bounds>();for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){if(!numericOverlap(start,delta,[x*4000000-1,y*4000000-1],[(x+1)*4000000+1,(y+1)*4000000+1],2))continue;for(const bound of index.grid.get(`${x}:${y}`)??[])selected.add(bound);}return [...selected].filter(bound=>numericOverlap(start,delta,bound.min,bound.max));
}
export function rayIntersections(a:Point3,b:Point3,solids:Solid[],includeEndpoints=false):Intersection[] {
  const line=lineData(a,b),out:Intersection[]=[];for(const {solid} of candidates(line,solids)){const hit=clip(line,solid,includeEndpoints);if(hit)out.push({solid,...hit,point:interpolate(a,b,hit.enter)});}return out.sort((a,b)=>compareRational(a.enter,b.enter)||(a.solid.id<b.solid.id?-1:a.solid.id>b.solid.id?1:0));
}
const clearCache=new WeakMap<Solid[],Map<string,boolean>>();
/** Optical queries need only a boolean; caching and early exit do not choose a different blocker. */
export function lineClear(a:Point3,b:Point3,solids:Solid[]):boolean {
  const ak=`${a.x},${a.y},${a.z},${a.denominator??1}`,bk=`${b.x},${b.y},${b.z},${b.denominator??1}`,key=ak<bk?`${ak}|${bk}`:`${bk}|${ak}`;let cache=clearCache.get(solids);if(!cache){cache=new Map();clearCache.set(solids,cache);}const cached=cache.get(key);if(cached!==undefined)return cached;
  const line=lineData(a,b);for(const {solid} of candidates(line,solids))if(clip(line,solid,false)){cache.set(key,false);return false;}cache.set(key,true);return true;
}
export function traceLine(a:Point3,b:Point3,solids:Solid[]):{clear:boolean;blocker:Intersection|null} {if(lineClear(a,b,solids))return {clear:true,blocker:null};const hits=rayIntersections(a,b,solids);return {clear:false,blocker:hits[0]??null};}
/** Exact nearest point on the prism, including rational edge projections. */
export function nearestSolidPoint(p:Point3,s:Solid): Point3 {
  const v=exactPoint(p),z=v.z<s.bottom*v.d?s.bottom*v.d:v.z>s.top*v.d?s.top*v.d:v.z;
  const verts=[[0n,-2000000n],[X,-1000000n],[X,1000000n],[0n,2000000n],[-X,1000000n],[-X,-1000000n]];
  const inside=v.x>=(s.x-X)*v.d&&v.x<=(s.x+X)*v.d&&1000000n*(v.x-s.x*v.d)+X*(v.y-s.y*v.d)<=2000000n*X*v.d&&1000000n*(v.x-s.x*v.d)-X*(v.y-s.y*v.d)<=2000000n*X*v.d&&-1000000n*(v.x-s.x*v.d)+X*(v.y-s.y*v.d)<=2000000n*X*v.d&&-1000000n*(v.x-s.x*v.d)-X*(v.y-s.y*v.d)<=2000000n*X*v.d;
  if(inside)return pointJSON({x:v.x,y:v.y,z,d:v.d});
  let best:Point3|null=null,bestD:Rational|null=null;
  for(let i=0;i<6;i++){const av=verts[i]!,bv=verts[(i+1)%6]!,ax=(s.x+av[0]!)*v.d,ay=(s.y+av[1]!)*v.d,dx=(bv[0]!-av[0]!),dy=(bv[1]!-av[1]!),den=(dx*dx+dy*dy)*v.d;let n=(v.x-ax)*dx+(v.y-ay)*dy;n=n<0n?0n:n>den?den:n;const out=pointJSON({x:ax*den+dx*v.d*n,y:ay*den+dy*v.d*n,z:z*den,d:v.d*den}),dist=distanceSquared(p,out);if(!bestD||compareRational(dist,bestD)<0){best=out;bestD=dist;}}
  return best!;
}
/** Minimum perpendicular distance inside the two flat end caps of a finite fracture cylinder. */
export function axisSolidDistance(from:Point3,to:Point3,solid:Solid):Rational|null {
  if(intersectSolid(from,to,solid,true))return rat(0n);
  const a=exactPoint(from),b=exactPoint(to),dx=b.x*a.d-a.x*b.d,dy=b.y*a.d-a.y*b.d,dz=b.z*a.d-a.z*b.d,lengthSquared=dx*dx+dy*dy+dz*dz;
  if(lengthSquared===0n)return distanceSquared(from,nearestSolidPoint(from,solid));
  const axisTime=(point:Point3):Rational=>{const p=exactPoint(point);return rat(((p.x*a.d-a.x*p.d)*dx+(p.y*a.d-a.y*p.d)*dy+(p.z*a.d-a.z*p.d)*dz)*b.d,p.d*lengthSquared);};
  const subtract=(left:Rational,right:Rational)=>rat(left.n*right.d-right.n*left.d,left.d*right.d);
  const divide=(left:Rational,right:Rational)=>rat(left.n*right.d,left.d*right.n);
  const polygonClip=(polygon:Point3[],cap:Rational,minimum:boolean):Point3[]=>{const result:Point3[]=[];for(let i=0;i<polygon.length;i++){const p=polygon[i]!,q=polygon[(i+1)%polygon.length]!,pt=axisTime(p),qt=axisTime(q),inside=minimum?compareRational(pt,cap)>=0:compareRational(pt,cap)<=0,nextInside=minimum?compareRational(qt,cap)>=0:compareRational(qt,cap)<=0;if(inside)result.push(p);if(inside!==nextInside)result.push(interpolate(p,q,divide(subtract(cap,pt),subtract(qt,pt))));}return result;};
  const vertices=[[0n,-2000000n],[X,-1000000n],[X,1000000n],[0n,2000000n],[-X,1000000n],[-X,-1000000n]].map(([x,y])=>[solid.bottom,solid.top].map(z=>({x:String(solid.x+x!),y:String(solid.y+y!),z:String(z)})));
  const faces:Point3[][]=[vertices.map(v=>v[0]!),vertices.map(v=>v[1]!),...vertices.map((v,i)=>[v[0]!,vertices[(i+1)%6]![0]!,vertices[(i+1)%6]![1]!,v[1]!])];
  let best:Rational|null=null;
  for(const face of faces){const clipped=polygonClip(polygonClip(face,rat(0n),true),rat(1n),false);for(let i=0;i<clipped.length;i++){
    const p=clipped[i]!,q=clipped[(i+1)%clipped.length]!,pr=exactPoint(p),qr=exactPoint(q),origin=exactPoint(interpolate(from,to,axisTime(p))),end=exactPoint(interpolate(from,to,axisTime(q)));
    // Radial residual vectors are rational; the convex quadratic along this edge has a rational minimizer.
    const pd=pr.d*origin.d,qd=qr.d*end.d,px=pr.x*origin.d-origin.x*pr.d,py=pr.y*origin.d-origin.y*pr.d,pz=pr.z*origin.d-origin.z*pr.d,qx=qr.x*end.d-end.x*qr.d,qy=qr.y*end.d-end.y*qr.d,qz=qr.z*end.d-end.z*qr.d;
    const ex=qx*pd-px*qd,ey=qy*pd-py*qd,ez=qz*pd-pz*qd,den=ex*ex+ey*ey+ez*ez;let edgeTime=den?rat(-(px*ex+py*ey+pz*ez)*qd,den):rat(0n);if(edgeTime.n<0n)edgeTime=rat(0n);if(edgeTime.n>edgeTime.d)edgeTime=rat(1n);
    const candidate=interpolate(p,q,edgeTime),distance=distanceSquared(candidate,interpolate(from,to,axisTime(candidate)));if(!best||compareRational(distance,best)<0)best=distance;
  }}return best;
}
export function absorption(hit:Intersection,a:Point3,b:Point3):number {
  const e=hit.solid.element;if(!e)return Number.MAX_SAFE_INTEGER;
  if(compareRational(hit.enter,hit.exit)===0)return e.currentDurability;
  const len=distanceCeil(interpolate(a,b,hit.enter),interpolate(a,b,hit.exit));
  if(len===0n)return e.currentDurability;
  return Number(BigInt(e.currentDurability)*(len>HEIGHT?HEIGHT:len)/HEIGHT);
}
export function getSurface(map:BattleMap,id:string):Surface|undefined {return surfaceGraph(map).surfaces.get(id);}
export function moveCost(from:Surface,to:Surface,grasshopper=false):number|null {const dz=to.z-from.z;if(dz>(grasshopper?4:2))return null;return 1+(dz>0?(grasshopper?1:dz):0);}
const neighbors=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
type Graph={surfaces:Map<string,Surface>;cells:Map<string,Cell>;edges:Map<string,Surface[]>};
const graphCache=new WeakMap<BattleMap,Graph>();
export function surfaceGraph(map:BattleMap):Graph {
  const old=graphCache.get(map);if(old)return old;
  const surfaces=new Map<string,Surface>(),cells=new Map(map.cells.map(c=>[c.id,c])),at=new Map(map.cells.map(c=>[`${c.q},${c.r}`,c]));
  for(const c of map.cells)for(const s of c.surfaces)if(s.walkable)surfaces.set(s.id,s);
  const edges=new Map<string,Surface[]>();for(const s of surfaces.values()){const c=cells.get(s.cellId)!;edges.set(s.id,neighbors.flatMap(([q,r])=>at.get(`${c.q+q!},${c.r+r!}`)?.surfaces.filter(s=>s.walkable)??[]).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0));}
  const graph={surfaces,cells,edges};graphCache.set(map,graph);return graph;
}
export function findPath(map:BattleMap,from:string,to:string,grasshopper=false):{path:string[];cost:number}|null {
  const g=surfaceGraph(map);if(!g.surfaces.has(from)||!g.surfaces.has(to))return null;
  type Entry={id:string;cost:number;path:string[]};const order=(a:Entry,b:Entry)=>a.cost-b.cost||a.path.length-b.path.length||(a.path.join('\0')<b.path.join('\0')?-1:a.path.join('\0')>b.path.join('\0')?1:0);
  const queue:Entry[]=[{id:from,cost:0,path:[]}],best=new Map<string,Entry>([[from,queue[0]!]]);
  while(queue.length){queue.sort(order);const item=queue.shift()!;if(best.get(item.id)!==item)continue;if(item.id===to)return {path:item.path,cost:item.cost};for(const next of g.edges.get(item.id)??[]){const c=moveCost(g.surfaces.get(item.id)!,next,grasshopper);if(c===null)continue;const n={id:next.id,cost:item.cost+c,path:[...item.path,next.id]};if(!best.has(n.id)||order(n,best.get(n.id)!)<0){best.set(n.id,n);queue.push(n);}}}return null;
}
