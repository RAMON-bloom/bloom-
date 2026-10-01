import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
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
  ImportedInterviewLog,
  ChatWebhook,
  RecruitmentPosition,
  DEFAULT_POSITIONS,
  migrateLegacyPositions,
  Inquiry,
  InquiryCategory,
  InterviewFormat,
  DriveSyncPreview,
  DriveSyncPhaseMove,
  DriveSyncPhaseMoveDirection,
  DriveSyncNewImport,
  DriveSyncDocUpdate,
  DriveSyncDuplicateFolder,
  DriveSyncDuplicateFolderOption,
  BonusGuaranteeInstallment
} from '../types';
import { HISTORICAL_MEETING_LOGS } from '../data/historicalMeetingLogs';
import { useAuth } from './AuthContext';
import {
  backupToDrive as backupToDriveApi,
  saveOfferLedger,
  restoreFromDrive as restoreFromDriveApi,
  getBackupVersion as getBackupVersionApi,
  moveResumeToPhaseFolder as moveResumeToPhaseFolderApi,
  scanDriveResumes as scanDriveResumesApi,
  importDriveResume as importDriveResumeApi,
  moveResumeToDeletedFolder as moveResumeToDeletedFolderApi,
  saveEvaluationLogToDrive as saveEvaluationLogToDriveApi
} from '../lib/driveApi';
import {
  notifyCandidateRegistered as notifyCandidateRegisteredApi,
  notifyEvaluationResult as notifyEvaluationResultApi,
  notifyDocumentScreeningThread as notifyDocumentScreeningThreadApi,
  notifyDeveloperInquiry as notifyDeveloperInquiryApi,
  notifyEvaluationSummaryThread as notifyEvaluationSummaryThreadApi,
  notifyApplicationsDigest as notifyApplicationsDigestApi
} from '../lib/notifyApi';
import { isJoiningScheduled } from '../lib/onboardingUtils';
import { getNextPhase, migrateLegacyPhase } from '../lib/phaseUtils';
import { getStaffWebhooksForKind, getGroupWebhooksForKind, getStaffWebhookEntriesForKind, getGroupWebhookEntriesForKind } from '../lib/staffUtils';
import { AptitudeTestStatus, applyAptitudeTestStatus, APTITUDE_TEST_STATUS_META } from '../lib/aptitudeTestStatus';
import { findDuplicateCandidates } from '../lib/duplicateUtils';
import {
  SyncCollectionKey,
  TombstoneMap,
  SyncTombstones,
  SYNC_COLLECTION_KEYS,
  mergeCollection,
  mergeTombstones,
  stampLocalChanges
} from '../lib/syncMerge';
import { buildOfferLedgerRows } from '../lib/offerLedger';
import { shrinkAvatarDataUrl, extractAvatarFromDriveFiles } from '../lib/photoCrop';
import { agencyNameFromFolderName, findAgencyByLooseName } from '../lib/agencyMatch';
import { computeYieldMetrics, computeYieldMetricsByPosition } from '../lib/yieldMetrics';

// localStorage.setItem can throw (most commonly QuotaExceededError, likely here given candidates
// carry full-size photos and résumé text inline) without any error boundary above this provider to
// catch it. Left unguarded, that throw used to abort the whole passive-effects flush for this
// commit, silently skipping every effect declared after the one that threw — including the
// auto-backup-to-Drive effect further down. The result: an edit (e.g. a candidate's evaluation
// note) would show its normal success toast (state update always lands), but the note's own
// persist effect could throw, so the write never reached localStorage, no pending-backup flag was
// ever queued, and neither Drive nor the very reopen-this-browser self-heal path had anything to
// detect — the edit vanished with no error surfaced anywhere. Every effect that persists to
// localStorage below routes through this so one write's failure can no longer swallow the rest.
function safeSetLocalStorage(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error(`localStorage.setItem("${key}") failed:`, err);
    return false;
  }
}

