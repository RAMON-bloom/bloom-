import { Agency, Candidate, RecruiterYieldSnapshot, AgencyYieldSnapshot, PipelineCandidateSnapshot, YieldMetrics, PositionYieldGroup, RejectionPhaseCounts, SelectionPhase } from '../types';

// 応募状況ダイジェスト（Chat webhook）でポジション別に見出しを立てる対象。ここに無いポジション
// (EC/BP/ミドル等)はまとめて「その他」グループに入る。
const DIGEST_SPLIT_POSITIONS = ['BCA', 'AIX', 'BRE'];

const PHASE_ORDER: Record<SelectionPhase, number> = {
  'DOCUMENT_SCREENING': 1,
  'CASUAL_INTERVIEW': 2,
  'FIRST_INTERVIEW': 3,
  'SECOND_INTERVIEW': 4,
  'FINAL_INTERVIEW': 5,
  'OFFER_ISSUED': 6,
  'OFFER_ACCEPTED': 7,
  'REJECTED': 0,
  'DECLINED': 0
};

const EMPTY_REJECTED_BY_PHASE: RejectionPhaseCounts = {
  documentScreening: 0,
  casualInterview: 0,
  firstInterview: 0,
  secondInterview: 0,
  finalInterview: 0
};

const REJECTION_PHASE_KEYS: Partial<Record<SelectionPhase, keyof RejectionPhaseCounts>> = {
  DOCUMENT_SCREENING: 'documentScreening',
  CASUAL_INTERVIEW: 'casualInterview',
  FIRST_INTERVIEW: 'firstInterview',
  SECOND_INTERVIEW: 'secondInterview',
  FINAL_INTERVIEW: 'finalInterview'
};

// 候補者が実際に書類選考を通過したかどうか。`c.phase !== 'DOCUMENT_SCREENING'`という単純な比較は
// 見送り(REJECTED)/選考辞退(DECLINED)も「書類選考ではない」ため真になってしまい、書類選考の時点で
// 見送りにした候補者が誤って「書類通過」に数えられてしまうバグの原因だった。評価メモの通過履歴
// (maxPhaseReached、またはDOCUMENT_SCREENINGフェーズでのPASSメモ)を見て判定する。
export function hasPassedDocumentScreening(candidate: Candidate): boolean {
  const maxPhaseReached = Math.max(
    PHASE_ORDER[candidate.phase],
    ...candidate.evaluationNotes.map((n) => PHASE_ORDER[n.phase] || 0)
  );
  return (
    maxPhaseReached >= 2 ||
    candidate.evaluationNotes.some((n) => n.phase === 'DOCUMENT_SCREENING' && n.resultStatus === 'PASS')
  );
}

// 見送り(REJECTED)候補者がどの選考フェーズで見送られたかを推定する。評価メモ保存経由の見送り
// (addEvaluationNoteでresultStatus === 'FAIL'を保存した場合)は、そのメモのphaseが確実な情報源。
// 一方カンバンでの直接ドラッグ(updateCandidatePhase)による見送りは評価メモを経由しないため、
// 直近の評価メモのphase（＝見送り直前にいたフェーズの近似値）、それも無ければ書類選考にフォール
// バックする。
function resolveRejectionPhase(candidate: Candidate): SelectionPhase {
  const failNote = candidate.evaluationNotes.find((n) => n.resultStatus === 'FAIL');
  if (failNote) return failNote.phase;
  if (candidate.evaluationNotes.length > 0) return candidate.evaluationNotes[0].phase;
  return 'DOCUMENT_SCREENING';
}

