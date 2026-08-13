import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useATS } from '../context/ATSContext';
import { InternalStaff } from '../types';

// Blocking gate: Googleでログイン済み（bloom-firm.comドメイン）だが担当者マスタに自分のレコード
// がまだない人は、氏名・所属を登録するまでアプリ本体（children）を一切利用できない。以前は
// スキップ可能な非ブロッキングのバナーだったが、「担当者マスタに登録されていない=面接官アサイン
// や通知の宛先として存在しない」状態のまま使われ続けるのを防ぐため、必須化した。
export const SelfRegistrationGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { driveUserEmail, myStaffRecord, staffList, addStaff, updateStaff } = useATS();

  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  // 管理者が先んじて手動登録した（メールアドレス未設定の）担当者と氏名が一致するレコードが1件だけ
  // 見つかった場合、新規レコードを作らずそちらへ統合してよいか本人に確認するための一時状態。
  // 統合しないと、webhook設定や面接官アサインの名前検索が新旧どちらのレコードを拾うか
  // 不定になり、通知が届かない・面接官として認識されない等の齟齬につながるため。
  const [matchCandidate, setMatchCandidate] = useState<InternalStaff | null>(null);

  if (!driveUserEmail || myStaffRecord) {
    return <>{children}</>;
  }

  const registerAsNew = () => {
    addStaff({
      name: name.trim(),
      department: department.trim(),
      role: '採用担当 (リクルーター)',
      email: driveUserEmail
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !department.trim()) return;

    // 氏名が完全一致し、かつメール未登録のレコードが1件だけあれば「同一人物の可能性が高い」と
    // 判断し、確認画面を挟んでから統合する。2件以上ヒットした場合はどちらを本人とすべきか
    // 断定できないため、確認を挟まず新規登録にフォールバックする。
    const unclaimedMatches = staffList.filter((s) => !s.email && s.name.trim() === name.trim());
    if (unclaimedMatches.length === 1) {
      setMatchCandidate(unclaimedMatches[0]);
      return;
    }

    registerAsNew();
  };

  const handleConfirmMerge = () => {
    if (!matchCandidate || !driveUserEmail) return;
    updateStaff({ ...matchCandidate, email: driveUserEmail });
    setMatchCandidate(null);
  };

  const handleRejectMerge = () => {
    registerAsNew();
    setMatchCandidate(null);
  };

  if (matchCandidate) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <UserPlus className="w-8 h-8 text-indigo-600 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-900 mb-1">既存レコードの確認</h1>
          <p className="text-sm text-slate-600 mb-6">
            「{matchCandidate.name}」（{matchCandidate.department}）として既に登録されているようです。この情報にご自身のGoogleアカウント（{driveUserEmail}）を統合しますか？
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleConfirmMerge}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              はい、統合する
            </button>
            <button
              type="button"
              onClick={handleRejectMerge}
              className="w-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
            >
              いいえ、別人として新規登録する
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="text-center mb-6">
          <UserPlus className="w-8 h-8 text-indigo-600 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-900 mb-1">採用担当者として登録</h1>
          <p className="text-sm text-slate-500">
            {driveUserEmail} さんはまだ担当者マスタに登録されていません。氏名・所属部署を入力して登録すると、アプリを利用できるようになります。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">氏名</label>
            <input
              type="text"
              required
              autoFocus
              placeholder="例: 山田 太郎"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">所属部署</label>
            <input
              type="text"
              required
              list="self-register-department-list"
              placeholder="所属部署を入力"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
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
          </div>

          <button
            type="submit"
            className="mt-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            登録する
          </button>
        </form>
      </div>
    </div>
  );
};
