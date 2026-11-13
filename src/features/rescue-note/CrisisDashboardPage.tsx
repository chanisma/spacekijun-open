import { Layout } from '@/components/layout/Layout';
import { Header } from './components/layout/Header';
import { useRescueAccess } from './hooks/useRescueAccess';
import { CrisisDashboardContent } from './components/overview/CrisisDashboardContent';

export default function CrisisDashboardPage() {
  const access = useRescueAccess();

  if (!access.canAccessDashboard) {
    return (
      <Layout>
        <div className="p-8 text-center text-muted-foreground">
          이 메뉴는 담임교사·상담교사·업무담당자만 접근할 수 있습니다.
        </div>
      </Layout>
    );
  }

  return (
    <Layout fullWidth>
      <div className="flex flex-col h-full min-h-full bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <Header selectedStudent={null} showDashboardLink={false} />
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-3 mb-5 px-6 pt-6">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0"></span>
              위기 관리 현황
            </h2>
          </div>
          <CrisisDashboardContent />
        </div>
      </div>
    </Layout>
  );
}
