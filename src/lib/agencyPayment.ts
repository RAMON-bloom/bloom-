import { Agency, Candidate } from '../types';

// エージェントへの紹介手数料支払額を計算する。基準額は基本月給×12（年収換算）で、賞与保証・
// サインオンボーナスはエージェント側の設定（commissionAppliesToBonusGuarantee/SignOnBonus）で
// 「対象にする」を選んだ場合のみ基準額に加算する。基本月給が未入力の候補者は計算できないため0円。
export function computeAgencyPaymentAmount(candidate: Candidate, agency: Agency | undefined): number {
  if (!agency || !candidate.baseMonthlySalary) return 0;

  let base = candidate.baseMonthlySalary * 12;
  if (agency.commissionAppliesToBonusGuarantee && candidate.hasBonusGuarantee) {
    base += candidate.bonusGuaranteeAmount || 0;
  }
  if (agency.commissionAppliesToSignOnBonus && candidate.hasSignOnBonus) {
    base += candidate.signOnBonusAmount || 0;
  }

  return Math.round(base * (agency.commissionRate / 100));
}
