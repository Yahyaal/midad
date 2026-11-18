import { describe, expect, it } from 'vitest';
import { joinType, segment } from '../arabic';

describe('joining types', () => {
  it('classifies common letters', () => {
    expect(joinType('ب'.charCodeAt(0))).toBe('D');
    expect(joinType('ا'.charCodeAt(0))).toBe('R');
    expect(joinType('ر'.charCodeAt(0))).toBe('R');
    expect(joinType('ء'.charCodeAt(0))).toBe('U');
    expect(joinType('َ'.charCodeAt(0))).toBe('T');
    expect(joinType('ـ'.charCodeAt(0))).toBe('C');
  });
});

describe('segment', () => {
  it('keeps يحيى as one connected group', () => {
    const s = segment('يحيى');
    expect(new Set(s.groupOf)).toEqual(new Set([0]));
    expect(s.joinsNext).toEqual([true, true, true, false]);
  });

  it('splits سامي after the alif and رامي after ر and ا', () => {
    const s = segment('سامي');
    expect(s.groupOf).toEqual([0, 0, 2, 2]);
    const r = segment('رامي');
    expect(r.groupOf).toEqual([0, 1, 2, 2]);
  });

  it('assigns words across punctuation and spaces', () => {
    const s = segment('يحيى، سامي');
    expect(s.wordOf.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(s.wordOf[5]).toBe(-1);
    expect(s.wordOf[6]).toBe(6);
  });

  it('keeps tashkil inside the group of its base letter', () => {
    const s = segment('الخَطُّ');
    // ا | لخَطُّ  (alif never joins forward; lām joins khāʾ)
    expect(s.groupOf).toEqual([0, 1, 1, 1, 1, 1, 1]);
  });

  it('tracks lines', () => {
    const s = segment('سلام\nعليكم');
    expect(s.lineOf[0]).toBe(0);
    expect(s.lineOf[6]).toBe(1);
  });
});
