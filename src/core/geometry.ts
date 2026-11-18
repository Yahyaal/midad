// Small 2D geometry kit: affine matrices, path commands, flattening, polygons.

export type Pt = [number, number];

/** Affine matrix [a, b, c, d, e, f] — same convention as SVG matrix(). */
export type Mat = [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function compose(...ms: Mat[]): Mat {
  return ms.reduce((acc, m) => mul(acc, m), IDENTITY);
}

export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const scale = (sx: number, sy = sx): Mat => [sx, 0, 0, sy, 0, 0];
export function rotate(deg: number): Mat {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

export function apply(m: Mat, p: Pt): Pt {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

/** Apply only the linear part (for vectors). */
export function applyVec(m: Mat, v: Pt): Pt {
  return [m[0] * v[0] + m[2] * v[1], m[1] * v[0] + m[3] * v[1]];
}

export function det(m: Mat): number {
  return m[0] * m[3] - m[1] * m[2];
}

export function invert(m: Mat): Mat {
  const d = det(m) || 1e-12;
  return [
    m[3] / d,
    -m[1] / d,
    -m[2] / d,
    m[0] / d,
    (m[2] * m[5] - m[3] * m[4]) / d,
    (m[1] * m[4] - m[0] * m[5]) / d,
  ];
}

export function matToSvg(m: Mat): string {
  return `matrix(${m.map((v) => round(v, 5)).join(' ')})`;
}

export function round(v: number, digits = 2): number {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}

// ---------------------------------------------------------------------------
// Path commands

export type CmdType = 'M' | 'L' | 'Q' | 'C' | 'Z';
export interface Cmd {
  t: CmdType;
  v: number[];
}
export type Contour = Cmd[];

/** Split a flat command list into contours (each starts with M). */
export function splitContours(cmds: Cmd[]): Contour[] {
  const out: Contour[] = [];
  let cur: Contour | null = null;
  for (const c of cmds) {
    if (c.t === 'M') {
      cur = [c];
      out.push(cur);
    } else if (cur) {
      cur.push(c);
    }
  }
  return out;
}

export type PointFn = (x: number, y: number) => Pt;

export function contoursToD(contours: Contour[], f?: PointFn): string {
  let d = '';
  for (const contour of contours) {
    for (const c of contour) {
      if (c.t === 'Z') {
        d += 'Z';
        continue;
      }
      d += c.t;
      for (let i = 0; i < c.v.length; i += 2) {
        const [x, y] = f ? f(c.v[i], c.v[i + 1]) : [c.v[i], c.v[i + 1]];
        d += `${round(x, 1)} ${round(y, 1)}${i + 2 < c.v.length ? ' ' : ''}`;
      }
    }
  }
  return d;
}

/** Flatten a contour to a polygon. Curves get `steps` segments, long lines get subdivided. */
export function flattenContour(contour: Contour, f?: PointFn, steps = 8, maxSeg = 25): Pt[] {
  const pts: Pt[] = [];
  const P = (x: number, y: number): Pt => (f ? f(x, y) : [x, y]);
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  const line = (a: Pt, b: Pt) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxSeg));
    for (let i = 1; i <= n; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  };
  for (const c of contour) {
    if (c.t === 'M') {
      cur = P(c.v[0], c.v[1]);
      start = cur;
      pts.push(cur);
    } else if (c.t === 'L') {
      const p = P(c.v[0], c.v[1]);
      line(cur, p);
      cur = p;
    } else if (c.t === 'Q') {
      const c1 = P(c.v[0], c.v[1]);
      const p = P(c.v[2], c.v[3]);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        pts.push([u * u * cur[0] + 2 * u * t * c1[0] + t * t * p[0], u * u * cur[1] + 2 * u * t * c1[1] + t * t * p[1]]);
      }
      cur = p;
    } else if (c.t === 'C') {
      const c1 = P(c.v[0], c.v[1]);
      const c2 = P(c.v[2], c.v[3]);
      const p = P(c.v[4], c.v[5]);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        pts.push([
          u * u * u * cur[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p[0],
          u * u * u * cur[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p[1],
        ]);
      }
      cur = p;
    } else if (c.t === 'Z') {
      if (cur[0] !== start[0] || cur[1] !== start[1]) line(cur, start);
      cur = start;
    }
  }
  // drop duplicated closing point
  if (pts.length > 1) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) pts.pop();
  }
  return pts;
}

export function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return a / 2;
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd inside test against a set of polygons (a glyph's filled area). */
export function insideShape(p: Pt, polys: Pt[][]): boolean {
  let n = 0;
  for (const poly of polys) if (pointInPolygon(p, poly)) n++;
  return n % 2 === 1;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function distToPolys(p: Pt, polys: Pt[][]): number {
  let best = Infinity;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const d = distToSegment(p, poly[j], poly[i]);
      if (d < best) best = d;
    }
  }
  return best;
}

export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const EMPTY_BBOX: BBox = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

export function bboxOf(points: Iterable<Pt>, into: BBox = { ...EMPTY_BBOX }): BBox {
  for (const [x, y] of points) {
    if (x < into.x0) into.x0 = x;
    if (y < into.y0) into.y0 = y;
    if (x > into.x1) into.x1 = x;
    if (y > into.y1) into.y1 = y;
  }
  return into;
}

export function unionBBox(a: BBox, b: BBox): BBox {
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

export function bboxValid(b: BBox): boolean {
  return Number.isFinite(b.x0) && Number.isFinite(b.x1);
}

export function bboxCenter(b: BBox): Pt {
  return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
}

export function transformBBox(m: Mat, b: BBox): BBox {
  return bboxOf([apply(m, [b.x0, b.y0]), apply(m, [b.x1, b.y0]), apply(m, [b.x0, b.y1]), apply(m, [b.x1, b.y1])]);
}

// ---------------------------------------------------------------------------
// Cubic helpers

export function cubicPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
