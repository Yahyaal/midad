import { expect, it } from 'vitest';
import { layoutBlock } from '../layout';
import { newBlock } from '../model';
import { nodeFont } from './helpers';

it('lays out a long paragraph with edits quickly', () => {
  const text = 'يحيى، سامي، رامي '.repeat(12).trim();
  const edits = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`c${i * 6}.0`, { ty: 40 }]));
  const font = nodeFont();
  layoutBlock(newBlock({ text, edits }), font); // warm caches
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) layoutBlock(newBlock({ text, edits: { ...edits, 'c1.0': { tx: i } } }), font);
  const ms = (performance.now() - t0) / 5;
  if (process.env.DUMP_DIR) process.stdout.write(`\nPERF ${ms.toFixed(1)}ms per layout`);
  expect(ms).toBeLessThan(120);
});
