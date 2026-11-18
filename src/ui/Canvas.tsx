import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type BBox, type Pt, apply, applyVec, bboxCenter, invert } from '../core/geometry';
import type { LaidBlock } from '../core/layout';
import { type Edit, type ElemRef, refId } from '../core/model';
import { getEdit, sameRef, setEdit, type Store, useStore } from '../core/store';
import { Artwork } from './Artwork';
import {
  elemInfo,
  hitFromElement,
  moveEdit,
  resolveRef,
  rotateEdit,
  scaleEdit,
  selectionBBox,
} from './selection';

interface View {
  x: number;
  y: number;
  z: number;
}

type GestureType = 'move' | 'rotate' | 'scale' | 'scaleX' | 'scaleY' | 'join' | 'stretch' | 'pan' | 'pinch' | 'point';

interface Gesture {
  type: GestureType;
  pointerId: number;
  start: Pt; // artboard
  startScreen: Pt;
  view0: View;
  center: Pt;
  refs: ElemRef[];
  edits0: Map<string, Edit>;
  moved: boolean;
  /** join gesture: chord info */
  chordLen?: number;
  normal?: Pt;
  /** curve point editing */
  pointKey?: string;
  pinch?: { a: Pt; b: Pt; ids: [number, number]; onSelection: boolean };
}

