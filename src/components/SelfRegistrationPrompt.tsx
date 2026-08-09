import React, { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { useATS } from '../context/ATSContext';

// 非ブロッキングのバナー: Googleでログイン済みだが担当者マスタに自分のレコードがまだない人に、
// 自分で氏名・所属を入力して採用担当者として登録してもらうための入り口。閉じてもアプリの利用は
// 妨げない。sessionStorageで閉じた状態を管理しているのは、次回ログイン（新しいセッション）では
// また案内し直したいため（永久に非表示にはしない）。
export const SelfRegistrationPrompt: React.FC = () => {
  const { driveUserEmail, myStaffRecord, addStaff } = useATS();

  const dismissKey = driveUserEmail ? `ats_self_register_dismissed_${driveUserEmail}` : '';
  const [dismissed, setDismissed] = useState(() => (dismissKey ? sessionStorage.getItem(dismissKey) === '1' : true));
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('人事部');

  if (!driveUserEmail || myStaffRecord || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    if (dismissKey) sessionStorage.setItem(dismissKey, '1');
    setDismissed(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !department.trim()) return;
    addStaff({
      name: name.trim(),
      department: department.trim(),
      role: '採用担当 (リクルーター)',
      email: driveUserEmail
    });
  };

  return (
    <div className="w-full bg-indigo-50 border-b border-indigo-100">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 text-indigo-800 text-xs font-semibold shrink-0">
            <UserPlus className="w-4 h-4" />
            <span>{driveUserEmail} さん、採用担当者として登録しますか？</span>
          </div>

          <input
            type="text"
            required
            placeholder="氏名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-white border border-indigo-200 text-slate-900 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 w-32"
          />
          <input
            type="text"
            required
            list="self-register-department-list"
            placeholder="所属部署"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="bg-white border border-indigo-200 text-slate-900 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 w-32"
          />
          <datalist id="self-register-department-list">
            <option value="人事部 (HR)" />
            <option value="人事部" />
            <option value="開発部 (Engineering)" />
            <option value="開発部" />
            <option value="プロダクト部" />
            <option value="営業部" />
            <option value="マーケティング部" />
            <option value="経営企画室" />
          </datalist>

          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-2xs transition-all cursor-pointer"
          >
            登録する
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-600 text-xs px-2 py-1.5 cursor-pointer ml-auto"
          >
            <X className="w-3.5 h-3.5" />
            あとで
          </button>
        </form>
      </div>
    </div>
  );
};
