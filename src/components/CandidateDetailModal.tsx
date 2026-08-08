import React, { useState, useEffect, useRef } from 'react';
import { useATS } from '../context/ATSContext';
import { Candidate, SelectionPhase, ScheduleStatus, EvaluationGrade, PreJoinDinnerStatus, ResignationNegotiationStatus, STANDARD_POSITIONS, LcmRating, BcaDesiredDepartment, EvaluationNote } from '../types';
import { useAuth } from '../context/AuthContext';
import { isFirstInterviewOrAbove } from './KanbanView';
import { ResumePhotoCropperModal } from './ResumePhotoCropperModal';
import { uploadResumeToDrive, detectResumePhotoCrop } from '../lib/driveApi';
import { renderAndCrop } from '../lib/photoCrop';
import { MAX_UPLOAD_FILE_BYTES, readFileAsDataUrl, compressFileIfOversized } from '../lib/fileUpload';
import { getNextPhase } from '../lib/phaseUtils';
import { 
  X, 
  Calendar, 
  Clock, 
  Star, 
  FileText, 
  Code,
  Building2, 
  Send, 
  Download, 
  Sparkles, 
  Tag, 
  MessageSquare, 
  Edit2,
  UserCheck,
  GraduationCap,
  Briefcase,
  User,
  Users,
  Award,
  HeartHandshake,
  CheckCircle2,
  Loader2,
  Copy,
  FileCheck,
  Mail,
  RefreshCw,
  ExternalLink,
  Check,
  UploadCloud,
  Trash2,
  RotateCcw,
  Camera,
  Crop,
  LayoutDashboard,
  ChevronDown,
  ChevronUp,
  HelpCircle
} from 'lucide-react';

const EVALUATION_GRADES: EvaluationGrade[] = ['A+', 'A-', 'B+', 'B', 'B-', 'C'];

const PHASE_LABELS: Record<SelectionPhase, string> = {
  DOCUMENT_SCREENING: '書類選考',
  CASUAL_INTERVIEW: 'カジュアル面談',
  FIRST_INTERVIEW: '1次面接',
  SECOND_INTERVIEW: '2次面接',
  FINAL_INTERVIEW: '最終面接',
  OFFER_ISSUED: '内定通知',
  OFFER_ACCEPTED: '内定承諾',
  REJECTED_DECLINED: '辞退 / 不採用'
};

export const renderGradeBadge = (
  label: string, 
  grade?: EvaluationGrade | null, 
  size: 'sm' | 'md' = 'sm'
) => {
  if (!grade) return <span className="text-slate-400 text-xs italic">未設定</span>;

  let colorStyle = 'bg-slate-100 text-slate-700 border-slate-200';
  switch (grade) {
    case 'A+':
    case 'A-':
      colorStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold';
      break;
    case 'B+':
    case 'B':
    case 'B-':
      colorStyle = 'bg-amber-50 text-amber-800 border-amber-200 font-bold';
      break;
    case 'C':
      colorStyle = 'bg-rose-50 text-rose-800 border-rose-200 font-bold';
      break;
  }

  const px = size === 'md' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[11px]';

  return (
    <span className={`inline-flex items-center gap-1 border rounded-md font-mono ${colorStyle} ${px}`}>
      <span className="text-[10px] text-slate-500 font-sans font-normal">{label}:</span>
      <span>{grade}</span>
    </span>
  );
};

