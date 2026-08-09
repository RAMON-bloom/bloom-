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
export async function sendGoogleChatMessage(webhookUrl: string, text: string, threadKey?: string): Promise<void> {
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