// Per-agency pass-rate breakdown over whichever candidate set the caller passes in — e.g. the
// dashboard passes its currently period/position-filtered candidates so "エージェント別歩留まり"
// reflects the same scope as the rest of the dashboard, while ATSContext's own `yieldMetrics`
// passes the full candidate list for an always-current, all-time view.
export function computeYieldMetrics(agencies: Agency[], candidates: Candidate[]): YieldMetrics[] {
  return agencies.map((agency) => {
    const agencyCandidates = candidates.filter((c) => c.agencyId === agency.id);
    const total = agencyCandidates.length;

    if (total === 0) {
      return {
        agencyName: agency.name,
        totalApplications: 0,
        documentPassCount: 0,
        firstInterviewPassCount: 0,
        secondInterviewPassCount: 0,
        finalInterviewPassCount: 0,
        offerCount: 0,
        acceptCount: 0,
        documentPassRate: 0,
        firstInterviewPassRate: 0,
        finalInterviewPassRate: 0,
        offerRate: 0,
        acceptRate: 0,
        overallYieldRate: 0,
        rejectedByPhase: { ...EMPTY_REJECTED_BY_PHASE }
      };
    }

    let docPass = 0;
    let firstPass = 0;
    let secondPass = 0;
    let finalPass = 0;
    let offerCount = 0;
    let acceptCount = 0;
    const rejectedByPhase: RejectionPhaseCounts = { ...EMPTY_REJECTED_BY_PHASE };

    agencyCandidates.forEach((c) => {
      const maxPhaseReached = Math.max(
        PHASE_ORDER[c.phase],
        ...c.evaluationNotes.map((n) => PHASE_ORDER[n.phase] || 0)
      );

      if (maxPhaseReached >= 2 || c.evaluationNotes.some((n) => n.phase === 'DOCUMENT_SCREENING' && n.resultStatus === 'PASS')) {
        docPass++;
      }
      if (maxPhaseReached >= 3 || c.evaluationNotes.some((n) => n.phase === 'FIRST_INTERVIEW' && n.resultStatus === 'PASS')) {
        firstPass++;
      }
      if (maxPhaseReached >= 4 || c.evaluationNotes.some((n) => n.phase === 'SECOND_INTERVIEW' && n.resultStatus === 'PASS')) {
        secondPass++;
      }
      if (maxPhaseReached >= 5 || c.evaluationNotes.some((n) => n.phase === 'FINAL_INTERVIEW' && n.resultStatus === 'PASS')) {
        finalPass++;
      }
      if (c.phase === 'OFFER_ISSUED' || c.phase === 'OFFER_ACCEPTED' || maxPhaseReached >= 5) {
        offerCount++;
      }
      if (c.phase === 'OFFER_ACCEPTED') {
        acceptCount++;
      }
      if (c.phase === 'REJECTED') {
        const key = REJECTION_PHASE_KEYS[resolveRejectionPhase(c)] || 'documentScreening';
        rejectedByPhase[key]++;
      }
    });

    const docPassRate = total > 0 ? Math.round((docPass / total) * 100) : 0;
    const firstPassRate = docPass > 0 ? Math.round((firstPass / docPass) * 100) : 0;
    const finalPassRate = secondPass > 0 ? Math.round((finalPass / secondPass) * 100) : 0;
    const offerRate = firstPass > 0 ? Math.round((offerCount / firstPass) * 100) : 0;
    const acceptRate = offerCount > 0 ? Math.round((acceptCount / offerCount) * 100) : 0;
    const overallYield = total > 0 ? Math.round((acceptCount / total) * 100) : 0;

    return {
      agencyName: agency.name,
      totalApplications: total,
      documentPassCount: docPass,
      firstInterviewPassCount: firstPass,
      secondInterviewPassCount: secondPass,
      finalInterviewPassCount: finalPass,
      offerCount,
      acceptCount,
      documentPassRate: docPassRate,
      firstInterviewPassRate: firstPassRate,
      finalInterviewPassRate: finalPassRate,
      offerRate,
      acceptRate,
      overallYieldRate: overallYield,
      rejectedByPhase
    };
  });
}

// 応募状況ダイジェスト向けに、candidatesをBCA/AIX/BREの3ポジション＋「その他」（残り全ポジション
// 合算）に分け、それぞれについてcomputeYieldMetricsと同じエージェント別内訳を計算する。
// jobTitleの一致判定はgetPositionBadge（KanbanView）と同じ完全一致。
export function computeYieldMetricsByPosition(agencies: Agency[], candidates: Candidate[]): PositionYieldGroup[] {
  const groups: PositionYieldGroup[] = DIGEST_SPLIT_POSITIONS.map((positionLabel) => ({
    positionLabel,
    metrics: computeYieldMetrics(agencies, candidates.filter((c) => c.jobTitle === positionLabel))
  }));

  const others = candidates.filter((c) => !DIGEST_SPLIT_POSITIONS.includes(c.jobTitle));
  if (others.length > 0) {
    groups.push({ positionLabel: 'その他', metrics: computeYieldMetrics(agencies, others) });
  }

  return groups;
}

