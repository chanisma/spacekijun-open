import { useMemo, useState } from 'react';
import { CalendarClock, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import {
  useTimetableTerms,
  useTimetable,
  groupByStudent,
  type TimetableRow,
} from '@/features/student-timetable/hooks/useStudentTimetable';
import { StudentTimetableUploadDialog } from '@/features/student-timetable/components/StudentTimetableUploadDialog';
import { WorkflowInfoBanner } from './WorkflowInfoBanner';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import { AcademicTermNotice } from './AcademicTermNotice';
import { mergeTermOptions } from './timetableTermOptions';

const DAY_LABELS = ['월', '화', '수', '목', '금'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7];

function StudentTimetableGrid({ rows }: { rows: TimetableRow[] }) {
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
                <td key={d} className={cn('border p-1 align-top', c?.curriculum_id ? '' : c ? 'bg-amber-50/30' : '')}>
                  {c ? (
                    <div className="space-y-0.5">
                      <div className="font-medium">{c.subject}</div>
                      {c.teacher_name && (
                        <div className={cn(
                          'text-[10px]',
                          c.teacher_resource_id ? 'text-muted-foreground' : 'text-amber-700'
                        )}>
                          {c.teacher_name}{!c.teacher_resource_id && ' ✗'}
                        </div>
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

export function StudentTimetableManagement() {
  const { data: terms = [], isLoading: loadingTerms } = useTimetableTerms();
  // 기본 선택 학기 = 학사력. 구 구현은 데이터에 존재하는 최신 학기(terms[0])를 썼는데,
  // 다음 학기 데이터를 미리 올리면 진행 중인 학기 대신 미래 학기가 기본으로 잡혔다.
  const { data: academicTerm } = useAcademicTerm();
  const [academicYear, setAcademicYear] = useState<number | null>(null);
  const [semester, setSemester] = useState<number | null>(null);
  const [grade, setGrade] = useState<number | null>(1);
  const [classNum, setClassNum] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);

  const effectiveAY = academicYear ?? academicTerm?.year ?? terms[0]?.academicYear ?? null;
  const effectiveSem = semester ?? academicTerm?.semester ?? terms[0]?.semester ?? null;

  // 학사력 학기는 아직 데이터가 없어도 선택 가능해야 한다(새 학기 업로드 대상).
  const termOptions = mergeTermOptions(terms, academicTerm);

  const { data: rows = [], isLoading } = useTimetable({
    academicYear: effectiveAY,
    semester: effectiveSem,
    grade,
    classNum,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.trim();
    return rows.filter(
      (r) =>
        r.student_name.includes(s) ||
        r.subject.includes(s) ||
        (r.teacher_name ?? '').includes(s)
    );
  }, [rows, search]);

  const students = useMemo(() => groupByStudent(filtered), [filtered]);

  const matchStats = useMemo(() => {
    const total = filtered.length;
    return {
      total,
      curMissing: filtered.filter((r) => !r.curriculum_id).length,
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
            <CalendarClock className="h-6 w-6" />
            학생 시간표 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            학생별 주간 시간표. 학생 화면·수업 명단이 읽는 정본 소스 (student_timetable 테이블, 학년도·학기 키).
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

      <WorkflowInfoBanner
        step={4}
        totalSteps={5}
        title="학생 시간표 관리"
        description="학생별 주간 시간표 (요일×교시 그리드). 학생 시간표 화면·수업 학생 명단이 이 테이블을 읽는다."
        files={[
          '학생 시간표 xlsx — 컬럼: 학년·반·번호·성명·요일·교시·과목·교사',
          'resource.meta.timetable JSONB (legacy 동시 갱신 — 현행 학기 업로드 시에만)',
        ]}
        table="student_timetable"
        prerequisites={[
          { step: 1, label: '교육과정 관리 (교과 매칭)' },
          { step: 2, label: '과목 개설 관리 (선택, 분반 cross-link)' },
        ]}
        enables={[]}
      />

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>학기 · 학년 · 반 선택</CardTitle>
              <CardDescription className="mt-1">
                {effectiveAY != null && effectiveSem != null
                  ? `${effectiveAY}학년도 ${effectiveSem}학기 · ${grade ? `${grade}학년` : '전체'} ${classNum ? `${classNum}반` : ''}`
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
              <Select
                value={classNum != null ? String(classNum) : 'all'}
                onValueChange={(v) => setClassNum(v === 'all' ? null : parseInt(v, 10))}
              >
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 반</SelectItem>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}반</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="학생·과목·교사 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-[200px]"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="text-xs text-muted-foreground mb-3">
            학생 {students.length}명 · 시간 슬롯 {matchStats.total}건 ·
            <span className="ml-2">교과 매칭 {matchStats.total - matchStats.curMissing}/{matchStats.total}</span> ·
            <span className="ml-2">교사 매칭 {matchStats.total - matchStats.teaMissing}/{matchStats.total}</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>표시할 시간표가 없습니다.</p>
            </div>
          ) : (
            <Accordion type="multiple" className="border rounded-lg px-2">
              {students.map((st) => (
                <AccordionItem key={st.resource_id} value={st.resource_id}>
                  <AccordionTrigger className="hover:no-underline py-2">
                    <div className="flex items-center gap-2 flex-1 text-left">
                      <Badge variant="outline" className="text-[10px]">
                        {st.student_grade}-{st.student_class}-{st.student_no}
                      </Badge>
                      <span className="font-medium">{st.student_name}</span>
                      <Badge variant="secondary" className="text-[10px]">{st.rows.length}슬롯</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <StudentTimetableGrid rows={st.rows} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <StudentTimetableUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        defaultAcademicYear={effectiveAY ?? new Date().getFullYear()}
        defaultSemester={effectiveSem ?? 1}
      />
    </div>
  );
}
