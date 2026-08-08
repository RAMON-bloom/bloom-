export const STANDARD_POSITIONS = ['EC', 'BP', 'AIX', 'BRE', 'BCA'] as const;
export type StandardPosition = typeof STANDARD_POSITIONS[number];

export type LcmRating = '〇' | '△' | '✕';
export type BcaDesiredDepartment = 'F+' | 'AC' | 'BOTH';

export type SelectionPhase = 
  | 'DOCUMENT_SCREENING'  // 書類選考
  | 'CASUAL_INTERVIEW'    // カジュアル面談
  | 'FIRST_INTERVIEW'     // 1次面接
  | 'SECOND_INTERVIEW'    // 2次面接
  | 'FINAL_INTERVIEW'     // 最終面接
  | 'OFFER_ISSUED'        // 内定
  | 'OFFER_ACCEPTED'      // 承諾
  | 'REJECTED_DECLINED';  // 辞退 / 不採用

export type ScheduleStatus = 
  | 'UNARRANGED'       // 未手配
  | 'PROPOSING_DATES'  // 候補日提示中
  | 'SCHEDULE_CONFIRMED' // 日程確定
  | 'WAITING_RESULT';   // 結果待ち

export type UserRole = 'ADMIN' | 'INTERVIEWER' | 'AGENCY';

export type EvaluationGrade = 'A+' | 'A-' | 'B+' | 'B' | 'B-' | 'C';

export type PreJoinDinnerStatus = 
  | 'UNPLANNED'    // 未定
  | 'SCHEDULED'    // 予定あり
  | 'COMPLETED'    // 実施済み
  | 'NOT_REQUIRED'; // 不要・不参加

export type ResignationNegotiationStatus = 
  | 'NOT_STARTED'      // 未着手
  | 'IN_PROGRESS'      // 交渉中
  | 'NOTICE_SUBMITTED' // 退職願提出済
  | 'COMPLETED'        // 交渉完了
  | 'DIFFICULT';       // 難航・調整中

export interface EvaluationNote {
  id: string;
  createdAt: string;
  author: string;
  authorRole: string;
  phase: SelectionPhase;
  rating?: number; // legacy 1-5 fallback
  interviewRating?: EvaluationGrade; // 面接評価 (A+, A-, B+, B, B-, C)
  bcaDesiredDepartment?: BcaDesiredDepartment; // 希望事業部 (F+ / AC / BOTH)
  
  // LCM評価要素 (〇, △, ✕)
  lRating?: LcmRating; // L評価 (ルックス)
  cRating?: LcmRating; // C評価 (コミュニケーション)
  mRating?: LcmRating; // M評価 (マインド)
  lNote?: string; // L評価 (ルックス) 補足メモ
  cNote?: string; // C評価 (コミュニケーション) 補足メモ
  mNote?: string; // M評価 (マインド) 補足メモ

  goodPoints?: string; // 評価ポイント
  concerns?: string;   // 懸念点
  otherNotes?: string; // その他メモ
  comment: string;
  interviewers?: string[]; // 担当面接官リスト (複数指定可)
  resultStatus?: 'PASS' | 'FAIL' | 'PENDING';
  failReason?: string;
}

export interface Candidate {
  id: string; // e.g. CAND-0001
  name: string;
  nameKana?: string;
  age?: number;
  education?: string;
  currentCompany?: string;
  companyCount?: number;
  email: string;
  phone: string;
  jobTitle: string; // e.g. Frontend Engineer, Sales Manager, BCA
  bcaDesiredDepartment?: BcaDesiredDepartment; // BCA選考者の希望事業部 (F+ / AC / BOTH)
  appliedDate: string; // YYYY-MM-DD
  appliedMonth: string; // YYYY-MM (e.g., 2026-07)
  agencyId: string; // Foreign key to Agency
  agencyName: string; // e.g., A社, B社, 直接応募, リファラル
  assignees: string[]; // List of internal staff names
  phase: SelectionPhase;
  scheduleStatus: ScheduleStatus;
  nextScheduleDate?: string; // YYYY-MM-DD THH:mm
  nextInterviewers?: string[]; // 次回面接官リスト (1次面接以降)
  avatarUrl?: string; // 履歴書切り抜き顔写真 URL
  resumeSummary: string; // Brief career summary
  rawResumeContent?: string; // Original resume full text / document content
  resumeFileName?: string;
  resumeDriveUrl?: string; // Google Drive上に保存された履歴書・応募書類ファイル（代表1件）へのリンク
  resumeDriveFileId?: string; // 上記ファイルのDrive ID
  resumeDriveFolderId?: string; // 候補者専用のDriveフォルダID（各フェーズフォルダ内、選考フェーズ変更時にこのフォルダごと移動する）
  resumeDocuments?: { name: string; driveUrl: string; driveFileId: string }[]; // Driveに保存された全書類（履歴書・職務経歴書など複数アップロード時の一覧。resumeDriveUrl/FileIdはこの1件目と同じ）
  resumeSkills?: string[];
  evaluationNotes: EvaluationNote[];
  interviewRating?: EvaluationGrade; // 最新/総合面接評価 (A+, A-, B+, B, B-, C)
  lRating?: LcmRating; // 最新/総合 L評価 (〇, △, ✕)
  cRating?: LcmRating; // 最新/総合 C評価 (〇, △, ✕)
  mRating?: LcmRating; // 最新/総合 M評価 (〇, △, ✕)
  lNote?: string; // L評価 補足メモ
  cNote?: string; // C評価 補足メモ
  mNote?: string; // M評価 補足メモ
  rejectionReason?: string;
  salaryExpectation?: string;
  joiningDate?: string; // 入社予定日 YYYY-MM-DD
  preJoinDinnerStatus?: PreJoinDinnerStatus; // 入社前会食状況
  preJoinDinnerDate?: string; // 会食予定日/実施日
  resignationNegotiationStatus?: ResignationNegotiationStatus; // 退職交渉状況
  onboardingNotes?: string; // 入社準備・オンボーディングメモ
  notes?: string;
  isArchived?: boolean; // 削除・過去アーカイブ済みフラグ
  deletedAt?: string;  // 削除・アーカイブ日時
  lastUpdated: string;
}

