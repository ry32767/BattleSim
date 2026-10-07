import type { Point3 } from '@battle/contracts';
import { compareRational, exactPoint, integerSqrt, rat } from './geometry';
import type { Rational } from './geometry';

export type CollisionTime = { rational: Rational } | { a: bigint; b: bigint; c: bigint; discriminant: bigint; sign: -1 | 1 };
export const rationalTime = (value: Rational): CollisionTime => ({ rational: value });
export function quadraticTime(a: bigint, b: bigint, c: bigint, sign: -1 | 1): CollisionTime {
  const discriminant = b * b - 4n * a * c, root = integerSqrt(discriminant);
  if (a <= 0n) throw new Error('INVALID_QUADRATIC_TIME');
  return root * root === discriminant ? rationalTime(rat(-b + BigInt(sign) * root, 2n * a)) : { a, b, c, discriminant, sign };
}
function compareRootRational(root: Exclude<CollisionTime, { rational: Rational }>, value: Rational): number {
  const v = 2n * root.a * value.n + root.b * value.d, d = root.discriminant * value.d * value.d;
  if (root.sign === 1) return v < 0n ? 1 : v * v < d ? 1 : v * v > d ? -1 : 0;
  return v >= 0n ? -1 : v * v < d ? -1 : v * v > d ? 1 : 0;
}
/** Irrational roots retain enclosing rational intervals; precision is increased until ordering is proven. */
export function timeBounds(value: CollisionTime, bits = 32): { lower: Rational; upper: Rational } {
  if ('rational' in value) return { lower: value.rational, upper: value.rational };
  const scale = 1n << BigInt(bits), root = integerSqrt(value.discriminant * scale * scale), denominator = 2n * value.a * scale;
  return value.sign === 1 ? { lower: rat(-value.b * scale + root, denominator), upper: rat(-value.b * scale + root + 1n, denominator) } : { lower: rat(-value.b * scale - root - 1n, denominator), upper: rat(-value.b * scale - root, denominator) };
}
export function compareCollisionTime(left: CollisionTime, right: CollisionTime): number {
  if ('rational' in left) return 'rational' in right ? compareRational(left.rational, right.rational) : -compareRootRational(right, left.rational);
  if ('rational' in right) return compareRootRational(left, right.rational);
  const linear = left.b * right.a - right.b * left.a, constant = left.c * right.a - right.c * left.a;
  if (linear === 0n && constant === 0n) return left.sign === right.sign ? 0 : left.sign < right.sign ? -1 : 1;
  if (linear !== 0n) { const shared = rat(-constant, linear); if (compareRootRational(left, shared) === 0 && compareRootRational(right, shared) === 0) return 0; }
  for (let bits = 32; ; bits *= 2) {
    const l = timeBounds(left, bits), r = timeBounds(right, bits);
    if (compareRational(l.upper, r.lower) < 0) return -1;
    if (compareRational(l.lower, r.upper) > 0) return 1;
  }
}
export function bodyCylinderIntersection(from: Point3, to: Point3, center: Point3): { enter: CollisionTime; exit: CollisionTime } | null {
  const p = exactPoint(from), q = exactPoint(to), c = exactPoint(center), denominator = p.d * q.d * c.d;
  const px = p.x * q.d * c.d - c.x * p.d * q.d, py = p.y * q.d * c.d - c.y * p.d * q.d, pz = p.z * q.d * c.d - c.z * p.d * q.d;
  const dx = (q.x * p.d - p.x * q.d) * c.d, dy = (q.y * p.d - p.y * q.d) * c.d, dz = (q.z * p.d - p.z * q.d) * c.d;
  let enter = rationalTime(rat(0n)), exit = rationalTime(rat(1n));
  if (dz === 0n) { if (pz < 0n || pz > 840000n * denominator) return null; }
  else { const one = rationalTime(rat(-pz, dz)), two = rationalTime(rat(840000n * denominator - pz, dz)), low = compareCollisionTime(one, two) < 0 ? one : two, high = low === one ? two : one; if (compareCollisionTime(low, enter) > 0) enter = low; if (compareCollisionTime(high, exit) < 0) exit = high; }
  const a = dx * dx + dy * dy, b = 2n * (px * dx + py * dy), cc = px * px + py * py - 280000n ** 2n * denominator ** 2n;
  if (a === 0n) { if (cc > 0n) return null; }
  else { if (b * b - 4n * a * cc < 0n) return null; const low = quadraticTime(a, b, cc, -1), high = quadraticTime(a, b, cc, 1); if (compareCollisionTime(low, enter) > 0) enter = low; if (compareCollisionTime(high, exit) < 0) exit = high; }
  return compareCollisionTime(enter, exit) <= 0 ? { enter, exit } : null;
}
