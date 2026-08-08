import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useATS } from '../context/ATSContext';
import { SelectionPhase, ScheduleStatus, STANDARD_POSITIONS } from '../types';
import { X, UserPlus, FileText, UploadCloud, Loader2, Sparkles, CheckCircle2, File, HardDrive } from 'lucide-react';
import { uploadResumeToDrive, detectResumePhotoCrop } from '../lib/driveApi';
import { renderAndCrop } from '../lib/photoCrop';
import { MAX_UPLOAD_FILE_BYTES, readFileAsDataUrl, compressFileIfOversized } from '../lib/fileUpload';

export const CandidateFormModal: React.FC = () => {
  const { isAddModalOpen, setIsAddModalOpen, addCandidate, agencies, staffList, showToast, driveAccessToken } = useATS();

  const getInitialFormData = useCallback(() => ({
    name: '',
    nameKana: '',
    email: '',
    phone: '',
    jobTitle: '',
    appliedDate: new Date().toISOString().split('T')[0],
    agencyId: agencies[0]?.id || 'ag-1',
    assignees: agencies[0]?.assignedStaffNames && agencies[0].assignedStaffNames.length > 0
      ? agencies[0].assignedStaffNames
      : [staffList[0]?.name || '山田 太郎'],
    documentScreeningSameAsMain: true,
    documentScreeningAssignee: '',
    phase: 'DOCUMENT_SCREENING' as SelectionPhase,
    scheduleStatus: 'UNARRANGED' as ScheduleStatus,
    salaryExpectation: '',
    age: 0,
    education: '',
    currentCompany: '',
    companyCount: 0,
    resumeSummary: '',
    skills: '',
    rawResumeContent: '',
    resumeFileName: '',
    resumeDriveUrl: '',
    resumeDriveFileId: '',
    resumeDriveFolderId: '',
    resumeDocuments: [] as { name: string; driveUrl: string; driveFileId: string }[],
    avatarUrl: '',
    joiningDate: '',
    preJoinDinnerStatus: 'UNPLANNED' as const,
    resignationNegotiationStatus: 'NOT_STARTED' as const,
    onboardingNotes: '',
    bcaDesiredDepartment: 'F+' as 'F+' | 'AC' | 'BOTH'
  }), [agencies, staffList]);

  const [formData, setFormData] = useState(getInitialFormData);

  const [isDragging, setIsDragging] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedSuccess, setParsedSuccess] = useState(false);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [isDetectingPhoto, setIsDetectingPhoto] = useState(false);
  const [extraFileNames, setExtraFileNames] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The modal component stays mounted (App always renders it, it just returns null while
  // closed), so without this the form kept whatever the previous candidate had typed in.
  // Reset on every open rather than only on submit, so it's also clean after Cancel/X.
  useEffect(() => {
    if (isAddModalOpen) {
      setFormData(getInitialFormData());
      setIsDragging(false);
      setIsCompressing(false);
      setIsParsing(false);
      setParsedSuccess(false);
      setIsUploadingToDrive(false);
      setIsDetectingPhoto(false);
      setExtraFileNames([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddModalOpen]);

  if (!isAddModalOpen) return null;

  // Handle agency change and auto-populate assigned company staff
  const handleAgencyChange = (agencyId: string) => {
    const selectedAgency = agencies.find((a) => a.id === agencyId);
    const defaultStaff = selectedAgency?.assignedStaffNames && selectedAgency.assignedStaffNames.length > 0
      ? selectedAgency.assignedStaffNames
      : [staffList[0]?.name || '山田 太郎'];

    setFormData((prev) => ({
      ...prev,
      agencyId,
      assignees: defaultStaff
    }));
  };

  // Process dropped/selected files. AI parsing (name, education, etc.) runs against the first
  // file only; every file in the drop — e.g. 履歴書 + 職務経歴書 together — gets uploaded to the
  // candidate's Drive folder, since a candidate is often registered with more than one document.
  // AI parsing and Drive upload are independent steps: a failure/oversized file in one doesn't
  // block the other, and one extra file failing to upload doesn't take the primary file's
  // successful upload (and the photo-crop that depends on it) down with it.
  const processResumeFiles = async (rawFiles: globalThis.File[]) => {
    if (!rawFiles || rawFiles.length === 0) return;

    setParsedSuccess(false);

    // Oversized PDFs/images are compressed client-side (rasterize + re-encode as JPEG) before
    // anything else touches them, so both AI parsing and Drive upload below just see right-sized
    // files. Files that are already small, or aren't a compressible type, pass through untouched.
    // This can take up to ~20s for a large/complex file, so it gets its own busy indicator rather
    // than being lumped in with (much faster) AI parsing.
    const needsCompression = rawFiles.some((f) => f.size > MAX_UPLOAD_FILE_BYTES);
    if (needsCompression) setIsCompressing(true);
    const compressedResults = await Promise.all(
      rawFiles.map((f) => (f.size > MAX_UPLOAD_FILE_BYTES ? compressFileIfOversized(f, MAX_UPLOAD_FILE_BYTES) : Promise.resolve({ file: f, compressed: false, truncated: false })))
    );
    setIsCompressing(false);
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

    setIsParsing(true);

    const [primaryFile, ...extraFiles] = files;
    setExtraFileNames(extraFiles.map((f) => f.name));

    let parsedData: any = null;
    let textContent = '';
    let primaryBase64 = '';
    const primaryTooLarge = primaryFile.size > MAX_UPLOAD_FILE_BYTES;

    try {
      if (primaryFile.type.includes('text') || primaryFile.name.endsWith('.txt') || primaryFile.name.endsWith('.md')) {
        textContent = await primaryFile.text();
      } else if (!primaryTooLarge) {
        primaryBase64 = await readFileAsDataUrl(primaryFile);
        // Try reading text if plain text compatible
        try {
          textContent = await primaryFile.text();
        } catch {
          textContent = '';
        }
      }

      if (primaryTooLarge) {
        showToast(
          `${primaryFile.name} は圧縮後も${(primaryFile.size / 1024 / 1024).toFixed(1)}MBあり、AI解析の上限（3MB）を超えているためスキップしました。手動で入力してください。`,
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
          parsedData = d;
          setFormData((prev) => ({
            ...prev,
            name: d.name || prev.name,
            nameKana: d.nameKana || prev.nameKana,
            email: d.email || prev.email,
            phone: d.phone || prev.phone,
            jobTitle: d.jobTitle || prev.jobTitle,
            salaryExpectation: d.salaryExpectation || prev.salaryExpectation,
            age: d.age ? Number(d.age) : prev.age,
            education: d.education || prev.education,
            currentCompany: d.currentCompany || prev.currentCompany,
            companyCount: d.companyCount ? Number(d.companyCount) : prev.companyCount,
            resumeSummary: d.resumeSummary || prev.resumeSummary,
            skills: Array.isArray(d.resumeSkills) && d.resumeSkills.length > 0 ? d.resumeSkills.join(', ') : prev.skills,
            rawResumeContent: d.rawResumeContent || textContent || '（レジュメファイル解読済み）',
            resumeFileName: primaryFile.name
          }));
          setParsedSuccess(true);
          showToast('Gemini AIによるレジュメ解析が完了し、フォームに自動入力されました', 'success');
        } else {
          showToast('レジュメの解析に一部失敗しました。手動で入力をお願いします。', 'warning');
        }
      }
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'ファイル読み込み中にエラーが発生しました', 'warning');
    } finally {
      setIsParsing(false);
    }

    // Save every dropped file (not just the primary one) to the candidate's Drive folder — the
    // first successful upload creates the folder, the rest reuse it. Runs regardless of whether
    // AI parsing above succeeded, so an oversized/failed primary file doesn't block uploading the
    // rest of the drop, and one extra file failing doesn't stop the primary's photo-crop below.
    if (!driveAccessToken) {
      // Photo auto-detection needs the resume in Drive first (it re-downloads the uploaded file
      // to hand to Gemini), so without a Drive connection it's silently never attempted — tell the
      // user why instead of leaving them to wonder if it's still running or just broken.
      showToast('Drive未接続のため、顔写真の自動検出・保存はスキップされました。詳細画面から手動で切り抜き設定できます。', 'info');
    }

    if (driveAccessToken) {
      setIsUploadingToDrive(true);
      const selectedAgencyForUpload = agencies.find((a) => a.id === formData.agencyId);
      let folderId: string | undefined;
      let primaryUploaded: Awaited<ReturnType<typeof uploadResumeToDrive>> | null = null;
      const allUploaded: Awaited<ReturnType<typeof uploadResumeToDrive>>[] = [];
      let uploadedCount = 0;

      for (const file of [primaryFile, ...extraFiles]) {
        if (file.size > MAX_UPLOAD_FILE_BYTES) {
          if (file !== primaryFile) {
            showToast(
              `${file.name} は圧縮後も${(file.size / 1024 / 1024).toFixed(1)}MBあり、Drive保存の上限（3MB）を超えているためスキップしました。`,
              'warning'
            );
          }
          continue;
        }
        try {
          const base64 = file === primaryFile && primaryBase64 ? primaryBase64 : await readFileAsDataUrl(file);
          const uploaded = await uploadResumeToDrive(
            driveAccessToken,
            { name: file.name, type: file.type || 'application/pdf', base64 },
            {
              candidateName: parsedData?.name || formData.name,
              agencyName: selectedAgencyForUpload?.name,
              phase: formData.phase,
              candidateFolderId: folderId
            }
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
        setFormData((prev) => ({
          ...prev,
          resumeDriveUrl: primaryUploaded?.file.webViewLink || prev.resumeDriveUrl,
          resumeDriveFileId: primaryUploaded?.file.id || prev.resumeDriveFileId,
          resumeDriveFolderId: folderId || prev.resumeDriveFolderId,
          resumeDocuments: allUploaded.map((u) => ({
            name: u.file.name,
            driveUrl: u.file.webViewLink || '',
            driveFileId: u.file.id
          }))
        }));
        showToast(
          uploadedCount > 1 ? `${uploadedCount}件のファイルをDriveフォルダに保存しました` : '履歴書・応募書類をDriveフォルダに保存しました',
          'success'
        );

        // Best-effort: try to pull the candidate's actual photo out of the resume itself, so the
        // registered candidate doesn't end up with no photo (or a stand-in one). The photo isn't
        // necessarily in the first-dropped file (e.g. 職務経歴書 first, 履歴書 with a photo second),
        // so try every uploaded file in order and stop at the first one that actually has a photo.
        if (allUploaded.length > 0) {
          setIsDetectingPhoto(true);
          // Tracks why no photo ended up set, so the user gets a concrete toast either way instead
          // of silence — previously a not-found result and a hard API/network error looked
          // identical (nothing happened), which is indistinguishable from "still processing" and
          // was the main source of "顔写真が反映されない" reports with no way to tell what failed.
          let photoFound = false;
          let lastPhotoError: string | null = null;
          try {
            for (const uploaded of allUploaded) {
              if (!uploaded.file.id) continue;
              try {
                const detected = await detectResumePhotoCrop(driveAccessToken, uploaded.file.id);
                if (detected.found && detected.box) {
                  const croppedDataUrl = await renderAndCrop(detected.fileBase64, detected.mimeType, detected.box, detected.page);
                  setFormData((prev) => ({ ...prev, avatarUrl: croppedDataUrl }));
                  showToast('履歴書から顔写真を自動抽出しました', 'success');
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
                showToast(`顔写真の自動検出でエラーが発生しました: ${lastPhotoError}（詳細画面から手動で切り抜きできます）`, 'warning');
              } else {
                showToast('アップロードした書類から証明写真を検出できませんでした。詳細画面の「顔写真切抜」から手動で設定できます。', 'info');
              }
            }
          } finally {
            setIsDetectingPhoto(false);
          }
        }
      }
      setIsUploadingToDrive(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processResumeFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processResumeFiles(Array.from(e.target.files));
    }
  };

  const isBusy = isCompressing || isParsing || isUploadingToDrive || isDetectingPhoto;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isBusy) {
      showToast('レジュメの解析・Drive保存・顔写真検出が完了するまでお待ちください', 'warning');
      return;
    }
    if (!formData.name.trim()) {
      showToast('候補者名を入力してください', 'warning');
      return;
    }

    const selectedAgency = agencies.find((a) => a.id === formData.agencyId);

    addCandidate({
      name: formData.name,
      nameKana: formData.nameKana,
      email: formData.email,
      phone: formData.phone,
      jobTitle: formData.jobTitle,
      appliedDate: formData.appliedDate,
      agencyId: formData.agencyId,
      agencyName: selectedAgency ? selectedAgency.name : '直接応募',
      assignees: formData.assignees,
      documentScreeningAssignee: formData.documentScreeningSameAsMain ? undefined : formData.documentScreeningAssignee || undefined,
      phase: formData.phase,
      scheduleStatus: formData.scheduleStatus,
      salaryExpectation: formData.salaryExpectation,
      age: formData.age,
      education: formData.education,
      currentCompany: formData.currentCompany,
      companyCount: formData.companyCount,
      resumeSummary: formData.resumeSummary || '新規応募者。要書類選考。',
      avatarUrl: formData.avatarUrl || undefined,
      rawResumeContent: formData.rawResumeContent,
      resumeFileName: formData.resumeFileName || undefined,
      resumeDriveUrl: formData.resumeDriveUrl || undefined,
      resumeDriveFileId: formData.resumeDriveFileId || undefined,
      resumeDriveFolderId: formData.resumeDriveFolderId || undefined,
      resumeDocuments: formData.resumeDocuments.length > 0 ? formData.resumeDocuments : undefined,
      resumeSkills: formData.skills.split(',').map((s) => s.trim()).filter(Boolean),
      joiningDate: formData.joiningDate || undefined,
      preJoinDinnerStatus: formData.preJoinDinnerStatus,
      resignationNegotiationStatus: formData.resignationNegotiationStatus,
      onboardingNotes: formData.onboardingNotes,
      bcaDesiredDepartment: formData.jobTitle.includes('BCA') ? formData.bcaDesiredDepartment : undefined
    });

    setIsAddModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl p-6 shadow-sm animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-lg text-slate-900">新規候補者エントリー登録</h3>
          </div>
          <button
            onClick={() => setIsAddModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resume Drag & Drop Upload Zone */}
        <div className="mb-5">
          <label className="block text-slate-700 text-xs font-semibold mb-1.5 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>履歴書・職務経歴書からドラッグ＆ドロップ登録 (AI自動解析・複数ファイル可)</span>
          </label>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/50'
                : parsedSuccess
                ? 'border-emerald-500/60 bg-emerald-50/50'
                : 'border-slate-300 bg-slate-50/60 hover:border-slate-400 hover:bg-slate-100/50'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.txt,.md"
              multiple
              className="hidden"
            />

            {isCompressing ? (
              <div className="flex flex-col items-center justify-center py-2 text-indigo-600">
                <Loader2 className="w-7 h-7 animate-spin mb-2" />
                <p className="font-semibold text-xs text-slate-900">大きいファイルを圧縮中...</p>
                <p className="text-[11px] text-slate-500 mt-0.5">ファイルによっては最大20秒程度かかることがあります</p>
              </div>
            ) : isParsing ? (
              <div className="flex flex-col items-center justify-center py-2 text-indigo-600">
                <Loader2 className="w-7 h-7 animate-spin mb-2" />
                <p className="font-semibold text-xs text-slate-900">Gemini AIがレジュメを解析中...</p>
                <p className="text-[11px] text-slate-500 mt-0.5">氏名、職種、学歴、在籍企業、主要スキル、希望年収、経歴要約を抽出し自動入力します</p>
              </div>
            ) : parsedSuccess ? (
              <div className="flex items-center justify-center gap-2 py-1 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
                <div className="text-left">
                  <p className="font-bold text-xs text-slate-900">解析完了: {formData.resumeFileName}</p>
                  {extraFileNames.length > 0 && (
                    <p className="text-[11px] text-slate-500">+ {extraFileNames.join(', ')}（Driveに同時保存）</p>
                  )}
                  <p className="text-[11px] text-emerald-700">各フィールドに自動入力されました。必要に応じて下記で修正できます。</p>
                  {isUploadingToDrive ? (
                    <p className="text-[11px] text-indigo-600 flex items-center gap-1 mt-0.5">
                      <Loader2 className="w-3 h-3 animate-spin" /> Driveフォルダに保存中...
                    </p>
                  ) : formData.resumeDriveUrl ? (
                    <a
                      href={formData.resumeDriveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 mt-0.5"
                    >
                      <HardDrive className="w-3 h-3" /> Driveフォルダに保存済み（開く）
                    </a>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      ※ヘッダーの「Drive連携」でログインすると、Driveフォルダにも自動保存されます
                    </p>
                  )}
                  {isDetectingPhoto ? (
                    <p className="text-[11px] text-indigo-600 flex items-center gap-1 mt-0.5">
                      <Loader2 className="w-3 h-3 animate-spin" /> 履歴書から顔写真を検出中...
                    </p>
                  ) : formData.avatarUrl ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <img
                        src={formData.avatarUrl}
                        alt="抽出した顔写真"
                        className="w-6 h-8 object-cover rounded border border-indigo-200"
                      />
                      <span className="text-[11px] text-emerald-700">顔写真を自動抽出しました</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-2">
                <UploadCloud className="w-8 h-8 text-indigo-600 mb-1.5" />
                <p className="text-xs font-semibold text-slate-800">
                  ここに履歴書・職務経歴書（PDF/Word/Text）をドラッグ＆ドロップ
                </p>
                <p className="text-[11px] text-slate-500 mt-1">複数ファイルまとめて可。またはクリックしてファイルを選択 (AIが1件目から氏名・学歴・企業・スキル等を自動抽出、全ファイルをDriveに保存。3MB超のPDF/画像は自動で圧縮されます)</p>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          
          {/* Name & Kana */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-medium mb-1">候補者名 *</label>
              <input
                type="text"
                required
                placeholder="例: 山本 拓也"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">フリガナ</label>
              <input
                type="text"
                placeholder="例: ヤマモト タクヤ"
                value={formData.nameKana}
                onChange={(e) => setFormData({ ...formData, nameKana: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Demographics: Age & Education */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-700 font-medium mb-1">年齢</label>
              <input
                type="number"
                min="18"
                max="80"
                placeholder="例: 29"
                value={formData.age || ''}
                onChange={(e) => setFormData({ ...formData, age: Number(e.target.value) })}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-slate-700 font-medium mb-1">最終学歴</label>
              <input
                type="text"
                placeholder="例: ○○大学 工学部 卒"
                value={formData.education}
                onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Demographics: Current Company & Company Count */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-slate-700 font-medium mb-1">現職・在籍企業名</label>
              <input
                type="text"
                placeholder="例: 株式会社テクノソリューションズ"
                value={formData.currentCompany}
                onChange={(e) => setFormData({ ...formData, currentCompany: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">経験社数 (社)</label>
              <input
                type="number"
                min="1"
                max="20"
                placeholder="例: 2"
                value={formData.companyCount || ''}
                onChange={(e) => setFormData({ ...formData, companyCount: Number(e.target.value) })}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-medium mb-1">メールアドレス</label>
              <input
                type="email"
                placeholder="yamamoto@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">電話番号</label>
              <input
                type="text"
                placeholder="090-0000-0000"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Job Title / Selection Position & Applied Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-medium mb-1">選考ポジション *</label>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {STANDARD_POSITIONS.map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setFormData({ ...formData, jobTitle: pos })}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      formData.jobTitle === pos
                        ? 'bg-indigo-600 text-white shadow-2xs ring-2 ring-indigo-200'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
              <input
                type="text"
                required
                placeholder="選考ポジション (EC, BP, AIX, BRE, BCA など)"
                value={formData.jobTitle}
                onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-bold rounded-lg px-3 py-1.5 focus:outline-none focus:bg-white focus:border-indigo-500 text-xs"
              />

              {formData.jobTitle.toUpperCase().includes('BCA') && (
                <div className="mt-2.5 p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-1.5 animate-in fade-in">
                  <label className="block text-indigo-900 text-[11px] font-bold">BCA希望事業部 *</label>
                  <div className="flex items-center gap-1.5">
                    {[
                      { value: 'F+', label: 'F+ 事業部' },
                      { value: 'AC', label: 'AC 事業部' },
                      { value: 'BOTH', label: 'F+ / AC 両方可' }
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, bcaDesiredDepartment: opt.value as any })}
                        className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          formData.bcaDesiredDepartment === opt.value
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-slate-700 font-medium mb-1">応募日 *</label>
              <input
                type="date"
                required
                value={formData.appliedDate}
                onChange={(e) => setFormData({ ...formData, appliedDate: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Agency & Assignee */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-medium mb-1">紹介エージェント / 経路 *</label>
              <select
                value={formData.agencyId}
                onChange={(e) => handleAgencyChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500 cursor-pointer"
              >
                {agencies.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">弊社主担当者 (エージェント紐づけ連動) *</label>
              <select
                value={formData.assignees[0] || ''}
                onChange={(e) => setFormData({ ...formData, assignees: [e.target.value] })}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500 cursor-pointer"
              >
                {staffList.map((st) => (
                  <option key={st.id} value={st.name}>
                    {st.name} ({st.department})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Document screening assignee override — oversized + red so it isn't missed/misclicked
              during registration, since getting this wrong means the wrong person (or nobody) gets
              the Google Chat 書類選考 notification. */}
          <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-4">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formData.documentScreeningSameAsMain}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setFormData((prev) => ({
                    ...prev,
                    documentScreeningSameAsMain: checked,
                    documentScreeningAssignee: checked
                      ? prev.documentScreeningAssignee
                      : prev.documentScreeningAssignee ||
                        staffList.find((s) => s.name !== prev.assignees[0])?.name ||
                        staffList[0]?.name ||
                        ''
                  }));
                }}
                className="w-6 h-6 accent-rose-600 cursor-pointer shrink-0"
              />
              <span className="text-base font-bold text-rose-700">弊社主担当者が書類選考も実施する</span>
            </label>

            {!formData.documentScreeningSameAsMain && (
              <div className="mt-3 pl-9">
                <label className="block text-rose-700 font-bold mb-1">書類選考担当者 *</label>
                <select
                  required
                  value={formData.documentScreeningAssignee}
                  onChange={(e) => setFormData({ ...formData, documentScreeningAssignee: e.target.value })}
                  className="w-full bg-white border-2 border-rose-300 text-slate-900 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-rose-500 cursor-pointer"
                >
                  {staffList.map((st) => (
                    <option key={st.id} value={st.name}>
                      {st.name} ({st.department})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-rose-600 mt-1.5 font-medium">
                  弊社主担当者とは別に、書類選考のみを担当する採用担当者を選択してください。
                </p>
              </div>
            )}
          </div>

          {/* Salary expectation & skills */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-medium mb-1">希望年収</label>
              <input
                type="text"
                placeholder="例: 700万円 〜 800万円"
                value={formData.salaryExpectation}
                onChange={(e) => setFormData({ ...formData, salaryExpectation: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">スキルタグ (カンマ区切り)</label>
              <input
                type="text"
                placeholder="React, TypeScript, AWS"
                value={formData.skills}
                onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Resume Summary */}
          <div>
            <label className="block text-slate-700 font-medium mb-1">職歴概要・AI要約サマリー</label>
            <textarea
              rows={3}
              placeholder="経歴の要約、主要得意領域、現在の就職希望状況..."
              value={formData.resumeSummary}
              onChange={(e) => setFormData({ ...formData, resumeSummary: e.target.value })}
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg p-2.5 focus:outline-none focus:bg-white focus:border-indigo-500"
            />
          </div>

          {/* Onboarding & Pre-joining Management (Optional / Scheduled) */}
          <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-3">
            <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <span>入社予定者フォロー管理設定（任意）</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-slate-700 text-[11px] font-semibold mb-1">入社予定日</label>
                <input
                  type="date"
                  value={formData.joiningDate}
                  onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                  className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 text-[11px] font-semibold mb-1">入社前会食の状況</label>
                <select
                  value={formData.preJoinDinnerStatus}
                  onChange={(e) => setFormData({ ...formData, preJoinDinnerStatus: e.target.value as any })}
                  className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="UNPLANNED">未定</option>
                  <option value="SCHEDULED">予定あり</option>
                  <option value="COMPLETED">実施済み</option>
                  <option value="NOT_REQUIRED">不要・不参加</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 text-[11px] font-semibold mb-1">退職交渉の状況</label>
                <select
                  value={formData.resignationNegotiationStatus}
                  onChange={(e) => setFormData({ ...formData, resignationNegotiationStatus: e.target.value as any })}
                  className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="NOT_STARTED">未着手</option>
                  <option value="IN_PROGRESS">交渉中</option>
                  <option value="NOTICE_SUBMITTED">退職願提出済</option>
                  <option value="COMPLETED">交渉完了</option>
                  <option value="DIFFICULT">難航・調整中</option>
                </select>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-lg cursor-pointer font-medium"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isBusy}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isBusy ? '処理中...' : '登録する'}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
