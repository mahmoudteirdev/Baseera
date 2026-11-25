/**
 * Component tests for BookCover, AudioCover, PagedBookReader, and MobileAdminDashboard.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  router: { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native');
  return { Image: (props: Record<string, unknown>) => <View testID="expo-image" {...props} /> };
});

jest.mock('@/services/encyclopedia', () => ({
  getEncyclopediaIndex: jest.fn(async () => ({
    id: 'bidayah',
    title: 'البداية والنهاية',
    shortTitle: 'البداية والنهاية',
    author: 'ابن كثير',
    category: 'التاريخ الإسلامي',
    source: 'دار هجر',
    edition: '١',
    totalVolumes: 2,
    totalChapters: 2,
    totalPages: 200,
    volumes: [
      { volume: 1, title: 'المجلد الأول', pageCount: 100, chaptersCount: 1, sizeKb: 100, firstChapter: 'خلق العرش' },
      { volume: 2, title: 'المجلد الثاني', pageCount: 100, chaptersCount: 1, sizeKb: 100, firstChapter: 'قصص الأنبياء' },
    ],
  })),
  getVolumeChunk: jest.fn(async () => ({
    volume: 1,
    title: 'المجلد الأول',
    pageCount: 100,
    chaptersCount: 2,
    chapters: [
      { title: 'مقدمة المجلد', page: 1, paragraphs: ['سطر محذوف'] },
      { title: 'باب ما جاء في خلق العرش', page: 2, paragraphs: ['META# skip', 'نص حقيقي من كتاب البداية والنهاية'] },
    ],
  })),
  downloadVolumeOffline: jest.fn(async () => ({ ok: true })),
  volumeDownloadId: (bookId: string, vol: number) => `b:${bookId}:v${vol}`,
}));

jest.mock('@/services/downloads', () => ({
  DOWNLOAD_ERRORS: { full: 'مساحة ممتلئة', network: 'خطأ شبكة' },
  downloadsSupported: true,
  deleteDownload: jest.fn(async () => {}),
}));

const mockSessionState = { session: null as null | { user: { email: string } }, ready: true };
let mockStaffRole: 'admin' | 'scholar' | 'content' | 'mod' | null = null;

jest.mock('@/services/auth', () => ({
  useSession: () => mockSessionState,
  signOut: jest.fn(async () => {}),
}));

jest.mock('@/features/admin/useIsStaff', () => ({
  useStaffRole: () => mockStaffRole,
}));

jest.mock('@/features/admin/Console', () => {
  const { Text, View } = jest.requireActual('react-native');
  return {
    Console: ({ onExit }: { onExit?: () => void }) => (
      <View>
        <Text>لوحة Console المتقدمة</Text>
        {onExit ? <Text onPress={onExit}>رجوع للجوال</Text> : null}
      </View>
    ),
  };
});

jest.mock('@/services/supabase', () => {
  const mkQuery = (): Record<string, unknown> => {
    const res = { data: [], error: null };
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      neq: () => q,
      in: () => q,
      not: () => q,
      order: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (onFulfilled: (v: typeof res) => unknown) => Promise.resolve(res).then(onFulfilled),
    };
    return q;
  };
  return {
    supabase: {
      from: () => mkQuery(),
      rpc: jest.fn(async () => ({ data: [], error: null })),
    },
  };
});

import { MobileAdminDashboard } from '@/features/admin/MobileAdminDashboard';
import { PagedBookReader } from '@/features/encyclopedia/PagedBookReader';
import { AudioCover } from '@/features/library/AudioCover';
import { BookCover } from '@/features/library/BookCover';
import { downloadVolumeOffline } from '@/services/encyclopedia';
import type { LibraryItem } from '@/state/content-store';
import { ThemeProvider } from '@/theme/theme';

const wrap = async (ui: ReactNode) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 44, left: 0, right: 0, bottom: 34 } }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

describe('BookCover & AudioCover', () => {
  it('renders classical heritage book cover metadata across sizes', async () => {
    await wrap(
      <BookCover
        title="متن العقيدة الطحاوية"
        author="الإمام الطحاوي"
        category="العقيدة"
        size="lg"
      />,
    );
    expect(screen.getAllByText('متن العقيدة الطحاوية').length).toBeGreaterThan(0);
    expect(screen.getByText('الإمام أبو جعفر الطحاوي (ت ٣٢١ هـ)')).toBeTruthy();
    expect(screen.getByText('دار بصيرة للتراث الإسلامي')).toBeTruthy();
  });

  it('renders image cover when coverUrl is given', async () => {
    await wrap(<BookCover title="كتاب مصور" coverUrl="https://example.com/cover.jpg" />);
    expect(screen.getByTestId('expo-image')).toBeTruthy();
  });

  it('renders AudioCover vector artwork and playing label', async () => {
    await wrap(
      <AudioCover
        title="شرح كتاب التوحيد"
        author="الشيخ الفوزان"
        category="العقيدة"
        playing
      />,
    );
    expect(screen.getAllByText('شرح كتاب التوحيد').length).toBeGreaterThan(0);
    expect(screen.getByText('الشيخ الفوزان')).toBeTruthy();
    expect(screen.getByText(/درس صوتي/)).toBeTruthy();
  });
});

describe('PagedBookReader', () => {
  const sampleEncyclopedia: LibraryItem = {
    id: 'al-bidayah-wan-nihayah',
    kind: 'book',
    category: 'التاريخ الإسلامي',
    title: 'البداية والنهاية',
    author: 'الحافظ ابن كثير',
    source: 'دار هجر',
    pages: 13078,
    size_mb: 21.5,
    paged: true,
    audio_url: null,
    chapters: [],
    indexUrl: 'https://example.com/encyclopedia/bidayah/index.json',
  };

  it('loads volume chunk, filters META lines, and supports offline volume download', async () => {
    await wrap(<PagedBookReader item={sampleEncyclopedia} />);

    await waitFor(() => {
      expect(screen.getAllByText('باب ما جاء في خلق العرش').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('نص حقيقي من كتاب البداية والنهاية')).toBeTruthy();
    expect(screen.queryByText('META# skip')).toBeNull();
    expect(screen.queryByText('سطر محذوف')).toBeNull();

    const dlBtn = screen.getByLabelText('تنزيل المجلد');
    await fireEvent.press(dlBtn);
    await waitFor(() => {
      expect(downloadVolumeOffline).toHaveBeenCalledWith(
        1,
        'al-bidayah-wan-nihayah',
        'البداية والنهاية',
        'https://example.com/encyclopedia/bidayah',
        100,
      );
    });
  });
});

describe('MobileAdminDashboard', () => {
  afterEach(() => {
    mockSessionState.session = null;
    mockStaffRole = null;
  });

  it('shows sign-in gate when signed out', async () => {
    mockSessionState.session = null;
    mockStaffRole = null;
    await wrap(<MobileAdminDashboard />);
    expect(screen.getByText('يجب تسجيل الدخول أولاً')).toBeTruthy();
  });

  it('shows staff restriction when signed in without staff role', async () => {
    mockSessionState.session = { user: { email: 'user@example.com' } };
    mockStaffRole = null;
    await wrap(<MobileAdminDashboard />);
    expect(screen.getByText('الوصول مقصور على الطاقم المعتمد')).toBeTruthy();
  });

  it('opens editor tab, edits book paragraphs, and toggles Console for admin', async () => {
    mockSessionState.session = { user: { email: 'admin@example.com' } };
    mockStaffRole = 'admin';
    await wrap(<MobileAdminDashboard />);

    expect(screen.getByText('مدير عام النظام')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: '✏️ المحرر' }));
    expect(screen.getByText('محرر الكتب والأبواب والفقرات ✏️')).toBeTruthy();

    const editBtns = screen.getAllByRole('button', { name: 'تعديل النص' });
    await fireEvent.press(editBtns[0]);
    expect(screen.getByText('تعديل الكتاب والأبواب ✏️')).toBeTruthy();

    const addChapBtn = screen.getByRole('button', { name: 'إضافة باب' });
    await fireEvent.press(addChapBtn);
    expect(screen.getByText('+ إضافة فقرة جديدة للباب')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'إلغاء' }));

    await fireEvent.press(screen.getByText('⚙️ فتح لوحة المراجعة المتقدمة (13 قسماً · Console)'));
    expect(screen.getByText('لوحة Console المتقدمة')).toBeTruthy();
  });
});
