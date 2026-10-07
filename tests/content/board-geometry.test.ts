import { describe, expect, it } from 'vitest';
import { boardDepth, boardDirection, containsBoardHex, projectBoard, projectCell, unprojectBoardVector } from '../../apps/web/src/boardProjection';

describe('board yaw projection', () => {
  it('keeps north straight up without horizontal shear at the default camera', () => {
    expect(projectBoard(0,-100,0,false,0)).toEqual([0,-65]);
    expect(projectBoard(100,0,0,false,0)).toEqual([100,0]);
  });
  it('inverts the same rotated ground plane used to draw direction handles', () => {
    for (const yaw of [0, 30, 90, 180, 270, 359]) for (const direction of [0, 45, 90, 180, 270]) {
      const a = direction * Math.PI / 180, world = [60 * Math.cos(a), 60 * Math.sin(a)];
      const p = projectBoard(world[0], world[1], 0, false, yaw), back = unprojectBoardVector(...p, false, yaw);
      expect(back[0]).toBeCloseTo(world[0], 10); expect(back[1]).toBeCloseTo(world[1], 10);
      expect(boardDirection(...p, false, yaw)).toBe(direction);
    }
  });
  it('picks the projected roof plane after rotation and keeps outside points outside', () => {
    for (const yaw of [0, 45, 135, 225, 315]) {
      const center = projectCell({ q: 3, r: -2 }, 8, false, yaw);
      for (const [x, y, inside] of [[0, 0, true], [0, 19, true], [17, 0, true], [0, 21, false], [18, 0, false]] as const) {
        const offset = projectBoard(x, y, 0, false, yaw);
        expect(containsBoardHex(center[0] + offset[0], center[1] + offset[1], center, false, yaw)).toBe(inside);
      }
    }
  });
  it('keeps flat and radar coordinates north-fixed regardless of stored yaw or height', () => {
    expect(projectCell({ q: 3, r: 4 }, 10, true, 237)).toEqual(projectCell({ q: 3, r: 4 }, 0, true, 0));
    expect(boardDirection(0, -20, true, 237)).toBe(270);
  });
  it('reverses the stable back-to-front order when the camera turns halfway', () => {
    const a = { q: 0, r: 0 }, b = { q: 0, r: 1 };
    expect(boardDepth(b, 0)).toBeGreaterThan(boardDepth(a, 0));
    expect(boardDepth(b, 180)).toBeLessThan(boardDepth(a, 180));
  });
});
