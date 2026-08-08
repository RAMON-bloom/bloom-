import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  Candidate, 
  SelectionPhase, 
  ScheduleStatus, 
  Agency, 
  EvaluationNote, 
  UserRole,
  YieldMetrics,
  InternalStaff,
  PreJoinDinnerStatus,
  ResignationNegotiationStatus,
  MeetingLog
} from '../types';
import { INITIAL_CANDIDATES, INITIAL_AGENCIES, INITIAL_STAFF, INITIAL_MEETING_LOGS } from '../data/mockData';
import { HISTORICAL_MEETING_LOGS } from '../data/historicalMeetingLogs';
import { useAuth } from './AuthContext';
import {
  backupToDrive as backupToDriveApi,
  restoreFromDrive as restoreFromDriveApi,
  moveResumeToPhaseFolder as moveResumeToPhaseFolderApi,
  scanDriveResumes as scanDriveResumesApi,
  importDriveResume as importDriveResumeApi,
  moveResumeToDeletedFolder as moveResumeToDeletedFolderApi
} from '../lib/driveApi';
import { notifyCandidateRegistered as notifyCandidateRegisteredApi } from '../lib/notifyApi';

export type ActiveTab = 'kanban' | 'list' | 'recruitment_meeting' | 'dashboard' | 'onboarding' | 'archived' | 'agency_master';

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
}

interface FilterState {
  searchQuery: string;
  agencyId: string;
  assigneeName: string;
  scheduleStatus: string;
  phase: string;
  appliedMonth: string;
  positions: string[];
}

interface ATSContextType {
  candidates: Candidate[];
  agencies: Agency[];
  staffList: InternalStaff[];
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  selectedCandidateId: string | null;
  setSelectedCandidateId: (id: string | null) => void;
  isAddModalOpen: boolean;
  setIsAddModalOpen: (open: boolean) => void;
  meetingLogs: MeetingLog[];
  addMeetingLog: (log: Omit<MeetingLog, 'id'>) => string;
  updateMeetingLog: (log: MeetingLog) => void;
  deleteMeetingLog: (id: string) => void;
  importHistoricalMeetingLogs: () => number;
  
  // Actions
  updateCandidatePhase: (candidateId: string, newPhase: SelectionPhase) => void;
  updateCandidateSchedule: (
    candidateId: string,
    scheduleStatus: ScheduleStatus,
    nextDate?: string,
    nextInterviewers?: string[]
  ) => void;
  updateOnboardingInfo: (
    candidateId: string,
    info: {
      joiningDate?: string;
      preJoinDinnerStatus?: PreJoinDinnerStatus;
      preJoinDinnerDate?: string;
      resignationNegotiationStatus?: ResignationNegotiationStatus;
      onboardingNotes?: string;
    }
  ) => void;
  addEvaluationNote: (candidateId: string, note: Omit<EvaluationNote, 'id' | 'createdAt'>) => void;
  updateEvaluationNote: (candidateId: string, noteId: string, note: Omit<EvaluationNote, 'id' | 'createdAt'>) => void;
  deleteEvaluationNote: (candidateId: string, noteId: string) => void;
  addCandidate: (candidateData: Omit<Candidate, 'id' | 'lastUpdated' | 'evaluationNotes' | 'appliedMonth'>) => void;
  updateCandidate: (updatedCandidate: Candidate) => void;
  deleteCandidate: (id: string) => void;
  restoreCandidate: (id: string) => void;
  permanentlyDeleteCandidate: (id: string) => Promise<boolean>;
  
  // Agency Actions
  addAgency: (agency: Omit<Agency, 'id'>) => void;
  updateAgency: (agency: Agency) => void;
  deleteAgency: (id: string) => void;
  toggleAgencyActive: (id: string) => void;

  // Staff Actions
  addStaff: (staffData: Omit<InternalStaff, 'id'>) => void;
  deleteStaff: (id: string) => void;
  updateStaff: (staff: InternalStaff) => void;
  
  // Utils & Yields
  yieldMetrics: YieldMetrics[];
  filteredCandidates: Candidate[];
  archivedCandidates: Candidate[];
  toasts: Toast[];
  showToast: (message: string, type?: 'info' | 'success' | 'warning') => void;
  resetToDefaultData: () => void;
  exportCSV: () => void;

  // Google Drive Integration
  driveAccessToken: string | null;
  driveUserEmail: string | null;
  isDriveConnecting: boolean;
  connectDrive: () => Promise<void>;
  disconnectDrive: () => Promise<void>;
  backupToDrive: () => Promise<void>;
  restoreFromDrive: () => Promise<void>;
  isSyncingDrive: boolean;
  syncWithDrive: () => Promise<void>;
}

const ATSContext = createContext<ATSContextType | undefined>(undefined);

const PHASE_ORDER: Record<SelectionPhase, number> = {
  'DOCUMENT_SCREENING': 1,
  'CASUAL_INTERVIEW': 2,
  'FIRST_INTERVIEW': 3,
  'SECOND_INTERVIEW': 4,
  'FINAL_INTERVIEW': 5,
  'OFFER_ISSUED': 6,
  'OFFER_ACCEPTED': 7,
  'REJECTED_DECLINED': 0
};