export function Canvas({ store, layouts }: { store: Store; layouts: Map<string, LaidBlock> }) {
  const project = useStore(store, (s) => s.project);
  const selection = useStore(store, (s) => s.selection);
  const mode = useStore(store, (s) => s.mode);
  const showGuides = useStore(store, (s) => s.showGuides);
  const curveEdit = useStore(store, (s) => s.curveEdit);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 0.5 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const [hover, setHover] = useState<ElemRef | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const layoutsRef = useRef(layouts);
  layoutsRef.current = layouts;

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = r.width < 600 ? 12 : 40;
    const z = Math.min((r.width - pad * 2) / project.width, (r.height - pad * 2) / project.height);
    setView({ z, x: (r.width - project.width * z) / 2, y: (r.height - project.height * z) / 2 });
  }, [project.width, project.height]);

  useLayoutEffect(() => {
    fit();
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => {
    const onFit = () => fit();
    window.addEventListener('midad:fit', onFit);
    return () => window.removeEventListener('midad:fit', onFit);
  }, [fit]);

  const toArt = useCallback((clientX: number, clientY: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return [(clientX - r.left - v.x) / v.z, (clientY - r.top - v.y) / v.z];
  }, []);

  const toScreen = (clientX: number, clientY: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return [clientX - r.left, clientY - r.top];
  };

  const flash = (msg: string) => {
    setHint(msg);
    window.setTimeout(() => setHint((h) => (h === msg ? null : h)), 2200);
  };

  const beginElemGesture = (type: GestureType, e: React.PointerEvent, refs: ElemRef[], extra: Partial<Gesture> = {}) => {
    const st = store.get();
    const edits0 = new Map<string, Edit>();
    for (const r of refs) edits0.set(refId(r), getEdit(st.project, r));
    const bb = selectionBBox(layoutsRef.current, refs);
    const start = toArt(e.clientX, e.clientY);
    gesture.current = {
      type,
      pointerId: e.pointerId,
      start,
      startScreen: toScreen(e.clientX, e.clientY),
      view0: viewRef.current,
      center: bb ? bboxCenter(bb) : start,
      refs,
      edits0,
      moved: false,
      ...extra,
    };
    store.beginGesture();
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);

    // Second finger: pinch
    if (pointers.current.size === 2 && gesture.current) {
      const g = gesture.current;
      const ids = [...pointers.current.keys()] as [number, number];
      const [a, b] = ids.map((id) => pointers.current.get(id)!) as [Pt, Pt];
      const onSelection = g.type === 'move' && g.refs.length > 0;
      if (onSelection) {
        // restore the move so the pinch starts from the original state
        store.update((p) => g.refs.reduce((acc, r) => setEdit(acc, r, g.edits0.get(refId(r)) ?? {}), p));
      }
      gesture.current = { ...g, type: 'pinch', pinch: { a, b, ids, onSelection }, view0: viewRef.current };
      return;
    }
    if (pointers.current.size > 2) return;

    const target = e.target as Element;
    const handle = (target as SVGElement).dataset?.handle as GestureType | undefined;
    const st = store.get();
    if (handle) {
      e.stopPropagation();
      if (handle === 'join' || handle === 'stretch' || handle === 'point') {
        const ref: ElemRef = JSON.parse((target as SVGElement).dataset.ref!);
        if (handle === 'join') {
          const lb = layoutsRef.current.get(ref.block);
          const j = lb?.joins.find((x) => x.key === ref.key);
          const len = j ? Math.hypot(j.pB[0] - j.pA[0], j.pB[1] - j.pA[1]) : 0;
          const normal: Pt = j && len > 0 ? [-(j.pB[1] - j.pA[1]) / len, (j.pB[0] - j.pA[0]) / len] : [0, -1];
          store.select([ref]);
          beginElemGesture('join', e, [ref], { chordLen: len, normal });
        } else if (handle === 'point') {
          beginElemGesture('point', e, [ref], { pointKey: (target as SVGElement).dataset.point });
        } else {
          beginElemGesture('stretch', e, [ref]);
        }
        return;
      }
      beginElemGesture(handle, e, st.selection);
      return;
    }
    let hit = hitFromElement(target);
    if (!hit && e.pointerType !== 'mouse') hit = nearbyHit(e.clientX, e.clientY);
    if (hit) {
      const ref = resolveRef(hit, st.mode, layoutsRef.current);
      const block = st.project.blocks.find((b) => b.id === hit.block);
      if (ref && !block?.locked) {
        const already = st.selection.some((r) => sameRef(r, ref));
        let sel = st.selection;
        if (e.shiftKey || e.metaKey || e.ctrlKey) sel = already ? sel.filter((r) => !sameRef(r, ref)) : [...sel, ref];
        else if (!already) sel = [ref];
        store.select(sel);
        beginElemGesture('move', e, sel);
        return;
      }
      if (!ref && st.mode === 'mark') flash('Dots & marks mode: tap a dot or a ḥaraka (switch to Letter to move whole letters)');
    }
    // background: deselect + pan
    if (!e.shiftKey) store.select([]);
    gesture.current = {
      type: 'pan',
      pointerId: e.pointerId,
      start: toArt(e.clientX, e.clientY),
      startScreen: toScreen(e.clientX, e.clientY),
      view0: viewRef.current,
      center: [0, 0],
      refs: [],
      edits0: new Map(),
      moved: false,
    };
  };

  const applyEdits = (g: Gesture, fn: (ref: ElemRef, e0: Edit) => Edit) => {
    store.update(
      (p) => g.refs.reduce((acc, r) => setEdit(acc, r, fn(r, g.edits0.get(refId(r)) ?? {})), p),
      { record: false },
    );
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const g = gesture.current;
    if (!g) {
      // hover feedback
      const hit = hitFromElement(e.target as Element);
      const ref = hit ? resolveRef(hit, store.get().mode, layoutsRef.current) : null;
      setHover((h) => (h && ref && sameRef(h, ref)) || (!h && !ref) ? h : ref);
      return;
    }
    if (g.type === 'pinch' && g.pinch) {
      const a1 = pointers.current.get(g.pinch.ids[0]);
      const b1 = pointers.current.get(g.pinch.ids[1]);
      if (!a1 || !b1) return;
      const { a, b } = g.pinch;
      const d0 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const d1 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]) || 1;
      const ang = Math.atan2(b1[1] - a1[1], b1[0] - a1[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
      const f = d1 / d0;
      const r = svgRef.current!.getBoundingClientRect();
      const m0: Pt = [(a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top];
      const m1: Pt = [(a1[0] + b1[0]) / 2 - r.left, (a1[1] + b1[1]) / 2 - r.top];
      if (g.pinch.onSelection) {
        const v = g.view0;
        const c0: Pt = [(m0[0] - v.x) / v.z, (m0[1] - v.y) / v.z];
        const c1: Pt = [(m1[0] - v.x) / v.z, (m1[1] - v.y) / v.z];
        applyEdits(g, (ref, e0) => {
          const el = elemInfo(layoutsRef.current, ref);
          if (!el) return e0;
          let ed = scaleEdit(el, e0, c0, f, f, 'both');
          ed = rotateEdit(el, ed, c0, ang);
          return moveEdit(el, ed, [c1[0] - c0[0], c1[1] - c0[1]]);
        });
      } else {
        const v = g.view0;
        const z = clampZoom(v.z * f);
        // keep the artboard point under the first midpoint under the new midpoint
        const art: Pt = [(m0[0] - v.x) / v.z, (m0[1] - v.y) / v.z];
        setView({ z, x: m1[0] - art[0] * z, y: m1[1] - art[1] * z });
      }
      return;
    }
    if (e.pointerId !== g.pointerId) return;
    const cur = toArt(e.clientX, e.clientY);
    const dv: Pt = [cur[0] - g.start[0], cur[1] - g.start[1]];
    const sc = toScreen(e.clientX, e.clientY);
    if (!g.moved && Math.hypot(sc[0] - g.startScreen[0], sc[1] - g.startScreen[1]) < 3) return;
    g.moved = true;
    switch (g.type) {
      case 'pan': {
        setView({ ...g.view0, x: g.view0.x + sc[0] - g.startScreen[0], y: g.view0.y + sc[1] - g.startScreen[1] });
        break;
      }
      case 'move': {
        const snap = e.shiftKey ? (Math.abs(dv[0]) > Math.abs(dv[1]) ? [dv[0], 0] : [0, dv[1]]) : dv;
        applyEdits(g, (ref, e0) => {
          const el = elemInfo(layoutsRef.current, ref);
          return el ? moveEdit(el, e0, snap as Pt) : e0;
        });
        break;
      }
      case 'rotate': {
        let a = Math.atan2(cur[1] - g.center[1], cur[0] - g.center[0]) - Math.atan2(g.start[1] - g.center[1], g.start[0] - g.center[0]);
        if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
        applyEdits(g, (ref, e0) => {
          const el = elemInfo(layoutsRef.current, ref);
          return el ? rotateEdit(el, e0, g.center, a) : e0;
        });
        break;
      }
      case 'scale':
      case 'scaleX':
      case 'scaleY': {
        const c = g.center;
        let fx = (cur[0] - c[0]) / (g.start[0] - c[0] || 1);
        let fy = (cur[1] - c[1]) / (g.start[1] - c[1] || 1);
        if (g.type === 'scale') {
          const f = Math.hypot(cur[0] - c[0], cur[1] - c[1]) / (Math.hypot(g.start[0] - c[0], g.start[1] - c[1]) || 1);
          fx = fy = f;
        }
        fx = Math.max(0.05, fx);
        fy = Math.max(0.05, fy);
        const axis = g.type === 'scale' ? 'both' : g.type === 'scaleX' ? 'x' : 'y';
        applyEdits(g, (ref, e0) => {
          const el = elemInfo(layoutsRef.current, ref);
          return el ? scaleEdit(el, e0, c, fx, fy, axis) : e0;
        });
        break;
      }
      case 'join': {
        const ref = g.refs[0];
        const lb = layoutsRef.current.get(ref.block);
        if (!lb) break;
        const local = applyVec(invert(lb.base), dv);
        applyEdits(g, (_r, e0) => {
          const out: Edit = { ...e0, extend: Math.max(0, Math.round((e0.extend ?? 0) - local[0])) };
          if (g.chordLen && g.chordLen > 12 && g.normal) {
            const along = dv[0] * g.normal[0] + dv[1] * g.normal[1];
            out.bend = Math.max(-1, Math.min(1, (e0.bend ?? 0) + along / (g.chordLen * 0.5625)));
          }
          return out;
        });
        break;
      }
      case 'stretch': {
        const ref = g.refs[0];
        const el = elemInfo(layoutsRef.current, ref);
        if (!el) break;
        const local = applyVec(invert(el.parent), dv);
        applyEdits(g, (_r, e0) => ({ ...e0, stretch: Math.max(0, Math.round((e0.stretch ?? 0) - local[0])) }));
        break;
      }
      case 'point': {
        const ref = g.refs[0];
        const lb = layoutsRef.current.get(ref.block);
        const gl = lb?.glyphs.find((x) => x.key === ref.key);
        if (!gl || !g.pointKey) break;
        const local = applyVec(invert(gl.world), dv);
        applyEdits(g, (_r, e0) => {
          const pts = { ...(e0.points ?? {}) };
          const base = e0.points?.[g.pointKey!] ?? [0, 0];
          pts[g.pointKey!] = [Math.round(base[0] + local[0]), Math.round(base[1] + local[1])];
          return { ...e0, points: pts };
        });
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g && (e.pointerId === g.pointerId || g.type === 'pinch')) {
      if (g.type === 'pinch' && pointers.current.size > 0) return;
      gesture.current = null;
      store.endGesture();
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    if (e.ctrlKey || e.metaKey) {
      const f = Math.exp(-e.deltaY * 0.01);
      const z = clampZoom(v.z * f);
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setView({ z, x: mx - ((mx - v.x) / v.z) * z, y: my - ((my - v.y) / v.z) * z });
    } else {
      setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
    }
  };

  // prevent browser zoom on ctrl+wheel inside the canvas
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  useEffect(() => {
    const zoomBy = (ev: Event) => {
      const f = (ev as CustomEvent<number>).detail;
      const r = svgRef.current!.getBoundingClientRect();
      const v = viewRef.current;
      const z = clampZoom(v.z * f);
      const mx = r.width / 2;
      const my = r.height / 2;
      setView({ z, x: mx - ((mx - v.x) / v.z) * z, y: my - ((my - v.y) / v.z) * z });
    };
    window.addEventListener('midad:zoom', zoomBy);
    return () => window.removeEventListener('midad:zoom', zoomBy);
  }, []);

  const z = view.z;
  const hs = 9 / z; // handle size in artboard units
  const bb = selectionBBox(layouts, selection);
  const hoverBox = hover && !selection.some((r) => sameRef(r, hover)) ? elemInfo(layouts, hover)?.bbox : null;
  const single = selection.length === 1 ? selection[0] : null;
  const showTransformHandles = bb && selection.length > 0 && !selection.every((r) => r.kind === 'join');

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className="canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${z})`}>
          <rect x={-2} y={-2} width={project.width + 4} height={project.height + 4} className="artboard-shadow" />
          <Artwork project={project} layouts={layouts} interactive />
          {/* overlays */}
          <g className="overlay" style={{ pointerEvents: 'none' }}>
            {showGuides &&
              project.blocks.map((b) => (
                <line key={b.id} x1={(layouts.get(b.id)?.bbox.x0 ?? b.x) - 30} x2={(layouts.get(b.id)?.bbox.x1 ?? b.x) + 30} y1={b.y} y2={b.y} className="guide" strokeWidth={1 / z} />
              ))}
            {hoverBox && <Box b={hoverBox} z={z} className="hover-box" />}
            {selection.map((r) => {
              const el = elemInfo(layouts, r);
              return el && r.kind !== 'join' ? <Box key={refId(r)} b={el.bbox} z={z} className="sel-item" /> : null;
            })}
          </g>
          {showTransformHandles && <TransformHandles b={bb} hs={hs} z={z} />}
          <JoinHandles layouts={layouts} selection={selection} mode={mode} hs={hs} z={z} />
          {single && single.kind === 'glyph' && mode === 'letter' && !curveEdit && <StretchHandle layouts={layouts} r={single} hs={hs} z={z} />}
          {single && single.kind === 'glyph' && curveEdit && <PointHandles layouts={layouts} r={single} hs={hs} z={z} />}
        </g>
      </svg>
      {hint && <div className="canvas-hint">{hint}</div>}
    </div>
  );
}

/** Fingers are imprecise: look for a letter within a small radius of the tap. */
function nearbyHit(x: number, y: number) {
  for (const r of [6, 11, 16, 22]) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const h = hitFromElement(document.elementFromPoint(x + Math.cos(a) * r, y + Math.sin(a) * r));
      if (h) return h;
    }
  }
  return null;
}

