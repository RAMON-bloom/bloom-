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
  MeetingLog,
  StalledCandidateInfo,
  OverdueDocScreeningInfo,
  ImportedInterviewLog,
  ChatWebhook,
  Inquiry,
  InquiryCategory,
  InterviewFormat,
  DriveSyncPreview,
  DriveSyncPhaseMove,
  DriveSyncNewImport,
  DriveSyncDocUpdate,
  DriveSyncDuplicateFolder,
  DriveSyncDuplicateFolderOption
} from '../types';
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
import {
  notifyCandidateRegistered as notifyCandidateRegisteredApi,
  notifyAttentionDigest as notifyAttentionDigestApi,
  notifyDocScreeningNudge as notifyDocScreeningNudgeApi,
  notifyEvaluationResult as notifyEvaluationResultApi,
  notifyDocumentScreeningThread as notifyDocumentScreeningThreadApi,
  notifyDeveloperInquiry as notifyDeveloperInquiryApi,
  notifyEvaluationSummaryThread as notifyEvaluationSummaryThreadApi
} from '../lib/notifyApi';
import { getStalledCandidates, getOverdueDocScreening } from '../lib/attentionUtils';
import { isJoiningScheduled } from '../lib/onboardingUtils';
import { getNextPhase } from '../lib/phaseUtils';
import { getStaffWebhooksForKind, getGroupWebhooksForKind } from '../lib/staffUtils';
import { findDuplicateCandidates } from '../lib/duplicateUtils';

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
  isBootstrapping: boolean;
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
  updateMeetingLog: (log: MeetingLog, opts?: { silent?: boolean }) => void;
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
  updateInterviewersForPhase: (candidateId: string, phase: SelectionPhase, interviewers: string[]) => void;
  updateInterviewFormatForPhase: (candidateId: string, phase: SelectionPhase, format?: InterviewFormat) => void;
  updateInterviewLogForPhase: (candidateId: string, phase: SelectionPhase, log: ImportedInterviewLog) => void;
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
  addEvaluationNote: (
    candidateId: string,
    note: Omit<EvaluationNote, 'id' | 'createdAt'>,
    nextInterviewerName?: string,
    mentionMemberNames?: string[],
    nextInterviewFormat?: InterviewFormat,
    overallComment?: string,
    docScreeningNextPhase?: SelectionPhase
  ) => void;
  updateEvaluationNote: (candidateId: string, noteId: string, note: Omit<EvaluationNote, 'id' | 'createdAt'>) => void;
  deleteEvaluationNote: (candidateId: string, noteId: string) => void;
  addCandidate: (candidateData: Omit<Candidate, 'id' | 'lastUpdated' | 'evaluationNotes' | 'appliedMonth'>) => void;
  updateCandidate: (updatedCandidate: Candidate) => void;
  mergeResumeDocuments: (candidateId: string, newFiles: { id: string; name: string; webViewLink?: string }[]) => void;
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

  // グループ用（複数人が見るスペース宛）Webhook。特定の担当者に属さない一覧をまるごと置き換える。
  groupChatWebhooks: ChatWebhook[];
  updateGroupChatWebhooks: (webhooks: ChatWebhook[]) => void;

  // アプリ内「お問い合わせ」。開発者とのチャット形式のスレッド一覧。
  inquiries: Inquiry[];
  addInquiryMessage: (category: InquiryCategory, text: string, inquiryId?: string) => string;

  // Utils & Yields
  yieldMetrics: YieldMetrics[];
  filteredCandidates: Candidate[];
  archivedCandidates: Candidate[];
  myStaffRecord: InternalStaff | undefined;
  stalledCandidates: StalledCandidateInfo[];
  overdueDocScreening: OverdueDocScreeningInfo[];
  toasts: Toast[];
  showToast: (message: string, type?: 'info' | 'success' | 'warning') => void;
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
  driveSyncPreview: DriveSyncPreview | null;
  previewDriveSync: () => Promise<void>;
  cancelDriveSyncPreview: () => void;
  isApplyingDriveSync: boolean;
  applyDriveSync: (selection: {
    phaseMoveCandidateIds: string[];
    importKeys: string[];
    ignoreKeys: string[];
    docUpdateCandidateIds?: string[];
    duplicateResolutions?: { candidateId: string; keepFolderId: string }[];
  }) => Promise<void>;
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

// Every write to the shared Drive backup used to replace agencies/staffList/groupChatWebhooks
// wholesale with whatever this one tab happened to have in memory — so two people editing the
// master data around the same time (e.g. both self-registering as staff within the same
// 5-second auto-backup window) would silently erase each other's addition, whichever tab's
// debounced write happened to land last. mergeCollection replaces that blind overwrite with a
// proper three-way merge (base = what this tab last confirmed was on Drive, local = this tab's
// current state, remote = what's on Drive right now, fetched fresh immediately before writing):
// an id unchanged from base on one side always defers to whatever the other side has (an edit or
// a deletion), and an id genuinely new on one side (not in base at all) is always kept — so a
// concurrent addition from another tab is never dropped just because this tab's local copy
// predates it. Only a true same-id conflict (both sides changed it differently since base) falls
// back to preferring local, since there's no reliable per-record timestamp to arbitrate with.
function mergeCollection<T extends { id: string }>(base: T[], local: T[], remote: T[]): T[] {
  const baseMap = new Map(base.map((x) => [x.id, x]));
  const localMap = new Map(local.map((x) => [x.id, x]));
  const remoteMap = new Map(remote.map((x) => [x.id, x]));
  const allIds = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);

  const result: T[] = [];
  for (const id of allIds) {
    const b = baseMap.get(id);
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    const localChanged = JSON.stringify(l) !== JSON.stringify(b);
    const remoteChanged = JSON.stringify(r) !== JSON.stringify(b);

    if (!l && !r) continue; // gone from both sides
    if (!l) {
      // Missing locally: either this tab deleted it and remote agrees (stay deleted), or someone
      // else added/edited it and this tab just hasn't caught up (keep remote's).
      if (b && !remoteChanged) continue;
      result.push(r as T);
      continue;
    }
    if (!r) {
      // Missing remotely: either someone else deleted it and this tab hasn't touched it (stay
      // deleted), or this tab added/edited it and hasn't synced yet (keep local's).
      if (b && !localChanged) continue;
      result.push(l);
      continue;
    }
    if (!localChanged) { result.push(r); continue; }
    if (!remoteChanged) { result.push(l); continue; }
    result.push(l); // both sides changed it differently — no timestamp to arbitrate, local wins
  }
  return result;
}

// This app used to fall back to built-in sample data (fake candidates like "佐々木亮平", fake
// agencies, etc. — see git history for the old src/data/mockData.ts) whenever a browser had no
// localStorage copy yet, so a brand-new profile's first paint showed obviously-fake data as if it
// were real. Removing that fallback only changes what a *future* empty localStorage falls back
// to — any browser that had already rendered the fake data once had it auto-saved into its own
// localStorage (see the "Save to localStorage on state changes" effects below) and would keep
// loading that same stale fake copy on every subsequent visit forever, code fix or not. This key
// marks, once per browser, that the one-time cleanup below has run: on first load without it, all
// four locally-cached lists are ignored (not merged, not filtered — a real candidate could
// legitimately land on the exact same "CAND-0001"-style id as a fake one once real usage starts,
// so id-based filtering isn't safe) in favor of blocking on a real Drive restore, then the key is
// set so every load after that goes back to the normal instant-local-render / background-sync
// behavior.
const DEMO_DATA_MIGRATION_KEY = 'ats_demo_fallback_purged_v1';