export const ATSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [candidates, setCandidates] = useState<Candidate[]>(() => {
    const saved = localStorage.getItem('ats_candidates');
    return saved ? JSON.parse(saved) : INITIAL_CANDIDATES;
  });

  const [agencies, setAgencies] = useState<Agency[]>(() => {
    const saved = localStorage.getItem('ats_agencies');
    return saved ? JSON.parse(saved) : INITIAL_AGENCIES;
  });

  const [staffList, setStaffList] = useState<InternalStaff[]>(() => {
    const saved = localStorage.getItem('ats_staff_list');
    return saved ? JSON.parse(saved) : INITIAL_STAFF;
  });

  const [meetingLogs, setMeetingLogs] = useState<MeetingLog[]>(() => {
    const saved = localStorage.getItem('ats_meeting_logs');
    return saved ? JSON.parse(saved) : INITIAL_MEETING_LOGS;
  });

  // Every Drive item id (folder/file) permanentlyDeleteCandidate has ever deleted — checked by
  // syncWithDrive so it never re-imports something we ourselves just deleted as if it were a
  // brand-new unregistered resume. Needed because Drive's own file-list index can lag a few
  // seconds behind a delete, and because deletion can leave residue for reasons outside this
  // app's control — either way, "I explicitly deleted this" should always win over "sync found
  // an orphan," regardless of why the orphan is still there. Grows without pruning; at realistic
  // candidate volumes this stays tiny (a few KB of ids) for years.
  const [deletedDriveItemIds, setDeletedDriveItemIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('ats_deleted_drive_item_ids');
    return saved ? JSON.parse(saved) : [];
  });

  // AuthGate already requires a signed-in bloom-firm.com Google account (Drive-scoped) before
  // this provider ever renders, so the Drive token/email are sourced straight from that session
  // rather than tracked as separate state here.
  const { email: driveUserEmail, accessToken: driveAccessToken, signIn: authSignIn, signOut: authSignOut } = useAuth();
  const [isDriveConnecting, setIsDriveConnecting] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);

  const [userRole, setUserRole] = useState<UserRole>('ADMIN');
  const [activeTab, setActiveTab] = useState<ActiveTab>('kanban');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextCandidateIdNumRef = useRef<number>(0);
  const toastIdCounterRef = useRef<number>(0);

  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    agencyId: 'ALL',
    assigneeName: 'ALL',
    scheduleStatus: 'ALL',
    phase: 'ALL',
    appliedMonth: 'ALL',
    positions: []
  });

  // Save to localStorage on state changes
  useEffect(() => {
    localStorage.setItem('ats_candidates', JSON.stringify(candidates));
  }, [candidates]);

  useEffect(() => {
    localStorage.setItem('ats_agencies', JSON.stringify(agencies));
  }, [agencies]);

  useEffect(() => {
    localStorage.setItem('ats_staff_list', JSON.stringify(staffList));
  }, [staffList]);

  useEffect(() => {
    localStorage.setItem('ats_meeting_logs', JSON.stringify(meetingLogs));
  }, [meetingLogs]);

  useEffect(() => {
    localStorage.setItem('ats_deleted_drive_item_ids', JSON.stringify(deletedDriveItemIds));
  }, [deletedDriveItemIds]);

  // Always-fresh snapshot of everything backupToDrive bundles together, read from inside the
  // debounced timeout below rather than captured in its closure — by the time the timeout fires,
  // candidates/agencies/staffList may have moved on from whatever they were when the meetingLogs
  // change that scheduled it happened, and the Drive backup should reflect the latest, not a
  // slightly-stale snapshot from several seconds earlier.
  const latestBackupStateRef = useRef({ candidates, agencies, staffList, meetingLogs });
  useEffect(() => {
    latestBackupStateRef.current = { candidates, agencies, staffList, meetingLogs };
  });

  // Auto-backs-up to Drive a few seconds after MTG logs, agencies, or staff stop changing, so
  // none of these only reach the team's shared Drive copy if someone remembers to click
  //「Driveにバックアップ」afterward. Originally scoped to meetingLogs only; agencies/staffList were
  // added because their edits previously never triggered a Drive write at all (not even
  // debounced) — a user could add/edit an agency or 採用担当者 and it would sit only in their own
  // browser's localStorage until someone happened to touch a meeting log or click the manual
  // backup button. candidates deliberately stays out of this dependency list (changes far more
  // often — every phase drag, every field edit — which would defeat the point of debouncing), but
  // since the backup file is one shared JSON blob rather than per-domain, each write still carries
  // the current candidates along for free. Skips the very first run (mount/initial hydration,
  // including the auto-restore below populating these from Drive, is not a "change" worth writing
  // straight back), and only failures get a toast — success is meant to be invisible, matching
  // what "automatic" implies.
  const autoBackupMountedRef = useRef(false);
  const autoBackupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!autoBackupMountedRef.current) {
      autoBackupMountedRef.current = true;
      return;
    }
    if (!driveAccessToken) return;

    if (autoBackupTimerRef.current) clearTimeout(autoBackupTimerRef.current);
    autoBackupTimerRef.current = setTimeout(() => {
      backupToDriveApi(driveAccessToken, latestBackupStateRef.current).catch((err: any) => {
        showToast(`Driveへの自動バックアップに失敗しました: ${err.message || '不明なエラー'}`, 'warning');
      });
    }, 5000);

    return () => {
      if (autoBackupTimerRef.current) clearTimeout(autoBackupTimerRef.current);
    };
  }, [agencies, staffList, meetingLogs, driveAccessToken]);

  // Auto-restores from Drive once per login. Without this, candidates/agencies/staffList/
  // meetingLogs were seeded purely from this browser's own localStorage (or, on a brand-new
  // browser, this app's built-in demo data — dummy agencies, a dummy 山田太郎 etc.) and stayed
  // that way until someone remembered to open the Drive menu and click「Driveから復元」— so a new
  // teammate's first login showed fake data, and a returning teammate's browser could silently
  // drift out of sync with whatever anyone else had since backed up. Runs restoreFromDrive with
  // {silent: true} (no success toast; a "nothing backed up yet" 404 — the very first time anyone
  // on the team ever signs in — is treated as a no-op, not a scary warning). Guarded by a ref
  // rather than depending on identity/mount timing, so a background token refresh later in the
  // session (AuthGate re-fires driveAccessToken on a schedule) doesn't re-trigger this and
  // overwrite whatever's been edited locally since login.
  const hasAutoRestoredRef = useRef(false);
  useEffect(() => {
    if (!driveAccessToken || hasAutoRestoredRef.current) return;
    hasAutoRestoredRef.current = true;
    restoreFromDrive({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveAccessToken]);

  const addMeetingLog = (newLogData: Omit<MeetingLog, 'id'>) => {
    const id = `mtg-${Date.now()}`;
    const newLog: MeetingLog = { ...newLogData, id };
    setMeetingLogs((prev) => [newLog, ...prev]);
    showToast(`MTGログ 「${newLog.title}」 を保存・追加しました`, 'success');
    return id;
  };

  const updateMeetingLog = (updatedLog: MeetingLog) => {
    setMeetingLogs((prev) => prev.map((m) => (m.id === updatedLog.id ? updatedLog : m)));
    showToast(`MTGログを更新しました`, 'info');
  };

  const deleteMeetingLog = (id: string) => {
    const target = meetingLogs.find((m) => m.id === id);
    setMeetingLogs((prev) => prev.filter((m) => m.id !== id));
    showToast(`MTGログ 「${target?.title || ''}」 を削除しました`, 'info');
  };

  // One-time backfill for the pre-app 採用社内MTG history (see src/data/historicalMeetingLogs.ts).
  // Keyed by id rather than a single "already imported" flag so it stays safe to click again —
  // e.g. after a manual edit accidentally removed one of the historical entries — without ever
  // duplicating the ones already present. Purely local (localStorage); the user still has to use
  // "Driveにバックアップ" themselves to make these part of the shared team data, same as any other
  // local change, since nothing here should silently overwrite whatever the team's Drive backup
  // currently holds.
  const importHistoricalMeetingLogs = (): number => {
    const existingIds = new Set(meetingLogs.map((m) => m.id));
    const missing = HISTORICAL_MEETING_LOGS.filter((m) => !existingIds.has(m.id));
    if (missing.length === 0) {
      showToast('過去の議事録はすでにすべて取り込み済みです', 'info');
      return 0;
    }
    setMeetingLogs((prev) => [...prev, ...missing].sort((a, b) => (a.date < b.date ? 1 : -1)));
    showToast(`過去の採用社内MTG議事録を${missing.length}件取り込みました。反映するには「Driveにバックアップ」を実行してください`, 'success');
    return missing.length;
  };

  const showToast = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    // Date.now() alone collides when two toasts fire in the same millisecond (e.g. a save that
    // triggers more than one showToast call back-to-back), which duplicates React list keys and
    // can make one of the toasts disappear early. The counter suffix guarantees uniqueness.
    toastIdCounterRef.current += 1;
    const id = `${Date.now()}-${toastIdCounterRef.current}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  // Fire-and-forget: moves the candidate's whole Drive folder (resume, CV, anything else in it)
  // into the folder matching their new phase. Prefers the per-candidate folder; falls back to
  // moving the bare resume file for legacy candidates registered before that folder existed.
  // Silently no-ops if Drive isn't connected or the resume was never uploaded to Drive at all.
  const moveResumeFolderIfNeeded = (candidate: Candidate, newPhase: SelectionPhase) => {
    const driveItemId = candidate.resumeDriveFolderId || candidate.resumeDriveFileId;
    if (!driveAccessToken || !driveItemId || candidate.phase === newPhase) return;
    moveResumeToPhaseFolderApi(driveAccessToken, driveItemId, newPhase).catch((err: any) => {
      showToast(`${candidate.name} さんの履歴書のDriveフォルダ移動に失敗しました: ${err.message || '不明なエラー'}`, 'warning');
    });
  };

  const updateCandidatePhase = (candidateId: string, newPhase: SelectionPhase) => {
    const target = candidates.find((c) => c.id === candidateId);
    if (target) moveResumeFolderIfNeeded(target, newPhase);

    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === candidateId) {
          const phaseNames: Record<SelectionPhase, string> = {
            DOCUMENT_SCREENING: '書類選考',
            CASUAL_INTERVIEW: 'カジュアル面談',
            FIRST_INTERVIEW: '1次面接',
            SECOND_INTERVIEW: '2次面接',
            FINAL_INTERVIEW: '最終面接',
            OFFER_ISSUED: '内定通知',
            OFFER_ACCEPTED: '内定承諾',
            REJECTED_DECLINED: '不採用・辞退'
          };
          showToast(`${c.name} さんのフェーズを「${phaseNames[newPhase]}」に変更しました`, 'success');
          return {
            ...c,
            phase: newPhase,
            lastUpdated: new Date().toISOString().split('T')[0]
          };
        }
        return c;
      })
    );
  };

  const updateCandidateSchedule = (
    candidateId: string,
    scheduleStatus: ScheduleStatus,
    nextDate?: string,
    nextInterviewers?: string[]
  ) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === candidateId) {
          showToast(`${c.name} さんの次回調整状況を更新しました`, 'info');
          return {
            ...c,
            scheduleStatus,
            nextScheduleDate: nextDate !== undefined ? nextDate : c.nextScheduleDate,
            nextInterviewers: nextInterviewers !== undefined ? nextInterviewers : c.nextInterviewers,
            lastUpdated: new Date().toISOString().split('T')[0]
          };
        }
        return c;
      })
    );
  };

  const updateOnboardingInfo = (
    candidateId: string,
    info: {
      joiningDate?: string;
      preJoinDinnerStatus?: PreJoinDinnerStatus;
      preJoinDinnerDate?: string;
      resignationNegotiationStatus?: ResignationNegotiationStatus;
      onboardingNotes?: string;
    }
  ) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === candidateId) {
          showToast(`${c.name} さんの入社予定・フォロー情報を更新しました`, 'success');
          return {
            ...c,
            ...info,
            lastUpdated: new Date().toISOString().split('T')[0]
          };
        }
        return c;
      })
    );
  };

  const addEvaluationNote = (candidateId: string, noteData: Omit<EvaluationNote, 'id' | 'createdAt'>) => {
    const newNote: EvaluationNote = {
      ...noteData,
      id: `eval-${Date.now()}`,
      createdAt: new Date().toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })
    };

    if (noteData.resultStatus === 'FAIL') {
      const target = candidates.find((c) => c.id === candidateId);
      if (target) moveResumeFolderIfNeeded(target, 'REJECTED_DECLINED' as SelectionPhase);
    }

    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === candidateId) {
          showToast(`評価メモを登録しました`, 'success');
          return {
            ...c,
            evaluationNotes: [newNote, ...c.evaluationNotes],
            ...(noteData.interviewRating ? { interviewRating: noteData.interviewRating } : {}),
            ...(noteData.bcaDesiredDepartment !== undefined ? { bcaDesiredDepartment: noteData.bcaDesiredDepartment } : {}),
            ...(noteData.lRating !== undefined ? { lRating: noteData.lRating } : {}),
            ...(noteData.cRating !== undefined ? { cRating: noteData.cRating } : {}),
            ...(noteData.mRating !== undefined ? { mRating: noteData.mRating } : {}),
            ...(noteData.lNote !== undefined ? { lNote: noteData.lNote } : {}),
            ...(noteData.cNote !== undefined ? { cNote: noteData.cNote } : {}),
            ...(noteData.mNote !== undefined ? { mNote: noteData.mNote } : {}),
            ...(noteData.resultStatus === 'FAIL' ? { phase: 'REJECTED_DECLINED' as SelectionPhase } : {}),
            lastUpdated: new Date().toISOString().split('T')[0]
          };
        }
        return c;
      })
    );
  };

  // Edits an existing note in place (keeps its id/createdAt/position in the list). The candidate's
  // rollup fields (interviewRating, L/C/M, etc.) always re-sync to whatever is now the first note
  // in the array — same "most recent note wins" rule addEvaluationNote uses — so editing the
  // current top note updates the rollup, and editing an older one leaves it alone. Unlike adding,
  // this fully overwrites the rollup (including clearing it to undefined) since an explicit edit
  // is the user correcting the record, not just adding to it.
  const updateEvaluationNote = (candidateId: string, noteId: string, noteData: Omit<EvaluationNote, 'id' | 'createdAt'>) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== candidateId) return c;
        // Full replacement (not a merge) — noteData is meant to be the note's complete new state,
        // same as when it's first created by addEvaluationNote. Merging with the old note would
        // leave any field the caller omitted (e.g. a cleared goodPoints/concerns/otherNotes) stuck
        // at its stale pre-edit value instead of actually being cleared.
        const updatedNotes = c.evaluationNotes.map((n) => (n.id === noteId ? { ...noteData, id: n.id, createdAt: n.createdAt } : n));
        const latest = updatedNotes[0];
        showToast('評価メモを更新しました', 'success');
        return {
          ...c,
          evaluationNotes: updatedNotes,
          interviewRating: latest?.interviewRating,
          bcaDesiredDepartment: latest?.bcaDesiredDepartment,
          lRating: latest?.lRating,
          cRating: latest?.cRating,
          mRating: latest?.mRating,
          lNote: latest?.lNote,
          cNote: latest?.cNote,
          mNote: latest?.mNote,
          lastUpdated: new Date().toISOString().split('T')[0]
        };
      })
    );
  };

  const deleteEvaluationNote = (candidateId: string, noteId: string) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== candidateId) return c;
        const updatedNotes = c.evaluationNotes.filter((n) => n.id !== noteId);
        const latest = updatedNotes[0];
        showToast('評価メモを削除しました', 'info');
        return {
          ...c,
          evaluationNotes: updatedNotes,
          interviewRating: latest?.interviewRating,
          bcaDesiredDepartment: latest?.bcaDesiredDepartment,
          lRating: latest?.lRating,
          cRating: latest?.cRating,
          mRating: latest?.mRating,
          lNote: latest?.lNote,
          cNote: latest?.cNote,
          mNote: latest?.mNote,
          lastUpdated: new Date().toISOString().split('T')[0]
        };
      })
    );
  };

  const addCandidate = (candidateData: Omit<Candidate, 'id' | 'lastUpdated' | 'evaluationNotes' | 'appliedMonth'>) => {
    const appliedMonth = candidateData.appliedDate ? candidateData.appliedDate.substring(0, 7) : new Date().toISOString().substring(0, 7);

    // The candidate (including its ID) is built fully before touching state, then read
    // synchronously for the toast — setCandidates' updater callback is not guaranteed to run
    // synchronously, so a value only assigned inside it isn't safe to read right after the call
    // (this used to throw "Cannot read properties of undefined (reading 'name')" here and abort
    // the caller mid-function, which is why the registration modal sometimes failed to close).
    // The ref-backed counter (rather than reading `candidates.length` directly) still guarantees
    // unique IDs when addCandidate is called multiple times back-to-back in the same tick — e.g.
    // importing several unregistered Drive resumes in a loop.
    // The floor must be the highest CAND-#### number currently in use, not just the live count:
    // permanently deleting a candidate shrinks candidates.length without freeing up its number for
    // reuse by anyone still on the list, so on a fresh page load (ref reset to 0) `candidates.length`
    // could fall below another still-existing candidate's number and collide with it — two candidates
    // sharing one id, where deleting either one deletes both (since delete/permanentlyDelete filter
    // by id match, which then matches both records).
    const maxExistingIdNum = candidates.reduce((max, c) => {
      const num = parseInt(c.id.replace('CAND-', ''), 10);
      return Number.isNaN(num) ? max : Math.max(max, num);
    }, 0);
    nextCandidateIdNumRef.current = Math.max(maxExistingIdNum, nextCandidateIdNumRef.current) + 1;
    const newCandidate: Candidate = {
      ...candidateData,
      id: `CAND-${String(nextCandidateIdNumRef.current).padStart(4, '0')}`,
      appliedMonth,
      evaluationNotes: [],
      lastUpdated: new Date().toISOString().split('T')[0]
    };
    setCandidates((prev) => [newCandidate, ...prev]);
    showToast(`候補者 「${newCandidate.name}」（${newCandidate.id}） を新規登録しました`, 'success');

    // Best-effort Google Chat notification to whoever is actually handling 書類選考 — the main
    // assignee by default, or the separately-chosen documentScreeningAssignee when the registration
    // form's "弊社主担当者が書類選考も実施する" checkbox was unchecked. Only for candidates starting
    // out in 書類選考 (every brand-new registration from the form does; a Drive-import discovered
    // sitting in a later phase folder does not, and shouldn't ping anyone as if they were just
    // freshly assigned document screening). Silently skipped if that staff member hasn't registered
    // a Chat webhook in the担当者マスタ yet — this is a convenience notice, not a required step, so
    // it must never block or fail candidate registration itself.
    const docScreeningAssigneeName = newCandidate.documentScreeningAssignee || newCandidate.assignees[0];
    if (newCandidate.phase === 'DOCUMENT_SCREENING' && docScreeningAssigneeName) {
      const assigneeName = docScreeningAssigneeName;
      const assignee = staffList.find((s) => s.name === assigneeName);
      if (assignee?.googleChatWebhookUrl) {
        notifyCandidateRegisteredApi({
          webhookUrl: assignee.googleChatWebhookUrl,
          staffName: assigneeName,
          candidateName: newCandidate.name,
          candidateId: newCandidate.id
        }).catch((err) => {
          console.error('Candidate-registered Chat notify failed:', err);
          showToast(`${assigneeName} さんへのChat通知の送信に失敗しました: ${err.message || '不明なエラー'}`, 'warning');
        });
      }
    }
  };

  const updateCandidate = (updatedCandidate: Candidate) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === updatedCandidate.id ? { ...updatedCandidate, lastUpdated: new Date().toISOString().split('T')[0] } : c))
    );
    showToast(`${updatedCandidate.name} さんの情報を更新しました`, 'success');
  };

  const deleteCandidate = (id: string) => {
    const candidate = candidates.find((c) => c.id === id);
    const deletedTime = new Date().toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' });
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              isArchived: true,
              deletedAt: deletedTime,
              lastUpdated: new Date().toISOString().split('T')[0]
            }
          : c
      )
    );
    if (selectedCandidateId === id) setSelectedCandidateId(null);
    showToast(`候補者 「${candidate?.name || ''}」 を過去候補者一覧に保存・登録しました`, 'info');
  };

  const restoreCandidate = (id: string) => {
    const candidate = candidates.find((c) => c.id === id);
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              isArchived: false,
              deletedAt: undefined,
              lastUpdated: new Date().toISOString().split('T')[0]
            }
          : c
      )
    );
    showToast(`候補者 「${candidate?.name || ''}」 を現行の選考一覧に復元しました`, 'success');
  };

  // Unlike deleteCandidate (which archives, kept recoverable), this removes the record from
  // state entirely — for candidates registered by mistake that shouldn't linger even in the
  // archive. Only meaningful from the archive view, so it doesn't touch selectedCandidateId.
  //
  // Doesn't actually delete the candidate's Drive data — moves every Drive item on record (the
  // per-candidate folder if any, the legacy bare resume file kept separate when it predates that
  // folder, and any document ids tracked individually — a Set instead of
  // `resumeDriveFolderId || resumeDriveFileId` so a candidate whose files ended up split across
  // more than one location doesn't leave the un-chosen half behind) into a dedicated 削除済み
  // folder instead. A real Drive delete used to live here, but scan-resumes.ts (powering
  // 「Driveと同期」) can't tell "we just deleted this" from "this is a genuinely new unregistered
  // resume" — Drive's own list index lagging a few seconds behind the delete, or any other reason
  // residue is still there, was enough for a synced-shortly-after-deleting candidate to come right
  // back as a "new" one. Moving it into 99_完全削除済み (outside every folder scan-resumes.ts
  // walks) rules that out structurally instead of relying on timing. Trade-off: the candidate's
  // resume data stays on Drive indefinitely rather than actually being purged.
  // Awaits every Drive move before touching local state — if any of them fail, the candidate
  // record is kept in the archive (not silently discarded) so the failure is visible and the user
  // can retry, instead of the app losing its only handle on the leftover Drive data.
  const permanentlyDeleteCandidate = async (id: string): Promise<boolean> => {
    const candidate = candidates.find((c) => c.id === id);
    const driveItemIds = new Set<string>();
    if (candidate?.resumeDriveFolderId) driveItemIds.add(candidate.resumeDriveFolderId);
    if (candidate?.resumeDriveFileId) driveItemIds.add(candidate.resumeDriveFileId);
    (candidate?.resumeDocuments || []).forEach((doc) => {
      if (doc.driveFileId) driveItemIds.add(doc.driveFileId);
    });

    if (driveItemIds.size > 0) {
      // Drive未接続（トークン切れ・サイレント再ログイン未完了などで一時的にnullの場合を含む）だと
      // このガードがないままDrive側の移動処理をまるごとスキップして下のsetCandidatesに進んでしまい、
      // Drive上のフォルダ・ファイルがフェーズフォルダに残ったまま候補者だけローカルから消えていた。
      // その後「Driveと同期」を実行すると、誰も参照しなくなったそのDrive残骸が「未登録の履歴書」と
      // して検出され、削除したはずの候補者がそのまま新規候補者として復活してしまう（アプリ⇔Drive
      // 移動失敗時と同じ扱いにして、未接続なら候補者データを過去候補者一覧に残し、Drive再接続後の
      // 再実行に委ねる）。
      if (!driveAccessToken) {
        showToast(
          `${candidate?.name || ''} さんはDriveにデータが残っていますが、Drive未接続のため削除できませんでした（候補者データはまだ削除していません）。Googleでログインし直してから再度お試しください。`,
          'warning'
        );
        return false;
      }
      const results = await Promise.allSettled(
        Array.from(driveItemIds).map((itemId) => moveResumeToDeletedFolderApi(driveAccessToken, itemId))
      );
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed.length > 0) {
        const reasons = failed.map((r) => r.reason?.message || '不明なエラー').join(' / ');
        showToast(
          `${candidate?.name || ''} さんのDriveデータの整理に失敗したため、候補者データはまだ削除していません（過去候補者一覧に残っています）。時間を置いて再度お試しください: ${reasons}`,
          'warning'
        );
        return false;
      }
    }

    // Belt-and-suspenders on top of the move above: recorded even when driveItemIds was empty
    // (nothing to add) or the items were already gone, harmless either way. Covers edge cases the
    // move alone doesn't — e.g. someone manually drags the folder back into a phase folder later.
    if (driveItemIds.size > 0) {
      setDeletedDriveItemIds((prev) => Array.from(new Set([...prev, ...driveItemIds])));
    }

    setCandidates((prev) => prev.filter((c) => c.id !== id));
    showToast(`候補者 「${candidate?.name || ''}」 を完全に削除しました`, 'info');
    return true;
  };

  // Agency Master actions
  const addAgency = (agencyData: Omit<Agency, 'id'>) => {
    const newAgency: Agency = {
      ...agencyData,
      id: `ag-${Date.now()}`
    };
    setAgencies((prev) => [...prev, newAgency]);
    showToast(`エージェント 「${newAgency.name}」 を追加しました`, 'success');
  };

  const updateAgency = (agency: Agency) => {
    const oldAgency = agencies.find((a) => a.id === agency.id);
    const oldName = oldAgency?.name;
    const newName = agency.name;

    setAgencies((prev) => prev.map((a) => (a.id === agency.id ? agency : a)));

    // Reflect name change in candidates table
    if (oldName && oldName !== newName) {
      setCandidates((prev) =>
        prev.map((c) => (c.agencyId === agency.id ? { ...c, agencyName: newName } : c))
      );
    }
    showToast(`エージェント 「${agency.name}」 の情報を更新し、候補者情報に反映しました`, 'info');
  };

  const deleteAgency = (id: string) => {
    const agency = agencies.find((a) => a.id === id);
    if (!agency) return;

    setAgencies((prev) => prev.filter((a) => a.id !== id));

    // Update candidates associated with deleted agency
    setCandidates((prev) =>
      prev.map((c) =>
        c.agencyId === id ? { ...c, agencyName: `${c.agencyName} (削除済)` } : c
      )
    );
    showToast(`エージェント 「${agency.name}」 を削除しました`, 'warning');
  };

  const toggleAgencyActive = (id: string) => {
    setAgencies((prev) =>
      prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a))
    );
  };

  // Staff Actions
  const addStaff = (staffData: Omit<InternalStaff, 'id'>) => {
    const newStaff: InternalStaff = {
      ...staffData,
      id: `st-${Date.now()}`
    };
    setStaffList((prev) => [...prev, newStaff]);
    showToast(`採用担当者 「${newStaff.name}」 を追加しました`, 'success');
  };

  const deleteStaff = (id: string) => {
    const staff = staffList.find((s) => s.id === id);
    if (!staff) return;
    const staffName = staff.name;

    setStaffList((prev) => prev.filter((s) => s.id !== id));

    // Remove staffName from candidates' assignees & nextInterviewers
    setCandidates((prev) =>
      prev.map((c) => ({
        ...c,
        assignees: c.assignees.filter((n) => n !== staffName),
        nextInterviewers: c.nextInterviewers?.filter((n) => n !== staffName)
      }))
    );

    // Remove staffName from agencies' assignedStaffNames
    setAgencies((prev) =>
      prev.map((a) => ({
        ...a,
        assignedStaffNames: a.assignedStaffNames
          ? a.assignedStaffNames.filter((n) => n !== staffName)
          : []
      }))
    );

    showToast(`採用担当者 「${staff.name}」 を削除しました`, 'warning');
  };

  const updateStaff = (updatedStaff: InternalStaff) => {
    const oldStaff = staffList.find((s) => s.id === updatedStaff.id);
    const oldName = oldStaff?.name;
    const newName = updatedStaff.name;

    setStaffList((prev) => prev.map((s) => (s.id === updatedStaff.id ? updatedStaff : s)));

    if (oldName && oldName !== newName) {
      // 1. Update candidate assignees, evaluation notes, and next interviewers
      setCandidates((prev) =>
        prev.map((c) => {
          const newAssignees = c.assignees.map((a) => (a === oldName ? newName : a));
          const newNextInterviewers = c.nextInterviewers?.map((i) => (i === oldName ? newName : i));
          const newEvaluationNotes = c.evaluationNotes.map((note) => {
            const author = note.author === oldName ? newName : note.author;
            const interviewers = note.interviewers?.map((i) => (i === oldName ? newName : i));
            return { ...note, author, interviewers };
          });

          return {
            ...c,
            assignees: newAssignees,
            nextInterviewers: newNextInterviewers,
            evaluationNotes: newEvaluationNotes
          };
        })
      );

      // 2. Update agencies' assignedStaffNames
      setAgencies((prev) =>
        prev.map((a) => {
          if (!a.assignedStaffNames) return a;
          const updatedNames = a.assignedStaffNames.map((n) => (n === oldName ? newName : n));
          return { ...a, assignedStaffNames: updatedNames };
        })
      );

      // 3. Update meetingLogs attendees, recruiterReports, and actionItems
      setMeetingLogs((prev) =>
        prev.map((log) => {
          const newAttendees = log.attendees.map((att) => (att === oldName ? newName : att));
          const newReports = log.recruiterReports.map((r) =>
            r.recruiterName === oldName ? { ...r, recruiterName: newName } : r
          );
          const newActionItems = log.actionItems.map((item) =>
            item.assignee === oldName ? { ...item, assignee: newName } : item
          );
          return {
            ...log,
            attendees: newAttendees,
            recruiterReports: newReports,
            actionItems: newActionItems
          };
        })
      );
    }

    showToast(`採用担当者 「${updatedStaff.name}」 の情報を更新し、全選考状況に反映しました`, 'info');
  };

  const resetToDefaultData = () => {
    setCandidates(INITIAL_CANDIDATES);
    setAgencies(INITIAL_AGENCIES);
    setStaffList(INITIAL_STAFF);
    setMeetingLogs(INITIAL_MEETING_LOGS);
    localStorage.removeItem('ats_candidates');
    localStorage.removeItem('ats_agencies');
    localStorage.removeItem('ats_staff_list');
    localStorage.removeItem('ats_meeting_logs');
    showToast('初期サンプルデータにリセットしました', 'info');
  };

  // Google Drive Integration — re-runs the same login used to enter the app, e.g. after the
  // access token has expired and the background silent refresh in AuthGate couldn't restore it.
  const connectDrive = async () => {
    setIsDriveConnecting(true);
    try {
      await authSignIn();
      showToast('Google Drive に再接続しました', 'success');
    } catch (err: any) {
      showToast(`Drive連携に失敗しました: ${err.message || '不明なエラー'}`, 'warning');
    } finally {
      setIsDriveConnecting(false);
    }
  };

  // Drive access is the same session as the app login, so disconnecting signs out of the app.
  const disconnectDrive = async () => {
    authSignOut();
    showToast('ログアウトしました', 'info');
  };

  const backupToDrive = async () => {
    if (!driveAccessToken) {
      showToast('先にGoogle Driveへログインしてください', 'warning');
      return;
    }
    try {
      await backupToDriveApi(driveAccessToken, {
        candidates,
        agencies,
        staffList,
        meetingLogs
      });
      showToast('候補者・エージェント・MTGログをDriveにバックアップしました', 'success');
    } catch (err: any) {
      showToast(`Driveバックアップに失敗しました: ${err.message || '不明なエラー'}`, 'warning');
    }
  };

  // `silent` is used by the auto-restore-on-login effect below: no success toast (that effect is
  // meant to be invisible when it just works, same rationale as the auto-backup effect), and a
  // "not backed up yet" 404 — completely normal the very first time anyone on the team ever
  // signs in, before any backup exists — is treated as a no-op rather than a scary warning toast
  // on every single login. Any other failure (auth/network/etc.) still surfaces normally, silent
  // or not, since that's a real problem the user should know about.
  const restoreFromDrive = async (options: { silent?: boolean } = {}) => {
    if (!driveAccessToken) {
      if (!options.silent) showToast('先にGoogle Driveへログインしてください', 'warning');
      return;
    }
    try {
      const data = await restoreFromDriveApi(driveAccessToken);
      if (data.candidates) setCandidates(data.candidates);
      if (data.agencies) setAgencies(data.agencies);
      if (data.staffList) setStaffList(data.staffList);
      if (data.meetingLogs) setMeetingLogs(data.meetingLogs);
      if (!options.silent) showToast('Driveのバックアップからデータを復元しました', 'success');
    } catch (err: any) {
      const notBackedUpYet = String(err.message || '').includes('見つかりませんでした');
      if (options.silent && notBackedUpYet) return;
      showToast(`Driveからの復元に失敗しました: ${err.message || '不明なエラー'}`, 'warning');
    }
  };

  // Reconciles the app with whatever is actually sitting in Drive right now — for candidates
  // whose resume was dragged into a different phase folder by hand, and for resume files that
  // were added directly to a phase folder and were never registered as a candidate at all.
  const syncWithDrive = async () => {
    if (!driveAccessToken) {
      showToast('先にGoogle Driveへログインしてください', 'warning');
      return;
    }
    setIsSyncingDrive(true);
    try {
      const entries = await scanDriveResumesApi(driveAccessToken);
      // A candidate folder normally holds several files (resume, CV, ...) — key by folder for
      // those, and separately by bare file id for legacy flat entries with no folder at all.
      const folderIdToPhase = new Map(
        entries.filter((e) => e.folderId).map((e) => [e.folderId as string, e.phase])
      );
      const fileIdToPhase = new Map(
        entries.filter((e) => !e.folderId).map((e) => [e.file.id, e.phase])
      );

      let movedCount = 0;
      setCandidates((prev) =>
        prev.map((c) => {
          const drivePhase = c.resumeDriveFolderId
            ? folderIdToPhase.get(c.resumeDriveFolderId)
            : c.resumeDriveFileId
            ? fileIdToPhase.get(c.resumeDriveFileId)
            : undefined;
          if (drivePhase && drivePhase in PHASE_ORDER && drivePhase !== c.phase) {
            movedCount++;
            return { ...c, phase: drivePhase as SelectionPhase, lastUpdated: new Date().toISOString().split('T')[0] };
          }
          return c;
        })
      );

      const knownFolderIds = new Set(candidates.map((c) => c.resumeDriveFolderId).filter(Boolean));
      const knownFileIds = new Set(candidates.map((c) => c.resumeDriveFileId).filter(Boolean));
      const deletedIds = new Set(deletedDriveItemIds);
      // A folder/file we ourselves permanently deleted must never come back as a "new" candidate,
      // even if it's still showing up in this scan (Drive's list index lagging behind the delete,
      // or leftover residue for any other reason) — see permanentlyDeleteCandidate.
      const isKnown = (e: (typeof entries)[number]) =>
        e.folderId
          ? knownFolderIds.has(e.folderId) || deletedIds.has(e.folderId)
          : knownFileIds.has(e.file.id) || deletedIds.has(e.file.id);

      // Several files can sit in one unregistered candidate folder — import once per folder
      // (using its first file to parse candidate info from) rather than once per file.
      const seenFolderIds = new Set<string>();
      const unregistered = entries.filter((e) => {
        if (isKnown(e)) return false;
        if (!e.folderId) return true;
        if (seenFolderIds.has(e.folderId)) return false;
        seenFolderIds.add(e.folderId);
        return true;
      });

      let importedCount = 0;
      let failedCount = 0;
      for (const entry of unregistered) {
        const phase = (entry.phase in PHASE_ORDER ? entry.phase : 'DOCUMENT_SCREENING') as SelectionPhase;
        try {
          const parsed = await importDriveResumeApi(driveAccessToken, entry.file);
          addCandidate({
            name: parsed.name,
            nameKana: parsed.nameKana,
            age: parsed.age,
            education: parsed.education,
            currentCompany: parsed.currentCompany,
            companyCount: parsed.companyCount,
            email: parsed.email,
            phone: parsed.phone,
            jobTitle: parsed.jobTitle,
            appliedDate: new Date().toISOString().split('T')[0],
            agencyId: 'ag-direct',
            agencyName: '直接応募 (自社採用HP)',
            assignees: [staffList[0]?.name || '山田 太郎'],
            phase,
            scheduleStatus: 'UNARRANGED',
            resumeSummary: parsed.resumeSummary,
            rawResumeContent: parsed.rawResumeContent,
            resumeFileName: entry.file.name,
            resumeDriveUrl: entry.file.webViewLink,
            resumeDriveFileId: entry.file.id,
            resumeDriveFolderId: entry.folderId || undefined,
            resumeSkills: parsed.resumeSkills,
            salaryExpectation: parsed.salaryExpectation
          });
          importedCount++;
        } catch (err) {
          console.error('Drive resume import failed for', entry.file.name, err);
          failedCount++;
        }
      }

      const summary = [
        movedCount > 0 ? `フェーズ更新 ${movedCount}件` : null,
        importedCount > 0 ? `新規取込 ${importedCount}件` : null,
        failedCount > 0 ? `取込失敗 ${failedCount}件` : null
      ].filter(Boolean);

      showToast(
        summary.length > 0 ? `Drive同期完了: ${summary.join(' / ')}` : 'Drive同期完了: 変更はありませんでした',
        failedCount > 0 ? 'warning' : 'success'
      );
    } catch (err: any) {
      showToast(`Drive同期に失敗しました: ${err.message || '不明なエラー'}`, 'warning');
    } finally {
      setIsSyncingDrive(false);
    }
  };

  // Filtered Candidates computation (Active only)
  const filteredCandidates = candidates.filter((c) => {
    // Exclude archived/deleted candidates from active pipeline
    if (c.isArchived) return false;

    // Role based restrictions
    if (userRole === 'AGENCY') {
      if (c.agencyId !== 'ag-1') return false;
    }

    if (filters.searchQuery.trim() !== '') {
      const q = filters.searchQuery.toLowerCase();
      const matchName = c.name.toLowerCase().includes(q) || (c.nameKana && c.nameKana.toLowerCase().includes(q));
      const matchJob = c.jobTitle.toLowerCase().includes(q);
      const matchAgency = c.agencyName.toLowerCase().includes(q);
      const matchNotes = (c.notes && c.notes.toLowerCase().includes(q)) || c.resumeSummary.toLowerCase().includes(q);
      const matchId = c.id.toLowerCase().includes(q);
      if (!matchName && !matchJob && !matchAgency && !matchNotes && !matchId) return false;
    }

    if (filters.agencyId !== 'ALL' && c.agencyId !== filters.agencyId) return false;
    if (filters.assigneeName !== 'ALL' && !c.assignees.includes(filters.assigneeName)) return false;
    if (filters.scheduleStatus !== 'ALL' && c.scheduleStatus !== filters.scheduleStatus) return false;
    if (filters.phase !== 'ALL') {
      if (filters.phase === 'JOINING_SCHEDULED') {
        if (!c.joiningDate && c.phase !== 'OFFER_ACCEPTED' && c.phase !== 'OFFER_ISSUED') return false;
      } else if (c.phase !== filters.phase) {
        return false;
      }
    }
    if (filters.appliedMonth !== 'ALL' && c.appliedMonth !== filters.appliedMonth) return false;
    if (filters.positions && filters.positions.length > 0) {
      if (!filters.positions.includes(c.jobTitle)) return false;
    }

    return true;
  });

  // Archived Candidates computation (Past/Deleted candidates)
  const archivedCandidates = candidates.filter((c) => {
    if (!c.isArchived) return false;

    if (userRole === 'AGENCY' && c.agencyId !== 'ag-1') return false;

    if (filters.searchQuery.trim() !== '') {
      const q = filters.searchQuery.toLowerCase();
      const matchName = c.name.toLowerCase().includes(q) || (c.nameKana && c.nameKana.toLowerCase().includes(q));
      const matchJob = c.jobTitle.toLowerCase().includes(q);
      const matchAgency = c.agencyName.toLowerCase().includes(q);
      const matchNotes = (c.notes && c.notes.toLowerCase().includes(q)) || c.resumeSummary.toLowerCase().includes(q);
      const matchId = c.id.toLowerCase().includes(q);
      if (!matchName && !matchJob && !matchAgency && !matchNotes && !matchId) return false;
    }

    if (filters.agencyId !== 'ALL' && c.agencyId !== filters.agencyId) return false;
    if (filters.appliedMonth !== 'ALL' && c.appliedMonth !== filters.appliedMonth) return false;
    if (filters.positions && filters.positions.length > 0) {
      if (!filters.positions.includes(c.jobTitle)) return false;
    }

    return true;
  });

  // Yield Metrics Computation per Agency
  const yieldMetrics: YieldMetrics[] = agencies.map((agency) => {
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

    // Helper: evaluate how far candidate advanced
    let docPass = 0;
    let firstPass = 0;
    let offerCount = 0;
    let acceptCount = 0;

    agencyCandidates.forEach((c) => {
      const maxPhaseReached = Math.max(
        PHASE_ORDER[c.phase],
        ...c.evaluationNotes.map((n) => PHASE_ORDER[n.phase] || 0)
      );

      // Passed document screening if phase order >= 2 (FIRST_INTERVIEW) or pass recorded
      if (maxPhaseReached >= 2 || c.evaluationNotes.some((n) => n.phase === 'DOCUMENT_SCREENING' && n.resultStatus === 'PASS')) {
        docPass++;
      }

      // Passed 1st interview if maxPhaseReached >= 3
      if (maxPhaseReached >= 3 || c.evaluationNotes.some((n) => n.phase === 'FIRST_INTERVIEW' && n.resultStatus === 'PASS')) {
        firstPass++;
      }

      // Reached Offer or Accepted
      if (c.phase === 'OFFER_ISSUED' || c.phase === 'OFFER_ACCEPTED' || maxPhaseReached >= 5) {
        offerCount++;
      }

      // Accepted
      if (c.phase === 'OFFER_ACCEPTED') {
        acceptCount++;
      }
    });

    const docPassRate = total > 0 ? Math.round((docPass / total) * 100) : 0;
    const firstPassRate = docPass > 0 ? Math.round((firstPass / docPass) * 100) : 0;
    const offerRate = firstPass > 0 ? Math.round((offerCount / firstPass) * 100) : 0;
    const acceptRate = offerCount > 0 ? Math.round((acceptCount / offerCount) * 100) : 0;
    const overallYield = total > 0 ? Math.round((acceptCount / total) * 100) : 0;

    return {
      agencyName: agency.name,
      totalApplications: total,
      documentPassCount: docPass,
      firstInterviewPassCount: firstPass,
      secondInterviewPassCount: firstPass,
      finalInterviewPassCount: offerCount,
      offerCount,
      acceptCount,
      documentPassRate: docPassRate,
      firstInterviewPassRate: firstPassRate,
      finalInterviewPassRate: offerRate,
      offerRate,
      acceptRate,
      overallYieldRate: overallYield
    };
  });

  const exportCSV = () => {
    const headers = ['候補者ID', '名前', '職種', '応募日', '担当エージェント', '社内担当者', '選考フェーズ', '次回調整状況', '次回面接日時', '希望年収'];
    
    const phaseMap: Record<SelectionPhase, string> = {
      DOCUMENT_SCREENING: '書類選考',
      CASUAL_INTERVIEW: 'カジュアル面談',
      FIRST_INTERVIEW: '1次面接',
      SECOND_INTERVIEW: '2次面接',
      FINAL_INTERVIEW: '最終面接',
      OFFER_ISSUED: '内定',
      OFFER_ACCEPTED: '承諾',
      REJECTED_DECLINED: '辞退/不採用'
    };

    const scheduleMap: Record<ScheduleStatus, string> = {
      UNARRANGED: '未手配',
      PROPOSING_DATES: '候補日提示中',
      SCHEDULE_CONFIRMED: '日程確定',
      WAITING_RESULT: '結果待ち'
    };

    const rows = filteredCandidates.map((c) => [
      c.id,
      c.name,
      c.jobTitle,
      c.appliedDate,
      c.agencyName,
      c.assignees.join('; '),
      phaseMap[c.phase],
      scheduleMap[c.scheduleStatus],
      c.nextScheduleDate || '',
      c.salaryExpectation || ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers, ...rows].map((e) => e.map((x) => `"${x}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `bloom_candidates_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('候補者CSVデータをダウンロードしました', 'success');
  };

  return (
    <ATSContext.Provider
      value={{
        candidates,
        agencies,
        staffList,
        userRole,
        setUserRole,
        activeTab,
        setActiveTab,
        filters,
        setFilters,
        selectedCandidateId,
        setSelectedCandidateId,
        isAddModalOpen,
        setIsAddModalOpen,
        meetingLogs,
        addMeetingLog,
        updateMeetingLog,
        deleteMeetingLog,
        importHistoricalMeetingLogs,
        updateCandidatePhase,
        updateCandidateSchedule,
        updateOnboardingInfo,
        addEvaluationNote,
        updateEvaluationNote,
        deleteEvaluationNote,
        addCandidate,
        updateCandidate,
        deleteCandidate,
        restoreCandidate,
        permanentlyDeleteCandidate,
        addAgency,
        updateAgency,
        deleteAgency,
        toggleAgencyActive,
        addStaff,
        deleteStaff,
        updateStaff,
        yieldMetrics,
        filteredCandidates,
        archivedCandidates,
        toasts,
        showToast,
        resetToDefaultData,
        exportCSV,
        driveAccessToken,
        driveUserEmail,
        isDriveConnecting,
        connectDrive,
        disconnectDrive,
        backupToDrive,
        restoreFromDrive,
        isSyncingDrive,
        syncWithDrive
      }}
    >
      {children}
    </ATSContext.Provider>
  );
};

export const useATS = () => {
  const context = useContext(ATSContext);
  if (!context) {
    throw new Error('useATS must be used within an ATSProvider');
  }
  return context;
};
