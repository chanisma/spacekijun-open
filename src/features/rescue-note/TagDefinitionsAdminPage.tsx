import { Layout } from '@/components/layout/Layout';
import { Header } from './components/layout/Header';
import { useRescueAccess } from './hooks/useRescueAccess';
import { TagDefinitionsAdmin } from './components/admin/TagDefinitionsAdmin';

export default function TagDefinitionsAdminPage() {
  const access = useRescueAccess();

  if (!access.canManageTagDefinitions) {
    return (
      <Layout>
        <div className="p-8 text-center text-muted-foreground">
          태그 카테고리 관리는 업무담당자(staff_admin) 또는 관리자만 가능합니다.
        </div>
      </Layout>
    );
  }

  return (
    <Layout fullWidth>
      <div className="flex flex-col h-full min-h-full bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <Header selectedStudent={null} showDashboardLink={false} />
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <TagDefinitionsAdmin />
        </div>
      </div>
    </Layout>
  );
}