export const ATSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const needsDemoDataMigration = !localStorage.getItem(DEMO_DATA_MIGRATION_KEY);

  const [candidates, setCandidates] = useState<Candidate[]>(() => {
    if (needsDemoDataMigration) return [];
    const saved = localStorage.getItem('ats_candidates');
    return saved ? JSON.parse(saved) : [];
  });

  const [agencies, setAgencies] = useState<Agency[]>(() => {
    if (needsDemoDataMigration) return [];
    const saved = localStorage.getItem('ats_agencies');
    return saved ? JSON.parse(saved) : [];
  });

  const [staffList, setStaffList] = useState<InternalStaff[]>(() => {
    if (needsDemoDataMigration) return [];
    const saved = localStorage.getItem('ats_staff_list');
    return saved ? JSON.parse(saved) : [];
  });

  const [meetingLogs, setMeetingLogs] = useState<MeetingLog[]>(() => {
    if (needsDemoDataMigration) return [];
    const saved = localStorage.getItem('ats_meeting_logs');
    return saved ? JSON.parse(saved) : [];
  });

  // True whenever the very first paint has nothing trustworthy to render yet — either this
  // browser has no localStorage copy at all, or the one-time demo-data cleanup above just
  // discarded whatever it did have — and would otherwise flash an empty (or stale fake) pipeline
  // before the initial Drive auto-restore below has had a chance to populate it for real. Flipped
  // to false once that first restore attempt settles (success, failure, or "nothing backed up
  // yet" all count — there's nothing further to wait for either way). A returning, already-clean
  // device skips this entirely and never blocks on Drive.
  const [isBootstrapping, setIsBootstrapping] = useState(() => needsDemoDataMigration || !localStorage.getItem('ats_candidates'));

  // 特定の担当者に属さない、複数人が見るGoogle Chatスペース宛のWebhook一覧。個人のgoogleChatWebhooks
  // と同じ形(ChatWebhook)だが、担当者マスタ設定の独立したセクションで管理する。
  const [groupChatWebhooks, setGroupChatWebhooks] = useState<ChatWebhook[]>(() => {
    const saved = localStorage.getItem('ats_group_chat_webhooks');
    return saved ? JSON.parse(saved) : [];
  });

  // アプリ内「お問い合わせ」スレッド一覧。他のバックアップ対象データと同じ扱い（localStorage
  // 即時保存＋Driveへも他データと合わせてバックアップ）。
  const [inquiries, setInquiries] = useState<Inquiry[]>(() => {
    const saved = localStorage.getItem('ats_inquiries');
    return saved ? JSON.parse(saved) : [];
  });

  // Every Drive item id (folder/file) permanentlyDeleteCandidate has ever deleted, plus anything
  // explicitly marked "無視する" in the Drive sync review modal — checked by previewDriveSync so
  // it never offers either back up as a "new" unregistered resume. Needed because Drive's own
  // file-list index can lag a few
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
  const { email: driveUserEmail, accessToken: driveAccessToken, signIn: authSignIn, signOut: authSignOut, refreshNow: authRefreshNow } = useAuth();
  const [isDriveConnecting, setIsDriveConnecting] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  // Diff computed by previewDriveSync but not yet applied — non-null opens the review modal.
  // Nothing here mutates candidates/deletedDriveItemIds until applyDriveSync runs on the user's
  // explicit selection, so a stray old resume sitting in a Drive folder can no longer silently
  // land in the active pipeline just because someone clicked "Driveと同期".
  const [driveSyncPreview, setDriveSyncPreview] = useState<DriveSyncPreview | null>(null);
  const [isApplyingDriveSync, setIsApplyingDriveSync] = useState(false);

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
    localStorage.setItem('ats_group_chat_webhooks', JSON.stringify(groupChatWebhooks));
  }, [groupChatWebhooks]);

  useEffect(() => {
    localStorage.setItem('ats_inquiries', JSON.stringify(inquiries));
  }, [inquiries]);

  useEffect(() => {
    localStorage.setItem('ats_deleted_drive_item_ids', JSON.stringify(deletedDriveItemIds));
  }, [deletedDriveItemIds]);

  // Always-fresh snapshot of everything backupToDrive bundles together, read from inside the
  // debounced timeout below rather than captured in its closure — by the time the timeout fires,
  // candidates/agencies/staffList may have moved on from whatever they were when the meetingLogs
  // change that scheduled it happened, and the Drive backup should reflect the latest, not a
  // slightly-stale snapshot from several seconds earlier.
  const latestBackupStateRef = useRef({ candidates, agencies, staffList, meetingLogs, groupChatWebhooks, inquiries });
  useEffect(() => {
    latestBackupStateRef.current = { candidates, agencies, staffList, meetingLogs, groupChatWebhooks, inquiries };
  });

  // The merge base for mergeCollection (above): each collection as of the last time this tab
  // confirmed it matched Drive — either just pulled via restore/poll, or just pushed by this tab's
  // own successful write. Persisted so a reload doesn't forget it and treat every locally-cached
  // record as "new since base" (which would be harmless — mergeCollection keeps those — but would
  // also make an actually-already-synced remote edit look like a same-id conflict instead of a
  // clean remote-wins case). Seeded from whatever this tab loaded at mount; the first successful
  // restore or backup after that replaces it with a real synced snapshot.
  const SYNC_BASE_KEYS = {
    agencies: 'ats_sync_base_agencies',
    staffList: 'ats_sync_base_staff_list',
    groupChatWebhooks: 'ats_sync_base_group_chat_webhooks'
  } as const;
  const syncBaseRef = useRef<{ agencies: Agency[]; staffList: InternalStaff[]; groupChatWebhooks: ChatWebhook[] }>({
    agencies: (() => {
      const saved = localStorage.getItem(SYNC_BASE_KEYS.agencies);
      return saved ? JSON.parse(saved) : agencies;
    })(),
    staffList: (() => {
      const saved = localStorage.getItem(SYNC_BASE_KEYS.staffList);
      return saved ? JSON.parse(saved) : staffList;
    })(),
    groupChatWebhooks: (() => {
      const saved = localStorage.getItem(SYNC_BASE_KEYS.groupChatWebhooks);
      return saved ? JSON.parse(saved) : groupChatWebhooks;
    })()
  });
  const updateSyncBase = (partial: Partial<typeof syncBaseRef.current>) => {
    syncBaseRef.current = { ...syncBaseRef.current, ...partial };
    (Object.keys(partial) as (keyof typeof SYNC_BASE_KEYS)[]).forEach((key) => {
      localStorage.setItem(SYNC_BASE_KEYS[key], JSON.stringify(syncBaseRef.current[key]));
    });
  };

  // Auto-backs-up to Drive a few seconds after candidates, MTG logs, agencies, or staff stop
  // changing, so none of these only reach the team's shared Drive copy if someone remembers to
  // click「Driveにバックアップ」afterward. Originally scoped to meetingLogs only; agencies/staffList
  // were added because their edits previously never triggered a Drive write at all (not even
  // debounced) — a user could add/edit an agency or 採用担当者 and it would sit only in their own
  // browser's localStorage until someone happened to touch a meeting log or click the manual
  // backup button. candidates was deliberately left out for the same reason (changes far more
  // often — every phase drag, every field edit), on the assumption that since the backup file is
  // one shared JSON blob, each write would still carry the current candidates along "for free" —
  // but that assumption breaks whenever a session touches only candidates and nothing else (e.g.
  // just dragging someone to 辞退/不採用 and closing the tab): with candidates absent from this
  // list, that phase change never got backed up at all, so the next login's auto-restore below
  // would silently overwrite it with whatever stale phase (often still DOCUMENT_SCREENING, its
  // very first backed-up state) was last actually written. candidates is included here now so a
  // phase change is never more than a few seconds from being safe on Drive, same as the others.
  // Skips the very first run (mount/initial hydration, including the auto-restore below populating
  // these from Drive, is not a "change" worth writing straight back), and only failures get a
  // toast — success is meant to be invisible, matching what "automatic" implies.
  // Persisted (not just in-memory) so a fresh page load knows what this device last confirmed
  // synced even before any network call happens this session — see LAST_APPLIED_BACKUP_AT_KEY
  // below for why that matters.
  const LAST_APPLIED_BACKUP_AT_KEY = 'ats_last_applied_backup_at';
  // Timestamp of the newest Drive snapshot this tab has either written itself or already applied
  // (from restore or a background poll — see pollFromDrive below). Lets the poll tell "someone
  // else's newer edit" apart from "Drive still has whatever I most recently wrote/read," so it
  // never redundantly re-applies our own just-written data or, worse, replaces in-progress local
  // state with something no newer than what's already showing.
  const lastAppliedBackupAtRef = useRef<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem(LAST_APPLIED_BACKUP_AT_KEY) : null
  );
  const setLastAppliedBackupAt = (value: string) => {
    lastAppliedBackupAtRef.current = value;
    localStorage.setItem(LAST_APPLIED_BACKUP_AT_KEY, value);
  };

  // Persisted twin of pendingLocalWriteRef (below) — '1' from the moment a local change schedules
  // an as-yet-unconfirmed Drive backup until that write actually succeeds. Unlike the in-memory
  // ref, this survives a reload/tab-close, which is exactly the gap that used to lose data: an
  // interview note saved right as Drive dropped out would sit safely in localStorage, but if the
  // tab closed (or the page reloaded) before the debounced/retried backup ever landed, the
  // mount-time auto-restore below had no way to know a local write was still outstanding and would
  // unconditionally pull Drive's older copy over it — silently discarding the note. The mount-time
  // check now consults this flag before ever overwriting local state with a Drive read.
  const PENDING_BACKUP_KEY = 'ats_pending_drive_backup';

  // True from the moment a local change schedules the debounced auto-backup below until that
  // write actually lands on Drive. Closes a race the 20s poll could otherwise hit: if someone
  // else's session backs up in between (e.g. right after this tab locally advances a candidate's
  // phase but before its own 5s-debounced write has gone out), that snapshot was captured before
  // this tab's edit existed, yet its backedUpAt can still be newer than lastAppliedBackupAtRef —
  // so the poll would apply it and silently revert the just-made local change (phase snapping
  // back, e.g. a 書類選考→合格 transition undone) with no error shown, since nothing here throws.
  // The poll below skips entirely while this is true, so it naturally re-checks on its next tick,
  // by which point our own write (5s) has long since landed and lastAppliedBackupAtRef reflects it.
  const pendingLocalWriteRef = useRef(false);

  // Mirrors driveAccessToken into a ref so attemptBackup (below) always reads the freshest token
  // even mid-retry — e.g. AuthGate's silent refresh lands a new token while a backoff retry from
  // an earlier failure is still pending; without this the retry chain would keep hammering Drive
  // with the stale token it originally closed over instead of picking up the refreshed one.
  const driveAccessTokenRef = useRef(driveAccessToken);
  useEffect(() => {
    driveAccessTokenRef.current = driveAccessToken;
  }, [driveAccessToken]);

  // Tracks whether the *last* backup attempt failed, purely to decide whether a subsequent success
  // is worth announcing ("同期が復旧しました") — most successes are the normal happy path and stay
  // silent, but after a visible failure the user deserves a visible all-clear.
  const hadBackupFailureRef = useRef(false);
  // Throttles the failure toast itself: a dropped connection mid-interview (e.g. Wi-Fi hiccup in a
  // meeting room) would otherwise fire a fresh warning every retry, which reads as repeated data
  // loss even though nothing is actually lost — see attemptBackup's comment below.
  const lastBackupFailureToastAtRef = useRef(0);
  const backupRetryCountRef = useRef(0);

  const autoBackupMountedRef = useRef(false);
  const autoBackupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Actually performs one backup attempt and, on failure, reschedules itself with exponential
  // backoff (capped at 2 min) instead of giving up until the next unrelated edit happens to
  // reschedule the normal debounce below. Without this, a candidate note typed right as Drive
  // drops out would sit unsynced indefinitely if nothing else gets edited afterward — the note
  // itself is always safe in localStorage regardless (see addEvaluationNote, a pure local state
  // write with no Drive dependency), but it deserves to actually reach the shared team backup once
  // the connection comes back, not wait for someone to happen to touch something else first.
  const attemptBackup = () => {
    const token = driveAccessTokenRef.current;
    if (!token) {
      // Signed out / disconnected mid-retry — nothing left to protect against the poll for.
      pendingLocalWriteRef.current = false;
      return;
    }

    // Re-fetch Drive's current copy of the three master-data collections right before writing
    // and three-way-merge (see mergeCollection above) instead of blindly pushing this tab's own
    // in-memory copy over whatever's there now — otherwise two tabs editing agencies/staffList/
    // groupChatWebhooks around the same time silently erase each other's addition, whichever
    // tab's debounced write happens to land last. candidates/meetingLogs/inquiries are left as a
    // plain overwrite for now (higher edit frequency and nested structures make a safe merge a
    // bigger job — tracked as a follow-up, not done here).
    (async () => {
      let remoteAgencies = syncBaseRef.current.agencies;
      let remoteStaffList = syncBaseRef.current.staffList;
      let remoteGroupChatWebhooks = syncBaseRef.current.groupChatWebhooks;
      try {
        const remote = await restoreFromDriveApi(token);
        if (remote.agencies) remoteAgencies = remote.agencies;
        if (remote.staffList) remoteStaffList = remote.staffList;
        if (remote.groupChatWebhooks) remoteGroupChatWebhooks = remote.groupChatWebhooks;
      } catch {
        // Nothing backed up yet, or the read failed — fall back to merging against this tab's own
        // last-known base (equivalent to a plain overwrite for these three collections), matching
        // the previous behavior for this rare case rather than blocking the write entirely.
      }
      const mergedAgencies = mergeCollection(syncBaseRef.current.agencies, latestBackupStateRef.current.agencies, remoteAgencies);
      const mergedStaffList = mergeCollection(syncBaseRef.current.staffList, latestBackupStateRef.current.staffList, remoteStaffList);
      const mergedGroupChatWebhooks = mergeCollection(
        syncBaseRef.current.groupChatWebhooks,
        latestBackupStateRef.current.groupChatWebhooks,
        remoteGroupChatWebhooks
      );

      backupToDriveApi(token, {
        ...latestBackupStateRef.current,
        agencies: mergedAgencies,
        staffList: mergedStaffList,
        groupChatWebhooks: mergedGroupChatWebhooks
      })
        .then(() => {
          // Captured after the write completes (so it's already at least as new as whatever
          // timestamp the server just stamped the file with), not before — a poll landing right
          // after this should see its own echo and skip, not treat it as someone else's edit.
          setLastAppliedBackupAt(new Date().toISOString());
          localStorage.removeItem(PENDING_BACKUP_KEY);
          backupRetryCountRef.current = 0;
          pendingLocalWriteRef.current = false;
          updateSyncBase({ agencies: mergedAgencies, staffList: mergedStaffList, groupChatWebhooks: mergedGroupChatWebhooks });
          // The merge may have pulled in another tab's concurrent addition/edit that this tab's
          // own state didn't have — reflect that back locally so this tab's UI matches what Drive
          // now actually holds instead of silently drifting from it.
          if (JSON.stringify(mergedAgencies) !== JSON.stringify(latestBackupStateRef.current.agencies)) setAgencies(mergedAgencies);
          if (JSON.stringify(mergedStaffList) !== JSON.stringify(latestBackupStateRef.current.staffList)) setStaffList(mergedStaffList);
          if (JSON.stringify(mergedGroupChatWebhooks) !== JSON.stringify(latestBackupStateRef.current.groupChatWebhooks)) {
            setGroupChatWebhooks(mergedGroupChatWebhooks);
          }
          if (hadBackupFailureRef.current) {
            hadBackupFailureRef.current = false;
            showToast('Driveへの同期が復旧し、保留していた変更を保存しました', 'success');
          }
        })
        .catch((err: any) => {
          hadBackupFailureRef.current = true;
          const isAuthExpired = err.status === 401;
          const now = Date.now();
          if (now - lastBackupFailureToastAtRef.current > 60_000) {
            lastBackupFailureToastAtRef.current = now;
            showToast(
              isAuthExpired
                ? 'メモや変更内容はこの端末には保存済みです。Googleログインの有効期限が切れました。自動での再接続を試みています（うまくいかない場合は画面右上の「Drive連携」から再度ログインしてください）'
                : `メモや変更内容はこの端末には保存済みです。Driveへの同期のみ一時的に失敗しています（自動で再試行します）: ${err.message || '不明なエラー'}`,
              'warning'
            );
          }
          // A dead/expired token (as opposed to a network blip or Drive-side error) won't fix
          // itself just by retrying the same request — try to silently re-auth right away instead
          // of waiting on AuthGate's own scheduled/visibility-triggered check, which could be
          // minutes off. The very next retry attempt below picks up whatever token
          // driveAccessTokenRef ends up holding, whether or not this finishes first.
          if (isAuthExpired) authRefreshNow();
          // Left true here (unlike the success branch) — the write still hasn't actually landed on
          // Drive, so the 20s poll should keep deferring to local state for the whole retry window
          // rather than risk clobbering an unsynced edit with Drive's stale copy partway through.
          backupRetryCountRef.current = Math.min(backupRetryCountRef.current + 1, 5);
          const retryDelay = Math.min(5000 * 2 ** backupRetryCountRef.current, 120_000);
          autoBackupTimerRef.current = setTimeout(attemptBackup, retryDelay);
        });
    })();
  };

  useEffect(() => {
    if (!autoBackupMountedRef.current) {
      autoBackupMountedRef.current = true;
      return;
    }
    if (!driveAccessToken) return;

    if (autoBackupTimerRef.current) clearTimeout(autoBackupTimerRef.current);
    backupRetryCountRef.current = 0;
    pendingLocalWriteRef.current = true;
    localStorage.setItem(PENDING_BACKUP_KEY, '1');
    autoBackupTimerRef.current = setTimeout(attemptBackup, 5000);

    return () => {
      if (autoBackupTimerRef.current) clearTimeout(autoBackupTimerRef.current);
    };
  }, [candidates, agencies, staffList, meetingLogs, groupChatWebhooks, inquiries, driveAccessToken]);

  // Shared by restoreFromDrive, the mount-time check below, and the 20s poll — applies a Drive
  // snapshot to local state and records it as this device's new "known synced" point.
  const applyDriveSnapshot = (data: {
    candidates?: Candidate[];
    agencies?: Agency[];
    staffList?: InternalStaff[];
    meetingLogs?: MeetingLog[];
    groupChatWebhooks?: ChatWebhook[];
    inquiries?: Inquiry[];
    backedUpAt?: string;
  }) => {
    if (data.candidates) setCandidates(data.candidates);
    if (data.agencies) setAgencies(data.agencies);
    if (data.staffList) setStaffList(data.staffList);
    if (data.meetingLogs) setMeetingLogs(data.meetingLogs);
    if (data.groupChatWebhooks) setGroupChatWebhooks(data.groupChatWebhooks);
    if (data.inquiries) setInquiries(data.inquiries);
    if (data.backedUpAt) setLastAppliedBackupAt(data.backedUpAt);
    // Whatever just arrived from Drive is by definition in sync with Drive — record it as the new
    // merge base so the next write's three-way merge diffs against this, not a stale earlier point.
    updateSyncBase({
      ...(data.agencies ? { agencies: data.agencies } : {}),
      ...(data.staffList ? { staffList: data.staffList } : {}),
      ...(data.groupChatWebhooks ? { groupChatWebhooks: data.groupChatWebhooks } : {})
    });
    localStorage.removeItem(PENDING_BACKUP_KEY);
  };

  // Auto-restores from Drive once per login. Without this, candidates/agencies/staffList/
  // meetingLogs were seeded purely from this browser's own localStorage (or, on a brand-new
  // browser, this app's built-in demo data — dummy agencies, a dummy 山田太郎 etc.) and stayed
  // that way until someone remembered to open the Drive menu and click「Driveから復元」— so a new
  // teammate's first login showed fake data, and a returning teammate's browser could silently
  // drift out of sync with whatever anyone else had since backed up. Guarded by a ref rather than
  // depending on identity/mount timing, so a background token refresh later in the session
  // (AuthGate re-fires driveAccessToken on a schedule) doesn't re-trigger this and overwrite
  // whatever's been edited locally since login.
  //
  // Before blindly pulling Drive's copy, checks PENDING_BACKUP_KEY (see its declaration above) —
  // set whenever a local edit schedules a backup, cleared only once that backup actually succeeds,
  // and unlike the in-memory pendingLocalWriteRef this survives the very reload/tab-close this
  // effect runs on. If it's still set, this device has an edit (e.g. an interview note saved right
  // as Drive dropped out) that never confirmed reaching Drive last session — restoring now would
  // silently discard it, which is exactly the "notes that used to be there later disappeared" bug
  // this fixes. In that case, read Drive first only to check whether anyone else has backed up
  // something newer than what this device last knew about:
  //   - if not, nobody's work is at risk — push our pending local snapshot instead of pulling.
  //   - if so, someone else's edit exists that we have no way to merge with our unconfirmed local
  //     one — fall through to the normal restore. This is a real (rare) case where the pending
  //     local edit can still be lost, but it's strictly better than the previous behavior, which
  //     discarded it unconditionally on every single reload regardless of whether anyone else had
  //     touched Drive at all.
  const hasAutoRestoredRef = useRef(false);
  useEffect(() => {
    if (!driveAccessToken || hasAutoRestoredRef.current) return;
    hasAutoRestoredRef.current = true;

    const finishBootstrap = () => {
      setIsBootstrapping(false);
      if (needsDemoDataMigration) localStorage.setItem(DEMO_DATA_MIGRATION_KEY, '1');
    };

    // A PENDING_BACKUP_KEY left over from before the demo-data cleanup above can't be trusted as
    // a real unconfirmed edit worth protecting — it may just as well describe the fake sample data
    // itself having been "changed" — so the migration always takes the plain unconditional-pull
    // path below rather than the pending-write reconciliation path.
    const hasUnconfirmedLocalWrite = !needsDemoDataMigration && localStorage.getItem(PENDING_BACKUP_KEY) === '1';
    if (!hasUnconfirmedLocalWrite) {
      // Whatever the outcome (real data restored, nothing backed up yet, or an outright failure),
      // there's nothing further for the bootstrap screen to wait on — let the UI render whatever
      // state resulted rather than block forever on a restore that will never come.
      restoreFromDrive({ silent: true }).finally(finishBootstrap);
      return;
    }

    (async () => {
      try {
        let driveIsAheadOfWhatWeKnow = true; // fail safe: if we can't tell, don't risk pushing over newer work
        try {
          const data = await restoreFromDriveApi(driveAccessToken);
          driveIsAheadOfWhatWeKnow =
            !!data.backedUpAt && (!lastAppliedBackupAtRef.current || data.backedUpAt > lastAppliedBackupAtRef.current);
          if (driveIsAheadOfWhatWeKnow) {
            applyDriveSnapshot(data);
            return;
          }
        } catch {
          // Nothing backed up yet at all, or the read failed — either way there's nothing "ahead" of
          // us to preserve, so it's safe to fall through to pushing our pending local snapshot below.
          driveIsAheadOfWhatWeKnow = false;
        }
        if (!driveIsAheadOfWhatWeKnow) {
          pendingLocalWriteRef.current = true;
          attemptBackup();
        }
      } finally {
        finishBootstrap();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveAccessToken]);

  // Keeps everyone's open tab reasonably in sync without a real push channel (this app has no
  // WebSocket/server-push backend — see api/drive/backup.ts's single shared JSON file): every 20s,
  // and immediately whenever the tab regains focus, quietly re-checks Drive and applies it only if
  // it's actually newer than what this tab last wrote or applied. A no-op most of the time (nobody
  // else changed anything since the last check), and cheap even when it isn't — one Drive read, no
  // toast, same "invisible when it works" convention as the auto-backup effect above. Skipped
  // entirely while the tab is hidden so a pile of background browser tabs isn't polling Drive for
  // no one to see.
  const DRIVE_POLL_INTERVAL_MS = 20000;
  useEffect(() => {
    if (!driveAccessToken) return;

    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      // A local edit is still mid-flight to Drive (debounced write not yet landed) — skip this
      // tick rather than risk applying someone else's snapshot from before our edit existed. The
      // next tick, 20s later, will see it once our own write has long since completed.
      if (pendingLocalWriteRef.current) return;
      try {
        const data = await restoreFromDriveApi(driveAccessToken);
        if (cancelled) return;
        // No backedUpAt (nothing ever backed up yet) or no newer than what we already have —
        // nothing to do. String comparison works because backedUpAt is always an ISO 8601
        // timestamp, which sorts lexicographically the same as chronologically.
        if (!data.backedUpAt) return;
        if (lastAppliedBackupAtRef.current && data.backedUpAt <= lastAppliedBackupAtRef.current) return;

        applyDriveSnapshot(data);
      } catch (err: any) {
        // Silent — a background poll failing (transient network blip, token mid-refresh, nothing
        // backed up yet) isn't something the user needs interrupted with a toast for; the button-
        // triggered restoreFromDrive still surfaces real failures when someone explicitly asks.
        console.error('Background Drive poll failed:', err);
        // A dead token found here (rather than only when a local edit's backup fails) still means
        // the same thing — try to self-heal right away instead of waiting for AuthGate's own
        // schedule. No toast: attemptBackup's own 401 handling above already owns telling the
        // user, and this poll running every 20s regardless of local activity would otherwise
        // re-trigger that message far more often than the 60s throttle intends.
        if (err.status === 401) authRefreshNow();
      }
    };

    const intervalId = setInterval(poll, DRIVE_POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveAccessToken]);

  // Always-fresh snapshot for the attention-notify effect below, same reasoning as
  // latestBackupStateRef — the 8s delay exists so this reads data *after* auto-restore above has
  // had a chance to replace whatever this browser started with, not the stale mount-time values.
  const latestAttentionStateRef = useRef({ candidates, staffList, groupChatWebhooks });
  useEffect(() => {
    latestAttentionStateRef.current = { candidates, staffList, groupChatWebhooks };
  });

  // 抜け防止のGoogle Chat通知（進捗停滞ダイジェスト・書類選考対応漏れの個別督促）を、ログイン後
  // 1日1回だけこのブラウザから送信する。サーバーcron・サービスアカウントが存在しない構成上、
  // 実際にアプリを開いている誰かのブラウザから送るしかない — 同じ日に複数人が別々のブラウザで
  // ログインすれば、それぞれ独立して1回ずつ発火する（チーム全体で1日1回に統一されるわけではない、
  // 既知の制約）。送信先はWebhook URLで決まるため、発火した本人が採用アシスタントである必要はない。
  const ATTENTION_NOTIFY_THROTTLE_KEY = 'ats_attention_notify_last_run';
  const hasCheckedAttentionRef = useRef(false);
  useEffect(() => {
    if (!driveAccessToken || hasCheckedAttentionRef.current) return;
    hasCheckedAttentionRef.current = true;

    const today = new Date().toISOString().split('T')[0];
    if (localStorage.getItem(ATTENTION_NOTIFY_THROTTLE_KEY) === today) return;

    // Intentionally no cleanup/clearTimeout here — hasCheckedAttentionRef already guarantees this
    // only schedules once per mount, and in dev-only React StrictMode a cleanup would cancel this
    // timer on the synthetic double-invoke's fake unmount while the ref guard then blocks the
    // second real invocation from ever rescheduling it, so the notify would never fire in dev.
    // Same reasoning/pattern as hasAutoRestoredRef above (no cleanup there either). Production
    // builds don't double-invoke effects, so this never actually leaks a stray timer there.
    setTimeout(() => {
      const { candidates: latestCandidates, staffList: latestStaffList, groupChatWebhooks: latestGroupWebhooks } = latestAttentionStateRef.current;
      const stalled = getStalledCandidates(latestCandidates);
      const overdue = getOverdueDocScreening(latestCandidates);

      if (stalled.length === 0 && overdue.length === 0) {
        localStorage.setItem(ATTENTION_NOTIFY_THROTTLE_KEY, today);
        return;
      }

      const notifyPromises: Promise<void>[] = [];

      // 宛先は「このWebhookでこの種類の通知を受け取る」という各リンクのkinds選択だけで決まる
      // （役職フラグ等での絞り込みは行わない。以前isRecruitingAssistantフラグで絞り込んでいた際、
      // フラグを立て忘れただけで登録済みWebhookに何も届かなくなる不具合があったため撤廃した）。
      // 個人用Webhookに加えて、特定の担当者に属さないグループ用Webhookにも同じ条件で送る。
      latestStaffList.forEach((staff) => {
        getStaffWebhooksForKind(staff, 'ATTENTION_DIGEST').forEach((webhookUrl) => {
          notifyPromises.push(
            notifyAttentionDigestApi({
              accessToken: driveAccessToken,
              webhookUrl,
              staffName: staff.name,
              staffMentionId: staff.chatMentionId,
              stalledCount: stalled.length,
              overdueCount: overdue.length
            })
          );
        });
      });
      getGroupWebhooksForKind(latestGroupWebhooks, 'ATTENTION_DIGEST').forEach((webhookUrl) => {
        notifyPromises.push(
          notifyAttentionDigestApi({
            accessToken: driveAccessToken,
            webhookUrl,
            stalledCount: stalled.length,
            overdueCount: overdue.length
          })
        );
      });

      overdue.forEach(({ candidate, assigneeName, daysSinceUpdate }) => {
        const assignee = latestStaffList.find((s) => s.name === assigneeName);
        if (assignee) {
          getStaffWebhooksForKind(assignee, 'DOC_SCREENING_NUDGE').forEach((webhookUrl) => {
            notifyPromises.push(
              notifyDocScreeningNudgeApi({
                accessToken: driveAccessToken,
                webhookUrl,
                staffName: assigneeName,
                staffMentionId: assignee.chatMentionId,
                candidateName: candidate.name,
                candidateId: candidate.id,
                daysSinceUpdate
              })
            );
          });
        }
        getGroupWebhooksForKind(latestGroupWebhooks, 'DOC_SCREENING_NUDGE').forEach((webhookUrl) => {
          notifyPromises.push(
            notifyDocScreeningNudgeApi({
              accessToken: driveAccessToken,
              webhookUrl,
              candidateName: candidate.name,
              candidateId: candidate.id,
              daysSinceUpdate
            })
          );
        });
      });

      Promise.allSettled(notifyPromises).then((results) => {
        const failedCount = results.filter((r) => r.status === 'rejected').length;
        if (failedCount > 0) {
          console.error(`Attention Chat notify: ${failedCount}件の送信に失敗しました`);
          showToast(`抜け防止通知の送信に${failedCount}件失敗しました（Webhook設定をご確認ください）`, 'warning');
        }
      });

      localStorage.setItem(ATTENTION_NOTIFY_THROTTLE_KEY, today);
    }, 8000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveAccessToken]);

  const addMeetingLog = (newLogData: Omit<MeetingLog, 'id'>) => {
    const id = `mtg-${Date.now()}`;
    const newLog: MeetingLog = { ...newLogData, id };
    setMeetingLogs((prev) => [newLog, ...prev]);
    showToast(`MTGログ 「${newLog.title}」 を保存・追加しました`, 'success');
    return id;
  };

  const updateMeetingLog = (updatedLog: MeetingLog, opts?: { silent?: boolean }) => {
    setMeetingLogs((prev) => prev.map((m) => (m.id === updatedLog.id ? updatedLog : m)));
    if (!opts?.silent) {
      showToast(`MTGログを更新しました`, 'info');
    }
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

  // Drive's move (GET current parents, then PATCH addParents/removeParents based on that read)
  // isn't atomic — two moves fired for the same item close together can each read the same
  // stale parent, so the second one's removeParents no longer matches reality and the item ends
  // up with parents from both the old and the new phase folder at once (a candidate's resume
  // "spanning" two folders). Chaining every move for the same drive item onto the previous one's
  // promise (rather than firing them concurrently) keeps each PATCH's parent read accurate.
  const driveMoveQueueRef = useRef<Map<string, Promise<any>>>(new Map());

  // Fire-and-forget: moves the candidate's whole Drive folder (resume, CV, anything else in it)
  // into the folder matching their new phase. Prefers the per-candidate folder; falls back to
  // moving the bare resume file for legacy candidates registered before that folder existed.
  // Silently no-ops if Drive isn't connected or the resume was never uploaded to Drive at all.
  const moveResumeFolderIfNeeded = (candidate: Candidate, newPhase: SelectionPhase) => {
    const driveItemId = candidate.resumeDriveFolderId || candidate.resumeDriveFileId;
    if (!driveAccessToken || !driveItemId || candidate.phase === newPhase) return;
    const priorMove = driveMoveQueueRef.current.get(driveItemId) || Promise.resolve();
    const thisMove = priorMove
      .catch(() => {})
      .then(() => moveResumeToPhaseFolderApi(driveAccessToken, driveItemId, newPhase))
      .catch((err: any) => {
        showToast(`${candidate.name} さんの履歴書のDriveフォルダ移動に失敗しました: ${err.message || '不明なエラー'}`, 'warning');
      });
    driveMoveQueueRef.current.set(driveItemId, thisMove);
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

  // 選考フロー・面接調整の各ステップ（1次面接・2次面接など）ごとに独立して担当面接官を保持する。
  // nextInterviewersは「次に控えている1件」用の単一枠のため、候補者がまだそのフェーズに到達して
  // いないステップへの事前アサインが他のステップの値を上書きしてしまい機能しなかった
  // （選考フロー＆面接調整タブで1次面接以降のアサインが効かないバグ）。トーストはここでは出さず、
  // 呼び出し元（handleAddInterviewer/handleRemoveInterviewer）が個別の成功/削除トーストを出す。
  const updateInterviewersForPhase = (candidateId: string, phase: SelectionPhase, interviewers: string[]) => {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidateId
          ? {
              ...c,
              interviewersByPhase: { ...(c.interviewersByPhase || {}), [phase]: interviewers },
              lastUpdated: new Date().toISOString().split('T')[0]
            }
          : c
      )
    );
  };

  // interviewersByPhaseと同じく、選考フローの各ステップごとに独立して実施方式（対面/オンライン）を保持する。
  const updateInterviewFormatForPhase = (candidateId: string, phase: SelectionPhase, format?: InterviewFormat) => {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidateId
          ? {
              ...c,
              interviewFormatByPhase: { ...(c.interviewFormatByPhase || {}), [phase]: format },
              lastUpdated: new Date().toISOString().split('T')[0]
            }
          : c
      )
    );
  };

  // Drive/カレンダー連携で取り込んだ面談ログ(Gemini議事録AI要約)を、選考フローの各ステップごとに
  // 独立して保持する。interviewersByPhaseと同じく、まだ現在のフェーズに到達していないステップにも
  // 前もって取り込んでおける。
  const updateInterviewLogForPhase = (candidateId: string, phase: SelectionPhase, log: ImportedInterviewLog) => {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidateId
          ? {
              ...c,
              interviewLogsByPhase: { ...(c.interviewLogsByPhase || {}), [phase]: log },
              lastUpdated: new Date().toISOString().split('T')[0]
            }
          : c
      )
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

  const addEvaluationNote = (
    candidateId: string,
    noteData: Omit<EvaluationNote, 'id' | 'createdAt'>,
    nextInterviewerName?: string,
    mentionMemberNames?: string[],
    nextInterviewFormat?: InterviewFormat,
    overallComment?: string,
    docScreeningNextPhase?: SelectionPhase
  ) => {
    const newNote: EvaluationNote = {
      ...noteData,
      id: `eval-${Date.now()}`,
      createdAt: new Date().toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })
    };

    const target = candidates.find((c) => c.id === candidateId);

    if (noteData.resultStatus === 'FAIL') {
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

    // Best-effort Google Chat notification when a selection result is finalized (合格/不採用、
    // 書類選考も含む) — PENDINGでは発火しない。宛先は各Webhookのkinds選択のみで決まる。
    if (target && (noteData.resultStatus === 'PASS' || noteData.resultStatus === 'FAIL')) {
      const phaseLabels: Record<SelectionPhase, string> = {
        DOCUMENT_SCREENING: '書類選考',
        CASUAL_INTERVIEW: 'カジュアル面談',
        FIRST_INTERVIEW: '1次面接',
        SECOND_INTERVIEW: '2次面接',
        FINAL_INTERVIEW: '最終面接',
        OFFER_ISSUED: '内定通知',
        OFFER_ACCEPTED: '内定承諾',
        REJECTED_DECLINED: '辞退 / 不採用'
      };
      const interviewFormatLabels: Record<InterviewFormat, string> = { IN_PERSON: '対面', ONLINE: 'オンライン' };

      const recipients = staffList;
      const notifyCalls: Promise<void>[] = [];
      recipients.forEach((staff) => {
        getStaffWebhooksForKind(staff, 'EVALUATION_RESULT').forEach((webhookUrl) => {
          notifyCalls.push(
            notifyEvaluationResultApi({
              accessToken: driveAccessToken,
              webhookUrl,
              staffName: staff.name,
              staffMentionId: staff.chatMentionId,
              candidateName: target.name,
              candidateId: target.id,
              phaseLabel: phaseLabels[noteData.phase] || noteData.phase,
              resultStatus: noteData.resultStatus as 'PASS' | 'FAIL',
              goodPoints: noteData.goodPoints,
              concerns: noteData.concerns,
              failReason: noteData.resultStatus === 'FAIL' ? noteData.failReason : undefined
            })
          );
        });
      });
      getGroupWebhooksForKind(groupChatWebhooks, 'EVALUATION_RESULT').forEach((webhookUrl) => {
        notifyCalls.push(
          notifyEvaluationResultApi({
            accessToken: driveAccessToken,
            webhookUrl,
            candidateName: target.name,
            candidateId: target.id,
            phaseLabel: phaseLabels[noteData.phase] || noteData.phase,
            resultStatus: noteData.resultStatus as 'PASS' | 'FAIL',
            goodPoints: noteData.goodPoints,
            concerns: noteData.concerns,
            failReason: noteData.resultStatus === 'FAIL' ? noteData.failReason : undefined
          })
        );
      });
      if (notifyCalls.length > 0) {
        Promise.allSettled(notifyCalls).then((results) => {
          const failedCount = results.filter((r) => r.status === 'rejected').length;
          if (failedCount > 0) {
            console.error(`Evaluation-result Chat notify: ${failedCount}件の送信に失敗しました`);
            showToast(`選考結果のChat通知の送信に${failedCount}件失敗しました（Webhook設定をご確認ください）`, 'warning');
          }
        });
      }

      // 書類選考を通過した瞬間だけ、追加で「候補者名＋エージェント名」の新規スレッドを立てる通知も
      // 送る（DOCUMENT_SCREENING_THREAD種別を選んだWebhookのみが対象）。threadKeyを候補者IDに固定
      // しているので、万一この通知が複数回発火しても同じスレッドに収束する。
      if (noteData.phase === 'DOCUMENT_SCREENING' && noteData.resultStatus === 'PASS') {
        // 次回(1次面接)の面接官アサイン状況・実施方式は、まだこの保存処理がsetCandidatesで
        // 反映される前なので、target(保存前のスナップショット)の既存値に、今回の保存で新たに
        // 選ばれた値(nextInterviewerName/nextInterviewFormat)をマージして最新状態を組み立てる。
        const nextPhaseForThread = getNextPhase(noteData.phase, docScreeningNextPhase);
        const nextPhaseLabelForThread = nextPhaseForThread ? phaseLabels[nextPhaseForThread] : undefined;
        const existingNextInterviewersForThread = nextPhaseForThread ? target.interviewersByPhase?.[nextPhaseForThread] || [] : [];
        const nextInterviewerNamesForThread =
          nextInterviewerName && !existingNextInterviewersForThread.includes(nextInterviewerName)
            ? [...existingNextInterviewersForThread, nextInterviewerName]
            : existingNextInterviewersForThread;
        const resolvedNextInterviewFormat =
          nextInterviewFormat || (nextPhaseForThread ? target.interviewFormatByPhase?.[nextPhaseForThread] : undefined);
        const interviewFormatLabelForThread = resolvedNextInterviewFormat ? interviewFormatLabels[resolvedNextInterviewFormat] : undefined;

        const threadPayloadBase = {
          accessToken: driveAccessToken,
          candidateName: target.name,
          candidateId: target.id,
          agencyName: target.agencyName,
          positionLabel: target.jobTitle,
          nextPhaseLabel: nextPhaseLabelForThread,
          nextInterviewerNames: nextInterviewerNamesForThread,
          interviewFormatLabel: interviewFormatLabelForThread
        };

        const threadNotifyCalls: Promise<void>[] = [];
        recipients.forEach((staff) => {
          getStaffWebhooksForKind(staff, 'DOCUMENT_SCREENING_THREAD').forEach((webhookUrl) => {
            threadNotifyCalls.push(notifyDocumentScreeningThreadApi({ ...threadPayloadBase, webhookUrl }));
          });
        });
        getGroupWebhooksForKind(groupChatWebhooks, 'DOCUMENT_SCREENING_THREAD').forEach((webhookUrl) => {
          threadNotifyCalls.push(notifyDocumentScreeningThreadApi({ ...threadPayloadBase, webhookUrl }));
        });
        if (threadNotifyCalls.length > 0) {
          Promise.allSettled(threadNotifyCalls).then((results) => {
            const failedCount = results.filter((r) => r.status === 'rejected').length;
            if (failedCount > 0) {
              console.error(`Document-screening-thread Chat notify: ${failedCount}件の送信に失敗しました`);
              showToast(`選考スレッド作成の送信に${failedCount}件失敗しました（Webhook設定をご確認ください）`, 'warning');
            }
          });
        }
      }

      // 合否判定・LCM評価サマリ・次回面接官のアサイン状況を、書類選考通過スレッドと同じ
      // threadKey(候補者ID)で書き込む（EVALUATION_SUMMARY_THREAD種別を選んだWebhookのみが対象）。
      // 書類選考フェーズ自体は丸ごと除外する。理由は2つ:
      // 1. PASS: このイベントはこの直前のブロックが送るDOCUMENT_SCREENING_THREADの投稿がスレッドの
      //    最初のメッセージとして届く必要がある。ここも同時に発火させると、2つの独立したリクエスト
      //    がどちらが先にChatへ届くか保証されず、評価サマリの方が先着してスレッドの最初のメッセージ
      //    になってしまうことがあった（実際に発生した不具合）。
      // 2. FAIL: 書類選考で不採用の候補者はそもそもスレッドを持たない（PASSした候補者のみ
      //    DOCUMENT_SCREENING_THREADでスレッドが作られる）。以前はここを発火させていたため、
      //    まだ存在しないスレッドがGoogle Chat側で新規作成されてしまい、「書類選考通過スレッド」の
      //    Webhookが不合格の候補者にもスレッドを立ててしまう不具合になっていた。
      if (noteData.phase !== 'DOCUMENT_SCREENING') {
        const nextPhase = noteData.resultStatus === 'PASS' ? getNextPhase(noteData.phase) : null;
        const nextPhaseLabel = nextPhase ? phaseLabels[nextPhase] : undefined;
        const existingNextInterviewers = nextPhase ? target.interviewersByPhase?.[nextPhase] || [] : [];
        const nextInterviewerNames =
          nextInterviewerName && !existingNextInterviewers.includes(nextInterviewerName)
            ? [...existingNextInterviewers, nextInterviewerName]
            : existingNextInterviewers;
        const resolvedNextInterviewFormatForSummary =
          nextInterviewFormat || (nextPhase ? target.interviewFormatByPhase?.[nextPhase] : undefined);
        const interviewFormatLabelForSummary = resolvedNextInterviewFormatForSummary
          ? interviewFormatLabels[resolvedNextInterviewFormatForSummary]
          : undefined;

        // 次回面接官とは別に、フォームで選んだメンバーを候補者スレッドの評価サマリにメンションする。
        // 本物のメンションが使えるかは各自のchatMentionId登録有無に依存する（未登録なら通知先の
        // notifyEvaluationSummaryThreadApi/エンドポイント側で太字テキストにフォールバックする）。
        const mentionedStaff = (mentionMemberNames || []).map((name) => ({
          name,
          mentionId: staffList.find((s) => s.name === name)?.chatMentionId
        }));

        const summaryNotifyCalls: Promise<void>[] = [];
        const summaryPayload = {
          candidateName: target.name,
          candidateId: target.id,
          positionLabel: target.jobTitle,
          phaseLabel: phaseLabels[noteData.phase] || noteData.phase,
          resultStatus: noteData.resultStatus as 'PASS' | 'FAIL',
          interviewRating: noteData.interviewRating,
          lRating: noteData.lRating,
          cRating: noteData.cRating,
          mRating: noteData.mRating,
          lNote: noteData.lNote,
          cNote: noteData.cNote,
          mNote: noteData.mNote,
          goodPoints: noteData.goodPoints,
          concerns: noteData.concerns,
          otherNotes: noteData.otherNotes,
          overallComment,
          failReason: noteData.resultStatus === 'FAIL' ? noteData.failReason : undefined,
          nextPhaseLabel,
          nextInterviewerNames,
          interviewFormatLabel: interviewFormatLabelForSummary,
          mentionedStaff
        };
        recipients.forEach((staff) => {
          getStaffWebhooksForKind(staff, 'EVALUATION_SUMMARY_THREAD').forEach((webhookUrl) => {
            summaryNotifyCalls.push(notifyEvaluationSummaryThreadApi({ accessToken: driveAccessToken, webhookUrl, ...summaryPayload }));
          });
        });
        getGroupWebhooksForKind(groupChatWebhooks, 'EVALUATION_SUMMARY_THREAD').forEach((webhookUrl) => {
          summaryNotifyCalls.push(notifyEvaluationSummaryThreadApi({ accessToken: driveAccessToken, webhookUrl, ...summaryPayload }));
        });
        if (summaryNotifyCalls.length > 0) {
          Promise.allSettled(summaryNotifyCalls).then((results) => {
            const failedCount = results.filter((r) => r.status === 'rejected').length;
            if (failedCount > 0) {
              console.error(`Evaluation-summary-thread Chat notify: ${failedCount}件の送信に失敗しました`);
              showToast(`評価サマリのスレッド書き込みに${failedCount}件失敗しました（Webhook設定をご確認ください）`, 'warning');
            }
          });
        }
      }
    }
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
    if (newCandidate.phase === 'DOCUMENT_SCREENING') {
      if (docScreeningAssigneeName) {
        const assigneeName = docScreeningAssigneeName;
        const assignee = staffList.find((s) => s.name === assigneeName);
        if (assignee) {
          getStaffWebhooksForKind(assignee, 'CANDIDATE_REGISTERED').forEach((webhookUrl) => {
            notifyCandidateRegisteredApi({
              accessToken: driveAccessToken,
              webhookUrl,
              staffName: assigneeName,
              staffMentionId: assignee.chatMentionId,
              candidateName: newCandidate.name,
              candidateId: newCandidate.id
            }).catch((err) => {
              console.error('Candidate-registered Chat notify failed:', err);
              showToast(`${assigneeName} さんへのChat通知の送信に失敗しました: ${err.message || '不明なエラー'}`, 'warning');
            });
          });
        }
      }

      // グループ用Webhookはどの担当者の持ち物でもないため担当者が解決できたかどうかに関わらず送るが、
      // 誰が書類選考担当になったかは本文に太字メンションで書く(共有スペースを見ている全員に、
      // 誰が対応する想定かひと目で伝わるようにするため)。
      getGroupWebhooksForKind(groupChatWebhooks, 'CANDIDATE_REGISTERED').forEach((webhookUrl) => {
        notifyCandidateRegisteredApi({
          accessToken: driveAccessToken,
          webhookUrl,
          staffName: docScreeningAssigneeName,
          candidateName: newCandidate.name,
          candidateId: newCandidate.id
        }).catch((err) => {
          console.error('Candidate-registered Chat notify (group) failed:', err);
          showToast(`グループ通知の送信に失敗しました: ${err.message || '不明なエラー'}`, 'warning');
        });
      });
    }
  };

  const updateCandidate = (updatedCandidate: Candidate) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === updatedCandidate.id ? { ...updatedCandidate, lastUpdated: new Date().toISOString().split('T')[0] } : c))
    );
    showToast(`${updatedCandidate.name} さんの情報を更新しました`, 'success');
  };

  // Silently appends newly-discovered Drive files to a candidate's resumeDocuments — used for the
  // background "refresh this candidate's documents from their Drive folder" check on opening
  // their detail view. Deliberately no toast/lastUpdated bump: unlike updateCandidate, this runs
  // automatically and unprompted on every open, and announcing itself every time would be noise.
  // Also self-heals a candidate that already has what's meant to be the same document written in
  // twice under two different Drive file ids (e.g. uploaded from two sessions/tabs around the
  // same time) — keyed by filename rather than id, since the ids genuinely differ in that case
  // and an id-only dedup can't tell they're duplicates. newFiles (the fresh Drive folder listing)
  // is merged in last, so it always wins a name collision over a stale existing entry.
  const mergeResumeDocuments = (
    candidateId: string,
    newFiles: { id: string; name: string; webViewLink?: string }[]
  ) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== candidateId) return c;
        const existing = c.resumeDocuments || [];
        const docMap = new Map<string, { name: string; driveUrl: string; driveFileId: string }>();
        [
          ...existing,
          ...newFiles.map((f) => ({ name: f.name, driveUrl: f.webViewLink || '', driveFileId: f.id }))
        ].forEach((d) => {
          const key = d.name?.trim() ? `name:${d.name.trim()}` : d.driveFileId ? `id:${d.driveFileId}` : `url:${d.driveUrl}`;
          docMap.set(key, d);
        });
        const deduped = Array.from(docMap.values());
        // Nothing new and nothing to clean up — same length means every newFile collided with an
        // existing entry and existing itself had no internal duplicates, so skip the update.
        if (deduped.length === existing.length) return c;
        return { ...c, resumeDocuments: deduped };
      })
    );
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

  // グループ用Webhook一覧をまるごと置き換える。担当者マスタ設定の編集フォームが、フォーム内で
  // 組み立てた配列全体を1回のみ保存する形（個々のadd/remove操作をcontext側に持たせない）。
  const updateGroupChatWebhooks = (webhooks: ChatWebhook[]) => {
    setGroupChatWebhooks(webhooks);
    showToast('グループ通知用Webhookを更新しました', 'success');
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
      // Same three-way merge as attemptBackup — the manual button is just another writer and
      // needs the same protection against clobbering a concurrent edit from another tab.
      let remoteAgencies = syncBaseRef.current.agencies;
      let remoteStaffList = syncBaseRef.current.staffList;
      let remoteGroupChatWebhooks = syncBaseRef.current.groupChatWebhooks;
      try {
        const remote = await restoreFromDriveApi(driveAccessToken);
        if (remote.agencies) remoteAgencies = remote.agencies;
        if (remote.staffList) remoteStaffList = remote.staffList;
        if (remote.groupChatWebhooks) remoteGroupChatWebhooks = remote.groupChatWebhooks;
      } catch {
        // Nothing backed up yet, or the read failed — fall back to this tab's own base.
      }
      const mergedAgencies = mergeCollection(syncBaseRef.current.agencies, agencies, remoteAgencies);
      const mergedStaffList = mergeCollection(syncBaseRef.current.staffList, staffList, remoteStaffList);
      const mergedGroupChatWebhooks = mergeCollection(syncBaseRef.current.groupChatWebhooks, groupChatWebhooks, remoteGroupChatWebhooks);

      await backupToDriveApi(driveAccessToken, {
        candidates,
        agencies: mergedAgencies,
        staffList: mergedStaffList,
        meetingLogs,
        groupChatWebhooks: mergedGroupChatWebhooks,
        inquiries
      });
      // Same reasoning as the auto-backup effect: stamped after the write completes, so the
      // background poll recognizes this as its own echo instead of someone else's newer edit.
      setLastAppliedBackupAt(new Date().toISOString());
      localStorage.removeItem(PENDING_BACKUP_KEY);
      updateSyncBase({ agencies: mergedAgencies, staffList: mergedStaffList, groupChatWebhooks: mergedGroupChatWebhooks });
      if (JSON.stringify(mergedAgencies) !== JSON.stringify(agencies)) setAgencies(mergedAgencies);
      if (JSON.stringify(mergedStaffList) !== JSON.stringify(staffList)) setStaffList(mergedStaffList);
      if (JSON.stringify(mergedGroupChatWebhooks) !== JSON.stringify(groupChatWebhooks)) setGroupChatWebhooks(mergedGroupChatWebhooks);
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
      applyDriveSnapshot(data);
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
  // Only computes the diff between Drive's actual folder layout and this app's state — never
  // touches candidates/deletedDriveItemIds itself. Applying is a separate, explicit step
  // (applyDriveSync) driven by what the user selects in the review modal this opens, so a stray
  // old resume left sitting in a Drive phase folder can no longer silently become a brand-new
  // active-pipeline candidate just because someone clicked "Driveと同期".
  const previewDriveSync = async () => {
    if (!driveAccessToken) {
      showToast('先にGoogle Driveへログインしてください', 'warning');
      return;
    }
    setIsSyncingDrive(true);
    try {
      const entries = await scanDriveResumesApi(driveAccessToken);
      // A candidate folder normally holds several files (resume, CV, ...) — key by folder for
      // those, and separately by bare file id for legacy flat entries with no folder at all.
      const folderIdToEntry = new Map(entries.filter((e) => e.folderId).map((e) => [e.folderId as string, e]));
      const fileIdToEntry = new Map(entries.filter((e) => !e.folderId).map((e) => [e.file.id, e]));

      const phaseMoves: DriveSyncPhaseMove[] = [];
      candidates.forEach((c) => {
        const entry = c.resumeDriveFolderId
          ? folderIdToEntry.get(c.resumeDriveFolderId)
          : c.resumeDriveFileId
          ? fileIdToEntry.get(c.resumeDriveFileId)
          : undefined;
        if (entry && entry.phase in PHASE_ORDER && entry.phase !== c.phase) {
          phaseMoves.push({
            candidateId: c.id,
            candidateName: c.name,
            currentPhase: c.phase,
            drivePhase: entry.phase as SelectionPhase
          });
        }
      });

      // A known candidate's folder can grow files the app was never told about — either because
      // this candidate was originally imported by the old Drive-sync path (before it tracked
      // every file in the folder, only ever kept one), or because a file was dropped into their
      // folder by hand in Drive itself. Since these already live in the right folder (no move
      // needed), surfacing them only needs comparing folder contents against resumeDocuments/
      // resumeDriveFileId — applying just appends to resumeDocuments, nothing moves in Drive.
      const folderIdToFiles = new Map<string, typeof entries[number]['file'][]>();
      entries.forEach((e) => {
        if (!e.folderId) return;
        const list = folderIdToFiles.get(e.folderId) || [];
        // Same multi-parent-file guard as the newImports grouping above.
        if (!list.some((f) => f.id === e.file.id)) list.push(e.file);
        folderIdToFiles.set(e.folderId, list);
      });
      const docUpdates: DriveSyncDocUpdate[] = [];
      candidates.forEach((c) => {
        if (!c.resumeDriveFolderId) return;
        const filesInFolder = folderIdToFiles.get(c.resumeDriveFolderId);
        if (!filesInFolder || filesInFolder.length === 0) return;
        const knownIds = new Set(
          [c.resumeDriveFileId, ...(c.resumeDocuments || []).map((d) => d.driveFileId)].filter(Boolean)
        );
        const newFiles = filesInFolder.filter((f) => !knownIds.has(f.id));
        if (newFiles.length > 0) {
          docUpdates.push({ candidateId: c.id, candidateName: c.name, newFiles });
        }
      });

      // A candidate's resume folder can end up duplicated across phase folders — e.g. an old
      // 書類選考-phase folder left orphaned after a later phase change linked a freshly-created
      // folder instead of moving the original one (upload-resume.ts always creates a brand-new
      // folder when no candidateFolderId is passed, never reuses one with a matching name).
      // Detected by matching the Drive folder-naming convention from buildCandidateFolderName in
      // upload-resume.ts ("氏名" or "氏名_エージェント名") against known candidates, so the stale
      // folder stops silently reappearing as a "new import" every sync and getting silently
      // skipped as a duplicate candidate (see applyDriveSync's duplicateSkippedNames) without ever
      // actually being cleaned up.
      const folderMeta = new Map<string, { phase: string; folderName: string }>();
      entries.forEach((e) => {
        if (e.folderId && e.folderName && !folderMeta.has(e.folderId)) {
          folderMeta.set(e.folderId, { phase: e.phase, folderName: e.folderName });
        }
      });
      const folderMatchesCandidate = (folderName: string, candidateName: string) => {
        const name = candidateName.trim();
        if (!name) return false;
        return folderName === name || folderName.startsWith(`${name}_`);
      };
      const buildDuplicateOption = (
        folderId: string,
        meta: { phase: string; folderName: string },
        isCurrent: boolean
      ): DriveSyncDuplicateFolderOption => ({
        folderId,
        phase: (meta.phase in PHASE_ORDER ? meta.phase : null) as SelectionPhase | null,
        phaseLabel: meta.phase,
        folderName: meta.folderName,
        files: folderIdToFiles.get(folderId) || [],
        isCurrent
      });

      // A folder we ourselves already resolved/discarded (deletedDriveItemIds) must never come
      // back as a "still duplicated" choice — same reasoning as isKnown() below (Drive's list
      // index can lag behind a move, or the folder can briefly show up again for any other
      // reason).
      const deletedIds = new Set(deletedDriveItemIds);

      const duplicateFolders: DriveSyncDuplicateFolder[] = [];
      const duplicateOrphanFolderIds = new Set<string>();
      candidates.forEach((c) => {
        const matchingIds = new Set(
          Array.from(folderMeta.entries())
            .filter(([folderId, meta]) => !deletedIds.has(folderId) && folderMatchesCandidate(meta.folderName, c.name))
            .map(([folderId]) => folderId)
        );
        // Always include the folder the app currently considers this candidate's own, even if its
        // name doesn't match exactly (e.g. the candidate's name was edited in-app after the Drive
        // folder was created) — otherwise it wouldn't be offered as a "keep this one" choice.
        if (c.resumeDriveFolderId && folderMeta.has(c.resumeDriveFolderId) && !deletedIds.has(c.resumeDriveFolderId)) {
          matchingIds.add(c.resumeDriveFolderId);
        }
        if (matchingIds.size < 2) return;

        const options = Array.from(matchingIds).map((folderId) =>
          buildDuplicateOption(folderId, folderMeta.get(folderId)!, folderId === c.resumeDriveFolderId)
        );
        duplicateFolders.push({ candidateId: c.id, candidateName: c.name, candidatePhase: c.phase, options });
        options.forEach((o) => {
          if (!o.isCurrent) duplicateOrphanFolderIds.add(o.folderId);
        });
      });

      const knownFolderIds = new Set(candidates.map((c) => c.resumeDriveFolderId).filter(Boolean));
      const knownFileIds = new Set(candidates.map((c) => c.resumeDriveFileId).filter(Boolean));
      // A folder/file we ourselves permanently deleted (or previously chose "無視する" for) must
      // never come back as a "new" candidate, even if it's still showing up in this scan (Drive's
      // list index lagging behind the delete, or leftover residue for any other reason). Orphan
      // folders already captured above as part of a duplicateFolders group are excluded too —
      // they're reviewed (and resolved: keep-or-discard) there instead of resurfacing here as an
      // unrelated "new candidate".
      const isKnown = (e: (typeof entries)[number]) =>
        e.folderId
          ? knownFolderIds.has(e.folderId) || deletedIds.has(e.folderId) || duplicateOrphanFolderIds.has(e.folderId)
          : knownFileIds.has(e.file.id) || deletedIds.has(e.file.id);

      // Several files can sit in one unregistered candidate folder (履歴書 + 職務経歴書, etc.) —
      // surface it once per folder rather than once per file, but keep every file in `files` so
      // none of them get silently dropped from import (previously only the first file Drive
      // happened to list survived into newImports, and every other file in that folder was never
      // even referenced again — the source of "履歴書か職務経歴書のどちらかしか見られない").
      const folderGroups = new Map<string, DriveSyncNewImport>();
      const newImports: DriveSyncNewImport[] = [];
      entries.forEach((entry) => {
        if (isKnown(entry)) return;
        if (!entry.folderId) {
          newImports.push({
            key: entry.file.id,
            displayName: entry.folderName || entry.file.name,
            phase: (entry.phase in PHASE_ORDER ? entry.phase : 'DOCUMENT_SCREENING') as SelectionPhase,
            folderId: entry.folderId,
            file: entry.file,
            files: [entry.file]
          });
          return;
        }
        const existing = folderGroups.get(entry.folderId);
        if (existing) {
          // A file with more than one parent folder (a leftover from the historical "spans
          // multiple folders" move race) can otherwise get scanned into the same folder's file
          // list twice if it briefly shows up under this folderId from two different listings —
          // guard so one real file never becomes two buttons pointing at the same document.
          if (!existing.files.some((f) => f.id === entry.file.id)) {
            existing.files.push(entry.file);
          }
          return;
        }
        const group: DriveSyncNewImport = {
          key: entry.folderId,
          displayName: entry.folderName || entry.file.name,
          phase: (entry.phase in PHASE_ORDER ? entry.phase : 'DOCUMENT_SCREENING') as SelectionPhase,
          folderId: entry.folderId,
          file: entry.file,
          files: [entry.file]
        };
        folderGroups.set(entry.folderId, group);
        newImports.push(group);
      });

      if (phaseMoves.length === 0 && newImports.length === 0 && docUpdates.length === 0 && duplicateFolders.length === 0) {
        showToast('Drive同期: 差分はありませんでした', 'info');
      } else {
        setDriveSyncPreview({ phaseMoves, newImports, docUpdates, duplicateFolders });
      }
    } catch (err: any) {
      showToast(`Drive同期の確認に失敗しました: ${err.message || '不明なエラー'}`, 'warning');
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const cancelDriveSyncPreview = () => setDriveSyncPreview(null);

  // Applies only what the user explicitly selected in the review modal: phase moves by candidate
  // id, new-candidate imports by entry key, and Drive items to add to the permanent ignore list
  // (deletedDriveItemIds) so they stop being offered on future syncs. Anything left unselected —
  // neither applied nor ignored — is simply left for the next preview to ask about again.
  const applyDriveSync = async (selection: {
    phaseMoveCandidateIds: string[];
    importKeys: string[];
    ignoreKeys: string[];
    docUpdateCandidateIds?: string[];
    duplicateResolutions?: { candidateId: string; keepFolderId: string }[];
  }) => {
    if (!driveAccessToken || !driveSyncPreview) return;
    setIsApplyingDriveSync(true);
    try {
      const moveIds = new Set(selection.phaseMoveCandidateIds);
      const docUpdateIds = new Set(selection.docUpdateCandidateIds || []);
      if (moveIds.size > 0 || docUpdateIds.size > 0) {
        setCandidates((prev) =>
          prev.map((c) => {
            const move = moveIds.has(c.id) ? driveSyncPreview.phaseMoves.find((m) => m.candidateId === c.id) : undefined;
            const docUpdate = docUpdateIds.has(c.id)
              ? driveSyncPreview.docUpdates.find((d) => d.candidateId === c.id)
              : undefined;
            if (!move && !docUpdate) return c;
            // Merged by filename (Map, later entries win on collision) rather than plain append —
            // the preview's newFiles was already filtered against what resumeDocuments knew about
            // at preview time, but state can drift between opening the review modal and clicking
            // apply (e.g. the same file getting picked up by the background auto-refresh while the
            // review modal was open), so this is a second, cheap safety net. Keying by name (not
            // just id) also catches what's meant to be the same document sitting under two
            // different Drive file ids, same as mergeResumeDocuments above.
            const docsWithUpdate = docUpdate
              ? (() => {
                  const docMap = new Map<string, { name: string; driveUrl: string; driveFileId: string }>();
                  [
                    ...(c.resumeDocuments || []),
                    ...docUpdate.newFiles.map((f) => ({ name: f.name, driveUrl: f.webViewLink || '', driveFileId: f.id }))
                  ].forEach((d) => {
                    const key = d.name?.trim() ? `name:${d.name.trim()}` : d.driveFileId ? `id:${d.driveFileId}` : `url:${d.driveUrl}`;
                    docMap.set(key, d);
                  });
                  return Array.from(docMap.values());
                })()
              : undefined;
            return {
              ...c,
              ...(move ? { phase: move.drivePhase } : {}),
              // Already sitting in this candidate's own Drive folder — nothing to move, just make
              // it selectable/openable alongside whatever resumeDocuments already has.
              ...(docsWithUpdate ? { resumeDocuments: docsWithUpdate } : {}),
              lastUpdated: new Date().toISOString().split('T')[0]
            };
          })
        );
      }

      const importSet = new Set(selection.importKeys);
      const toImport = driveSyncPreview.newImports.filter((e) => importSet.has(e.key));
      let importedCount = 0;
      let failedCount = 0;
      let duplicateSkippedCount = 0;
      const duplicateSkippedNames: string[] = [];
      // `candidates` here is a snapshot from when applyDriveSync started, so it never reflects
      // candidates addCandidate has already added earlier in this same loop (setCandidates is
      // async) — importedThisBatch closes that gap for two Drive folders belonging to the same
      // person surfacing in one sync. Uses the same exact-match rule as the manual registration
      // form's duplicate check, so a resume sitting unregistered in Drive can no longer slip past
      // that protection just because it came in through 同期 instead of 新規候補者を登録.
      const importedThisBatch = new Set<string>();
      for (const entry of toImport) {
        try {
          const parsed = await importDriveResumeApi(driveAccessToken, entry.file);
          const nameNorm = parsed.name.trim();
          const isDuplicate =
            findDuplicateCandidates(candidates, parsed).length > 0 || (nameNorm && importedThisBatch.has(nameNorm));
          if (isDuplicate) {
            duplicateSkippedCount++;
            duplicateSkippedNames.push(parsed.name || entry.displayName);
            continue;
          }
          if (nameNorm) importedThisBatch.add(nameNorm);
          addCandidate({
            name: parsed.name,
            nameKana: parsed.nameKana,
            age: parsed.age,
            education: parsed.education,
            currentCompany: parsed.currentCompany,
            companyCount: parsed.companyCount,
            email: parsed.email,
            phone: parsed.phone,
            // parsed.jobTitle is the candidate's actual occupation extracted from the resume
            // (e.g. "Webエンジニア") — unrelated to this app's own EC/BP/AIX/BRE/BCA recruiting
            // position code that jobTitle actually means everywhere else in this app. Left blank
            // here for the recruiter to set from the candidate detail view, same as a fresh
            // Drive-import candidate always has no assignee-specific info decided yet.
            jobTitle: '',
            appliedDate: new Date().toISOString().split('T')[0],
            agencyId: 'ag-direct',
            agencyName: '直接応募 (自社採用HP)',
            assignees: [staffList[0]?.name || '山田 太郎'],
            phase: entry.phase,
            scheduleStatus: 'UNARRANGED',
            resumeSummary: parsed.resumeSummary,
            rawResumeContent: parsed.rawResumeContent,
            resumeFileName: entry.file.name,
            resumeDriveUrl: entry.file.webViewLink,
            resumeDriveFileId: entry.file.id,
            resumeDriveFolderId: entry.folderId || undefined,
            // entry.files holds every file Drive found in this candidate's folder (not just the
            // one used for AI parsing above) — without this, a second file like 職務経歴書 sitting
            // alongside 履歴書 in the same folder never became reachable as its own document at
            // all, so "原本を開く" could only ever show whichever file happened to be parsed.
            resumeDocuments: entry.files.map((f) => ({
              name: f.name,
              driveUrl: f.webViewLink || '',
              driveFileId: f.id
            })),
            resumeSkills: parsed.resumeSkills,
            salaryExpectation: parsed.salaryExpectation
          });
          importedCount++;
        } catch (err) {
          console.error('Drive resume import failed for', entry.file.name, err);
          failedCount++;
        }
      }

      if (selection.ignoreKeys.length > 0) {
        setDeletedDriveItemIds((prev) => Array.from(new Set([...prev, ...selection.ignoreKeys])));
      }

      // Each resolution says which of a candidate's several Drive folders (across phase folders)
      // to keep — the rest get moved into 99_完全削除済み (not hard-deleted, same precedent as
      // permanentlyDeleteCandidate) so they stop resurfacing on every future sync. If the kept
      // folder isn't the one the candidate record already points to, re-link it and pull in any
      // files that only existed in that folder.
      const duplicateResolutions = selection.duplicateResolutions || [];
      let duplicateResolvedCount = 0;
      let duplicateDiscardFailedCount = 0;
      if (duplicateResolutions.length > 0) {
        const resolutionMap = new Map(duplicateResolutions.map((r) => [r.candidateId, r.keepFolderId]));
        // Resolved entirely from driveSyncPreview (already-known data) rather than from inside the
        // setCandidates updater below — a functional setState updater isn't guaranteed to run
        // synchronously with this call, so building discardIds as a side effect of it and reading
        // it right after produced an empty array in practice (the Drive move never fired).
        const discardIds: string[] = [];
        const relinkByCandidateId = new Map<string, DriveSyncDuplicateFolderOption>();
        driveSyncPreview.duplicateFolders.forEach((group) => {
          const keepFolderId = resolutionMap.get(group.candidateId);
          const keptOption = keepFolderId ? group.options.find((o) => o.folderId === keepFolderId) : undefined;
          if (!keptOption) return;
          group.options.forEach((o) => {
            if (o.folderId !== keepFolderId) discardIds.push(o.folderId);
          });
          if (!keptOption.isCurrent) relinkByCandidateId.set(group.candidateId, keptOption);
        });

        if (relinkByCandidateId.size > 0) {
          setCandidates((prev) =>
            prev.map((c) => {
              const keptOption = relinkByCandidateId.get(c.id);
              if (!keptOption) return c;
              const docMap = new Map<string, { name: string; driveUrl: string; driveFileId: string }>();
              [
                ...(c.resumeDocuments || []),
                ...keptOption.files.map((f) => ({ name: f.name, driveUrl: f.webViewLink || '', driveFileId: f.id }))
              ].forEach((d) => {
                const key = d.name?.trim() ? `name:${d.name.trim()}` : d.driveFileId ? `id:${d.driveFileId}` : `url:${d.driveUrl}`;
                docMap.set(key, d);
              });
              return {
                ...c,
                resumeDriveFolderId: keptOption.folderId,
                resumeDriveFileId: keptOption.files[0]?.id || c.resumeDriveFileId,
                resumeDocuments: Array.from(docMap.values()),
                lastUpdated: new Date().toISOString().split('T')[0]
              };
            })
          );
        }
        duplicateResolvedCount = duplicateResolutions.length;

        if (discardIds.length > 0) {
          const results = await Promise.allSettled(
            discardIds.map((id) => moveResumeToDeletedFolderApi(driveAccessToken, id))
          );
          const succeededIds = discardIds.filter((_, i) => results[i].status === 'fulfilled');
          duplicateDiscardFailedCount = discardIds.length - succeededIds.length;
          // Only ids Drive confirms were actually moved go on the permanent ignore list — a
          // failed move must keep surfacing on the next sync (same reasoning as
          // permanentlyDeleteCandidate: never mark something "handled" that's still sitting where
          // it was).
          if (succeededIds.length > 0) {
            setDeletedDriveItemIds((prev) => Array.from(new Set([...prev, ...succeededIds])));
          }
        }
      }

      const summary = [
        moveIds.size > 0 ? `フェーズ更新 ${moveIds.size}件` : null,
        docUpdateIds.size > 0 ? `既存候補者への書類追加 ${docUpdateIds.size}件` : null,
        importedCount > 0 ? `新規取込 ${importedCount}件` : null,
        failedCount > 0 ? `取込失敗 ${failedCount}件` : null,
        duplicateSkippedCount > 0
          ? `登録済み候補者と一致する可能性があるため${duplicateSkippedCount}件をスキップ（${duplicateSkippedNames.join('、')}。取り込むには「新規候補者を登録」から手動で登録してください）`
          : null,
        duplicateResolvedCount > 0 ? `重複フォルダの整理 ${duplicateResolvedCount}件` : null,
        duplicateDiscardFailedCount > 0
          ? `重複フォルダの削除に失敗 ${duplicateDiscardFailedCount}件（時間を置いて再度お試しください）`
          : null,
        selection.ignoreKeys.length > 0 ? `無視リストに追加 ${selection.ignoreKeys.length}件` : null
      ].filter(Boolean);

      showToast(
        summary.length > 0 ? `Drive同期完了: ${summary.join(' / ')}` : 'Drive同期完了: 変更はありませんでした',
        failedCount > 0 || duplicateSkippedCount > 0 || duplicateDiscardFailedCount > 0 ? 'warning' : 'success'
      );
      setDriveSyncPreview(null);
    } catch (err: any) {
      showToast(`Drive同期の反映に失敗しました: ${err.message || '不明なエラー'}`, 'warning');
    } finally {
      setIsApplyingDriveSync(false);
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
        if (!isJoiningScheduled(c)) return false;
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

  // The InternalStaff record (if any) linked to the currently signed-in Google account — the
  // bridge between "who's logged in" and "who they are in 担当者マスタ". Undefined until they've
  // self-registered (see SelfRegistrationPrompt) or an admin has added their email manually.
  const myStaffRecord = driveUserEmail
    ? staffList.find((s) => s.email?.toLowerCase() === driveUserEmail.toLowerCase())
    : undefined;

  // アプリ内「お問い合わせ」チャットへのメッセージ送信。inquiryIdを渡すと既存スレッドに追記、
  // 省略すると新規スレッドを開始する。DEVELOPER_INQUIRY種別を選んだWebhookへ、スレッドの
  // threadKeyをinquiryIdに固定してGoogle Chatへも通知する（同じスレッドの後続メッセージは
  // 同じChatスレッドにまとまる、DOCUMENT_SCREENING_THREADと同じ考え方）。戻り値は使ったinquiryId
  // （呼び出し側が同じスレッドへ続けて送信できるよう保持する）。
  const addInquiryMessage = (category: InquiryCategory, text: string, inquiryId?: string): string => {
    const now = new Date().toISOString();
    const senderName = myStaffRecord?.name || driveUserEmail || '匿名ユーザー';
    const message = { id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, senderName, createdAt: now };

    const existing = inquiryId ? inquiries.find((inq) => inq.id === inquiryId) : undefined;
    const targetId = existing?.id || `inq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setInquiries((prev) => {
      if (existing) {
        return prev.map((inq) =>
          inq.id === targetId ? { ...inq, updatedAt: now, messages: [...inq.messages, message] } : inq
        );
      }
      const newInquiry: Inquiry = { id: targetId, category, createdAt: now, updatedAt: now, messages: [message] };
      return [...prev, newInquiry];
    });

    const notifyCalls: Promise<void>[] = [];
    staffList.forEach((staff) => {
      getStaffWebhooksForKind(staff, 'DEVELOPER_INQUIRY').forEach((webhookUrl) => {
        notifyCalls.push(
          notifyDeveloperInquiryApi({ accessToken: driveAccessToken, webhookUrl, staffName: senderName, category, message: text, inquiryId: targetId })
        );
      });
    });
    getGroupWebhooksForKind(groupChatWebhooks, 'DEVELOPER_INQUIRY').forEach((webhookUrl) => {
      notifyCalls.push(
        notifyDeveloperInquiryApi({ accessToken: driveAccessToken, webhookUrl, staffName: senderName, category, message: text, inquiryId: targetId })
      );
    });
    if (notifyCalls.length > 0) {
      Promise.allSettled(notifyCalls).then((results) => {
        const failedCount = results.filter((r) => r.status === 'rejected').length;
        if (failedCount > 0) {
          console.error(`Developer-inquiry Chat notify: ${failedCount}件の送信に失敗しました`);
        }
      });
    }

    return targetId;
  };

  // 抜け防止: 進捗が止まっている候補者 / 書類選考の対応が止まっている候補者。毎レンダー
  // candidatesから再計算する軽量な派生値（filteredCandidates等と同じ扱い）。しきい値は
  // attentionUtils.tsで定義。
  const stalledCandidates = getStalledCandidates(candidates);
  const overdueDocScreening = getOverdueDocScreening(candidates);

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
    let secondPass = 0;
    let finalPass = 0;
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

      // Passed 2nd interview if maxPhaseReached >= 4 (SECOND_INTERVIEW)
      if (maxPhaseReached >= 4 || c.evaluationNotes.some((n) => n.phase === 'SECOND_INTERVIEW' && n.resultStatus === 'PASS')) {
        secondPass++;
      }

      // Passed final interview if maxPhaseReached >= 5 (FINAL_INTERVIEW)
      if (maxPhaseReached >= 5 || c.evaluationNotes.some((n) => n.phase === 'FINAL_INTERVIEW' && n.resultStatus === 'PASS')) {
        finalPass++;
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
        isBootstrapping,
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
        updateInterviewersForPhase,
        updateInterviewFormatForPhase,
        updateInterviewLogForPhase,
        updateOnboardingInfo,
        addEvaluationNote,
        updateEvaluationNote,
        deleteEvaluationNote,
        addCandidate,
        updateCandidate,
        mergeResumeDocuments,
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
        groupChatWebhooks,
        updateGroupChatWebhooks,
        inquiries,
        addInquiryMessage,
        yieldMetrics,
        filteredCandidates,
        archivedCandidates,
        myStaffRecord,
        stalledCandidates,
        overdueDocScreening,
        toasts,
        showToast,
        exportCSV,
        driveAccessToken,
        driveUserEmail,
        isDriveConnecting,
        connectDrive,
        disconnectDrive,
        backupToDrive,
        restoreFromDrive,
        isSyncingDrive,
        driveSyncPreview,
        previewDriveSync,
        cancelDriveSyncPreview,
        isApplyingDriveSync,
        applyDriveSync
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
