import React, { useState } from 'react';
import {
  Users,
  Kanban,
  ListFilter,
  BarChart3,
  Building2,
  Plus,
  Download,
  RotateCcw,
  Search,
  ShieldAlert,
  UserCheck,
  Sparkles,
  Archive,
  HardDrive,
  UploadCloud,
  DownloadCloud,
  LogOut,
  ChevronDown,
  RefreshCw
} from 'lucide-react';
import { useATS, ActiveTab } from '../context/ATSContext';
import { UserRole } from '../types';
import { AttentionPanel } from './AttentionPanel';

export const Header: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    userRole,
    setUserRole,
    setIsAddModalOpen,
    filters,
    setFilters,
    exportCSV,
    resetToDefaultData,
    filteredCandidates,
    archivedCandidates,
    candidates,
    driveAccessToken,
    driveUserEmail,
    isDriveConnecting,
    connectDrive,
    disconnectDrive,
    backupToDrive,
    restoreFromDrive,
    isSyncingDrive,
    syncWithDrive
  } = useATS();

  const [isDriveMenuOpen, setIsDriveMenuOpen] = useState(false);

  const joiningScheduledCount = candidates.filter(
    (c) => c.joiningDate || c.phase === 'OFFER_ACCEPTED' || c.phase === 'OFFER_ISSUED'
  ).length;
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, searchQuery: e.target.value }));
  };

  return (
    <header className="bg-white text-slate-800 border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Bar */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & System Title */}
          <div>
            <h1 className="font-bold text-xl text-slate-900 tracking-tight flex items-center gap-1.5">
              <span className="text-slate-900 font-extrabold">bloom</span>
              <span className="text-slate-800 font-semibold text-base">採用管理</span>
            </h1>
          </div>

          {/* Center Area: Quick Search */}
          <div className="flex-1 max-w-md mx-auto hidden sm:block">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="候補者名、学歴、現職、職種で検索..."
                value={filters.searchQuery}
                onChange={handleSearchChange}
                className="w-full pl-9 pr-4 py-2 bg-slate-100/90 text-slate-800 placeholder-slate-400 text-xs sm:text-sm rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
              />
              {filters.searchQuery && (
                <button
                  onClick={() => setFilters((prev) => ({ ...prev, searchQuery: '' }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs bg-slate-200 px-1.5 py-0.5 rounded cursor-pointer"
                >
                  クリア
                </button>
              )}
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Google Drive Connect / Backup Menu */}
            <div className="relative">
              {driveAccessToken ? (
                <button
                  onClick={() => setIsDriveMenuOpen((v) => !v)}
                  title={`Drive連携中: ${driveUserEmail || ''}`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer text-xs font-bold"
                >
                  <span className="relative flex items-center">
                    <HardDrive className="w-4 h-4" />
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="hidden md:inline">Drive連携中</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={connectDrive}
                  disabled={isDriveConnecting}
                  title="Google Driveと連携してバックアップ・議事録取込を有効化"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer text-xs font-bold disabled:opacity-50"
                >
                  <HardDrive className="w-4 h-4" />
                  <span className="hidden md:inline">{isDriveConnecting ? '接続中...' : 'Drive連携'}</span>
                </button>
              )}

              {isDriveMenuOpen && driveAccessToken && (
                <div className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden">
                  <div className="px-3 py-2 text-[11px] text-slate-500 border-b border-slate-100 truncate">
                    {driveUserEmail}
                  </div>
                  <button
                    onClick={() => { backupToDrive(); setIsDriveMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-indigo-600" />
                    Driveにバックアップ
                  </button>
                  <button
                    onClick={() => { restoreFromDrive(); setIsDriveMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <DownloadCloud className="w-3.5 h-3.5 text-indigo-600" />
                    Driveから復元
                  </button>
                  <button
                    onClick={() => { syncWithDrive(); setIsDriveMenuOpen(false); }}
                    disabled={isSyncingDrive}
                    title="Drive上で直接追加・移動されたレジュメを検知し、フェーズ更新や未登録候補者の取込を行います"
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isSyncingDrive ? 'animate-spin' : ''}`} />
                    {isSyncingDrive ? 'Drive同期中...' : 'Driveと同期'}
                  </button>
                  <button
                    onClick={() => { disconnectDrive(); setIsDriveMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 cursor-pointer border-t border-slate-100"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    連携を解除
                  </button>
                </div>
              )}
            </div>

            <AttentionPanel />

            <button
              onClick={exportCSV}
              title="CSVエクスポート"
              className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={resetToDefaultData}
              title="初期デモデータにリセット"
              className="p-1.5 text-slate-400 hover:text-amber-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="border-t border-slate-200 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between overflow-x-auto no-scrollbar">
          <nav className="flex items-end space-x-4 sm:space-x-6">
            {[
              { tab: 'kanban' as ActiveTab, icon: Kanban, label: '選考サマリ', count: filteredCandidates.length, primary: true },
              { tab: 'list' as ActiveTab, icon: ListFilter, label: '候補者一覧テーブル', primary: true },
              { tab: 'recruitment_meeting' as ActiveTab, icon: Users, label: '採用MTG', primary: true },
              { tab: 'dashboard' as ActiveTab, icon: BarChart3, label: '分析ダッシュボード' },
              { tab: 'onboarding' as ActiveTab, icon: UserCheck, label: '入社予定者管理', count: joiningScheduledCount || undefined },
              { tab: 'archived' as ActiveTab, icon: Archive, label: '過去候補者一覧', count: archivedCandidates.length || undefined },
              { tab: 'agency_master' as ActiveTab, icon: Building2, label: 'エージェントマスタ' }
            ].map(({ tab, icon: Icon, label, count, primary }) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 whitespace-nowrap cursor-pointer border-b-2 transition-colors ${
                  primary ? 'py-3 text-sm sm:text-base' : 'py-2.5 text-xs sm:text-sm'
                } ${
                  activeTab === tab
                    ? `text-indigo-600 border-indigo-600 ${primary ? 'font-bold' : 'font-semibold'}`
                    : `border-transparent ${primary ? 'text-slate-700 hover:text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-800 font-medium'}`
                }`}
              >
                {Icon && <Icon className={primary ? 'w-5 h-5' : 'w-4 h-4'} />}
                <span>{label}</span>
                {count !== undefined && (
                  <span className={`${primary ? 'text-xs px-2' : 'text-[11px] px-1.5'} rounded-full font-mono ${
                    activeTab === tab ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Quick counts indicator */}
          <div className="hidden lg:flex items-center gap-4 text-xs text-slate-500 py-2 border-l border-slate-200 pl-4">
            <div>全候補者: <span className="font-semibold text-slate-800">{candidates.length}名</span></div>
            <div>選考中: <span className="font-semibold text-slate-800">{candidates.filter(c => !['OFFER_ACCEPTED', 'REJECTED_DECLINED'].includes(c.phase)).length}名</span></div>
          </div>
        </div>
      </div>

      {/* Prominent Action Bar directly below dashboard selection tabs */}
      <div className="bg-slate-50 border-t border-slate-200 py-2.5 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-center">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm sm:text-base px-6 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>新規候補者を登録</span>
          </button>
        </div>
      </div>
    </header>
  );
};
