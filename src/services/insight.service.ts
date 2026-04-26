type Category = keyof typeof LEXICON;
type Severity = 'severe' | 'mild' | 'positive';

interface LexEntry {
  weight: number;
  severity: Severity;
  terms: string[];
}

const LEXICON = {
  ideation: <LexEntry>{
    weight: 1.0,
    severity: 'severe',
    terms: [
      'muốn chết', 'muốn biến mất', 'kết thúc tất cả', 'không muốn sống',
      'tự tử', 'tự sát', 'tự làm hại', 'tự hại bản thân', 'cắt tay',
      'biến mất khỏi thế giới', 'chẳng ai cần tôi', 'chẳng ai cần mình',
      'gánh nặng', 'là gánh nặng', 'thà chết còn hơn', 'sống không có ý nghĩa',
      'không muốn thức dậy', 'không muốn tồn tại',
    ],
  },
  hopelessness: <LexEntry>{
    weight: 0.55,
    severity: 'severe',
    terms: [
      'tuyệt vọng', 'bế tắc', 'hết hy vọng', 'không lối thoát', 'không có tương lai',
      'không thể thay đổi', 'mãi mãi như vậy', 'chẳng có gì thay đổi',
      'vô dụng', 'bất lực', 'không làm được gì',
    ],
  },
  worthlessness: <LexEntry>{
    weight: 0.45,
    severity: 'severe',
    terms: [
      'vô giá trị', 'chẳng đáng', 'không xứng đáng', 'ghét bản thân',
      'tự ti', 'thất bại', 'kém cỏi', 'tệ hại', 'mình tệ thật',
      'lỗi tại mình', 'là lỗi của mình', 'mình không ra gì',
    ],
  },

  depressed: <LexEntry>{
    weight: 0.35,
    severity: 'mild',
    terms: [
      'buồn', 'chán nản', 'u sầu', 'trống rỗng', 'lạc lõng',
      'cô đơn', 'cô độc', 'lẻ loi', 'trầm cảm', 'suy sụp',
      'khóc', 'nước mắt', 'không vui', 'mệt mỏi tâm hồn',
    ],
  },
  anhedonia: <LexEntry>{
    weight: 0.35,
    severity: 'mild',
    terms: [
      'chẳng thấy gì vui', 'không hứng thú', 'mất hứng thú', 'không còn thích',
      'chẳng muốn làm gì', 'chán mọi thứ', 'nhạt nhẽo', 'vô nghĩa',
      'chẳng có gì thú vị',
    ],
  },
  anxiety: <LexEntry>{
    weight: 0.3,
    severity: 'mild',
    terms: [
      'lo âu', 'lo lắng', 'hoảng loạn', 'sợ hãi', 'bất an',
      'tim đập nhanh', 'khó thở', 'run rẩy', 'căng thẳng', 'áp lực',
      'không thể bình tĩnh', 'ám ảnh',
    ],
  },
  sleep: <LexEntry>{
    weight: 0.25,
    severity: 'mild',
    terms: [
      'mất ngủ', 'không ngủ được', 'thức khuya', 'ngủ chập chờn',
      'ác mộng', 'khó ngủ', 'ngủ quá nhiều', 'ngủ cả ngày',
    ],
  },
  fatigue: <LexEntry>{
    weight: 0.2,
    severity: 'mild',
    terms: [
      'kiệt sức', 'kiệt quệ', 'mệt mỏi', 'không còn sức', 'uể oải',
      'chẳng có năng lượng', 'rã rời',
    ],
  },
  anger: <LexEntry>{
    weight: 0.2,
    severity: 'mild',
    terms: [
      'giận dữ', 'tức giận', 'phát điên', 'điên tiết', 'bực bội',
      'cáu gắt', 'không chịu được', 'chán ghét',
    ],
  },

  positive: <LexEntry>{
    weight: -0.25,
    severity: 'positive',
    terms: [
      'vui', 'hạnh phúc', 'biết ơn', 'tự hào', 'yêu đời',
      'thoải mái', 'bình yên', 'an yên', 'nhẹ nhõm', 'ấm áp',
      'tích cực', 'khá hơn',
    ],
  },
  recovery: <LexEntry>{
    weight: -0.35,
    severity: 'positive',
    terms: [
      'đỡ hơn', 'đã ổn hơn', 'tốt hơn trước', 'tiến bộ', 'hồi phục',
      'cải thiện', 'vượt qua', 'cảm thấy nhẹ hơn', 'thở phào',
      'bắt đầu ngủ được', 'ăn ngon hơn', 'dần dần khá lên',
    ],
  },
} as const;

