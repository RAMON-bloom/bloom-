import { Agency, Candidate, RecruiterYieldSnapshot, AgencyYieldSnapshot, PipelineCandidateSnapshot } from '../types';

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
