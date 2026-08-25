import { Agency, Candidate } from '../types';

// 賞与保証は複数回に分けて支給されることがある（例: 初年度冬・翌年夏の2回）ため、全支給分の
// 合計額を返す。hasBonusGuaranteeがfalseの場合は内訳が残っていても0扱い（一覧・計算どちらからも
// このヘルパー経由で参照し、チェックボックスOFF＝「なし」の一貫性を保つ）。
export function sumBonusGuaranteeAmount(candidate: Candidate): number {
  if (!candidate.hasBonusGuarantee) return 0;
  return (candidate.bonusGuaranteeInstallments || []).reduce((sum, i) => sum + (i.amount || 0), 0);
}

// エージェントへの紹介手数料支払額を計算する。基準額は基本月給×12（年収換算）で、賞与保証・
// サインオンボーナスはエージェント側の設定（commissionAppliesToBonusGuarantee/SignOnBonus）で
// 「対象にする」を選んだ場合のみ基準額に加算する。基本月給が未入力の候補者は計算できないため0円。
export function computeAgencyPaymentAmount(candidate: Candidate, agency: Agency | undefined): number {
  if (!agency || !candidate.baseMonthlySalary) return 0;

  let base = candidate.baseMonthlySalary * 12;
  if (agency.commissionAppliesToBonusGuarantee) {
    base += sumBonusGuaranteeAmount(candidate);
  }
  if (agency.commissionAppliesToSignOnBonus && candidate.hasSignOnBonus) {
    base += candidate.signOnBonusAmount || 0;
  }

  return Math.round(base * (agency.commissionRate / 100));
}
