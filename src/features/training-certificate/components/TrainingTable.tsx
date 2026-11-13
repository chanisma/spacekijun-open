import { ImprovedCard } from '@/components/ui/improved-card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, CheckCircle2 } from 'lucide-react';
import { formatDate } from '../utils/format';
import { trainingCertificateService } from '../services/trainingCertificateService';
import { toast } from '@/hooks/use-toast';
import type { GridRow } from '../hooks/useCertificateGrid';
import type { TrainingType } from '../types';

interface Props {
  types: TrainingType[];
  rows: GridRow[];
  isLoading: boolean;
  showTeacherColumn: boolean;
  onRegister: (row: GridRow, type: TrainingType) => void;
}

export function TrainingTable({ types, rows, isLoading, showTeacherColumn, onRegister }: Props) {
  const openFile = async (path: string | null) => {
    if (!path) return;
    try {
      const url = await trainingCertificateService.getFileSignedUrl(path, 600);
      window.open(url, '_blank'); // 새 창에 연결
    } catch (e) {
      toast({ title: '파일 열기 실패', description: e instanceof Error ? e.message : '알 수 없는 오류', variant: 'destructive' });
    }
  };

  const colSpan = types.length + (showTeacherColumn ? 1 : 0);

  return (
    <ImprovedCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
              {showTeacherColumn && (
                <TableHead className="text-xs font-semibold text-slate-500">이름</TableHead>
              )}
              {types.map((t) => (
                <TableHead key={t.id} className="text-xs font-semibold text-slate-500">
                  {t.name} <span className="font-normal text-slate-400">({t.category_label})</span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">표시할 교원이 없습니다.</TableCell></TableRow>
            )}
            {!isLoading && rows.map((row) => (
              <TableRow key={row.resourceId} className="hover:bg-slate-50/50 transition-colors">
                {showTeacherColumn && (
                  <TableCell className="font-medium text-slate-700">
                    {row.name}
                    {row.label && <span className="ml-1.5 text-xs text-slate-400">{row.label}</span>}
                  </TableCell>
                )}
                {types.map((t) => {
                  const cert = row.byType[t.id];
                  return (
                    <TableCell key={t.id} className="min-w-[150px]">
                      {cert ? (
                        <button
                          onClick={() => openFile(cert.file_path)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-green-100 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 disabled:hover:bg-green-50"
                          disabled={!cert.file_path}
                          title={cert.file_name ?? ''}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>등록</span>
                          <span className="font-normal text-green-600/70">{formatDate(cert.submitted_at)}</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">미등록</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 bg-white/50 border-slate-200 hover:bg-white hover:border-blue-300 hover:text-blue-600 text-xs transition-all"
                            onClick={() => onRegister(row, t)}
                          >
                            <Plus className="h-3.5 w-3.5" /> 등록
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </ImprovedCard>
  );
}
