import { useMemo, useState } from 'react';
import { CalendarRange, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import {
  useTeacherTimetableTerms,
  useTeacherTimetable,
  groupByTeacher,
  type TeacherTimetableRow,
} from '@/features/teacher-timetable/hooks/useTeacherTimetable';
import { TeacherTimetableUploadDialog } from '@/features/teacher-timetable/components/TeacherTimetableUploadDialog';
import { TimetableOverridePanel } from '@/features/teacher-timetable/components/TimetableOverridePanel';
import { WorkflowInfoBanner } from './WorkflowInfoBanner';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import { AcademicTermNotice } from './AcademicTermNotice';
import { mergeTermOptions } from './timetableTermOptions';

const DAY_LABELS = ['월', '화', '수', '목', '금'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7];

function TeacherTimetableGrid({ rows }: { rows: TeacherTimetableRow[] }) {
  const cell = (day: number, period: number) =>
    rows.find((r) => r.day_of_week === day && r.period === period);
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr>
          <th className="border p-1 bg-muted/30 w-[8%]">교시</th>
          {DAY_LABELS.map((d) => (
            <th key={d} className="border p-1 bg-muted/30">{d}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {PERIODS.map((p) => (
          <tr key={p}>
            <td className="border p-1 text-center font-medium bg-muted/20">{p}</td>
            {[1, 2, 3, 4, 5].map((d) => {
              const c = cell(d, p);
              return (
                <td
                  key={d}
                  className={cn(
                    'border p-1 align-top',
                    c
                      ? c.activity_type !== 'subject'
                        ? 'bg-blue-50/40'
                        : c.course_offering_id
                          ? ''
                          : 'bg-amber-50/30'
                      : ''
                  )}
                >
                  {c ? (
                    <div className="space-y-0.5">
                      <div className="font-medium">
                        {c.grade}-{c.class_label}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {c.subject_name}
                      </div>
                      {!c.course_offering_id && c.activity_type === 'subject' && (
                        <div className="text-[9px] text-amber-700">분반 ✗</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground/30">—</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TeacherTimetableManagement() {
  const { data: terms = [], isLoading: loadingTerms } = useTeacherTimetableTerms();
  // 기본 선택 학기 = 학사력 (구 구현은 데이터 최신 학기 terms[0] 기준이었다).
  const { data: academicTerm } = useAcademicTerm();
  const [academicYear, setAcademicYear] = useState<number | null>(null);
  const [semester, setSemester] = useState<number | null>(null);
  const [grade, setGrade] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);

  const effectiveAY = academicYear ?? academicTerm?.year ?? terms[0]?.academicYear ?? null;
  const effectiveSem = semester ?? academicTerm?.semester ?? terms[0]?.semester ?? null;

  // 학사력 학기는 아직 데이터가 없어도 선택 가능해야 한다(새 학기 업로드 대상).
  const termOptions = mergeTermOptions(terms, academicTerm);

  const { data: rows = [], isLoading } = useTeacherTimetable({
    academicYear: effectiveAY,
    semester: effectiveSem,
    grade,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.trim();
    return rows.filter(
      (r) =>
        r.teacher_name.includes(s) ||
        r.subject_name.includes(s) ||
        (r.class_label ?? '').includes(s)
    );
  }, [rows, search]);

  const teachers = useMemo(() => groupByTeacher(filtered), [filtered]);

  const matchStats = useMemo(() => {
    const total = filtered.length;
    const subjectSlots = filtered.filter((r) => r.activity_type === 'subject');
    return {
      total,
      subjectTotal: subjectSlots.length,
      curMissing: subjectSlots.filter((r) => !r.school_curriculum_id).length,
      offMissing: subjectSlots.filter((r) => !r.course_offering_id).length,
      teaMissing: filtered.filter((r) => !r.teacher_resource_id).length,
    };
  }, [filtered]);

  if (loadingTerms) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarRange className="h-6 w-6" />
            교사 시간표 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            교사별 주간 정규 시간표(teacher_timetable, 학년도·학기 키). 기간 동안만 바뀌는 시간표는 아래 «운영 시간표»로 덮습니다.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          시간표 업로드
        </Button>
      </div>

      <AcademicTermNotice
        academicTerm={academicTerm}
        fallbackLabel={
          effectiveAY != null && effectiveSem != null
            ? `${effectiveAY}학년도 ${effectiveSem}학기`
            : null
        }
      />

      <TimetableOverridePanel academicYear={effectiveAY} semester={effectiveSem} />

      <WorkflowInfoBanner
        step={5}
        totalSteps={5}
        title="교사 시간표 관리"
        description="교사별 주간 시간표 (요일×교시 그리드). 교사 시간표 화면·대체 교사 조회·수업 교체 후보가 이 테이블을 읽는다."
        files={[
          '학기별 전체 교사 시간표(N학기).xlsx — 매트릭스: 교사 × 35슬롯',
          'resource.meta.section JSONB (legacy 동시 갱신 — 현행 학기 업로드 시에만)',
        ]}
        table="teacher_timetable"
        prerequisites={[
          { step: 1, label: '교육과정 관리 (교과 매칭)' },
          { step: 2, label: '과목 개설 관리 (분반 매칭)' },
        ]}
        enables={[]}
      />

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>학기 · 학년 선택</CardTitle>
              <CardDescription className="mt-1">
                {effectiveAY != null && effectiveSem != null
                  ? `${effectiveAY}학년도 ${effectiveSem}학기 · ${grade ? `${grade}학년 슬롯만` : '전체 학년'}`
                  : '데이터 없음'}
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select
                value={effectiveAY != null && effectiveSem != null ? `${effectiveAY}-${effectiveSem}` : ''}
                onValueChange={(v) => {
                  const [a, s] = v.split('-').map(Number);
                  setAcademicYear(a);
                  setSemester(s);
                }}
              >
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="학년도·학기" /></SelectTrigger>
                <SelectContent>
                  {termOptions.map((t) => (
                    <SelectItem key={`${t.academicYear}-${t.semester}`} value={`${t.academicYear}-${t.semester}`}>
                      {t.academicYear}학년도 {t.semester}학기
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={grade != null ? String(grade) : 'all'}
                onValueChange={(v) => setGrade(v === 'all' ? null : parseInt(v, 10))}
              >
                <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 학년</SelectItem>
                  <SelectItem value="1">1학년</SelectItem>
                  <SelectItem value="2">2학년</SelectItem>
                  <SelectItem value="3">3학년</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="교사·과목·반 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-[200px]"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="text-xs text-muted-foreground mb-3 flex flex-wrap gap-x-3 gap-y-1">
            <span>교사 {teachers.length}명</span>
            <span>· 슬롯 {matchStats.total}건 (정규교과 {matchStats.subjectTotal})</span>
            <span>· 교사 매칭 {matchStats.total - matchStats.teaMissing}/{matchStats.total}</span>
            <span>· 교과 매칭 {matchStats.subjectTotal - matchStats.curMissing}/{matchStats.subjectTotal}</span>
            <span>· 분반 매칭 {matchStats.subjectTotal - matchStats.offMissing}/{matchStats.subjectTotal}</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : teachers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarRange className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>표시할 교사 시간표가 없습니다.</p>
            </div>
          ) : (
            <Accordion type="multiple" className="border rounded-lg px-2">
              {teachers.map((t) => (
                <AccordionItem
                  key={t.teacher_resource_id ?? `name:${t.teacher_name}`}
                  value={t.teacher_resource_id ?? `name:${t.teacher_name}`}
                >
                  <AccordionTrigger className="hover:no-underline py-2">
                    <div className="flex items-center gap-2 flex-1 text-left">
                      <span className="font-medium">{t.teacher_name}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {t.rows.length}슬롯
                      </Badge>
                      {!t.teacher_resource_id && (
                        <Badge variant="destructive" className="text-[10px]">교사 ✗</Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <TeacherTimetableGrid rows={t.rows} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <TeacherTimetableUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        defaultAcademicYear={effectiveAY ?? new Date().getFullYear()}
        defaultSemester={effectiveSem ?? 1}
      />
    </div>
  );
}