function clampZoom(z: number) {
  return Math.min(8, Math.max(0.1, z));
}

function Box({ b, z, className }: { b: BBox; z: number; className: string }) {
  const p = 4 / z;
  return <rect x={b.x0 - p} y={b.y0 - p} width={b.x1 - b.x0 + 2 * p} height={b.y1 - b.y0 + 2 * p} className={className} strokeWidth={1.2 / z} />;
}

function TransformHandles({ b, hs, z }: { b: BBox; hs: number; z: number }) {
  const p = 6 / z;
  const x0 = b.x0 - p;
  const x1 = b.x1 + p;
  const y0 = b.y0 - p;
  const y1 = b.y1 + p;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rotY = y0 - 28 / z;
  const sq = (x: number, y: number, h: GestureType, cursor: string) => (
    <rect key={`${h}${x}${y}`} data-handle={h} x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} className="handle" strokeWidth={1.4 / z} style={{ cursor }} />
  );
  return (
    <g className="transform-handles">
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} className="sel-box" strokeWidth={1.4 / z} style={{ pointerEvents: 'none' }} />
      <line x1={cx} y1={y0} x2={cx} y2={rotY} className="sel-box" strokeWidth={1.2 / z} style={{ pointerEvents: 'none' }} />
      <circle data-handle="rotate" cx={cx} cy={rotY} r={hs * 0.65} className="handle rot" strokeWidth={1.4 / z} style={{ cursor: 'grab' }} />
      {sq(x0, y0, 'scale', 'nwse-resize')}
      {sq(x1, y0, 'scale', 'nesw-resize')}
      {sq(x0, y1, 'scale', 'nesw-resize')}
      {sq(x1, y1, 'scale', 'nwse-resize')}
      {/* edge handles only when the selection is big enough on screen to tell them apart */}
      {(x1 - x0) * z > 70 && sq(x0, cy, 'scaleX', 'ew-resize')}
      {(x1 - x0) * z > 70 && sq(x1, cy, 'scaleX', 'ew-resize')}
      {(y1 - y0) * z > 70 && sq(cx, y1, 'scaleY', 'ns-resize')}
      {/* invisible fat hit areas for touch */}
      <circle data-handle="rotate" cx={cx} cy={rotY} r={hs * 1.6} fill="transparent" />
    </g>
  );
}

