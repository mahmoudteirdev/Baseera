/**
 * Encyclopedia Service (نظام استدعاء وتخزين موسوعة البداية والنهاية والكتب الكبرى المجزأة).
 * Fetches volume chunks on-demand, caches in Paths.cache, and supports persistent offline saves
 * into Paths.document tracked via the app's Downloads registry.
 */
import { Directory, File, Paths } from 'expo-file-system';

import { checkDownloadPreflight, downloadsSupported, type DownloadError } from '@/services/downloads';
import { useApp } from '@/state/app-store';

export interface VolumeMeta {
  volume: number;
  title: string;
  pageCount: number;
  chaptersCount: number;
  sizeKb: number;
  firstChapter: string;
}

export interface EncyclopediaIndex {
  id: string;
  title: string;
  shortTitle: string;
  author: string;
  category: string;
  source: string;
  edition: string;
  totalVolumes: number;
  totalChapters: number;
  totalPages: number;
  volumes: VolumeMeta[];
}

export interface VolumeChapter {
  title: string;
  page: number;
  paragraphs: string[];
}

export interface VolumePayload {
  volume: number;
  title: string;
  pageCount: number;
  chaptersCount: number;
  chapters: VolumeChapter[];
}

const DEFAULT_BASE_URL = 'https://yxqdquynlgfbxyultsux.supabase.co/storage/v1/object/public/apks/encyclopedia/bidayah';

const cachedIndices = new Map<string, EncyclopediaIndex>();
const memoryVolCache = new Map<string, VolumePayload>();

function persistentVolFile(bookId: string, vol: number): File {
  const safeBook = bookId.replace(/[^a-z0-9_-]/gi, '_');
  const volStr = String(vol).padStart(2, '0');
  const dir = new Directory(Paths.document, 'encyclopedia', safeBook);
  dir.create({ intermediates: true, idempotent: true });
  return new File(dir, `vol-${volStr}.json`);
}

export function volumeDownloadId(bookId: string, vol: number): string {
  return `b:${bookId}:v${vol}`;
}

/**
 * Loads the master index of a chunked book or encyclopedia.
 */
export async function getEncyclopediaIndex(customUrl?: string, bookId = 'bidayah'): Promise<EncyclopediaIndex> {
  const url = customUrl || `${DEFAULT_BASE_URL}/index.json`;
  if (cachedIndices.has(url)) return cachedIndices.get(url)!;

  const cacheFile = new File(Paths.cache, `${bookId}_index_v2.json`);

  // Try local cache first
  try {
    if (cacheFile.exists) {
      const text = await cacheFile.text();
      const parsed = JSON.parse(text) as EncyclopediaIndex;
      cachedIndices.set(url, parsed);
      return parsed;
    }
  } catch {
    // ignore cache read error
  }

  // Fetch from network
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load encyclopedia index: HTTP ${res.status}`);
  }

  const data = (await res.json()) as EncyclopediaIndex;
  cachedIndices.set(url, data);

  try {
    await cacheFile.write(JSON.stringify(data));
  } catch {
    // ignore cache write error
  }

  return data;
}

/**
 * Loads a specific volume chunk for any chunked book.
 * Checks memory -> persistent document download -> temporary cache -> network.
 */
export async function getVolumeChunk(vol: number, baseUrl?: string, bookId = 'bidayah'): Promise<VolumePayload> {
  const cacheKey = `${bookId}_${vol}`;
  if (memoryVolCache.has(cacheKey)) {
    return memoryVolCache.get(cacheKey)!;
  }

  const volStr = String(vol).padStart(2, '0');

  // 1. Try persistent downloaded copy in Paths.document first
  if (downloadsSupported) {
    try {
      const docFile = persistentVolFile(bookId, vol);
      if (docFile.exists) {
        const text = await docFile.text();
        const payload = JSON.parse(text) as VolumePayload;
        memoryVolCache.set(cacheKey, payload);
        return payload;
      }
    } catch {
      // fall through
    }
  }

  // 2. Try temporary cache in Paths.cache
  const cacheFile = new File(Paths.cache, `${bookId}_vol_v2_${volStr}.json`);
  try {
    if (cacheFile.exists) {
      const text = await cacheFile.text();
      const payload = JSON.parse(text) as VolumePayload;
      memoryVolCache.set(cacheKey, payload);
      return payload;
    }
  } catch {
    // ignore cache read error
  }

  // 3. Fetch remote volume chunk
  const base = baseUrl || DEFAULT_BASE_URL;
  const url = `${base}/vol-${volStr}.json`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load volume ${vol}: HTTP ${res.status}`);
  }

  const payload = (await res.json()) as VolumePayload;
  memoryVolCache.set(cacheKey, payload);

  try {
    await cacheFile.write(JSON.stringify(payload));
  } catch {
    // ignore cache write error
  }

  return payload;
}

/**
 * Persistently saves a chunked book volume into `Paths.document/encyclopedia` and registers
 * it in `downloads` so it appears in the Downloads tab and survives OS cache eviction.
 */
export async function downloadVolumeOffline(
  vol: number,
  bookId: string,
  bookTitle: string,
  baseUrl?: string,
  estSizeKb?: number,
): Promise<{ ok: true } | { ok: false; error: DownloadError }> {
  const estMb = Math.max(0.2, Math.round(((estSizeKb ?? 1000) / 1000) * 10) / 10);
  const pre = await checkDownloadPreflight(estMb);
  if (pre) return { ok: false, error: pre };

  try {
    const payload = await getVolumeChunk(vol, baseUrl, bookId);
    const json = JSON.stringify(payload);
    const docFile = persistentVolFile(bookId, vol);
    await docFile.write(json);

    const mb = Math.max(0.1, Math.round(((docFile.size || json.length) / 1e6) * 10) / 10);
    const dlId = volumeDownloadId(bookId, vol);
    const st = useApp.getState();
    if (!st.downloads.some((x) => x.id === dlId)) {
      st.toggleDownload({
        id: dlId,
        name: `${bookTitle} · المجلد ${vol}`,
        kind: 'كتاب',
        mb,
        uri: docFile.uri,
      });
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'network' };
  }
}