// Mirrors RecruitmentMeetingView's assignedCandidates filter exactly (not archived, still with this
// recruiter, not yet in a terminal phase) — kept in one place so the frozen snapshot and any live
// fallback for the same recruiter never disagree on which candidates count as "in the pipeline".
export function computeRecruiterPipeline(recruiterName: string, candidates: Candidate[]): Candidate[] {
  return candidates.filter(
    (c) =>
      !c.isArchived &&
      c.assignees.includes(recruiterName) &&
      !['OFFER_ACCEPTED', 'REJECTED', 'DECLINED'].includes(c.phase)
  );
}

function toPipelineSnapshot(candidates: Candidate[]): PipelineCandidateSnapshot[] {
  return candidates.map((c) => ({
    id: c.id,
    name: c.name,
    jobTitle: c.jobTitle,
    phase: c.phase,
    avatarUrl: c.avatarUrl
  }));
}

// Exported so a legacy RecruiterYieldSnapshot (saved before pipelineCandidates existed) can have
// just that field patched in without recomputing — and thereby silently overwriting — the rate
// numbers that were already correctly frozen by the older code.
export function computeRecruiterPipelineSnapshot(recruiterName: string, candidates: Candidate[]): PipelineCandidateSnapshot[] {
  return toPipelineSnapshot(computeRecruiterPipeline(recruiterName, candidates));
}

// Mirrors RecruitmentMeetingView's getAgencyStats (MONTH period) exactly, so a frozen snapshot and
// a live fallback calculation for the same recruiter/month never disagree.
function computeAgencyYield(agency: Agency, candidates: Candidate[], meetingMonth: string): AgencyYieldSnapshot {
  const agCandidates = candidates.filter(
    (c) => c.agencyId === agency.id && !!c.appliedDate && c.appliedDate.startsWith(meetingMonth)
  );

  const total = agCandidates.length;
  const docPass = agCandidates.filter(hasPassedDocumentScreening).length;
  const firstPass = agCandidates.filter((c) =>
    ['SECOND_INTERVIEW', 'FINAL_INTERVIEW', 'OFFER_ISSUED', 'OFFER_ACCEPTED'].includes(c.phase)
  ).length;
  const acceptCount = agCandidates.filter((c) => c.phase === 'OFFER_ACCEPTED').length;

  return {
    agencyId: agency.id,
    agencyName: agency.name,
    total,
    docPassRate: total > 0 ? Math.round((docPass / total) * 100) : 0,
    firstPassRate: docPass > 0 ? Math.round((firstPass / docPass) * 100) : 0,
    acceptCount,
    overallYieldRate: total > 0 ? Math.round((acceptCount / total) * 100) : 0
  };
}

// Freezes a recruiter's candidate pass rates and per-agency breakdown as of right now (candidates'
// current phases), for storing on a MeetingLog's RecruiterReport at the moment it's created — so
// re-opening that meeting later shows what was true when it was held, not whatever candidates'
// phases have drifted to since.
export function computeRecruiterYieldSnapshot(
  recruiterName: string,
  candidates: Candidate[],
  agencies: Agency[],
  meetingMonth: string
): RecruiterYieldSnapshot {
  const assigned = candidates.filter((c) => c.assignees.includes(recruiterName));
  const candidateCount = assigned.length;

  const docPassCount = assigned.filter(hasPassedDocumentScreening).length;
  const docPassRate = candidateCount > 0 ? Math.round((docPassCount / candidateCount) * 100) : 0;

  const firstPassCount = assigned.filter((c) =>
    ['SECOND_INTERVIEW', 'FINAL_INTERVIEW', 'OFFER_ISSUED', 'OFFER_ACCEPTED'].includes(c.phase)
  ).length;
  const firstPassRate = docPassCount > 0 ? Math.round((firstPassCount / docPassCount) * 100) : 0;

  const finalOfferCount = assigned.filter((c) =>
    ['FINAL_INTERVIEW', 'OFFER_ISSUED', 'OFFER_ACCEPTED'].includes(c.phase)
  ).length;
  const acceptCount = assigned.filter((c) => c.phase === 'OFFER_ACCEPTED').length;

  const agencyStats = agencies
    .filter((ag) => ag.assignedStaffNames?.includes(recruiterName))
    .map((ag) => computeAgencyYield(ag, candidates, meetingMonth));

  const pipelineCandidates = toPipelineSnapshot(computeRecruiterPipeline(recruiterName, candidates));

  return { candidateCount, docPassRate, firstPassRate, finalOfferCount, acceptCount, agencyStats, pipelineCandidates };
}
