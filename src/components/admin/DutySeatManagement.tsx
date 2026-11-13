// ========================================
// 업무분장 관리 (Admin "업무분장")
// 학년도별 분장 자리(부서·업무 영역·에듀파인 단위과제)와 담당자(기간·정/부).
// 첫 자료 = 업무 지도 artifact(2026-09-22) — scripts/duty-seat-seed.
// 부장·교장·교감도 자리의 종류로 표현한다. 권한 태그(`부장` 등)는 건드리지 않고 차이만 보여 준다.
// ========================================

import { useMemo, useState } from 'react';
import { AlertTriangle, Briefcase, Copy, Pencil, Plus } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import { useDepartments } from '@/hooks/useDepartments';
import { useResourceSelect } from '@/hooks/useResourceSelect';
import {
  useCopyDutySeats,
  useDeleteDutySeat,
  useDutySeatYears,
  useDutySeats,
  useHeadTagHolderIds,
  useSaveDutySeat,
} from '@/hooks/useDutySeats';
import {
  DUTY_SEAT_KIND_LABEL,
  activeHolders,
  compareHeadsWithTag,
  formatHolderPeriod,
  isHolderActive,
  referenceDateForYear,
  type DutySeat,
} from '@/lib/dutySeats';
import { cn } from '@/lib/utils';
import { DutySeatEditDialog } from './DutySeatEditDialog';

const KIND_TONE: Record<DutySeat['kind'], string> = {
  admin: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  head: 'bg-blue-50 text-blue-700 border-blue-200',
  duty: 'bg-slate-50 text-slate-600 border-slate-200',
  support: 'bg-slate-50 text-slate-500 border-slate-200',
};

