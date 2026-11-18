// Arabic joining behaviour (Unicode ArabicShaping joining types, simplified).
// D = dual-joining, R = right-joining, C = join-causing (tatweel), T = transparent, U = non-joining.

export type JoinType = 'D' | 'R' | 'C' | 'T' | 'U';

const R_CHARS = new Set<number>([
  0x0622, 0x0623, 0x0624, 0x0625, 0x0627, 0x0629, 0x062f, 0x0630, 0x0631, 0x0632, 0x0648, 0x0671, 0x0672, 0x0673,
  0x0675, 0x0676, 0x0677, 0x0688, 0x0689, 0x068a, 0x068b, 0x068c, 0x068d, 0x068e, 0x068f, 0x0690, 0x0691, 0x0692,
  0x0693, 0x0694, 0x0695, 0x0696, 0x0697, 0x0698, 0x0699, 0x06c0, 0x06c3, 0x06c4, 0x06c5, 0x06c6, 0x06c7, 0x06c8,
  0x06c9, 0x06ca, 0x06cb, 0x06cd, 0x06cf, 0x06d2, 0x06d3, 0x06d5, 0x06ee, 0x06ef, 0x0759, 0x075a, 0x075b, 0x076b,
  0x076c, 0x0771, 0x0773, 0x0774, 0x0778, 0x0779,
]);

const U_IN_ARABIC = new Set<number>([0x0621, 0x0674, 0x06dd]);

export function joinType(cp: number): JoinType {
  if (cp === 0x0640 || cp === 0x200d) return 'C';
  if (
    (cp >= 0x0610 && cp <= 0x061a) ||
    (cp >= 0x064b && cp <= 0x065f) ||
    cp === 0x0670 ||
    (cp >= 0x06d6 && cp <= 0x06dc) ||
    (cp >= 0x06df && cp <= 0x06e4) ||
    cp === 0x06e7 ||
    cp === 0x06e8 ||
    (cp >= 0x06ea && cp <= 0x06ed) ||
    (cp >= 0x08d3 && cp <= 0x08ff)
  )
    return 'T';
  if (R_CHARS.has(cp)) return 'R';
  if (U_IN_ARABIC.has(cp)) return 'U';
  if ((cp >= 0x0620 && cp <= 0x064a) || (cp >= 0x066e && cp <= 0x06d3) || (cp >= 0x06fa && cp <= 0x06ff) || (cp >= 0x0750 && cp <= 0x077f) || (cp >= 0x08a0 && cp <= 0x08c9))
    return 'D';
  return 'U';
}

export const isTransparent = (cp: number) => joinType(cp) === 'T';

/** Indexed by UTF-16 code unit position. Arabic is all BMP so code units == code points here. */
export interface Segmentation {
  /** groupStart[i] = index of the first char of the connected group containing char i (-1 for spaces). */
  groupOf: number[];
  /** wordOf[i] = index of the first char of the word containing char i (-1 for whitespace). */
  wordOf: number[];
  /** lineOf[i] = line number. */
  lineOf: number[];
  /** joinsNext[i] = true if char i is cursively connected to the next non-transparent char. */
  joinsNext: boolean[];
}

export function segment(text: string): Segmentation {
  const n = text.length;
  const groupOf = new Array<number>(n).fill(-1);
  const wordOf = new Array<number>(n).fill(-1);
  const lineOf = new Array<number>(n).fill(0);
  const joinsNext = new Array<boolean>(n).fill(false);
  const cps = Array.from({ length: n }, (_, i) => text.charCodeAt(i));

  let line = 0;
  let wordStart = -1;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    lineOf[i] = line;
    if (ch === '\n') {
      line++;
      wordStart = -1;
      continue;
    }
    if (/\s/.test(ch)) {
      wordStart = -1;
      continue;
    }
    if (wordStart < 0) wordStart = i;
    wordOf[i] = wordStart;
  }

  // joining
  for (let i = 0; i < n; i++) {
    const t = joinType(cps[i]);
    if (t === 'T' || !(t === 'D' || t === 'C')) continue;
    let j = i + 1;
    while (j < n && joinType(cps[j]) === 'T') j++;
    if (j < n) {
      const tj = joinType(cps[j]);
      if (tj === 'D' || tj === 'R' || tj === 'C') joinsNext[i] = true;
    }
  }

  // groups: a transparent char belongs to its base's group
  let groupStart = -1;
  let prevJoins = false;
  for (let i = 0; i < n; i++) {
    if (wordOf[i] < 0) {
      groupStart = -1;
      prevJoins = false;
      continue;
    }
    const t = joinType(cps[i]);
    if (t === 'T') {
      groupOf[i] = groupStart >= 0 ? groupStart : i;
      if (groupStart < 0) groupStart = i;
      continue;
    }
    if (!prevJoins || groupStart < 0) groupStart = i;
    groupOf[i] = groupStart;
    prevJoins = joinsNext[i];
  }
  return { groupOf, wordOf, lineOf, joinsNext };
}

export function hasArabic(text: string): boolean {
  return /[؀-ۿݐ-ݿࢠ-ࣿ]/.test(text);
}
