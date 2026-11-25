/**
 * Library content (books and recordings). HANDOFF: «لا تُعرض كتب أو تسجيلات إلا بعد توثيق مصدرها»
 * — only items published by the review team through the console appear (`published_content`,
 * kinds book/audio, read via the content store). No demo items are ever added.
 * Books are fetched over the internet from Supabase to keep app install size minimal.
 */
import { useEffect, useState } from 'react';

import { DEFAULT_LIBRARY } from '@/data/libraryData';
import { AUDIO_CATEGORIES, BOOK_CATEGORIES } from '@/data/structural';
import { supabase } from '@/services/supabase';
import { useContent, type LibraryItem } from '@/state/content-store';

export type { LibraryItem } from '@/state/content-store';

export function cachedItem(id: string): LibraryItem | undefined {
  const state = useContent.getState();
  if (state.books[id]) return state.books[id];
  const list = state.library.length ? state.library : DEFAULT_LIBRARY;
  return list.find((x) => x.id === id);
}

export function useLibrary() {
  const published = useContent((s) => s.library);
  const items = published.length ? published : DEFAULT_LIBRARY;
  const status = useContent((s) => s.status);
  const refresh = useContent((s) => s.refresh);

  useEffect(() => {
    if (status === 'idle' || (status === 'unconfigured' && supabase)) {
      refresh().catch(() => {});
    }
  }, [status, refresh]);

  return { items, loading: status === 'loading', error: status === 'error', reload: refresh };
}

export function useLibraryItem(id: string) {
  const { items, loading, error, reload } = useLibrary();
  const fullBook = useContent((s) => s.books[id]);
  const loadBook = useContent((s) => s.loadBook);
  const [settledId, setSettledId] = useState<string | null>(null);

  const indexItem = items.find((x) => x.id === id);
  const item = fullBook ?? indexItem;
  const needsChapters = !!id && id !== 'app_update' && !fullBook && (!indexItem || (indexItem.kind === 'book' && !indexItem.paged && indexItem.chapters.length === 0));

  useEffect(() => {
    if (!needsChapters || !supabase) return;
    let active = true;
    loadBook(id)
      .catch(() => null)
      .finally(() => {
        if (active) setSettledId(id);
      });
    return () => {
      active = false;
    };
  }, [id, needsChapters, loadBook]);

  return { item, loading: (loading && !item) || (needsChapters && !!supabase && settledId !== id), error, reload };
}

export const folderId = (kind: 'books' | 'audio', index: number) => `${kind}-${index}`;
export function parseFolder(id: string): { kind: 'books' | 'audio'; name: string } {
  const [k, i] = id.split('-');
  const kind = k === 'audio' ? 'audio' : 'books';
  const list = kind === 'audio' ? AUDIO_CATEGORIES : BOOK_CATEGORIES;
  return { kind, name: list[Number(i)] ?? list[0] };
}
