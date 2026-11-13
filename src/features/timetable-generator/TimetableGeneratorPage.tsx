import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, CheckCircle2, Gauge, Loader2, Play, Plus, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { DAY_LABELS, DEFAULT_BLOCKED_BY_GRADE, DEFAULT_GRID, TEACHER_HARD_TIER1_IDS } from './constants';
import { buildTimetableInput } from './utils/buildInput';
import { editCandidate, formatCandidateScore, selectedPlanCandidate } from './utils/candidateEditing';
import { restorePlanLessons } from './utils/planFinalization';
import {
  createTimetablePlan,
  fetchTimetableSourceData,
  finalizeTimetablePlan,
  type TimetableSourceData,
} from './services/timetablePlanService';
import { useTimetableRun } from './hooks/useTimetableRun';
import {
  useDeleteTimetablePlan,
  useSavedTimetablePlans,
  useTimetablePlan,
} from './hooks/useSavedTimetablePlans';
import { TimetableGridView } from './components/TimetableGridView';
import { ViolationReportPanel } from './components/ViolationReportPanel';
import { SectioningReportPanel } from './components/SectioningReportPanel';
import { parseTimetablePreview, type TimetablePreview } from './utils/previewImport';
import { candidateLessons } from './utils/candidateRoster';
import type { Grade, Lesson, Placement, ProbeReport, SolverStrategy, TimetableCandidate, TimetableInput } from './types';

export interface TimetableGeneratorPageProps {
  mode: 'list' | 'new' | 'detail' | 'preview';
}

const STATUS_LABEL: Record<string, string> = { draft: '임시저장', finalized: '확정', archived: '보관' };
const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-700',
  finalized: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-muted text-muted-foreground',
};

async function resolveMyResourceId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;
  const { data: prof } = await supabase.from('profiles').select('name').eq('id', uid).maybeSingle();
  if (!prof?.name) return null;
  const { data: res } = await supabase
    .from('resource')
    .select('id')
    .eq('name', prof.name)
    .eq('type', 'teacher')
    .maybeSingle();
  return (res as { id?: string } | null)?.id ?? null;
}

function classesForGrade(lessons: Lesson[], grade: Grade): number[] {
  const set = new Set<number>();
  for (const l of lessons) {
    for (const ck of l.classKeys) {
      const [g, c] = ck.split('-');
      if (Number(g) === grade) set.add(Number(c));
    }
  }
  return [...set].sort((a, b) => a - b);
}

interface StudentDir {
  name: string;
  grade: number;
  classNum: number;
}

function buildStudentDirectory(source: TimetableSourceData | null | undefined): Map<string, StudentDir> {
  const m = new Map<string, StudentDir>();
  for (const e of source?.enrollments ?? []) {
    if (!e.student_resource_id || e.student_grade == null) continue;
    const cn = parseInt(String(e.student_class ?? ''), 10);
    if (!Number.isFinite(cn)) continue;
    if (!m.has(e.student_resource_id)) {
      m.set(e.student_resource_id, {
        name: e.student_name ?? e.student_resource_id,
        grade: e.student_grade,
        classNum: cn,
      });
    }
  }
  return m;
}

function studentNameMapFromDirectory(directory: Map<string, StudentDir>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [id, s] of directory) m.set(id, s.name);
  return m;
}

/** 엔티티별 하드위반 집합 (리스트에 ⚠ 표시·정렬용). 칸별 그룹화 1회로 교사·학생·반 동시 집계 */
function computeConflicts(lessons: Lesson[], placements: Placement[]) {
  const byLesson = new Map(lessons.map((l) => [l.id, l]));
  const teachers = new Set<string>();
  const students = new Set<string>();
  const classes = new Set<string>();
  const byCell = new Map<string, Lesson[]>();
  for (const p of placements) {
    const l = byLesson.get(p.lessonId);
    if (!l) continue;
    const k = `${p.dayIndex}|${p.period}`;
    const arr = byCell.get(k);
    if (arr) arr.push(l);
    else byCell.set(k, [l]);
  }
  for (const ls of byCell.values()) {
    // 교사 위반: 한 칸에 같은 교사 2회 (동시에 두 수업)
    const tCount = new Map<string, number>();
    for (const l of ls) if (l.teacherId) tCount.set(l.teacherId, (tCount.get(l.teacherId) ?? 0) + 1);
    for (const [t, n] of tCount) if (n > 1) teachers.add(t);
    // 학생 위반: 한 칸에 같은 학생코드 2회 (저장본은 studentCodes 제거되어 미동작 — 생성 직후만)
    const sCount = new Map<string, number>();
    for (const l of ls) for (const s of l.studentCodes) sCount.set(s, (sCount.get(s) ?? 0) + 1);
    for (const [s, n] of sCount) if (n > 1) students.add(s);
    // 반 위반: 반 내에서 같은 교사 2회 (같은 과목 다른 교사=분반은 정상)
    const byClass = new Map<string, Lesson[]>();
    for (const l of ls) for (const ck of l.classKeys) {
      const arr = byClass.get(ck);
      if (arr) arr.push(l);
      else byClass.set(ck, [l]);
    }
    for (const [ck, cls] of byClass) {
      const seen = new Set<string>();
      for (const l of cls) {
        if (l.teacherId == null) continue;
        if (seen.has(l.teacherId)) { classes.add(ck); break; }
        seen.add(l.teacherId);
      }
    }
  }
  return { teachers, students, classes };
}