export function DutySeatManagement() {
  const { data: academicTerm } = useAcademicTerm();
  const baseYear = academicTerm?.year ?? new Date().getFullYear();
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const year = pickedYear ?? baseYear;

  const { data: years = [] } = useDutySeatYears();
  const { data: seats = [], isLoading } = useDutySeats(year);
  const { data: previousSeats = [] } = useDutySeats(year - 1);
  const { data: headTagIds = [] } = useHeadTagHolderIds();
  const { departmentObjects } = useDepartments({ source: 'database', category: 'school' });
  const { items: people } = useResourceSelect({ resourceType: ['teacher', 'staff'] });

  const saveSeat = useSaveDutySeat();
  const deleteSeat = useDeleteDutySeat();
  const copySeats = useCopyDutySeats();

  const [editing, setEditing] = useState<{ seat: DutySeat | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DutySeat | null>(null);

  const refDate = referenceDateForYear(year);
  const yearOptions = useMemo(
    () => [...new Set([...years, baseYear, baseYear + 1, year])].sort((a, b) => b - a),
    [years, baseYear, year],
  );

  const deptById = useMemo(
    () => new Map(departmentObjects.map((d) => [d.id, d])),
    [departmentObjects],
  );

  // 부서 순서대로 묶는다. 부서 없는 관리자 자리(교장·교감)는 맨 앞, 나머지 부서 없음은 맨 뒤.
  const groups = useMemo(() => {
    const map = new Map<string, DutySeat[]>();
    for (const seat of seats) {
      const key = seat.department_id ?? (seat.kind === 'admin' ? '__admin__' : '__none__');
      map.set(key, [...(map.get(key) ?? []), seat]);
    }
    const order = (key: string) =>
      key === '__admin__' ? -1 : key === '__none__' ? 9999 : deptById.get(key)?.display_order ?? 5000;
    return [...map.entries()]
      .sort((a, b) => order(a[0]) - order(b[0]))
      .map(([key, list]) => ({
        key,
        label: key === '__admin__' ? '관리자' : key === '__none__' ? '부서 미지정' : deptById.get(key)?.name ?? '(삭제된 부서)',
        seats: list,
      }));
  }, [seats, deptById]);

  const stats = useMemo(() => {
    let vacant = 0;
    let unlinked = 0;
    for (const seat of seats) {
      const active = activeHolders(seat, refDate);
      if (active.length === 0 && seat.kind !== 'support') vacant += 1;
      unlinked += active.filter((h) => !h.resource_id).length;
    }
    return { total: seats.length, vacant, unlinked };
  }, [seats, refDate]);

  // 정합 점검 — 행정실장은 `부장` 태그 대상이 아니므로 뺀다
  const consistency = useMemo(() => {
    const comparable = seats.filter((s) => deptById.get(s.department_id ?? '')?.name !== '행정실');
    return compareHeadsWithTag(comparable, headTagIds, refDate);
  }, [seats, headTagIds, refDate, deptById]);
  const nameOf = (id: string) => people.find((p) => p.value === id)?.label ?? id.slice(0, 8);
  const showConsistency =
    year === baseYear && seats.length > 0 && (consistency.seatOnly.length > 0 || consistency.tagOnly.length > 0);

  const handleCopy = () => {
    copySeats.mutate(
      { fromYear: year - 1, toYear: year, keepHolders: true },
      {
        onSuccess: (count) => toast.success(`${year - 1}학년도 분장 자리 ${count}개를 복사했습니다. 바뀐 담당자만 고치면 됩니다.`),
        onError: (e: Error) => toast.error(`복사하지 못했습니다: ${e.message}`),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">업무분장</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            학년도마다 분장 자리와 담당자를 둡니다. 할 일의 대상을 "정보화부장", "고사·성적처리 담당"처럼
            자리로 고르면 사람이 바뀌어도 그대로 이어집니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setPickedYear(Number(v))}>
            <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="학년도"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}학년도</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 gap-1 bg-blue-600 text-xs hover:bg-blue-700" onClick={() => setEditing({ seat: null })}>
            <Plus className="h-3.5 w-3.5" />
            자리 추가
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <StatPill label="자리" value={stats.total} />
        <StatPill label="공석" value={stats.vacant} tone={stats.vacant > 0 ? 'warn' : undefined} />
        <StatPill label="미연결 담당자" value={stats.unlinked} tone={stats.unlinked > 0 ? 'danger' : undefined} />
        <span className="self-center text-slate-400">기준일 {refDate}</span>
      </div>

      {showConsistency && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            부장 자리와 `부장` 태그가 다릅니다
          </div>
          <p className="mt-1 text-xs text-amber-700">
            권한(위기 노트·선택과목 등)은 태그를 읽고, 할 일 대상은 분장 자리를 읽습니다. 의도한 차이가 아니면
            태그 관리에서 맞춰 주세요.
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-amber-900">
            {consistency.seatOnly.map((s) => (
              <li key={s.resourceId}>· {s.name} — {s.seat} 자리이지만 부장 태그 없음</li>
            ))}
            {consistency.tagOnly.map((id) => (
              <li key={id}>· {nameOf(id)} — 부장 태그가 있지만 부장 자리 없음</li>
            ))}
          </ul>
        </div>
      )}

      {!isLoading && seats.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
            <Briefcase className="h-7 w-7 text-blue-600" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-700">{year}학년도 업무분장이 아직 없습니다</p>
          {previousSeats.length > 0 ? (
            <>
              <p className="mt-1 text-xs text-slate-500">
                {year - 1}학년도 자리 {previousSeats.length}개를 담당자와 함께 복사한 뒤, 바뀐 사람만 고치면 됩니다.
              </p>
              <Button size="sm" className="mt-3 h-8 gap-1 bg-blue-600 text-xs hover:bg-blue-700" onClick={handleCopy} disabled={copySeats.isPending}>
                <Copy className="h-3.5 w-3.5" />
                {year - 1}학년도에서 복사
              </Button>
            </>
          ) : (
            <p className="mt-1 text-xs text-slate-500">[자리 추가]로 자리를 만드세요.</p>
          )}
        </div>
      )}

      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.key} className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2">
              <h3 className="text-sm font-semibold text-slate-700">{group.label}</h3>
              <span className="text-xs text-slate-400">{group.seats.length}자리</span>
            </div>
            <ul className="divide-y">
              {group.seats.map((seat) => (
                <SeatRow key={seat.id} seat={seat} refDate={refDate} onEdit={() => setEditing({ seat })} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <DutySeatEditDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        academicYear={year}
        seat={editing?.seat ?? null}
        departments={departmentObjects.map((d) => ({ id: d.id, name: d.name }))}
        nextSortOrder={(seats.at(-1)?.sort_order ?? 0) + 10}
        saving={saveSeat.isPending}
        onSave={(draft) =>
          saveSeat.mutate(draft, {
            onSuccess: () => setEditing(null),
            onError: (e: Error) => toast.error(`저장하지 못했습니다: ${e.message}`),
          })
        }
        onDelete={(seat) => setPendingDelete(seat)}
      />

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>「{pendingDelete?.name}」 자리를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              담당자 기록({pendingDelete?.holders.length ?? 0}건)도 함께 지워집니다. 이 자리를 대상으로 고른
              할 일 요청은 이미 보낸 명단을 유지하지만, 다시 계산하면 이 자리에서는 아무도 나오지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={(e) => {
                e.preventDefault();
                if (!pendingDelete) return;
                deleteSeat.mutate(pendingDelete.id, {
                  onSuccess: () => {
                    setPendingDelete(null);
                    setEditing(null);
                  },
                  onError: (err: Error) => toast.error(`삭제하지 못했습니다: ${err.message}`),
                });
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SeatRow({ seat, refDate, onEdit }: { seat: DutySeat; refDate: string; onEdit: () => void }) {
  const active = activeHolders(seat, refDate);
  const past = seat.holders.filter((h) => !isHolderActive(h, refDate));
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start">
      <div className="flex min-w-0 items-center gap-2 sm:w-56 sm:shrink-0">
        <span className="truncate text-sm font-medium text-slate-800" title={seat.name}>{seat.name}</span>
        <Badge variant="outline" className={cn('shrink-0 text-[10px] font-normal', KIND_TONE[seat.kind])}>
          {DUTY_SEAT_KIND_LABEL[seat.kind]}
        </Badge>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {active.length === 0 && seat.kind !== 'support' && (
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">공석</span>
          )}
          {active.map((h) => (
            <span
              key={h.id}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs',
                h.resource_id ? 'border-slate-200 bg-white text-slate-700' : 'border-rose-200 bg-rose-50 text-rose-700',
              )}
              title={h.resource_id ? undefined : '교직원 명단(resource)에 없는 이름 — 알림·응답을 받을 수 없습니다'}
            >
              {h.holder_name}
              {h.role === 'co' && <span className="text-[10px] text-slate-400">부</span>}
              {formatHolderPeriod(h) && <span className="text-[10px] text-slate-400">{formatHolderPeriod(h)}</span>}
              {!h.resource_id && <span className="text-[10px]">미연결</span>}
            </span>
          ))}
          {past.length > 0 && (
            <span className="text-[11px] text-slate-400" title={past.map((h) => `${h.holder_name} ${formatHolderPeriod(h) ?? ''}`).join('\n')}>
              지난 담당 {past.map((h) => h.holder_name).join('·')}
            </span>
          )}
        </div>
        {seat.areas.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {seat.areas.map((a) => (
              <span
                key={a.name}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
                title={a.edufine_task ? `에듀파인 단위과제: ${a.edufine_task}` : undefined}
              >
                {a.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 self-start px-2 text-xs text-slate-500" onClick={onEdit}>
        <Pencil className="h-3 w-3" />
        편집
      </Button>
    </li>
  );
}

function StatPill({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'danger' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1',
        tone === 'danger' ? 'border-rose-200 bg-rose-50 text-rose-700'
          : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-slate-200 bg-white text-slate-600',
      )}
    >
      {label}
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}