function JoinHandles({ layouts, selection, mode, hs, z }: { layouts: Map<string, LaidBlock>; selection: ElemRef[]; mode: string; hs: number; z: number }) {
  if (mode !== 'letter' && mode !== 'group') return null;
  const out: React.ReactNode[] = [];
  for (const r of selection) {
    const lb = layouts.get(r.block);
    if (!lb) continue;
    for (const j of lb.joins) {
      const own = (k: string) => lb.owners.get(k);
      const related =
        (r.kind === 'glyph' && (j.a === r.key || j.b === r.key)) ||
        (r.kind === 'group' && own(j.a)?.group === r.key) ||
        (r.kind === 'join' && j.key === r.key);
      if (!related) continue;
      const active = selection.some((s) => s.kind === 'join' && s.key === j.key && s.block === r.block);
      const ref: ElemRef = { block: r.block, kind: 'join', key: j.key };
      out.push(
        <g key={`${r.block}${j.key}`}>
          {j.visible && <line x1={j.pA[0]} y1={j.pA[1]} x2={j.pB[0]} y2={j.pB[1]} className="join-chord" strokeWidth={1 / z} />}
          <circle
            data-handle="join"
            data-ref={JSON.stringify(ref)}
            cx={j.mid[0]}
            cy={j.mid[1]}
            r={hs * 0.62}
            className={`join-handle${active ? ' active' : ''}${j.visible ? ' stretched' : ''}`}
            strokeWidth={1.5 / z}
          >
            <title>Join: drag sideways to stretch (kashida), across to bend</title>
          </circle>
        </g>,
      );
    }
  }
  return <g>{out}</g>;
}

