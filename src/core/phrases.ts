import type { LoadedFont } from './fonts';
import { contoursToD } from './geometry';
import { shapeText } from './shaping';

// A small library of well-known Arabic phrases, fully vocalised, for people to
// try and adapt. Sources are classical or long out of copyright (Qurʾān,
// proverbs, pre-modern and early-20th-century poets).
// Poetry hemistichs are separated by a line break.

export type PhraseCategory = 'devotion' | 'greetings' | 'wisdom' | 'calligraphy' | 'poetry' | 'words';

export const CATEGORIES: { id: PhraseCategory; label: string; arabic: string }[] = [
  { id: 'devotion', label: 'Devotion', arabic: 'أذكار' },
  { id: 'greetings', label: 'Greetings', arabic: 'تحيات' },
  { id: 'wisdom', label: 'Proverbs & wisdom', arabic: 'حكم وأمثال' },
  { id: 'calligraphy', label: 'On writing', arabic: 'في الخط' },
  { id: 'poetry', label: 'Poetry', arabic: 'شعر' },
  { id: 'words', label: 'Single words', arabic: 'كلمات' },
];

export interface Phrase {
  id: string;
  category: PhraseCategory;
  /** fully vocalised text */
  text: string;
  meaning: string;
  source?: string;
  /** a font that suits it well */
  font?: string;
}

