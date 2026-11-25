/**
 * Book & Encyclopedia text cleaner and structural formatter.
 * Strips OpenITI/Shamela markup noise (META#, ms0001, ## $$$$, |||),
 * rejoins broken ~70-char wrapped source lines into cohesive paragraphs,
 * and classifies structural headings separately from body prose.
 */

export type BookBlockKind = 'heading' | 'subheading' | 'body';

export interface BookBlock {
  key: string;
  kind: BookBlockKind;
  text: string;
  /** Original paragraph index for highlight/bookmark tracking when not reflowed. */
  sourceIndex: number;
}

/** Clean OpenITI/Shamela level markers and stray tokens from chapter/volume titles. */
export function cleanBookTitle(raw: string): string {
  return raw
    .replace(/^[#|$\s]+/, '')
    .replace(/\bms\d{3,6}\b/gi, '')
    .replace(/\bPageV\d+P\d+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Detect metadata-only or empty lines that should never appear in book reading views. */
export function isNoiseLine(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (
    s.startsWith('META#') ||
    s.startsWith('#META') ||
    s.startsWith('#####OpenITI#') ||
    /^#+$/.test(s) ||
    /^[\s$#|@~=_*-]+$/.test(s)
  ) {
    return true;
  }
  return false;
}

/** Clean inline markup/noise tokens inside a single line or paragraph. */
export function cleanBookLine(raw: string): string {
  return raw
    .replace(/^##\s*\$\$\$+\s*/g, '')
    .replace(/^[#|]+\s*/g, '')
    .replace(/\$\$\$+/g, '')
    .replace(/\bms\d{3,6}\b/gi, '')
    .replace(/\bPageV\d+P\d+\b/gi, '')
    .replace(/(?:^|\s)@[A-Za-z0-9_-]+(?=\s|$)/g, ' ')
    .replace(/\s+([،؛:.!؟»}])/g, '$1')
    .replace(/([«{])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const MAJOR_HEADING_RE =
  /^(?:فصل(?:\s|$|:|في)|باب(?:\s|:)|كتاب\s+(?:ال|م|ت|ص|ف|أ|ب)|ثم دخلت سنة|سنة\s+(?:إحدى|اثنتين|ثلاث|أربع|خمس|ست|سبع|ثمان|تسع|عشر|\d)|ذكر\s+(?:خلق|مقتل|غزوة|وفاة|خلافة|ولاية|أمر|قصة|سبب|صفة|فضائل|بدء|بداية)|الأصل\s+(?:الأول|الثاني|الثالث)|القاعدة\s+|الشرط\s+|المسألة\s+|الركن\s+|المبحث\s+)/;

const SUB_HEADING_RE =
  /^(?:الحديث\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العشرون|الحادي|الثلاثون|الأربعون|\d+)|حرف\s+[أاببتثجحخدذرزسشصضطظعغفقكلمنهوي]|مسألة\s*:|تنبيه\s*:|فائدة\s*:)/;

function classifyRawLine(raw: string, cleaned: string): BookBlockKind {
  const trimmed = raw.trim();
  // Explicit OpenITI section headers (`### |`, `### ||`, or marked `### ...`)
  if ((/^#{2,}\s*\|{1,3}\s*/.test(trimmed) || /^#{3}\s+[^$]/.test(trimmed)) && cleaned.length <= 130) {
    return /^#{2,}\s*\|{3}/.test(trimmed) ? 'subheading' : 'heading';
  }
  if (cleaned.length <= 95 && MAJOR_HEADING_RE.test(cleaned) && !/[،.]$/.test(cleaned)) {
    // Reject prose fragments that merely start with "سنة شمسية" or "ذكر الله"
    if (
      cleaned === 'فصل' ||
      cleaned.startsWith('فصل ') ||
      cleaned.startsWith('فصل:') ||
      cleaned.startsWith('باب ') ||
      cleaned.startsWith('ثم دخلت سنة') ||
      cleaned.startsWith('الأصل ') ||
      cleaned.startsWith('كتاب ') ||
      /^ذكر\s/.test(cleaned) ||
      /^سنة\s+(?:إحدى|اثنتين|ثلاث|أربع|خمس|ست|سبع|ثمان|تسع|\d)/.test(cleaned)
    ) {
      // Skip common prose false positives like "فصل بين" or "ذكر أن..." when sentence clearly continues
      if (!/^(?:فصل(?:ت|نا|وا|هم)|ذكر\s+(?:أن|أنه|لنا|هم))/.test(cleaned) && !/،\s*$/.test(cleaned)) {
        return 'heading';
      }
    }
  }
  if (cleaned.length <= 70 && SUB_HEADING_RE.test(cleaned) && !cleaned.endsWith('،')) {
    return 'subheading';
  }
  return 'body';
}

const SENTENCE_END_RE = /[.!؟:»}]$/;

/**
 * Cleans an array of raw paragraphs, optionally reflowing broken wrapped lines
 * into proper reading paragraphs, and separates headings from body text.
 */
export function formatChapterBlocks(
  paragraphs: string[],
  options: { reflow?: boolean } = {},
): BookBlock[] {
  const reflow = options.reflow ?? false;
  const blocks: BookBlock[] = [];
  let pendingBody = '';
  let pendingStartIdx = 0;

  const flushBody = () => {
    if (!pendingBody) return;
    blocks.push({
      key: `b-${pendingStartIdx}-${blocks.length}`,
      kind: 'body',
      text: pendingBody,
      sourceIndex: pendingStartIdx,
    });
    pendingBody = '';
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const raw = paragraphs[i];
    if (isNoiseLine(raw)) continue;

    const cleaned = cleanBookLine(raw);
    if (!cleaned) continue;

    const hadEntryBreak = /^##\s*\$\$\$+/.test(raw.trim());
    const kind = classifyRawLine(raw, cleaned);

    if (kind !== 'body') {
      flushBody();
      blocks.push({
        key: `h-${i}-${blocks.length}`,
        kind,
        text: cleaned,
        sourceIndex: i,
      });
      continue;
    }

    if (!reflow) {
      blocks.push({
        key: `p-${i}`,
        kind: 'body',
        text: cleaned,
        sourceIndex: i,
      });
      continue;
    }

    if (hadEntryBreak) {
      flushBody();
    }

    if (!pendingBody) {
      pendingBody = cleaned;
      pendingStartIdx = i;
    } else {
      const endsSentence = SENTENCE_END_RE.test(pendingBody);
      const longEnough = pendingBody.length >= 340;
      if (endsSentence && longEnough) {
        flushBody();
        pendingBody = cleaned;
        pendingStartIdx = i;
      } else if (pendingBody.length >= 750 && /[.،؛:]$/.test(pendingBody)) {
        flushBody();
        pendingBody = cleaned;
        pendingStartIdx = i;
      } else {
        pendingBody = `${pendingBody} ${cleaned}`;
      }
    }
  }

  flushBody();
  return blocks;
}
