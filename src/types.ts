// 選考ポジションのマスタ一覧。以前は固定配列(STANDARD_POSITIONS)だったが、採用担当が
// エージェント／採用担当マスタ設定画面から追加・削除・編集できるよう、id付きの配列として
// ATSContextの他の共有マスタデータ（agencies/staffList等）と同じ形でDrive経由で同期する。
export interface RecruitmentPosition {
  id: string;
  label: string;
}

// 初回ログイン・localStorage未保存の端末での初期値。実際の一覧はATSContextのpositions
// (Drive共有バックアップ経由で同期)を参照すること。
// 「BCA」はEC/BP事業部をまとめた呼称であり、候補者が直接選ぶ募集ポジションではないため、
// 独立した項目としては含めない（EC・BPどちらも実質BCA配下）。ダイジェスト集計・ダッシュボード
// 側で「BCA」という見出しを立てる際は、EC/BPのjobTitleを持つ候補者を合算する
// （src/lib/yieldMetrics.tsのDIGEST_SPLIT_POSITIONS参照）。
export const DEFAULT_POSITIONS: RecruitmentPosition[] = [
  { id: 'pos-ec', label: 'EC' },
  { id: 'pos-bp', label: 'BP' },
  { id: 'pos-aix', label: 'AIX' },
  { id: 'pos-bre', label: 'BRE' },
  { id: 'pos-middle', label: 'ミドル' }
];

// 共有Drive上のpositions一覧に残っている、独立した募集ポジションとしての「BCA」（過去に
// DEFAULT_POSITIONSへ含まれていた名残）を、一度きりのマイグレーションとして取り除く。EC/BP自体
// は変更しない。適用してもcandidatesのjobTitleは一切書き換わらない（jobTitleが"BCA"の候補者は
// 実データ上存在しないことを確認済み）ので、既存候補者データへの影響はない。
export function migrateLegacyPositions(positions: RecruitmentPosition[]): RecruitmentPosition[] {
  return positions.filter((p) => p.label !== 'BCA');
}

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
  | 'REJECTED'            // 見送り（自社都合の不採用）
  | 'DECLINED';           // 選考辞退（候補者都合の辞退）

export type ScheduleStatus =
  | 'UNARRANGED'       // 未手配
  | 'PROPOSING_DATES'  // 候補日提示中
  | 'SCHEDULE_CONFIRMED' // 日程確定
  | 'WAITING_RESULT';   // 結果待ち

export type InterviewFormat =
  | 'IN_PERSON' // 対面
  | 'ONLINE';   // オンライン

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

export interface ImportedInterviewLog {
  eventSummary?: string; // 一致したカレンダー予定のタイトル
  eventStart?: string; // 一致したカレンダー予定の開始日時
  sourceDriveFileId: string; // 取り込み元のGemini議事録DriveファイルID
  sourceDriveFileName: string;
  rawContent: string; // 議事録原文
  summary: {
    overview: string;
    keyHighlights: string[];
    interviewFeedback: string;
    candidateQuestions: string;
    nextAction: string;
    summaryMarkdown: string;
  };
  importedAt: string; // 取り込み実行日時 (ISO)
}