function StretchHandle({ layouts, r, hs, z }: { layouts: Map<string, LaidBlock>; r: ElemRef; hs: number; z: number }) {
  const lb = layouts.get(r.block);
  const gl = lb?.glyphs.find((g) => g.key === r.key);
  const el = lb && elemInfo(layouts, r);
  if (!gl || !el || gl.isMark || gl.outline.empty) return null;
  const b = el.bbox;
  const y = (b.y0 + b.y1) / 2;
  const x = b.x0 - 22 / z;
  const cut = gl.cutX;
  let cutLine: React.ReactNode = null;
  if (cut !== undefined) {
    const p0 = apply(gl.world, [cut, gl.outline.bbox.y0 - 40]);
    const p1 = apply(gl.world, [cut, gl.outline.bbox.y1 + 40]);
    cutLine = <line x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} className="cut-line" strokeWidth={1.2 / z} strokeDasharray={`${4 / z} ${3 / z}`} />;
  }
  return (
    <g>
      {cutLine}
      <g transform={`translate(${x} ${y})`}>
        <rect
          data-handle="stretch"
          data-ref={JSON.stringify(r)}
          x={-hs * 1.1}
          y={-hs * 0.7}
          width={hs * 2.2}
          height={hs * 1.4}
          rx={hs * 0.3}
          className="handle stretch"
          strokeWidth={1.4 / z}
          style={{ cursor: 'ew-resize' }}
        >
          <title>Elongate the letter (drag left)</title>
        </rect>
        <path d={`M${-hs * 0.7} 0 h${hs * 1.4} M${-hs * 0.7} 0 l${hs * 0.35} ${-hs * 0.3} M${-hs * 0.7} 0 l${hs * 0.35} ${hs * 0.3}`} className="stretch-glyph" strokeWidth={1.2 / z} style={{ pointerEvents: 'none' }} />
      </g>
    </g>
  );
}

