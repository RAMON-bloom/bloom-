import { Candidate, OnboardingChecklistEntry } from '../types';
import { salaryMonthsOf } from './agencyPayment';
import type { StoredOfferLedgerRow } from './driveApi';

// One field the 内定者台帳 (Drive) holds for a candidate that the app doesn't have, or has differently.
export interface LedgerFieldDiff {
  key: string;
  label: string;
  appValue: string; // display text ('' = empty in the app)
  ledgerValue: string;
  appEmpty: boolean; // restoring only fills this in — nothing in the app is overwritten
  patch: Partial<Candidate>;
}

export interface LedgerCandidateDiff {
  candidate: Candidate;
  ledgerUpdatedAt: string;
  fields: LedgerFieldDiff[];
}

const DINNER_LABELS: Record<string, string> = { UNPLANNED: '未定', SCHEDULED: '予定あり', COMPLETED: '実施済み', NOT_REQUIRED: '不要・不参加' };
const RESIGNATION_LABELS: Record<string, string> = {
  NOT_STARTED: '未着手', IN_PROGRESS: '交渉中', NOTICE_SUBMITTED: '退職願提出済', COMPLETED: '交渉完了', DIFFICULT: '難航・調整中'
};
const yen = (n?: number) => (n ? `¥${n.toLocaleString('ja-JP')}` : '');
const clip = (t?: string) => (t ? (t.length > 40 ? `${t.slice(0, 40)}…` : t) : '');

// Compares the ledger's last recorded 入社・フォロー管理 values with each candidate still in the app.
// Rows whose candidate no longer exists in the app are reported separately (they can't be restored
// into anything — re-register the candidate first).
export function diffLedgerAgainstApp(
  rows: StoredOfferLedgerRow[],
  candidates: Candidate[]
): { diffs: LedgerCandidateDiff[]; missingNames: string[] } {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const diffs: LedgerCandidateDiff[] = [];
  const missingNames: string[] = [];

  for (const r of rows) {
    const c = byId.get(r.candidateId);
    if (!c) {
      missingNames.push(r.name);
      continue;
    }
    const fields: LedgerFieldDiff[] = [];
    const add = (key: string, label: string, appValue: string, ledgerValue: string, appEmpty: boolean, patch: Partial<Candidate>) => {
      if (!ledgerValue || appValue === ledgerValue) return;
      fields.push({ key, label, appValue, ledgerValue, appEmpty, patch });
    };

    add('joiningDate', '入社予定日', c.joiningDate || '', r.joiningDate || '', !c.joiningDate, { joiningDate: r.joiningDate });
    add('baseMonthlySalary', '基本月給', yen(c.baseMonthlySalary), yen(r.baseMonthlySalary), !c.baseMonthlySalary, {
      baseMonthlySalary: r.baseMonthlySalary
    });
    if (r.salaryMonths) {
      add('salaryMonths', '支給月数', c.salaryMonths ? `${salaryMonthsOf(c)}か月` : '', `${r.salaryMonths}か月`, !c.salaryMonths, {
        salaryMonths: r.salaryMonths
      });
    }

    // 賞与保証: the per-payment breakdown when the ledger has it (recorded since 2026-10-01), else
    // the total as a single payment with no month.
    const ledgerInstallments =
      r.bonusGuaranteeInstallments && r.bonusGuaranteeInstallments.length > 0
        ? r.bonusGuaranteeInstallments
        : r.bonusGuaranteeAmount
          ? [{ amount: r.bonusGuaranteeAmount, paymentMonth: '' }]
          : [];
    const appInstallments = c.hasBonusGuarantee ? c.bonusGuaranteeInstallments || [] : [];
    const showInstallments = (list: { amount: number; paymentMonth: string }[]) =>
      list.map((i) => `${yen(i.amount)}${i.paymentMonth ? `(${i.paymentMonth})` : ''}`).join(' / ');
    add('bonusGuarantee', '賞与保証', showInstallments(appInstallments), showInstallments(ledgerInstallments), appInstallments.length === 0, {
      hasBonusGuarantee: true,
      bonusGuaranteeInstallments: ledgerInstallments
    });

    const appSignOn = c.hasSignOnBonus ? c.signOnBonusAmount : undefined;
    add('signOnBonus', 'サインオンボーナス', yen(appSignOn), yen(r.signOnBonusAmount), !appSignOn, {
      hasSignOnBonus: true,
      signOnBonusAmount: r.signOnBonusAmount
    });

    const appResignation = c.resignationNegotiationStatus && c.resignationNegotiationStatus !== 'NOT_STARTED' ? c.resignationNegotiationStatus : '';
    add(
      'resignationNegotiationStatus',
      '退職交渉状況',
      appResignation ? RESIGNATION_LABELS[appResignation] : '',
      r.resignationNegotiationStatus ? RESIGNATION_LABELS[r.resignationNegotiationStatus] || r.resignationNegotiationStatus : '',
      !appResignation,
      { resignationNegotiationStatus: r.resignationNegotiationStatus as Candidate['resignationNegotiationStatus'] }
    );
    const appDinner = c.preJoinDinnerStatus && c.preJoinDinnerStatus !== 'UNPLANNED' ? c.preJoinDinnerStatus : '';
    add(
      'preJoinDinnerStatus',
      '入社前会食',
      appDinner ? DINNER_LABELS[appDinner] : '',
      r.preJoinDinnerStatus ? DINNER_LABELS[r.preJoinDinnerStatus] || r.preJoinDinnerStatus : '',
      !appDinner,
      { preJoinDinnerStatus: r.preJoinDinnerStatus as Candidate['preJoinDinnerStatus'] }
    );
    add('preJoinDinnerDate', '会食日', c.preJoinDinnerDate || '', r.preJoinDinnerDate || '', !c.preJoinDinnerDate, {
      preJoinDinnerDate: r.preJoinDinnerDate
    });
    if (r.onboardingNotes && r.onboardingNotes !== c.onboardingNotes) {
      fields.push({
        key: 'onboardingNotes',
        label: '特記事項メモ',
        appValue: clip(c.onboardingNotes),
        ledgerValue: clip(r.onboardingNotes),
        appEmpty: !c.onboardingNotes?.trim(),
        patch: { onboardingNotes: r.onboardingNotes }
      });
    }

    // Checklist: only items the app has nothing for (unchecked and no note) are filled from the
    // ledger, item by item — a checklist item someone already worked on in the app is left alone.
    if (r.onboardingChecklist && r.onboardingChecklist.length > 0) {
      const appList = c.onboardingChecklist || [];
      const isBlank = (e?: OnboardingChecklistEntry) => !e || (!e.checked && !e.note?.trim());
      const fills = r.onboardingChecklist.filter((le) => isBlank(appList.find((e) => e.id === le.id)));
      if (fills.length > 0) {
        const merged = [...appList.filter((e) => !fills.some((f) => f.id === e.id)), ...fills];
        fields.push({
          key: 'onboardingChecklist',
          label: '入社手続きチェックリスト',
          appValue: '',
          ledgerValue: `${fills.length}項目を補完`,
          appEmpty: true,
          patch: { onboardingChecklist: merged }
        });
      }
    }

    if (fields.length > 0) diffs.push({ candidate: c, ledgerUpdatedAt: r.updatedAt, fields });
  }
  return { diffs, missingNames };
}
