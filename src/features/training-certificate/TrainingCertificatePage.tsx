import { useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentTeacherResource } from './hooks/useCurrentTeacherResource';
import { useIsTrainingManager } from './hooks/useIsTrainingManager';
import { useCertificateGrid, type GridRow } from './hooks/useCertificateGrid';
import { TrainingHeader } from './components/TrainingHeader';
import { TrainingTable } from './components/TrainingTable';
import { RegisterCertificateDialog } from './components/RegisterCertificateDialog';
import { AdminTrainingsPanel } from './components/AdminTrainingsPanel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Skeleton } from '@/components/ui/skeleton';
import type { TrainingType } from './types';

export default function TrainingCertificatePage() {
  const { profile } = useAuth();
  const { data: resource, isLoading: resLoading } = useCurrentTeacherResource();
  const { isManager } = useIsTrainingManager();

  const { types, rows, isLoading } = useCertificateGrid({
    isManager,
    myResourceId: resource?.id ?? null,
    myName: profile?.name ?? '나',
  });

  const [search, setSearch] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [registerFor, setRegisterFor] = useState<{ row: GridRow; type: TrainingType } | null>(null);

  const filteredRows = useMemo(() => {
    if (!search) return rows;
    return rows.filter((r) => r.name.includes(search) || r.label.includes(search));
  }, [rows, search]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 max-w-full relative">
        <TrainingHeader
          isManager={isManager}
          onManageTrainings={() => setManageOpen(true)}
          showSearch={isManager}
          search={search}
          onSearchChange={setSearch}
          count={filteredRows.length}
        />

        {resLoading && (
          <ImprovedCard className="p-6">
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </ImprovedCard>
        )}
        {!resLoading && !resource && !isManager && (
          <ImprovedCard className="p-6">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
              교사 리소스를 찾을 수 없습니다. 관리자에게 문의해주세요.
            </div>
          </ImprovedCard>
        )}
        {!resLoading && (resource || isManager) && (
          <TrainingTable
            types={types}
            rows={filteredRows}
            isLoading={isLoading}
            showTeacherColumn={isManager}
            onRegister={(row, type) => setRegisterFor({ row, type })}
          />
        )}

        <RegisterCertificateDialog
          open={!!registerFor}
          onOpenChange={(v) => { if (!v) setRegisterFor(null); }}
          trainingType={registerFor?.type ?? null}
          resourceId={registerFor?.row.resourceId ?? null}
        />

        <Dialog open={manageOpen} onOpenChange={setManageOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>연수 종류 관리</DialogTitle></DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto">
              <AdminTrainingsPanel />
            </div>
          </DialogContent>
        </Dialog>

        {/* Background Pattern */}
        <div className="absolute inset-0 z-[-1] opacity-[0.3] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
      </div>
    </Layout>
  );
}
