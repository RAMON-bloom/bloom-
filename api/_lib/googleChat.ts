// Sends a plain-text message to a Google Chat space via its incoming webhook URL. Each recipient
// configures their own personal space + webhook in Google Chat (Space settings > Apps & integrations
// > Webhooks) and pastes the URL into their 担当者マスタ record — there's no Chat API / service
// account involved, so this is just a POST like any other webhook.
//
// Passing threadKey groups messages into a Chat thread: the first message with a given key starts
// a new thread, and any later message reusing that same key replies into it instead of posting a
// new top-level message. No Chat API/service account needed — this is a plain field on the
// incoming-webhook payload.
export async function sendGoogleChatMessage(webhookUrl: string, text: string, threadKey?: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(threadKey ? { text, thread: { threadKey } } : { text })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Google Chat Webhookへの送信に失敗しました (HTTP ${response.status}): ${body.slice(0, 300)}`);
  }
}
