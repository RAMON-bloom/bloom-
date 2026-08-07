import React, { useState, useRef } from 'react';
import { useATS } from '../context/ATSContext';
import { SelectionPhase, ScheduleStatus, STANDARD_POSITIONS } from '../types';
import { X, UserPlus, FileText, UploadCloud, Loader2, Sparkles, CheckCircle2, File, HardDrive } from 'lucide-react';
import { uploadResumeToDrive } from '../lib/driveApi';

export const CandidateFormModal: React.FC = () => {
  const { isAddModalOpen, setIsAddModalOpen, addCandidate, agencies, staffList, showToast, driveAccessToken } = useATS();

  const [formData, setFormData] = useState({
    name: '',
    nameKana: '',
    email: '',
    phone: '',
    jobTitle: 'EC',
    appliedDate: new Date().toISOString().split('T')[0],
    agencyId: agencies[0]?.id || 'ag-1',
    assignees: agencies[0]?.assignedStaffNames || [staffList[0]?.name || '山田 太郎'],
    phase: 'DOCUMENT_SCREENING' as SelectionPhase,
    scheduleStatus: 'UNARRANGED' as ScheduleStatus,
    salaryExpectation: '600万円 〜 750万円',
    age: 29,
    education: '東京工業大学 工学部 情報工学科 卒',
    currentCompany: '株式会社テクノソリューションズ',
    companyCount: 2,
    resumeSummary: '',
    skills: 'React, TypeScript, Next.js',
    rawResumeContent: '',
    resumeFileName: '',
    resumeDriveUrl: '',
    resumeDriveFileId: '',
    joiningDate: '',
    preJoinDinnerStatus: 'UNPLANNED' as const,
    resignationNegotiationStatus: 'NOT_STARTED' as const,
    onboardingNotes: '',
    bcaDesiredDepartment: 'F+' as 'F+' | 'AC' | 'BOTH'
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedSuccess, setParsedSuccess] = useState(false);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Process uploaded file (Read text or Base64 and send to Gemini API)
  const processResumeFile = async (file: globalThis.File) => {
    if (!file) return;

    setIsParsing(true);
    setParsedSuccess(false);

    try {
      let textContent = '';
      let fileBase64 = '';

      if (file.type.includes('text') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        textContent = await file.text();
      } else {
        // Read file as Data URL / Base64
        fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Try reading text if plain text compatible
        try {
          textContent = await file.text();
        } catch {
          textContent = '';
        }
      }

      // Call API server endpoint
      const response = await fetch('/api/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textContent,
          fileBase64,
          fileName: file.name,
          mimeType: file.type || 'application/pdf'
        })
      });

      const result = await response.json();

      if (result.success && result.data) {
        const d = result.data;
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
          skills: Array.isArray(d.resumeSkills) ? d.resumeSkills.join(', ') : prev.skills,
          rawResumeContent: d.rawResumeContent || textContent || '（レジュメファイル解読済み）',
          resumeFileName: file.name
        }));

        setParsedSuccess(true);
        showToast('Gemini AIによるレジュメ解析が完了し、フォームに自動入力されました', 'success');

        // If connected to Google Drive, also save the original resume file to the shared folder
        if (driveAccessToken && fileBase64) {
          setIsUploadingToDrive(true);
          try {
            const uploaded = await uploadResumeToDrive(
              driveAccessToken,
              {
                name: file.name,
                type: file.type || 'application/pdf',
                base64: fileBase64
              },
              undefined,
              formData.phase
            );
            setFormData((prev) => ({
              ...prev,
              resumeDriveUrl: uploaded.webViewLink || '',
              resumeDriveFileId: uploaded.id || ''
            }));
            showToast('履歴書・応募書類をDriveフォルダに保存しました', 'success');
          } catch (driveErr: any) {
            showToast(`Driveへの保存に失敗しました: ${driveErr.message || '不明なエラー'}`, 'warning');
          } finally {
            setIsUploadingToDrive(false);
          }
        }
      } else {
        showToast('レジュメの解析に一部失敗しました。手動で入力をお願いします。', 'warning');
      }
    } catch (err) {
      console.error(err);
      showToast('ファイル読み込み中にエラーが発生しました', 'warning');
    } finally {
      setIsParsing(false);
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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processResumeFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processResumeFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

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
      phase: formData.phase,
      scheduleStatus: formData.scheduleStatus,
      salaryExpectation: formData.salaryExpectation,
      age: formData.age,
      education: formData.education,
      currentCompany: formData.currentCompany,
      companyCount: formData.companyCount,
      resumeSummary: formData.resumeSummary || '新規応募者。要書類選考。',
      avatarUrl: formData.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
      rawResumeContent: formData.rawResumeContent,
      resumeFileName: formData.resumeFileName || '職務経歴書.pdf',
      resumeDriveUrl: formData.resumeDriveUrl || undefined,
      resumeDriveFileId: formData.resumeDriveFileId || undefined,
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
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl p-6 shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        
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
            <span>職務経歴書・レジュメからドラッグ＆ドロップ登録 (AI自動解析)</span>
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
              className="hidden"
            />

            {isParsing ? (
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
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-2">
                <UploadCloud className="w-8 h-8 text-indigo-600 mb-1.5" />
                <p className="text-xs font-semibold text-slate-800">
                  ここにレジュメ（PDF/Word/Text）をドラッグ＆ドロップ
                </p>
                <p className="text-[11px] text-slate-500 mt-1">またはクリックしてファイルを選択 (AIが氏名・学歴・企業・スキル等を自動抽出)</p>
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
                value={formData.age}
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
                value={formData.companyCount}
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
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer font-medium"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-2xs cursor-pointer"
            >
              登録する
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
