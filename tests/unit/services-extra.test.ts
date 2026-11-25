/**
 * Unit tests for updater, encyclopedia chunking/offline storage, and book-index stripping.
 */
import { Platform } from 'react-native';

import { useApp } from '@/state/app-store';
import { stripBookBodies, type LibraryItem } from '@/state/content-store';

// Virtual in-memory file system store for expo-file-system File & Directory mocks
const mockFiles = new Map<string, string>();
let mockFreeBytes = 200 * 1e6;

jest.mock('@/data/quran', () => ({}));

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.2.5',
  nativeBuildVersion: '9',
}));

jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(async () => ({})),
}));

jest.mock('expo-linking', () => ({
  openURL: jest.fn(async () => true),
}));

jest.mock('expo-file-system/legacy', () => ({
  getContentUriAsync: jest.fn(async (uri: string) => `content://${uri}`),
}));

jest.mock('expo-file-system', () => {
  class MockDirectory {
    uri: string;
    constructor(...parts: unknown[]) {
      const strs = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).filter(Boolean);
      this.uri = strs.join('/');
    }
    create() {}
    delete() {}
  }
  class MockFile {
    uri: string;
    constructor(parent: unknown, name: string) {
      const base = typeof parent === 'string' ? parent : (parent as { uri: string }).uri;
      this.uri = `${base}/${name}`;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return (mockFiles.get(this.uri) ?? '').length;
    }
    async text() {
      return mockFiles.get(this.uri) ?? '';
    }
    async write(content: string) {
      mockFiles.set(this.uri, content);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    static createDownloadTask = jest.fn();
  }
  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: {
      cache: { uri: 'file:///cache' },
      document: { uri: 'file:///doc' },
      availableDiskSpace: () => mockFreeBytes,
    },
  };
});

// Mutable mock supabase handle so each test can configure responses cleanly
type MockRpcFn = jest.Mock<Promise<{ data: unknown; error: { message: string } | null }>, [string, Record<string, unknown>?]>;
const mockRpc: MockRpcFn = jest.fn();
const mockGetSession = jest.fn();
const mockMaybeSingle = jest.fn();

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    rpc: (fn: string, params?: Record<string, unknown>) => mockRpc(fn, params),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => mockMaybeSingle() }),
      }),
    }),
  },
}));

import { checkGitHubReleaseUpdate, checkRemoteUpdate, cleanupDownloadedApk, isNewerVersion, publishRemoteUpdate } from '@/services/updater';
import { downloadVolumeOffline, getEncyclopediaIndex, getVolumeChunk, volumeDownloadId } from '@/services/encyclopedia';
import { cleanBookLine, cleanBookTitle, formatChapterBlocks } from '@/utils/bookFormatter';

beforeEach(() => {
  mockFiles.clear();
  mockFreeBytes = 200 * 1e6;
  useApp.setState({ downloads: [] });
  global.fetch = jest.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
  jest.clearAllMocks();
});

describe('updater service', () => {
  it('compares semver strings accurately', () => {
    expect(isNewerVersion('1.2.6', '1.2.5')).toBe(true);
    expect(isNewerVersion('v2.0.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('1.10.0', '1.2.0')).toBe(true);
    expect(isNewerVersion('1.2.5', '1.2.5')).toBe(false);
    expect(isNewerVersion('1.2.4', '1.2.5')).toBe(false);
  });

  it('returns remote update when published version exceeds local', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        data: {
          latestVersion: '1.2.6',
          latestVersionCode: 10,
          apkUrl: 'https://example.com/baseera.apk',
          releaseNotes: 'إصدار جديد',
          isMandatory: false,
        },
      },
    });
    const res = await checkRemoteUpdate();
    expect(res?.latestVersion).toBe('1.2.6');
    expect(res?.apkUrl).toBe('https://example.com/baseera.apk');
  });

  it('returns null when remote version matches or is older', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        data: {
          latestVersion: '1.2.5',
          latestVersionCode: 9,
          apkUrl: 'https://example.com/baseera.apk',
          releaseNotes: '',
          isMandatory: false,
        },
      },
    });
    const res = await checkRemoteUpdate();
    expect(res).toBeNull();
  });

  it('falls back to GitHub Releases when Supabase has no newer release', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: null });
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        tag_name: 'v1.2.8',
        body: '[mandatory]\nإصلاحات مهمة وصوت الأذان الكامل',
        draft: false,
        prerelease: false,
        published_at: '2026-11-25T12:00:00Z',
        assets: [
          {
            name: 'baseera-release.apk',
            browser_download_url: 'https://github.com/mahmoudteirdev/Baseera/releases/download/v1.2.8/baseera-release.apk',
            size: 52000000,
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const ghOnly = await checkGitHubReleaseUpdate();
    expect(ghOnly?.latestVersion).toBe('1.2.8');
    expect(ghOnly?.isMandatory).toBe(true);

    const combined = await checkRemoteUpdate();
    expect(combined?.latestVersion).toBe('1.2.8');
    expect(combined?.apkUrl).toContain('v1.2.8/baseera-release.apk');
  });

  it('rejects publishRemoteUpdate when not signed in', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    const res = await publishRemoteUpdate({
      latestVersion: '1.2.6',
      latestVersionCode: 10,
      apkUrl: 'https://example.com/app.apk',
      releaseNotes: 'تحديث',
      isMandatory: false,
    });
    expect(res.success).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('publishes update through CMS RPC pipeline when signed in', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: { user: { email: 'admin@example.com' } } } });
    mockRpc
      .mockResolvedValueOnce({ data: 'draft-123', error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const res = await publishRemoteUpdate({
      latestVersion: '1.2.6',
      latestVersionCode: 10,
      apkUrl: 'https://example.com/app.apk',
      releaseNotes: 'تحسينات',
      isMandatory: false,
    });
    expect(res).toEqual({ success: true });
    expect(mockRpc).toHaveBeenCalledTimes(3);
  });

  it('cleans up cached APK on Android when present', () => {
    const originalOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    mockFiles.set('file:///cache/baseerah-update.apk', 'binary-apk');
    cleanupDownloadedApk();
    expect(mockFiles.has('file:///cache/baseerah-update.apk')).toBe(false);
    Object.defineProperty(Platform, 'OS', { value: originalOs, configurable: true });
  });
});

