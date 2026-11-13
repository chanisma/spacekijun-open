/**
 * 운영 시간표 만들기 — 격자형 엑셀(시트 = 요일, 열 = 반, 행 = 교시)을 올려 기간·대상 학년을 정한다.
 * 정규 시간표(teacher_timetable)는 건드리지 않는다. 판정 = SQL teacher_timetable_effective().
 */
import { useMemo, useRef, useState } from 'react';
import { CalendarClock, FileSpreadsheet, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/timetable/timetableDialogDesign';
import {
  TIMETABLE_OVERRIDE_KIND_LABEL,
  findTeacherClashes,
  parseOverrideGrid,
  type GridSheet,
  type ParsedOverrideGrid,
  type TimetableOverrideKind,
} from '@/lib/timetableOverride';
import { createTimetableOverride } from '@/services/timetableOverrideService';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academicYear: number;
  semester: number;
}

const KEEP = '__keep__';

export function TimetableOverrideUploadDialog({ open, onOpenChange, academicYear, semester }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<TimetableOverrideKind>('exam');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [grades, setGrades] = useState<number[]>([]);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedOverrideGrid | null>(null);
  /** 엑셀 이름 → 바로잡은 재직 교직원 이름(오타용) */
  const [nameFix, setNameFix] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: staff = [] } = useQuery({
    queryKey: ['timetable-override', 'staff-names'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resource')
        .select('id, name, type, status')
        .in('type', ['teacher', 'staff']);
      if (error) throw error;
      return (data ?? []).filter((r) => (r.status ?? 'active') === 'active');
    },
  });

  const idByName = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of staff) m.set(r.name, [...(m.get(r.name) ?? []), r.id]);
    return m;
  }, [staff]);

  const reset = () => {
    setTitle('');
    setKind('exam');
    setStartDate('');
    setEndDate('');
    setGrades([]);
    setFileName('');
    setParsed(null);
    setNameFix({});
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    const wb = XLSX.read(await file.arrayBuffer());
    const sheets: GridSheet[] = wb.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[name], { header: 1, defval: null }),
    }));
    const result = parseOverrideGrid(sheets);
    setFileName(file.name);
    setParsed(result);
    setNameFix({});
    // 대상 학년은 엑셀에 나온 학년으로 먼저 채운다(관리자가 바꿀 수 있다)
    setGrades([...new Set(result.slots.map((s) => s.grade))].sort());
  };

  const slots = useMemo(
    () => (parsed?.slots ?? []).map((s) => ({ ...s, teacher_name: nameFix[s.teacher_name] ?? s.teacher_name })),
    [parsed, nameFix]
  );
  /** 재직 교직원 한 명으로 정해지지 않는 엑셀 이름(오타·동명이인) */
  const unresolved = useMemo(() => {
    const names = [...new Set((parsed?.slots ?? []).map((s) => s.teacher_name))];
    return names.filter((n) => (idByName.get(nameFix[n] ?? n)?.length ?? 0) !== 1);
  }, [parsed, nameFix, idByName]);
  const clashes = useMemo(() => findTeacherClashes(slots), [slots]);
  const outsideGrades = slots.filter((s) => grades.length > 0 && !grades.includes(s.grade)).length;

  const problems = [
    !title.trim() && '이름을 적어 주세요',
    (!startDate || !endDate) && '기간을 정해 주세요',
    startDate && endDate && endDate < startDate && '끝나는 날이 시작일보다 빠릅니다',
    grades.length === 0 && '대상 학년을 고르세요',
    slots.length === 0 && '엑셀에서 읽은 칸이 없습니다',
    unresolved.length > 0 && `교직원 이름을 바로잡으세요: ${unresolved.join(', ')}`,
    clashes.length > 0 && `같은 시간에 두 칸: ${clashes.join(', ')}`,
    outsideGrades > 0 && `대상 학년 밖의 칸이 ${outsideGrades}개 있습니다`,
  ].filter(Boolean) as string[];

  const save = async () => {
    if (problems.length) return;
    setSaving(true);
    try {
      await createTimetableOverride({
        title: title.trim(),
        kind,
        academic_year: academicYear,
        semester,
        start_date: startDate,
        end_date: endDate,
        // 세 학년을 모두 고르면 «전 학년»(null)
        grades: grades.length === 3 ? null : grades,
        slots: slots.map((s) => ({ ...s, teacher_resource_id: idByName.get(s.teacher_name)?.[0] ?? null })),
      });
      toast.success(`운영 시간표를 만들었습니다 — ${slots.length}칸, ${startDate} ~ ${endDate}`);
      await queryClient.invalidateQueries({ queryKey: ['timetable-override'] });
      // 운영 화면이 바로 새 판정을 보도록
      await queryClient.invalidateQueries({ queryKey: ['timetable-data'] });
      await queryClient.invalidateQueries({ queryKey: ['today-timetable'] });
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '운영 시간표를 만들지 못했습니다');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl p-0 gap-0 flex flex-col max-h-[90vh]">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-3">
            <TitleIconChip icon={CalendarClock} />
            <div className="min-w-0">
              <DialogTitle>운영 시간표 만들기</DialogTitle>
              <DialogDescription className="mt-1">
                {academicYear}학년도 {semester}학기 · 기간 동안 대상 학년의 정규 수업 대신 보입니다. 정규 시간표는 그대로 남습니다.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <div className="space-y-1.5">
              <Label htmlFor="ovr-title">이름</Label>
              <Input id="ovr-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2학기 기말고사 시간표" maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label>종류</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as TimetableOverrideKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIMETABLE_OVERRIDE_KIND_LABEL) as TimetableOverrideKind[]).map((k) => (
                    <SelectItem key={k} value={k}>{TIMETABLE_OVERRIDE_KIND_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ovr-from">시작일</Label>
              <Input id="ovr-from" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ovr-to">끝나는 날 (이날까지 적용)</Label>
              <Input id="ovr-to" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>대상 학년 — 이 학년의 정규 수업이 기간 동안 가려집니다</Label>
            <div className="flex gap-2">
              {[1, 2, 3].map((g) => {
                const on = grades.includes(g);
                return (
                  <Button
                    key={g}
                    type="button"
                    variant="outline"
                    className={cn('h-11 min-w-[72px]', on && 'border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-50')}
                    aria-pressed={on}
                    onClick={() => setGrades((prev) => (on ? prev.filter((x) => x !== g) : [...prev, g].sort()))}
                  >
                    {g}학년
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <SectionLabel icon={FileSpreadsheet}>엑셀</SectionLabel>
            <p className="text-xs text-muted-foreground">
              시트 하나가 요일(이름이 월·화·수·목·금으로 시작), 첫 행이 반(«3학년 1반»), 왼쪽 열이 교시(«1교시»)입니다.
              칸은 «과목(교사)» 또는 교사 이름만 적습니다.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f).catch((err) => toast.error(`엑셀을 읽지 못했습니다: ${err instanceof Error ? err.message : err}`));
              }}
            />
            <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              {fileName ? '다른 파일 고르기' : '엑셀 파일 고르기'}
            </Button>
            {fileName && <p className="min-w-0 truncate text-xs text-slate-600" title={fileName}>{fileName}</p>}
          </div>

          {parsed && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-700">
                <span>칸 {slots.length}</span>
                <span>· 교사 {new Set(slots.map((s) => s.teacher_name)).size}명</span>
                <span>· 과목 없는 칸 {slots.filter((s) => !s.subject_name).length}</span>
              </div>

              {parsed.warnings.length > 0 && (
                <Alert>
                  <AlertDescription className="space-y-0.5 text-xs">
                    {parsed.warnings.map((w) => <div key={w}>{w}</div>)}
                  </AlertDescription>
                </Alert>
              )}

              {unresolved.length > 0 && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                  <p className="text-sm font-medium text-amber-900">재직 교직원 명단에서 한 명으로 정해지지 않는 이름 — 맞는 이름을 고르세요</p>
                  {unresolved.map((n) => (
                    <div key={n} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-sm">{n}</span>
                      <span className="text-slate-400">→</span>
                      <Select
                        value={nameFix[n] ?? KEEP}
                        onValueChange={(v) => setNameFix((prev) => {
                          const next = { ...prev };
                          if (v === KEEP) delete next[n];
                          else next[n] = v;
                          return next;
                        })}
                      >
                        <SelectTrigger className="h-11 w-[200px]"><SelectValue placeholder="교직원 고르기" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={KEEP}>(고르지 않음)</SelectItem>
                          {[...idByName.entries()]
                            .filter(([, ids]) => ids.length === 1)
                            .map(([name]) => name)
                            .sort((a, b) => a.localeCompare(b, 'ko'))
                            .map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {parsed && problems.length > 0 && (
            <ul className="space-y-0.5 text-xs text-rose-600">
              {problems.map((p) => <li key={p}>· {p}</li>)}
            </ul>
          )}
        </div>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            className={cn(FOOTER_BUTTON_CLASS, 'bg-blue-600 hover:bg-blue-700')}
            disabled={saving || problems.length > 0}
            onClick={() => void save()}
          >
            {saving ? '저장 중…' : '운영 시간표 만들기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