// 賞与保証の1回分の支給内訳。複数回に分けて支給されるケース（例: 初年度冬・翌年夏の2回）に
// 対応するため配列で持つ（Candidate.bonusGuaranteeInstallments）。
export interface BonusGuaranteeInstallment {
  amount: number; // 金額（円）
  paymentMonth: string; // 支給年月 (YYYY-MM)
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
  documentScreeningAssignee?: string; // 弊社主担当者とは別に書類選考のみを担当する社内スタッフ名（未設定/主担当者と同一の場合は主担当者がそのまま書類選考も担当）
  phase: SelectionPhase;
  scheduleStatus: ScheduleStatus;
  nextScheduleDate?: string; // YYYY-MM-DD THH:mm
  nextInterviewers?: string[]; // 次回面接官リスト (1次面接以降)
  interviewersByPhase?: Partial<Record<SelectionPhase, string[]>>; // 選考フローの各ステップ（1次面接・2次面接など）ごとの担当面接官リスト。nextInterviewersは「次に控えている1件」用の単一枠だが、こちらはステップごとに独立して保持するため、まだ現在のフェーズに到達していないステップにも事前アサインできる
  interviewFormatByPhase?: Partial<Record<SelectionPhase, InterviewFormat>>; // 選考フローの各ステップごとの実施方式（対面 / オンライン）
  interviewLogsByPhase?: Partial<Record<SelectionPhase, ImportedInterviewLog>>; // 選考フローの各ステップごとに、Drive/カレンダー連携で取り込んだ面談ログ(Gemini議事録AI要約)
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
  rejectionReason?: string; // 見送り/選考辞退の理由メモ（任意）
  // Webhook URL -> Google Chatが実際に解決したスレッドのresource name（例: "spaces/AAAA/threads/BBBB"）。
  // document-screening-thread/evaluation-summary-thread通知の応答から捕捉し、次回以降の同じ候補者
  // 宛て通知はthreadKeyではなくこの実IDで返信することで、時間経過によるthreadKey突合失敗（Chat側の
  // 既知の制限）を回避する。Webhookごと（＝Chatスペースごと）にスレッド実体が別れるためURL単位で保持。
  chatThreadNames?: Record<string, string>;
  salaryExpectation?: string;
  baseMonthlySalary?: number; // 基本月給（円）。エージェント支払額の計算基準（年収換算=×12）
  hasBonusGuarantee?: boolean; // 賞与保証の有無
  bonusGuaranteeInstallments?: BonusGuaranteeInstallment[]; // 賞与保証の支給内訳（複数回に分けて支給される場合は複数件）。hasBonusGuaranteeがtrueの場合のみ有効
  hasSignOnBonus?: boolean; // サインオンボーナスの有無
  signOnBonusAmount?: number; // サインオンボーナス金額（円）。hasSignOnBonusがtrueの場合のみ有効
  joiningDate?: string; // 入社予定日 YYYY-MM-DD
  preJoinDinnerStatus?: PreJoinDinnerStatus; // 入社前会食状況
  preJoinDinnerDate?: string; // 会食予定日/実施日
  resignationNegotiationStatus?: ResignationNegotiationStatus; // 退職交渉状況
  onboardingNotes?: string; // 入社準備・オンボーディングメモ
  notes?: string;
  isArchived?: boolean; // 削除・過去アーカイブ済みフラグ
  deletedAt?: string;  // 削除・アーカイブ日時
  aptitudeTestDeadline?: string; // 適性検査 実施期限日時 (datetime-local形式 YYYY-MM-DDTHH:mm)。ステータスバッジの締切表示に使用
  aptitudeTestSentAt?: string; // 適性検査を送付済みとして手動でマークした日時 (ISO)
  aptitudeTestCompletedAt?: string; // 候補者が適性検査を実施済みとして手動でマークした日時 (ISO)。Google Form回答の自動検知はしないため手動運用
  docScreeningNudgeLastSentDate?: string; // 書類選考対応漏れの個別督促(DOC_SCREENING_NUDGE)を最後に送った日 (YYYY-MM-DD)。毎日連続で督促し続けないためのクールダウン判定に使う
  aptitudeTestVerbalScore?: number; // 適性検査 言語スコア (0〜10点満点)
  aptitudeTestNonVerbalScore?: number; // 適性検査 非言語スコア (0〜10点満点)
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
  commissionAppliesToBonusGuarantee?: boolean; // 紹介手数料率を賞与保証額にも適用するか
  commissionAppliesToSignOnBonus?: boolean; // 紹介手数料率をサインオンボーナス額にも適用するか
  monthlyTarget: number;
  active: boolean;
  notes?: string;
  assignedStaffNames?: string[]; // Internal hiring staff assigned to this agency（ポジション別上書きが無い場合のデフォルト）
  // 同じエージェントでも選考ポジション(BCA/AIX/BRE)によって窓口となる弊社担当者が異なる場合の上書き。
  // キーは選考ポジションのラベル(例:"BCA")。値が空/未指定のポジションはassignedStaffNamesにフォール
  // バックする。応募状況ダイジェスト（BCA/AIX/BREを個別に見出しを立てる機能）でのみ参照する — その他
  // ポジション（EC/BP/ミドル等）はダイジェスト側で1つの「その他」に束ねられるため、この上書きは効かない。
  assignedStaffNamesByPosition?: Partial<Record<string, string[]>>;
}