export interface ScoringOptions {
  mildMultiplier?: number;  // default 1.0
  moderateThreshold?: number; // default 0.35
  highThreshold?: number; // default 0.7
}

export interface InsightResult {
  keywords: string[];
  sentences: string[];
  score: number;
  level: 'low' | 'moderate' | 'high';
  categoriesHit: Category[];
  hasIdeation: boolean;
  rawScore: number;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

function lower(s: string) {
  return s.normalize('NFC').toLowerCase();
}

export function extractInsights(raw: string, opts: ScoringOptions = {}): InsightResult {
  const mildMult = opts.mildMultiplier ?? 1.0;
  const modTh = opts.moderateThreshold ?? 0.35;
  const highTh = opts.highThreshold ?? 0.7;

  const text = lower(raw ?? '');
  if (!text) {
    return {
      keywords: [], sentences: [], score: 0, level: 'low',
      categoriesHit: [], hasIdeation: false, rawScore: 0,
    };
  }

  const keywordsSet = new Set<string>();
  const categoriesHit = new Set<Category>();
  let rawScore = 0;
  let adjustedScore = 0;
  let hasIdeation = false;

  for (const [cat, entry] of Object.entries(LEXICON) as [Category, LexEntry][]) {
    let matched = false;
    for (const term of entry.terms) {
      if (text.includes(term)) {
        matched = true;
        keywordsSet.add(term);
        rawScore += entry.weight;
        if (entry.severity === 'mild') {
          adjustedScore += entry.weight * mildMult;
        } else {
          adjustedScore += entry.weight;
        }
        if (cat === 'ideation') hasIdeation = true;
      }
    }
    if (matched) categoriesHit.add(cat);
  }

  let score = Math.max(0, Math.min(1, adjustedScore));
  if (hasIdeation) score = Math.max(score, 0.8); // ideation lock, always

  const sentences = splitSentences(raw);
  const notable: string[] = [];
  for (const s of sentences) {
    const sl = lower(s);
    if ([...keywordsSet].some((k) => sl.includes(k))) {
      notable.push(s.length > 240 ? s.slice(0, 240) + '…' : s);
      if (notable.length >= 3) break;
    }
  }

  const level: InsightResult['level'] =
    hasIdeation || score >= highTh ? 'high'
    : score >= modTh ? 'moderate'
    : 'low';

  return {
    keywords: [...keywordsSet],
    sentences: notable,
    score,
    level,
    categoriesHit: [...categoriesHit],
    hasIdeation,
    rawScore,
  };
}

// Combine today's existing insight with a new message's extraction.
export function mergeInsight(
  existing: { alertScore: number; messageCount: number; keywords: string[]; notableSentences: string[] } | null,
  next: InsightResult,
  opts: ScoringOptions = {}
): { alertScore: number; alertLevel: 'low' | 'moderate' | 'high'; keywords: string[]; notableSentences: string[]; messageCount: number } {
  const modTh = opts.moderateThreshold ?? 0.35;
  const highTh = opts.highThreshold ?? 0.7;

  const prevCount = existing?.messageCount ?? 0;
  const prevScore = existing?.alertScore ?? 0;
  const messageCount = prevCount + 1;
  const combinedScore = (prevScore * prevCount + next.score) / messageCount;
  const alertScore = next.hasIdeation ? Math.max(combinedScore, 0.8) : combinedScore;

  const kw = new Set<string>(existing?.keywords ?? []);
  next.keywords.forEach((k) => kw.add(k));

  const sents = [...(existing?.notableSentences ?? []), ...next.sentences];
  const seen = new Set<string>();
  const dedupSents: string[] = [];
  for (const s of sents) {
    const key = s.slice(0, 80);
    if (!seen.has(key)) { seen.add(key); dedupSents.push(s); }
  }

  const alertLevel: 'low' | 'moderate' | 'high' =
    next.hasIdeation || alertScore >= highTh ? 'high'
    : alertScore >= modTh ? 'moderate'
    : 'low';

  return {
    alertScore,
    alertLevel,
    keywords: [...kw].slice(0, 40),
    notableSentences: dedupSents.slice(0, 10),
    messageCount,
  };
}
