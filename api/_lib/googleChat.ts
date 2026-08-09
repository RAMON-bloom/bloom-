// Sends a plain-text message to a Google Chat space via its incoming webhook URL. Each recipient
// configures their own personal space + webhook in Google Chat (Space settings > Apps & integrations
// > Webhooks) and pastes the URL into their 担当者マスタ record — there's no Chat API / service
// account involved, so this is just a POST like any other webhook.
//
// Passing threadKey groups messages into a Chat thread: the first message with a given key starts
// a new thread, and any later message reusing that same key replies into it instead of posting a
// new top-level message. No Chat API/service account involved — but the JSON body's thread.threadKey
// field alone is NOT enough: Chat only looks up an existing thread by that key when the request URL
// also carries messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD. Without it, Chat's default
// (MESSAGE_REPLY_OPTION_UNSPECIFIED) ignores threadKey for matching and starts a new thread every
// time, which is why candidate threads were splitting instead of accumulating replies.
// Every legitimate webhook URL configured in this app (担当者マスタ / エージェント設定, see the
// `https://chat.googleapis.com/v1/spaces/...` placeholder text in AgencyMasterView) points at
// Google Chat's own incoming-webhook endpoint. Enforcing that here — rather than trusting whatever
// URL a request happens to carry — closes off using this server as an open POST relay to arbitrary
// third-party or internal URLs.
const ALLOWED_WEBHOOK_HOST = 'chat.googleapis.com';

export async function sendGoogleChatMessage(webhookUrl: string, text: string, threadKey?: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(webhookUrl);
  } catch {
    throw new Error('Google Chat Webhook URLの形式が不正です。');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== ALLOWED_WEBHOOK_HOST) {
    throw new Error(`Google Chat Webhook URLは https://${ALLOWED_WEBHOOK_HOST}/... 形式である必要があります。`);
  }

  let targetUrl = webhookUrl;
  if (threadKey) {
    const url = new URL(webhookUrl);
    url.searchParams.set('messageReplyOption', 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD');
    targetUrl = url.toString();
  }

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(threadKey ? { text, thread: { threadKey } } : { text })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Google Chat Webhookへの送信に失敗しました (HTTP ${response.status}): ${body.slice(0, 300)}`);
  }
}

// Builds the "@name" bit used at the start of personal notifications. When the staff member has
// registered their numeric Google Chat user id (担当者マスタ「Google ChatメンションID」), embeds
// the <users/{id}> markup Chat resolves into a real, notifying @mention chip; otherwise falls back
// to a plain bold "*@name*" that reads the same but doesn't actually ping them (the id isn't
// something the app can look up on its own — see 担当者マスタ's field help text for how staff find
// it themselves). Returns '' when there's no staffName at all (group-webhook sends omit it).
export function formatMention(staffName?: string, mentionId?: string): string {
  if (mentionId) return `<users/${mentionId}>`;
  if (staffName) return `*@${staffName}*`;
  return '';
}