// Google Chatへ送る通知の種類。1件のWebhook URLごとにどの種類を受け取るか選べるようにし、
// 「このリンクには合否確定だけ、あのリンクには新規アサイン通知だけ」という主旨ごとの振り分けを可能にする。
// 将来的に通知種別を追加する際はここに追記する。
export type ChatNotificationKind =
  | 'CANDIDATE_REGISTERED'        // 書類選考担当への新規候補者アサイン通知
  | 'ATTENTION_DIGEST'            // 進捗停滞・書類選考対応漏れの定期ダイジェスト（採用アシスタント向け）
  | 'DOC_SCREENING_NUDGE'         // 書類選考の対応が止まっている候補者の個別督促
  | 'EVALUATION_RESULT'           // 選考結果（合格/不採用、書類選考含む）確定の通知
  | 'DOCUMENT_SCREENING_THREAD'   // 書類選考通過時、候補者名＋エージェント名で新規スレッドを作成
  | 'DEVELOPER_INQUIRY'           // アプリ内「お問い合わせ」からのメッセージ送信
  | 'EVALUATION_SUMMARY_THREAD'   // 各フェーズの合否判定・LCM評価サマリ・次回面接官のアサイン状況を、書類選考通過スレッドへ書き込む
  | 'DAILY_APPLICATIONS_DIGEST'     // ダッシュボードの「本日の応募状況を送信」ボタンからの手動送信
  | 'PERIOD_APPLICATIONS_DIGEST';   // ダッシュボードの「指定期間の応募状況を送信」ボタンからの手動送信

// 個人用・グループ用どちらのWebhook登録にも使う共通の形。「誰に属するか」は保持先（InternalStaff.
// googleChatWebhooksか、組織全体のgroupChatWebhooksか）で決まる。
export interface ChatWebhook {
  id: string;
  url: string;
  label?: string; // 自分用の任意メモ（例:「個人スペース」「採用チーム全体」）。どのGoogle Chatスペース宛かを区別するため
  kinds: ChatNotificationKind[]; // このURLに送る通知の種類（複数選択可）
  // DAILY/PERIOD_APPLICATIONS_DIGEST専用の絞り込み。指定した採用担当者に紐づくエージェント
  // （Agency.assignedStaffNames）の推薦状況だけをこのURLへ送る。未設定/空配列なら従来通り
  // 全エージェント対象。
  digestTargetStaffNames?: string[];
}

export interface InternalStaff {
  id: string;
  name: string;
  department: string;
  role: string;
  googleChatWebhookUrl?: string; // 旧・単一Webhook欄（後方互換のため残置、用途を限定せず全種別の送信対象として扱う）。読み取り側は必ずgetStaffWebhooksForKind()経由で使うこと
  googleChatWebhooks?: ChatWebhook[]; // 本人のGoogle Chatスペースの着信Webhook URL一覧。1件ごとに送る通知の種類(kinds)を指定できる
  email?: string; // Googleログインアカウントのメールアドレス。自己登録・自己編集の識別キー（管理者が手動追加した過去のレコードでは未設定のことがある）
  chatMentionId?: string; // 本人のGoogle Chat数値ユーザーID。設定すると個人宛通知の「@名前」が本物のメンション（相手に通知が飛ぶ）になる。未設定なら太字テキストのみのフォールバック表示
}

// 見送り(REJECTED)候補者を、見送られた選考フェーズ別に集計した内訳。
export interface RejectionPhaseCounts {
  documentScreening: number;
  casualInterview: number;
  firstInterview: number;
  secondInterview: number;
  finalInterview: number;
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
  rejectedByPhase: RejectionPhaseCounts;
}