function PointHandles({ layouts, r, hs, z }: { layouts: Map<string, LaidBlock>; r: ElemRef; hs: number; z: number }) {
  const lb = layouts.get(r.block);
  const gl = lb?.glyphs.find((g) => g.key === r.key);
  if (!gl || gl.outline.empty) return null;
  const edits = lb!.block.edits[r.key]?.points ?? {};
  const out: React.ReactNode[] = [];
  const s = gl.cutX !== undefined ? (lb!.block.edits[r.key]?.stretch ?? 0) : 0;
  const body = gl.outline.pieces[0]?.contours ?? [];
  for (const ci of body) {
    const contour = gl.outline.contours[ci];
    contour.forEach((cmd, mi) => {
      if (cmd.t === 'Z') return;
      const n = cmd.v.length / 2;
      for (let pi = 0; pi < n; pi++) {
        const key = `${ci}.${mi}.${pi}`;
        const off = edits[key] ?? [0, 0];
        let x = cmd.v[pi * 2] + off[0];
        const y = cmd.v[pi * 2 + 1] + off[1];
        if (s && gl.cutX !== undefined && x < gl.cutX) x -= s;
        const p = apply(gl.world, [x, y]);
        const onCurve = pi === n - 1;
        out.push(
          <rect
            key={key}
            data-handle="point"
            data-ref={JSON.stringify(r)}
            data-point={key}
            x={p[0] - (onCurve ? hs * 0.42 : hs * 0.3)}
            y={p[1] - (onCurve ? hs * 0.42 : hs * 0.3)}
            width={onCurve ? hs * 0.84 : hs * 0.6}
            height={onCurve ? hs * 0.84 : hs * 0.6}
            rx={onCurve ? 0 : hs}
            className={`pt-handle${onCurve ? '' : ' off'}${edits[key] ? ' moved' : ''}`}
            strokeWidth={1 / z}
          />,
        );
      }
    });
  }
  return <g>{out}</g>;
}