export interface AgencyContact {
  id: string;
  name: string;
  role?: string; // e.g. 窓口担当 (メイン), キャリアアドバイザー (CA), リクルーティングアドバイザー (RA), 契約・請求担当
  email?: string;
  phone?: string;
  isPrimary?: boolean;
}

export interface Agency {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  contacts?: AgencyContact[]; // 窓口担当者および各エージェント担当者リスト
  commissionRate: number; // Percentage e.g. 35%
  monthlyTarget: number;
  active: boolean;
  notes?: string;
  assignedStaffNames?: string[]; // Internal hiring staff assigned to this agency
}

export interface InternalStaff {
  id: string;
  name: string;
  department: string;
  role: string;
  googleChatWebhookUrl?: string; // 本人のGoogle Chatスペースの着信Webhook URL。設定されていれば書類選考担当に割り当てられた際に通知を送る
}

export interface YieldMetrics {
  agencyName: string;
  totalApplications: number;
  documentPassCount: number;
  firstInterviewPassCount: number;
  secondInterviewPassCount: number;
  finalInterviewPassCount: number;
  offerCount: number;
  acceptCount: number;
  documentPassRate: number; // %
  firstInterviewPassRate: number; // %
  finalInterviewPassRate: number; // %
  offerRate: number; // %
  acceptRate: number; // %
  overallYieldRate: number; // %
}

export interface AgencyYieldSnapshot {
  agencyId: string;
  agencyName: string;
  total: number;
  docPassRate: number; // %
  firstPassRate: number; // %
  acceptCount: number;
  overallYieldRate: number; // %
}

export interface RecruiterYieldSnapshot {
  candidateCount: number;
  docPassRate: number; // %
  firstPassRate: number; // %
  finalOfferCount: number;
  acceptCount: number;
  agencyStats: AgencyYieldSnapshot[];
}

export interface RecruiterReport {
  recruiterName: string;
  progressNotes: string; // 担当候補者の進捗状況・ボトルネック (手打ちメモ)
  progressLog?: string; // MTGログ取得時の担当者進捗ログ
  recommendationNotes: string; // エージェントからの推薦状況・連携コメント (手打ちメモ)
  yieldNotes: string; // 歩留まり・合格率の考察 (手打ちメモ)
  upcomingInitiatives: string[]; // 今後の取り組み・アクションアイテム (手打ち項目)
  initiativesLog?: string[]; // MTGログ取得時の取り組み・ToDoログ
  actionItemsCompleted?: boolean[];
  // Frozen at the time this recruiter's row in this meeting was first created, so opening an old
  // meeting log later shows what the numbers were back then instead of always recalculating from
  // candidates' current (possibly since-changed) phases. Absent on meetings saved before this
  // field existed — falls back to a live calculation in that case.
  yieldSnapshot?: RecruiterYieldSnapshot;
}

export interface MeetingActionItem {
  id: string;
  text: string;
  assignee: string;
  done: boolean;
}

export interface MeetingLog {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD THH:mm
  meetUrl?: string; // Web会議URL
  attendees: string[]; // 参加者リスト
  overallSummary?: string; // 採用全般メモ (手打ちメモ)
  overallActionNotes?: string; // MTG全体 アクションアイテム・宿題 (手打ちメモ)
  fetchedOverallLog?: string; // MTGログ取得・AI要約ログ
  rawTranscript?: string; // 議事録・テキストログ
  sourceDriveFileId?: string; // 取り込み元のDriveファイルID
  sourceDriveFileName?: string; // 取り込み元のDriveファイル名
  recruiterReports: RecruiterReport[];
  actionItems: MeetingActionItem[];
}

