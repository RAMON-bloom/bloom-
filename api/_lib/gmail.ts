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

  const res = await fetch('https://www.googleapis.com/gmail/v3/users/me/messages/send', {
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
