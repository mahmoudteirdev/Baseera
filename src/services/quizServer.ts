/**
 * Server-side quiz grading with persistent offline queue fallback.
 * When offline, signed out, or on transient failure, attempts are queued locally and flushed
 * automatically upon sign-in, reconnect, launch, or certificate issuance.
 */
import { useApp } from '@/state/app-store';

import { backendConfigured, supabase } from './supabase';

async function sendAttempt(code: string, answers: number[]): Promise<'sent' | 'permanent_error' | 'retry'> {
  if (!backendConfigured || !supabase) return 'retry';
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return 'retry';
  try {
    const { error } = await supabase.functions.invoke('grade-quiz', { body: { code, answers } });
    if (!error) return 'sent';
    const msg = String(error.message ?? '');
    // Permanent client payload/lesson errors (400 / 404) should not loop forever.
    if (msg.includes('400') || msg.includes('404') || msg.includes('unknown_lesson') || msg.includes('invalid')) {
      return 'permanent_error';
    }
    return 'retry';
  } catch {
    return 'retry';
  }
}

export async function gradeOnServer(code: string, answers: number[]): Promise<'sent' | 'queued'> {
  const res = await sendAttempt(code, answers);
  if (res === 'sent') return 'sent';
  if (res === 'retry') {
    useApp.getState().queueQuiz(code, answers);
  }
  return 'queued';
}

/** Flush queued quiz attempts to the server when online and signed in. */
export async function flushPendingQuizzes(): Promise<number> {
  if (!backendConfigured || !supabase) return 0;
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return 0;
  const pending = useApp.getState().pendingQuizzes ?? [];
  let sent = 0;
  for (const item of pending) {
    const res = await sendAttempt(item.code, item.answers);
    if (res === 'sent') {
      useApp.getState().clearQuiz(item.localId);
      sent++;
    } else if (res === 'permanent_error') {
      useApp.getState().clearQuiz(item.localId);
    } else {
      break;
    }
  }
  return sent;
}
