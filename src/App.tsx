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
import { SelfRegistrationPrompt } from './components/SelfRegistrationPrompt';

const MainContent: React.FC = () => {
  const { activeTab, isBootstrapping } = useATS();

  // タブ切り替え時、直前のタブでスクロールしていた位置がそのまま持ち越されてしまい、新しい
  // タブの内容が少しスクロールした状態で表示されてしまう不具合があったため、タブが変わるたび
  // ページ最上部へ戻す。
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  // Nothing real to show yet on this brand-new browser (no local data was found, and Drive
  // hasn't answered yet) — wait rather than flash an empty pipeline that a second later gets
  // replaced by the real one.
  if (isBootstrapping) {
    return (
      <main className="flex-1 flex items-center justify-center py-24">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Driveからデータを読み込み中...
        </div>
      </main>
    );
  }

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

export default function App() {
  return (
    <AuthGate>
      <ATSProvider>
        <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white antialiased">
          <Header />
          <SelfRegistrationPrompt />
          <MainContent />
          <CandidateDetailModal />
          <CandidateFormModal />
          <DriveSyncPreviewModal />
          <ToastContainer />
        </div>
      </ATSProvider>
    </AuthGate>
  );
}
