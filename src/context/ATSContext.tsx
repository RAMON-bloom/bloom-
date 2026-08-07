import React, { createContext, useContext, useState, useEffect } from 'react';
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
import { useAuth } from './AuthContext';
import {
  backupToDrive as backupToDriveApi,
  restoreFromDrive as restoreFromDriveApi,
  moveResumeToPhaseFolder as moveResumeToPhaseFolderApi
} from '../lib/driveApi';

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
  addMeetingLog: (log: Omit<MeetingLog, 'id'>) => void;
  updateMeetingLog: (log: MeetingLog) => void;
  
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
  addCandidate: (candidateData: Omit<Candidate, 'id' | 'lastUpdated' | 'evaluationNotes' | 'appliedMonth'>) => void;
  updateCandidate: (updatedCandidate: Candidate) => void;
  deleteCandidate: (id: string) => void;
  restoreCandidate: (id: string) => void;
  
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

  // AuthGate already requires a signed-in bloom-firm.com Google account (Drive-scoped) before
  // this provider ever renders, so the Drive token/email are sourced straight from that session
  // rather than tracked as separate state here.
  const { email: driveUserEmail, accessToken: driveAccessToken, signIn: authSignIn, signOut: authSignOut } = useAuth();
  const [isDriveConnecting, setIsDriveConnecting] = useState(false);

  const [userRole, setUserRole] = useState<UserRole>('ADMIN');
  const [activeTab, setActiveTab] = useState<ActiveTab>('kanban');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  const addMeetingLog = (newLogData: Omit<MeetingLog, 'id'>) => {
    const id = `mtg-${Date.now()}`;
    const newLog: MeetingLog = { ...newLogData, id };
    setMeetingLogs((prev) => [newLog, ...prev]);
    showToast(`MTGログ 「${newLog.title}」 を保存・追加しました`, 'success');
  };

  const updateMeetingLog = (updatedLog: MeetingLog) => {
    setMeetingLogs((prev) => prev.map((m) => (m.id === updatedLog.id ? updatedLog : m)));
    showToast(`MTGログを更新しました`, 'info');
  };

  const showToast = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  // Fire-and-forget: moves the candidate's resume into the Drive folder matching their new
  // phase. Silently no-ops if Drive isn't connected or the resume was never uploaded to Drive
  // (e.g. legacy candidates registered before this feature existed).
  const moveResumeFolderIfNeeded = (candidate: Candidate, newPhase: SelectionPhase) => {
    if (!driveAccessToken || !candidate.resumeDriveFileId || candidate.phase === newPhase) return;
    moveResumeToPhaseFolderApi(driveAccessToken, candidate.resumeDriveFileId, newPhase).catch((err: any) => {
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

  const addCandidate = (candidateData: Omit<Candidate, 'id' | 'lastUpdated' | 'evaluationNotes' | 'appliedMonth'>) => {
    const nextNum = candidates.length + 1;
    const newId = `CAND-${String(nextNum).padStart(4, '0')}`;
    const appliedMonth = candidateData.appliedDate ? candidateData.appliedDate.substring(0, 7) : new Date().toISOString().substring(0, 7);

    const newCandidate: Candidate = {
      ...candidateData,
      id: newId,
      appliedMonth,
      evaluationNotes: [],
      lastUpdated: new Date().toISOString().split('T')[0]
    };

    setCandidates((prev) => [newCandidate, ...prev]);
    showToast(`候補者 「${newCandidate.name}」（${newCandidate.id}） を新規登録しました`, 'success');
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

  const restoreFromDrive = async () => {
    if (!driveAccessToken) {
      showToast('先にGoogle Driveへログインしてください', 'warning');
      return;
    }
    try {
      const data = await restoreFromDriveApi(driveAccessToken);
      if (data.candidates) setCandidates(data.candidates);
      if (data.agencies) setAgencies(data.agencies);
      if (data.staffList) setStaffList(data.staffList);
      if (data.meetingLogs) setMeetingLogs(data.meetingLogs);
      showToast('Driveのバックアップからデータを復元しました', 'success');
    } catch (err: any) {
      showToast(`Driveからの復元に失敗しました: ${err.message || '不明なエラー'}`, 'warning');
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
        updateCandidatePhase,
        updateCandidateSchedule,
        updateOnboardingInfo,
        addEvaluationNote,
        addCandidate,
        updateCandidate,
        deleteCandidate,
        restoreCandidate,
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
        restoreFromDrive
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
