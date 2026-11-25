/**
 * Published content from the console (`published_content` in Supabase), cached on the device so
 * the app works offline. Refreshed at launch, on reconnect and when the app returns to the
 * foreground. Without a configured backend the store stays empty and every slot shows
 * «بانتظار التوثيق» — the app never falls back to bundled or sample text.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  AdhkarDataSchema,
  DrillDataSchema,
  EvidenceSchema,
  LessonDataSchema,
  MapDataSchema,
  PageDataSchema,
  PathDataSchema,
  QuoteDataSchema,
  SectionsDataSchema,
  TafsirDataSchema,
  TajweedDataSchema,
  QuranVocabItemSchema,
  type AdhkarData,
  type DrillData,
  type Evidence,
  type Lesson,
  type MapData,
  type PageData,
  type PathData,
  type Quote,
  type QuranVocabItem,
  type SectionsData,
  type TafsirData,
  type TajweedData,
} from '@/data/content';
import { supabase } from '@/services/supabase';

export const ChapterSchema = z.object({ title: z.string(), paragraphs: z.array(z.string()) });
export const LibraryItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['book', 'audio']),
  category: z.string(),
  title: z.string(),
  author: z.string().nullable().default(null),
  source: z.string().nullable().default(null),
  url: z.string().optional(),
  chapters: z.array(ChapterSchema).default([]),
  chapterCount: z.number().int().nonnegative().optional(),
  pages: z.number().int().positive().nullable().default(null),
  audio_url: z.string().url().startsWith('https://').nullable().optional().default(null),
  size_mb: z.number().nullable().default(null),
  paged: z.boolean().optional(),
  indexUrl: z.string().optional(),
});
export type LibraryItem = z.infer<typeof LibraryItemSchema>;

/** Strip full chapter arrays from persisted index rows so startup hydration stays tiny. */
export const stripBookBodies = (library: LibraryItem[]): LibraryItem[] =>
  library.map((item) => ({
    ...item,
    chapterCount: item.chapterCount ?? item.chapters.length,
    chapters: item.kind === 'book' ? [] : item.chapters,
  }));

export interface ContentSnapshot {
  lessons: Lesson[];
  quotes: Quote[];
  vocab: QuranVocabItem[];
  library: LibraryItem[];
  stories: Record<string, SectionsData>;
  sharia: Record<string, SectionsData>;
  adhkar: Record<string, AdhkarData>;
  tajweed: Record<string, TajweedData>;
  drill: DrillData | null;
  paths: Record<string, PathData>;
  map: Record<string, MapData>;
  pages: Record<string, PageData>;
}

export const EMPTY_CONTENT: ContentSnapshot = { lessons: [], quotes: [], vocab: [], library: [], stories: {}, sharia: {}, adhkar: {}, tajweed: {}, drill: null, paths: {}, map: {}, pages: {} };

export type Row = { id: string; kind: string; slot: string; data: unknown; sort?: number | null };

const parse = <T>(schema: z.ZodType<T>, v: unknown): T | null => {
  const r = schema.safeParse(v);
  return r.success ? r.data : null;
};

