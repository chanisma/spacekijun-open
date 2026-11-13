/**
 * 운영 시간표(기간 한정 임시 시간표) 목록 — 만들기 · 끄고 켜기 · 지우기.
 * 끄기(archived)는 기록을 남긴 채 판정에서만 빠진다. 지우기는 칸까지 사라져 되돌릴 수 없다.
 */
import { useState } from 'react';
import { CalendarClock, Loader2, Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import { TIMETABLE_OVERRIDE_KIND_LABEL } from '@/lib/timetableOverride';
import {
  deleteTimetableOverride,
  listTimetableOverrides,
  updateTimetableOverride,
  type TimetableOverride,
} from '@/services/timetableOverrideService';
import { TimetableOverrideUploadDialog } from './TimetableOverrideUploadDialog';

interface Props {
  academicYear: number | null;
  semester: number | null;
}

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

function phaseOf(o: TimetableOverride, today: string) {
  if (o.status === 'archived') return { label: '꺼짐', className: 'bg-slate-100 text-slate-600' };
  if (today < o.start_date) return { label: '예정', className: 'bg-slate-100 text-slate-700' };
  if (today > o.end_date) return { label: '끝남', className: 'bg-slate-100 text-slate-500' };
  return { label: '적용 중', className: 'bg-blue-100 text-blue-700' };
}

export function TimetableOverridePanel({ academicYear, semester }: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<TimetableOverride | null>(null);
  const today = kstToday();

  const { data: overrides = [], isLoading } = useQuery({
    queryKey: ['timetable-override', 'list'],
    queryFn: listTimetableOverrides,
  });

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['timetable-override'] });
    await queryClient.invalidateQueries({ queryKey: ['timetable-data'] });
    await queryClient.invalidateQueries({ queryKey: ['today-timetable'] });
  };

  const toggle = useMutation({
    mutationFn: (o: TimetableOverride) =>
      updateTimetableOverride(o.id, { status: o.status === 'active' ? 'archived' : 'active' }),
    onSuccess: refreshAll,
    onError: (e) => toast.error(e instanceof Error ? e.message : '바꾸지 못했습니다'),
  });

  const remove = useMutation({
    mutationFn: (o: TimetableOverride) => deleteTimetableOverride(o.id),
    onSuccess: async (_d, o) => {
      setDeleting(null);
      toast.success(`«${o.title}» 을(를) 지웠습니다`);
      await refreshAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '지우지 못했습니다'),
  });

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              운영 시간표
            </CardTitle>
            <CardDescription className="mt-1">
              시험 기간·수능 대비·특수 교육과정처럼 기간 동안만 바뀌는 임시 시간표. 기간 안에는 대상 학년의 정규 수업 대신
              교사 시간표·오늘의 시간표·대체 교사·결강 알림에 쓰이고, 정규 시간표(아래)는 기록으로 그대로 남습니다.
            </CardDescription>
          </div>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            disabled={academicYear == null || semester == null}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            운영 시간표 만들기
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : overrides.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">아직 운영 시간표가 없습니다.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {overrides.map((o) => {
              const phase = phaseOf(o, today);
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 truncate font-medium" title={o.title}>{o.title}</span>
                      <Badge variant="secondary" className={phase.className}>{phase.label}</Badge>
                      <Badge variant="outline" className="text-[11px]">{TIMETABLE_OVERRIDE_KIND_LABEL[o.kind] ?? o.kind}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {o.start_date} ~ {o.end_date} · {o.grades ? `${o.grades.join('·')}학년` : '전 학년'} · {o.slot_count ?? 0}칸 ·{' '}
                      {o.academic_year}학년도 {o.semester}학기
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate(o)}
                    >
                      {o.status === 'active' ? '끄기' : '다시 켜기'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => setDeleting(o)}
                    >
                      지우기
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {academicYear != null && semester != null && (
        <TimetableOverrideUploadDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          academicYear={academicYear}
          semester={semester}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>운영 시간표를 지울까요?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleting?.title}» 의 칸 {deleting?.slot_count ?? 0}개가 함께 지워지고 되돌릴 수 없습니다.
              기록을 남기려면 지우지 말고 [끄기]를 쓰세요. 정규 시간표는 어느 쪽이든 그대로입니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) remove.mutate(deleting);
              }}
            >
              지우기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
