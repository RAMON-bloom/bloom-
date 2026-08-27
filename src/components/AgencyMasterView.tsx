import React, { useState, useEffect } from 'react';
import { useATS } from '../context/ATSContext';
import { Agency, InternalStaff, AgencyContact, ChatWebhook, ChatNotificationKind, RecruitmentPosition } from '../types';
import { getAllStaffWebhookUrls, CHAT_NOTIFICATION_KINDS } from '../lib/staffUtils';
import {
  Building2,
  Plus,
  Mail,
  Percent,
  Target,
  CheckCircle,
  XCircle,
  Edit3,
  Users,
  Search,
  Trash2,
  UserCheck,
  Briefcase,
  ShieldCheck,
  UserPlus,
  Phone,
  User,
  Check,
  Star,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ClipboardCheck
} from 'lucide-react';

export const AgencyMasterView: React.FC = () => {
  const { 
    agencies, 
    addAgency, 
    updateAgency, 
    deleteAgency,
    toggleAgencyActive, 
    candidates,
    userRole,
    driveUserEmail,
    staffList,
    addStaff,
    deleteStaff,
    updateStaff,
    groupChatWebhooks,
    updateGroupChatWebhooks,
    positions,
    updatePositions
  } = useATS();

  const [activeSubTab, setActiveSubTab] = useState<'agencies' | 'staff'>('agencies');

  // Agency Modal State
  const [isAgencyModalOpen, setIsAgencyModalOpen] = useState(false);
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null);

  const [agencyFormData, setAgencyFormData] = useState({
    name: '',
    contactPerson: '',
    email: '',
    contacts: [] as AgencyContact[],
    commissionRate: 35,
    commissionAppliesToBonusGuarantee: false,
    commissionAppliesToSignOnBonus: false,
    monthlyTarget: 5,
    notes: '',
    assignedStaffNames: [] as string[],
    assignedStaffNamesByPosition: {} as Record<string, string[]>
  });

  // 応募状況ダイジェストでポジション別の担当者上書きを設定できる対象。ダイジェスト側が
  // BCA/AIX/BREだけを個別見出しにする(それ以外は「その他」に束ねる)のに合わせている。
  const DIGEST_OVERRIDE_POSITIONS = ['BCA', 'AIX', 'BRE'];

  // Staff Modal State
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<InternalStaff | null>(null);
  const [staffFormData, setStaffFormData] = useState({
    name: '',
    department: '人事部',
    role: '採用担当 (リクルーター)',
    email: '',
    chatMentionId: '',
    googleChatWebhooks: [] as ChatWebhook[]
  });

  // グループ用（複数人が見るスペース宛）Webhookの編集用ドラフト。個人の担当者フォームと違い、
  // モーダルを介さずこのページに直接インライン編集欄を出す。保存ボタンを押すまでcontextには反映
  // しない（URL入力中の毎キー入力でDrive自動バックアップを誘発しないようにするため）。
  const [groupWebhookDraft, setGroupWebhookDraft] = useState<ChatWebhook[]>(groupChatWebhooks);
  const [isGroupWebhookDirty, setIsGroupWebhookDirty] = useState(false);
  const [isGroupWebhookCollapsed, setIsGroupWebhookCollapsed] = useState(true);

  useEffect(() => {
    if (!isGroupWebhookDirty) {
      setGroupWebhookDraft(groupChatWebhooks);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupChatWebhooks]);

  // 選考ポジションのマスタ一覧編集用ドラフト。groupWebhookDraftと同じ考え方（保存ボタンを押すまで
  // contextに反映しない）。
  const [positionDraft, setPositionDraft] = useState<RecruitmentPosition[]>(positions);
  const [isPositionDirty, setIsPositionDirty] = useState(false);
  const [isPositionCollapsed, setIsPositionCollapsed] = useState(true);

  useEffect(() => {
    if (!isPositionDirty) {
      setPositionDraft(positions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);

  // Delete Confirm Modal State
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'agency' | 'staff';
    id: string;
    name: string;
  } | null>(null);

  // Open Agency Modal
  const handleOpenAddAgency = () => {
    setEditingAgency(null);
    setAgencyFormData({
      name: '',
      contactPerson: '',
      email: '',
      contacts: [
        {
          id: `ac-${Date.now()}-1`,
          name: '',
          role: 'メイン窓口 (RA)',
          email: '',
          phone: '',
          isPrimary: true
        }
      ],
      commissionRate: 35,
      commissionAppliesToBonusGuarantee: false,
      commissionAppliesToSignOnBonus: false,
      monthlyTarget: 5,
      notes: '',
      assignedStaffNames: [staffList[0]?.name || '山田 太郎'],
      assignedStaffNamesByPosition: {}
    });
    setIsAgencyModalOpen(true);
  };

  const handleOpenEditAgency = (agency: Agency) => {
    setEditingAgency(agency);

    const initialContacts = (agency.contacts && agency.contacts.length > 0)
      ? agency.contacts
      : [
          {
            id: `ac-${Date.now()}-1`,
            name: agency.contactPerson || '',
            role: 'メイン窓口 (RA)',
            email: agency.email || '',
            phone: '',
            isPrimary: true
          }
        ];

    setAgencyFormData({
      name: agency.name,
      contactPerson: agency.contactPerson || '',
      email: agency.email || '',
      contacts: initialContacts,
      commissionRate: agency.commissionRate,
      commissionAppliesToBonusGuarantee: !!agency.commissionAppliesToBonusGuarantee,
      commissionAppliesToSignOnBonus: !!agency.commissionAppliesToSignOnBonus,
      monthlyTarget: agency.monthlyTarget,
      notes: agency.notes || '',
      assignedStaffNames: agency.assignedStaffNames || [],
      assignedStaffNamesByPosition: agency.assignedStaffNamesByPosition || {}
    });
    setIsAgencyModalOpen(true);
  };

  const handleAddContactRow = () => {
    setAgencyFormData((prev) => ({
      ...prev,
      contacts: [
        ...prev.contacts,
        {
          id: `ac-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: '',
          role: 'キャリアアドバイザー (CA)',
          email: '',
          phone: '',
          isPrimary: prev.contacts.length === 0
        }
      ]
    }));
  };

  const handleUpdateContactRow = (id: string, field: keyof AgencyContact, value: any) => {
    setAgencyFormData((prev) => {
      const updated = prev.contacts.map((c) => {
        if (c.id === id) {
          if (field === 'isPrimary' && value === true) {
            return { ...c, isPrimary: true };
          }
          return { ...c, [field]: value };
        } else if (field === 'isPrimary' && value === true) {
          return { ...c, isPrimary: false };
        }
        return c;
      });
      return { ...prev, contacts: updated };
    });
  };

  const handleRemoveContactRow = (id: string) => {
    setAgencyFormData((prev) => {
      const filtered = prev.contacts.filter((c) => c.id !== id);
      if (filtered.length > 0 && !filtered.some((c) => c.isPrimary)) {
        filtered[0].isPrimary = true;
      }
      return { ...prev, contacts: filtered };
    });
  };

  const handleAgencySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agencyFormData.name.trim()) return;

    // Determine primary contact
    const validContacts = agencyFormData.contacts.filter((c) => c.name.trim().length > 0);
    const primaryContact = validContacts.find((c) => c.isPrimary) || validContacts[0];
    const mainContactName = primaryContact?.name || agencyFormData.contactPerson || '';
    const mainEmail = primaryContact?.email || agencyFormData.email || '';

    const payload = {
      name: agencyFormData.name,
      contactPerson: mainContactName,
      email: mainEmail,
      contacts: validContacts,
      commissionRate: agencyFormData.commissionRate,
      commissionAppliesToBonusGuarantee: agencyFormData.commissionAppliesToBonusGuarantee,
      commissionAppliesToSignOnBonus: agencyFormData.commissionAppliesToSignOnBonus,
      monthlyTarget: agencyFormData.monthlyTarget,
      notes: agencyFormData.notes,
      assignedStaffNames: agencyFormData.assignedStaffNames,
      assignedStaffNamesByPosition: (() => {
        const cleaned = Object.fromEntries(
          Object.entries(agencyFormData.assignedStaffNamesByPosition).filter(([, names]) => names.length > 0)
        );
        return Object.keys(cleaned).length > 0 ? cleaned : undefined;
      })()
    };

    if (editingAgency) {
      updateAgency({
        ...editingAgency,
        ...payload
      });
    } else {
      addAgency({
        ...payload,
        active: true
      });
    }

    setIsAgencyModalOpen(false);
  };

  const handleToggleStaffAssignment = (staffName: string) => {
    setAgencyFormData((prev) => {
      const exists = prev.assignedStaffNames.includes(staffName);
      if (exists) {
        return { ...prev, assignedStaffNames: prev.assignedStaffNames.filter((n) => n !== staffName) };
      } else {
        return { ...prev, assignedStaffNames: [...prev.assignedStaffNames, staffName] };
      }
    });
  };

  // ポジション別（BCA/AIX/BRE）の担当者上書きトグル。空にすると、そのポジションは上の「弊社側の
  // 担当リクルーター紐づけ」(assignedStaffNames)にフォールバックする。
  const handleTogglePositionStaffAssignment = (position: string, staffName: string) => {
    setAgencyFormData((prev) => {
      const current = prev.assignedStaffNamesByPosition[position] || [];
      const next = current.includes(staffName) ? current.filter((n) => n !== staffName) : [...current, staffName];
      return { ...prev, assignedStaffNamesByPosition: { ...prev.assignedStaffNamesByPosition, [position]: next } };
    });
  };

  const ALL_NOTIFICATION_KINDS = CHAT_NOTIFICATION_KINDS.map((k) => k.key);

  // Staff Modal Helpers
  const handleOpenAddStaff = () => {
    setEditingStaff(null);
    setStaffFormData({
      name: '',
      department: '人事部',
      role: '採用担当 (リクルーター)',
      email: '',
      chatMentionId: '',
      googleChatWebhooks: []
    });
    setIsStaffModalOpen(true);
  };

  const handleOpenEditStaff = (staff: InternalStaff) => {
    setEditingStaff(staff);
    // 旧・単一Webhook欄に値が残っている場合、ここで新形式の一覧に1件として取り込む（用途を限定して
    // いなかった経緯を尊重し、全通知種別を選択済みの状態にする）。保存すると旧欄はクリアされる。
    const legacyEntry: ChatWebhook[] = staff.googleChatWebhookUrl
      ? [{ id: `wh-legacy-${staff.id}`, url: staff.googleChatWebhookUrl, kinds: ALL_NOTIFICATION_KINDS }]
      : [];
    setStaffFormData({
      name: staff.name,
      department: staff.department,
      role: staff.role,
      email: staff.email || '',
      chatMentionId: staff.chatMentionId || '',
      googleChatWebhooks: [...(staff.googleChatWebhooks || []), ...legacyEntry]
    });
    setIsStaffModalOpen(true);
  };

  const handleAddWebhookRow = () => {
    setStaffFormData((prev) => ({
      ...prev,
      googleChatWebhooks: [
        ...prev.googleChatWebhooks,
        { id: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, url: '', label: '', kinds: ALL_NOTIFICATION_KINDS }
      ]
    }));
  };

  const handleUpdateWebhookRow = (id: string, field: 'url' | 'label', value: string) => {
    setStaffFormData((prev) => ({
      ...prev,
      googleChatWebhooks: prev.googleChatWebhooks.map((wh) => (wh.id === id ? { ...wh, [field]: value } : wh))
    }));
  };

  const handleRemoveWebhookRow = (id: string) => {
    setStaffFormData((prev) => ({
      ...prev,
      googleChatWebhooks: prev.googleChatWebhooks.filter((wh) => wh.id !== id)
    }));
  };

  const handleToggleWebhookKind = (id: string, kind: ChatNotificationKind) => {
    setStaffFormData((prev) => ({
      ...prev,
      googleChatWebhooks: prev.googleChatWebhooks.map((wh) =>
        wh.id === id
          ? { ...wh, kinds: wh.kinds.includes(kind) ? wh.kinds.filter((k) => k !== kind) : [...wh.kinds, kind] }
          : wh
      )
    }));
  };

  // 応募状況ダイジェスト(DAILY/PERIOD_APPLICATIONS_DIGEST)専用の対象採用担当者トグル。未選択(空配列)
  // なら全エージェント対象、1名以上選ぶとその担当者に紐づくエージェントだけに絞り込まれる。
  const handleToggleWebhookDigestStaff = (id: string, staffName: string) => {
    setStaffFormData((prev) => ({
      ...prev,
      googleChatWebhooks: prev.googleChatWebhooks.map((wh) => {
        if (wh.id !== id) return wh;
        const current = wh.digestTargetStaffNames || [];
        return {
          ...wh,
          digestTargetStaffNames: current.includes(staffName)
            ? current.filter((n) => n !== staffName)
            : [...current, staffName]
        };
      })
    }));
  };

  // グループ用Webhook編集ハンドラ（担当者フォームの同名ハンドラと同じ考え方だが、対象はドラフト
  // 配列そのもの。個々の操作はcontextへ即時反映せず、「保存する」ボタンでまとめて確定する）。
  const handleAddGroupWebhookRow = () => {
    setGroupWebhookDraft((prev) => [
      ...prev,
      { id: `gwh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, url: '', label: '', kinds: ALL_NOTIFICATION_KINDS }
    ]);
    setIsGroupWebhookDirty(true);
  };

  const handleUpdateGroupWebhookRow = (id: string, field: 'url' | 'label', value: string) => {
    setGroupWebhookDraft((prev) => prev.map((wh) => (wh.id === id ? { ...wh, [field]: value } : wh)));
    setIsGroupWebhookDirty(true);
  };

  const handleRemoveGroupWebhookRow = (id: string) => {
    setGroupWebhookDraft((prev) => prev.filter((wh) => wh.id !== id));
    setIsGroupWebhookDirty(true);
  };

  const handleToggleGroupWebhookKind = (id: string, kind: ChatNotificationKind) => {
    setGroupWebhookDraft((prev) =>
      prev.map((wh) =>
        wh.id === id
          ? { ...wh, kinds: wh.kinds.includes(kind) ? wh.kinds.filter((k) => k !== kind) : [...wh.kinds, kind] }
          : wh
      )
    );
    setIsGroupWebhookDirty(true);
  };

  // 個人用Webhookのハンドラと同じ考え方（グループ用WebhookはgroupWebhookDraft経由で編集）。
  const handleToggleGroupWebhookDigestStaff = (id: string, staffName: string) => {
    setGroupWebhookDraft((prev) =>
      prev.map((wh) => {
        if (wh.id !== id) return wh;
        const current = wh.digestTargetStaffNames || [];
        return {
          ...wh,
          digestTargetStaffNames: current.includes(staffName)
            ? current.filter((n) => n !== staffName)
            : [...current, staffName]
        };
      })
    );
    setIsGroupWebhookDirty(true);
  };

  const handleSaveGroupWebhooks = () => {
    const validWebhooks = groupWebhookDraft
      .map((wh) => ({ ...wh, url: wh.url.trim(), label: wh.label?.trim() || undefined }))
      .filter((wh) => wh.url.length > 0);
    updateGroupChatWebhooks(validWebhooks);
    setGroupWebhookDraft(validWebhooks);
    setIsGroupWebhookDirty(false);
  };

  const handleCancelGroupWebhookEdits = () => {
    setGroupWebhookDraft(groupChatWebhooks);
    setIsGroupWebhookDirty(false);
  };

  // 選考ポジション編集ハンドラ（グループ用Webhookの同名ハンドラと同じ考え方）。idは追加時に
  // 発番したまま固定 — ラベルを編集(リネーム)しても、既にそのポジション名で登録済みの候補者の
  // jobTitle文字列までは追随して書き換わらない(候補者一覧側は文字列そのものを保持している)。
  const handleAddPositionRow = () => {
    setPositionDraft((prev) => [...prev, { id: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: '' }]);
    setIsPositionDirty(true);
  };

  const handleUpdatePositionRow = (id: string, label: string) => {
    setPositionDraft((prev) => prev.map((p) => (p.id === id ? { ...p, label } : p)));
    setIsPositionDirty(true);
  };

  const handleRemovePositionRow = (id: string) => {
    setPositionDraft((prev) => prev.filter((p) => p.id !== id));
    setIsPositionDirty(true);
  };

  const handleSavePositions = () => {
    // 空欄・前後空白のみは除外。ラベルが重複している場合も、実害は「同じ選考ポジションボタンが
    // 2つ並ぶ」程度で候補者データを壊すものではないため、ブロックはせずそのまま保存する。
    const validPositions = positionDraft
      .map((p) => ({ ...p, label: p.label.trim() }))
      .filter((p) => p.label.length > 0);
    updatePositions(validPositions);
    setPositionDraft(validPositions);
    setIsPositionDirty(false);
  };

  const handleCancelPositionEdits = () => {
    setPositionDraft(positions);
    setIsPositionDirty(false);
  };

  // Staff Submit
  const handleStaffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffFormData.name.trim()) return;

    const validWebhooks = staffFormData.googleChatWebhooks
      .map((wh) => ({ ...wh, url: wh.url.trim(), label: wh.label?.trim() || undefined }))
      .filter((wh) => wh.url.length > 0);

    if (editingStaff) {
      updateStaff({
        ...editingStaff,
        name: staffFormData.name,
        department: staffFormData.department,
        role: staffFormData.role,
        email: staffFormData.email.trim() || undefined,
        chatMentionId: staffFormData.chatMentionId.trim() || undefined,
        googleChatWebhooks: validWebhooks.length > 0 ? validWebhooks : undefined,
        // このフォームから保存した時点で新形式に一本化するため、旧欄はクリアする。
        googleChatWebhookUrl: undefined
      });
    } else {
      addStaff({
        name: staffFormData.name,
        department: staffFormData.department,
        role: staffFormData.role,
        email: staffFormData.email.trim() || undefined,
        chatMentionId: staffFormData.chatMentionId.trim() || undefined,
        googleChatWebhooks: validWebhooks.length > 0 ? validWebhooks : undefined
      });
    }

    setStaffFormData({
      name: '',
      department: '人事部',
      role: '採用担当 (リクルーター)',
      email: '',
      chatMentionId: '',
      googleChatWebhooks: []
    });
    setEditingStaff(null);
    setIsStaffModalOpen(false);
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* Top Banner & Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-lg text-slate-900">エージェント・社内採用担当者マスタ設定</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            紹介会社管理、複数担当者（窓口・RA・CA・契約担当）の登録、手数料設定、社内担当者の紐づけ
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-2 bg-slate-100/70 p-1.5 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveSubTab('agencies')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
              activeSubTab === 'agencies'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>紹介エージェント ({agencies.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('staff')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
              activeSubTab === 'staff'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>弊社採用担当者 ({staffList.length})</span>
          </button>
        </div>
      </div>

      {/* SUB TAB 1: AGENCIES VIEW */}
      {activeSubTab === 'agencies' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              各エージェントの紹介手数料率、担当窓口・複数担当者情報、および紐付けされている弊社採用メンバー
            </p>

            {userRole === 'ADMIN' && (
              <button
                onClick={handleOpenAddAgency}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>新規エージェント追加</span>
              </button>
            )}
          </div>

          {/* Agency Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {agencies.map((agency) => {
              const agencyCandidateCount = candidates.filter((c) => c.agencyId === agency.id).length;
              const acceptedCount = candidates.filter((c) => c.agencyId === agency.id && c.phase === 'OFFER_ACCEPTED').length;
              const assignedStaff = agency.assignedStaffNames && agency.assignedStaffNames.length > 0
                ? agency.assignedStaffNames
                : ['山田 太郎'];
              const contacts = agency.contacts || [
                {
                  id: 'default-1',
                  name: agency.contactPerson || '窓口担当未設定',
                  role: 'メイン窓口',
                  email: agency.email || '',
                  isPrimary: true
                }
              ];

              return (
                <div
                  key={agency.id}
                  className={`bg-white border rounded-2xl p-5 shadow-2xs flex flex-col justify-between transition-all ${
                    agency.active ? 'border-slate-200 hover:border-slate-300' : 'border-slate-200/60 opacity-60'
                  }`}
                >
                  <div>
                    {/* Status & Name */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <span className="font-mono text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded font-bold">{agency.id}</span>
                        <h3 className="font-bold text-base text-slate-900 mt-1">{agency.name}</h3>
                      </div>
                      <button
                        onClick={() => toggleAgencyActive(agency.id)}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer border ${
                          agency.active
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        {agency.active ? '契約中' : '停止中'}
                      </button>
                    </div>

                    {/* General Contract & Target Info */}
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-700 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80 mb-3">
                      <div>
                        <span className="text-[10px] text-slate-500 block">紹介手数料率:</span>
                        <span className="font-bold text-slate-900 text-xs">{agency.commissionRate}%</span>
                        {(agency.commissionAppliesToBonusGuarantee || agency.commissionAppliesToSignOnBonus) && (
                          <span className="block text-[10px] text-slate-500 mt-0.5">
                            （
                            {[
                              agency.commissionAppliesToBonusGuarantee && '賞与保証',
                              agency.commissionAppliesToSignOnBonus && 'サインオンボーナス'
                            ].filter(Boolean).join('・')}
                            も対象）
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">月間目標推薦数:</span>
                        <span className="font-bold text-indigo-600 text-xs">{agency.monthlyTarget}名 / 月</span>
                      </div>
                    </div>

                    {/* Agency Contact Persons List */}
                    <div className="bg-slate-50/90 p-3 rounded-xl border border-slate-200/80 mb-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 border-b border-slate-200/60 pb-1.5">
                        <div className="flex items-center gap-1.5">
                          <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                          <span>エージェント担当者メンバー ({contacts.length}名)</span>
                        </div>
                        {userRole === 'ADMIN' && (
                          <button
                            onClick={() => handleOpenEditAgency(agency)}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer transition-colors"
                          >
                            + 追加・編集
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                        {contacts.map((c) => (
                          <div
                            key={c.id}
                            className="bg-white p-2 rounded-lg border border-slate-200/80 text-[11px] flex flex-col gap-0.5 shadow-2xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 font-bold text-slate-800 truncate">
                                <span>{c.name || '担当者名未設定'}</span>
                                {c.isPrimary && (
                                  <span className="bg-indigo-100 text-indigo-700 border border-indigo-200 text-[9px] px-1 py-0.2 rounded font-mono font-bold shrink-0">
                                    メイン窓口
                                  </span>
                                )}
                              </div>
                              {c.role && (
                                <span className="bg-indigo-50 text-indigo-700 text-[10px] px-1.5 py-0.2 rounded font-medium shrink-0">
                                  {c.role}
                                </span>
                              )}
                            </div>
                            {(c.email || c.phone) && (
                              <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500 font-mono mt-0.5">
                                {c.email && (
                                  <span className="truncate max-w-[170px] flex items-center gap-1" title={c.email}>
                                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span>{c.email}</span>
                                  </span>
                                )}
                                {c.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span>{c.phone}</span>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Linked Company Recruiters */}
                    <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80 mb-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 mb-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                        <span>弊社担当リクルーター:</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {assignedStaff.map((staffName) => (
                          <span
                            key={staffName}
                            className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] px-2 py-0.5 rounded-md font-medium"
                          >
                            {staffName}
                          </span>
                        ))}
                      </div>
                    </div>

                    {agency.notes && (
                      <p className="text-[11px] text-slate-500 italic mb-3 line-clamp-2">
                        "{agency.notes}"
                      </p>
                    )}
                  </div>

                  {/* Bottom Metrics & Edit Action */}
                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px]">
                      <div>累積推薦: <span className="font-bold text-slate-900">{agencyCandidateCount}</span></div>
                      <div>承諾数: <span className="font-bold text-emerald-600">{acceptedCount}</span></div>
                    </div>

                    {userRole === 'ADMIN' && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditAgency(agency)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                          title="編集"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmTarget({ type: 'agency', id: agency.id, name: agency.name })}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB TAB 2: INTERNAL STAFF MANAGEMENT */}
      {activeSubTab === 'staff' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              面接選考やエージェント窓口を担当する社内の採用チーム・マネージャー一覧
            </p>

            {userRole === 'ADMIN' && (
              <button
                onClick={handleOpenAddStaff}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-2xs transition-all cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>新規採用担当者を追加</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {staffList.map((staff) => {
              const assignedCandidatesCount = candidates.filter((c) => c.assignees.includes(staff.name)).length;

              return (
                <div
                  key={staff.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex items-center justify-between hover:border-slate-300 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-sm">
                      {staff.name.slice(0, 1)}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-900 text-sm">{staff.name}</h4>
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-medium">
                          {staff.department}
                        </span>
                        {getAllStaffWebhookUrls(staff).length > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                            <MessageSquare className="w-3 h-3" />
                            Webhook {getAllStaffWebhookUrls(staff).length}件
                          </span>
                        )}
                        {staff.email === driveUserEmail && (
                          <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                            あなた
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{staff.role}</p>
                      <p className="text-[11px] text-indigo-700 font-mono mt-1 font-medium">
                        担当候補者数: <span className="font-bold text-slate-900">{assignedCandidatesCount}名</span>
                      </p>
                    </div>
                  </div>

                  {(userRole === 'ADMIN' || staff.email === driveUserEmail) && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditStaff(staff)}
                        className="p-1.5 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                        title="編集"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {userRole === 'ADMIN' && (
                        <button
                          onClick={() => setDeleteConfirmTarget({ type: 'staff', id: staff.id, name: staff.name })}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 選考ポジションのマスタ設定。候補者登録フォーム・詳細画面・フィルタ全ての選考ポジション
              ボタンの元になる一覧で、Drive共有バックアップ経由で全員に同期される。 */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <div
              onClick={() => setIsPositionCollapsed((prev) => !prev)}
              className="p-4 flex items-center justify-between flex-wrap gap-2 cursor-pointer hover:bg-slate-50/80 transition-colors"
            >
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-indigo-600" />
                  <span>選考ポジション設定</span>
                  {positions.length > 0 && (
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                      {positions.length}件
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  候補者登録フォーム・詳細画面・フィルタで選べる選考ポジションの一覧です。追加・削除・名称変更した内容はDrive経由で全員に反映されます。
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                {userRole === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsPositionCollapsed(false);
                      handleAddPositionRow();
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ポジションを追加</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsPositionCollapsed((prev) => !prev)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 transition-all cursor-pointer"
                  title={isPositionCollapsed ? '展開する' : '折りたたむ'}
                >
                  {isPositionCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {!isPositionCollapsed && (
              <div className="px-4 pb-4 space-y-2">
                {positionDraft.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">未登録</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {positionDraft.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-1 border border-slate-200 rounded-lg bg-slate-50/60 pl-2.5 pr-1 py-1"
                      >
                        <input
                          type="text"
                          placeholder="例: ミドル"
                          value={p.label}
                          onChange={(e) => handleUpdatePositionRow(p.id, e.target.value)}
                          disabled={userRole !== 'ADMIN'}
                          className="bg-transparent text-slate-900 text-xs font-bold w-20 focus:outline-none disabled:text-slate-500"
                        />
                        {userRole === 'ADMIN' && (
                          <button
                            type="button"
                            onClick={() => handleRemovePositionRow(p.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition-colors shrink-0"
                            title="このポジションを削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-slate-500">
                  削除しても、既にそのポジションで登録済みの候補者データからは消えません（一覧に表示されなくなるだけで、候補者詳細画面では引き続き選択済みの値として表示されます）。
                </p>

                {userRole === 'ADMIN' && isPositionDirty && (
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleCancelPositionEdits}
                      className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePositions}
                      className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-2xs transition-all cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>保存する</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* グループ用（複数人が見るスペース宛）Webhook設定。特定の担当者には属さない */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <div
              onClick={() => setIsGroupWebhookCollapsed((prev) => !prev)}
              className="p-4 flex items-center justify-between flex-wrap gap-2 cursor-pointer hover:bg-slate-50/80 transition-colors"
            >
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>グループ通知設定（複数人が見るスペース宛）</span>
                  {groupChatWebhooks.length > 0 && (
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                      {groupChatWebhooks.length}件
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  特定の担当者に紐づかないWebhookを登録します。採用チーム全体のスペースなど、複数人で見ている場所に通知を送りたい場合はこちら。
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                {userRole === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsGroupWebhookCollapsed(false);
                      handleAddGroupWebhookRow();
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Webhookを追加</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsGroupWebhookCollapsed((prev) => !prev)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 transition-all cursor-pointer"
                  title={isGroupWebhookCollapsed ? '展開する' : '折りたたむ'}
                >
                  {isGroupWebhookCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {!isGroupWebhookCollapsed && (
            <div className="px-4 pb-4 space-y-3">
            {groupWebhookDraft.length === 0 ? (
              <p className="text-xs text-slate-400 italic">未登録</p>
            ) : (
              <div className="space-y-2">
                {groupWebhookDraft.map((wh) => (
                  <div key={wh.id} className="border border-slate-200 rounded-lg p-2.5 space-y-1.5 bg-slate-50/60">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="url"
                        placeholder="https://chat.googleapis.com/v1/spaces/..."
                        value={wh.url}
                        onChange={(e) => handleUpdateGroupWebhookRow(wh.id, 'url', e.target.value)}
                        disabled={userRole !== 'ADMIN'}
                        className="flex-1 bg-white border border-slate-300 text-slate-900 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
                      />
                      {userRole === 'ADMIN' && (
                        <button
                          type="button"
                          onClick={() => handleRemoveGroupWebhookRow(wh.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                          title="このURLを削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="ラベル（任意・例: 採用チーム全体スペース）"
                      value={wh.label || ''}
                      onChange={(e) => handleUpdateGroupWebhookRow(wh.id, 'label', e.target.value)}
                      disabled={userRole !== 'ADMIN'}
                      className="w-full bg-white border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1 text-[11px] focus:outline-none focus:border-indigo-400 disabled:bg-slate-100"
                    />
                    <div>
                      <p className="text-[10px] text-slate-500 mb-1">このURLに送る通知の種類:</p>
                      <div className="flex flex-wrap gap-1">
                        {CHAT_NOTIFICATION_KINDS.map((k) => {
                          const active = wh.kinds.includes(k.key);
                          return (
                            <button
                              key={k.key}
                              type="button"
                              title={k.description}
                              disabled={userRole !== 'ADMIN'}
                              onClick={() => handleToggleGroupWebhookKind(wh.id, k.key)}
                              className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-colors ${
                                userRole === 'ADMIN' ? 'cursor-pointer' : 'cursor-default'
                              } ${
                                active
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-slate-500 border-slate-300 hover:border-indigo-300'
                              }`}
                            >
                              {k.label}
                            </button>
                          );
                        })}
                      </div>
                      {wh.kinds.length === 0 && (
                        <p className="text-[10px] text-amber-600 mt-1">
                          通知の種類を1つも選択していないため、このURLには何も届きません。
                        </p>
                      )}
                    </div>
                    {(wh.kinds.includes('DAILY_APPLICATIONS_DIGEST') || wh.kinds.includes('PERIOD_APPLICATIONS_DIGEST')) && (
                      <div className="pt-1.5 border-t border-slate-200">
                        <p className="text-[10px] text-slate-500 mb-1">
                          応募状況ダイジェストの対象採用担当者（未選択なら全員・エージェント紐づけで絞り込み）:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {staffList.map((st) => {
                            const active = (wh.digestTargetStaffNames || []).includes(st.name);
                            return (
                              <button
                                key={st.id}
                                type="button"
                                disabled={userRole !== 'ADMIN'}
                                onClick={() => handleToggleGroupWebhookDigestStaff(wh.id, st.name)}
                                className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-colors ${
                                  userRole === 'ADMIN' ? 'cursor-pointer' : 'cursor-default'
                                } ${
                                  active
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white text-slate-500 border-slate-300 hover:border-emerald-300'
                                }`}
                              >
                                {st.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {userRole === 'ADMIN' && isGroupWebhookDirty && (
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCancelGroupWebhookEdits}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSaveGroupWebhooks}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-2xs transition-all cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>保存する</span>
                </button>
              </div>
            )}
            </div>
            )}
          </div>

        </div>
      )}

      {/* Add / Edit Agency Modal */}
      {isAgencyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl p-6 shadow-xl animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg text-slate-900 mb-4">
              {editingAgency ? 'エージェント情報の編集' : '新規エージェント登録'}
            </h3>

            <form onSubmit={handleAgencySubmit} className="space-y-5 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">エージェント社名 *</label>
                <input
                  type="text"
                  required
                  placeholder="例: D社 (テックヒューマン)"
                  value={agencyFormData.name}
                  onChange={(e) => setAgencyFormData({ ...agencyFormData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              {/* Dynamic Multiple Agency Contacts Section */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <UserPlus className="w-4 h-4 text-indigo-600" />
                      <span>所属エージェント担当者・窓口メンバー登録 (複数登録対応)</span>
                    </h4>
                    <p className="text-[10px] text-slate-500">
                      メイン窓口の他、CA (キャリアアドバイザー)、RA (リクルーティングアドバイザー)、契約担当者などを登録できます
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddContactRow}
                    className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold px-2.5 py-1 rounded-lg transition-all text-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>担当者を追加</span>
                  </button>
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {agencyFormData.contacts.map((contact, idx) => (
                    <div
                      key={contact.id}
                      className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-mono text-[10px] font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                            <input
                              type="radio"
                              name="primaryContactRadio"
                              checked={contact.isPrimary}
                              onChange={() => handleUpdateContactRow(contact.id, 'isPrimary', true)}
                              className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>メイン窓口として設定</span>
                          </label>
                        </div>

                        {agencyFormData.contacts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveContactRow(contact.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                            title="担当者を削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-medium mb-0.5">担当者氏名 *</label>
                          <input
                            type="text"
                            required
                            placeholder="例: 高橋 誠"
                            value={contact.name}
                            onChange={(e) => handleUpdateContactRow(contact.id, 'name', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:bg-white focus:border-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 font-medium mb-0.5">役割・ポジション</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              placeholder="例: RA / キャリアアドバイザー / 契約窓口"
                              value={contact.role || ''}
                              onChange={(e) => handleUpdateContactRow(contact.id, 'role', e.target.value)}
                              className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:bg-white focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 font-medium mb-0.5">メールアドレス</label>
                          <input
                            type="email"
                            placeholder="takahashi@example.com"
                            value={contact.email || ''}
                            onChange={(e) => handleUpdateContactRow(contact.id, 'email', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:bg-white focus:border-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 font-medium mb-0.5">電話番号</label>
                          <input
                            type="text"
                            placeholder="03-1234-5678"
                            value={contact.phone || ''}
                            onChange={(e) => handleUpdateContactRow(contact.id, 'phone', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:bg-white focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">紹介手数料率 (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={agencyFormData.commissionRate}
                    onChange={(e) => setAgencyFormData({ ...agencyFormData, commissionRate: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">月間目標推薦数 (名)</label>
                  <input
                    type="number"
                    min="0"
                    value={agencyFormData.monthlyTarget}
                    onChange={(e) => setAgencyFormData({ ...agencyFormData, monthlyTarget: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Commission Rate Scope: what the fee rate above applies to besides base salary */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                <label className="block text-slate-700 font-medium mb-1">紹介手数料率の対象範囲</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agencyFormData.commissionAppliesToBonusGuarantee}
                    onChange={(e) => setAgencyFormData({ ...agencyFormData, commissionAppliesToBonusGuarantee: e.target.checked })}
                    className="cursor-pointer"
                  />
                  <span>賞与保証額にも手数料率を適用する</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agencyFormData.commissionAppliesToSignOnBonus}
                    onChange={(e) => setAgencyFormData({ ...agencyFormData, commissionAppliesToSignOnBonus: e.target.checked })}
                    className="cursor-pointer"
                  />
                  <span>サインオンボーナス額にも手数料率を適用する</span>
                </label>
              </div>

              {/* Linked Company Recruiters */}
              <div>
                <label className="block text-slate-700 font-medium mb-1.5">
                  弊社側の担当リクルーター紐づけ (複数選択可)
                </label>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 max-h-36 overflow-y-auto">
                  {staffList.map((st) => {
                    const isChecked = agencyFormData.assignedStaffNames.includes(st.name);
                    return (
                      <label
                        key={st.id}
                        className="flex items-center justify-between text-slate-800 hover:bg-slate-100 p-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleStaffAssignment(st.name)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="font-medium text-xs">{st.name}</span>
                          <span className="text-[10px] text-slate-500">({st.department})</span>
                        </div>
                        <span className="text-[10px] text-slate-500">{st.role}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  ポジション別の担当者上書き（任意・応募状況ダイジェスト用）
                </label>
                <p className="text-[11px] text-slate-500 mb-1.5">
                  同じエージェントでもポジションによって窓口の担当者が異なる場合はここで上書きできます。未選択のポジションは上の「弊社側の担当リクルーター紐づけ」がそのまま使われます。
                </p>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                  {DIGEST_OVERRIDE_POSITIONS.map((position) => {
                    const selected = agencyFormData.assignedStaffNamesByPosition[position] || [];
                    return (
                      <div key={position}>
                        <p className="text-[11px] font-bold text-slate-600 mb-1">{position}</p>
                        <div className="flex flex-wrap gap-1">
                          {staffList.map((st) => {
                            const active = selected.includes(st.name);
                            return (
                              <button
                                key={st.id}
                                type="button"
                                onClick={() => handleTogglePositionStaffAssignment(position, st.name)}
                                className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white text-slate-500 border-slate-300 hover:border-indigo-300'
                                }`}
                              >
                                {st.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">メモ・特記事項</label>
                <textarea
                  rows={2}
                  placeholder="得意領域や注意事項など..."
                  value={agencyFormData.notes}
                  onChange={(e) => setAgencyFormData({ ...agencyFormData, notes: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAgencyModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer font-medium"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-2xs cursor-pointer"
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Staff Modal */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl animate-in fade-in zoom-in-95">
            <h3 className="font-bold text-lg text-slate-900 mb-4">
              {editingStaff ? '採用担当者情報の編集' : '新規社内採用担当者の追加'}
            </h3>

            <form onSubmit={handleStaffSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">氏名 *</label>
                <input
                  type="text"
                  required
                  placeholder="例: 佐々木 隆"
                  value={staffFormData.name}
                  onChange={(e) => setStaffFormData({ ...staffFormData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">所属部署 *</label>
                <input
                  type="text"
                  required
                  list="department-list"
                  placeholder="例: 人事部 / 開発部 など（自由入力可）"
                  value={staffFormData.department}
                  onChange={(e) => setStaffFormData({ ...staffFormData, department: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
                />
                <datalist id="department-list">
                  <option value="人事部 (HR)" />
                  <option value="人事部" />
                  <option value="開発部 (Engineering)" />
                  <option value="開発部" />
                  <option value="プロダクト部" />
                  <option value="営業部" />
                  <option value="マーケティング部" />
                  <option value="経営企画室" />
                </datalist>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">役職 / 役割 *</label>
                <input
                  type="text"
                  required
                  list="role-list"
                  placeholder="例: テックリード / 採用リクルーター など（自由入力可）"
                  value={staffFormData.role}
                  onChange={(e) => setStaffFormData({ ...staffFormData, role: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
                />
                <datalist id="role-list">
                  <option value="採用担当 (リクルーター)" />
                  <option value="主担当 (人事)" />
                  <option value="採用責任者 (HR Manager)" />
                  <option value="技術面接官 / エンジニア" />
                  <option value="エンジニアリングマネージャー" />
                  <option value="VPoP / プロダクト責任者" />
                  <option value="営業マネージャー" />
                  <option value="採用アシスタント" />
                </datalist>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Googleログインのメールアドレス（任意）</label>
                <input
                  type="email"
                  placeholder="例: yourname@bloom-firm.com"
                  value={staffFormData.email}
                  onChange={(e) => setStaffFormData({ ...staffFormData, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:bg-white focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  設定すると、このGoogleアカウントでログインした本人が自分の情報を編集できるようになります。
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Google ChatメンションID（任意）</label>
                <input
                  type="text"
                  placeholder="例: 113352777658254482749"
                  value={staffFormData.chatMentionId}
                  onChange={(e) => setStaffFormData({ ...staffFormData, chatMentionId: e.target.value.trim() })}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-3 py-2 font-mono focus:outline-none focus:bg-white focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  設定すると、本人宛の通知（担当アサイン・選考結果確定など）が太字テキストではなく本物の@メンション（Chatに通知が届く）になります。調べ方: Google Chatで自分の名前・アイコンを右クリック→「検証」→<code className="bg-slate-100 px-1 rounded">data-member-id</code>で検索すると<code className="bg-slate-100 px-1 rounded">users/数字列</code>が見つかるので、数字列部分だけを貼り付けてください。
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-700 font-medium">Google Chat Webhook URL（複数登録可・任意）</label>
                  <button
                    type="button"
                    onClick={handleAddWebhookRow}
                    className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>追加</span>
                  </button>
                </div>

                {staffFormData.googleChatWebhooks.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic py-1">未登録（「追加」からURLを登録できます）</p>
                ) : (
                  <div className="space-y-2">
                    {staffFormData.googleChatWebhooks.map((wh) => (
                      <div key={wh.id} className="border border-slate-200 rounded-lg p-2.5 space-y-1.5 bg-slate-50/60">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="url"
                            placeholder="https://chat.googleapis.com/v1/spaces/..."
                            value={wh.url}
                            onChange={(e) => handleUpdateWebhookRow(wh.id, 'url', e.target.value)}
                            className="flex-1 bg-white border border-slate-300 text-slate-900 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveWebhookRow(wh.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="このURLを削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="ラベル（任意・例: 個人スペース / 採用チーム全体 など、自分用の目印）"
                          value={wh.label || ''}
                          onChange={(e) => handleUpdateWebhookRow(wh.id, 'label', e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1 text-[11px] focus:outline-none focus:border-indigo-400"
                        />
                        <div>
                          <p className="text-[10px] text-slate-500 mb-1">このURLに送る通知の種類:</p>
                          <div className="flex flex-wrap gap-1">
                            {CHAT_NOTIFICATION_KINDS.map((k) => {
                              const active = wh.kinds.includes(k.key);
                              return (
                                <button
                                  key={k.key}
                                  type="button"
                                  title={k.description}
                                  onClick={() => handleToggleWebhookKind(wh.id, k.key)}
                                  className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-colors cursor-pointer ${
                                    active
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-slate-500 border-slate-300 hover:border-indigo-300'
                                  }`}
                                >
                                  {k.label}
                                </button>
                              );
                            })}
                          </div>
                          {wh.kinds.length === 0 && (
                            <p className="text-[10px] text-amber-600 mt-1">
                              通知の種類を1つも選択していないため、このURLには何も届きません。
                            </p>
                          )}
                        </div>
                        {(wh.kinds.includes('DAILY_APPLICATIONS_DIGEST') || wh.kinds.includes('PERIOD_APPLICATIONS_DIGEST')) && (
                          <div className="pt-1.5 border-t border-slate-200">
                            <p className="text-[10px] text-slate-500 mb-1">
                              応募状況ダイジェストの対象採用担当者（未選択なら全員・エージェント紐づけで絞り込み）:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {staffList.map((st) => {
                                const active = (wh.digestTargetStaffNames || []).includes(st.name);
                                return (
                                  <button
                                    key={st.id}
                                    type="button"
                                    onClick={() => handleToggleWebhookDigestStaff(wh.id, st.name)}
                                    className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-colors cursor-pointer ${
                                      active
                                        ? 'bg-emerald-600 text-white border-emerald-600'
                                        : 'bg-white text-slate-500 border-slate-300 hover:border-emerald-300'
                                    }`}
                                  >
                                    {st.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[11px] text-slate-500 mt-1">
                  リンクごとに送る通知の種類を選べます。合否確定はチーム全体のスペースへ、新規アサインは自分個人のスペースへ、といった振り分けが可能です。
                </p>

                <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
                  <div className="flex items-center gap-1.5 text-indigo-700 font-semibold text-[11px]">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Webhook URLの取得方法</span>
                  </div>
                  <ol className="mt-1.5 space-y-1 text-[11px] text-slate-600 list-decimal list-inside">
                    <li>Google Chatで、自分宛の通知を受け取るためのスペース（例:「〇〇さんへの通知」）を新規作成する</li>
                    <li>作成したスペースの名前をクリック →「アプリと連携機能」→「Webhookを管理」を開く</li>
                    <li>「Webhookを追加」で名前（例: bloom採用管理）を入力して作成し、発行されたURLをコピーする</li>
                    <li>コピーしたURLをこの欄に貼り付けて保存する</li>
                  </ol>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer font-medium"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-2xs cursor-pointer"
                >
                  {editingStaff ? '更新する' : '追加する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {deleteConfirmTarget.type === 'agency' ? 'エージェントの削除' : '採用担当者の削除'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">本当に削除してもよろしいですか？</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200 font-medium">
              対象: <span className="font-bold text-slate-900">{deleteConfirmTarget.name}</span>
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg cursor-pointer font-medium"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteConfirmTarget.type === 'agency') {
                    deleteAgency(deleteConfirmTarget.id);
                  } else {
                    deleteStaff(deleteConfirmTarget.id);
                  }
                  setDeleteConfirmTarget(null);
                }}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-2xs cursor-pointer"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
