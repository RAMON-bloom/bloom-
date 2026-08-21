// Minimal Gmail API sender used only by api/notify/send-aptitude-test-email.ts. Builds a plain
// RFC 2822 message and posts it to `users.messages.send` with the caller's own OAuth accessToken
// (gmail.send scope) — there's no service account/domain-wide delegation in this project, so mail
// is always sent "as" whichever bloom-firm.com staff member clicked the send button. The `From`
// address is therefore always that account's own verified address; only the display name portion
// is caller-configurable.

function encodeMimeHeaderWord(text: string): string {
  // Non-ASCII headers (Japanese subject/display name) need RFC 2047 encoded-word form; ASCII-only
  // text is left as-is since encoding it would just add noise.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf-8').toString('base64')}?=`;
}

function base64UrlEncode(text: string): string {
  return Buffer.from(text, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sendGmailMessage(
  accessToken: string,
  params: {
    fromEmail: string;
    fromDisplayName?: string;
    to: string;
    replyTo?: string;
    subject: string;
    bodyText: string;
  }
): Promise<void> {
  const fromHeader = params.fromDisplayName
    ? `${encodeMimeHeaderWord(params.fromDisplayName)} <${params.fromEmail}>`
    : params.fromEmail;

  const headers = [
    `From: ${fromHeader}`,
    `To: ${params.to}`,
    params.replyTo ? `Reply-To: ${params.replyTo}` : null,
    `Subject: ${encodeMimeHeaderWord(params.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64'
  ].filter((line): line is string => line !== null);

  const bodyBase64 = Buffer.from(params.bodyText, 'utf-8').toString('base64');
  const rawMessage = `${headers.join('\r\n')}\r\n\r\n${bodyBase64}`;

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: base64UrlEncode(rawMessage) })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err: any = new Error(`Gmail送信に失敗しました (HTTP ${res.status}): ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
}

async function gmailFetch(accessToken: string, url: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err: any = new Error(`Gmail API error (${res.status}): ${text.slice(0, 500)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function base64UrlDecode(text: string): string {
  return Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function getHeader(payload: any, name: string): string {
  return (payload?.headers || []).find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

// Google Meetのメモ/文字起こし機能はDocを作成すると同時に、その共有通知メールを参加者へ送る
// (本文にDocへのリンクが含まれる) — メール本文全体からdocs.google.com/document/d/<ID>形式の
// リンクを1つでも見つけられれば、それがそのままsummarize-log.tsへ渡せるDrive fileIdになる。
// text/plain・text/html双方を再帰的に集めて連結し、どちらの形式で来てもマッチできるようにする。
function collectBodyText(part: any): string {
  if (!part) return '';
  let text = '';
  if (part.body?.data && (part.mimeType === 'text/plain' || part.mimeType === 'text/html')) {
    text += base64UrlDecode(part.body.data) + '\n';
  }
  (part.parts || []).forEach((child: any) => {
    text += collectBodyText(child);
  });
  return text;
}

function extractDriveFileId(text: string): string | null {
  const match = text.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function formatGmailDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

export interface GmailMeetingNotesMatch {
  eventSummary: string;
  eventStart: string;
  fileId: string;
  fileName: string;
}

// Finds the Google Meet transcript/notes sharing-notification email closest to `dateStr` whose body
// links to a Google Docs document, and returns that document's Drive file id — the counterpart to
// calendar.ts's findMeetingNotesDoc for meetings whose notes only ever arrived by email (never
// attached to the calendar event itself, or the event/attachment already rotated out of Calendar).
// Deliberately permissive on the search query (title keyword + a few likely Japanese/English terms,
// broad ±1day window) since the exact subject line Google uses has changed over time — the real
// filter is simply "does the body actually contain a Docs link", so a false-positive match is
// self-correcting (no link found → treated as no match) even if the keyword search is loose.
export async function findMeetingNotesEmail(
  accessToken: string,
  dateStr: string,
  titleKeyword: string
): Promise<GmailMeetingNotesMatch | null> {
  const centerDate = new Date(dateStr);
  if (Number.isNaN(centerDate.getTime())) return null;

  const afterDate = new Date(centerDate.getTime() - 24 * 60 * 60 * 1000);
  const beforeDate = new Date(centerDate.getTime() + 2 * 24 * 60 * 60 * 1000);
  const query = `${titleKeyword} (Gemini OR 文字起こし OR メモ OR transcript OR notes) after:${formatGmailDate(afterDate)} before:${formatGmailDate(beforeDate)}`;

  const listData = await gmailFetch(
    accessToken,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q: query, maxResults: '10' }).toString()}`
  );
  const messageIds: string[] = (listData.messages || []).map((m: any) => m.id);
  if (messageIds.length === 0) return null;

  const candidates = await Promise.all(
    messageIds.map(async (id) => {
      const msg = await gmailFetch(accessToken, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
      const bodyText = collectBodyText(msg.payload);
      const fileId = extractDriveFileId(bodyText);
      if (!fileId) return null;
      return {
        fileId,
        subject: getHeader(msg.payload, 'Subject') || '議事録メール',
        internalDate: Number(msg.internalDate) || 0
      };
    })
  );

  const withLinks = candidates.filter((c): c is { fileId: string; subject: string; internalDate: number } => !!c);
  if (withLinks.length === 0) return null;

  const target = centerDate.getTime();
  withLinks.sort((a, b) => Math.abs(a.internalDate - target) - Math.abs(b.internalDate - target));
  const best = withLinks[0];

  return {
    eventSummary: best.subject,
    eventStart: new Date(best.internalDate).toISOString(),
    fileId: best.fileId,
    fileName: best.subject
  };
}
