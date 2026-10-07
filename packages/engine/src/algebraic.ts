import type { Point3 } from '@battle/contracts';
import type { CollisionTime } from './collision';
import type { Solid } from './geometry';
import { exactPoint, integerSqrt, pointJSON } from './geometry';

/** A coordinate in one real quadratic extension: (a+b√radicand)/d, d>0. */
export type Quadratic = { a: bigint; b: bigint; d: bigint };
export type AlgebraicPoint = { x: Quadratic; y: Quadratic; z: Quadratic };
export type ExactImpact = { from: Point3; to: Point3; a: string; b: string; c: string; discriminant: string; sign: -1 | 1; cellId?:string };
type Hit = { solid: Solid; enter: Quadratic; exit: Quadratic; point: AlgebraicPoint };
const abs = (value: bigint) => value < 0n ? -value : value;
const gcd = (a: bigint, b: bigint): bigint => b ? gcd(b, a % b) : abs(a);
export class QuadraticGeometry {
  readonly radicand: bigint;
  constructor(radicand: bigint) { if (radicand < 0n) throw new Error('INVALID_RADICAND'); this.radicand = radicand; }
  n(a: bigint, b = 0n, d = 1n): Quadratic { if (!d) throw new Error('ZERO_ALGEBRAIC_DENOMINATOR'); if (d < 0n) { a = -a; b = -b; d = -d; } const factor = gcd(gcd(a, b), d) || 1n; return { a: a / factor, b: b / factor, d: d / factor }; }
  add(x: Quadratic, y: Quadratic): Quadratic { return this.n(x.a * y.d + y.a * x.d, x.b * y.d + y.b * x.d, x.d * y.d); }
  neg(x: Quadratic): Quadratic { return { a: -x.a, b: -x.b, d: x.d }; }
  sub(x: Quadratic, y: Quadratic): Quadratic { return this.add(x, this.neg(y)); }
  mul(x: Quadratic, y: Quadratic): Quadratic { return this.n(x.a * y.a + x.b * y.b * this.radicand, x.a * y.b + x.b * y.a, x.d * y.d); }
  scale(x: Quadratic, value: bigint): Quadratic { return this.n(x.a * value, x.b * value, x.d); }
  div(x: Quadratic, y: Quadratic): Quadratic { return this.n((x.a * y.a - x.b * y.b * this.radicand) * y.d, (x.b * y.a - x.a * y.b) * y.d, x.d * (y.a * y.a - y.b * y.b * this.radicand)); }
  sign(x: Quadratic): number {
    if (!x.b || !this.radicand) return x.a < 0n ? -1 : x.a > 0n ? 1 : 0;
    if (!x.a) return x.b < 0n ? -1 : 1;
    if (x.a > 0n && x.b > 0n) return 1; if (x.a < 0n && x.b < 0n) return -1;
    const difference = x.a * x.a - x.b * x.b * this.radicand;
    return difference === 0n ? 0 : difference > 0n ? x.a < 0n ? -1 : 1 : x.b < 0n ? -1 : 1;
  }
  cmp(x: Quadratic, y: Quadratic): number { return this.sign(this.sub(x, y)); }
  clamp(x: Quadratic, low: Quadratic, high: Quadratic): Quadratic { return this.cmp(x, low) < 0 ? low : this.cmp(x, high) > 0 ? high : x; }
  point(value: Point3): AlgebraicPoint { const p = exactPoint(value); return { x: this.n(p.x, 0n, p.d), y: this.n(p.y, 0n, p.d), z: this.n(p.z, 0n, p.d) }; }
  representative(point: AlgebraicPoint):Point3 {const scale=1n<<256n,root=integerSqrt(this.radicand*scale*scale),x=point.x,y=point.y,z=point.z;return pointJSON({x:(x.a*scale+x.b*root)*y.d*z.d,y:(y.a*scale+y.b*root)*x.d*z.d,z:(z.a*scale+z.b*root)*x.d*y.d,d:x.d*y.d*z.d*scale});}
  subtract(p: AlgebraicPoint, q: AlgebraicPoint): AlgebraicPoint { return { x: this.sub(p.x, q.x), y: this.sub(p.y, q.y), z: this.sub(p.z, q.z) }; }
  dot(p: AlgebraicPoint, q: AlgebraicPoint): Quadratic { return this.add(this.add(this.mul(p.x, q.x), this.mul(p.y, q.y)), this.mul(p.z, q.z)); }
  lerp(p: AlgebraicPoint, q: AlgebraicPoint, t: Quadratic): AlgebraicPoint { const v = this.subtract(q, p); return { x: this.add(p.x, this.mul(v.x, t)), y: this.add(p.y, this.mul(v.y, t)), z: this.add(p.z, this.mul(v.z, t)) }; }
  distanceSquared(p: AlgebraicPoint, q: AlgebraicPoint): Quadratic { const v = this.subtract(p, q); return this.dot(v, v); }
  /** No floating estimate decides an integer attenuation boundary. */
  sqrtCeil(value: Quadratic): bigint {
    if (this.sign(value) < 0) throw new Error('NEGATIVE_ALGEBRAIC_DISTANCE');
    const sr = integerSqrt(this.radicand), upper = (abs(value.a) + abs(value.b) * (sr + 1n)) / value.d + 1n;
    let lo = 0n, hi = integerSqrt(upper) + 2n;
    const compareSquare = (v: bigint) => this.sign({ a: value.a - v * v * value.d, b: value.b, d: value.d });
    while (hi - lo > 1n) { const middle = (lo + hi) / 2n; if (compareSquare(middle) > 0) lo = middle; else hi = middle; }
    return compareSquare(0n) === 0 ? 0n : hi;
  }
  private planes(p: AlgebraicPoint): Quadratic[] { const x = this.scale(p.x, 1000000n), y = this.scale(p.y, 1732051n); return [p.x, this.neg(p.x), this.add(x, y), this.sub(x, y), this.sub(y, x), this.neg(this.add(x, y)), p.z, this.neg(p.z)]; }
  intersect(from: AlgebraicPoint, to: AlgebraicPoint, solid: Solid): Hit | null {
    const start = this.planes(from), end = this.planes(to), x = 1732051n, values = [solid.x + x, -solid.x + x, 1000000n * solid.x + x * solid.y + 2000000n * x, 1000000n * solid.x - x * solid.y + 2000000n * x, -1000000n * solid.x + x * solid.y + 2000000n * x, -1000000n * solid.x - x * solid.y + 2000000n * x, solid.top, -solid.bottom];
    let enter = this.n(0n), exit = this.n(1n);
    for (let i = 0; i < 8; i++) { const delta = this.sub(end[i]!, start[i]!), remaining = this.sub(this.n(values[i]!), start[i]!), direction = this.sign(delta); if (!direction) { if (this.sign(remaining) < 0) return null; continue; } const time = this.div(remaining, delta); if (direction > 0) { if (this.cmp(time, exit) < 0) exit = time; } else if (this.cmp(time, enter) > 0) enter = time; if (this.cmp(enter, exit) > 0) return null; }
    return { solid, enter, exit, point: this.lerp(from, to, enter) };
  }
  intersections(from: AlgebraicPoint, to: AlgebraicPoint, solids: Solid[]): Hit[] { return solids.map(s => this.intersect(from, to, s)).filter((h): h is Hit => !!h).sort((a, b) => this.cmp(a.enter, b.enter) || (a.solid.id < b.solid.id ? -1 : a.solid.id > b.solid.id ? 1 : 0)); }
  absorption(hit: Hit, from: AlgebraicPoint, to: AlgebraicPoint): number { if (!hit.solid.element) return Number.MAX_SAFE_INTEGER; if (!this.cmp(hit.enter, hit.exit)) return hit.solid.element.currentDurability; const length = this.sqrtCeil(this.distanceSquared(this.lerp(from, to, hit.enter), this.lerp(from, to, hit.exit))); return length===0n?hit.solid.element.currentDurability:Number(BigInt(hit.solid.element.currentDurability) * (length > 1400000n ? 1400000n : length) / 1400000n); }
  nearest(point: AlgebraicPoint, solid: Solid): AlgebraicPoint {
    const z = this.clamp(point.z, this.n(solid.bottom), this.n(solid.top)), local = this.subtract(point, { x: this.n(solid.x), y: this.n(solid.y), z: this.n(0n) }), planes = this.planes(local), x = 1732051n;
    if (planes.slice(0, 6).every((v, i) => this.cmp(v, this.n(i < 2 ? x : 2000000n * x)) <= 0)) return { x: point.x, y: point.y, z };
    const vertices = [[0n, -2000000n], [x, -1000000n], [x, 1000000n], [0n, 2000000n], [-x, 1000000n], [-x, -1000000n]]; let best: AlgebraicPoint | undefined, minimum: Quadratic | undefined;
    for (let i = 0; i < 6; i++) { const av = vertices[i]!, bv = vertices[(i + 1) % 6]!, a = { x: this.n(solid.x + av[0]!), y: this.n(solid.y + av[1]!), z }, b = { x: this.n(solid.x + bv[0]!), y: this.n(solid.y + bv[1]!), z }, delta = this.subtract(b, a), time = this.clamp(this.div(this.dot(this.subtract(point, a), delta), this.dot(delta, delta)), this.n(0n), this.n(1n)), candidate = this.lerp(a, b, time), distance = this.distanceSquared(point, candidate); if (!minimum || this.cmp(distance, minimum) < 0) { best = candidate; minimum = distance; } }
    return best!;
  }
  /** Exact radial minimum on the solid clipped by both finite perpendicular end caps. */
  axisDistance(from: AlgebraicPoint, to: AlgebraicPoint, solid: Solid): Quadratic | null {
    if (this.intersect(from, to, solid)) return this.n(0n); const delta = this.subtract(to, from), length = this.dot(delta, delta); if (!this.sign(length)) return this.distanceSquared(from, this.nearest(from, solid));
    const time = (point: AlgebraicPoint) => this.div(this.dot(this.subtract(point, from), delta), length);
    const clip = (polygon: AlgebraicPoint[], cap: Quadratic, minimum: boolean): AlgebraicPoint[] => { const result: AlgebraicPoint[] = []; for (let i = 0; i < polygon.length; i++) { const p = polygon[i]!, q = polygon[(i + 1) % polygon.length]!, pt = time(p), qt = time(q), inside = minimum ? this.cmp(pt, cap) >= 0 : this.cmp(pt, cap) <= 0, nextInside = minimum ? this.cmp(qt, cap) >= 0 : this.cmp(qt, cap) <= 0; if (inside) result.push(p); if (inside !== nextInside) result.push(this.lerp(p, q, this.div(this.sub(cap, pt), this.sub(qt, pt)))); } return result; };
    const x = 1732051n, vertices = [[0n, -2000000n], [x, -1000000n], [x, 1000000n], [0n, 2000000n], [-x, 1000000n], [-x, -1000000n]].map(([vx, vy]) => [solid.bottom, solid.top].map(z => ({ x: this.n(solid.x + vx!), y: this.n(solid.y + vy!), z: this.n(z) })));
    const faces = [vertices.map(v => v[0]!), vertices.map(v => v[1]!), ...vertices.map((v, i) => [v[0]!, vertices[(i + 1) % 6]![0]!, vertices[(i + 1) % 6]![1]!, v[1]!])]; let best: Quadratic | null = null;
    for (const face of faces) { const clipped = clip(clip(face, this.n(0n), true), this.n(1n), false); for (let i = 0; i < clipped.length; i++) { const p = clipped[i]!, q = clipped[(i + 1) % clipped.length]!, pr = this.subtract(p, this.lerp(from, to, time(p))), qr = this.subtract(q, this.lerp(from, to, time(q))), residualDelta = this.subtract(qr, pr), residualLength = this.dot(residualDelta, residualDelta), t = this.sign(residualLength) ? this.clamp(this.div(this.neg(this.dot(pr, residualDelta)), residualLength), this.n(0n), this.n(1n)) : this.n(0n), candidate = this.lerp(p, q, t), distance = this.distanceSquared(candidate, this.lerp(from, to, time(candidate))); if (!best || this.cmp(distance, best) < 0) best = distance; } } return best;
  }
}
export function impactDescriptor(from: Point3, to: Point3, time: CollisionTime): ExactImpact | undefined { return 'rational' in time ? undefined : { from, to, a: String(time.a), b: String(time.b), c: String(time.c), discriminant: String(time.discriminant), sign: time.sign }; }
export function impactGeometry(impact: ExactImpact): { geometry: QuadraticGeometry; point: AlgebraicPoint } { const geometry = new QuadraticGeometry(BigInt(impact.discriminant)), time = geometry.n(-BigInt(impact.b), BigInt(impact.sign), 2n * BigInt(impact.a)); return { geometry, point: geometry.lerp(geometry.point(impact.from), geometry.point(impact.to), time) }; }
