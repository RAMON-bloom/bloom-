import React from 'react';
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
import { ToastContainer } from './components/ToastContainer';
import { AuthGate } from './components/AuthGate';
import { SelfRegistrationPrompt } from './components/SelfRegistrationPrompt';

const MainContent: React.FC = () => {
  const { activeTab } = useATS();

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
          <ToastContainer />
        </div>
      </ATSProvider>
    </AuthGate>
  );
}
