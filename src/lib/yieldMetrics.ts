import { Agency, Candidate, RecruiterYieldSnapshot, AgencyYieldSnapshot, PipelineCandidateSnapshot, YieldMetrics, SelectionPhase } from '../types';

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
        overallYieldRate: 0
      };
    }

    let docPass = 0;
    let firstPass = 0;
    let secondPass = 0;
    let finalPass = 0;
    let offerCount = 0;
    let acceptCount = 0;

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
      overallYieldRate: overallYield
    };
  });
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
  const docPass = agCandidates.filter((c) => c.phase !== 'DOCUMENT_SCREENING').length;
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

  const docPassCount = assigned.filter((c) => c.phase !== 'DOCUMENT_SCREENING').length;
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
