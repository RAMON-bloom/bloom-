import { Candidate } from '../types';

// 入社予定者（入社予定日が設定済み、または内定通知・内定承諾フェーズ）とみなす候補者かどうか。
// 一度この条件を満たしていても、その後「見送り」「選考辞退」になった場合は入社予定者一覧・件数から除外する。
// joiningDate等の入社準備系フィールドは辞退後もデータとしては残す（削除はしない）ため、
// phaseだけを見て判定している — c.joiningDateが残っていても辞退なら除外される。
export function isJoiningScheduled(candidate: Candidate): boolean {
  if (candidate.phase === 'REJECTED' || candidate.phase === 'DECLINED') return false;
  return !!(candidate.joiningDate || candidate.phase === 'OFFER_ACCEPTED' || candidate.phase === 'OFFER_ISSUED');
}

// 入社手続きチェックリストの項目定義（表示順）。項目を増やす/並べ替える場合はここだけ直せばよい。
// idは保存データ(Candidate.onboardingChecklist)のキーなので、既存項目のidは変更しないこと。
// wideNote: 備考欄を項目名の下に全幅・複数行で表示する（面談記録など長文を書く項目）。
export const ONBOARDING_CHECKLIST_ITEMS: { id: string; label: string; notePlaceholder?: string; wideNote?: boolean }[] = [
  { id: 'employment_contract', label: '雇用契約書' },
  { id: 'pledge', label: '誓約書' },
  { id: 'guarantor', label: '身元保証書' },
  { id: 'relative_email_checking', label: '親族アドレス確認中' },
  { id: 'relative_email_confirmed', label: '親族アドレス確認済み' },
  { id: 'report_to_chat', label: '契約書締結後入社チャットへ報告' },
  { id: 'joining_form_sent', label: '入社フォーム送付', notePlaceholder: '期限 ●/●' },
  { id: 'onboarding_account_request', label: 'オンボーディングアカウント作成依頼' },
  { id: 'onboarding_sent', label: 'オンボーディング送付' },
  { id: 'joining_form_checked', label: '入社フォーム確認' },
  { id: 'health_check', label: '健康診断書' },
  { id: 'residence_certificate', label: '住民票(引っ越しのある方)' },
  { id: 'pre_joining_interview', label: '入社前面談', notePlaceholder: '実施日・面談者・話した内容・懸念点など（改行できます）', wideNote: true }
];

export function getChecklistEntry(candidate: Candidate, itemId: string): { checked: boolean; note: string } {
  const e = candidate.onboardingChecklist?.find((x) => x.id === itemId);
  return { checked: !!e?.checked, note: e?.note || '' };
}

export function countCheckedOnboardingItems(candidate: Candidate): number {
  return ONBOARDING_CHECKLIST_ITEMS.filter((i) => getChecklistEntry(candidate, i.id).checked).length;
}
