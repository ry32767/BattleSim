export type BoardPoint = [number, number];
export const HEX_RADIUS = 20;
export const HEX_HALF_WIDTH = 1732051 / 100000;
export const HEX_VERTICES: BoardPoint[] = [[0, -20], [HEX_HALF_WIDTH, -10], [HEX_HALF_WIDTH, 10], [0, 20], [-HEX_HALF_WIDTH, 10], [-HEX_HALF_WIDTH, -10]];

export function normalizeDirection(degrees: number): number { return ((degrees % 360) + 360) % 360; }

/** Ground-plane basis shared by drawing and pointer inverse projection. */
export function boardBasis(flat: boolean, yaw: number): [number, number, number, number] {
  if (flat) return [1, 0, 0, 1];
  const angle = yaw * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  return [c, .65 * s, -s, .65 * c];
}

export function projectBoard(x: number, y: number, height: number, flat: boolean, yaw: number): BoardPoint {
  const [a, b, c, d] = boardBasis(flat, yaw);
  return [a * x + c * y, b * x + d * y - (flat ? 0 : height)];
}

export function unprojectBoardVector(x: number, y: number, flat: boolean, yaw: number): BoardPoint {
  const [a, b, c, d] = boardBasis(flat, yaw), determinant = a * d - b * c;
  return [(d * x - c * y) / determinant, (-b * x + a * y) / determinant];
}

export function projectCell(cell: { q: number; r: number }, z: number, flat: boolean, yaw: number): BoardPoint {
  return projectBoard(HEX_HALF_WIDTH * (2 * cell.q + cell.r), 30 * cell.r, 14 * z, flat, yaw);
}

export function boardDepth(cell: { q: number; r: number }, yaw: number, height=0): number {
  return boardWorldDepth(HEX_HALF_WIDTH * (2 * cell.q + cell.r), 30 * cell.r, height, yaw);
}

export function boardWorldDepth(x:number,y:number,height:number,yaw:number):number {
  const angle = yaw * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  return s * x + c * y + .65 * height;
}

export function containsBoardHex(x: number, y: number, center: BoardPoint, flat: boolean, yaw: number): boolean {
  const [xx, yy] = unprojectBoardVector(x - center[0], y - center[1], flat, yaw);
  return Math.abs(yy) <= HEX_RADIUS + 1e-9 && Math.abs(xx) <= HEX_HALF_WIDTH + 1e-9 && Math.abs(xx) <= 2 * HEX_HALF_WIDTH * (1 - Math.abs(yy) / HEX_RADIUS) + 1e-9;
}

export function boardDirection(x: number, y: number, flat: boolean, yaw: number): number {
  const [worldX, worldY] = unprojectBoardVector(x, y, flat, yaw);
  return normalizeDirection(Math.round(Math.atan2(worldY, worldX) * 180 / Math.PI));
}
