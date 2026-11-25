/**
 * AudioCover — Classical Islamic Audio Lecture & Recitation Artwork.
 * Renders a crisp vector heritage medallion with acoustic bars, gold-foil borders,
 * category hues, and Amiri typography with zero network payload.
 */
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Icon } from '@/components/core/Icon';
import { Txt } from '@/components/core/Txt';
import { ICON } from '@/data/structural';

export interface AudioCoverProps {
  title: string;
  author?: string | null;
  category?: string | null;
  playing?: boolean;
  style?: StyleProp<ViewStyle>;
}

const PALETTES: Record<string, { base: string; dark: string; gold: string; softGold: string }> = {
  العقيدة: { base: '#0D3327', dark: '#061D15', gold: '#C5A059', softGold: '#F3E4BE' },
  الفقه: { base: '#0D223B', dark: '#061120', gold: '#C5A059', softGold: '#F3E4BE' },
  الحديث: { base: '#3E101A', dark: '#22070D', gold: '#C5A059', softGold: '#F3E4BE' },
  السيرة: { base: '#2D1910', dark: '#1A0D07', gold: '#C5A059', softGold: '#F3E4BE' },
  التفسير: { base: '#0A2F2B', dark: '#051A18', gold: '#C5A059', softGold: '#F3E4BE' },
  التزكية: { base: '#181E22', dark: '#0D1114', gold: '#C5A059', softGold: '#F3E4BE' },
};

const DEFAULT_PALETTE = { base: '#0D3327', dark: '#061D15', gold: '#C5A059', softGold: '#F3E4BE' };

export function AudioCover({ title, author, category, playing = false, style }: AudioCoverProps) {
  const p = (category && PALETTES[category]) || DEFAULT_PALETTE;
  const barHeights = [14, 24, 34, 20, 40, 28, 18, 32, 22, 14];

  return (
    <View style={[styles.container, { backgroundColor: p.base }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 360 260" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="audioGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={p.base} stopOpacity="1" />
            <Stop offset="1" stopColor={p.dark} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="360" height="260" fill="url(#audioGrad)" />
        {/* Concentric Islamic geometric rings */}
        <Circle cx="180" cy="112" r="96" fill="none" stroke={p.gold} strokeWidth="0.9" strokeOpacity="0.22" />
        <Circle cx="180" cy="112" r="72" fill="none" stroke={p.softGold} strokeWidth="0.8" strokeOpacity="0.28" strokeDasharray="4 4" />
        <Circle cx="180" cy="112" r="46" fill={p.dark} fillOpacity="0.45" stroke={p.gold} strokeWidth="1.2" strokeOpacity="0.65" />
        {/* Outer gold frame */}
        <Rect x="12" y="12" width="336" height="236" rx="18" fill="none" stroke={p.gold} strokeWidth="1.2" strokeOpacity="0.65" />
        <Rect x="17" y="17" width="326" height="226" rx="14" fill="none" stroke={p.softGold} strokeWidth="0.6" strokeOpacity="0.4" />
        {/* Corner stars */}
        <Path d="M26 26 L36 26 M26 26 L26 36 M334 26 L324 26 M334 26 L334 36 M26 234 L36 234 M26 234 L26 224 M334 234 L324 234 M334 234 L334 224" stroke={p.softGold} strokeWidth="1.2" strokeOpacity="0.6" />
      </Svg>

      <View style={styles.inner}>
        {category ? (
          <View style={[styles.badge, { borderColor: p.gold }]}>
            <Txt size={11} weight={700} color={p.softGold}>
              {category} · درس صوتي
            </Txt>
          </View>
        ) : null}

        <View style={[styles.medallion, { borderColor: p.gold, backgroundColor: p.dark }]}>
          <Icon d={ICON.headphones} size={34} color={p.softGold} sw={1.8} />
        </View>

        <View style={styles.barsRow}>
          {barHeights.map((h, i) => (
            <View
              key={i}
              style={{
                width: 3.5,
                height: playing ? h : Math.max(8, Math.round(h * 0.55)),
                borderRadius: 2,
                backgroundColor: i % 2 === 0 ? p.gold : p.softGold,
                opacity: playing ? 0.9 : 0.45,
              }}
            />
          ))}
        </View>

        <View style={styles.meta}>
          <Txt font="display" size={18} weight={700} color={p.softGold} numberOfLines={1} style={{ textAlign: 'center' }}>
            {title}
          </Txt>
          {author ? (
            <Txt size={12} color={p.gold} numberOfLines={1} style={{ textAlign: 'center', opacity: 0.92 }}>
              {author}
            </Txt>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 260,
    borderRadius: 28,
    overflow: 'hidden',
    position: 'relative',
    boxShadow: '0px 8px 20px rgba(0,0,0,0.2)',
    elevation: 4,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  medallion: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 36,
  },
  meta: {
    alignItems: 'center',
    gap: 2,
    width: '100%',
  },
});