/** Build the app's content model from published rows. Invalid rows are skipped. */
export function buildContent(rows: Row[]): ContentSnapshot {
  const out: ContentSnapshot = { ...EMPTY_CONTENT, lessons: [], quotes: [], vocab: [], library: [], stories: {}, sharia: {}, adhkar: {}, tajweed: {}, paths: {}, map: {}, pages: {} };
  const evidence: Record<string, { n: number; e: Evidence }[]> = {};
  const sorted = [...rows].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.slot.localeCompare(b.slot));
  for (const r of sorted) {
    switch (r.kind) {
      case 'lesson': {
        const d = /^[A-Z]{2}-\d{2}$/.test(r.slot) ? parse(LessonDataSchema, r.data) : null;
        if (d && d.quiz.questions.every((q) => q.answer < q.options.length)) out.lessons.push({ ...d, code: r.slot, evidence: [] });
        break;
      }
      case 'evidence': {
        const m = /^([A-Z]{2}-\d{2})\/e(\d+)$/.exec(r.slot);
        const e = m ? parse(EvidenceSchema, r.data) : null;
        if (m && e) (evidence[m[1]] ??= []).push({ n: +m[2], e });
        break;
      }
      case 'quote': {
        const q = parse(QuoteDataSchema, r.data);
        if (q) out.quotes.push({ id: r.slot, ...q });
        break;
      }
      case 'vocab': {
        const v = parse(QuranVocabItemSchema, r.data);
        if (v) out.vocab.push(v);
        break;
      }
      case 'story':
      case 'sharia': {
        const s = parse(SectionsDataSchema, r.data);
        if (s) (r.kind === 'story' ? out.stories : out.sharia)[r.slot] = s;
        break;
      }
      case 'adhkar': {
        const a = parse(AdhkarDataSchema, r.data);
        if (a) out.adhkar[r.slot] = a;
        break;
      }
      case 'tajweed': {
        const t = parse(TajweedDataSchema, r.data);
        if (t) out.tajweed[r.slot] = t;
        break;
      }
      case 'drill': {
        const d = parse(DrillDataSchema, r.data);
        if (d && d.questions.every((q) => q.answer < q.options.length)) out.drill = d;
        break;
      }
      case 'path': {
        const p = parse(PathDataSchema, r.data);
        if (p) out.paths[r.slot] = p;
        break;
      }
      case 'map': {
        const m = parse(MapDataSchema, r.data);
        if (m) out.map[r.slot] = m;
        break;
      }
      case 'page': {
        const p = parse(PageDataSchema, r.data);
        if (p) out.pages[r.slot] = p;
        break;
      }
      case 'book':
      case 'audio': {
        // System metadata slots (like OTA release manifests) must not show up as learner books.
        if (r.slot === 'app_update') break;
        const d = (r.data as Record<string, unknown>) ?? {};
        const itemId = (d.id as string) || r.slot || r.id;
        const item = parse(LibraryItemSchema, { ...d, id: itemId, kind: r.kind });
        if (item) out.library.push(item);
        break;
      }
    }
  }
  out.lessons.sort((a, b) => a.code.localeCompare(b.code));
  for (const l of out.lessons) l.evidence = (evidence[l.code] ?? []).sort((a, b) => a.n - b.n).map((x) => x.e);
  return out;
}

type Status = 'idle' | 'loading' | 'ready' | 'error' | 'unconfigured';

interface ContentState extends ContentSnapshot {
  status: Status;
  loadedAt: number;
  tafsir: Record<string, TafsirData | null>;
  books: Record<string, LibraryItem>;
  refresh: () => Promise<void>;
  loadBook: (id: string) => Promise<LibraryItem | null>;
  loadTafsir: (surah: number) => Promise<void>;
}

let inflight: Promise<void> | null = null;

interface BookIndexRow {
  id: string;
  kind: string;
  slot: string;
  sort?: number | null;
  itemId?: unknown;
  category?: unknown;
  title?: unknown;
  author?: unknown;
  source?: unknown;
  url?: unknown;
  pages?: unknown;
  audio_url?: unknown;
  size_mb?: unknown;
  paged?: unknown;
  indexUrl?: unknown;
  chapterCount?: unknown;
}