interface ListItem {
  key: string;
  label: string;
  sub?: string;
  conflict: boolean;
  onSelect: () => void;
  selected: boolean;
}

/** 마스터 리스트: 위반 항목을 ⚠ 표시·상단 정렬. 왼쪽 패널. */
function EntityList({ items, emptyHint }: { items: ListItem[]; emptyHint: string }) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.conflict === b.conflict ? 0 : a.conflict ? -1 : 1)),
    [items],
  );
  const conflictN = items.filter((i) => i.conflict).length;
  return (
    <div className="w-48 shrink-0 border rounded-md flex flex-col max-h-[62vh]">
      <div className="px-2 py-1.5 border-b bg-muted/40 text-[11px] text-muted-foreground flex items-center justify-between">
        <span>{items.length}개</span>
        {conflictN > 0 && <span className="text-red-600 font-medium">⚠ 위반 {conflictN}</span>}
      </div>
      <div className="overflow-y-auto flex-1">
        {sorted.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">{emptyHint}</p>
        ) : (
          sorted.map((it) => (
            <button
              key={it.key}
              type="button"
              onClick={it.onSelect}
              className={`w-full text-left px-2 py-1.5 text-xs flex items-center justify-between gap-1.5 border-b last:border-0 ${
                it.selected ? 'bg-primary/10 font-medium' : 'hover:bg-muted/60'
              }`}
            >
              <span className="truncate flex items-center gap-1.5 min-w-0">
                {it.conflict && <span className="text-red-500 shrink-0">⚠</span>}
                <span className="truncate">{it.label}</span>
                {it.sub && <span className="text-muted-foreground shrink-0">{it.sub}</span>}
              </span>
              {it.conflict && <span className="text-[10px] text-red-600 shrink-0">위반</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** 후보 미리보기: 반별/교사별/학생별 — 왼쪽 리스트(위반 표시) + 오른쪽 격자 */
function CandidatePreview({
  lessons,
  candidate,
  grades,
  studentDirectory,
  originalPlacements,
  onPlacementsChange,
  grid = DEFAULT_GRID,
}: {
  lessons: Lesson[];
  candidate: TimetableCandidate;
  grades: Grade[];
  studentDirectory?: Map<string, StudentDir>;
  originalPlacements?: Placement[];
  onPlacementsChange?: (placements: Placement[]) => void;
  grid?: TimetableInput['grid'];
}) {
  const [viewMode, setViewMode] = useState<'class' | 'teacher' | 'student'>('class');
  const [grade, setGrade] = useState<Grade>(grades[0]);
  const classes = classesForGrade(lessons, grade);
  const [selCls, setSelCls] = useState<number | null>(null);
  const effectiveCls = selCls != null && classes.includes(selCls) ? selCls : classes[0] ?? null;
  const [selTeacher, setSelTeacher] = useState<string>('');
  const [selStudent, setSelStudent] = useState<string>('');

  const editedPlacements = candidate.placements;
  const edited = originalPlacements && editedPlacements !== originalPlacements;
  const moveLesson = (lessonId: string, dayIndex: number, period: number) =>
    onPlacementsChange?.(editedPlacements.map((p) => p.lessonId === lessonId ? { lessonId, dayIndex, period } : p));

  const conflicts = useMemo(() => computeConflicts(lessons, editedPlacements), [lessons, editedPlacements]);

  const teachers = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lessons) if (l.teacherId && l.teacherName) m.set(l.teacherId, l.teacherName);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [lessons]);
  const effectiveTeacher = selTeacher && teachers.some((t) => t.id === selTeacher) ? selTeacher : teachers[0]?.id ?? '';

  const gradeStudents = useMemo(() => {
    if (!studentDirectory) return [] as { id: string; name: string; classNum: number }[];
    return [...studentDirectory.entries()]
      .filter(([, s]) => s.grade === grade)
      .map(([id, s]) => ({ id, name: s.name, classNum: s.classNum }))
      .sort((a, b) => a.classNum - b.classNum || a.name.localeCompare(b.name, 'ko'));
  }, [studentDirectory, grade]);
  const effectiveStudent =
    selStudent && gradeStudents.some((s) => s.id === selStudent) ? selStudent : gradeStudents[0]?.id ?? '';

  // 모드별 리스트 항목
  const items: ListItem[] =
    viewMode === 'teacher'
      ? teachers.map((t) => ({
          key: t.id, label: t.name, conflict: conflicts.teachers.has(t.id),
          selected: effectiveTeacher === t.id, onSelect: () => setSelTeacher(t.id),
        }))
      : viewMode === 'student'
        ? gradeStudents.map((s) => ({
            key: s.id, label: s.name, sub: `${s.classNum}반`, conflict: conflicts.students.has(s.id),
            selected: effectiveStudent === s.id, onSelect: () => setSelStudent(s.id),
          }))
        : classes.map((c) => ({
            key: String(c), label: `${c}반`, conflict: conflicts.classes.has(`${grade}-${c}`),
            selected: effectiveCls === c, onSelect: () => setSelCls(c),
          }));

  // 모드별 우측 격자 prop + 헤더
  const selName =
    viewMode === 'teacher'
      ? teachers.find((t) => t.id === effectiveTeacher)?.name ?? ''
      : viewMode === 'student'
        ? (() => { const s = gradeStudents.find((x) => x.id === effectiveStudent); return s ? `${s.name} (${s.classNum}반)` : ''; })()
        : effectiveCls != null ? `${grade}학년 ${effectiveCls}반` : '';
  const selConflict =
    viewMode === 'teacher' ? conflicts.teachers.has(effectiveTeacher)
      : viewMode === 'student' ? conflicts.students.has(effectiveStudent)
        : effectiveCls != null && conflicts.classes.has(`${grade}-${effectiveCls}`);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
          <TabsList>
            <TabsTrigger value="class">반별{conflicts.classes.size > 0 ? ` ⚠${conflicts.classes.size}` : ''}</TabsTrigger>
            <TabsTrigger value="teacher">교사별{conflicts.teachers.size > 0 ? ` ⚠${conflicts.teachers.size}` : ''}</TabsTrigger>
            <TabsTrigger value="student" disabled={!studentDirectory}>
              학생별{conflicts.students.size > 0 ? ` ⚠${conflicts.students.size}` : ''}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {(viewMode === 'class' || viewMode === 'student') && (
          <Tabs value={String(grade)} onValueChange={(v) => setGrade(Number(v) as Grade)}>
            <TabsList>
              {grades.map((g) => (
                <TabsTrigger key={g} value={String(g)}>{g}학년</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>
      {lessons.some((l) => l.studentCodes.length > 0) && (
        <p className="text-xs text-muted-foreground">
          선택과목 분반 재배정 명단 기준.{' '}
          학생충돌 <b className={conflicts.students.size ? 'text-red-600' : 'text-emerald-600'}>{conflicts.students.size}명</b>
          {' · '}교사충돌 <b className={conflicts.teachers.size ? 'text-red-600' : 'text-emerald-600'}>{conflicts.teachers.size}건</b>
          {conflicts.students.size === 0 && conflicts.teachers.size > 0 && ' (남은 건 교사 시간배치 — 학생충돌은 해소됨)'}
        </p>
      )}
      <div className="flex gap-3">
        <EntityList
          items={items}
          emptyHint={viewMode === 'student' ? '학생 명단을 불러오지 못했습니다.' : '항목이 없습니다.'}
        />
        <div className="flex-1 min-w-0 space-y-1.5">
          {selName && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-medium">{selName}</span>
              {selConflict && <span className="text-xs text-red-600">⚠ 위반 있음</span>}
              {viewMode === 'student' && onPlacementsChange && (
                <span className="text-xs text-blue-600">개인 시간표 — 위반 교시의 과목을 빈 칸(＋)으로 드래그해 이동</span>
              )}
              {edited && (
                <button
                  type="button"
                  onClick={() => onPlacementsChange?.(originalPlacements!)}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  편집됨 · 되돌리기
                </button>
              )}
            </div>
          )}
          {viewMode === 'teacher' ? (
            effectiveTeacher ? (
              <TimetableGridView lessons={lessons} placements={editedPlacements} teacherId={effectiveTeacher} grid={grid} />
            ) : (
              <p className="text-sm text-muted-foreground">표시할 교사가 없습니다.</p>
            )
          ) : viewMode === 'student' ? (
            effectiveStudent ? (
              <TimetableGridView
                lessons={lessons}
                placements={editedPlacements}
                studentId={effectiveStudent}
                grid={grid}
                editable={!!onPlacementsChange}
                onMoveLesson={moveLesson}
              />
            ) : (
              <p className="text-sm text-muted-foreground">표시할 학생이 없습니다.</p>
            )
          ) : effectiveCls != null ? (
            <TimetableGridView lessons={lessons} placements={editedPlacements} classKey={`${grade}-${effectiveCls}`} grid={grid} />
          ) : (
            <p className="text-sm text-muted-foreground">표시할 반이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** 후보의 하드 위반 계층 분해: tier0=절대불가(학생/교사 동시수업 등), tier1=교사 부하 4종 */
function candHardTiers(candidate: TimetableCandidate): { t0: number; t1: number } {
  let t0 = 0;
  let t1 = 0;
  for (const h of candidate.scoreBreakdown.hard) {
    if (TEACHER_HARD_TIER1_IDS.has(h.id)) t1 += h.count;
    else t0 += h.count;
  }
  return { t0, t1 };
}

function CandidateMetricsRow({ candidate }: { candidate: TimetableCandidate }) {
  const m = candidate.metrics;
  const { t0, t1 } = candHardTiers(candidate);
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span>점수 <b className="text-foreground">{formatCandidateScore(candidate.scoreBreakdown.total)}</b></span>
      <span>반 공강 <b className="text-foreground">{m.studentGapTotal}</b> (최대 {m.studentGapMax})</span>
      <span>교사 공강 <b className="text-foreground">{m.teacherGapTotal}</b></span>
      <span className={m.teacherOverCap > 0 ? 'text-amber-600' : undefined}>
        교사 하루최대 <b className="text-foreground">{m.teacherMaxDaily}</b>
        {m.teacherOverCap > 0 ? ` (초과 ${m.teacherOverCap})` : ''}
      </span>
      <span className={m.teacherConsecutiveTotal > 0 ? 'text-amber-600' : undefined}>
        3연속 <b className="text-foreground">{m.teacherConsecutiveTotal}</b>
      </span>
      <span>배치 <b className="text-foreground">{m.placedLessons}/{m.totalLessons}</b></span>
      <span className={t0 > 0 ? 'text-red-600' : t1 > 0 ? 'text-amber-600' : 'text-emerald-600'}>
        {t0 > 0 ? `기본 충돌 ${t0}` : t1 > 0 ? `부하 위반 ${t1}` : '제약 충족'}
      </span>
    </div>
  );
}

// ── 목록 ────────────────────────────────────────────────────────
function ListView() {
  const { data: plans, isLoading } = useSavedTimetablePlans();
  const del = useDeleteTimetablePlan();
  const { toast } = useToast();

  return (
    <div className="space-y-4">
      {/* 목록 = 기능 첫 화면이라 제목·아이콘 없이 액션만 — 기능명·아이콘을 쓰지 않는다(2026-09-22 사용자 규약, CLAUDE.md "UI 큰 틀 규약" §1) */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" asChild>
          <Link to="/timetable-generator/preview">검증 배치 미리보기</Link>
        </Button>
        <Button asChild>
          <Link to="/timetable-generator/new"><Plus className="h-4 w-4 mr-1" /> 새 시간표 생성</Link>
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제목</TableHead>
                <TableHead>학기</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>생성일</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">불러오는 중…</TableCell></TableRow>
              )}
              {!isLoading && (plans ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">저장된 시간표가 없습니다.</TableCell></TableRow>
              )}
              {(plans ?? []).map((p) => (
                <TableRow key={p.id} className="cursor-pointer">
                  <TableCell>
                    <Link to={`/timetable-generator/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                  </TableCell>
                  <TableCell>{p.academic_year}-{p.semester}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded text-xs ${STATUS_STYLE[p.status] ?? ''}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.created_at?.slice(0, 10)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => del.mutate(p.id, { onSuccess: () => toast({ title: '삭제됨' }) })}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * 공강 진단 패널. 학년별로 "현재 균일 공강에서 무충돌이 가능한지"와 "가능한 최대 균일 공강"을
 * 표시한다. 핵심 메시지: 균일 공강(모든 반이 같은 시간에 빔)을 줄여도 학생당 총 빈 교시 수는
 * 그대로이며, 나머지 빈 교시는 반마다 다른 시간으로 자동 분산(staggered)된다.
 */
function ProbePanel({ report }: { report: ProbeReport }) {
  return (
    <div className="mt-1 rounded-md border bg-muted/30 p-3 text-xs space-y-2">
      <div className="font-medium">공강 진단 (학년별 무충돌 가능성 · 추정)</div>
      <ul className="space-y-1.5">
        {report.grades.map((g) => (
          <li key={g.grade} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium whitespace-nowrap">{g.grade}학년</span>
            <span className="text-muted-foreground whitespace-nowrap">
              학생 최대 부하 {g.maxStudentLoad}칸 · 균일 공강 {g.currentBlocked}칸(가용 {g.currentAvail})
            </span>
            {g.feasibleAtCurrent ? (
              <span className="text-emerald-600">✓ 현재 공강으로 무충돌 가능</span>
            ) : g.recommendedMaxBlocked != null ? (
              <span className="text-amber-600">
                ✗ 무충돌 불가 — 균일 공강을 최대 {g.recommendedMaxBlocked}칸까지 줄이세요 (나머지 빈 교시는 반별로 자동 분산)
              </span>
            ) : (
              <span className="text-red-600">✗ 균일 공강 0칸으로도 불가 — 편성 검토 필요</span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        ※ <b>균일 공강</b> = 모든 반이 같은 시간에 비는 칸. 균일 공강을 줄여도 <b>학생당 총 빈 교시 수(35−수업 수)는
        그대로</b>이며, 줄인 만큼의 빈 교시는 반마다 <b>다른 시간으로 자동 분산</b>됩니다(실제 학교 시간표와 동일한 방식).
        선택과목 편성이 복잡한 학년은 모든 반을 같은 시간에 비우면(균일 공강 과다) 충돌이 불가피합니다. 학년 간 교사
        공유는 진단에서 제외한 추정값입니다.
      </p>
    </div>
  );
}

// ── 신규 생성 ─────────────────────────────────────────────────────
function NewView() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const run = useTimetableRun();

  const [year, setYear] = useState(2026);
  const [semester, setSemester] = useState(2);
  const [grades, setGrades] = useState<Grade[]>([1, 2, 3]);
  const [runMode, setRunMode] = useState<'quick' | 'standard' | 'thorough' | 'exact'>('standard');
  const [strategy, setStrategy] = useState<SolverStrategy>(import.meta.env.DEV ? 'staged-cpsat' : 'coordinated');
  // 학교 고정 공강(1·3학년 월4·화4·수4·금4·금5, 2학년 월4·화4·금4·금5)을 초기값으로 시드
  const [blockedByGrade, setBlockedByGrade] = useState<Record<number, Set<string>>>(() => {
    const init: Record<number, Set<string>> = {};
    for (const g of [1, 2, 3] as const) {
      init[g] = new Set(DEFAULT_BLOCKED_BY_GRADE[g].map((c) => `${c.dayIndex}|${c.period}`));
    }
    return init;
  });
  const [ggGrade, setGgGrade] = useState<Grade>(1);
  const [title, setTitle] = useState('');
  const [input, setInput] = useState<TimetableInput | null>(null);
  const [source, setSource] = useState<TimetableSourceData | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selCand, setSelCand] = useState<string | null>(null);
  const [edits, setEdits] = useState<{ result: typeof run.result; candidates: TimetableCandidate[] } | null>(null);

  const toggleGrade = (g: Grade) =>
    setGrades((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g].sort()));
  const effectiveGg: Grade = grades.includes(ggGrade) ? ggGrade : (grades[0] ?? 1);
  const toggleCell = (d: number, p: number) =>
    setBlockedByGrade((prev) => {
      const k = `${d}|${p}`;
      const cur = new Set(prev[effectiveGg] ?? []);
      if (cur.has(k)) cur.delete(k);
      else cur.add(k);
      return { ...prev, [effectiveGg]: cur };
    });

  const buildInputFromCurrent = (src: TimetableSourceData): TimetableInput => {
    const blockedCellsByGrade: Partial<Record<number, { dayIndex: number; period: number }[]>> = {};
    for (const g of grades) {
      blockedCellsByGrade[g] = [...(blockedByGrade[g] ?? [])].map((s) => {
        const [d, p] = s.split('|').map(Number);
        return { dayIndex: d, period: p };
      });
    }
    return buildTimetableInput(src.offerings, src.enrollments, {
      academicYear: year,
      semester,
      grades,
      sourceBasis: src.basis,
      blockedCellsByGrade,
      options: { runMode, strategy },
    });
  };

  const onGenerate = async () => {
    if (grades.length === 0) {
      toast({ title: '학년을 선택하세요', variant: 'destructive' });
      return;
    }
    setFetching(true);
    setInput(null);
    try {
      const src = await fetchTimetableSourceData(year, semester, grades, 'enrollment');
      setSource(src);
      if (src.offerings.length === 0) {
        toast({ title: `${year}-${semester} 개설 강좌가 없습니다`, variant: 'destructive' });
        return;
      }
      const built = buildInputFromCurrent(src);
      setInput(built);
      if (!title) setTitle(`${year}학년도 ${semester}학기 시간표`);
      run.start(built);
    } catch (e) {
      toast({ title: '데이터 적재 실패', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setFetching(false);
    }
  };

  // 공강 진단: 현재 공강 설정으로 학년별 무충돌이 가능한지 빠르게 측정 (생성 전 점검)
  const onProbe = async () => {
    if (grades.length === 0) {
      toast({ title: '학년을 선택하세요', variant: 'destructive' });
      return;
    }
    setFetching(true);
    try {
      const src = await fetchTimetableSourceData(year, semester, grades, 'enrollment');
      if (src.offerings.length === 0) {
        toast({ title: `${year}-${semester} 개설 강좌가 없습니다`, variant: 'destructive' });
        return;
      }
      run.probe(buildInputFromCurrent(src));
    } catch (e) {
      toast({ title: '데이터 적재 실패', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setFetching(false);
    }
  };

  const studentDirectory = useMemo(() => buildStudentDirectory(source), [source]);

  const studentNameMap = useMemo(() => studentNameMapFromDirectory(studentDirectory), [studentDirectory]);

  const candidates = edits && edits.result === run.result ? edits.candidates : run.result?.candidates ?? [];
  const activeCand = candidates.find((c) => c.id === selCand) ?? candidates[0] ?? null;
  const reportInput = useMemo(() => input && activeCand ? {
    ...input, lessons: candidateLessons(input, activeCand),
  } : input, [input, activeCand]);

  const onSaveDraft = async () => {
    if (!input || !run.result || !activeCand) return;
    setSaving(true);
    try {
      const myRes = await resolveMyResourceId();
      const plan = await createTimetablePlan({
        academicYear: input.academicYear,
        semester: input.semester,
        title: title || `${input.academicYear}-${input.semester} 시간표`,
        input,
        result: { ...run.result, candidates },
        selectedCandidateId: activeCand.id,
        createdByResourceId: myRes,
      });
      toast({ title: '초안 저장됨' });
      navigate(`/timetable-generator/${plan.id}`);
    } catch (e) {
      toast({ title: '저장 실패', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const progressPct = run.progress ? Math.round((run.progress.current / Math.max(1, run.progress.total)) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild><Link to="/timetable-generator"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">새 시간표 생성</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1. 설정</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label>학년도</Label>
              <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" />
            </div>
            <div className="space-y-1">
              <Label>학기</Label>
              <Select value={String(semester)} onValueChange={(v) => setSemester(Number(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="1">1학기</SelectItem><SelectItem value="2">2학기</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>학년</Label>
              <div className="flex gap-1">
                {[1, 2, 3].map((g) => (
                  <Button key={g} type="button" size="sm" variant={grades.includes(g as Grade) ? 'default' : 'outline'} onClick={() => toggleGrade(g as Grade)}>
                    {g}학년
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>탐색 강도</Label>
              <Select value={runMode} onValueChange={(v) => setRunMode(v as typeof runMode)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick">빠름{strategy === 'staged-cpsat' ? ' (약 2분)' : strategy === 'coordinated' ? ' (약 20초)' : ''}</SelectItem>
                  <SelectItem value="standard">표준{strategy === 'staged-cpsat' ? ' (약 7분)' : strategy === 'coordinated' ? ' (약 90초)' : ''}</SelectItem>
                  <SelectItem value="thorough">정밀{strategy === 'staged-cpsat' ? ' (약 11분)' : strategy === 'coordinated' ? ' (약 4분)' : ''}</SelectItem>
                  <SelectItem value="exact">최정밀{strategy === 'staged-cpsat' ? ' (약 21분)' : strategy === 'coordinated' ? ' (약 10분)' : ' (10~30분)'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>솔버 전략</Label>
              <Select value={strategy} onValueChange={(v) => setStrategy(v as SolverStrategy)}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="coordinated">브라우저 배치·분반 공동 탐색</SelectItem>
                  <SelectItem value="staged-cpsat">단계별 공동 탐색 (로컬 서비스)</SelectItem>
                  <SelectItem value="enhanced-local">강화 국소탐색</SelectItem>
                  <SelectItem value="min-conflicts">기본 (min-conflicts)</SelectItem>
                  <SelectItem value="block-aware">블록 정렬 (실험)</SelectItem>
                  <SelectItem value="cp-sat">브라우저 정확 탐색</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>편성 기준</Label>
              <p className="text-sm">수강 신청 명단 (미재학 제외)</p>
            </div>
          </div>

          <div className="space-y-1">
            <Label>공강 칸 (배치 금지 — 점심·단축 등. <b>학년별</b>로 지정. 자율·동아리·공동교육과정은 자동 제외)</Label>
            <p className="text-xs text-muted-foreground">자율·자치활동과 동아리활동은 다시 분배하지 않습니다. 진로활동은 배치 대상에 포함됩니다.</p>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-xs text-muted-foreground mr-1">학년:</span>
              {grades.map((g) => (
                <Button key={g} type="button" size="sm" variant={effectiveGg === g ? 'default' : 'outline'} onClick={() => setGgGrade(g)}>
                  {g}학년{(blockedByGrade[g]?.size ?? 0) > 0 ? ` (${blockedByGrade[g]!.size})` : ''}
                </Button>
              ))}
            </div>
            <div className="inline-block">
              <table className="border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border px-2 py-1 bg-muted text-muted-foreground">교시</th>
                    {Array.from({ length: DEFAULT_GRID.days }, (_, d) => (
                      <th key={d} className="border px-3 py-1 bg-muted">{DAY_LABELS[d]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: DEFAULT_GRID.periodsPerDay }, (_, i) => i + 1).map((p) => (
                    <tr key={p}>
                      <td className="border px-2 py-1 bg-muted/50 text-center text-muted-foreground">{p}</td>
                      {Array.from({ length: DEFAULT_GRID.days }, (_, d) => {
                        const on = blockedByGrade[effectiveGg]?.has(`${d}|${p}`) ?? false;
                        return (
                          <td key={d} className="border p-0">
                            <button
                              type="button"
                              onClick={() => toggleCell(d, p)}
                              className={`w-12 h-7 ${on ? 'bg-rose-500/80 text-white' : 'hover:bg-muted'}`}
                            >
                              {on ? '금지' : ''}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onGenerate} disabled={fetching || run.status === 'running'}>
              {fetching || run.status === 'running' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
              시간표 생성
            </Button>
            <Button variant="outline" onClick={onProbe} disabled={fetching || run.probeStatus === 'running'}>
              {run.probeStatus === 'running' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Gauge className="h-4 w-4 mr-1" />}
              공강 진단
            </Button>
            {input && activeCand && (
              <Button variant="outline" disabled={fetching || run.status === 'running'} onClick={() => {
                const continued = { ...input, options: { ...input.options, runMode, strategy } };
                setInput(continued);
                run.start(continued, activeCand.placements);
              }}>현재 배치 이어서 개선</Button>
            )}
          </div>
          {run.probeStatus === 'running' && (
            <p className="text-xs text-muted-foreground">공강 진단 중… (학년별 빠른 채색 시도, 수십 초 소요)</p>
          )}
          {run.probeReport && run.probeStatus !== 'running' && <ProbePanel report={run.probeReport} />}
        </CardContent>
      </Card>

      {run.status === 'running' && (
        <Card>
          <CardContent className="py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>{run.progress?.message ?? '생성 중…'}</span>
              <span>{progressPct}%</span>
            </div>
            <Progress value={progressPct} />
            <Button variant="outline" size="sm" onClick={run.cancel}>탐색 중단</Button>
          </CardContent>
        </Card>
      )}

      {run.status === 'error' && (
        <Card><CardContent className="py-4 text-sm text-red-600">생성 오류: {run.error}</CardContent></Card>
      )}

      {run.status === 'done' && input && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">2. 결과 검토</CardTitle>
            <div className="flex items-center gap-2">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" className="w-56" />
              <Button onClick={onSaveDraft} disabled={saving || !activeCand}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                초안 저장
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {candidates.length === 0 ? (
              <div className="space-y-2 text-sm text-red-600" role="alert">
                <p className="font-medium">
                  {run.result?.diagnostics.preflight?.feasible === false
                    ? '입력 사전 검사에서 중단되었습니다.'
                    : '탐색에서 후보를 찾지 못했습니다.'}
                </p>
                <p>{run.result?.diagnostics.reason}</p>
                {(run.result?.diagnostics.preflight?.studentCapacityIssues?.length ?? 0) > 0 && (
                  <p>수강 명단과 개설강좌의 시수를 원본 자료로 확인한 뒤 다시 생성해 주세요. 현재 시수 초과는 탐색 시간을 늘리거나 분반을 바꿔도 해소되지 않습니다.</p>
                )}
              </div>
            ) : (
              <>
                {run.result?.diagnostics.reason && (
                  <p className="text-xs leading-relaxed rounded-md border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2">
                    {run.result.diagnostics.reason}
                  </p>
                )}
                {(run.result?.diagnostics.infeasibility?.length ?? 0) > 0 && (
                  <div className="text-xs leading-relaxed rounded-md border border-red-300 bg-red-50 text-red-700 px-3 py-2 space-y-1">
                    <p className="font-medium">구조적 불가능 진단 — 아래 원인은 어떤 배치로도 해소할 수 없습니다 (수학적 증명). 상세는 제약 위반 패널을 참고하세요.</p>
                  </div>
                )}
                {activeCand && (() => {
                  const { t0, t1 } = candHardTiers(activeCand);
                  if (t0 > 0) {
                    return (
                      <p className="text-xs leading-relaxed rounded-md border border-red-300 bg-red-50 text-red-700 px-3 py-2">
                        ⚠ 기본 충돌 {t0}건 — 아래 <b>제약 위반 상세</b>에서 학생·교사·칸별 내역을 확인하세요. 확정 전 반드시 해소하세요.
                      </p>
                    );
                  }
                  if (t1 > 0) {
                    return (
                      <p className="text-xs leading-relaxed rounded-md border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2">
                        교사 부하 위반 {t1}건 — 아래 <b>제약 위반 상세</b>에서 교사·분반·요일별 내역을 확인하세요.
                      </p>
                    );
                  }
                  return null;
                })()}
                {activeCand && (
                  <ViolationReportPanel
                    input={reportInput!}
                    placements={activeCand.placements}
                    studentNames={studentNameMap}
                    infeasibility={run.result?.diagnostics.infeasibility}
                  />
                )}
                {activeCand && (
                  <SectioningReportPanel
                    originalLessons={input.lessons}
                    currentLessons={reportInput!.lessons}
                    placements={activeCand.placements}
                    diagnostics={run.result?.diagnostics.sectioning}
                  />
                )}
                <div className="flex items-center gap-2">
                  <Label className="text-xs">후보</Label>
                  <Select value={activeCand?.id} onValueChange={setSelCand}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {candidates.map((c, i) => (
                        <SelectItem key={c.id} value={c.id}>안 {i + 1} (점수 {formatCandidateScore(c.scoreBreakdown.total)})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {activeCand && <CandidateMetricsRow candidate={activeCand} />}
                {activeCand && <CandidatePreview
                  lessons={reportInput!.lessons} candidate={activeCand} grades={input.grades} grid={input.grid}
                  studentDirectory={studentDirectory}
                  originalPlacements={run.result?.candidates.find((c) => c.id === activeCand.id)?.placements}
                  onPlacementsChange={(placements) => setEdits({
                    result: run.result,
                    candidates: candidates.map((c) => c.id === activeCand.id ? editCandidate(input, c, placements) : c),
                  })}
                />}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── 상세 / 확정 ───────────────────────────────────────────────────
function DetailView({ id }: { id: string }) {
  const { data: plan, isLoading, refetch } = useTimetablePlan(id);
  const { toast } = useToast();
  const [selCand, setSelCand] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [studentDirectory, setStudentDirectory] = useState<Map<string, StudentDir>>(() => new Map());
  const [restored, setRestored] = useState<{ plan: typeof plan; lessons: Lesson[] } | null>(null);
  const [restoreError, setRestoreError] = useState('');

  const candidate = useMemo(() => {
    if (!plan) return null;
    const selected = selectedPlanCandidate(plan, selCand);
    return selected && restored?.plan === plan
      ? editCandidate({ ...plan.input_payload, lessons: restored.lessons }, selected, selected.placements)
      : selected;
  }, [plan, selCand, restored]);

  const reportInput = useMemo(() => {
    if (!plan) return null;
    const lessons = restored?.plan === plan ? restored.lessons : plan.input_payload.lessons;
    return {
      ...plan.input_payload,
      lessons: candidate && restored?.plan === plan
        ? candidateLessons({ ...plan.input_payload, lessons }, candidate) : lessons,
    };
  }, [plan, restored, candidate]);

  const studentNameMap = useMemo(() => studentNameMapFromDirectory(studentDirectory), [studentDirectory]);

  useEffect(() => {
    if (!plan) return;
    let cancelled = false;
    setRestoreError('');
    void fetchTimetableSourceData(plan.academic_year, plan.semester, plan.input_payload.grades, plan.input_payload.sourceBasis ?? 'enrollment')
      .then((src) => {
        if (cancelled) return;
        const lessons = restorePlanLessons(plan, src);
        for (const c of plan.candidates) if (c.sectionRoster) candidateLessons({ ...plan.input_payload, lessons }, c);
        setRestored({ plan, lessons });
        setStudentDirectory(buildStudentDirectory(src));
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setStudentDirectory(new Map());
          setRestoreError(e instanceof Error ? e.message : '명단을 복원할 수 없습니다.');
        }
      });
    return () => { cancelled = true; };
  }, [plan]);

  if (isLoading) return <p className="text-muted-foreground">불러오는 중…</p>;
  if (!plan) return <p className="text-muted-foreground">시간표를 찾을 수 없습니다.</p>;
  if (restoreError) return <p role="alert" className="text-red-600">{restoreError}</p>;
  if (plan.candidates.some(c => c.sectionRoster) && restored?.plan !== plan) return <p>저장된 분반 명단을 검증하는 중…</p>;

  const lessons = reportInput!.lessons;

  const doFinalize = async (replaceExisting: boolean) => {
    if (!candidate) return;
    setFinalizing(true);
    try {
      const source = await fetchTimetableSourceData(plan.academic_year, plan.semester, plan.input_payload.grades, plan.input_payload.sourceBasis ?? 'enrollment');
      const placements = candidate.placements;
      const res = await finalizeTimetablePlan({ plan, placements, source, replaceExisting, selectedCandidateId: candidate.id });
      toast({ title: '확정 완료', description: `학생 ${res.studentRows}행 · 교사 ${res.teacherRows}행 반영` });
      refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('덮어쓰') && !replaceExisting) {
        if (window.confirm(`${msg}\n\n기존 timetable-generator 생성분만 교체합니다. 진행할까요?`)) {
          await doFinalize(true);
          return;
        }
      } else {
        toast({ title: '확정 실패', description: msg, variant: 'destructive' });
      }
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild><Link to="/timetable-generator"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div>
            <h1 className="text-2xl font-bold">{plan.title}</h1>
            <p className="text-sm text-muted-foreground">
              {plan.academic_year}-{plan.semester} ·{' '}
              <span className={`px-2 py-0.5 rounded text-xs ${STATUS_STYLE[plan.status] ?? ''}`}>{STATUS_LABEL[plan.status]}</span>
            </p>
          </div>
        </div>
        <Button onClick={() => doFinalize(false)} disabled={finalizing || !candidate}>
          {finalizing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
          {plan.status === 'finalized' ? '재확정' : '확정 (시간표 반영)'}
        </Button>
      </div>

      <Card>
        <CardContent className="py-4 space-y-3">
          {plan.candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">저장된 후보가 없습니다.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Label className="text-xs">후보</Label>
                <Select value={candidate?.id} onValueChange={setSelCand}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plan.candidates.map((c, i) => (
                      <SelectItem key={c.id} value={c.id}>안 {i + 1} (점수 {formatCandidateScore(c.scoreBreakdown.total)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {candidate && <CandidateMetricsRow candidate={candidate} />}
              {candidate && plan.input_payload && (
                <ViolationReportPanel
                  input={reportInput!}
                  placements={candidate.placements}
                  studentNames={studentNameMap}
                  infeasibility={plan.diagnostics?.infeasibility}
                />
              )}
              {candidate && plan.input_payload && (
                <SectioningReportPanel
                  originalLessons={plan.input_payload.lessons}
                  currentLessons={reportInput!.lessons}
                  placements={candidate.placements}
                  diagnostics={plan.diagnostics?.sectioning}
                />
              )}
              {candidate && (
                <CandidatePreview
                  lessons={lessons}
                  candidate={candidate}
                  grades={plan.input_payload.grades}
                  grid={plan.input_payload.grid}
                  studentDirectory={studentDirectory.size > 0 ? studentDirectory : undefined}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LocalPreviewView() {
  const [preview, setPreview] = useState<TimetablePreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const studentNames = useMemo(() => preview ? studentNameMapFromDirectory(preview.studentDirectory) : new Map<string, string>(), [preview]);
  const openFile = async (file: File) => {
    setPreview(null);
    setError('');
    setLoading(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 검증 배치 파일을 선택해 주세요.');
      setPreview(parseTimetablePreview(await file.text()));
    } catch (e) {
      setError(e instanceof SyntaxError ? 'JSON 파일을 읽을 수 없습니다.' : e instanceof Error ? e.message : '파일을 열지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild><Link to="/timetable-generator" aria-label="목록으로"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">검증 배치 미리보기</h1>
      </div>
      <Card><CardContent className="py-4 space-y-3">
        <p className="text-sm text-muted-foreground">검증 배치 파일을 열어 반별·교사별·학생별 시간표를 확인합니다. 파일은 이 브라우저에서만 읽으며 운영 시간표에 반영하지 않습니다. 새로고침하면 파일을 다시 열어 주세요.</p>
        <Label htmlFor="preview-file">검증 배치 파일 (.json)</Label>
        <Input id="preview-file" type="file" accept=".json,application/json" disabled={loading} onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void openFile(file);
        }} />
        {loading && <p role="status" className="text-sm">배치와 수강 명단을 검사하는 중…</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </CardContent></Card>
      {preview && <Card><CardHeader>
        <CardTitle>{preview.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{preview.input.academicYear}학년도 {preview.input.semester}학기 · 학생 {preview.studentDirectory.size}명 · {preview.input.lessons.length}수업 · 읽기 전용</p>
        <p className="text-xs text-muted-foreground">자료 시점: {new Date(preview.capturedAt).toLocaleString('ko-KR')} · 파일에 담긴 수강 명단과 제약 기준 검증 통과 · 분반 정원 35명 · 교실 충돌 검사 {preview.input.options.hard.roomConflict ? '적용' : '미적용'}</p>
      </CardHeader><CardContent className="space-y-4">
        <CandidateMetricsRow candidate={preview.candidate} />
        <ViolationReportPanel input={preview.input} placements={preview.candidate.placements} studentNames={studentNames} />
        <CandidatePreview key={preview.capturedAt} lessons={preview.input.lessons} candidate={preview.candidate}
          grades={preview.input.grades} grid={preview.input.grid} studentDirectory={preview.studentDirectory} />
      </CardContent></Card>}
    </div>
  );
}

export default function TimetableGeneratorPage({ mode }: TimetableGeneratorPageProps) {
  const { id } = useParams();
  return (
    <Layout>
      <PageContainer width="narrow">
        {mode === 'list' && <ListView />}
        {mode === 'new' && <NewView />}
        {mode === 'preview' && <LocalPreviewView />}
        {mode === 'detail' && id && <DetailView id={id} />}
      </PageContainer>
    </Layout>
  );
}
