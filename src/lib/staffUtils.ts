import { ChatNotificationKind, ChatWebhook, InternalStaff } from '../types';

// 担当者マスタのWebhook編集UIと通知の主旨表示に使う一覧。将来、通知種別を追加する際はここに1件足す。
export const CHAT_NOTIFICATION_KINDS: { key: ChatNotificationKind; label: string; description: string }[] = [
  { key: 'CANDIDATE_REGISTERED', label: '新規候補者アサイン', description: '書類選考担当として新規候補者が割り当てられた際' },
  { key: 'ATTENTION_DIGEST', label: '抜け防止ダイジェスト', description: '進捗停滞・書類選考対応漏れの定期ダイジェスト' },
  { key: 'DOC_SCREENING_NUDGE', label: '書類選考の督促', description: '書類選考の対応が止まっている候補者がいる際の個別督促' },
  { key: 'EVALUATION_RESULT', label: '選考結果確定', description: '評価メモが合格/不採用として確定した際（書類選考含む）' },
  { key: 'DOCUMENT_SCREENING_THREAD', label: '書類選考通過スレッド作成', description: '書類選考を通過した候補者ごとに、候補者名＋エージェント名で新規スレッドを作成' },
  { key: 'DEVELOPER_INQUIRY', label: '開発者へのお問い合わせ', description: 'アプリ内「お問い合わせ」からバグ報告・改善提案等のメッセージが送信された際' }
];

// 指定した通知種別(kind)を送るべきWebhook URL一覧を返す。担当者は複数のWebhookを登録でき、
// それぞれ受け取る種類を選べるため、種別ごとにここでフィルタする。
// 旧・単一Webhook欄(googleChatWebhookUrl)は用途を限定する仕組みが無かった経緯があるため、
// 後方互換として常に全種別の送信対象として扱う。
export function getStaffWebhooksForKind(staff: InternalStaff, kind: ChatNotificationKind): string[] {
  const urls: string[] = [];
  (staff.googleChatWebhooks || []).forEach((wh) => {
    const url = wh.url.trim();
    if (url && wh.kinds.includes(kind) && !urls.includes(url)) {
      urls.push(url);
    }
  });
  const legacyUrl = staff.googleChatWebhookUrl?.trim();
  if (legacyUrl && !urls.includes(legacyUrl)) {
    urls.push(legacyUrl);
  }
  return urls;
}

// 担当者マスタの一覧カードで「登録済みWebhookが何件あるか」を表示するための、種別を問わない集計。
export function getAllStaffWebhookUrls(staff: InternalStaff): string[] {
  const urls = (staff.googleChatWebhooks || []).map((wh) => wh.url.trim()).filter((u) => u.length > 0);
  const legacyUrl = staff.googleChatWebhookUrl?.trim();
  if (legacyUrl && !urls.includes(legacyUrl)) {
    urls.push(legacyUrl);
  }
  return urls;
}

// 特定の担当者に属さない、複数人が見るスペース宛のWebhook一覧から、指定した通知種別を送るべき
// URLだけを返す。個人用のgetStaffWebhooksForKindと同じ考え方だが、後方互換の旧欄は存在しない。
export function getGroupWebhooksForKind(groupWebhooks: ChatWebhook[], kind: ChatNotificationKind): string[] {
  const urls: string[] = [];
  groupWebhooks.forEach((wh) => {
    const url = wh.url.trim();
    if (url && wh.kinds.includes(kind) && !urls.includes(url)) {
      urls.push(url);
    }
  });
  return urls;
}