export const PHRASES: Phrase[] = [
  // Devotion — the most common subjects of Arabic calligraphy
  { id: 'basmala', category: 'devotion', text: 'بِسْمِ اللَّهِ الرَّحْمٰنِ الرَّحِيمِ', meaning: 'In the name of God, the Most Gracious, the Most Merciful', source: 'Qurʾān 1:1' },
  { id: 'hamd', category: 'devotion', text: 'الْحَمْدُ لِلَّهِ', meaning: 'Praise be to God' },
  { id: 'mashallah', category: 'devotion', text: 'مَا شَاءَ اللَّهُ', meaning: 'What God has willed (said in admiration)' },
  { id: 'subhanallah', category: 'devotion', text: 'سُبْحَانَ اللَّهِ', meaning: 'Glory be to God' },
  { id: 'takbir', category: 'devotion', text: 'اللَّهُ أَكْبَرُ', meaning: 'God is greater' },
  { id: 'tawakkul', category: 'devotion', text: 'تَوَكَّلْتُ عَلَى اللَّهِ', meaning: 'I put my trust in God' },
  { id: 'zidni', category: 'devotion', text: 'وَقُلْ رَبِّ زِدْنِي عِلْمًا', meaning: 'And say: my Lord, increase me in knowledge', source: 'Qurʾān 20:114' },
  { id: 'yusra', category: 'devotion', text: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا', meaning: 'Truly, with hardship comes ease', source: 'Qurʾān 94:6' },
  { id: 'barakallah', category: 'devotion', text: 'بَارَكَ اللَّهُ فِيكَ', meaning: 'May God bless you' },

  // Greetings and good wishes
  { id: 'salam', category: 'greetings', text: 'السَّلَامُ عَلَيْكُمْ', meaning: 'Peace be upon you' },
  { id: 'ahlan', category: 'greetings', text: 'أَهْلًا وَسَهْلًا', meaning: 'Welcome' },
  { id: 'marhaba', category: 'greetings', text: 'مَرْحَبًا', meaning: 'Hello / welcome' },
  { id: 'sabah', category: 'greetings', text: 'صَبَاحُ الْخَيْرِ', meaning: 'Good morning' },
  { id: 'kulluam', category: 'greetings', text: 'كُلُّ عَامٍ وَأَنْتُمْ بِخَيْرٍ', meaning: 'May every year find you well (for feasts and birthdays)' },
  { id: 'eid', category: 'greetings', text: 'عِيدٌ مُبَارَكٌ', meaning: 'Blessed Eid' },
  { id: 'ramadan', category: 'greetings', text: 'رَمَضَانُ كَرِيمٌ', meaning: 'Ramadan is generous (Ramadan greeting)' },
  { id: 'shukran', category: 'greetings', text: 'شُكْرًا جَزِيلًا', meaning: 'Thank you very much' },
  { id: 'maassalama', category: 'greetings', text: 'مَعَ السَّلَامَةِ', meaning: 'Goodbye (go in safety)' },

  // Proverbs and wisdom
  { id: 'sabr', category: 'wisdom', text: 'الصَّبْرُ مِفْتَاحُ الْفَرَجِ', meaning: 'Patience is the key to relief', source: 'Proverb' },
  { id: 'jadda', category: 'wisdom', text: 'مَنْ جَدَّ وَجَدَ', meaning: 'Whoever strives, finds', source: 'Proverb' },
  { id: 'zaraa', category: 'wisdom', text: 'مَنْ زَرَعَ حَصَدَ', meaning: 'Whoever sows, reaps', source: 'Proverb' },
  { id: 'ilmnur', category: 'wisdom', text: 'الْعِلْمُ نُورٌ', meaning: 'Knowledge is light', source: 'Saying' },
  { id: 'waqt', category: 'wisdom', text: 'الْوَقْتُ كَالسَّيْفِ إِنْ لَمْ تَقْطَعْهُ قَطَعَكَ', meaning: 'Time is like a sword: if you do not cut it, it cuts you', source: 'Proverb' },
  { id: 'taanni', category: 'wisdom', text: 'فِي التَّأَنِّي السَّلَامَةُ وَفِي الْعَجَلَةِ النَّدَامَةُ', meaning: 'In patience lies safety, in haste regret', source: 'Proverb' },
  { id: 'khayr', category: 'wisdom', text: 'خَيْرُ الْكَلَامِ مَا قَلَّ وَدَلَّ', meaning: 'The best speech is brief and to the point', source: 'Proverb' },
  { id: 'sadiq', category: 'wisdom', text: 'الصَّدِيقُ وَقْتَ الضِّيقِ', meaning: 'A friend in need (is a friend indeed)', source: 'Proverb' },
  { id: 'rubba', category: 'wisdom', text: 'رُبَّ أَخٍ لَكَ لَمْ تَلِدْهُ أُمُّكَ', meaning: 'Many a brother of yours was not born of your mother', source: 'Proverb (al-Maydānī)' },
  { id: 'mujtahid', category: 'wisdom', text: 'لِكُلِّ مُجْتَهِدٍ نَصِيبٌ', meaning: 'Every hard worker gets their share', source: 'Proverb' },
  { id: 'qanaa', category: 'wisdom', text: 'الْقَنَاعَةُ كَنْزٌ لَا يَفْنَى', meaning: 'Contentment is a treasure that never runs out', source: 'Saying' },
  { id: 'sukut', category: 'wisdom', text: 'إِذَا كَانَ الْكَلَامُ مِنْ فِضَّةٍ فَالسُّكُوتُ مِنْ ذَهَبٍ', meaning: 'If speech is silver, silence is gold', source: 'Proverb' },

  // On writing and calligraphy
  { id: 'handasa', category: 'calligraphy', text: 'الْخَطُّ هَنْدَسَةٌ رُوحَانِيَّةٌ\nظَهَرَتْ بِآلَةٍ جِسْمَانِيَّةٍ', meaning: 'Calligraphy is a spiritual geometry made visible by a physical tool', source: 'Saying attributed to Euclid in the Arabic tradition' },
  { id: 'wudu', category: 'calligraphy', text: 'الْخَطُّ الْحَسَنُ يَزِيدُ الْحَقَّ وُضُوحًا', meaning: 'Beautiful writing makes the truth clearer', source: 'Saying attributed to ʿAlī ibn Abī Ṭālib' },
  { id: 'rizq', category: 'calligraphy', text: 'عَلَيْكُمْ بِحُسْنِ الْخَطِّ\nفَإِنَّهُ مِنْ مَفَاتِيحِ الرِّزْقِ', meaning: 'Hold to fine handwriting, for it is one of the keys to livelihood', source: 'Saying attributed to ʿAlī ibn Abī Ṭālib' },
  { id: 'qalam', category: 'calligraphy', text: 'ن وَالْقَلَمِ وَمَا يَسْطُرُونَ', meaning: 'Nūn. By the pen and what they inscribe', source: 'Qurʾān 68:1' },

  // Classical poetry (two hemistichs per line break)
  { id: 'khayl', category: 'poetry', text: 'الْخَيْلُ وَاللَّيْلُ وَالْبَيْدَاءُ تَعْرِفُنِي\nوَالسَّيْفُ وَالرُّمْحُ وَالْقِرْطَاسُ وَالْقَلَمُ', meaning: 'The horses, the night and the desert know me — and the sword, the spear, the page and the pen', source: 'al-Mutanabbī' },
  { id: 'azm', category: 'poetry', text: 'عَلَى قَدْرِ أَهْلِ الْعَزْمِ تَأْتِي الْعَزَائِمُ\nوَتَأْتِي عَلَى قَدْرِ الْكِرَامِ الْمَكَارِمُ', meaning: 'Resolve comes in the measure of the resolute, and noble deeds in the measure of the noble', source: 'al-Mutanabbī' },
  { id: 'kitab', category: 'poetry', text: 'أَعَزُّ مَكَانٍ فِي الدُّنَى سَرْجُ سَابِحٍ\nوَخَيْرُ جَلِيسٍ فِي الزَّمَانِ كِتَابُ', meaning: 'The dearest place in the world is the saddle of a swift horse, and the best companion in time is a book', source: 'al-Mutanabbī' },
  { id: 'qifa', category: 'poetry', text: 'قِفَا نَبْكِ مِنْ ذِكْرَى حَبِيبٍ وَمَنْزِلِ\nبِسِقْطِ اللِّوَى بَيْنَ الدَّخُولِ فَحَوْمَلِ', meaning: 'Halt, both of you, and let us weep at the memory of a beloved and a dwelling', source: 'Imruʾ al-Qays, Muʿallaqa' },
  { id: 'shaab', category: 'poetry', text: 'إِذَا الشَّعْبُ يَوْمًا أَرَادَ الْحَيَاةَ\nفَلَا بُدَّ أَنْ يَسْتَجِيبَ الْقَدَرْ', meaning: 'If a people one day wills to live, fate must answer', source: 'Abū al-Qāsim al-Shābbī' },
  { id: 'tamanni', category: 'poetry', text: 'وَمَا نَيْلُ الْمَطَالِبِ بِالتَّمَنِّي\nوَلَكِنْ تُؤْخَذُ الدُّنْيَا غِلَابَا', meaning: 'Goals are not reached by wishing; the world is taken by striving', source: 'Aḥmad Shawqī' },

  // Single words loved by calligraphers
  { id: 'maktub', category: 'words', text: 'مَكْتُوبٌ', meaning: 'It is written (fate)' },
  { id: 'hubb', category: 'words', text: 'حُبٌّ', meaning: 'Love' },
  { id: 'salamw', category: 'words', text: 'سَلَامٌ', meaning: 'Peace' },
  { id: 'amal', category: 'words', text: 'أَمَلٌ', meaning: 'Hope' },
  { id: 'sabrw', category: 'words', text: 'صَبْرٌ', meaning: 'Patience' },
  { id: 'nur', category: 'words', text: 'نُورٌ', meaning: 'Light' },
  { id: 'jamal', category: 'words', text: 'جَمَالٌ', meaning: 'Beauty' },
  { id: 'rahma', category: 'words', text: 'رَحْمَةٌ', meaning: 'Mercy' },
  { id: 'hurriya', category: 'words', text: 'حُرِّيَّةٌ', meaning: 'Freedom' },
  { id: 'watan', category: 'words', text: 'وَطَنٌ', meaning: 'Homeland' },
  { id: 'hayat', category: 'words', text: 'حَيَاةٌ', meaning: 'Life' },
  { id: 'ilm', category: 'words', text: 'عِلْمٌ', meaning: 'Knowledge' },
];

/** The phrase without tashkīl. */
export function stripTashkil(text: string): string {
  return text.replace(/[ً-ْٰ]/g, '');
}

export function searchPhrases(q: string, category?: PhraseCategory): Phrase[] {
  const s = stripTashkil(q.trim()).toLowerCase();
  return PHRASES.filter((p) => (!category || p.category === category) && (!s || stripTashkil(p.text).includes(s) || p.meaning.toLowerCase().includes(s) || (p.source ?? '').toLowerCase().includes(s)));
}

// ---------------------------------------------------------------------------
// Fast previews: shaped glyph outlines only (no join analysis), for the library.

export interface PhrasePreview {
  d: string;
  /** viewBox in font units, y flipped for SVG */
  viewBox: string;
}

const previewCache = new Map<string, PhrasePreview>();

export function phrasePreview(font: LoadedFont, text: string): PhrasePreview {
  const key = `${font.info.id}|${text}`;
  const hit = previewCache.get(key);
  if (hit) return hit;
  const lines = shapeText(font, text);
  const lh = font.upem * 1.5;
  const maxW = Math.max(...lines.map((l) => l.width));
  let d = '';
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  lines.forEach((line, li) => {
    const ox = (maxW - line.width) / 2; // centre each line
    const oy = -li * lh;
    for (const g of line.glyphs) {
      const o = font.outline(g.gid);
      if (o.empty) continue;
      const gx = g.x + ox;
      const gy = g.y + oy;
      d += contoursToD(o.contours, (x, y) => [x + gx, -(y + gy)]);
      x0 = Math.min(x0, o.bbox.x0 + gx);
      x1 = Math.max(x1, o.bbox.x1 + gx);
      y0 = Math.min(y0, -(o.bbox.y1 + gy));
      y1 = Math.max(y1, -(o.bbox.y0 + gy));
    }
  });
  const pad = font.upem * 0.08;
  const out = { d, viewBox: `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}` };
  previewCache.set(key, out);
  return out;
}
