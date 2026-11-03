export interface Point {
  x: number;
  y: number;
}

export interface Thread {
  /** SVG path for a thread that sags between two pins. */
  path: string;
  /** The point a fraction of the way along it (0 = first pin, 1 = second pin). */
  at(t: number): Point;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * A thread pinned at two points hangs under its own weight: the more slack,
 * the deeper it sags. The bend is the same whichever pin is called "first", so
 * a string looks the same from either end.
 */
export function threadBetween(a: Point, b: Point): Thread {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sag = clamp(Math.hypot(dx, dy) * 0.22, 16, 84);
  const c1 = { x: a.x + dx * 0.25, y: a.y + dy * 0.25 + sag };
  const c2 = { x: a.x + dx * 0.75, y: a.y + dy * 0.75 + sag };
  return {
    path: `M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`,
    at(t) {
      const u = 1 - t;
      const w = (p0: number, p1: number, p2: number, p3: number) =>
        u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
      return { x: w(a.x, c1.x, c2.x, b.x), y: w(a.y, c1.y, c2.y, b.y) };
    },
  };
}

/** A small, stable angle (-0.8 to 0.8 degrees) from an id, so a card always sits the same way. */
export function pinAngle(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ((h % 17) - 8) / 10;
}