describe('encyclopedia service', () => {
  const sampleIndex = {
    id: 'bidayah-test',
    title: 'البداية والنهاية',
    shortTitle: 'البداية والنهاية',
    author: 'ابن كثير',
    category: 'التاريخ الإسلامي',
    source: 'دار هجر',
    edition: 'الأولى',
    totalVolumes: 2,
    totalChapters: 4,
    totalPages: 400,
    volumes: [
      { volume: 1, title: 'المجلد الأول', pageCount: 200, chaptersCount: 2, sizeKb: 120, firstChapter: 'الباب الأول' },
      { volume: 2, title: 'المجلد الثاني', pageCount: 200, chaptersCount: 2, sizeKb: 130, firstChapter: 'الباب الثالث' },
    ],
  };

  const sampleVol1 = {
    volume: 1,
    title: 'المجلد الأول',
    pageCount: 200,
    chaptersCount: 2,
    chapters: [{ title: 'الباب الأول', page: 1, paragraphs: ['نص اختباري من المجلد الأول'] }],
  };

  it('formats volume download IDs deterministically', () => {
    expect(volumeDownloadId('bidayah', 3)).toBe('b:bidayah:v3');
  });

  it('fetches and caches encyclopedia index', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => sampleIndex })) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const first = await getEncyclopediaIndex('https://example.com/bidayah/index.json', 'bidayah-test');
    expect(first.totalVolumes).toBe(2);
    expect(mockFiles.has('file:///cache/bidayah-test_index_v2.json')).toBe(true);

    // Second read comes from memory cache without extra network call
    const second = await getEncyclopediaIndex('https://example.com/bidayah/index.json', 'bidayah-test');
    expect(second.title).toBe('البداية والنهاية');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads persistent document volume before hitting network', async () => {
    mockFiles.set('file:///doc/encyclopedia/bidayah-doc/vol-01.json', JSON.stringify(sampleVol1));
    const fetchMock = jest.fn() as unknown as typeof fetch;
    global.fetch = fetchMock;

    const payload = await getVolumeChunk(1, 'https://example.com/bidayah', 'bidayah-doc');
    expect(payload.chapters[0].title).toBe('الباب الأول');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('downloads volume offline into Paths.document and registers it in app downloads', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => sampleVol1 })) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const res = await downloadVolumeOffline(2, 'bidayah-dl', 'البداية والنهاية', 'https://example.com/bidayah', 500);
    expect(res).toEqual({ ok: true });
    expect(mockFiles.has('file:///doc/encyclopedia/bidayah-dl/vol-02.json')).toBe(true);
    const downloads = useApp.getState().downloads;
    expect(downloads).toHaveLength(1);
    expect(downloads[0].id).toBe('b:bidayah-dl:v2');
  });
});

describe('content-store book index stripping', () => {
  it('strips chapters from books while preserving chapterCount and audio items', () => {
    const sample: LibraryItem[] = [
      {
        id: 'usul-3',
        kind: 'book',
        category: 'العقيدة',
        title: 'الأصول الثلاثة',
        author: 'الشيخ محمد بن عبد الوهاب',
        source: 'دار العاصمة',
        chapters: [
          { title: 'المقدمة', paragraphs: ['اعلم رحمك الله'] },
          { title: 'الأصل الأول', paragraphs: ['معرفة الرب'] },
        ],
        pages: 48,
        audio_url: null,
        size_mb: 0.2,
      },
      {
        id: 'aud-1',
        kind: 'audio',
        category: 'العقيدة',
        title: 'شرح الأصول الثلاثة',
        author: 'الشيخ',
        source: 'بصيرة',
        chapters: [{ title: 'الدرس ١', paragraphs: [] }],
        pages: null,
        audio_url: 'https://example.com/a.mp3',
        size_mb: 5,
      },
    ];

    const stripped = stripBookBodies(sample);
    expect(stripped[0].chapters).toEqual([]);
    expect(stripped[0].chapterCount).toBe(2);
    expect(stripped[1].chapters).toHaveLength(1);
  });
});

describe('bookFormatter', () => {
  it('strips OpenITI markers from titles and text, reflows short lines, and marks headings', () => {
    expect(cleanBookTitle('||| حرف الألف ms0012')).toBe('حرف الألف');
    expect(cleanBookLine('## $$$$ بجير بن ms1467 أبي بجير')).toBe('بجير بن أبي بجير');

    const blocks = formatChapterBlocks(
      [
        'META# should disappear',
        '#####OpenITI# ignore',
        'فصل في صفة خلق العرش',
        'قال الله تعالى: {الرحمن على العرش استوى}،',
        'ms0008 وهو سبحانه العلي الأعلى.',
      ],
      { reflow: true },
    );

    expect(blocks.some((b) => b.kind === 'heading' && b.text === 'فصل في صفة خلق العرش')).toBe(true);
    const body = blocks.find((b) => b.kind === 'body');
    expect(body?.text).toBe('قال الله تعالى: {الرحمن على العرش استوى}، وهو سبحانه العلي الأعلى.');
  });
});
