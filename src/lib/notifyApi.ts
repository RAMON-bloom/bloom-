// Client-side helper for the /api/notify/* backend endpoints.

export async function notifyCandidateRegistered(params: {
  webhookUrl: string;
  staffName: string;
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