export const CandidateDetailModal: React.FC = () => {
  const { 
    candidates, 
    selectedCandidateId, 
    setSelectedCandidateId, 
    updateCandidatePhase, 
    updateCandidateSchedule,
    updateInterviewersForPhase,
    updateOnboardingInfo,
    addEvaluationNote,
    updateEvaluationNote,
    deleteEvaluationNote,
    updateCandidate,
    deleteCandidate,
    restoreCandidate,
    staffList,
    userRole,
    showToast,
    driveAccessToken
  } = useATS();
  const { accessToken: authAccessToken, signIn: authSignIn } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'evaluation' | 'resume' | 'onboarding'>('evaluation');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const evalFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeSubTab]);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showGmailPanel, setShowGmailPanel] = useState(false);
  const [docCategory, setDocCategory] = useState<'cv' | 'resume' | 'ai_summary'>('cv');
  const [isDetailDragging, setIsDetailDragging] = useState(false);
  const [isDetailParsing, setIsDetailParsing] = useState(false);
  const [isDetailCompressing, setIsDetailCompressing] = useState(false);
  const [isDetailDetectingPhoto, setIsDetailDetectingPhoto] = useState(false);
  const [isPhotoCropperOpen, setIsPhotoCropperOpen] = useState(false);
  const [selectedResumeDocIndex, setSelectedResumeDocIndex] = useState(0);

  // Section Collapse State for Card Sections
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    dashboard: false,
    evalForm: false,
    evalHistory: false,
    gmailLog: false,
    resume: false,
    onboarding: false,
  });

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  // Gmail Sync State
  const [isSyncingGmail, setIsSyncingGmail] = useState(false);
  const [gmailData, setGmailData] = useState<{
    messages: Array<{ id: string; subject: string; from: string; date: string; snippet: string; body: string }>;
    summary: {
      overview: string;
      keyHighlights: string[];
      interviewFeedback: string;
      candidateQuestions: string;
      nextAction: string;
      summaryMarkdown: string;
    };
    isLiveGmailData: boolean;
  } | null>(null);

  // Evaluation Note Form state
  const [evalTargetPhase, setEvalTargetPhase] = useState<SelectionPhase>('FIRST_INTERVIEW');
  // 面接評価(A/B/C)・LCMは、未評価であることが分かるようどれも選択されていない状態を
  // デフォルトにする(選ぶまでグレー表示のまま)。
  const [newInterviewRating, setNewInterviewRating] = useState<EvaluationGrade | undefined>(undefined);
  const [newDesiredDepartment, setNewDesiredDepartment] = useState<BcaDesiredDepartment | undefined>(undefined);
  const [newLRating, setNewLRating] = useState<LcmRating | undefined>(undefined);
  const [newCRating, setNewCRating] = useState<LcmRating | undefined>(undefined);
  const [newMRating, setNewMRating] = useState<LcmRating | undefined>(undefined);
  const [newLNote, setNewLNote] = useState<string>('');
  const [newCNote, setNewCNote] = useState<string>('');
  const [newMNote, setNewMNote] = useState<string>('');
  const [newGoodPoints, setNewGoodPoints] = useState<string>('');
  const [newConcerns, setNewConcerns] = useState<string>('');
  const [newOtherNotes, setNewOtherNotes] = useState<string>('');
  const [newComment, setNewComment] = useState<string>('');
  const [evalAuthor, setEvalAuthor] = useState<string>(staffList[0]?.name || '山田 太郎');
  const [evalResultStatus, setEvalResultStatus] = useState<'PASS' | 'FAIL' | 'PENDING'>('PASS');
  const [failReason, setFailReason] = useState<string>('');

  // Evaluation Log edit/delete state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [deleteConfirmNoteId, setDeleteConfirmNoteId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState<{
    phase: SelectionPhase;
    interviewRating?: EvaluationGrade;
    bcaDesiredDepartment?: BcaDesiredDepartment;
    lRating?: LcmRating;
    cRating?: LcmRating;
    mRating?: LcmRating;
    lNote: string;
    cNote: string;
    mNote: string;
    resultStatus: 'PASS' | 'FAIL' | 'PENDING';
    failReason: string;
    comment: string;
  } | null>(null);

  // Loads a note's fields into the inline edit form. Structured notes (goodPoints/concerns/
  // otherNotes stored as separate fields) get reassembled into one editable block using the same
  // 【見出し】format they were originally composed with, since there's no reliable way to keep
  // three free-text fields independently editable and still guarantee they round-trip back into
  // the single `comment` string exactly as before. Saving an edit always writes back through
  // `comment` only — the note keeps working (shown as one block instead of three colored cards)
  // even though it loses that visual separation after being edited once.
  const startEditNote = (note: EvaluationNote) => {
    const combinedComment = (note.goodPoints || note.concerns || note.otherNotes)
      ? [
          note.goodPoints ? `【評価ポイント】\n${note.goodPoints}` : null,
          note.concerns ? `【懸念点】\n${note.concerns}` : null,
          note.otherNotes ? `【その他メモ】\n${note.otherNotes}` : null
        ].filter(Boolean).join('\n\n')
      : note.comment;
    setEditingNoteId(note.id);
    setEditNote({
      phase: note.phase,
      interviewRating: note.interviewRating,
      bcaDesiredDepartment: note.bcaDesiredDepartment,
      lRating: note.lRating,
      cRating: note.cRating,
      mRating: note.mRating,
      lNote: note.lNote || '',
      cNote: note.cNote || '',
      mNote: note.mNote || '',
      resultStatus: note.resultStatus || 'PENDING',
      failReason: note.failReason || '',
      comment: combinedComment || ''
    });
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditNote(null);
  };

  const saveEditNote = () => {
    if (!editingNoteId || !editNote || !candidate) return;
    const original = candidate.evaluationNotes.find((n) => n.id === editingNoteId);
    if (!original) return;
    updateEvaluationNote(candidate.id, editingNoteId, {
      author: original.author,
      authorRole: original.authorRole,
      phase: editNote.phase,
      interviewRating: editNote.interviewRating,
      bcaDesiredDepartment: editNote.bcaDesiredDepartment,
      lRating: editNote.lRating,
      cRating: editNote.cRating,
      mRating: editNote.mRating,
      lNote: editNote.lNote || undefined,
      cNote: editNote.cNote || undefined,
      mNote: editNote.mNote || undefined,
      // Explicitly cleared (not just omitted): updateEvaluationNote merges via `{...old, ...new}`,
      // so omitting a key here would leave the note's stale pre-edit goodPoints/concerns/otherNotes
      // in place and the history card would keep showing the old structured cards instead of the
      // freshly edited comment text below.
      goodPoints: undefined,
      concerns: undefined,
      otherNotes: undefined,
      comment: editNote.comment.trim() || '（所感メモなし）',
      resultStatus: editNote.resultStatus,
      failReason: editNote.resultStatus === 'FAIL' ? editNote.failReason || undefined : undefined
    });
    setEditingNoteId(null);
    setEditNote(null);
  };

  const handleDeleteNote = (noteId: string) => {
    if (!candidate) return;
    deleteEvaluationNote(candidate.id, noteId);
    setDeleteConfirmNoteId(null);
    if (editingNoteId === noteId) {
      setEditingNoteId(null);
      setEditNote(null);
    }
  };

  // Onboarding Form state
  const [onboardingJoiningDate, setOnboardingJoiningDate] = useState<string>('');
  const [onboardingDinnerStatus, setOnboardingDinnerStatus] = useState<PreJoinDinnerStatus>('UNPLANNED');
  const [onboardingDinnerDate, setOnboardingDinnerDate] = useState<string>('');
  const [onboardingResignationStatus, setOnboardingResignationStatus] = useState<ResignationNegotiationStatus>('NOT_STARTED');
  const [onboardingNotesText, setOnboardingNotesText] = useState<string>('');
  const [customInterviewerInput, setCustomInterviewerInput] = useState<string>('');

  // Runs only when the open candidate changes (not on every `candidates` update) — this used to
  // depend on `candidates` too, which meant ANY update anywhere in the app (another candidate's
  // note, a phase change, even this candidate's own note being saved) re-ran it and silently
  // wiped whatever the user had typed into the L/C/M ratings, notes, or target-phase selector for
  // the currently-open candidate before they could submit. That's the main way a 選考メモ in
  // progress could appear to "not be reflected" — it never really saved wrong, it was reset out
  // from under the user while they were still filling it in.
  useEffect(() => {
    if (selectedCandidateId) {
      const c = candidates.find((cand) => cand.id === selectedCandidateId);
      if (c) {
        setEvalTargetPhase(c.phase);
        setOnboardingJoiningDate(c.joiningDate || '');
        setOnboardingDinnerStatus(c.preJoinDinnerStatus || 'UNPLANNED');
        setOnboardingDinnerDate(c.preJoinDinnerDate || '');
        setOnboardingResignationStatus(c.resignationNegotiationStatus || 'NOT_STARTED');
        setOnboardingNotesText(c.onboardingNotes || '');
        setNewInterviewRating(c.interviewRating || undefined);
        setNewDesiredDepartment(c.bcaDesiredDepartment || undefined);
        setNewLRating(c.lRating || undefined);
        setNewCRating(c.cRating || undefined);
        setNewMRating(c.mRating || undefined);
        setNewLNote(c.lNote || '');
        setNewCNote(c.cNote || '');
        setNewMNote(c.mNote || '');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCandidateId]);

  const handleSaveOnboarding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate) return;
    updateOnboardingInfo(candidate.id, {
      joiningDate: onboardingJoiningDate || undefined,
      preJoinDinnerStatus: onboardingDinnerStatus,
      preJoinDinnerDate: onboardingDinnerDate || undefined,
      resignationNegotiationStatus: onboardingResignationStatus,
      onboardingNotes: onboardingNotesText
    });
    showToast('入社・フォロー情報を更新しました', 'success');
  };

  if (!selectedCandidateId) return null;

  const candidate = candidates.find((c) => c.id === selectedCandidateId);
  if (!candidate) return null;

  // Falls back to the single legacy resumeDriveUrl/resumeFileName for candidates registered
  // before multi-document tracking existed, so "原本を開く" still works for them with one option.
  const resumeDocs = candidate.resumeDocuments && candidate.resumeDocuments.length > 0
    ? candidate.resumeDocuments
    : candidate.resumeDriveUrl
    ? [{ name: candidate.resumeFileName || 'ファイル', driveUrl: candidate.resumeDriveUrl, driveFileId: candidate.resumeDriveFileId || '' }]
    : [];
  const activeResumeDocIndex = Math.min(selectedResumeDocIndex, Math.max(0, resumeDocs.length - 1));
  const activeResumeDoc = resumeDocs[activeResumeDocIndex];

  const handleClose = () => setSelectedCandidateId(null);

  const handleSyncGmailLogs = async () => {
    let currentToken = authAccessToken;
    if (!currentToken) {
      try {
        currentToken = await authSignIn();
      } catch (err: any) {
        showToast('Googleログインに失敗しました: ' + (err.message || 'エラー'), 'warning');
        return;
      }
    }

    if (!currentToken) return;

    setIsSyncingGmail(true);
    try {
      const res = await fetch('/api/gmail/sync-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: currentToken,
          candidateEmail: candidate.email,
          candidateName: candidate.name
        })
      });

      const data = await res.json();
      if (data.success) {
        setGmailData(data);
        showToast(`Gmailから ${data.messagesCount} 件の面談ログを取得・Gemini AI要約を完了しました`, 'success');
      } else {
        showToast(data.error || 'Gmail同期に失敗しました', 'warning');
      }
    } catch (err: any) {
      console.error(err);
      showToast('Gmail同期中にネットワークエラーが発生しました', 'warning');
    } finally {
      setIsSyncingGmail(false);
    }
  };

  const handleSaveAiSummaryToNotes = () => {
    if (!gmailData?.summary) return;

    const s = gmailData.summary;
    const noteText = `【Gmail面談ログ AI自動要約】\n\n1. 全体要約: ${s.overview}\n\n2. 面接官評価・フィードバック:\n${s.interviewFeedback}\n\n3. 候補者の質問・志望度・希望条件:\n${s.candidateQuestions}\n\n4. 推奨される次アクション:\n${s.nextAction}\n\n5. 評価ポイント:\n${s.keyHighlights.map(h => '・' + h).join('\n')}`;

    addEvaluationNote(candidate.id, {
      author: 'Gmail & Gemini AI (自動連動)',
      authorRole: 'AI自動要約',
      phase: candidate.phase,
      comment: noteText,
      resultStatus: 'PENDING'
    });

    showToast('Gmail面談AI要約を選考評価メモに登録・保存しました！', 'success');
  };

  // Adds one or more new documents to an already-registered candidate: the first file is AI-
  // parsed to refresh the resume summary/skills/full-text (name, education etc. are left alone —
  // this is a document update, not a re-registration), and every file is uploaded into the
  // candidate's existing Drive folder (creating one if they somehow don't have one yet, e.g. a
  // pre-Drive-integration candidate). Oversized PDFs/images are compressed first, same as at
  // registration. All state changes are collected into one `patch` and applied in a single
  // updateCandidate call at the end, since `candidate` here is a snapshot that would otherwise go
  // stale between an AI-parse update and a later Drive-upload update in the same run.
  const handleDetailFilesDrop = async (rawFiles: globalThis.File[]) => {
    if (!rawFiles || rawFiles.length === 0) return;

    const patch: Partial<Candidate> = {};

    try {
      const needsCompression = rawFiles.some((f) => f.size > MAX_UPLOAD_FILE_BYTES);
      if (needsCompression) setIsDetailCompressing(true);
      const compressedResults = await Promise.all(
        rawFiles.map((f) => (f.size > MAX_UPLOAD_FILE_BYTES ? compressFileIfOversized(f, MAX_UPLOAD_FILE_BYTES) : Promise.resolve({ file: f, compressed: false, truncated: false })))
      );
      setIsDetailCompressing(false);
      compressedResults.forEach(({ file, compressed, truncated }, i) => {
        if (compressed) {
          showToast(
            `${rawFiles[i].name} を圧縮しました（${(rawFiles[i].size / 1024 / 1024).toFixed(1)}MB → ${(file.size / 1024 / 1024).toFixed(1)}MB）` +
              (truncated ? '※ページ数が多いため一部ページを省略しています' : ''),
            'info'
          );
        }
      });
      const files = compressedResults.map((r) => r.file);
      const primaryFile = files[0];

      setIsDetailParsing(true);
      let textContent = '';
      let primaryBase64 = '';
      const primaryTooLarge = primaryFile.size > MAX_UPLOAD_FILE_BYTES;

      if (primaryFile.type.includes('text') || primaryFile.name.endsWith('.txt') || primaryFile.name.endsWith('.md')) {
        textContent = await primaryFile.text();
      } else if (!primaryTooLarge) {
        primaryBase64 = await readFileAsDataUrl(primaryFile);
        try { textContent = await primaryFile.text(); } catch { textContent = ''; }
      }

      if (primaryTooLarge) {
        showToast(
          `${primaryFile.name} は圧縮後も${(primaryFile.size / 1024 / 1024).toFixed(1)}MBあり、AI解析の上限（3MB）を超えているためスキップしました。`,
          'warning'
        );
      } else {
        const response = await fetch('/api/parse-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            textContent,
            fileBase64: primaryBase64,
            fileName: primaryFile.name,
            mimeType: primaryFile.type || 'application/pdf'
          })
        });
        const rawText = await response.text();
        let result: any;
        try {
          result = rawText ? JSON.parse(rawText) : { success: false };
        } catch {
          throw new Error(
            response.status === 413
              ? 'ファイルサイズが大きすぎます。3MB以下のファイルをご利用ください。'
              : `サーバーエラーが発生しました (HTTP ${response.status})`
          );
        }

        if (result.success && result.data) {
          const d = result.data;
          patch.resumeFileName = primaryFile.name;
          patch.rawResumeContent = d.rawResumeContent || textContent || candidate.rawResumeContent;
          patch.resumeSummary = d.resumeSummary || candidate.resumeSummary;
          patch.resumeSkills = Array.isArray(d.resumeSkills) && d.resumeSkills.length > 0 ? d.resumeSkills : candidate.resumeSkills;
          showToast(`${primaryFile.name} を解析し、最新の職務経歴書・履歴書データを反映しました`, 'success');
        } else {
          showToast('ファイルの解析に一部失敗しました。', 'warning');
        }
      }

      // Upload every file (not just the primary) into the candidate's Drive folder — reuses the
      // existing folder if there is one, otherwise creates one (legacy candidates registered
      // before Drive integration, or ones registered without Drive connected at the time).
      if (driveAccessToken) {
        let folderId = candidate.resumeDriveFolderId;
        let primaryUploaded: Awaited<ReturnType<typeof uploadResumeToDrive>> | null = null;
        const allUploaded: Awaited<ReturnType<typeof uploadResumeToDrive>>[] = [];
        let uploadedCount = 0;

        for (const file of files) {
          if (file.size > MAX_UPLOAD_FILE_BYTES) {
            showToast(
              `${file.name} は圧縮後も${(file.size / 1024 / 1024).toFixed(1)}MBあり、Drive保存の上限（3MB）を超えているためスキップしました。`,
              'warning'
            );
            continue;
          }
          try {
            const base64 = file === primaryFile && primaryBase64 ? primaryBase64 : await readFileAsDataUrl(file);
            const uploaded = await uploadResumeToDrive(
              driveAccessToken,
              { name: file.name, type: file.type || 'application/pdf', base64 },
              { candidateName: candidate.name, agencyName: candidate.agencyName, phase: candidate.phase, candidateFolderId: folderId }
            );
            folderId = folderId || uploaded.folderId;
            if (!primaryUploaded) primaryUploaded = uploaded;
            allUploaded.push(uploaded);
            uploadedCount++;
          } catch (driveErr: any) {
            showToast(`${file.name} のDrive保存に失敗しました: ${driveErr.message || '不明なエラー'}`, 'warning');
          }
        }

        if (uploadedCount > 0) {
          // If this candidate's resumeDriveFileId still points at a legacy flat file (uploaded
          // before the per-candidate folder existed, or before resumeDocuments was tracked at
          // all) and we just created/reused a folder for these new uploads, that old file id is
          // about to be overwritten below and would otherwise become permanently unreachable —
          // never inside the folder that move/delete operate on, and not listed anywhere the user
          // could still open or clean it up (this is how leftover files end up stranded in a
          // phase folder even after the candidate is later deleted for good). Fold it into
          // resumeDocuments first so it stays visible and reachable going forward.
          const priorDocIds = new Set((candidate.resumeDocuments || []).map((d) => d.driveFileId));
          const legacyFileId = candidate.resumeDriveFileId;
          const preservedLegacyDoc =
            legacyFileId && legacyFileId !== primaryUploaded?.file.id && !priorDocIds.has(legacyFileId)
              ? [{ name: candidate.resumeFileName || '旧履歴書ファイル', driveUrl: candidate.resumeDriveUrl || '', driveFileId: legacyFileId }]
              : [];

          patch.resumeDriveFolderId = folderId || candidate.resumeDriveFolderId;
          patch.resumeDriveFileId = primaryUploaded?.file.id || candidate.resumeDriveFileId;
          patch.resumeDriveUrl = primaryUploaded?.file.webViewLink || candidate.resumeDriveUrl;
          // Appended (not replaced) — earlier uploads (from registration or a previous document
          // drop) stay selectable alongside whatever's newly added here.
          patch.resumeDocuments = [
            ...preservedLegacyDoc,
            ...(candidate.resumeDocuments || []),
            ...allUploaded.map((u) => ({ name: u.file.name, driveUrl: u.file.webViewLink || '', driveFileId: u.file.id }))
          ];
          showToast(
            uploadedCount > 1 ? `${uploadedCount}件のファイルをDriveフォルダに保存しました` : `${files[0].name} をDriveフォルダに保存しました`,
            'success'
          );

          // Best-effort: if this candidate still has no photo, try to auto-extract one from the
          // newly added documents (same logic as at registration). Never overwrites a photo the
          // candidate already has (manually cropped or previously auto-detected).
          if (!candidate.avatarUrl && allUploaded.length > 0) {
            setIsDetailDetectingPhoto(true);
            let photoFound = false;
            let lastPhotoError: string | null = null;
            try {
              for (const uploaded of allUploaded) {
                if (!uploaded.file.id) continue;
                try {
                  const detected = await detectResumePhotoCrop(driveAccessToken, uploaded.file.id);
                  if (detected.found && detected.box) {
                    const croppedDataUrl = await renderAndCrop(detected.fileBase64, detected.mimeType, detected.box, detected.page);
                    patch.avatarUrl = croppedDataUrl;
                    showToast('追加した書類から顔写真を自動抽出しました', 'success');
                    photoFound = true;
                    break;
                  }
                } catch (photoErr: any) {
                  console.error('Auto photo crop failed', photoErr);
                  lastPhotoError = photoErr?.message || '不明なエラー';
                }
              }
              if (!photoFound) {
                if (lastPhotoError) {
                  showToast(`顔写真の自動検出でエラーが発生しました: ${lastPhotoError}（「顔写真切抜」から手動で切り抜きできます）`, 'warning');
                } else {
                  showToast('追加した書類から証明写真を検出できませんでした。「顔写真切抜」から手動で設定できます。', 'info');
                }
              }
            } finally {
              setIsDetailDetectingPhoto(false);
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'ファイル処理中にエラーが発生しました', 'warning');
    } finally {
      if (Object.keys(patch).length > 0) {
        updateCandidate({ ...candidate, ...patch, lastUpdated: new Date().toISOString().split('T')[0] });
      }
      setIsDetailCompressing(false);
      setIsDetailParsing(false);
      setIsDetailDragging(false);
    }
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    const goodPointsText = newGoodPoints.trim();
    const concernsText = newConcerns.trim();
    const otherNotesText = newOtherNotes.trim();
    const commentText = newComment.trim();
    const lNoteText = newLNote.trim();
    const cNoteText = newCNote.trim();
    const mNoteText = newMNote.trim();

    if (!goodPointsText && !concernsText && !otherNotesText && !commentText && !lNoteText && !cNoteText && !mNoteText && !newLRating && !newCRating && !newMRating && !newInterviewRating) {
      showToast('評価ポイント・懸念点・その他メモ、または評価項目を入力してください', 'warning');
      return;
    }

    const commentParts: string[] = [];
    if (goodPointsText) commentParts.push(`【評価ポイント】\n${goodPointsText}`);
    if (concernsText) commentParts.push(`【懸念点】\n${concernsText}`);
    if (otherNotesText) commentParts.push(`【その他メモ】\n${otherNotesText}`);
    if (commentText) commentParts.push(`【総合所感】\n${commentText}`);

    const finalComment = commentParts.length > 0 ? commentParts.join('\n\n') : '（所感メモなし）';

    addEvaluationNote(candidate.id, {
      author: evalAuthor,
      authorRole: staffList.find((s) => s.name === evalAuthor)?.role || '面接官',
      phase: evalTargetPhase,
      interviewRating: newInterviewRating,
      bcaDesiredDepartment: newDesiredDepartment,
      lRating: newLRating,
      cRating: newCRating,
      mRating: newMRating,
      lNote: lNoteText || undefined,
      cNote: cNoteText || undefined,
      mNote: mNoteText || undefined,
      goodPoints: goodPointsText || undefined,
      concerns: concernsText || undefined,
      otherNotes: otherNotesText || undefined,
      comment: finalComment,
      resultStatus: evalResultStatus,
      failReason: evalResultStatus === 'FAIL' ? failReason : undefined
    });

    setNewGoodPoints('');
    setNewConcerns('');
    setNewOtherNotes('');
    setNewComment('');

    // 合格として保存したら、面接評価・LCMなど書き込み済みの欄を全てクリアして次の面接にすぐ
    // 使える状態に戻し、面接評価・所感セクションを折りたたむ。現在地の自動進行は、いま記録した
    // 評価が候補者の「現在のフェーズ」に対するものだった場合のみ行う(過去フェーズを遡って
    // 記録しただけのときは現在地を勝手に動かさない)。
    if (evalResultStatus === 'PASS') {
      setNewInterviewRating(undefined);
      setNewDesiredDepartment(undefined);
      setNewLRating(undefined);
      setNewCRating(undefined);
      setNewMRating(undefined);
      setNewLNote('');
      setNewCNote('');
      setNewMNote('');
      setCollapsedSections((prev) => ({ ...prev, evalForm: true }));

      if (evalTargetPhase === candidate.phase) {
        const nextPhase = getNextPhase(candidate.phase);
        if (nextPhase) {
          updateCandidatePhase(candidate.id, nextPhase);
          setEvalTargetPhase(nextPhase);
        }
      }
    }
  };

  const handleScheduleChange = (
    status: ScheduleStatus,
    nextDate?: string,
    nextInterviewers?: string[]
  ) => {
    updateCandidateSchedule(candidate.id, status, nextDate, nextInterviewers);
  };

  const handleAddInterviewer = (phase: SelectionPhase, interviewerName: string) => {
    const currentList = candidate.interviewersByPhase?.[phase] || [];
    if (!currentList.includes(interviewerName)) {
      updateInterviewersForPhase(candidate.id, phase, [...currentList, interviewerName]);
      showToast(`面接官 「${interviewerName}」 を追加しました`, 'success');
    }
  };

  const handleRemoveInterviewer = (phase: SelectionPhase, interviewerName: string) => {
    const currentList = candidate.interviewersByPhase?.[phase] || [];
    updateInterviewersForPhase(candidate.id, phase, currentList.filter((name) => name !== interviewerName));
    showToast(`面接官 「${interviewerName}」 を削除しました`, 'warning');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs flex justify-end transition-opacity">
      
      {/* Modal Drawer Container - Spacious, Clean White Design */}
      <div className="bg-white border-l border-slate-200 w-full max-w-4xl h-full flex flex-col shadow-xl overflow-hidden">
        
        {/* Header Section: Compact, Clean Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-start justify-between gap-4">
            
            {/* Main Candidate Info Title */}
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {candidate.id}
                </span>
                {/* Selection Position Interactive Selector */}
                <div className="flex items-center gap-1.5 bg-indigo-50/90 px-2 py-0.5 rounded-md border border-indigo-200">
                  <span className="text-[11px] font-bold text-indigo-900">選考ポジション:</span>
                  <select
                    value={candidate.jobTitle}
                    onChange={(e) => {
                      const newPos = e.target.value;
                      updateCandidate({
                        ...candidate,
                        jobTitle: newPos,
                        lastUpdated: new Date().toISOString().split('T')[0]
                      });
                      showToast(`選考ポジションを 「${newPos}」 に変更しました`, 'success');
                    }}
                    className="bg-white text-indigo-900 font-bold text-xs rounded px-1.5 py-0.5 border border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                  >
                    {STANDARD_POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                    {!STANDARD_POSITIONS.includes(candidate.jobTitle as any) && (
                      <option value={candidate.jobTitle}>{candidate.jobTitle}</option>
                    )}
                  </select>
                </div>

                {/* BCA Desired Department Selector */}
                {candidate.jobTitle.toUpperCase().includes('BCA') && (
                  <div className="flex items-center gap-1.5 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-200 animate-in fade-in">
                    <span className="text-[11px] font-bold text-indigo-900">BCA希望事業部:</span>
                    <select
                      value={candidate.bcaDesiredDepartment || 'F+'}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        updateCandidate({
                          ...candidate,
                          bcaDesiredDepartment: val,
                          lastUpdated: new Date().toISOString().split('T')[0]
                        });
                        showToast(`BCA希望事業部を 「${val === 'BOTH' ? 'F+ / AC 両方' : val}」 に変更しました`, 'success');
                      }}
                      className="bg-white text-indigo-900 font-bold text-xs rounded px-2 py-0.5 border border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                    >
                      <option value="F+">F+ 事業部</option>
                      <option value="AC">AC 事業部</option>
                      <option value="BOTH">F+ / AC 両方可</option>
                    </select>
                  </div>
                )}
                <span className="text-xs text-slate-500">
                  推薦元: <strong className="text-slate-700 font-semibold">{candidate.agencyName}</strong>
                </span>
                <span className="text-xs text-slate-400">
                  (応募日: {candidate.appliedDate})
                </span>
              </div>

              <div className="flex items-center gap-3.5 pt-1">
                {/* Resume Face Photo Avatar Cutout */}
                <div 
                  onClick={() => setIsPhotoCropperOpen(true)}
                  className="relative group cursor-pointer shrink-0"
                  title="クリックで履歴書から顔写真を切り抜き・変更"
                >
                  {candidate.avatarUrl ? (
                    <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-indigo-200 group-hover:border-indigo-600 transition-all">
                      <img 
                        src={candidate.avatarUrl} 
                        alt={candidate.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-indigo-50 border-2 border-dashed border-indigo-300 flex flex-col items-center justify-center text-indigo-600 group-hover:bg-indigo-100 group-hover:border-indigo-500 transition-all">
                      <Camera className="w-5 h-5 mb-0.5" />
                      <span className="text-[9px] font-bold">写真切抜</span>
                    </div>
                  )}

                  {/* Hover Overlay Badge */}
                  <div className="absolute inset-0 bg-slate-900/60 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-bold gap-0.5">
                    <Crop className="w-4 h-4" />
                    <span>切り抜き</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                      {candidate.name}
                    </h2>
                    {candidate.nameKana && (
                      <span className="text-xs text-slate-400 font-normal">
                        ({candidate.nameKana})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                    <span>履歴書顔写真: {candidate.avatarUrl ? '抽出・設定済み' : '未設定 (クリックで切り抜き)'}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <button
              onClick={handleClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Streamlined 3 Navigation Tabs with Clear Segmented Style */}
        <div className="bg-slate-100/90 border-b border-slate-200 px-4 py-2.5 shrink-0">
          <div className="grid grid-cols-3 gap-2 max-w-4xl mx-auto">
            <button
              onClick={() => setActiveSubTab('evaluation')}
              className={`py-2.5 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeSubTab === 'evaluation'
                  ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <MessageSquare className={`w-4 h-4 ${activeSubTab === 'evaluation' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span className="truncate">選考・評価メモ</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                activeSubTab === 'evaluation' ? 'bg-indigo-100 text-indigo-800 font-bold' : 'bg-slate-200 text-slate-700'
              }`}>
                {candidate.evaluationNotes.length}
              </span>
            </button>

            <button
              onClick={() => setActiveSubTab('resume')}
              className={`py-2.5 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeSubTab === 'resume'
                  ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <FileText className={`w-4 h-4 ${activeSubTab === 'resume' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span className="truncate">履歴書・書類原本</span>
            </button>

            <button
              onClick={() => setActiveSubTab('onboarding')}
              className={`py-2.5 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeSubTab === 'onboarding'
                  ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <UserCheck className={`w-4 h-4 ${activeSubTab === 'onboarding' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span className="truncate">入社・フォロー管理</span>
              {candidate.joiningDate && (
                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold hidden sm:inline-block">
                  {candidate.joiningDate}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content Scroll Area */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-700 bg-slate-50/40">
          
          {/* Key Candidate Demographics Bar with Quick Edit Toggle */}
          <div className="bg-white rounded-xl border border-slate-200 text-xs text-slate-700 shadow-2xs overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2.5 px-4 bg-white">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-500">年齢:</span>
                  <span className="font-bold">{candidate.age ? `${candidate.age}歳` : '未記載'}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-500">現職:</span>
                  <span className="font-bold">{candidate.currentCompany || '未記載'}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-500">学歴:</span>
                  <span className="font-bold">{candidate.education || '未記載'}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-500">経験社数:</span>
                  <span className="font-bold">{candidate.companyCount ? `${candidate.companyCount}社目` : '未記載'}</span>
                </div>

                {candidate.salaryExpectation && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">希望年収:</span>
                    <span className="font-bold text-slate-900">{candidate.salaryExpectation}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setIsEditingProfile(!isEditingProfile)}
                  className={`font-bold text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border ${
                    isEditingProfile
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300'
                  }`}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>{isEditingProfile ? '編集を閉じる' : '基本情報を編集'}</span>
                </button>

                <button
                  onClick={() => setIsPhotoCropperOpen(true)}
                  className="font-bold text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Crop className="w-3.5 h-3.5 text-indigo-600" />
                  <span>顔写真切抜</span>
                </button>
              </div>
            </div>

            {/* Inline Profile Quick Edit Panel */}
            {isEditingProfile && (
              <div className="border-t border-slate-200 bg-slate-50/80 p-4 space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <Edit2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>基本属性プロフィールのインライン編集</span>
                  </h4>
                  <span className="text-[11px] text-slate-400">入力内容は即時保存されます</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-500 font-semibold mb-1 text-[11px]">年齢 (歳)</label>
                    <input
                      type="number"
                      value={candidate.age || ''}
                      onChange={(e) => updateCandidate({ ...candidate, age: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-semibold mb-1 text-[11px]">経験社数 (社目)</label>
                    <input
                      type="number"
                      value={candidate.companyCount || ''}
                      onChange={(e) => updateCandidate({ ...candidate, companyCount: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-semibold mb-1 text-[11px]">希望年収</label>
                    <input
                      type="text"
                      value={candidate.salaryExpectation || ''}
                      onChange={(e) => updateCandidate({ ...candidate, salaryExpectation: e.target.value })}
                      placeholder="例: 600万円"
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-500 font-semibold mb-1 text-[11px]">現職・在籍企業名</label>
                    <input
                      type="text"
                      value={candidate.currentCompany || ''}
                      onChange={(e) => updateCandidate({ ...candidate, currentCompany: e.target.value })}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-semibold mb-1 text-[11px]">最終学歴</label>
                    <input
                      type="text"
                      value={candidate.education || ''}
                      onChange={(e) => updateCandidate({ ...candidate, education: e.target.value })}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-2">
                    {userRole === 'ADMIN' && (
                      <>
                        {candidate.isArchived ? (
                          <button
                            type="button"
                            onClick={() => {
                              restoreCandidate(candidate.id);
                              setSelectedCandidateId(null);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>復元</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              deleteCandidate(candidate.id);
                              setSelectedCandidateId(null);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>過去候補者へ移動 (アーカイブ)</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg cursor-pointer"
                  >
                    完了
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* TAB 1: Evaluation Timeline, Input & Gmail AI Sync */}
          {activeSubTab === 'evaluation' && (
            <div className="space-y-6">

              {/* Quick access to the resume/CV original — evaluating a candidate almost always
                  means wanting to glance at the source document, which previously required
                  switching to the separate "履歴書・書類原本" tab first. */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="shrink-0">履歴書・職務経歴書:</span>
                  {resumeDocs.length > 1 ? (
                    <select
                      value={activeResumeDocIndex}
                      onChange={(e) => setSelectedResumeDocIndex(Number(e.target.value))}
                      className="bg-slate-50 border border-slate-300 text-slate-800 font-bold rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer max-w-[200px]"
                    >
                      {resumeDocs.map((doc, i) => (
                        <option key={doc.driveFileId || i} value={i}>{doc.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-slate-500 font-normal truncate max-w-[220px]">
                      {candidate.resumeFileName || 'ファイル名未登録'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {activeResumeDoc?.driveUrl && (
                    <a
                      href={activeResumeDoc.driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm font-extrabold text-white bg-rose-600 hover:bg-rose-700 px-4 py-2.5 rounded-xl cursor-pointer transition-colors shadow-md ring-2 ring-rose-200"
                    >
                      <Download className="w-4 h-4" />
                      <span>原本を開く</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('resume')}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>書類内容を確認</span>
                  </button>
                </div>
              </div>

              {/* Simplified Selection & Interview Adjustment Dashboard */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden space-y-0">
                {/* Header: Simplified & Clean */}
                <div 
                  onClick={() => toggleSection('dashboard')}
                  className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 cursor-pointer hover:bg-slate-100/80 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <LayoutDashboard className="w-4 h-4 text-indigo-600 shrink-0" />
                    <h3 className="font-bold text-slate-900 text-xs tracking-wide">選考フロー ＆ 面接調整</h3>
                    <span className="text-[10px] text-slate-500 font-normal hidden sm:inline">｜ 各フェーズの面接官・評価結果・日程調整を一覧</span>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
                    {/* 進行中フェーズ選択 */}
                    <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                      <span className="text-[11px] font-bold text-slate-600">現在地:</span>
                      {userRole !== 'INTERVIEWER' ? (
                        <select
                          value={candidate.phase}
                          onChange={(e) => updateCandidatePhase(candidate.id, e.target.value as SelectionPhase)}
                          className="bg-transparent text-indigo-900 font-extrabold text-xs focus:outline-none cursor-pointer"
                        >
                          <option value="DOCUMENT_SCREENING">1. 書類選考</option>
                          <option value="CASUAL_INTERVIEW">2. カジュアル面談</option>
                          <option value="FIRST_INTERVIEW">3. 1次面接</option>
                          <option value="SECOND_INTERVIEW">4. 2次面接</option>
                          <option value="FINAL_INTERVIEW">5. 最終面接</option>
                          <option value="OFFER_ISSUED">6. 内定通知</option>
                          <option value="OFFER_ACCEPTED">7. 内定承諾</option>
                          <option value="REJECTED_DECLINED">8. 辞退 / 不採用</option>
                        </select>
                      ) : (
                        <span className="text-xs font-bold text-indigo-900">{PHASE_LABELS[candidate.phase]}</span>
                      )}
                    </div>

                    {/* 総合評価 & LCM */}
                    <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs text-[11px]">
                      <span className="font-bold text-slate-600">総合:</span>
                      {renderGradeBadge('', candidate.interviewRating, 'sm')}
                      <span className="text-slate-300 ml-1">|</span>
                      <span className="font-mono text-[10px] text-slate-500">
                        L:{candidate.lRating || '-'} C:{candidate.cRating || '-'} M:{candidate.mRating || '-'}
                      </span>
                    </div>

                    {/* 折り畳みアイコン */}
                    <button 
                      type="button" 
                      onClick={(e) => { e.stopPropagation(); toggleSection('dashboard'); }}
                      className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-slate-200/80 hover:bg-indigo-600 hover:text-white text-slate-700 transition-all cursor-pointer shrink-0 shadow-2xs ml-1"
                      title={collapsedSections.dashboard ? "展開する" : "折りたたむ"}
                    >
                      {collapsedSections.dashboard ? <ChevronDown className="w-5 h-5 stroke-[2.5]" /> : <ChevronUp className="w-5 h-5 stroke-[2.5]" />}
                    </button>
                  </div>
                </div>

                {/* Step-by-Step Selection Ladder (段々レイアウト) */}
                {!collapsedSections.dashboard && (
                  <div className="p-3 bg-slate-50/50 space-y-2">
                    {[
                      { phase: 'DOCUMENT_SCREENING' as SelectionPhase, stepNum: '1', title: '書類選考 / 面談', isOffer: false },
                      { phase: 'FIRST_INTERVIEW' as SelectionPhase, stepNum: '2', title: '1次面接', isOffer: false },
                      { phase: 'SECOND_INTERVIEW' as SelectionPhase, stepNum: '3', title: '2次面接', isOffer: false },
                      { phase: 'FINAL_INTERVIEW' as SelectionPhase, stepNum: '4', title: '最終面接', isOffer: false },
                      { phase: 'OFFER_ISSUED' as SelectionPhase, stepNum: '5', title: 'オファー面談・内定調整', isOffer: true }
                    ].map((stg) => {
                      const phaseNotes = candidate.evaluationNotes.filter((n) => n.phase === stg.phase);
                      const latestNote = phaseNotes[phaseNotes.length - 1];
                      const isCurrent = candidate.phase === stg.phase;
                      const isTarget = evalTargetPhase === stg.phase;

                      // 面接官リスト: 評価メモに記録済みならそれを優先し、なければこのステップ専用の
                      // アサイン欄(interviewersByPhase、ステップごとに独立)を見る。現在のフェーズに
                      // 限らずどのステップにも事前アサインできる。旧データ互換として、現在のフェーズ
                      // でinterviewersByPhaseが空の場合のみ旧来の単一枠nextInterviewersにも
                      // フォールバックする。
                      const stepInterviewers = (latestNote && latestNote.interviewers && latestNote.interviewers.length > 0)
                        ? latestNote.interviewers
                        : (candidate.interviewersByPhase?.[stg.phase] && candidate.interviewersByPhase[stg.phase]!.length > 0)
                        ? candidate.interviewersByPhase[stg.phase]!
                        : (isCurrent && candidate.nextInterviewers && candidate.nextInterviewers.length > 0)
                        ? candidate.nextInterviewers
                        : (latestNote?.author ? [latestNote.author] : []);

                      return (
                        <div
                          key={stg.phase}
                          className={`bg-white rounded-xl border transition-all p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center ${
                            isCurrent
                              ? 'border-indigo-400 ring-2 ring-indigo-500/10 shadow-2xs'
                              : isTarget
                              ? 'border-indigo-300 bg-indigo-50/20'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* 1. ステップ名 ＆ 進行ステータス (md:col-span-3) */}
                          <div className="md:col-span-3 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center shrink-0 ${
                                isCurrent
                                  ? 'bg-indigo-600 text-white'
                                  : latestNote
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-500'
                              }`}>
                                {stg.stepNum}
                              </span>
                              <span className="font-bold text-xs text-slate-900">{stg.title}</span>
                              {isCurrent && (
                                <span className="bg-indigo-600 text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-full shrink-0">
                                  現在進行中
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setEvalTargetPhase(stg.phase);
                                if (latestNote) {
                                  if (latestNote.interviewRating) setNewInterviewRating(latestNote.interviewRating);
                                  setNewComment(latestNote.comment);
                                } else {
                                  setNewComment('');
                                }
                                // Jump straight to the editable form for this phase, expanding it
                                // first if it's collapsed — otherwise the click silently updates
                                // hidden/off-screen state and looks like nothing happened.
                                setCollapsedSections((prev) => ({ ...prev, evalForm: false }));
                                setTimeout(() => evalFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                              }}
                              className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold underline flex items-center gap-1 cursor-pointer"
                            >
                              評価メモを確認・編集
                            </button>
                          </div>

                          {/* 2. 担当面接官（自由アサイン & 複数アサイン可能） (md:col-span-4) */}
                          <div className="md:col-span-4 space-y-1 bg-slate-50/70 p-2 rounded-lg border border-slate-100">
                            <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold">
                              <span>担当面接官 ({stepInterviewers.length}名)</span>
                              <span className="text-[9px] text-indigo-600">複数アサイン可</span>
                            </div>

                            {/* 面接官タグ一覧 */}
                            <div className="flex items-center gap-1 flex-wrap min-h-[24px]">
                              {stepInterviewers.length > 0 ? (
                                stepInterviewers.map((name, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 bg-white text-slate-800 font-bold text-[11px] px-2 py-0.5 rounded border border-slate-200 shadow-2xs"
                                  >
                                    <User className="w-3 h-3 text-indigo-600" />
                                    <span>{name}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveInterviewer(stg.phase, name)}
                                      className="text-slate-400 hover:text-rose-600 transition-colors"
                                      title="削除"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">面接官未設定</span>
                              )}
                            </div>

                            {/* 面接官追加ドロップダウン（自由アサイン含む） */}
                            <div className="pt-1 flex items-center gap-1">
                              <select
                                onChange={(e) => {
                                  if (e.target.value === '__CUSTOM__') {
                                    const customName = prompt('自由アサインする面接官のお名前を入力してください:');
                                    if (customName && customName.trim()) {
                                      handleAddInterviewer(stg.phase, customName.trim());
                                    }
                                    e.target.value = '';
                                  } else if (e.target.value) {
                                    handleAddInterviewer(stg.phase, e.target.value);
                                    e.target.value = '';
                                  }
                                }}
                                className="w-full bg-white border border-slate-300 text-slate-700 font-medium rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                                defaultValue=""
                              >
                                <option value="" disabled>+ 面接官を選択・アサイン...</option>
                                <option value="__CUSTOM__" className="font-bold text-indigo-600">
                                  自由アサイン（選択肢外の名前を入力...）
                                </option>
                                {staffList.map((st) => (
                                  <option key={st.id} value={st.name}>
                                    {st.name} ({st.role})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* 3. 面接評価・結果 (md:col-span-3) */}
                          <div className="md:col-span-3 space-y-1">
                            <div className="text-[10px] text-slate-500 font-semibold">評価・合否結果</div>
                            {latestNote ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {renderGradeBadge('', latestNote.interviewRating, 'sm')}
                                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                                    latestNote.resultStatus === 'PASS' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    latestNote.resultStatus === 'FAIL' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                    'bg-slate-100 text-slate-500 border-slate-200'
                                  }`}>
                                    {latestNote.resultStatus === 'PASS' ? '合格' : latestNote.resultStatus === 'FAIL' ? '不採用' : '結果待ち'}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-600 line-clamp-1 italic">
                                  {latestNote.comment}
                                </p>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic block">未評価</span>
                            )}
                          </div>

                          {/* 4. 日程・調整状況 (md:col-span-2) */}
                          <div className="md:col-span-2 space-y-1">
                            <div className="text-[10px] text-slate-500 font-semibold">調整状況</div>
                            {isCurrent ? (
                              <div className="space-y-1">
                                <select
                                  value={candidate.scheduleStatus}
                                  onChange={(e) => handleScheduleChange(e.target.value as ScheduleStatus, candidate.nextScheduleDate, candidate.nextInterviewers)}
                                  className="w-full bg-slate-50 border border-slate-300 text-slate-800 font-bold text-[10px] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                >
                                  <option value="UNARRANGED">未手配</option>
                                  <option value="PROPOSING_DATES">候補日提示中</option>
                                  <option value="SCHEDULE_CONFIRMED">日程確定</option>
                                  <option value="WAITING_RESULT">結果待ち</option>
                                </select>
                                <input
                                  type="datetime-local"
                                  value={candidate.nextScheduleDate || ''}
                                  onChange={(e) => handleScheduleChange(candidate.scheduleStatus, e.target.value, candidate.nextInterviewers)}
                                  className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-[10px] font-bold rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                />
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-500 font-medium block">
                                {latestNote ? '完了' : '未定'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              
              {/* Add Evaluation Form */}
              <div ref={evalFormRef} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs scroll-mt-4">
                <div
                  onClick={() => toggleSection('evalForm')}
                  className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100/80 transition-colors"
                >
                  <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                    <span className="text-indigo-600 font-mono">[{PHASE_LABELS[evalTargetPhase]}]</span>
                    <span>面接評価・所感の入力</span>
                  </h3>
                  <button 
                    type="button" 
                    onClick={(e) => { e.stopPropagation(); toggleSection('evalForm'); }}
                    className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-slate-200/80 hover:bg-indigo-600 hover:text-white text-slate-700 transition-all cursor-pointer shrink-0 shadow-2xs"
                    title={collapsedSections.evalForm ? "展開する" : "折りたたむ"}
                  >
                    {collapsedSections.evalForm ? <ChevronDown className="w-5 h-5 stroke-[2.5]" /> : <ChevronUp className="w-5 h-5 stroke-[2.5]" />}
                  </button>
                </div>

                {!collapsedSections.evalForm && (
                  <form onSubmit={handleAddNote} className="p-4 sm:p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">対象フェーズ</label>
                        <select
                          value={evalTargetPhase}
                          onChange={(e) => setEvalTargetPhase(e.target.value as SelectionPhase)}
                          className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-bold rounded-lg px-3 py-2 text-xs focus:outline-none focus:bg-white focus:border-indigo-500"
                        >
                          <option value="DOCUMENT_SCREENING">書類選考</option>
                          <option value="CASUAL_INTERVIEW">カジュアル面談</option>
                          <option value="FIRST_INTERVIEW">1次面接</option>
                          <option value="SECOND_INTERVIEW">2次面接</option>
                          <option value="FINAL_INTERVIEW">最終面接</option>
                          <option value="OFFER_ISSUED">内定通知</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1">評価入力者</label>
                        <select
                          value={evalAuthor}
                          onChange={(e) => setEvalAuthor(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:bg-white"
                        >
                          {staffList.map((s) => (
                            <option key={s.id} value={s.name}>
                              {s.name} ({s.department})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* 面接評価 Grade Buttons */}
                      <div>
                        <label className="block text-slate-700 font-bold mb-1">面接評価</label>
                        <div className="flex flex-wrap gap-1 bg-slate-50 border border-slate-200 p-1 rounded-lg">
                          {EVALUATION_GRADES.map((g) => (
                            <button
                              type="button"
                              key={g}
                              onClick={() => setNewInterviewRating(g)}
                              className={`flex-1 min-w-[32px] py-1 rounded text-xs font-mono font-bold transition-colors cursor-pointer ${
                                newInterviewRating === g
                                  ? 'bg-indigo-600 text-white shadow-2xs'
                                  : 'text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {g}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 希望事業部 (F+ / AC) */}
                      <div>
                        <label className="block text-slate-700 font-bold mb-1 flex items-center justify-between">
                          <span>希望事業部</span>
                          <span className="text-[10px] text-indigo-700 font-semibold">(F+ / AC)</span>
                        </label>
                        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-1 rounded-lg">
                          {([
                            { value: 'F+', label: 'F+' },
                            { value: 'AC', label: 'AC' },
                            { value: 'BOTH', label: '両方 (F+/AC)' }
                          ] as const).map((dept) => (
                            <button
                              type="button"
                              key={dept.value}
                              onClick={() => setNewDesiredDepartment(newDesiredDepartment === dept.value ? undefined : dept.value)}
                              className={`flex-1 py-1 px-1.5 rounded text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                                newDesiredDepartment === dept.value
                                  ? 'bg-indigo-600 text-white shadow-2xs'
                                  : 'text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {dept.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* LCM 評価要素 (L, C, M) 及び 各評価の補足メモ */}
                    <div className="bg-slate-50/90 p-3.5 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                        <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                          <span>評価要素 (L, C, M) 判定 ＆ 各評価の補足メモ</span>
                        </h4>
                        <span className="text-[11px] text-slate-500 font-medium">〇: 良好 / △: 懸念あり / ✕: 不適合</span>
                      </div>

                      <div className="space-y-2.5">
                        {/* L評価 */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                          <div className="md:col-span-4 flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-800 text-xs flex items-center gap-1">
                              <span className="w-4 h-4 rounded bg-indigo-100 text-indigo-800 text-[10px] font-extrabold flex items-center justify-center font-mono">L</span>
                              <span>ルックス</span>
                            </span>
                            <div className="flex items-center gap-1">
                              {(['〇', '△', '✕'] as LcmRating[]).map((r) => (
                                <button
                                  type="button"
                                  key={r}
                                  onClick={() => setNewLRating(newLRating === r ? undefined : r)}
                                  className={`w-7 h-7 rounded-md font-bold text-xs transition-all cursor-pointer ${
                                    newLRating === r
                                      ? r === '〇'
                                        ? 'bg-emerald-600 text-white shadow-2xs'
                                        : r === '△'
                                        ? 'bg-amber-500 text-white shadow-2xs'
                                        : 'bg-rose-600 text-white shadow-2xs'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                                  }`}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="md:col-span-8">
                            <input
                              type="text"
                              placeholder="L (ルックス) 評価の補足メモ"
                              value={newLNote}
                              onChange={(e) => setNewLNote(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:bg-white focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        {/* C評価 */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                          <div className="md:col-span-4 flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-800 text-xs flex items-center gap-1">
                              <span className="w-4 h-4 rounded bg-indigo-100 text-indigo-800 text-[10px] font-extrabold flex items-center justify-center font-mono">C</span>
                              <span>コミュニケーション</span>
                            </span>
                            <div className="flex items-center gap-1">
                              {(['〇', '△', '✕'] as LcmRating[]).map((r) => (
                                <button
                                  type="button"
                                  key={r}
                                  onClick={() => setNewCRating(newCRating === r ? undefined : r)}
                                  className={`w-7 h-7 rounded-md font-bold text-xs transition-all cursor-pointer ${
                                    newCRating === r
                                      ? r === '〇'
                                        ? 'bg-emerald-600 text-white shadow-2xs'
                                        : r === '△'
                                        ? 'bg-amber-500 text-white shadow-2xs'
                                        : 'bg-rose-600 text-white shadow-2xs'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                                  }`}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="md:col-span-8">
                            <input
                              type="text"
                              placeholder="C (コミュニケーション) 評価の補足メモ"
                              value={newCNote}
                              onChange={(e) => setNewCNote(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:bg-white focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        {/* M評価 */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                          <div className="md:col-span-4 flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-800 text-xs flex items-center gap-1">
                              <span className="w-4 h-4 rounded bg-indigo-100 text-indigo-800 text-[10px] font-extrabold flex items-center justify-center font-mono">M</span>
                              <span>マインド</span>
                            </span>
                            <div className="flex items-center gap-1">
                              {(['〇', '△', '✕'] as LcmRating[]).map((r) => (
                                <button
                                  type="button"
                                  key={r}
                                  onClick={() => setNewMRating(newMRating === r ? undefined : r)}
                                  className={`w-7 h-7 rounded-md font-bold text-xs transition-all cursor-pointer ${
                                    newMRating === r
                                      ? r === '〇'
                                        ? 'bg-emerald-600 text-white shadow-2xs'
                                        : r === '△'
                                        ? 'bg-amber-500 text-white shadow-2xs'
                                        : 'bg-rose-600 text-white shadow-2xs'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                                  }`}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="md:col-span-8">
                            <input
                              type="text"
                              placeholder="M (マインド) 評価の補足メモ"
                              value={newMNote}
                              onChange={(e) => setNewMNote(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:bg-white focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">判定結果</label>
                      <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                          <input
                            type="radio"
                            name="result"
                            value="PASS"
                            checked={evalResultStatus === 'PASS'}
                            onChange={() => setEvalResultStatus('PASS')}
                            className="accent-emerald-600"
                          />
                          <span className="text-emerald-700">合格 (次ステップへ)</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                          <input
                            type="radio"
                            name="result"
                            value="FAIL"
                            checked={evalResultStatus === 'FAIL'}
                            onChange={() => setEvalResultStatus('FAIL')}
                            className="accent-rose-600"
                          />
                          <span className="text-rose-700">不採用 / 見送り</span>
                        </label>
                      </div>
                    </div>

                    {evalResultStatus === 'FAIL' && (
                      <div>
                        <label className="block text-rose-700 font-bold mb-1">不採用理由</label>
                        <input
                          type="text"
                          placeholder="例: 実務要件未達、希望条件不一致"
                          value={failReason}
                          onChange={(e) => setFailReason(e.target.value)}
                          className="w-full bg-slate-50 border border-rose-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none"
                        />
                      </div>
                    )}

                    {/* 分割された面接所感・コメント入力項目 */}
                    <div className="space-y-3 pt-1">
                      <div>
                        <label className="block text-slate-800 font-bold mb-1 flex items-center gap-1.5 text-xs">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                          <span>評価ポイント (強み・評価できる点)</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="例: コミュニケーション力が高く、チームマネジメント経験が豊富。主体性がある。"
                          value={newGoodPoints}
                          onChange={(e) => setNewGoodPoints(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl p-2.5 text-xs focus:outline-none focus:bg-white focus:border-emerald-500 leading-relaxed"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-800 font-bold mb-1 flex items-center gap-1.5 text-xs">
                          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                          <span>懸念点 (リスク・気になる点)</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="例: 早期離職のリスク、技術スタックのミスマッチの懸念あり。"
                          value={newConcerns}
                          onChange={(e) => setNewConcerns(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl p-2.5 text-xs focus:outline-none focus:bg-white focus:border-amber-500 leading-relaxed"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-800 font-bold mb-1 flex items-center gap-1.5 text-xs">
                          <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"></span>
                          <span>その他メモ (連絡事項・補足など)</span>
                        </label>
                        <textarea
                          rows={2}
                          placeholder="例: 希望年収550万円、入社時期は10月希望、次回同席面接官の希望あり..."
                          value={newOtherNotes}
                          onChange={(e) => setNewOtherNotes(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl p-2.5 text-xs focus:outline-none focus:bg-white focus:border-indigo-500 leading-relaxed"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 font-bold mb-1 text-[11px]">
                          総合所感 (任意・全体まとめ)
                        </label>
                        <textarea
                          rows={2}
                          placeholder="例: 総じて好印象。次選考へ推薦。"
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl p-2.5 text-xs focus:outline-none focus:bg-white focus:border-slate-500 leading-relaxed"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-xl shadow-2xs transition-all cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>評価メモを保存</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Evaluation History Log List */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs space-y-0">
                <div 
                  onClick={() => toggleSection('evalHistory')}
                  className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100/80 transition-colors"
                >
                  <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-indigo-600" />
                    <span>面接評価ログ・履歴 ({candidate.evaluationNotes.length}件)</span>
                  </h3>
                  <button 
                    type="button" 
                    onClick={(e) => { e.stopPropagation(); toggleSection('evalHistory'); }}
                    className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-slate-200/80 hover:bg-indigo-600 hover:text-white text-slate-700 transition-all cursor-pointer shrink-0 shadow-2xs"
                    title={collapsedSections.evalHistory ? "展開する" : "折りたたむ"}
                  >
                    {collapsedSections.evalHistory ? <ChevronDown className="w-5 h-5 stroke-[2.5]" /> : <ChevronUp className="w-5 h-5 stroke-[2.5]" />}
                  </button>
                </div>

                {!collapsedSections.evalHistory && (
                  <div className="p-4 space-y-3 bg-slate-50/20">
                    {candidate.evaluationNotes.length === 0 ? (
                      <p className="text-slate-400 italic text-center py-6 bg-white rounded-xl border border-dashed border-slate-200">
                        評価メモはまだ登録されていません。
                      </p>
                    ) : (
                      candidate.evaluationNotes.map((note) => (
                        <div
                          key={note.id}
                          className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2.5"
                        >
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm">{note.author}</span>
                              <span className="text-[11px] text-slate-500 font-medium">({note.authorRole})</span>
                              {note.phase && (
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded border bg-indigo-50 border-indigo-200 text-indigo-700">
                                  {PHASE_LABELS[note.phase] || note.phase}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-slate-400 font-mono text-[11px]">{note.createdAt || note.date}</span>
                              {editingNoteId !== note.id && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startEditNote(note)}
                                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                                    title="このメモを編集"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmNoteId(note.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                    title="このメモを削除"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {deleteConfirmNoteId === note.id && (
                            <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                              <span className="text-[11px] font-bold text-rose-800">このメモを削除しますか？元に戻せません。</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmNoteId(null)}
                                  className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
                                >
                                  キャンセル
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteNote(note.id)}
                                  className="px-2.5 py-1 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
                                >
                                  削除する
                                </button>
                              </div>
                            </div>
                          )}

                          {editingNoteId === note.id && editNote ? (
                            <div className="space-y-3 bg-indigo-50/30 border border-indigo-200 rounded-xl p-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-slate-600 font-bold mb-1 text-[11px]">対象フェーズ</label>
                                  <select
                                    value={editNote.phase}
                                    onChange={(e) => setEditNote({ ...editNote, phase: e.target.value as SelectionPhase })}
                                    className="w-full bg-white border border-slate-300 text-slate-900 font-bold rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
                                  >
                                    {(Object.keys(PHASE_LABELS) as SelectionPhase[]).map((p) => (
                                      <option key={p} value={p}>{PHASE_LABELS[p]}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-slate-600 font-bold mb-1 text-[11px]">判定結果</label>
                                  <div className="flex items-center gap-3 h-[30px]">
                                    <label className="flex items-center gap-1.5 cursor-pointer font-bold text-[11px] text-slate-800">
                                      <input type="radio" checked={editNote.resultStatus === 'PASS'} onChange={() => setEditNote({ ...editNote, resultStatus: 'PASS' })} className="accent-emerald-600" />
                                      <span className="text-emerald-700">合格</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer font-bold text-[11px] text-slate-800">
                                      <input type="radio" checked={editNote.resultStatus === 'FAIL'} onChange={() => setEditNote({ ...editNote, resultStatus: 'FAIL' })} className="accent-rose-600" />
                                      <span className="text-rose-700">不採用</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer font-bold text-[11px] text-slate-800">
                                      <input type="radio" checked={editNote.resultStatus === 'PENDING'} onChange={() => setEditNote({ ...editNote, resultStatus: 'PENDING' })} className="accent-slate-500" />
                                      <span>結果待ち</span>
                                    </label>
                                  </div>
                                </div>
                              </div>

                              {editNote.resultStatus === 'FAIL' && (
                                <input
                                  type="text"
                                  placeholder="不採用理由"
                                  value={editNote.failReason}
                                  onChange={(e) => setEditNote({ ...editNote, failReason: e.target.value })}
                                  className="w-full bg-white border border-rose-300 text-slate-900 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                                />
                              )}

                              <div>
                                <label className="block text-slate-600 font-bold mb-1 text-[11px]">面接評価</label>
                                <div className="flex flex-wrap gap-1 bg-white border border-slate-200 p-1 rounded-lg">
                                  {EVALUATION_GRADES.map((g) => (
                                    <button
                                      type="button"
                                      key={g}
                                      onClick={() => setEditNote({ ...editNote, interviewRating: editNote.interviewRating === g ? undefined : g })}
                                      className={`flex-1 min-w-[28px] py-1 rounded text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                                        editNote.interviewRating === g ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                                      }`}
                                    >
                                      {g}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {([
                                  { key: 'lRating' as const, noteKey: 'lNote' as const, label: 'L' },
                                  { key: 'cRating' as const, noteKey: 'cNote' as const, label: 'C' },
                                  { key: 'mRating' as const, noteKey: 'mNote' as const, label: 'M' }
                                ]).map(({ key, noteKey, label }) => (
                                  <div key={key} className="bg-white p-2 rounded-lg border border-slate-200 space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-slate-700 text-[11px] font-mono">{label}</span>
                                      <div className="flex items-center gap-1">
                                        {(['〇', '△', '✕'] as LcmRating[]).map((r) => (
                                          <button
                                            type="button"
                                            key={r}
                                            onClick={() => setEditNote({ ...editNote, [key]: editNote[key] === r ? undefined : r })}
                                            className={`w-6 h-6 rounded text-[11px] font-bold cursor-pointer ${
                                              editNote[key] === r
                                                ? r === '〇' ? 'bg-emerald-600 text-white' : r === '△' ? 'bg-amber-500 text-white' : 'bg-rose-600 text-white'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                          >
                                            {r}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <input
                                      type="text"
                                      placeholder={`${label} 補足`}
                                      value={editNote[noteKey]}
                                      onChange={(e) => setEditNote({ ...editNote, [noteKey]: e.target.value })}
                                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-[11px] rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
                                    />
                                  </div>
                                ))}
                              </div>

                              <div>
                                <label className="block text-slate-600 font-bold mb-1 text-[11px]">所感・メモ</label>
                                <textarea
                                  rows={4}
                                  value={editNote.comment}
                                  onChange={(e) => setEditNote({ ...editNote, comment: e.target.value })}
                                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-lg p-2.5 text-xs focus:outline-none focus:border-indigo-500 leading-relaxed"
                                />
                              </div>

                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={cancelEditNote}
                                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
                                >
                                  キャンセル
                                </button>
                                <button
                                  type="button"
                                  onClick={saveEditNote}
                                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer flex items-center gap-1.5"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>保存</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 flex-wrap">
                                {renderGradeBadge('面接評価', note.interviewRating)}
                                {note.bcaDesiredDepartment && (
                                  <span className="text-[10px] bg-indigo-50 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded font-bold">
                                    希望: {note.bcaDesiredDepartment === 'BOTH' ? 'F+ / AC (両方)' : note.bcaDesiredDepartment}
                                  </span>
                                )}
                                {note.resultStatus === 'PASS' && (
                                  <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-bold">
                                    合格
                                  </span>
                                )}
                                {note.resultStatus === 'FAIL' && (
                                  <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded font-bold">
                                    不採用 ({note.failReason || '要件未達'})
                                  </span>
                                )}
                              </div>

                              {/* LCM Ratings in history note */}
                              {(note.lRating || note.cRating || note.mRating) && (
                                <div className="flex items-center gap-1.5 flex-wrap font-mono">
                                  {note.lRating && (
                                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                                      note.lRating === '〇' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                      note.lRating === '△' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                      'bg-rose-50 text-rose-800 border-rose-200'
                                    }`}>
                                      L: {note.lRating}
                                    </span>
                                  )}
                                  {note.cRating && (
                                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                                      note.cRating === '〇' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                      note.cRating === '△' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                      'bg-rose-50 text-rose-800 border-rose-200'
                                    }`}>
                                      C: {note.cRating}
                                    </span>
                                  )}
                                  {note.mRating && (
                                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                                      note.mRating === '〇' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                      note.mRating === '△' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                      'bg-rose-50 text-rose-800 border-rose-200'
                                    }`}>
                                      M: {note.mRating}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* LCM Supplement Notes */}
                              {(note.lNote || note.cNote || note.mNote) && (
                                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs space-y-1 text-slate-700">
                                  {note.lNote && (
                                    <div className="flex items-start gap-1.5">
                                      <span className="font-bold text-indigo-700 shrink-0 font-mono">L (ルックス) 補足:</span>
                                      <span className="leading-snug">{note.lNote}</span>
                                    </div>
                                  )}
                                  {note.cNote && (
                                    <div className="flex items-start gap-1.5">
                                      <span className="font-bold text-indigo-700 shrink-0 font-mono">C (コミュニケーション) 補足:</span>
                                      <span className="leading-snug">{note.cNote}</span>
                                    </div>
                                  )}
                                  {note.mNote && (
                                    <div className="flex items-start gap-1.5">
                                      <span className="font-bold text-indigo-700 shrink-0 font-mono">M (マインド) 補足:</span>
                                      <span className="leading-snug">{note.mNote}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Structured Comment Cards */}
                              {(note.goodPoints || note.concerns || note.otherNotes) ? (
                                <div className="space-y-2 pt-1 text-xs">
                                  {note.goodPoints && (
                                    <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-lg p-2.5">
                                      <div className="font-bold text-emerald-800 flex items-center gap-1 mb-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                        評価ポイント (強み)
                                      </div>
                                      <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{note.goodPoints}</p>
                                    </div>
                                  )}
                                  {note.concerns && (
                                    <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-2.5">
                                      <div className="font-bold text-amber-800 flex items-center gap-1 mb-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                                        懸念点 (リスク)
                                      </div>
                                      <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{note.concerns}</p>
                                    </div>
                                  )}
                                  {note.otherNotes && (
                                    <div className="bg-indigo-50/60 border border-indigo-200/70 rounded-lg p-2.5">
                                      <div className="font-bold text-indigo-800 flex items-center gap-1 mb-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                                        その他メモ
                                      </div>
                                      <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{note.otherNotes}</p>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap pt-1 text-xs">
                                  {note.comment}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Inline Gmail AI Summary Quick Panel (面接結果ログの下に配置) */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs space-y-0">
                <div 
                  onClick={() => toggleSection('gmailLog')}
                  className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-100/80 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-slate-900 text-xs">Gmail面談ログ同期 ＆ Gemini AI連携要約</span>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={handleSyncGmailLogs}
                      disabled={isSyncingGmail}
                      className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs px-2.5 py-1 rounded-lg border border-indigo-200 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSyncingGmail ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>解析中...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Gmailから同期・要約</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSection('gmailLog')}
                      className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-slate-200/80 hover:bg-indigo-600 hover:text-white text-slate-700 transition-all cursor-pointer shrink-0 shadow-2xs"
                      title={collapsedSections.gmailLog ? "展開する" : "折りたたむ"}
                    >
                      {collapsedSections.gmailLog ? <ChevronDown className="w-5 h-5 stroke-[2.5]" /> : <ChevronUp className="w-5 h-5 stroke-[2.5]" />}
                    </button>
                  </div>
                </div>

                {!collapsedSections.gmailLog && (
                  <div className="p-3.5 space-y-3">
                    <p className="text-[11px] text-slate-500">
                      候補者 ({candidate.email || 'メール未設定'}) との面談・選考メールやり取りから、AIが評価レポートを自動解析・要約します。
                    </p>

                    {gmailData && !isSyncingGmail ? (
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-xs flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                            AI統合要約レポート
                          </span>
                          <button
                            onClick={handleSaveAiSummaryToNotes}
                            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] px-2.5 py-1 rounded transition-all cursor-pointer shadow-2xs"
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                            <span>選考評価メモに登録</span>
                          </button>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">{gmailData.summary.overview}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
                          <div className="bg-indigo-50/70 p-2 rounded-lg border border-indigo-100">
                            <span className="font-bold text-indigo-900 block mb-0.5">評価ポイント・強み</span>
                            <ul className="space-y-0.5">
                              {gmailData.summary.keyHighlights.map((hl, idx) => (
                                <li key={idx} className="text-indigo-950 flex items-start gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                                  <span>{hl}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="bg-amber-50/70 p-2 rounded-lg border border-amber-200">
                            <span className="font-bold text-amber-900 block mb-0.5">推奨次アクション</span>
                            <p className="text-amber-950 leading-relaxed">{gmailData.summary.nextAction}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-start">
                        <button
                          type="button"
                          onClick={() => setShowGmailPanel(!showGmailPanel)}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                        >
                          {showGmailPanel ? '詳細ログ表示を閉じる' : '詳細メールやり取りログを表示'}
                        </button>
                      </div>
                    )}

                    {showGmailPanel && gmailData?.messages && (
                      <div className="pt-2 border-t border-slate-100 space-y-2 max-h-60 overflow-y-auto">
                        {gmailData.messages.map((m) => (
                          <div key={m.id} className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs space-y-1">
                            <div className="flex justify-between text-slate-500 text-[10px]">
                              <span className="font-bold text-slate-700">{m.from}</span>
                              <span>{m.date}</span>
                            </div>
                            <div className="font-bold text-slate-900">{m.subject}</div>
                            <p className="text-slate-600 text-[11px] leading-relaxed">{m.snippet}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: Onboarding & Follow-up */}
          {activeSubTab === 'onboarding' && (
            <div className="space-y-6">
              
              {/* Onboarding Overview Card */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <div 
                  onClick={() => toggleSection('onboarding')}
                  className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100/80 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-bold text-xs text-slate-900">
                      {candidate.name} さんの入社準備・フォロー状況
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      candidate.phase === 'OFFER_ACCEPTED' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}>
                      {candidate.phase === 'OFFER_ACCEPTED' ? '内定承諾' : '内定提示'}
                    </span>
                    <button 
                      type="button" 
                      onClick={(e) => { e.stopPropagation(); toggleSection('onboarding'); }}
                      className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-slate-200/80 hover:bg-indigo-600 hover:text-white text-slate-700 transition-all cursor-pointer shrink-0 shadow-2xs"
                      title={collapsedSections.onboarding ? "展開する" : "折りたたむ"}
                    >
                      {collapsedSections.onboarding ? <ChevronDown className="w-5 h-5 stroke-[2.5]" /> : <ChevronUp className="w-5 h-5 stroke-[2.5]" />}
                    </button>
                  </div>
                </div>

                {!collapsedSections.onboarding && (
                  <div className="p-5">
                    <form onSubmit={handleSaveOnboarding} className="space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        
                        {/* 1. Joining Date */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                          <label className="block text-slate-800 font-bold text-xs flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-indigo-600" />
                            <span>1. 入社予定日</span>
                          </label>
                          <input
                            type="date"
                            value={onboardingJoiningDate}
                            onChange={(e) => setOnboardingJoiningDate(e.target.value)}
                            className="w-full bg-white border border-slate-300 text-slate-900 font-bold rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        {/* 2. Resignation Negotiation */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                          <label className="block text-slate-800 font-bold text-xs flex items-center gap-2">
                            <Briefcase className="w-4 h-4 text-slate-600" />
                            <span>2. 現職の退職交渉状況</span>
                          </label>
                          <select
                            value={onboardingResignationStatus}
                            onChange={(e) => setOnboardingResignationStatus(e.target.value as ResignationNegotiationStatus)}
                            className="w-full bg-white border border-slate-300 text-slate-900 font-bold rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                          >
                            <option value="NOT_STARTED">未着手</option>
                            <option value="IN_PROGRESS">交渉中</option>
                            <option value="NOTICE_SUBMITTED">退職願提出済</option>
                            <option value="COMPLETED">交渉完了</option>
                            <option value="DIFFICULT">難航・調整中</option>
                          </select>
                        </div>

                        {/* 3. Pre-join Dinner Status & Date */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 sm:col-span-2">
                          <label className="block text-slate-800 font-bold text-xs flex items-center gap-2">
                            <Tag className="w-4 h-4 text-indigo-600" />
                            <span>3. 入社前会食・懇親会</span>
                          </label>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <span className="block text-slate-500 text-[11px] mb-1">実施状況</span>
                              <select
                                value={onboardingDinnerStatus}
                                onChange={(e) => setOnboardingDinnerStatus(e.target.value as PreJoinDinnerStatus)}
                                className="w-full bg-white border border-slate-300 text-slate-900 font-bold rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                              >
                                <option value="UNPLANNED">未定</option>
                                <option value="SCHEDULED">予定あり</option>
                                <option value="COMPLETED">実施済み</option>
                                <option value="NOT_REQUIRED">不要</option>
                              </select>
                            </div>

                            <div>
                              <span className="block text-slate-500 text-[11px] mb-1">会食 実施(予定)日</span>
                              <input
                                type="date"
                                value={onboardingDinnerDate}
                                onChange={(e) => setOnboardingDinnerDate(e.target.value)}
                                className="w-full bg-white border border-slate-300 text-slate-900 font-bold rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                          </div>
                        </div>

                        {/* 4. Notes */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 sm:col-span-2">
                          <label className="block text-slate-800 font-bold text-xs flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-indigo-600" />
                            <span>4. オンボーディング特記事項・配属メモ</span>
                          </label>
                          <textarea
                            rows={4}
                            value={onboardingNotesText}
                            onChange={(e) => setOnboardingNotesText(e.target.value)}
                            placeholder="例: 退職承認受領済み。PCはMacBook Proを手配。メンターは高橋さんが担当予定。"
                            className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-3 text-xs focus:outline-none focus:border-indigo-500 leading-relaxed"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>入社・フォロー情報を保存</span>
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: Resume & Career Documents */}
          {activeSubTab === 'resume' && (
            <div className="space-y-4">

              {/* Resume Face Photo Extraction Card */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <div 
                  onClick={() => toggleSection('resumePhoto')}
                  className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100/80 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-bold text-xs text-slate-900">履歴書 抽出顔写真</h3>
                  </div>
                  <button 
                    type="button" 
                    onClick={(e) => { e.stopPropagation(); toggleSection('resumePhoto'); }}
                    className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-slate-200/80 hover:bg-indigo-600 hover:text-white text-slate-700 transition-all cursor-pointer shrink-0 shadow-2xs"
                    title={collapsedSections.resumePhoto ? "展開する" : "折りたたむ"}
                  >
                    {collapsedSections.resumePhoto ? <ChevronDown className="w-5 h-5 stroke-[2.5]" /> : <ChevronUp className="w-5 h-5 stroke-[2.5]" />}
                  </button>
                </div>

                {!collapsedSections.resumePhoto && (
                  <div className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-20 rounded-lg overflow-hidden border-2 border-indigo-200 shadow-sm bg-slate-100 shrink-0 flex items-center justify-center">
                        {candidate.avatarUrl ? (
                          <img src={candidate.avatarUrl} alt={candidate.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Camera className="w-8 h-8 text-slate-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 text-sm">履歴書 抽出顔写真</h4>
                          {candidate.avatarUrl ? (
                            <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200">
                              抽出・登録済み
                            </span>
                          ) : (
                            <span className="bg-amber-50 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200">
                              未切り抜き
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          履歴書原本（JIS規格等の右上写真枠）から切り抜いた証明写真です。選考評価やKanban一覧に表示されます。
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setIsPhotoCropperOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <Crop className="w-4 h-4" />
                        <span>{candidate.avatarUrl ? '顔写真を再切り抜き' : '履歴書から顔写真を切り抜く'}</span>
                      </button>
                      {candidate.avatarUrl && (
                        <button
                          onClick={() => {
                            updateCandidate({ ...candidate, avatarUrl: undefined });
                            showToast('顔写真を削除しました', 'info');
                          }}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="写真を削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setDocCategory('cv')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      docCategory === 'cv' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    職務経歴書 (CV)
                  </button>

                  <button
                    onClick={() => setDocCategory('resume')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      docCategory === 'resume' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    履歴書 (Resume)
                  </button>

                  <button
                    onClick={() => setDocCategory('ai_summary')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1 ${
                      docCategory === 'ai_summary' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI抽出サマリー</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {resumeDocs.length > 1 && (
                    <select
                      value={activeResumeDocIndex}
                      onChange={(e) => setSelectedResumeDocIndex(Number(e.target.value))}
                      className="bg-slate-50 border border-slate-300 text-slate-800 font-bold rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer max-w-[180px]"
                    >
                      {resumeDocs.map((doc, i) => (
                        <option key={doc.driveFileId || i} value={i}>{doc.name}</option>
                      ))}
                    </select>
                  )}
                  {activeResumeDoc?.driveUrl ? (
                    <a
                      href={activeResumeDoc.driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm font-extrabold text-white bg-rose-600 hover:bg-rose-700 px-4 py-2.5 rounded-xl cursor-pointer transition-colors shadow-md ring-2 ring-rose-200"
                    >
                      <Download className="w-4 h-4" />
                      <span>原本を開く{resumeDocs.length <= 1 ? `（${candidate.resumeFileName || 'ファイル名未登録'}）` : ''}</span>
                    </a>
                  ) : (
                    <span
                      title="この候補者にはDrive上の原本ファイルが紐づいていません"
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg cursor-not-allowed"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>原本未登録</span>
                    </span>
                  )}
                </div>
              </div>

              {/* CV View */}
              {docCategory === 'cv' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 leading-relaxed max-h-[500px] overflow-y-auto shadow-2xs">
                  <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">職 務 経 歴 書</h2>
                      <p className="text-xs text-slate-500 mt-0.5">氏名: {candidate.name}</p>
                    </div>
                    <span className="text-[11px] font-mono bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md border border-slate-200">
                      更新: {candidate.updatedAt || '最新'}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                    <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      <span>職務要約</span>
                    </h4>
                    <p className="text-slate-700 leading-relaxed text-xs">
                      {candidate.resumeSummary || <span className="text-slate-400 italic">未入力</span>}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-900 text-xs mb-2 flex items-center gap-1.5">
                      <Code className="w-3.5 h-3.5 text-indigo-600" />
                      <span>活用技術・スキル</span>
                    </h4>
                    {candidate.resumeSkills && candidate.resumeSkills.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {candidate.resumeSkills.map((sk) => (
                          <span key={sk} className="bg-indigo-50 text-indigo-800 text-xs px-2.5 py-1 rounded border border-indigo-200/80 font-mono font-medium">
                            {sk}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-400 italic text-xs">未登録</p>
                    )}
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-900 text-xs mb-2 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                      <span>職務経歴本文</span>
                    </h4>
                    <div className="bg-white border border-slate-200 text-slate-800 font-mono text-xs p-4.5 rounded-xl leading-relaxed whitespace-pre-wrap shadow-2xs">
                      {candidate.rawResumeContent || <span className="text-slate-400 italic font-sans">未登録</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Resume View */}
              {docCategory === 'resume' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 leading-relaxed max-h-[500px] overflow-y-auto shadow-2xs">
                  <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">履 歴 書</h2>
                      <p className="text-xs text-slate-500 mt-0.5">JIS規格フォーマット抽出原本</p>
                    </div>
                    {candidate.avatarUrl && (
                      <img src={candidate.avatarUrl} alt={candidate.name} className="w-12 h-14 object-cover rounded border border-slate-300 shadow-2xs" referrerPolicy="no-referrer" />
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-slate-500 font-medium block">氏名 (ふりがな)</span>
                      <span className="font-bold text-slate-900 text-sm">{candidate.name} ({candidate.furigana || 'かな未登録'})</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium block">年齢 / 性別</span>
                      <span className="font-bold text-slate-900">{candidate.age ? `${candidate.age} 歳` : '未回答'} / {candidate.gender || '回答なし'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium block">連絡先 (メール / 電話)</span>
                      <span className="font-bold text-slate-900">{candidate.email || '未設定'} / {candidate.phone || '未設定'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium block">現住所・最寄り駅</span>
                      <span className="font-bold text-slate-900">{candidate.location || '未登録'} ({candidate.nearestStation || '最寄り駅未登録'})</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                      <GraduationCap className="w-4 h-4 text-indigo-600" />
                      <span>最終学歴・経歴サマリー</span>
                    </h4>
                    <div className="bg-white p-3.5 rounded-lg border border-slate-200 text-xs space-y-1">
                      <p className="font-bold text-slate-800">{candidate.education || <span className="text-slate-400 italic font-normal">未登録</span>}</p>
                      <p className="text-slate-600 text-[11px]">現職: {candidate.currentCompany || '未登録'} （{candidate.jobTitle}）</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                      <Award className="w-4 h-4 text-indigo-600" />
                      <span>保有資格・免許</span>
                    </h4>
                    {candidate.certifications && candidate.certifications.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {candidate.certifications.map((cert) => (
                          <span key={cert} className="bg-slate-100 text-slate-800 text-xs px-3 py-1 rounded-md border border-slate-200 font-medium">
                            {cert}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-400 italic text-xs">未登録</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-indigo-600" />
                      <span>志望動機・自己PR</span>
                    </h4>
                    <div className="bg-white border border-slate-200 text-slate-800 text-xs p-4 rounded-xl leading-relaxed whitespace-pre-wrap">
                      {candidate.prSelfStatement || <span className="text-slate-400 italic">未入力</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* AI Summary View */}
              {docCategory === 'ai_summary' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 leading-relaxed max-h-[500px] overflow-y-auto shadow-2xs">
                  <div className="bg-indigo-900 text-white p-4.5 rounded-xl shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-indigo-200" />
                        <h3 className="font-bold text-sm">Gemini AI 解析レポート</h3>
                      </div>
                      <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono font-bold">Model: Gemini 2.5 Flash</span>
                    </div>
                    <p className="text-xs text-indigo-100 leading-relaxed">
                      提出された書類から自動抽出されたアピールポイント・適合度判定・想定質問案です。
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-emerald-50/80 border border-emerald-200 p-4 rounded-xl space-y-1.5">
                      <h4 className="font-bold text-emerald-900 text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>主要な強み・推奨理由</span>
                      </h4>
                      <p className="text-emerald-950 text-xs leading-relaxed whitespace-pre-wrap">
                        {candidate.aiStrengths || <span className="text-emerald-700/60 italic">未生成</span>}
                      </p>
                    </div>

                    <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-xl space-y-1.5">
                      <h4 className="font-bold text-amber-900 text-xs flex items-center gap-1.5">
                        <HelpCircle className="w-4 h-4 text-amber-600" />
                        <span>面接での確認推奨事項</span>
                      </h4>
                      <p className="text-amber-950 text-xs leading-relaxed whitespace-pre-wrap">
                        {candidate.aiConcerns || <span className="text-amber-700/60 italic">未生成</span>}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Drop Re-upload File Area */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDetailDragging(true); }}
                onDragLeave={() => setIsDetailDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDetailDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleDetailFilesDrop(Array.from(e.dataTransfer.files));
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-4 text-center transition-all ${
                  isDetailDragging ? 'border-indigo-600 bg-indigo-50' : 'border-slate-300 bg-white'
                }`}
              >
                {isDetailCompressing ? (
                  <div className="flex items-center justify-center gap-2 text-indigo-700 font-bold text-xs py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>大きいファイルを圧縮中...（最大20秒程度）</span>
                  </div>
                ) : isDetailParsing ? (
                  <div className="flex items-center justify-center gap-2 text-indigo-700 font-bold text-xs py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>新しい書類をGemini AIで解析・更新中...</span>
                  </div>
                ) : isDetailDetectingPhoto ? (
                  <div className="flex items-center justify-center gap-2 text-indigo-700 font-bold text-xs py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>顔写真を自動抽出中...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-600 font-medium">新しい書類(履歴書・職務経歴書など、複数可)をドロップして追加</span>
                    <label className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg cursor-pointer text-xs shrink-0">
                      ファイル選択
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.txt"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handleDetailFilesDrop(Array.from(e.target.files));
                          }
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

      </div>

      {/* Resume Photo Cropper Modal */}
      <ResumePhotoCropperModal
        isOpen={isPhotoCropperOpen}
        onClose={() => setIsPhotoCropperOpen(false)}
        candidateName={candidate.name}
        currentAvatarUrl={candidate.avatarUrl}
        resumeFileName={candidate.resumeFileName}
        resumeDriveFileId={candidate.resumeDriveFileId}
        driveAccessToken={driveAccessToken}
        onSavePhoto={(newAvatarUrl) => {
          updateCandidate({
            ...candidate,
            avatarUrl: newAvatarUrl
          });
          showToast('履歴書から切り抜いた顔写真を適用・保存しました', 'success');
        }}
      />
    </div>
  );
};