export const useContent = create<ContentState>()(
  persist(
    (set, get) => ({
      ...EMPTY_CONTENT,
      status: supabase ? 'idle' : 'unconfigured',
      loadedAt: 0,
      tafsir: {},
      books: {},
      refresh: () => {
        if (!supabase) return Promise.resolve();
        inflight ??= (async () => {
          set({ status: get().loadedAt ? 'ready' : 'loading' });
          try {
            // Fetch general content + lightweight book index separately (no chapter paragraphs at boot).
            const [mainRes, booksRes] = await Promise.all([
              supabase!.from('published_content').select('id, kind, slot, data, sort').not('kind', 'in', '("tafsir","book")'),
              supabase!
                .from('published_content')
                .select(
                  'id, kind, slot, sort, itemId:data->>id, category:data->>category, title:data->>title, author:data->>author, source:data->>source, url:data->>url, pages:data->pages, audio_url:data->>audio_url, size_mb:data->size_mb, paged:data->paged, indexUrl:data->>indexUrl, chapterCount:data->chapterCount',
                )
                .eq('kind', 'book'),
            ]);
            if (mainRes.error) throw mainRes.error;
            if (booksRes.error) throw booksRes.error;
            const bookRows: Row[] = ((booksRes.data ?? []) as BookIndexRow[]).map((b) => ({
              id: b.id,
              kind: b.kind,
              slot: b.slot,
              sort: b.sort,
              data: {
                id: typeof b.itemId === 'string' && b.itemId ? b.itemId : b.slot,
                kind: 'book',
                category: b.category ?? '',
                title: b.title ?? '',
                author: b.author ?? null,
                source: b.source ?? null,
                url: typeof b.url === 'string' ? b.url : undefined,
                pages: typeof b.pages === 'number' ? b.pages : null,
                audio_url: typeof b.audio_url === 'string' ? b.audio_url : null,
                size_mb: typeof b.size_mb === 'number' ? b.size_mb : null,
                paged: typeof b.paged === 'boolean' ? b.paged : undefined,
                indexUrl: typeof b.indexUrl === 'string' ? b.indexUrl : undefined,
                chapterCount: typeof b.chapterCount === 'number' ? b.chapterCount : undefined,
                chapters: [],
              },
            }));
            const snap = buildContent([...((mainRes.data ?? []) as Row[]), ...bookRows]);
            set({ ...snap, library: stripBookBodies(snap.library), status: 'ready', loadedAt: Date.now() });
          } catch {
            // Keep the cached copy; screens show it (or their pending state) and retry later.
            set({ status: get().loadedAt ? 'ready' : 'error' });
          } finally {
            inflight = null;
          }
        })();
        return inflight;
      },
      loadBook: async (id) => {
        if (!id || id === 'app_update') return null;
        const cached = get().books[id];
        if (cached && (cached.chapters.length > 0 || cached.paged || cached.kind === 'audio')) return cached;
        if (!supabase) return null;
        const { data, error } = await supabase
          .from('published_content')
          .select('kind, slot, data')
          .in('kind', ['book', 'audio'])
          .eq('slot', id)
          .maybeSingle();
        if (error || !data?.data) return null;
        const raw = data.data as Record<string, unknown>;
        const parsed = parse(LibraryItemSchema, {
          ...raw,
          id: (raw.id as string) || data.slot || id,
          kind: data.kind,
          chapterCount: typeof raw.chapterCount === 'number' ? raw.chapterCount : Array.isArray(raw.chapters) ? raw.chapters.length : undefined,
        });
        if (!parsed) return null;
        set({ books: { ...get().books, [id]: parsed } });
        return parsed;
      },
      loadTafsir: async (surah) => {
        if (!supabase) return;
        const { data, error } = await supabase.from('published_content').select('data').eq('kind', 'tafsir').eq('slot', String(surah)).maybeSingle();
        if (error) return;
        set({ tafsir: { ...get().tafsir, [surah]: data ? parse(TafsirDataSchema, data.data) : null } });
      },
    }),
    {
      name: 'baseerah-content',
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      version: 1,
      partialize: ({ status: _s, refresh: _r, loadBook: _lb, loadTafsir: _l, books: _b, ...rest }) => ({
        ...rest,
        library: stripBookBodies(rest.library),
      }),
    },
  ),
);

/** Current lessons for non-React code (scoring, progress totals). */
export const getLessons = () => useContent.getState().lessons;