// avatarUrl (a full-size base64-encoded résumé photo) and rawResumeContent (the entire original
// résumé/CV text) together make up ~91% of a typical candidate record's serialized size — measured
// across a real 44-candidate backup, avatarUrl alone was ~83%. Both are only ever written from (and
// re-read from) the shared Drive backup, never reconstructed locally, so neither is needed in the
// two purely-local-cache copies of `candidates` (the plain localStorage mirror below, and the
// syncBase snapshot further down): stripping them there is a large, safe cut to this app's
// localStorage footprint (see safeSetLocalStorage's comment above for why that footprint matters).
// Do NOT apply this to what's held in React state or pushed to Drive — only to what gets persisted
// to localStorage.
function stripHeavyCandidateFieldsForLocalStorage(candidates: Candidate[]): Omit<Candidate, 'avatarUrl' | 'rawResumeContent'>[] {
  return candidates.map(({ avatarUrl, rawResumeContent, ...rest }) => rest);
}

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
  addMeetingLog: (log: Omit<MeetingLog, 'id'>, opts?: { id?: string }) => string;
  updateMeetingLog: (log: MeetingLog, opts?: { silent?: boolean }) => void;
  patchMeetingLog: (id: string, patch: (latest: MeetingLog) => Partial<MeetingLog>) => void;
  deleteMeetingLog: (id: string) => void;
  importHistoricalMeetingLogs: () => number;
  
  // Actions
  updateCandidatePhase: (candidateId: string, newPhase: SelectionPhase, reason?: string) => void;
  updateCandidateSchedule: (
    candidateId: string,
    scheduleStatus: ScheduleStatus,
    nextDate?: string,
    nextInterviewers?: string[]
  ) => void;
  updateInterviewersForPhase: (candidateId: string, phase: SelectionPhase, interviewers: string[]) => void;
  updateScheduleForPhase: (candidateId: string, phase: SelectionPhase, status: ScheduleStatus, date?: string) => void;
  toggleSkippedPhase: (candidateId: string, phase: SelectionPhase) => void;
  updateInterviewFormatForPhase: (candidateId: string, phase: SelectionPhase, format?: InterviewFormat) => void;
  updateInterviewLogForPhase: (candidateId: string, phase: SelectionPhase, log: ImportedInterviewLog) => void;
  updateAptitudeTestStatus: (candidateId: string, status: AptitudeTestStatus) => void;
  updateOnboardingInfo: (
    candidateId: string,
    info: {
      joiningDate?: string;
      preJoinDinnerStatus?: PreJoinDinnerStatus;
      preJoinDinnerDate?: string;
      resignationNegotiationStatus?: ResignationNegotiationStatus;
      onboardingNotes?: string;
      baseMonthlySalary?: number;
      hasBonusGuarantee?: boolean;
      bonusGuaranteeInstallments?: BonusGuaranteeInstallment[];
      hasSignOnBonus?: boolean;
      signOnBonusAmount?: number;
    }
  ) => void;
  updateOnboardingChecklistItem: (candidateId: string, itemId: string, patch: { checked?: boolean; note?: string }) => void;
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
  patchCandidate: (candidateId: string, patch: Partial<Candidate>) => void;
  getLatestCandidate: (candidateId: string) => Candidate | undefined;
  runCandidateDriveTask: <R>(
    candidateId: string,
    task: (currentFolderId: string | undefined) => Promise<{ value: R; folderId?: string }>
  ) => Promise<R>;
  trackDraftDriveFolder: (folderId: string) => void;
  discardDraftDriveFolder: (folderId: string) => Promise<void>;
  mergeResumeDocuments: (candidateId: string, newFiles: { id: string; name: string; webViewLink?: string }[]) => void;
  deleteCandidate: (id: string) => void;
  restoreCandidate: (id: string) => void;
  permanentlyDeleteCandidate: (id: string) => Promise<boolean>;
  reissueCandidateId: (oldId: string) => Promise<void>;

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

  // 選考ポジションのマスタ一覧（エージェント／採用担当マスタ設定画面で追加・削除・編集）。
  positions: RecruitmentPosition[];
  updatePositions: (positions: RecruitmentPosition[]) => void;
  // positionsのlabelだけを取り出した一覧。候補者登録フォーム・詳細画面・フィルタなど
  // 「ラベル文字列の一覧が欲しいだけ」の既存の呼び出し元向け。
  positionOptions: string[];

  // アプリ内「お問い合わせ」。開発者とのチャット形式のスレッド一覧。
  inquiries: Inquiry[];
  addInquiryMessage: (category: InquiryCategory, text: string, inquiryId?: string) => string;

  // 分析ダッシュボードの「本日/指定期間の応募状況を送信」ボタンから呼ばれる。渡されたcandidates
  // (呼び出し元が対象期間・ポジションで絞り込んだもの)を元に、kindに対応するWebhook1件ごとに
  // BCA/AIX/BRE別＋その他のポジション集計を計算して送信する。Webhookが担当者マスタ／エージェント
  // 設定画面で対象採用担当者(digestTargetStaffNames)を指定していれば、その担当者に紐づくエージェント
  // だけに絞り込んで集計する(未指定なら全エージェント)。他の自動送信と同じ宛先解決・
  // 失敗時トースト表示のパターンを踏襲するが、こちらは常にユーザーのボタン操作で明示的に発火する。
  sendApplicationsDigest: (
    params: {
      kind: 'DAILY_APPLICATIONS_DIGEST' | 'PERIOD_APPLICATIONS_DIGEST';
      periodLabel: string;
      candidates: Candidate[];
    },
    opts?: { silent?: boolean }
  ) => Promise<void>;

  // Utils & Yields
  yieldMetrics: YieldMetrics[];
  filteredCandidates: Candidate[];
  archivedCandidates: Candidate[];
  myStaffRecord: InternalStaff | undefined;
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
  previewDriveSync: (options?: { notifyOnly?: boolean }) => Promise<void>;
  cancelDriveSyncPreview: () => void;
  isApplyingDriveSync: boolean;
  applyDriveSync: (selection: {
    phaseMoveCandidateIds: string[]; // Drive → アプリ: アプリのフェーズをDriveフォルダの位置に合わせる
    driveFolderMoveCandidateIds?: string[]; // アプリ → Drive: Driveフォルダをアプリの現在フェーズのフォルダへ移動する
    importKeys: string[];
    ignoreKeys: string[];
    docUpdateCandidateIds?: string[];
    duplicateResolutions?: { candidateId: string; keepFolderId: string }[];
    // 新規インポートごとに確認画面で指定した選考ポジション・主担当・エージェント（キー=importKeysのkey）
    importDetails?: Record<string, { jobTitle?: string; assignee?: string; agencyId?: string }>;
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
  'REJECTED': 0,
  'DECLINED': 0
};

// Shared by addEvaluationNote and reissueCandidateId — both build Chat notification text and need
// the same phase/format wording. Kept file-local (this codebase duplicates a phase-label map per
// component rather than sharing one globally; not something this change tries to fix everywhere).
const PHASE_LABEL_MAP: Record<SelectionPhase, string> = {
  DOCUMENT_SCREENING: '書類選考',
  CASUAL_INTERVIEW: 'カジュアル面談',
  FIRST_INTERVIEW: '1次面接',
  SECOND_INTERVIEW: '2次面接',
  FINAL_INTERVIEW: '最終面接',
  OFFER_ISSUED: '内定通知',
  OFFER_ACCEPTED: '内定承諾',
  REJECTED: '見送り',
  DECLINED: '選考辞退'
};
const INTERVIEW_FORMAT_LABEL_MAP: Record<InterviewFormat, string> = { IN_PERSON: '対面', ONLINE: 'オンライン' };

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

  const [candidates, setCandidatesRaw] = useState<Candidate[]>(() => {
    if (needsDemoDataMigration) return [];
    const saved = localStorage.getItem('ats_candidates');
    return saved ? (JSON.parse(saved) as Candidate[]).map(migrateLegacyPhase) : [];
  });

  const [agencies, setAgenciesRaw] = useState<Agency[]>(() => {
    if (needsDemoDataMigration) return [];
    const saved = localStorage.getItem('ats_agencies');
    return saved ? JSON.parse(saved) : [];
  });

  const [staffList, setStaffListRaw] = useState<InternalStaff[]>(() => {
    if (needsDemoDataMigration) return [];
    const saved = localStorage.getItem('ats_staff_list');
    return saved ? JSON.parse(saved) : [];
  });

  const [meetingLogs, setMeetingLogsRaw] = useState<MeetingLog[]>(() => {
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
  const [groupChatWebhooks, setGroupChatWebhooksRaw] = useState<ChatWebhook[]>(() => {
    const saved = localStorage.getItem('ats_group_chat_webhooks');
    return saved ? JSON.parse(saved) : [];
  });

  // 選考ポジションのマスタ一覧。demoデータ移行の対象外（DEFAULT_POSITIONSは実際に本番で
  // 使われている値そのものであり、他のコレクションのような「偽のサンプルデータ」ではない）。
  const [positions, setPositionsRaw] = useState<RecruitmentPosition[]>(() => {
    const saved = localStorage.getItem('ats_positions');
    return saved ? migrateLegacyPositions(JSON.parse(saved)) : DEFAULT_POSITIONS;
  });

  // アプリ内「お問い合わせ」スレッド一覧。他のバックアップ対象データと同じ扱い（localStorage
  // 即時保存＋Driveへも他データと合わせてバックアップ）。
  const [inquiries, setInquiries] = useState<Inquiry[]>(() => {
    const saved = localStorage.getItem('ats_inquiries');
    return saved ? JSON.parse(saved) : [];
  });

  // Explicit deletion markers for the synced collections (see mergeCollection). Persisted and
  // re-read from localStorage on every change so two tabs in the same browser never overwrite each
  // other's markers, and shipped inside the Drive backup so every device honors them.
  const SYNC_TOMBSTONES_KEY = 'ats_sync_tombstones';
  const readStoredTombstones = (): SyncTombstones => {
    try {
      const saved = localStorage.getItem(SYNC_TOMBSTONES_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  };
  const tombstonesRef = useRef<SyncTombstones>(mergeTombstones(readStoredTombstones()));
  const absorbTombstones = (incoming?: SyncTombstones | null): SyncTombstones => {
    tombstonesRef.current = mergeTombstones(readStoredTombstones(), tombstonesRef.current, incoming);
    safeSetLocalStorage(SYNC_TOMBSTONES_KEY, tombstonesRef.current);
    return tombstonesRef.current;
  };

  // Candidates loaded from localStorage at startup lack avatarUrl/rawResumeContent (stripped to save
  // space, see stripHeavyCandidateFieldsForLocalStorage). Until the first Drive read fills them
  // back in, an edit to such a candidate must not push "no photo / no résumé text" over Drive's
  // full copy — fillUnloadedHeavyFields restores them from the remote copy during merges.
  const heavyFieldsUnloadedIdsRef = useRef<Set<string>>(new Set(candidates.map((c) => c.id)));
  const fillUnloadedHeavyFields = (merged: Candidate[], remote: Candidate[] | undefined): Candidate[] => {
    const pending = heavyFieldsUnloadedIdsRef.current;
    if (!remote || pending.size === 0) return merged;
    const remoteMap = new Map(remote.map((c) => [c.id, c]));
    const filled = merged.map((c) => {
      if (!pending.has(c.id)) return c;
      const r = remoteMap.get(c.id);
      if (!r) return c;
      const needsAvatar = c.avatarUrl === undefined && r.avatarUrl !== undefined;
      const needsRaw = c.rawResumeContent === undefined && r.rawResumeContent !== undefined;
      if (!needsAvatar && !needsRaw) return c;
      return {
        ...c,
        ...(needsAvatar ? { avatarUrl: r.avatarUrl } : {}),
        ...(needsRaw ? { rawResumeContent: r.rawResumeContent } : {})
      };
    });
    return filled;
  };

  // The setters every user-driven change goes through: they stamp changed records and tombstone
  // removed ones (stampLocalChanges) so the Drive merge can tell a fresh local edit or deletion
  // apart from a stale copy. The *Raw setters are reserved for applying data that came from
  // Drive/merges, which must keep the stamps they arrived with.
  const makeTrackedSetter = <T extends { id: string }>(
    key: SyncCollectionKey,
    raw: React.Dispatch<React.SetStateAction<T[]>>
  ): React.Dispatch<React.SetStateAction<T[]>> =>
    (action) =>
      raw((prev) => {
        const next = typeof action === 'function' ? (action as (p: T[]) => T[])(prev) : action;
        return stampLocalChanges(prev, next, (removed) => absorbTombstones({ [key]: removed }));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setCandidates = useCallback(makeTrackedSetter<Candidate>('candidates', setCandidatesRaw), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setAgencies = useCallback(makeTrackedSetter<Agency>('agencies', setAgenciesRaw), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setStaffList = useCallback(makeTrackedSetter<InternalStaff>('staffList', setStaffListRaw), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setMeetingLogs = useCallback(makeTrackedSetter<MeetingLog>('meetingLogs', setMeetingLogsRaw), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setGroupChatWebhooks = useCallback(makeTrackedSetter<ChatWebhook>('groupChatWebhooks', setGroupChatWebhooksRaw), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setPositions = useCallback(makeTrackedSetter<RecruitmentPosition>('positions', setPositionsRaw), []);

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

  // Highest CAND-#### number ever issued anywhere, including ones later permanently deleted.
  // addCandidate's own floor (maxExistingIdNum, below) only looks at currently-*live* candidates,
  // so a permanently-deleted candidate's number was free for the very next addCandidate call
  // anywhere to reuse — harmless to the candidates list itself, but not to anything else keyed by
  // candidate id that outlives the deleted record: a Google Chat thread (threadKey
  // `cand-${candidateId}`, see document-screening-thread.ts) from the old candidate was still
  // sitting in the shared space, so a brand-new, unrelated candidate issued that same recycled
  // number had their own 書類選考通過 notification silently posted as a reply into the old
  // candidate's thread instead of starting its own (confirmed in production — see CAND-0013).
  // Persisted locally and, via candidateIdSeq in the shared Drive backup below, across devices too
  // — a monotonic max, never allowed to decrease, so restoring/polling/backing-up from any device
  // can only push this forward, never regress it.
  const CANDIDATE_ID_SEQ_KEY = 'ats_candidate_id_seq';
  const candidateIdSeqRef = useRef<number>(
    typeof window !== 'undefined' ? parseInt(localStorage.getItem(CANDIDATE_ID_SEQ_KEY) || '0', 10) || 0 : 0
  );
  const bumpCandidateIdSeq = (value: number) => {
    if (!value || value <= candidateIdSeqRef.current) return;
    candidateIdSeqRef.current = value;
    localStorage.setItem(CANDIDATE_ID_SEQ_KEY, String(value));
  };

  // 「本日の応募状況」自動送信（毎日16時以降、初めて開いたブラウザが送る）の
  // 「今日はもう送信済みか」を管理する。サーバーcron・サービスアカウントが存在しない構成上、
  // 正確に16:00:00に発火することは保証できず、16時以降に誰かがこのアプリを開いた（または
  // 開きっぱなしのタブが次のチェック間隔を迎えた）タイミングでの発火になる — 詳細はこの値を
  // 使うuseEffect（DAILY_DIGEST_CHECK_INTERVAL_MSの宣言付近）参照。
  const DAILY_DIGEST_DATE_KEY = 'ats_daily_digest_last_run';
  const dailyDigestDateRef = useRef<string>(
    typeof window !== 'undefined' ? localStorage.getItem(DAILY_DIGEST_DATE_KEY) || '' : ''
  );
  const bumpDailyDigestDate = (value?: string) => {
    if (!value || value <= dailyDigestDateRef.current) return;
    dailyDigestDateRef.current = value;
    localStorage.setItem(DAILY_DIGEST_DATE_KEY, value);
  };

  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    agencyId: 'ALL',
    assigneeName: 'ALL',
    scheduleStatus: 'ALL',
    phase: 'ALL',
    appliedMonth: 'ALL',
    positions: []
  });

  // Throttled so a single bad commit (up to 9 of these effects firing together) can't spam 9
  // identical toasts — one warning per 10s window is plenty to get the user's attention.
  const localStorageFailureToastAtRef = useRef(0);
  const warnLocalStorageFailure = () => {
    const now = Date.now();
    if (now - localStorageFailureToastAtRef.current > 10_000) {
      localStorageFailureToastAtRef.current = now;
      showToast(
        'この端末への保存に失敗したため、今回の変更はDriveに同期されません（ブラウザの保存容量が上限に達している可能性があります）。不要なタブを閉じてから、もう一度操作をやり直してください。',
        'warning'
      );
    }
  };

  // Save to localStorage on state changes
  useEffect(() => {
    if (!safeSetLocalStorage('ats_candidates', stripHeavyCandidateFieldsForLocalStorage(candidates))) warnLocalStorageFailure();
  }, [candidates]);

  useEffect(() => {
    if (!safeSetLocalStorage('ats_agencies', agencies)) warnLocalStorageFailure();
  }, [agencies]);

  useEffect(() => {
    if (!safeSetLocalStorage('ats_staff_list', staffList)) warnLocalStorageFailure();
  }, [staffList]);

  useEffect(() => {
    if (!safeSetLocalStorage('ats_meeting_logs', meetingLogs)) warnLocalStorageFailure();
  }, [meetingLogs]);

  useEffect(() => {
    if (!safeSetLocalStorage('ats_group_chat_webhooks', groupChatWebhooks)) warnLocalStorageFailure();
  }, [groupChatWebhooks]);

  useEffect(() => {
    if (!safeSetLocalStorage('ats_positions', positions)) warnLocalStorageFailure();
  }, [positions]);

  useEffect(() => {
    if (!safeSetLocalStorage('ats_inquiries', inquiries)) warnLocalStorageFailure();
  }, [inquiries]);


  useEffect(() => {
    if (!safeSetLocalStorage('ats_deleted_drive_item_ids', deletedDriveItemIds)) warnLocalStorageFailure();
  }, [deletedDriveItemIds]);

  // Always-fresh snapshot of everything backupToDrive bundles together, read from inside the
  // debounced timeout below rather than captured in its closure — by the time the timeout fires,
  // candidates/agencies/staffList may have moved on from whatever they were when the meetingLogs
  // change that scheduled it happened, and the Drive backup should reflect the latest, not a
  // slightly-stale snapshot from several seconds earlier.
  const latestBackupStateRef = useRef({ candidates, agencies, staffList, meetingLogs, groupChatWebhooks, positions, inquiries });
  useEffect(() => {
    latestBackupStateRef.current = { candidates, agencies, staffList, meetingLogs, groupChatWebhooks, positions, inquiries };
  });

  // The merge base for mergeCollection (above): each collection as of the last time this tab
  // confirmed it matched Drive — either just pulled via restore/poll, or just pushed by this tab's
  // own successful write. Persisted so a reload doesn't forget it and treat every locally-cached
  // record as "new since base" (which would be harmless — mergeCollection keeps those — but would
  // also make an actually-already-synced remote edit look like a same-id conflict instead of a
  // clean remote-wins case). Seeded from whatever this tab loaded at mount; the first successful
  // restore or backup after that replaces it with a real synced snapshot.
  const SYNC_BASE_KEYS = {
    candidates: 'ats_sync_base_candidates',
    agencies: 'ats_sync_base_agencies',
    staffList: 'ats_sync_base_staff_list',
    meetingLogs: 'ats_sync_base_meeting_logs',
    groupChatWebhooks: 'ats_sync_base_group_chat_webhooks',
    positions: 'ats_sync_base_positions'
  } as const;
  const syncBaseRef = useRef<{
    candidates: Candidate[];
    agencies: Agency[];
    staffList: InternalStaff[];
    meetingLogs: MeetingLog[];
    groupChatWebhooks: ChatWebhook[];
    positions: RecruitmentPosition[];
  }>({
    candidates: (() => {
      const saved = localStorage.getItem(SYNC_BASE_KEYS.candidates);
      return saved ? JSON.parse(saved) : candidates;
    })(),
    agencies: (() => {
      const saved = localStorage.getItem(SYNC_BASE_KEYS.agencies);
      return saved ? JSON.parse(saved) : agencies;
    })(),
    staffList: (() => {
      const saved = localStorage.getItem(SYNC_BASE_KEYS.staffList);
      return saved ? JSON.parse(saved) : staffList;
    })(),
    meetingLogs: (() => {
      const saved = localStorage.getItem(SYNC_BASE_KEYS.meetingLogs);
      return saved ? JSON.parse(saved) : meetingLogs;
    })(),
    groupChatWebhooks: (() => {
      const saved = localStorage.getItem(SYNC_BASE_KEYS.groupChatWebhooks);
      return saved ? JSON.parse(saved) : groupChatWebhooks;
    })(),
    positions: (() => {
      const saved = localStorage.getItem(SYNC_BASE_KEYS.positions);
      return saved ? JSON.parse(saved) : positions;
    })()
  });
  const updateSyncBase = (partial: Partial<typeof syncBaseRef.current>) => {
    // syncBaseRef.current itself always keeps the full candidate records (photo/résumé text
    // included) — mergeCollection's base/local/remote three-way comparison needs them to actually
    // match what Drive and React state hold, or every candidate would look "changed since base"
    // just because these two heavy fields are missing from base. Only the localStorage mirror of
    // it is stripped, same as the plain 'ats_candidates' cache above and for the same reason.
    syncBaseRef.current = { ...syncBaseRef.current, ...partial };
    (Object.keys(partial) as (keyof typeof SYNC_BASE_KEYS)[]).forEach((key) => {
      const valueToPersist =
        key === 'candidates' ? stripHeavyCandidateFieldsForLocalStorage(syncBaseRef.current.candidates) : syncBaseRef.current[key];
      if (!safeSetLocalStorage(SYNC_BASE_KEYS[key], valueToPersist)) warnLocalStorageFailure();
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

  // --- Drive sync pipeline -------------------------------------------------------------------
  // Everything this tab writes to or applies from the shared bloom_ats_backup.json goes through the
  // helpers below. Guarantees, in order of importance:
  //  1. Nothing is ever dropped just because one side lacks it (see mergeCollection) — only an
  //     explicit tombstone deletes.
  //  2. Writes are compare-and-swap on the Drive file version: if anyone wrote after we read, the
  //     server answers 409 and we re-read, re-merge and retry instead of overwriting their work.
  //  3. Writes from this tab never overlap each other (backupChainRef), and a write is skipped
  //     entirely when this tab has nothing Drive doesn't already have — fewer writes, fewer races.
  //  4. When a read shows Drive is missing something this tab has (e.g. a candidate lost to an
  //     older race), this tab pushes it back instead of quietly keeping it only for itself.
  type SyncCollections = {
    candidates: Candidate[];
    agencies: Agency[];
    staffList: InternalStaff[];
    meetingLogs: MeetingLog[];
    groupChatWebhooks: ChatWebhook[];
    positions: RecruitmentPosition[];
  };

  // JSON of the inquiries list as last written to / read from Drive (inquiries are not id-merged,
  // see performBackupOnce). null = unknown, which counts as "may need writing".
  const syncedInquiriesJsonRef = useRef<string | null>(null);
  const backupChainRef = useRef<Promise<void>>(Promise.resolve());

  const normalizeRemoteCollections = (data: any): Partial<SyncCollections> => ({
    ...(Array.isArray(data?.candidates) ? { candidates: (data.candidates as Candidate[]).map(migrateLegacyPhase) } : {}),
    ...(Array.isArray(data?.agencies) ? { agencies: data.agencies as Agency[] } : {}),
    ...(Array.isArray(data?.staffList) ? { staffList: data.staffList as InternalStaff[] } : {}),
    ...(Array.isArray(data?.meetingLogs) ? { meetingLogs: data.meetingLogs as MeetingLog[] } : {}),
    ...(Array.isArray(data?.groupChatWebhooks) ? { groupChatWebhooks: data.groupChatWebhooks as ChatWebhook[] } : {}),
    ...(Array.isArray(data?.positions) ? { positions: migrateLegacyPositions(data.positions) } : {})
  });

  // A collection missing from the remote payload (older backup format) merges as "remote agrees
  // with local", i.e. local is kept as-is.
  const mergeAllCollections = (
    base: SyncCollections,
    local: SyncCollections,
    remote: Partial<SyncCollections>,
    tomb: SyncTombstones
  ): SyncCollections => ({
    candidates: fillUnloadedHeavyFields(
      mergeCollection(base.candidates, local.candidates, remote.candidates ?? local.candidates, tomb.candidates),
      remote.candidates
    ),
    agencies: mergeCollection(base.agencies, local.agencies, remote.agencies ?? local.agencies, tomb.agencies),
    staffList: mergeCollection(base.staffList, local.staffList, remote.staffList ?? local.staffList, tomb.staffList),
    meetingLogs: mergeCollection(base.meetingLogs, local.meetingLogs, remote.meetingLogs ?? local.meetingLogs, tomb.meetingLogs),
    groupChatWebhooks: mergeCollection(
      base.groupChatWebhooks,
      local.groupChatWebhooks,
      remote.groupChatWebhooks ?? local.groupChatWebhooks,
      tomb.groupChatWebhooks
    ),
    positions: mergeCollection(base.positions, local.positions, remote.positions ?? local.positions, tomb.positions)
  });

  // Folds a merge result into live state without clobbering anything edited while the merge's
  // network round-trip was in flight: `snapshot` is the local state the merge was computed from,
  // so "snapshot -> current state" is exactly what changed locally in the meantime, and it is
  // merged over `merged` rather than overwritten by it (this is what used to wipe a candidate
  // registered while a backup was still uploading). Functional updates, so even a state change
  // queued but not yet rendered is respected.
  const reconcileIntoState = (snapshot: SyncCollections, merged: SyncCollections) => {
    const tomb = tombstonesRef.current;
    const apply = <T extends { id: string }>(
      raw: React.Dispatch<React.SetStateAction<T[]>>,
      snap: T[],
      mergedList: T[],
      tombMap: TombstoneMap | undefined
    ) =>
      raw((prev) => {
        const next = mergeCollection(snap, prev, mergedList, tombMap);
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      });
    apply(setCandidatesRaw, snapshot.candidates, merged.candidates, tomb.candidates);
    apply(setAgenciesRaw, snapshot.agencies, merged.agencies, tomb.agencies);
    apply(setStaffListRaw, snapshot.staffList, merged.staffList, tomb.staffList);
    apply(setMeetingLogsRaw, snapshot.meetingLogs, merged.meetingLogs, tomb.meetingLogs);
    apply(setGroupChatWebhooksRaw, snapshot.groupChatWebhooks, merged.groupChatWebhooks, tomb.groupChatWebhooks);
    apply(setPositionsRaw, snapshot.positions, merged.positions, tomb.positions);
  };

  const hasUnsyncedLocalChanges = (): boolean => {
    const local = latestBackupStateRef.current;
    const base = syncBaseRef.current;
    if (SYNC_COLLECTION_KEYS.some((key) => JSON.stringify(local[key]) !== JSON.stringify(base[key]))) return true;
    return JSON.stringify(local.inquiries) !== syncedInquiriesJsonRef.current;
  };

  // True when `remote` already carries every deletion marker in `local`.
  const tombstonesCovered = (remote: SyncTombstones | undefined, local: SyncTombstones): boolean =>
    SYNC_COLLECTION_KEYS.every((key) =>
      Object.entries(local[key] || {}).every(([id, at]) => (remote?.[key]?.[id] ?? -1) >= at)
    );

  // One read-merge-write cycle, retried on version conflicts. Throws on anything else so the
  // caller's backoff/toast handling applies.
  const performBackupOnce = async (token: string, options: { force?: boolean } = {}): Promise<void> => {
    for (let attempt = 0; ; attempt++) {
      if (!options.force && !hasUnsyncedLocalChanges()) return;

      let remote: any = null;
      try {
        remote = await restoreFromDriveApi(token);
      } catch (err: any) {
        // 404 = nothing has ever been backed up: the first write creates the file. Any other read
        // failure means we don't know what's on Drive, so we must not write blind over it.
        if (err.status !== 404) throw err;
      }
      if (remote) {
        // Monotonic maxes, not merges — see candidateIdSeqRef's declaration.
        bumpCandidateIdSeq(remote.candidateIdSeq);
        bumpDailyDigestDate(remote.dailyApplicationsDigestLastSentDate);
      }
      const tomb = absorbTombstones(remote?.syncTombstones);
      const localAtMergeTime = latestBackupStateRef.current;
      const merged = mergeAllCollections(
        syncBaseRef.current,
        localAtMergeTime,
        remote ? normalizeRemoteCollections(remote) : {},
        tomb
      );

      let result: { backedUpAt?: string };
      try {
        result = await backupToDriveApi(
          token,
          {
            // inquiries stays a plain overwrite (not an id-keyed collection mergeCollection handles);
            // it changes rarely enough that this hasn't been a reported problem.
            inquiries: localAtMergeTime.inquiries,
            ...merged,
            syncTombstones: tomb,
            candidateIdSeq: candidateIdSeqRef.current,
            dailyApplicationsDigestLastSentDate: dailyDigestDateRef.current
          },
          remote?.driveFileVersion
        );
      } catch (err: any) {
        if (err.status === 409 && attempt < 6) {
          // Someone wrote between our read and our write. Back off a random moment (so two tabs
          // that collided don't collide again in lockstep) and redo the whole read-merge-write.
          await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 1200));
          continue;
        }
        throw err;
      }

      // Tabs only ever compare these for equality (see the poll), so whose clock stamped it doesn't matter.
      if (result.backedUpAt) setLastAppliedBackupAt(result.backedUpAt);
      updateSyncBase(merged);
      syncedInquiriesJsonRef.current = JSON.stringify(localAtMergeTime.inquiries);
      heavyFieldsUnloadedIdsRef.current = new Set();
      reconcileIntoState(localAtMergeTime, merged);
      return;
    }
  };

  const performBackup = (token: string, options: { force?: boolean } = {}): Promise<void> => {
    const run = backupChainRef.current.catch(() => {}).then(() => performBackupOnce(token, options));
    backupChainRef.current = run.catch(() => {});
    return run;
  };

  // Performs one backup and, on failure, reschedules itself with exponential backoff (capped at
  // 2 min) instead of giving up until the next unrelated edit happens to reschedule the normal
  // debounce below — an evaluation note typed right as Drive drops out still reaches the shared
  // backup once the connection comes back. The note itself is always safe in localStorage.
  const attemptBackup = () => {
    const token = driveAccessTokenRef.current;
    if (!token) {
      // Signed out / disconnected mid-retry — nothing left to protect against the poll for.
      pendingLocalWriteRef.current = false;
      return;
    }
    performBackup(token)
      .then(() => {
        backupRetryCountRef.current = 0;
        pendingLocalWriteRef.current = false;
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
        // A dead/expired token won't fix itself by retrying the same request — re-auth right away;
        // the next retry picks up whatever token driveAccessTokenRef ends up holding.
        if (isAuthExpired) authRefreshNow();
        // pendingLocalWriteRef stays true: the write hasn't landed, so the poll keeps deferring.
        backupRetryCountRef.current = Math.min(backupRetryCountRef.current + 1, 5);
        const retryDelay = Math.min(5000 * 2 ** backupRetryCountRef.current, 120_000);
        autoBackupTimerRef.current = setTimeout(attemptBackup, retryDelay);
      });
  };

  const scheduleBackup = (delayMs: number) => {
    if (!driveAccessTokenRef.current) return;
    if (autoBackupTimerRef.current) clearTimeout(autoBackupTimerRef.current);
    pendingLocalWriteRef.current = true;
    autoBackupTimerRef.current = setTimeout(attemptBackup, delayMs);
  };

  // Backs up a couple of seconds after any synced collection stops changing (every phase drag,
  // field edit, MTG note, master-data edit). Skips the mount run. State changes that merely applied
  // Drive's own data are filtered out inside performBackupOnce (nothing unsynced -> no write).
  useEffect(() => {
    if (!autoBackupMountedRef.current) {
      autoBackupMountedRef.current = true;
      return;
    }
    if (!driveAccessToken) return;
    backupRetryCountRef.current = 0;
    // 2秒: 採用MTG中の打鍵の合間でも他の参加者への反映が遅れすぎない程度に短く、連続入力中に
    // 毎回書き込まない程度に長く（最後の変更から2秒後の1回だけ）。
    scheduleBackup(2000);

    return () => {
      if (autoBackupTimerRef.current) clearTimeout(autoBackupTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, agencies, staffList, meetingLogs, groupChatWebhooks, positions, inquiries, driveAccessToken]);

  // 内定者台帳（Drive「内定者台帳」フォルダ）への自動蓄積。内定者の氏名・年齢・現職・オファー金額・
  // 手数料の行が変わったら、最後の変更の5秒後に送る。台帳側は追記・更新のみで削除せず、空値で既存の
  // 金額を上書きもしないので、アプリ側のデータが消えても台帳には最後の値が残る。最初のDrive読込が
  // 終わるまで送らない（古いローカルの値を先に書かないため）。失敗しても黙って次の変更時に再送する。
  const lastLedgerJsonRef = useRef('');
  useEffect(() => {
    if (!driveAccessToken || isBootstrapping) return;
    const rows = buildOfferLedgerRows(candidates, agencies);
    if (rows.length === 0) return;
    const json = JSON.stringify(rows);
    if (json === lastLedgerJsonRef.current) return;
    const timer = setTimeout(() => {
      saveOfferLedger(driveAccessToken, rows)
        .then(() => {
          lastLedgerJsonRef.current = json;
        })
        .catch(() => {});
    }, 5000);
    return () => clearTimeout(timer);
  }, [candidates, agencies, driveAccessToken, isBootstrapping]);

  // One-time shrink of oversized résumé photos already stored in the shared backup (they used to be
  // saved at full crop resolution, which is what pushed the backup past the size the sync could
  // carry). Waits until a Drive read has filled in the photos (they're absent from localStorage),
  // and only replaces a photo that is still the one it shrank, so a concurrent re-crop wins.
  const avatarShrinkStartedRef = useRef(false);
  useEffect(() => {
    if (!driveAccessToken || avatarShrinkStartedRef.current || heavyFieldsUnloadedIdsRef.current.size > 0) return;
    avatarShrinkStartedRef.current = true;
    (async () => {
      const shrunkByOriginal = new Map<string, string>();
      for (const c of latestBackupStateRef.current.candidates) {
        if (!c.avatarUrl || shrunkByOriginal.has(c.avatarUrl)) continue;
        const shrunk = await shrinkAvatarDataUrl(c.avatarUrl).catch(() => null);
        if (shrunk) shrunkByOriginal.set(c.avatarUrl, shrunk);
      }
      if (shrunkByOriginal.size === 0) return;
      setCandidates((prev) =>
        prev.map((c) => (c.avatarUrl && shrunkByOriginal.has(c.avatarUrl) ? { ...c, avatarUrl: shrunkByOriginal.get(c.avatarUrl) } : c))
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveAccessToken, candidates]);

  // Applies a Drive snapshot (login restore, background poll, manual 復元) by merging it into this
  // tab's state — never by overwriting, so edits Drive doesn't have yet survive. If the merge shows
  // this tab holds something Drive lacks, a write is scheduled to put it back.
  const applyDriveSnapshotMerged = (data: any) => {
    const remote = normalizeRemoteCollections(data);
    const tomb = absorbTombstones(data?.syncTombstones);
    const local = latestBackupStateRef.current;
    const merged = mergeAllCollections(syncBaseRef.current, local, remote, tomb);
    reconcileIntoState(local, merged);
    if (Array.isArray(data?.inquiries)) {
      setInquiries(data.inquiries);
      syncedInquiriesJsonRef.current = JSON.stringify(data.inquiries);
    }
    if (data?.candidateIdSeq) bumpCandidateIdSeq(data.candidateIdSeq);
    bumpDailyDigestDate(data?.dailyApplicationsDigestLastSentDate);
    if (data?.backedUpAt) setLastAppliedBackupAt(data.backedUpAt);
    if (remote.candidates) heavyFieldsUnloadedIdsRef.current = new Set();

    // The base is what Drive actually holds now — not the merged result — so anything this tab
    // kept that Drive lacks counts as an unsynced local change and gets written back.
    updateSyncBase(remote);
    const driveIsMissingSomething =
      SYNC_COLLECTION_KEYS.some((key) => remote[key] && JSON.stringify(merged[key]) !== JSON.stringify(remote[key])) ||
      !tombstonesCovered(data?.syncTombstones, tomb);
    if (driveIsMissingSomething) scheduleBackup(1000);
  };

  // Restores from Drive once per login (merged, see applyDriveSnapshotMerged). Guarded by a ref so
  // AuthGate's periodic token refresh doesn't re-trigger it.
  const hasAutoRestoredRef = useRef(false);
  useEffect(() => {
    if (!driveAccessToken || hasAutoRestoredRef.current) return;
    hasAutoRestoredRef.current = true;
    // Whatever the outcome (restored, nothing backed up yet, or a failure), there's nothing further
    // for the bootstrap screen to wait on.
    restoreFromDrive({ silent: true }).finally(() => {
      setIsBootstrapping(false);
      if (needsDemoDataMigration) localStorage.setItem(DEMO_DATA_MIGRATION_KEY, '1');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveAccessToken]);

  // Keeps every open tab in sync without a push channel: every 10s, and immediately when the tab
  // regains focus, re-reads Drive and merges it in if anyone has written since this tab last wrote
  // or applied. Skipped while the tab is hidden, and while this tab's own write is pending.
  const DRIVE_POLL_INTERVAL_MS = 10000;
  const lastPolledVersionRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!driveAccessToken) return;

    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      if (pendingLocalWriteRef.current) return;
      try {
        // Version first (a few hundred bytes) so an idle team isn't each downloading the whole
        // backup every 10 seconds; the full read only happens when someone actually wrote.
        const version = await getBackupVersionApi(driveAccessToken);
        if (version && version === lastPolledVersionRef.current) return;
        const data = await restoreFromDriveApi(driveAccessToken);
        if (cancelled || pendingLocalWriteRef.current) return;
        lastPolledVersionRef.current = data.driveFileVersion;
        if (!data.backedUpAt) return;
        // Equality, not "<=": any different value means someone else wrote. (Comparing timestamps
        // from different devices' clocks used to make a device whose clock ran ahead ignore other
        // people's changes until its clock caught up.)
        if (data.backedUpAt === lastAppliedBackupAtRef.current) return;
        applyDriveSnapshotMerged(data);
      } catch (err: any) {
        // Silent — a background poll failing isn't worth a toast; explicit actions still surface
        // real failures. A dead token still gets an immediate self-heal attempt.
        console.error('Background Drive poll failed:', err);
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

  // Always-fresh snapshot for the daily-digest effect below, same reasoning as
  // latestBackupStateRef. Its setInterval callback is created once (deps=[driveAccessToken]) and
  // can run for hours, so closing over `candidates`/`agencies` directly would freeze them at
  // whatever they were when the interval was set up instead of picking up same-day edits.
  const latestAttentionStateRef = useRef({ candidates, agencies, staffList, groupChatWebhooks });
  useEffect(() => {
    latestAttentionStateRef.current = { candidates, agencies, staffList, groupChatWebhooks };
  });

  // 「本日の応募状況」ダイジェストを毎日16時以降に自動送信する。DashboardViewの手動ボタン
  // （sendApplicationsDigest呼び出し）と全く同じ計算・送信経路を使い、silent:trueで成功/警告の
  // トーストだけ抑える（失敗トーストは出す — 自動送信でも本当に送信エラーが起きたことは気づける
  // 方がよい）。サーバーcron・サービスアカウントが存在しない構成上、正確に16:00:00には発火
  // できない — 16時以降に誰かがこのアプリを開いている（または開きっぱなしのタブが次のチェック
  // 間隔を迎える）タイミングでの発火になる。「今日はもう送信済みか」はdailyDigestDateRefで
  // 判定し、これはDrive共有バックアップ経由でチーム全体に同期されるため、複数人が16時以降に
  // 別々にログインしても重複送信されない。
  const DAILY_DIGEST_HOUR = 16;
  const DAILY_DIGEST_CHECK_INTERVAL_MS = 60000;
  useEffect(() => {
    if (!driveAccessToken) return;

    const checkAndSendDailyDigest = async () => {
      const now = new Date();
      if (now.getHours() < DAILY_DIGEST_HOUR) return;

      const today = new Date().toISOString().split('T')[0];
      if (dailyDigestDateRef.current === today) return;

      // 送信前にDriveの最新値を確認し、他のブラウザが既に今日分を送っていないか再確認する
      // （完全な排他ロックではないが、ほぼ同時に複数ブラウザが16時を迎えた場合の重複リスクを
      // 縮小する）。
      try {
        const remote = await restoreFromDriveApi(driveAccessTokenRef.current || driveAccessToken);
        bumpDailyDigestDate(remote.dailyApplicationsDigestLastSentDate);
      } catch {
        // Best-effort — fall through with whatever's already known locally.
      }
      if (dailyDigestDateRef.current === today) return;

      // 送信前に「今日は送信済み」を確定させてからDriveへ書き戻す — 送信自体に時間がかかる間に
      // 他のブラウザの次のチェックがすり抜けて二重送信するリスクを下げる。
      bumpDailyDigestDate(today);
      attemptBackup();

      const { candidates: latestCandidates } = latestAttentionStateRef.current;
      const todaysCandidates = latestCandidates.filter((c) => c.appliedDate === today);
      await sendApplicationsDigest(
        {
          kind: 'DAILY_APPLICATIONS_DIGEST',
          periodLabel: `本日（${today}）`,
          candidates: todaysCandidates
        },
        { silent: true }
      );
    };

    checkAndSendDailyDigest();
    const intervalId = setInterval(checkAndSendDailyDigest, DAILY_DIGEST_CHECK_INTERVAL_MS);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveAccessToken]);

  // `opts.id` lets the caller use a deterministic id (one per MTG date, see RecruitmentMeetingView)
  // so two people creating the same day's MTG at once end up merged into one log on sync instead
  // of each typing into their own copy. If that id is already present locally, nothing is added.
  const addMeetingLog = (newLogData: Omit<MeetingLog, 'id'>, opts?: { id?: string }) => {
    const id = opts?.id || `mtg-${Date.now()}`;
    const newLog: MeetingLog = { ...newLogData, id };
    setMeetingLogs((prev) => (prev.some((m) => m.id === id) ? prev : [newLog, ...prev]));
    showToast(`MTGログ 「${newLog.title}」 を作成しました`, 'success');
    return id;
  };

  // Applies only the fields `patch` returns, computed from the *latest* state of that log — not
  // from a copy captured at render time. updateMeetingLog({...activeMeeting, x}) wrote the whole
  // log back, so anything merged in from another member between that render and the write (their
  // report text, an action item) was silently overwritten.
  const patchMeetingLog = (id: string, patch: (latest: MeetingLog) => Partial<MeetingLog>) => {
    setMeetingLogs((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch(m) } : m)));
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

  // 移動が失敗した場合の再試行カウント・保留中タイマー（Drive項目IDごと）。attemptBackupと同じ
  // 指数バックオフ（5秒 * 2^試行回数、上限2分）パターン。このMap自体はページを開いている間だけの
  // メモリ上の値なので、リロード・再ログインのたびに0から数え直される。
  const moveRetryCountRef = useRef<Map<string, number>>(new Map());
  const moveRetryTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // 1セッションのうちにこの回数まで自動リトライしたら、そのセッションでは諦める（トースト1本だけ
  // 出して以降は無言でリトライし続けない）。5秒*2^8で上限の2分に達したあとも数回試す計算で、
  // 合計十数分は粘る。永久に無言でリトライし続けてDrive APIを叩き続ける事態を防ぎつつ、次回
  // ログイン時の起動時チェックでは0から再度チャンスを与える。
  const MAX_MOVE_RETRIES_PER_SESSION = 8;

  // 「まだDriveへの反映が確認できていない移動」を端末に永続化しておく。以前はfire-and-forgetで
  // 一度失敗する（またはタブを閉じてリトライが完走しない）とその候補者のファイルが古いフェーズ
  // フォルダに永久に取り残されていた — Driveバックアップの自動再試行と同じ
  // 考え方で、次回このアプリを開いた時に自動で再開できるようにする。キーはDrive項目ID。1項目に
  // つき最新の移動先だけ持てば十分（同じ項目に連続でフェーズ変更が入っても、最終的に反映される
  // べきなのは最後の値だけ）。pendingSinceは「その移動先が最後に指定された時刻」— 起動時チェック
  // が、フォルダ削除・候補者削除など何らかの理由で本当に成立しなくなった古い保留(既定30日)を
  // 無限に持ち続けないための目安に使う。
  interface PendingDriveMoveEntry {
    phase: string;
    pendingSince: number;
  }
  const PENDING_DRIVE_MOVES_KEY = 'ats_pending_drive_moves';
  const STALE_PENDING_MOVE_MS = 30 * 24 * 60 * 60 * 1000;
  const readPendingDriveMoves = (): Record<string, PendingDriveMoveEntry> => {
    try {
      const saved = localStorage.getItem(PENDING_DRIVE_MOVES_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  };
  const writePendingDriveMove = (driveItemId: string, phase: string) => {
    const pending = readPendingDriveMoves();
    pending[driveItemId] = { phase, pendingSince: Date.now() };
    localStorage.setItem(PENDING_DRIVE_MOVES_KEY, JSON.stringify(pending));
  };
  const clearPendingDriveMove = (driveItemId: string) => {
    const pending = readPendingDriveMoves();
    if (driveItemId in pending) {
      delete pending[driveItemId];
      localStorage.setItem(PENDING_DRIVE_MOVES_KEY, JSON.stringify(pending));
    }
  };

  // Stops a pending/in-flight retry loop for a drive item entirely (cancels the scheduled
  // setTimeout, forgets the retry count, clears the persisted pending-move record). Used when the
  // item is about to be moved somewhere else for an unrelated reason (permanentlyDeleteCandidate)
  // — without this, a still-ticking retry for "move to phase folder X" could fire concurrently
  // with (or right after) that move and undo it, or just keep failing forever against an item
  // that no longer lives where the retry expects.
  const cancelPendingDriveMove = (driveItemId: string) => {
    const timer = moveRetryTimerRef.current.get(driveItemId);
    if (timer) clearTimeout(timer);
    moveRetryTimerRef.current.delete(driveItemId);
    moveRetryCountRef.current.delete(driveItemId);
    clearPendingDriveMove(driveItemId);
  };

  // Moves the candidate's whole Drive folder (resume, CV, anything else in it) into the folder
  // matching their new phase. Prefers the per-candidate folder; falls back to moving the bare
  // resume file for legacy candidates registered before that folder existed. On failure, retries
  // with exponential backoff (same schedule as attemptBackup) instead of giving up — a transient
  // network blip or an expired token mid-move used to leave the file stranded in the old phase
  // folder forever with nothing but an easy-to-miss 3.5s toast. Looks up the candidate's current
  // name from the freshest known state (not a stale closure) since a retry can fire long after
  // the call that originally scheduled it.
  const attemptResumeFolderMove = (driveItemId: string, phase: string) => {
    const token = driveAccessTokenRef.current;
    if (!token) return; // 未ログイン中はリトライしない — 再ログイン時の起動時チェックに任せる

    const priorMove = driveMoveQueueRef.current.get(driveItemId) || Promise.resolve();
    const thisMove = priorMove
      .catch(() => {})
      .then(() => moveResumeToPhaseFolderApi(token, driveItemId, phase))
      .then(() => {
        // 成功したこの移動が「最後に要求された移動先」である場合だけ保留を解消する。この移動の
        // 後ろにさらに別フェーズへの要求がキューに並んでいる場合（フェーズ変更の連打）、保留
        // レコードは既にその新しい移動先を指しているので、ここで消すと後続の移動が失敗した際に
        // 永続化された再試行の足場が失われてしまう（後続の成功時に改めて解消される）。
        const pending = readPendingDriveMoves()[driveItemId];
        if (!pending || pending.phase === phase) cancelPendingDriveMove(driveItemId);
      })
      .catch((err: any) => {
        const retryCount = (moveRetryCountRef.current.get(driveItemId) || 0) + 1;
        moveRetryCountRef.current.set(driveItemId, retryCount);
        const candidateName =
          latestBackupStateRef.current.candidates.find(
            (c) => c.resumeDriveFolderId === driveItemId || c.resumeDriveFileId === driveItemId
          )?.name || '候補者';
        if (retryCount === 1) {
          // 初回失敗時だけ知らせる — 以降は自動リトライが続くだけなので毎回警告すると煩わしい。
          showToast(
            `${candidateName} さんの履歴書のDriveフォルダ移動に失敗しました。自動で再試行します: ${err.message || '不明なエラー'}`,
            'warning'
          );
        }
        // A dead/expired token won't fix itself just by retrying the same request — same reasoning
        // as attemptBackup's own 401 handling. Refresh right away instead of waiting on whatever
        // else in the app happens to notice the token is stale.
        if (err.status === 401) authRefreshNow();

        if (retryCount >= MAX_MOVE_RETRIES_PER_SESSION) {
          // このセッションでは無言のまま延々とリトライし続けない — ここまで来たら、フォルダが
          // Drive側で削除された等、自動では解決しない状況の可能性が高い。保留の記録自体は消さず
          // 残す（PENDING_DRIVE_MOVES_KEYはそのまま）ので、次回ログイン時の起動時チェックで
          // retryCountが0から数え直され、改めてチャンスが与えられる。
          showToast(
            `${candidateName} さんの履歴書のDriveフォルダ移動が${retryCount}回連続で失敗したため、今回のセッションでは再試行を停止しました。次回ログイン時に自動で再試行しますが、繰り返し発生する場合はDriveを直接ご確認ください。`,
            'warning'
          );
          return;
        }
        const retryDelay = Math.min(5000 * 2 ** retryCount, 120_000);
        const timer = setTimeout(() => attemptResumeFolderMove(driveItemId, phase), retryDelay);
        moveRetryTimerRef.current.set(driveItemId, timer);
      });
    driveMoveQueueRef.current.set(driveItemId, thisMove);
  };

  // ユーザー操作起点で「このDrive項目を、このフェーズのフォルダへ」移動を要求する共通入口。
  // moveResumeFolderIfNeeded（フェーズ変更時）と、Drive同期モーダルで「アプリ側を正としてDrive
  // フォルダを移動」を選んだ場合（applyDriveSync）の両方から使う。
  const requestResumeFolderMove = (driveItemId: string, phase: SelectionPhase) => {
    // 移動を試みる前に「保留中」として永続化する — 直後にトークンが無い/リクエストが失敗しても、
    // 次回ログイン時の起動時チェック（下記のuseEffect）が確実に拾って再試行できるようにするため。
    writePendingDriveMove(driveItemId, phase);
    // 新しい要求は仕切り直し — 以前この項目がMAX_MOVE_RETRIES_PER_SESSIONに達して諦めていたと
    // しても、今回のユーザー操作起点の要求にはフルの再試行回数を与える（内部の再帰呼び出しだけが
    // このカウントを積み上げていく）。
    moveRetryCountRef.current.delete(driveItemId);
    const existingTimer = moveRetryTimerRef.current.get(driveItemId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      moveRetryTimerRef.current.delete(driveItemId);
    }
    if (!driveAccessTokenRef.current) return;
    attemptResumeFolderMove(driveItemId, phase);
  };

  const moveResumeFolderIfNeeded = (candidate: Candidate, newPhase: SelectionPhase) => {
    const driveItemId = candidate.resumeDriveFolderId || candidate.resumeDriveFileId;
    if (!driveItemId) return;
    // `candidate` は呼び出し元のレンダー時点の`candidates`スナップショットなので、その`phase`は
    // 直前の変更をまだ反映していないことがある（再レンダー前に2回続けてフェーズ変更した場合 —
    // 例: カンバンで1次面接へドラッグして即座に書類選考へ戻す）。以前は「phaseが既にnewPhaseと
    // 同じなら何もしない」だけで判定していたため、この2回目の変更がスキップされ、Driveフォルダは
    // *1回目* の移動先に置き去りになっていた。保留レコードがある＝この項目には未確定の移動が
    // 残っている＝実際のフォルダ位置は不明、なので、その場合は必ず改めて移動先を指定し直す
    // （既にそこにあればサーバー側で何もしないので安全）。
    if (candidate.phase === newPhase && !(driveItemId in readPendingDriveMoves())) return;
    requestResumeFolderMove(driveItemId, newPhase);
  };

  // ログインのたびに一度だけ、前回までに完走しなかった保留中のDriveフォルダ移動を再開する
  // （retryCountはメモリ上だけの値なので、この時点で自然に0から数え直しになる）。あわせて、
  // STALE_PENDING_MOVE_MSを超えて成立しなかった保留は、候補者削除・Drive側での手動操作などで
  // 既に無関係になった可能性が高いとみなし、これ以上リトライ対象に含めず記録からも取り除く
  // （ats_pending_drive_movesが際限なく肥大化するのを防ぐ）。トークン更新でdriveAccessTokenが
  // 再発火してもここが再実行されないよう、hasAutoRestoredRef等と同じくrefでガードする。
  const hasResumedPendingMovesRef = useRef(false);
  useEffect(() => {
    if (!driveAccessToken || hasResumedPendingMovesRef.current) return;
    hasResumedPendingMovesRef.current = true;
    const pending = readPendingDriveMoves();
    const now = Date.now();
    let prunedAny = false;
    Object.entries(pending).forEach(([driveItemId, entry]) => {
      if (now - entry.pendingSince > STALE_PENDING_MOVE_MS) {
        console.warn(`Dropping stale pending Drive move for ${driveItemId} (pending since ${new Date(entry.pendingSince).toISOString()})`);
        delete pending[driveItemId];
        prunedAny = true;
        return;
      }
      attemptResumeFolderMove(driveItemId, entry.phase);
    });
    if (prunedAny) {
      localStorage.setItem(PENDING_DRIVE_MOVES_KEY, JSON.stringify(pending));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveAccessToken]);

  // Every Drive operation that may create a candidate's own folder (evaluation-log saves, document
  // uploads from the detail screen) runs through this per-candidate queue, and is handed the
  // candidate's folder id as of the moment it actually runs — not whatever the caller's snapshot
  // said when it was queued. Previously each path read its own snapshot, so two operations started
  // before the first one's folder existed (two quick evaluation notes, or a note saved while
  // documents were uploading) each created a folder: duplicate candidate folders on Drive.
  const candidateDriveQueueRef = useRef<Map<string, Promise<unknown>>>(new Map());
  // Folder ids created for a candidate during this session, readable immediately — the state update
  // recording resumeDriveFolderId lands a render later, which is too late for an operation already
  // queued behind the one that created it.
  const createdCandidateFolderIdsRef = useRef<Map<string, string>>(new Map());

  const getLatestCandidate = (candidateId: string): Candidate | undefined =>
    latestBackupStateRef.current.candidates.find((c) => c.id === candidateId);

  const runCandidateDriveTask = <R,>(
    candidateId: string,
    task: (currentFolderId: string | undefined) => Promise<{ value: R; folderId?: string }>
  ): Promise<R> => {
    const prior = candidateDriveQueueRef.current.get(candidateId) || Promise.resolve();
    const run = prior
      .catch(() => {})
      .then(async () => {
        const currentFolderId =
          getLatestCandidate(candidateId)?.resumeDriveFolderId || createdCandidateFolderIdsRef.current.get(candidateId);
        const { value, folderId } = await task(currentFolderId);
        if (!currentFolderId && folderId) {
          // A folder was just created — record it so everything queued after this reuses it.
          createdCandidateFolderIdsRef.current.set(candidateId, folderId);
          setCandidates((prev) =>
            prev.map((c) => (c.id === candidateId && !c.resumeDriveFolderId ? { ...c, resumeDriveFolderId: folderId } : c))
          );
        }
        return value;
      });
    candidateDriveQueueRef.current.set(candidateId, run);
    return run;
  };

  // Backs up a candidate's full evaluationNotes array into their own Drive folder, independent of
  // the single shared bloom_ats_backup.json blob — a durable per-candidate copy of evaluation
  // history. Goes through runCandidateDriveTask so it never creates a second folder.
  const saveEvaluationLogForCandidate = (candidate: Candidate, evaluationNotes: EvaluationNote[]) => {
    if (!driveAccessToken) return;
    runCandidateDriveTask(candidate.id, async (currentFolderId) => {
      const latest = getLatestCandidate(candidate.id) || candidate;
      const result = await saveEvaluationLogToDriveApi(
        driveAccessToken,
        { ...latest, resumeDriveFolderId: currentFolderId },
        evaluationNotes
      );
      return { value: undefined, folderId: result.folderId };
    }).catch((err: any) => {
      showToast(`${candidate.name} さんの面接評価ログのDrive保存に失敗しました: ${err.message || '不明なエラー'}`, 'warning');
    });
  };

  // Candidate folders created by the registration form's document drop before the candidate itself
  // is registered. If the form was then closed without registering, the folder (with the uploaded
  // résumé inside) used to stay in the phase folder forever, and 「Driveと同期」 would later offer
  // it as an unregistered résumé — or someone would register the person again and get a second
  // folder. Tracked per browser in localStorage so a draft abandoned by closing the tab or a crash
  // is still cleaned up at a later login.
  const DRAFT_DRIVE_FOLDERS_KEY = 'ats_draft_drive_folders';
  const DRAFT_FOLDER_STALE_MS = 12 * 60 * 60 * 1000;
  const readDraftDriveFolders = (): Record<string, number> => {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_DRIVE_FOLDERS_KEY) || '{}') || {};
    } catch {
      return {};
    }
  };
  const writeDraftDriveFolders = (drafts: Record<string, number>) => {
    safeSetLocalStorage(DRAFT_DRIVE_FOLDERS_KEY, drafts);
  };
  const trackDraftDriveFolder = (folderId: string) => {
    const drafts = readDraftDriveFolders();
    if (!(folderId in drafts)) {
      drafts[folderId] = Date.now();
      writeDraftDriveFolders(drafts);
    }
  };
  const releaseDraftDriveFolder = (folderId: string) => {
    const drafts = readDraftDriveFolders();
    if (folderId in drafts) {
      delete drafts[folderId];
      writeDraftDriveFolders(drafts);
    }
  };
  // Moves an abandoned draft folder into 99_完全削除済み (same as permanent deletion — never a hard
  // delete, so a mistaken discard is still recoverable by hand) and remembers it so 「Driveと同期」
  // never offers it back. On failure it stays tracked and the login-time sweep below retries it.
  const discardDraftDriveFolder = async (folderId: string): Promise<void> => {
    const token = driveAccessTokenRef.current;
    if (!token) return;
    if (latestBackupStateRef.current.candidates.some((c) => c.resumeDriveFolderId === folderId)) {
      releaseDraftDriveFolder(folderId); // it did get registered after all — keep it
      return;
    }
    try {
      await moveResumeToDeletedFolderApi(token, folderId);
      setDeletedDriveItemIds((prev) => (prev.includes(folderId) ? prev : [...prev, folderId]));
      releaseDraftDriveFolder(folderId);
    } catch (err: any) {
      console.error('Discarding draft Drive folder failed:', err);
    }
  };
  // Once per login, a little after startup (so the Drive restore has filled in every registered
  // candidate first), clean up drafts older than DRAFT_FOLDER_STALE_MS. Younger ones are left
  // alone: another tab of this browser may still have its registration form open.
  const hasSweptDraftFoldersRef = useRef(false);
  useEffect(() => {
    if (!driveAccessToken || isBootstrapping || hasSweptDraftFoldersRef.current) return;
    hasSweptDraftFoldersRef.current = true;
    const timer = setTimeout(() => {
      const now = Date.now();
      Object.entries(readDraftDriveFolders()).forEach(([folderId, createdAt]) => {
        if (now - createdAt > DRAFT_FOLDER_STALE_MS) discardDraftDriveFolder(folderId);
      });
    }, 30_000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveAccessToken, isBootstrapping]);

  const updateCandidatePhase = (candidateId: string, newPhase: SelectionPhase, reason?: string) => {
    const target = candidates.find((c) => c.id === candidateId);
    if (target) moveResumeFolderIfNeeded(target, newPhase);

    const isTerminalRejection = newPhase === 'REJECTED' || newPhase === 'DECLINED';

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
            REJECTED: '見送り',
            DECLINED: '選考辞退'
          };
          showToast(`${c.name} さんのフェーズを「${phaseNames[newPhase]}」に変更しました`, 'success');
          // まだそのフェーズに到達していない間にscheduleByPhaseへ事前入力された調整状況・日程が
          // あれば、現在フェーズ用の単一枠(scheduleStatus/nextScheduleDate)に引き継ぐ
          // (引き継がないと、事前入力した内容がラダー上「現在進行中」に切り替わった瞬間に
          // 見えなくなってしまうため)。
          const preScheduled = c.scheduleByPhase?.[newPhase];
          return {
            ...c,
            phase: newPhase,
            scheduleStatus: preScheduled ? preScheduled.status : c.scheduleStatus,
            nextScheduleDate: preScheduled ? preScheduled.date : c.nextScheduleDate,
            rejectionReason: isTerminalRejection ? (reason?.trim() || undefined) : undefined,
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

  // interviewersByPhaseと同じく、選考フローの各ステップごとに独立して調整状況・日程を保持する。
  // scheduleStatus/nextScheduleDateは「現在のフェーズ」用の単一枠のため、そちらは更新せず
  // scheduleByPhaseのみ更新する（現在のフェーズ分はupdateCandidateScheduleが引き続き担当）。
  const updateScheduleForPhase = (candidateId: string, phase: SelectionPhase, status: ScheduleStatus, date?: string) => {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidateId
          ? {
              ...c,
              scheduleByPhase: { ...(c.scheduleByPhase || {}), [phase]: { status, date } },
              lastUpdated: new Date().toISOString().split('T')[0]
            }
          : c
      )
    );
  };

  // ポジションによっては2次面接を省略するなど、候補者ごとに選考フローの一部ラウンドを
  // 省略/復活できるようにするトグル。省略中のフェーズはgetNextPhase()が読み飛ばし、
  // 候補者詳細のラダー表示からも該当ステップの行を除く。
  const toggleSkippedPhase = (candidateId: string, phase: SelectionPhase) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== candidateId) return c;
        const current = c.skippedPhases || [];
        const willSkip = !current.includes(phase);
        showToast(
          willSkip ? `${PHASE_LABEL_MAP[phase]}を省略するフローに変更しました` : `${PHASE_LABEL_MAP[phase]}を選考フローに戻しました`,
          'info'
        );
        return {
          ...c,
          skippedPhases: willSkip ? [...current, phase] : current.filter((p) => p !== phase),
          lastUpdated: new Date().toISOString().split('T')[0]
        };
      })
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

  // 適性検査メール送信成功時に呼ばれる。updateCandidateと違い、呼び出し側（送信ボタンのハンドラ）
  // が既に「送信しました」の専用トーストを出すため、ここではsetCandidatesを直接使い二重トースト
  // を避ける（updateInterviewLogForPhaseと同じ流儀）。
  // 適性検査ステータスバッジ（カンバンカード・一覧・ダッシュボード・候補者詳細）のクリック切り替え
  // で使う専用アップデータ。updateCandidatePhase/updateCandidateScheduleと同じく、クイック操作
  // なので専用の分かりやすいトーストを出す（updateCandidateの汎用トーストとは別扱い）。
  const updateAptitudeTestStatus = (candidateId: string, status: AptitudeTestStatus) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== candidateId) return c;
        showToast(`${c.name} さんの適性検査ステータスを「${APTITUDE_TEST_STATUS_META[status].label}」に更新しました`, 'info');
        return { ...applyAptitudeTestStatus(c, status), lastUpdated: new Date().toISOString().split('T')[0] };
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
      baseMonthlySalary?: number;
      hasBonusGuarantee?: boolean;
      bonusGuaranteeInstallments?: BonusGuaranteeInstallment[];
      hasSignOnBonus?: boolean;
      signOnBonusAmount?: number;
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

  // チェックのON/OFFや備考の入力ごとに自動保存する（保存ボタン不要・トースト無し）。最新のstateに
  // 対する関数型更新なので、他の項目・他の人の同時編集を巻き戻さない。
  const updateOnboardingChecklistItem = (candidateId: string, itemId: string, patch: { checked?: boolean; note?: string }) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== candidateId) return c;
        const list = c.onboardingChecklist || [];
        const cur = list.find((e) => e.id === itemId) || { id: itemId, checked: false, note: '' };
        const next = { ...cur, ...patch };
        const nextList = list.some((e) => e.id === itemId)
          ? list.map((e) => (e.id === itemId ? next : e))
          : [...list, next];
        return { ...c, onboardingChecklist: nextList, lastUpdated: new Date().toISOString().split('T')[0] };
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
      if (target) moveResumeFolderIfNeeded(target, 'REJECTED' as SelectionPhase);
    }

    if (target) saveEvaluationLogForCandidate(target, [newNote, ...target.evaluationNotes]);

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
            ...(noteData.resultStatus === 'FAIL' ? { phase: 'REJECTED' as SelectionPhase, rejectionReason: noteData.failReason || undefined } : {}),
            lastUpdated: new Date().toISOString().split('T')[0]
          };
        }
        return c;
      })
    );

    // Best-effort Google Chat notification when a selection result is finalized (合格/不採用、
    // 書類選考も含む) — PENDINGでは発火しない。宛先は各Webhookのkinds選択のみで決まる。
    if (target && (noteData.resultStatus === 'PASS' || noteData.resultStatus === 'FAIL')) {
      const phaseLabels = PHASE_LABEL_MAP;
      const interviewFormatLabels = INTERVIEW_FORMAT_LABEL_MAP;

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
        const nextPhaseForThread = getNextPhase(noteData.phase, docScreeningNextPhase, target.skippedPhases);
        const nextPhaseLabelForThread = nextPhaseForThread ? phaseLabels[nextPhaseForThread] : undefined;
        const existingNextInterviewersForThread = nextPhaseForThread ? target.interviewersByPhase?.[nextPhaseForThread] || [] : [];
        const nextInterviewerNamesForThread =
          nextInterviewerName && !existingNextInterviewersForThread.includes(nextInterviewerName)
            ? [...existingNextInterviewersForThread, nextInterviewerName]
            : existingNextInterviewersForThread;
        const resolvedNextInterviewFormat =
          nextInterviewFormat || (nextPhaseForThread ? target.interviewFormatByPhase?.[nextPhaseForThread] : undefined);
        const interviewFormatLabelForThread = resolvedNextInterviewFormat ? interviewFormatLabels[resolvedNextInterviewFormat] : undefined;

        // 書類選考通過スレッドは必ず平岡をメンションする（依頼で固定指定）。加えて、次回面接官が
        // 決まっていればその人、評価フォームで選んだ任意のメンバー（mentionMemberNames）も
        // 合わせてメンションする。同一人物が複数の枠に該当しても重複メンションしないよう、
        // 実在のchatMentionId（無ければ氏名）をキーに一意化する。
        const hiraokaStaff = staffList.find((s) => s.name.includes('平岡'));
        const resolveMention = (name: string) => ({
          name,
          mentionId: staffList.find((s) => s.name === name)?.chatMentionId
        });
        const mentionEntriesForThread = [
          hiraokaStaff ? { name: hiraokaStaff.name, mentionId: hiraokaStaff.chatMentionId } : { name: '平岡', mentionId: undefined },
          ...nextInterviewerNamesForThread.map(resolveMention),
          ...(mentionMemberNames || []).map(resolveMention)
        ];
        const seenMentionKeysForThread = new Set<string>();
        const mentionedStaffForThread = mentionEntriesForThread.filter((entry) => {
          const key = entry.mentionId || entry.name;
          if (seenMentionKeysForThread.has(key)) return false;
          seenMentionKeysForThread.add(key);
          return true;
        });

        const threadPayloadBase = {
          accessToken: driveAccessToken,
          candidateName: target.name,
          candidateId: target.id,
          agencyName: target.agencyName,
          positionLabel: target.jobTitle,
          nextPhaseLabel: nextPhaseLabelForThread,
          nextInterviewerNames: nextInterviewerNamesForThread,
          interviewFormatLabel: interviewFormatLabelForThread,
          mentionedStaff: mentionedStaffForThread
        };

        const threadWebhookUrls: string[] = [];
        recipients.forEach((staff) => {
          getStaffWebhooksForKind(staff, 'DOCUMENT_SCREENING_THREAD').forEach((webhookUrl) => threadWebhookUrls.push(webhookUrl));
        });
        getGroupWebhooksForKind(groupChatWebhooks, 'DOCUMENT_SCREENING_THREAD').forEach((webhookUrl) => threadWebhookUrls.push(webhookUrl));

        if (threadWebhookUrls.length > 0) {
          const threadNotifyCalls = threadWebhookUrls.map((webhookUrl) =>
            notifyDocumentScreeningThreadApi({
              ...threadPayloadBase,
              webhookUrl,
              threadName: target.chatThreadNames?.[webhookUrl]
            }).then((res) => ({ webhookUrl, threadName: res.threadName }))
          );
          Promise.allSettled(threadNotifyCalls).then((results) => {
            const failedCount = results.filter((r) => r.status === 'rejected').length;
            if (failedCount > 0) {
              console.error(`Document-screening-thread Chat notify: ${failedCount}件の送信に失敗しました`);
              showToast(`選考スレッド作成の送信に${failedCount}件失敗しました（Webhook設定をご確認ください）`, 'warning');
            }
            // 実スレッドIDを保存しておくと、次回以降の評価サマリ通知がthreadKeyの経年劣化に頼らず
            // 確実に同じスレッドへ返信できる（sendGoogleChatMessageのコメント参照）。
            const resolved: Record<string, string> = {};
            results.forEach((r) => {
              if (r.status === 'fulfilled' && r.value.threadName) resolved[r.value.webhookUrl] = r.value.threadName;
            });
            if (Object.keys(resolved).length > 0) {
              setCandidates((prev) =>
                prev.map((c) => (c.id === target.id ? { ...c, chatThreadNames: { ...c.chatThreadNames, ...resolved } } : c))
              );
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
        const nextPhase = noteData.resultStatus === 'PASS' ? getNextPhase(noteData.phase, undefined, target.skippedPhases) : null;
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

        const summaryWebhookUrls: string[] = [];
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
          getStaffWebhooksForKind(staff, 'EVALUATION_SUMMARY_THREAD').forEach((webhookUrl) => summaryWebhookUrls.push(webhookUrl));
        });
        getGroupWebhooksForKind(groupChatWebhooks, 'EVALUATION_SUMMARY_THREAD').forEach((webhookUrl) => summaryWebhookUrls.push(webhookUrl));

        if (summaryWebhookUrls.length > 0) {
          const summaryNotifyCalls = summaryWebhookUrls.map((webhookUrl) =>
            notifyEvaluationSummaryThreadApi({
              accessToken: driveAccessToken,
              webhookUrl,
              ...summaryPayload,
              threadName: target.chatThreadNames?.[webhookUrl]
            }).then((res) => ({ webhookUrl, threadName: res.threadName }))
          );
          Promise.allSettled(summaryNotifyCalls).then((results) => {
            const failedCount = results.filter((r) => r.status === 'rejected').length;
            if (failedCount > 0) {
              console.error(`Evaluation-summary-thread Chat notify: ${failedCount}件の送信に失敗しました`);
              showToast(`評価サマリのスレッド書き込みに${failedCount}件失敗しました（Webhook設定をご確認ください）`, 'warning');
            }
            const resolved: Record<string, string> = {};
            results.forEach((r) => {
              if (r.status === 'fulfilled' && r.value.threadName) resolved[r.value.webhookUrl] = r.value.threadName;
            });
            if (Object.keys(resolved).length > 0) {
              setCandidates((prev) =>
                prev.map((c) => (c.id === target.id ? { ...c, chatThreadNames: { ...c.chatThreadNames, ...resolved } } : c))
              );
            }
          });
        }
      }
    }
  };

  // Repairs a candidate whose id got recycled from a permanently-deleted one before
  // candidateIdSeqRef existed (see its declaration above) — issues them a brand-new, guaranteed-
  // unused id and, if they'd already passed 書類選考, fires a fresh DOCUMENT_SCREENING_THREAD
  // notification under that new id so a correct, dedicated Chat thread is created instead of this
  // candidate's future updates continuing to land in whatever old candidate's thread the recycled
  // id collided with. Does NOT touch the old, already-misthreaded message itself — Chat has no API
  // this app can use to move or delete someone else's message, so that has to be cleaned up by
  // hand; this only stops the situation from getting worse and gives the team a correct thread to
  // use going forward.
  const reissueCandidateId = async (oldId: string) => {
    const target = candidates.find((c) => c.id === oldId);
    if (!target) return;

    const newId = issueNextCandidateId();
    setCandidates((prev) => prev.map((c) => (c.id === oldId ? { ...c, id: newId } : c)));
    if (selectedCandidateId === oldId) setSelectedCandidateId(newId);
    showToast(`候補者IDを ${oldId} → ${newId} に再発行しました`, 'success');

    const hasPassedDocScreening = target.evaluationNotes.some(
      (n) => n.phase === 'DOCUMENT_SCREENING' && n.resultStatus === 'PASS'
    );
    if (!hasPassedDocScreening) return;

    const currentPhaseLabel = PHASE_LABEL_MAP[target.phase] || target.phase;
    const currentInterviewers = target.interviewersByPhase?.[target.phase] || [];
    const currentFormat = target.interviewFormatByPhase?.[target.phase];
    const hiraokaStaffForReissue = staffList.find((s) => s.name.includes('平岡'));
    const mentionedStaffForReissue = [
      hiraokaStaffForReissue
        ? { name: hiraokaStaffForReissue.name, mentionId: hiraokaStaffForReissue.chatMentionId }
        : { name: '平岡', mentionId: undefined },
      ...currentInterviewers.map((name) => ({ name, mentionId: staffList.find((s) => s.name === name)?.chatMentionId }))
    ];
    const threadPayload = {
      accessToken: driveAccessToken,
      candidateName: target.name,
      candidateId: newId,
      agencyName: target.agencyName,
      positionLabel: target.jobTitle,
      nextPhaseLabel: `${currentPhaseLabel}（IDの重複によりスレッドを作り直しました。旧ID: ${oldId}）`,
      nextInterviewerNames: currentInterviewers,
      interviewFormatLabel: currentFormat ? INTERVIEW_FORMAT_LABEL_MAP[currentFormat] : undefined,
      mentionedStaff: mentionedStaffForReissue
    };

    const notifyWebhookUrls: string[] = [];
    staffList.forEach((staff) => {
      getStaffWebhooksForKind(staff, 'DOCUMENT_SCREENING_THREAD').forEach((webhookUrl) => notifyWebhookUrls.push(webhookUrl));
    });
    getGroupWebhooksForKind(groupChatWebhooks, 'DOCUMENT_SCREENING_THREAD').forEach((webhookUrl) => notifyWebhookUrls.push(webhookUrl));
    if (notifyWebhookUrls.length === 0) return;

    const notifyCalls = notifyWebhookUrls.map((webhookUrl) =>
      notifyDocumentScreeningThreadApi({ ...threadPayload, webhookUrl }).then((res) => ({ webhookUrl, threadName: res.threadName }))
    );
    const results = await Promise.allSettled(notifyCalls);
    const failedCount = results.filter((r) => r.status === 'rejected').length;
    if (failedCount > 0) {
      console.error(`Reissue thread-recreate Chat notify: ${failedCount}件の送信に失敗しました`);
      showToast(`新スレッド作成の送信に${failedCount}件失敗しました（Webhook設定をご確認ください）`, 'warning');
    } else {
      showToast('新しいスレッドを作成しました', 'success');
    }
    const resolved: Record<string, string> = {};
    results.forEach((r) => {
      if (r.status === 'fulfilled' && r.value.threadName) resolved[r.value.webhookUrl] = r.value.threadName;
    });
    if (Object.keys(resolved).length > 0) {
      setCandidates((prev) => prev.map((c) => (c.id === newId ? { ...c, chatThreadNames: { ...c.chatThreadNames, ...resolved } } : c)));
    }
  };

  // Edits an existing note in place (keeps its id/createdAt/position in the list). The candidate's
  // rollup fields (interviewRating, L/C/M, etc.) always re-sync to whatever is now the first note
  // in the array — same "most recent note wins" rule addEvaluationNote uses — so editing the
  // current top note updates the rollup, and editing an older one leaves it alone. Unlike adding,
  // this fully overwrites the rollup (including clearing it to undefined) since an explicit edit
  // is the user correcting the record, not just adding to it.
  const updateEvaluationNote = (candidateId: string, noteId: string, noteData: Omit<EvaluationNote, 'id' | 'createdAt'>) => {
    const target = candidates.find((c) => c.id === candidateId);
    if (target) {
      const updatedNotesForDrive = target.evaluationNotes.map((n) =>
        n.id === noteId ? { ...noteData, id: n.id, createdAt: n.createdAt } : n
      );
      saveEvaluationLogForCandidate(target, updatedNotesForDrive);
    }

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
    const target = candidates.find((c) => c.id === candidateId);
    if (target) {
      saveEvaluationLogForCandidate(target, target.evaluationNotes.filter((n) => n.id !== noteId));
    }

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

  // The ref-backed counter (rather than reading `candidates.length` directly) still guarantees
  // unique IDs when this is called multiple times back-to-back in the same tick — e.g. importing
  // several unregistered Drive resumes in a loop.
  // The floor must be the highest CAND-#### number currently in use, not just the live count:
  // permanently deleting a candidate shrinks candidates.length without freeing up its number for
  // reuse by anyone still on the list, so on a fresh page load (ref reset to 0) `candidates.length`
  // could fall below another still-existing candidate's number and collide with it — two candidates
  // sharing one id, where deleting either one deletes both (since delete/permanentlyDelete filter
  // by id match, which then matches both records). candidateIdSeqRef (see its declaration above)
  // also factors in here so a number freed up by a permanent delete — on this device or any other
  // that has since synced — is never reissued.
  //
  // None of the above actually rules out a collision, though: candidateIdSeqRef only reflects
  // whatever this device last synced from Drive, so two people registering a candidate within the
  // same sync window (Drive backup is debounced/polled, not instant) can both compute the same
  // "next" number before either write lands — confirmed in production once already (CAND-0013,
  // see candidateIdSeqRef's own comment) even with this monotonic-max counter in place. The
  // -XXXXXX suffix below is the actual collision guard: 31^6 (~887 million) equally-likely draws
  // makes two independent calls landing on the same suffix negligible (~1 in 887 million), independent
  // of any sync timing. A 4-char suffix (31^4, ~924,000) was tried first but rejected — simulated
  // pairwise collision odds of ~1 in 924 (0.1%) for two people registering at the same moment isn't
  // the "never" this is meant to guarantee. The numeric part is kept purely for human
  // readability/ordering (and is all reissueCandidateId/the reduce above ever parse — parseInt stops
  // at the first non-digit, so the suffix is transparently ignored by existing numeric-floor logic
  // without any code changes there). Excludes visually-ambiguous characters (0/O, 1/I, L) since this
  // ID does get read aloud/typed by people occasionally.
  const ID_SUFFIX_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const randomIdSuffix = (): string => {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => ID_SUFFIX_CHARS[b % ID_SUFFIX_CHARS.length]).join('');
  };

  // Shared by addCandidate and reissueCandidateId.
  const issueNextCandidateId = (): string => {
    const maxExistingIdNum = candidates.reduce((max, c) => {
      const num = parseInt(c.id.replace('CAND-', ''), 10);
      return Number.isNaN(num) ? max : Math.max(max, num);
    }, 0);
    nextCandidateIdNumRef.current = Math.max(maxExistingIdNum, nextCandidateIdNumRef.current, candidateIdSeqRef.current) + 1;
    bumpCandidateIdSeq(nextCandidateIdNumRef.current);
    return `CAND-${String(nextCandidateIdNumRef.current).padStart(4, '0')}-${randomIdSuffix()}`;
  };

  const addCandidate = (candidateData: Omit<Candidate, 'id' | 'lastUpdated' | 'evaluationNotes' | 'appliedMonth'>) => {
    const appliedMonth = candidateData.appliedDate ? candidateData.appliedDate.substring(0, 7) : new Date().toISOString().substring(0, 7);

    // The candidate (including its ID) is built fully before touching state, then read
    // synchronously for the toast — setCandidates' updater callback is not guaranteed to run
    // synchronously, so a value only assigned inside it isn't safe to read right after the call
    // (this used to throw "Cannot read properties of undefined (reading 'name')" here and abort
    // the caller mid-function, which is why the registration modal sometimes failed to close).
    const newCandidate: Candidate = {
      ...candidateData,
      id: issueNextCandidateId(),
      appliedMonth,
      evaluationNotes: [],
      lastUpdated: new Date().toISOString().split('T')[0]
    };
    setCandidates((prev) => [newCandidate, ...prev]);
    // The registration form's uploaded folder now belongs to a real candidate — no longer a draft.
    if (newCandidate.resumeDriveFolderId) releaseDraftDriveFolder(newCandidate.resumeDriveFolderId);
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
    const docScreeningAssigneeStaff = docScreeningAssigneeName
      ? staffList.find((s) => s.name === docScreeningAssigneeName)
      : undefined;
    if (newCandidate.phase === 'DOCUMENT_SCREENING') {
      if (docScreeningAssigneeName && docScreeningAssigneeStaff) {
        const assigneeName = docScreeningAssigneeName;
        const assignee = docScreeningAssigneeStaff;
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

      // グループ用Webhookはどの担当者の持ち物でもないため担当者が解決できたかどうかに関わらず送るが、
      // 誰が書類選考担当になったかは、担当者がchatMentionIdを登録していれば本物の@メンションで
      // (未登録なら太字テキストへ自動フォールバック、formatMention参照)、共有スペースを見ている
      // 全員に誰が対応する想定かひと目で伝わるようにする。
      getGroupWebhooksForKind(groupChatWebhooks, 'CANDIDATE_REGISTERED').forEach((webhookUrl) => {
        notifyCandidateRegisteredApi({
          accessToken: driveAccessToken,
          webhookUrl,
          staffName: docScreeningAssigneeName,
          staffMentionId: docScreeningAssigneeStaff?.chatMentionId,
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

  // updateCandidateと同じ扱い（トースト・lastUpdated更新あり）だが、候補者レコード全体を差し替える
  // のではなく、指定したフィールドだけを*その時点の最新状態*に重ねる。await を挟んだ後に書き戻す
  // 処理（詳細画面の書類ドロップ: 解析→Driveアップロード→顔写真検出で数十秒かかる）では、呼び出し
  // 元が握っている`candidate`はもう古いスナップショットで、それを丸ごとupdateCandidateに渡すと、
  // その間に別タブ・別メンバーの操作で変わった値（典型的にはフェーズ）を黙って元に戻してしまい、
  // しかもDriveフォルダはそれに追随して戻らないため、アプリのフェーズとDriveフォルダが食い違う
  // 原因になっていた。
  const patchCandidate = (candidateId: string, patch: Partial<Candidate>) => {
    const name = latestBackupStateRef.current.candidates.find((c) => c.id === candidateId)?.name;
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, ...patch, lastUpdated: new Date().toISOString().split('T')[0] } : c))
    );
    if (name) showToast(`${name} さんの情報を更新しました`, 'success');
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

    // これらの項目は99_完全削除済みへ移されるため、まだ残っていた「フェーズフォルダへ移動する」
    // 保留中リトライは丸ごと打ち切る — 放置すると、削除後もバックグラウンドで存在しない移動先を
    // 相手に無意味なリトライを永久に続けてしまう。
    driveItemIds.forEach((itemId) => cancelPendingDriveMove(itemId));

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

  // 選考ポジションのマスタ一覧をまるごと置き換える。groupChatWebhooksと同じく、設定画面の
  // フォームで組み立てた配列全体を1回のみ保存する形（個々のadd/remove操作をcontext側に持たせない）。
  const updatePositions = (updated: RecruitmentPosition[]) => {
    setPositions(updated);
    showToast('選考ポジション設定を更新しました', 'success');
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

  // The manual「Driveにバックアップ」button: the same merged, version-checked write as the automatic
  // one (it is just another writer and needs the same protection), forced even when nothing looks
  // unsynced so the user can always make sure.
  const backupToDrive = async () => {
    if (!driveAccessToken) {
      showToast('先にGoogle Driveへログインしてください', 'warning');
      return;
    }
    try {
      await performBackup(driveAccessToken, { force: true });
      showToast('候補者・エージェント・MTGログをDriveにバックアップしました', 'success');
    } catch (err: any) {
      showToast(`Driveバックアップに失敗しました: ${err.message || '不明なエラー'}`, 'warning');
    }
  };

  // `silent` is used by the auto-restore-on-login effect: no success toast, and a "not backed up
  // yet" 404 (normal before anyone on the team has ever backed up) is a no-op. Always merges rather
  // than overwrites — the「Driveから復元」button used to replace local state wholesale, which
  // silently threw away anything registered on this device that hadn't reached Drive yet.
  const restoreFromDrive = async (options: { silent?: boolean } = {}) => {
    if (!driveAccessToken) {
      if (!options.silent) showToast('先にGoogle Driveへログインしてください', 'warning');
      return;
    }
    try {
      const data = await restoreFromDriveApi(driveAccessToken);
      applyDriveSnapshotMerged(data);
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
  // notifyOnly: the silent login-time check — computes the same diff but, instead of opening the
  // review modal, only tells the user how many Drive folders have no candidate in the app.
  const previewDriveSync = async (options: { notifyOnly?: boolean } = {}) => {
    const notifyOnly = !!options.notifyOnly;
    if (!driveAccessToken) {
      if (!notifyOnly) showToast('先にGoogle Driveへログインしてください', 'warning');
      return;
    }
    if (!notifyOnly) setIsSyncingDrive(true);
    try {
      const entries = await scanDriveResumesApi(driveAccessToken);
      // A candidate folder normally holds several files (resume, CV, ...) — key by folder for
      // those, and separately by bare file id for legacy flat entries with no folder at all.
      const folderIdToEntry = new Map(entries.filter((e) => e.folderId).map((e) => [e.folderId as string, e]));
      const fileIdToEntry = new Map(entries.filter((e) => !e.folderId).map((e) => [e.file.id, e]));

      // Candidates imported via this sync before the agency could be read from the folder name (or
      // whose folder name didn't exactly match the master) were saved as 直接応募 under an id that
      // isn't in the agency master at all. Their folder ("氏名_エージェント名") still says who referred
      // them, so fill that in automatically — this also runs in the silent login-time check. Only
      // touches off-master ids, never an agency someone chose explicitly.
      const agencyFixes = new Map<string, { id: string; name: string }>();
      latestBackupStateRef.current.candidates.forEach((c) => {
        if (!c.resumeDriveFolderId || agencies.some((a) => a.id === c.agencyId)) return;
        const folderAgency = agencyNameFromFolderName(folderIdToEntry.get(c.resumeDriveFolderId)?.folderName);
        const match = folderAgency ? findAgencyByLooseName(agencies, folderAgency) : undefined;
        if (match) agencyFixes.set(c.id, { id: match.id, name: match.name });
      });
      if (agencyFixes.size > 0) {
        setCandidates((prev) =>
          prev.map((c) => {
            const fix = agencyFixes.get(c.id);
            if (!fix || agencies.some((a) => a.id === c.agencyId)) return c;
            return { ...c, agencyId: fix.id, agencyName: fix.name };
          })
        );
        showToast(`${agencyFixes.size}名の応募経路をDriveフォルダ名のエージェントに合わせて補正しました`, 'info');
      }

      const pendingMoves = readPendingDriveMoves();
      const phaseMoves: DriveSyncPhaseMove[] = [];
      candidates.forEach((c) => {
        const driveItemId = c.resumeDriveFolderId || c.resumeDriveFileId;
        const entry = c.resumeDriveFolderId
          ? folderIdToEntry.get(c.resumeDriveFolderId)
          : c.resumeDriveFileId
          ? fileIdToEntry.get(c.resumeDriveFileId)
          : undefined;
        if (driveItemId && entry && entry.phase in PHASE_ORDER && entry.phase !== c.phase) {
          const drivePhase = entry.phase as SelectionPhase;
          // アプリのフェーズとDriveフォルダの位置が食い違うとき、どちらを正とみなすか。以前は常に
          // 「Drive → アプリ」（Drive上で手でフォルダを動かしたケースだけを想定）で、モーダルでも
          // 既定でチェック済みだった。しかし実際に多いのは「アプリでフェーズ変更したがDrive側の
          // 移動が失敗／未完了のまま残った」ケースで、そこにDrive → アプリを適用すると、確定した
          // はずの選考結果がアプリ上で*巻き戻る*事故になっていた。アプリ側が明らかに新しい判断を
          // 持っている根拠があれば「アプリ → Drive」を既定にする: このブラウザにその項目の未確定
          // の移動が残っている／アプリ上で見送り・選考辞退として選考が終了している／Driveが指す
          // フェーズに対する合否付きの評価メモがアプリに記録済み（＝そのフェーズはもう終わっている）。
          const concludedInApp = c.phase === 'REJECTED' || c.phase === 'DECLINED';
          const evaluatedPastDrivePhase = (c.evaluationNotes || []).some(
            (n) => n.phase === drivePhase && (n.resultStatus === 'PASS' || n.resultStatus === 'FAIL')
          );
          const suggestedDirection: DriveSyncPhaseMoveDirection =
            driveItemId in pendingMoves || concludedInApp || evaluatedPastDrivePhase ? 'APP_TO_DRIVE' : 'DRIVE_TO_APP';
          phaseMoves.push({
            candidateId: c.id,
            candidateName: c.name,
            currentPhase: c.phase,
            drivePhase,
            driveItemId,
            suggestedDirection
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

      if (notifyOnly) {
        if (newImports.length > 0) {
          showToast(
            `Driveにアプリ未登録のフォルダが${newImports.length}件あります。右上の「Drive連携」→「Driveと同期」で確認してください`,
            'warning'
          );
        }
        return;
      }
      if (phaseMoves.length === 0 && newImports.length === 0 && docUpdates.length === 0 && duplicateFolders.length === 0) {
        showToast('Drive同期: 差分はありませんでした', 'info');
      } else {
        setDriveSyncPreview({ phaseMoves, newImports, docUpdates, duplicateFolders });
      }
    } catch (err: any) {
      if (!notifyOnly) showToast(`Drive同期の確認に失敗しました: ${err.message || '不明なエラー'}`, 'warning');
      else console.error('Unregistered-folder check failed:', err);
    } finally {
      if (!notifyOnly) setIsSyncingDrive(false);
    }
  };

  // Once per login, after the Drive restore has filled in every registered candidate (same
  // startup delay as the draft-folder sweep above), warn when Drive holds candidate folders the
  // app doesn't know — the "saved to Drive but missing in the app" situation must never go
  // unnoticed. The latest previewDriveSync is read through a ref because this timer fires long
  // after the render whose closure (candidates, deletedDriveItemIds) it would otherwise capture.
  const previewDriveSyncRef = useRef(previewDriveSync);
  previewDriveSyncRef.current = previewDriveSync;
  const hasCheckedUnregisteredRef = useRef(false);
  useEffect(() => {
    if (!driveAccessToken || isBootstrapping || hasCheckedUnregisteredRef.current) return;
    hasCheckedUnregisteredRef.current = true;
    // Deliberately not cleared on cleanup: the once-per-login ref is already set, so a token refresh
    // re-running this effect inside the delay would otherwise cancel the check for good.
    setTimeout(() => previewDriveSyncRef.current({ notifyOnly: true }), 15_000);
  }, [driveAccessToken, isBootstrapping]);

  const cancelDriveSyncPreview = () => setDriveSyncPreview(null);

  // Applies only what the user explicitly selected in the review modal: phase moves by candidate
  // id, new-candidate imports by entry key, and Drive items to add to the permanent ignore list
  // (deletedDriveItemIds) so they stop being offered on future syncs. Anything left unselected —
  // neither applied nor ignored — is simply left for the next preview to ask about again.
  const applyDriveSync = async (selection: {
    phaseMoveCandidateIds: string[]; // Drive → アプリ: アプリのフェーズをDriveフォルダの位置に合わせる
    driveFolderMoveCandidateIds?: string[]; // アプリ → Drive: Driveフォルダをアプリの現在フェーズのフォルダへ移動する
    importKeys: string[];
    ignoreKeys: string[];
    docUpdateCandidateIds?: string[];
    duplicateResolutions?: { candidateId: string; keepFolderId: string }[];
    importDetails?: Record<string, { jobTitle?: string; assignee?: string; agencyId?: string }>;
  }) => {
    if (!driveAccessToken || !driveSyncPreview) return;
    setIsApplyingDriveSync(true);
    try {
      const moveIds = new Set(selection.phaseMoveCandidateIds);
      const docUpdateIds = new Set(selection.docUpdateCandidateIds || []);

      // 「アプリ側を正としてDriveフォルダを移動」を選ばれた候補者: アプリのフェーズはそのままで、
      // Drive項目をそのフェーズのフォルダへ移す。通常のフェーズ変更時と同じ再試行・保留永続化つき
      // の経路（requestResumeFolderMove）に乗せるだけなので、ここでは完了を待たない — 完了・失敗は
      // その経路のトーストで通知される。移動先は、モーダルを開いていた間に変わっている可能性を
      // 考えてプレビュー時点のcurrentPhaseではなく今の最新状態から取る。
      const driveFolderMoveIds = new Set(selection.driveFolderMoveCandidateIds || []);
      let driveFolderMoveCount = 0;
      driveFolderMoveIds.forEach((candidateId) => {
        const move = driveSyncPreview.phaseMoves.find((m) => m.candidateId === candidateId);
        if (!move) return;
        const latest = latestBackupStateRef.current.candidates.find((c) => c.id === candidateId);
        requestResumeFolderMove(move.driveItemId, latest?.phase || move.currentPhase);
        driveFolderMoveCount++;
      });
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
          const detail = selection.importDetails?.[entry.key];
          // Drive folders are named "氏名" or "氏名_エージェント名" (buildCandidateFolderName), so the
          // agency can be recovered from the name when the review modal didn't set one explicitly.
          const folderAgencyName = agencyNameFromFolderName(entry.displayName);
          const agency =
            agencies.find((a) => a.id === detail?.agencyId) ||
            (folderAgencyName ? findAgencyByLooseName(agencies, folderAgencyName) : undefined) ||
            // Prefer a real master entry for direct applications over the off-master 'ag-direct' id.
            agencies.find((a) => a.name.includes('直接応募'));
          const agencyAssignees = agency?.assignedStaffNames && agency.assignedStaffNames.length > 0 ? agency.assignedStaffNames : null;
          // Same automatic face-photo extraction the registration form does on upload; a miss or
          // failure just leaves the photo empty (it can still be cropped by hand later).
          const { avatarUrl } = await extractAvatarFromDriveFiles(driveAccessToken, entry.files).catch(() => ({ avatarUrl: null }));
          addCandidate({
            avatarUrl: avatarUrl || undefined,
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
            jobTitle: detail?.jobTitle || '',
            appliedDate: new Date().toISOString().split('T')[0],
            agencyId: agency?.id || 'ag-direct',
            agencyName: agency?.name || '直接応募 (自社採用HP)',
            assignees: detail?.assignee
              ? [detail.assignee]
              : agencyAssignees || [staffList[0]?.name || '山田 太郎'],
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
        moveIds.size > 0 ? `アプリのフェーズをDriveに合わせて更新 ${moveIds.size}件` : null,
        driveFolderMoveCount > 0
          ? `Driveフォルダをアプリのフェーズへ移動 ${driveFolderMoveCount}件（バックグラウンドで実行中、失敗時は自動再試行）`
          : null,
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
  // self-registered (see SelfRegistrationGate, which blocks the app until this resolves) or an
  // admin has added their email manually.
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

  // ダッシュボードの「本日/指定期間の応募状況を送信」ボタンから呼ばれる、常にユーザー操作で明示的に
  // 発火する手動送信。宛先解決(担当者個人用＋グループ用Webhook)・失敗時トーストは他のChat通知と
  // 同じ流儀。kindごとに購読しているWebhookが1件もなければ、送信を試みずその旨をトーストで伝える
  // （担当者マスタでのWebhook未設定に気づきやすくするため、無言で何もしないことは避ける）。
  // Webhookごとにdigest内容(ポジション別×採用担当者別×エージェント別集計)を個別計算する。
  // 担当者マスタ／エージェント設定でWebhookにdigestTargetStaffNamesが設定されていれば、その採用
  // 担当者に紐づくエージェントの推薦状況だけに絞り込むため、送信先ごとに集計結果が変わり得る。
  // 未設定のWebhookは従来通り全採用担当者・全エージェント対象。
  const sendApplicationsDigest = async (
    params: {
      kind: 'DAILY_APPLICATIONS_DIGEST' | 'PERIOD_APPLICATIONS_DIGEST';
      periodLabel: string;
      candidates: Candidate[];
    },
    opts?: { silent?: boolean }
  ): Promise<void> => {
    const { kind, periodLabel, candidates: digestCandidates } = params;
    // agenciesはrefから読む — この関数は16時自動送信effect([driveAccessToken]依存のみ)からも
    // 呼ばれるため、直接のクロージャ参照だとログイン後にエージェント設定を変更してもその日一日
    // 古い一覧のまま送信され続けてしまう(latestBackupStateRefは他の自動送信effectと同じく毎レンダー
    // 更新される最新値)。
    const latestAgencies = latestBackupStateRef.current.agencies;

    // ポジション見出しの下は、フラットなエージェント一覧ではなく「採用担当者ごとに、その担当者に
    // 紐づくエージェント」という2段階の内訳にする。1エージェントが複数の採用担当者に紐づいて
    // いる場合はそれぞれの担当者の下に重複して現れる(RecruitmentMeetingViewの
    // 「agencies.filter(assignedStaffNames?.includes(recruiterName))」と同じ考え方)。どの採用
    // 担当者にも紐づいていないエージェントは「その他」としてまとめる。
    const OTHER_STAFF_LABEL = 'その他（担当者未設定）';

    // 同じエージェントでもポジション(BCA/AIX/BRE)によって窓口の採用担当者が異なる場合、
    // Agency.assignedStaffNamesByPosition[positionLabel]があればそれを優先し、無ければ
    // 全ポジション共通のassignedStaffNamesにフォールバックする。「その他」ポジション
    // (EC/BP/ミドル等をひとまとめにしたグループ)にはポジション別上書きの概念が無いため、
    // 常にassignedStaffNamesを使う。
    const resolveAssignedStaffNames = (agency: Agency | undefined, positionLabel: string): string[] => {
      if (!agency) return [];
      const override = agency.assignedStaffNamesByPosition?.[positionLabel];
      if (override && override.length > 0) return override;
      return agency.assignedStaffNames || [];
    };

    const buildDigestPayload = (digestTargetStaffNames?: string[]) => {
      const positionGroups = computeYieldMetricsByPosition(latestAgencies, digestCandidates);
      const staffOrder = staffList.map((s) => s.name);
      const scopeSet = digestTargetStaffNames && digestTargetStaffNames.length > 0 ? new Set(digestTargetStaffNames) : null;

      const digestPositionGroups = positionGroups
        .map((g) => {
          let total = 0;
          const statsByStaff = new Map<string, ReturnType<typeof buildAgencyStat>[]>();
          function buildAgencyStat(m: (typeof g.metrics)[number]) {
            return {
              agencyName: m.agencyName,
              total: m.totalApplications,
              documentPassCount: m.documentPassCount,
              firstInterviewPassCount: m.firstInterviewPassCount,
              offerCount: m.offerCount,
              acceptCount: m.acceptCount,
              rejectedByPhase: m.rejectedByPhase
            };
          }

          g.metrics
            .filter((m) => m.totalApplications > 0)
            .forEach((m) => {
              const agency = latestAgencies.find((ag) => ag.name === m.agencyName);
              const assignedNames = resolveAssignedStaffNames(agency, g.positionLabel);
              const namesToUse = assignedNames.length > 0 ? assignedNames : [OTHER_STAFF_LABEL];
              // Webhookが特定の採用担当者に絞り込まれている場合、そのスコープ外の担当者名は
              // 除外する — このエージェントがこのポジションで対象担当者と一切紐づいていなければ、
              // 行自体をこのWebhookの応募数に含めない。ただし「その他（担当者未設定）」＝自己応募は
              // どの担当者にも紐づかない以上、特定の担当者に絞る設定の対象になりようがないため、
              // スコープの有無に関わらず常に含める。除外していた頃は、絞り込み付きWebhookしか
              // 存在しない状況で自己応募が発生すると、どのWebhookにも一切届かなかった。
              const namesInScope = scopeSet ? namesToUse.filter((name) => name === OTHER_STAFF_LABEL || scopeSet.has(name)) : namesToUse;
              if (scopeSet && namesInScope.length === 0) return;

              total += m.totalApplications;
              const stat = buildAgencyStat(m);
              namesInScope.forEach((name) => {
                if (!statsByStaff.has(name)) statsByStaff.set(name, []);
                statsByStaff.get(name)!.push(stat);
              });
            });

          const knownNames = staffOrder.filter((name) => statsByStaff.has(name));
          const unknownNames = Array.from(statsByStaff.keys()).filter(
            (name) => name !== OTHER_STAFF_LABEL && !staffOrder.includes(name)
          );
          const staffGroups = [...knownNames, ...unknownNames]
            .map((name) => ({ staffLabel: name, isOther: false, agencyStats: statsByStaff.get(name)! }))
            .concat(
              statsByStaff.has(OTHER_STAFF_LABEL)
                ? [{ staffLabel: OTHER_STAFF_LABEL, isOther: true, agencyStats: statsByStaff.get(OTHER_STAFF_LABEL)! }]
                : []
            );

          return { positionLabel: g.positionLabel, total, staffGroups };
        })
        .filter((g) => g.total > 0);
      const totalCount = digestPositionGroups.reduce((acc, g) => acc + g.total, 0);
      return { positionGroups: digestPositionGroups, totalCount };
    };

    const notifyCalls: Promise<void>[] = [];
    staffList.forEach((staff) => {
      getStaffWebhookEntriesForKind(staff, kind).forEach((entry) => {
        const { positionGroups, totalCount } = buildDigestPayload(entry.digestTargetStaffNames);
        notifyCalls.push(
          notifyApplicationsDigestApi({
            accessToken: driveAccessToken,
            webhookUrl: entry.url,
            staffName: staff.name,
            staffMentionId: staff.chatMentionId,
            periodLabel,
            totalCount,
            positionGroups
          })
        );
      });
    });
    getGroupWebhookEntriesForKind(groupChatWebhooks, kind).forEach((entry) => {
      const { positionGroups, totalCount } = buildDigestPayload(entry.digestTargetStaffNames);
      notifyCalls.push(
        notifyApplicationsDigestApi({
          accessToken: driveAccessToken,
          webhookUrl: entry.url,
          periodLabel,
          totalCount,
          positionGroups
        })
      );
    });

    if (notifyCalls.length === 0) {
      // silent（自動送信）時は無言でスキップ — 誰も操作していないのに「Webhook未設定」警告だけ
      // 突然出るのは驚かせるだけなので、この警告は手動ボタン操作時のみ表示する。
      if (!opts?.silent) {
        showToast('送信先のWebhookが設定されていません（担当者マスタ・エージェント／採用担当設定をご確認ください）', 'warning');
      }
      return;
    }

    const results = await Promise.allSettled(notifyCalls);
    const failedCount = results.filter((r) => r.status === 'rejected').length;
    if (failedCount > 0) {
      showToast(`応募状況の送信に${failedCount}件失敗しました（Webhook設定をご確認ください）`, 'warning');
    } else if (!opts?.silent) {
      showToast(`応募状況をChatに送信しました（${notifyCalls.length}件）`, 'success');
    }

    // 「本日の応募状況」は手動ボタン・16時以降の自動送信のどちらから呼ばれても1日1回に統一する
    // ため、送信経路を問わずここで「今日は送信済み」を記録する。これがないと、誰かが日中に手動で
    // ボタンを押した後、16時になると自動送信の方はそれを知らずに別途もう一度送ってしまい、
    // 同じ日に2通届くことになる。
    if (kind === 'DAILY_APPLICATIONS_DIGEST') {
      const today = new Date().toISOString().split('T')[0];
      bumpDailyDigestDate(today);
      attemptBackup();
    }
  };

  // Yield Metrics Computation per Agency (all-time, unfiltered — DashboardView computes its own
  // period/position-scoped version from the same shared function when it needs to match its filters).
  const yieldMetrics: YieldMetrics[] = computeYieldMetrics(agencies, candidates);

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
      REJECTED: '見送り',
      DECLINED: '選考辞退'
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
        patchMeetingLog,
        deleteMeetingLog,
        importHistoricalMeetingLogs,
        updateCandidatePhase,
        updateCandidateSchedule,
        updateInterviewersForPhase,
        updateScheduleForPhase,
        toggleSkippedPhase,
        updateInterviewFormatForPhase,
        updateInterviewLogForPhase,
        updateAptitudeTestStatus,
        updateOnboardingInfo,
        updateOnboardingChecklistItem,
        addEvaluationNote,
        updateEvaluationNote,
        deleteEvaluationNote,
        addCandidate,
        updateCandidate,
        patchCandidate,
        getLatestCandidate,
        runCandidateDriveTask,
        trackDraftDriveFolder,
        discardDraftDriveFolder,
        mergeResumeDocuments,
        deleteCandidate,
        restoreCandidate,
        permanentlyDeleteCandidate,
        reissueCandidateId,
        addAgency,
        updateAgency,
        deleteAgency,
        toggleAgencyActive,
        addStaff,
        deleteStaff,
        updateStaff,
        groupChatWebhooks,
        updateGroupChatWebhooks,
        positions,
        updatePositions,
        positionOptions: positions.map((p) => p.label),
        inquiries,
        addInquiryMessage,
        sendApplicationsDigest,
        yieldMetrics,
        filteredCandidates,
        archivedCandidates,
        myStaffRecord,
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
