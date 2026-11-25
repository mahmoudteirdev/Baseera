/** الشهادات — `s.cert`: preview, progress to each stage certificate (1–3), server-issued certificate with verification code. */
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/core/Button';
import { Card } from '@/components/core/Card';
import { Chip } from '@/components/core/Chip';
import { ProgressBar } from '@/components/core/ProgressBar';
import { Txt } from '@/components/core/Txt';
import { BackLink, Screen, Title } from '@/components/layout/Screen';
import { useAcademy } from '@/features/academy/useAcademy';
import { exportCertificate, issueCertificate, verifyUrl } from '@/services/certificates';
import { useApp } from '@/state/app-store';
import { useUi } from '@/state/ui-store';
import { useTheme } from '@/theme/theme';

const STAGE_TITLES: Record<1 | 2 | 3, string> = {
  1: 'شهادة إتمام المرحلة الأولى',
  2: 'شهادة إتمام المرحلة الثانية',
  3: 'شهادة إتمام المرحلة الثالثة',
};

export default function Certificates() {
  const { t, pc, gc, r } = useTheme();
  const ac = useAcademy();
  const pname = useApp((s) => s.pname);
  const certs = useApp((s) => s.certificates);
  const set = useApp((s) => s.set);
  const flash = useUi((s) => s.flash);
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);

  const stageInfo = ac.stages.find((s) => s.stage === stage) ?? ac.stages[0];
  const cert = certs.find((c) => c.stage === stage);

  const issue = async () => {
    setBusy(true);
    const res = await issueCertificate(stage, pname || 'طالب العلم');
    setBusy(false);
    if (res.ok) {
      set({ certificates: [...certs.filter((c) => c.stage !== stage), res.cert] });
      flash('صدرت شهادتك. يمكنك تحميلها الآن.');
    } else flash(res.error);
  };

  return (
    <Screen gap={14}>
      <BackLink label="حسابي" href="/account" />
      <Title>الشهادات</Title>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {ac.stages.map((s) => (
          <Chip
            key={s.stage}
            label={`${s.label}${certs.some((c) => c.stage === s.stage) ? ' ✓' : ''}`}
            outline
            active={stage === s.stage}
            onPress={() => setStage(s.stage)}
            height={38}
            fontSize={14}
          />
        ))}
      </View>

      <View style={{ backgroundColor: '#FAF8F2', borderRadius: r(20), padding: 10 }}>
        <View style={{ borderWidth: 1.5, borderColor: gc, borderRadius: r(14), paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center', gap: 10 }}>
          <View style={{ width: 34, height: 34, borderWidth: 1.5, borderColor: gc }} />
          <Txt size={13} weight={600} color="#7A5F26" style={{ letterSpacing: 2 }}>
            {cert ? 'شهادة صادرة' : 'معاينة'}
          </Txt>
          <Txt font="display" size={28} weight={700} color="#182D29" align="center">
            {STAGE_TITLES[stage]}
          </Txt>
          <Txt size={15} color="#5B6B67">
            تُمنح لطالب العلم
          </Txt>
          <Txt font="display" size={24} weight={700} color={pc}>
            {cert?.name ?? (pname || 'اسم الطالب')}
          </Txt>
          <View style={{ width: 60, height: 1.5, backgroundColor: gc }} />
          <Txt size={14} color="#5B6B67">
            أكاديمية بصيرة · شهادة تعليمية مجانية
          </Txt>
          {cert && (
            <Txt size={13} color="#5B6B67" ltr selectable>
              {cert.code}
            </Txt>
          )}
        </View>
      </View>
      <Card variant="app" radius={18} pad={14} style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt size={16} weight={600}>
            تقدّمك نحو {stageInfo.label}
          </Txt>
          <Txt size={16} weight={600} color={t.primary}>
            {stageInfo.pct}%
          </Txt>
        </View>
        <ProgressBar value={stageInfo.pct} />
        <Txt size={14} color={t.muted} lh={1.7}>
          تُفتح عند اجتياز المواد الـ {stageInfo.subjectsCount} بنسبة {ac.passPct}% فأكثر ({stageInfo.passedCount} من {stageInfo.total} درسًا).
        </Txt>
      </Card>
      {cert ? (
        <>
          <Button size="lg" onPress={() => exportCertificate(cert)}>
            تحميل الشهادة (PDF)
          </Button>
          <Txt size={13} color={t.muted} align="center" selectable>
            رابط التحقق: {verifyUrl(cert.code)}
          </Txt>
        </>
      ) : stageInfo.complete ? (
        <Button size="lg" onPress={issue} disabled={busy}>
          {busy ? 'جارٍ الإصدار…' : 'إصدار الشهادة'}
        </Button>
      ) : (
        <Button size="lg" disabled>
          تحميل الشهادة · غير متاح بعد
        </Button>
      )}
    </Screen>
  );
}
