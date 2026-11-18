// Tidy: one click cleans up the composition; the bar offers undo, compare and strength.
import { useEffect, useRef, useState } from 'react';
import { getLoadedFont } from '../core/fonts';
import type { LaidBlock } from '../core/layout';
import type { Project } from '../core/model';
import type { Store } from '../core/store';
import { describeReport, tidyBlock, type TidyReport } from '../core/tidy';

export interface TidySession {
  original: Project;
  strength: number;
  report: TidyReport;
  /** store revision right after the last tidy write; any other edit closes the bar */
  rev: number;
  blocks: string[];
  groups?: Map<string, Set<string>>;
}

/** Which blocks/groups to tidy: the selection's, or everything. */
export function tidyScope(store: Store, layouts: Map<string, LaidBlock>) {
  const { project, selection } = store.get();
  if (!selection.length) return { blocks: project.blocks.map((b) => b.id) };
  const groups = new Map<string, Set<string>>();
  const blocks = new Set<string>();
  for (const r of selection) {
    blocks.add(r.block);
    const lb = layouts.get(r.block);
    if (!lb || r.kind === 'block') continue;
    const set = groups.get(r.block) ?? new Set<string>();
    if (r.kind === 'group') set.add(r.key);
    else if (r.kind === 'word') lb.glyphs.filter((g) => g.wordKey === r.key && g.groupKey).forEach((g) => set.add(g.groupKey));
    else {
      const letter = r.kind === 'join' ? lb.joins.find((j) => j.key === r.key)?.a : r.key.match(/^c\d+\.\d+/)?.[0];
      const gk = letter && lb.owners.get(letter)?.group;
      if (gk) set.add(gk);
    }
    groups.set(r.block, set);
  }
  // a whole-block selection tidies the whole block
  for (const r of selection) if (r.kind === 'block') groups.delete(r.block);
  return { blocks: [...blocks], groups };
}

export function runTidy(original: Project, strength: number, blocks: string[], groups?: Map<string, Set<string>>) {
  const total: TidyReport = { smoothed: 0, kashidas: 0, forms: 0, spaced: 0, dots: 0 };
  const next: Project = {
    ...original,
    blocks: original.blocks.map((b) => {
      const font = getLoadedFont(b.font);
      if (!blocks.includes(b.id) || !font || b.locked) return b;
      const g = groups?.get(b.id);
      const { block, report } = tidyBlock(b, font, { strength, groups: g && g.size ? g : undefined });
      for (const k of Object.keys(total) as (keyof TidyReport)[]) total[k] += report[k];
      return block;
    }),
  };
  return { project: next, report: total };
}

export function TidyBar({
  store,
  session,
  setSession,
  setCompare,
}: {
  store: Store;
  session: TidySession;
  setSession: (s: TidySession | null) => void;
  setCompare: (on: boolean) => void;
}) {
  const [strength, setStrength] = useState(session.strength);
  const timer = useRef<number | undefined>(undefined);
  const own = useRef(false);

  // a different edit after tidying means the user moved on: close the bar (undo still works)
  useEffect(() => {
    const off = store.subscribe(() => {
      if (!own.current && store.get().rev !== session.rev) setSession(null);
    });
    return () => {
      off();
    };
  }, [store, session.rev, setSession]);

  const restrength = (v: number) => {
    setStrength(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const { project, report } = runTidy(session.original, v, session.blocks, session.groups);
      // replace the tidied version in place: still a single undo step back to the original
      own.current = true;
      store.update(() => project, { record: false });
      own.current = false;
      setSession({ ...session, strength: v, report, rev: store.get().rev });
    }, 60);
  };

  return (
    <div className="tidy-bar" role="status">
      <span className="tidy-title">✨ Tidied</span>
      <span className="tidy-report">{describeReport(session.report)}</span>
      <label className="tidy-strength" title="How far Tidy goes">
        Gentle
        <input type="range" min={0.1} max={1} step={0.05} value={strength} onChange={(e) => restrength(Number(e.target.value))} aria-label="Tidy strength" />
        Strong
      </label>
      <button
        type="button"
        className="ghost"
        title="Hold to see the composition before tidying"
        onPointerDown={() => setCompare(true)}
        onPointerUp={() => setCompare(false)}
        onPointerLeave={() => setCompare(false)}
        onKeyDown={(e) => e.key === ' ' && setCompare(true)}
        onKeyUp={() => setCompare(false)}
      >
        Hold to compare
      </button>
      <button
        type="button"
        className="tidy-undo"
        onClick={() => {
          store.undo();
          setSession(null);
        }}
      >
        ↶ Undo tidy
      </button>
      <button type="button" className="primary" onClick={() => setSession(null)}>
        Keep
      </button>
    </div>
  );
}
