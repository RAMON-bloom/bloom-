import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ATSProvider, useATS } from './context/ATSContext';
import { Header } from './components/Header';
import { KanbanView } from './components/KanbanView';
import { ListView } from './components/ListView';
import { DashboardView } from './components/DashboardView';
import { OnboardingView } from './components/OnboardingView';
import { AgencyMasterView } from './components/AgencyMasterView';
import { ArchivedListView } from './components/ArchivedListView';
import { RecruitmentMeetingView } from './components/RecruitmentMeetingView';
import { CandidateDetailModal } from './components/CandidateDetailModal';
import { CandidateFormModal } from './components/CandidateFormModal';
import { DriveSyncPreviewModal } from './components/DriveSyncPreviewModal';
import { ToastContainer } from './components/ToastContainer';
import { AuthGate } from './components/AuthGate';
import { SelfRegistrationGate } from './components/SelfRegistrationGate';

const MainContent: React.FC = () => {
  const { activeTab } = useATS();

  // タブ切り替え時、直前のタブでスクロールしていた位置がそのまま持ち越されてしまい、新しい
  // タブの内容が少しスクロールした状態で表示されてしまう不具合があったため、タブが変わるたび
  // ページ最上部へ戻す。
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  return (
    <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {activeTab === 'kanban' && <KanbanView />}
      {activeTab === 'list' && <ListView />}
      {activeTab === 'recruitment_meeting' && <RecruitmentMeetingView />}
      {activeTab === 'dashboard' && <DashboardView />}
      {activeTab === 'onboarding' && <OnboardingView />}
      {activeTab === 'archived' && <ArchivedListView />}
      {activeTab === 'agency_master' && <AgencyMasterView />}
    </main>
  );
};

// SelfRegistrationGateはstaffList（Driveから復元される）を見て「登録済みか」を判定するので、
// 復元がまだ済んでいない間にそれを評価すると、既に登録済みの人にも一瞬「未登録」の登録フォーム
// が誤表示されてしまう。isBootstrappingが解消するまではゲートごと出さず、ローディングだけ出す。
const AppShell: React.FC = () => {
  const { isBootstrapping } = useATS();

  if (isBootstrapping) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Driveからデータを読み込み中...
        </div>
      </div>
    );
  }

  return (
    <SelfRegistrationGate>
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white antialiased">
        <Header />
        <MainContent />
        <CandidateDetailModal />
        <CandidateFormModal />
        <DriveSyncPreviewModal />
        <ToastContainer />
      </div>
    </SelfRegistrationGate>
  );
};

export default function App() {
  return (
    <AuthGate>
      <ATSProvider>
        <AppShell />
      </ATSProvider>
    </AuthGate>
  );
}