// 応募状況ダイジェスト（Chat webhook）向けの、選考ポジション別のエージェント内訳。
// computeYieldMetricsByPositionが返す。
export interface PositionYieldGroup {
  positionLabel: string;
  metrics: YieldMetrics[];
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

// A candidate's identity/phase as they stood at snapshot time — deliberately not just a Candidate
// id reference, so a past meeting's pipeline list keeps showing that candidate's phase from back
// then even after their real phase has since moved on.
export interface PipelineCandidateSnapshot {
  id: string;
  name: string;
  jobTitle: string;
  phase: SelectionPhase;
  avatarUrl?: string;
}

export interface RecruiterYieldSnapshot {
  candidateCount: number;
  docPassRate: number; // %
  firstPassRate: number; // %
  finalOfferCount: number;
  acceptCount: number;
  agencyStats: AgencyYieldSnapshot[];
  pipelineCandidates: PipelineCandidateSnapshot[];
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

export interface StalledCandidateInfo {
  candidate: Candidate;
  daysSinceUpdate: number;
}

export interface OverdueDocScreeningInfo {
  candidate: Candidate;
  assigneeName: string;
  daysSinceUpdate: number;
}

// アプリ内「お問い合わせ」機能。開発者との1スレッド分のやり取りをチャット形式で保持する。
// 誰でも既存スレッドにメッセージを追加できるため、開発者からの返信もmessagesに積み上がって
// いく（senderNameで発言者を区別する）。開発者にはGoogle Chatへの通知も別途送られる。
export type InquiryCategory = 'BUG' | 'SUGGESTION' | 'OTHER';

export interface InquiryMessage {
  id: string;
  text: string;
  senderName: string; // 送信した担当者名（未登録の場合はログインメールアドレス）
  createdAt: string; // ISO timestamp
}

export interface Inquiry {
  id: string;
  category: InquiryCategory;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  messages: InquiryMessage[];
}

// 「Driveと同期」がDrive上のレジュメフォルダ構成を実際のapp状態へ即反映せず、まずは差分だけを
// 計算してユーザーに提示するための型。何を反映し、何を無視する（今後の同期対象から外す）かを
// 選んでから適用できるようにするのが目的（過去の古いレジュメが無自覚に選考パイプラインへ
// 新規候補者として乗ってしまう事故を防ぐ）。
// アプリのフェーズとDriveフォルダの位置が食い違っているとき、どちらを正とするか。
// APP_TO_DRIVE: アプリの現在フェーズが正 → Driveフォルダをそのフェーズのフォルダへ移動する
//   （アプリでフェーズ変更した際のDrive側の移動が失敗・未完了のまま残っている典型ケース）
// DRIVE_TO_APP: Drive上のフォルダ位置が正 → アプリのフェーズをそれに合わせて変更する
//   （Drive上で手でフォルダを動かして選考を進めた／戻したケース）
export type DriveSyncPhaseMoveDirection = 'APP_TO_DRIVE' | 'DRIVE_TO_APP';

export interface DriveSyncPhaseMove {
  candidateId: string;
  candidateName: string;
  currentPhase: SelectionPhase;
  drivePhase: SelectionPhase;
  driveItemId: string; // 候補者のDriveフォルダID（フォルダ化前の旧候補者は履歴書ファイルID）
  suggestedDirection: DriveSyncPhaseMoveDirection; // 既定の解消方向（最終的にはモーダルでユーザーが選ぶ）
}

export interface DriveSyncNewImport {
  key: string; // folderId、フォルダが無い場合はfile.id
  displayName: string;
  phase: SelectionPhase;
  folderId: string | null;
  file: { id: string; name: string; mimeType: string; webViewLink?: string }; // 代表ファイル（AI解析対象）。filesの1件目と同じ
  files: { id: string; name: string; mimeType: string; webViewLink?: string }[]; // フォルダ内の全ファイル（履歴書・職務経歴書など複数保存時も取りこぼさないため）
}

// 既に登録済みの候補者のDriveフォルダに、アプリ側がまだ知らないファイル（履歴書に後から
// 職務経歴書を追加した、等）が増えていた場合の差分。取り込んでもresumeDocumentsに追記される
// だけでDrive側は一切変更しないため、フェーズ更新と同様デフォルトでチェック済みにして問題ない。
export interface DriveSyncDocUpdate {
  candidateId: string;
  candidateName: string;
  newFiles: { id: string; name: string; mimeType: string; webViewLink?: string }[];
}

// 書類選考通過後などにDrive側で新しいフェーズフォルダへ別フォルダが作られ、古いフェーズフォルダに
// 残ったフォルダが誰にも参照されないまま残り続けるケースの検知結果。同一候補者名（Drive側の
// フォルダ命名規則 "氏名" or "氏名_エージェント名" 、api/drive/upload-resume.ts参照）に一致する
// フォルダがDrive上に複数フェーズにまたがって存在する場合に1件としてまとめる。
export interface DriveSyncDuplicateFolderOption {
  folderId: string;
  phase: SelectionPhase | null; // 既知のフェーズフォルダ名に一致しない場合はnull（phaseLabelを表示に使う）
  phaseLabel: string;
  folderName: string;
  files: { id: string; name: string; mimeType: string; webViewLink?: string }[];
  isCurrent: boolean; // 候補者のresumeDriveFolderIdが指しているフォルダ
}

export interface DriveSyncDuplicateFolder {
  candidateId: string;
  candidateName: string;
  candidatePhase: SelectionPhase;
  options: DriveSyncDuplicateFolderOption[]; // 同一候補者に紐づくと判定された、2件以上のDriveフォルダ
}

export interface DriveSyncPreview {
  phaseMoves: DriveSyncPhaseMove[];
  newImports: DriveSyncNewImport[];
  docUpdates: DriveSyncDocUpdate[];
  duplicateFolders: DriveSyncDuplicateFolder[];
}

