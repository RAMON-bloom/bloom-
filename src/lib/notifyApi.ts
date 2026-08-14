// Client-side helper for the /api/notify/* backend endpoints.

// Retries up to 2 extra times (3 attempts total, ~3s added latency worst case) on network-level
// failures (fetch itself throwing — offline, DNS, connection reset) and 5xx responses, since those
// plausibly describe a brief connectivity blip (e.g. Wi-Fi dropping mid-interview) rather than a
// request that will fail identically every time. 4xx is never retried — that means the request
// itself is invalid (bad webhook URL, malformed payload) and repeating it verbatim can't help.
// Deliberately NOT persisted across reloads/sessions like the Drive backup retry: a Chat
// notification that only manages to send minutes or hours later, after the interview has moved on,
// would be confusing at best and could land out of order in a thread — better to fail after a few
// seconds and let the existing "◯件失敗しました" toast surface it than to silently resurrect a
// stale notification later.
async function postJson(path: string, body: Record<string, unknown>): Promise<void> {
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAYS_MS = [1000, 2000];

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch {
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }
      throw new Error('通知の送信に失敗しました（ネットワークエラー）');
    }

    const rawText = await res.text();
    let data: any;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      throw new Error(`サーバーエラーが発生しました (HTTP ${res.status})`);
    }

    if (res.ok && !data.error) return;

    if (res.status >= 500 && attempt < MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      continue;
    }
    throw new Error(data.error || `通知の送信に失敗しました (HTTP ${res.status})`);
  }
}

export async function notifyCandidateRegistered(params: {
  accessToken: string | null;
  webhookUrl: string;
  staffName?: string; // 個人宛の場合のみ指定。グループ用Webhookへの送信時は省略（本文の宛名表記を省く）
  staffMentionId?: string; // 設定されていれば本物のメンションに使う（担当者マスタのGoogle ChatメンションID）
  candidateName: string;
  candidateId: string;
}): Promise<void> {
  return postJson('/api/notify/candidate-registered', { ...params, appUrl: window.location.origin });
}

export function notifyAttentionDigest(params: {
  accessToken: string | null;
  webhookUrl: string;
  staffName?: string; // 個人宛の場合のみ指定。グループ用Webhookへの送信時は省略（本文の宛名表記を省く）
  staffMentionId?: string; // 設定されていれば本物のメンションに使う（担当者マスタのGoogle ChatメンションID）
  stalledCount: number;
  overdueCount: number;
}): Promise<void> {
  return postJson('/api/notify/attention', { kind: 'digest', ...params, appUrl: window.location.origin });
}

export function notifyDocScreeningNudge(params: {
  accessToken: string | null;
  webhookUrl: string;
  staffName?: string; // 個人宛の場合のみ指定。グループ用Webhookへの送信時は省略（本文の宛名表記を省く）
  staffMentionId?: string; // 設定されていれば本物のメンションに使う（担当者マスタのGoogle ChatメンションID）
  candidateName: string;
  candidateId: string;
  daysSinceUpdate: number;
}): Promise<void> {
  return postJson('/api/notify/attention', { kind: 'doc_screening_nudge', ...params, appUrl: window.location.origin });
}

export async function notifyEvaluationResult(params: {
  accessToken: string | null;
  webhookUrl: string;
  staffName?: string; // 個人宛の場合のみ指定。グループ用Webhookへの送信時は省略（本文の宛名表記を省く）
  staffMentionId?: string; // 設定されていれば本物のメンションに使う（担当者マスタのGoogle ChatメンションID）
  candidateName: string;
  candidateId: string;
  phaseLabel: string;
  resultStatus: 'PASS' | 'FAIL';
  goodPoints?: string;
  concerns?: string;
  failReason?: string;
}): Promise<void> {
  return postJson('/api/notify/evaluation-result', { ...params, appUrl: window.location.origin });
}

export async function notifyEvaluationSummaryThread(params: {
  accessToken: string | null;
  webhookUrl: string;
  candidateName: string;
  candidateId: string;
  positionLabel?: string;
  phaseLabel: string;
  resultStatus: 'PASS' | 'FAIL';
  interviewRating?: string;
  lRating?: string;
  cRating?: string;
  mRating?: string;
  lNote?: string;
  cNote?: string;
  mNote?: string;
  goodPoints?: string;
  concerns?: string;
  otherNotes?: string;
  overallComment?: string;
  failReason?: string;
  nextPhaseLabel?: string;
  nextInterviewerNames?: string[];
  interviewFormatLabel?: string;
  mentionedStaff?: { name: string; mentionId?: string }[];
}): Promise<void> {
  return postJson('/api/notify/evaluation-summary-thread', params);
}

export async function notifyDeveloperInquiry(params: {
  accessToken: string | null;
  webhookUrl: string;
  staffName?: string;
  category: string;
  message: string;
  inquiryId: string;
}): Promise<void> {
  return postJson('/api/notify/developer-inquiry', params);
}

export async function sendAptitudeTestEmail(params: {
  accessToken: string | null;
  to: string;
  subject: string;
  bodyText: string;
  replyTo?: string;
  senderDisplayName?: string;
}): Promise<void> {
  return postJson('/api/notify/send-aptitude-test-email', params);
}

export async function notifyAptitudeTestReminder(params: {
  accessToken: string | null;
  webhookUrl: string;
  staffName?: string; // 個人宛の場合のみ指定。グループ用Webhookへの送信時は省略（本文の宛名表記を省く）
  staffMentionId?: string; // 設定されていれば本物のメンションに使う（担当者マスタのGoogle ChatメンションID）
  candidateName: string;
  candidateId: string;
  deadline?: string;
}): Promise<void> {
  return postJson('/api/notify/aptitude-test-reminder', { ...params, appUrl: window.location.origin });
}

export async function notifyAptitudeTestSent(params: {
  accessToken: string | null;
  webhookUrl: string;
  candidateName: string;
  candidateId: string;
  deadline?: string;
}): Promise<void> {
  return postJson('/api/notify/aptitude-test-sent', { ...params, appUrl: window.location.origin });
}

export async function notifyAptitudeTestDeadlineAlert(params: {
  accessToken: string | null;
  webhookUrl: string;
  staffName?: string;
  staffMentionId?: string;
  candidateName: string;
  candidateId: string;
  deadline?: string;
}): Promise<void> {
  return postJson('/api/notify/aptitude-test-deadline-alert', { ...params, appUrl: window.location.origin });
}

export async function notifyDocumentScreeningThread(params: {
  accessToken: string | null;
  webhookUrl: string;
  candidateName: string;
  candidateId: string;
  agencyName: string;
  positionLabel?: string;
  nextPhaseLabel?: string;
  nextInterviewerNames?: string[];
  interviewFormatLabel?: string;
}): Promise<void> {
  return postJson('/api/notify/document-screening-thread', { ...params, appUrl: window.location.origin });
}
