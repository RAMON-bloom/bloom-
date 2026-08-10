// Client-side helper for the /api/notify/* backend endpoints.

export async function notifyCandidateRegistered(params: {
  accessToken: string | null;
  webhookUrl: string;
  staffName?: string; // 個人宛の場合のみ指定。グループ用Webhookへの送信時は省略（本文の宛名表記を省く）
  staffMentionId?: string; // 設定されていれば本物のメンションに使う（担当者マスタのGoogle ChatメンションID）
  candidateName: string;
  candidateId: string;
}): Promise<void> {
  const res = await fetch('/api/notify/candidate-registered', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, appUrl: window.location.origin })
  });

  const rawText = await res.text();
  let data: any;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`サーバーエラーが発生しました (HTTP ${res.status})`);
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || '通知の送信に失敗しました');
  }
}

async function postAttentionNotify(body: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/notify/attention', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, appUrl: window.location.origin })
  });

  const rawText = await res.text();
  let data: any;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`サーバーエラーが発生しました (HTTP ${res.status})`);
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || '通知の送信に失敗しました');
  }
}

export function notifyAttentionDigest(params: {
  accessToken: string | null;
  webhookUrl: string;
  staffName?: string; // 個人宛の場合のみ指定。グループ用Webhookへの送信時は省略（本文の宛名表記を省く）
  staffMentionId?: string; // 設定されていれば本物のメンションに使う（担当者マスタのGoogle ChatメンションID）
  stalledCount: number;
  overdueCount: number;
}): Promise<void> {
  return postAttentionNotify({ kind: 'digest', ...params });
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
  return postAttentionNotify({ kind: 'doc_screening_nudge', ...params });
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
  const res = await fetch('/api/notify/evaluation-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, appUrl: window.location.origin })
  });

  const rawText = await res.text();
  let data: any;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`サーバーエラーが発生しました (HTTP ${res.status})`);
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || '通知の送信に失敗しました');
  }
}

export async function notifyEvaluationSummaryThread(params: {
  accessToken: string | null;
  webhookUrl: string;
  candidateName: string;
  candidateId: string;
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
  failReason?: string;
  nextPhaseLabel?: string;
  nextInterviewerNames?: string[];
  mentionedStaff?: { name: string; mentionId?: string }[];
}): Promise<void> {
  const res = await fetch('/api/notify/evaluation-summary-thread', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  const rawText = await res.text();
  let data: any;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`サーバーエラーが発生しました (HTTP ${res.status})`);
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || '通知の送信に失敗しました');
  }
}

export async function notifyDeveloperInquiry(params: {
  accessToken: string | null;
  webhookUrl: string;
  staffName?: string;
  category: string;
  message: string;
  inquiryId: string;
}): Promise<void> {
  const res = await fetch('/api/notify/developer-inquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  const rawText = await res.text();
  let data: any;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`サーバーエラーが発生しました (HTTP ${res.status})`);
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || '通知の送信に失敗しました');
  }
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
  const res = await fetch('/api/notify/document-screening-thread', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, appUrl: window.location.origin })
  });

  const rawText = await res.text();
  let data: any;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`サーバーエラーが発生しました (HTTP ${res.status})`);
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || '通知の送信に失敗しました');
  }
}
