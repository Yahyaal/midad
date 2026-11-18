import { useEffect, useMemo, useState } from 'react';
import { getLoadedFont, loadFont } from '../core/fonts';
import { layoutBlock, type LaidBlock } from '../core/layout';
import type { Block, Project } from '../core/model';

const cache = new WeakMap<Block, LaidBlock>();

export function layoutFor(block: Block): LaidBlock | null {
  const hit = cache.get(block);
  if (hit) return hit;
  const font = getLoadedFont(block.font);
  if (!font) return null;
  const lb = layoutBlock(block, font);
  cache.set(block, lb);
  return lb;
}

export function computeLayouts(project: Project): Map<string, LaidBlock> {
  const m = new Map<string, LaidBlock>();
  for (const b of project.blocks) {
    const lb = layoutFor(b);
    if (lb) m.set(b.id, lb);
  }
  return m;
}

/** Ensures fonts are loaded and returns layouts for every block. */
export function useLayouts(project: Project) {
  const [fontTick, setFontTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fontIds = useMemo(() => [...new Set(project.blocks.map((b) => b.font))].sort().join(','), [project.blocks]);
  useEffect(() => {
    let alive = true;
    const ids = fontIds.split(',').filter(Boolean);
    const missing = ids.filter((id) => !getLoadedFont(id));
    if (!missing.length) return;
    Promise.all(missing.map((id) => loadFont(id)))
      .then(() => alive && setFontTick((t) => t + 1))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [fontIds]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layouts = useMemo(() => computeLayouts(project), [project, fontTick]);
  const loading = project.blocks.some((b) => !getLoadedFont(b.font));
  return { layouts, loading, error };
}
