import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * 그 과목이 이 학생에게 **어느 시점인가**.
 *
 * 2026-09-12 사용자 지시로 `past` 를 되살리고 `upcoming`·`planned` 를 갈랐다.
 * 종전엔 조회 자체가 `grade >= 현재 학년` 이라 **3학년에게 1·2학년 과목이 아예 없었고**,
 * 미래는 편제 유무로만 잡혀 수요조사로 신청한 과목이 드러나지 않았다.
 *
 * - `past`     이수 완료 — 지난 학기까지 실제로 들은 과목(`academic_development`)
 * - `current`  이수 중 — 현재 학년도·학기
 * - `upcoming` 편성 확정 — 미래 학기지만 `student_enrollment` 에 이미 배정돼 있다
 * - `required` **지정** — 교육과정에 있지만 수요조사의 선택지가 아니었던 과목 = **전원 수강**.
 *                신청 데이터에는 애초에 없어 종전에는 통째로 빠져 있었다.
 * - `planned`  신청 — 수요조사(`course_selection_item`)에서 고른 과목. 개설이 취소될 수 있다
 */
export type CurriculumSubjectStatus = 'past' | 'current' | 'upcoming' | 'required' | 'planned';

export interface CurriculumSubjectEnrollment {
  grade: number;
  semester: number;
  academic_year: number;
  status: CurriculumSubjectStatus;
}

export interface CurriculumSubjectOption {
  subject: string;
  area: string | null;
  category: string | null;
  enrollment: CurriculumSubjectEnrollment | null;
}

function todaySemester(today = new Date()): { year: number; semester: number } {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  // Korean academic year: 1학기 = Mar-Aug, 2학기 = Sep-Feb (next calendar year).
  // We treat Jan-Feb as 2학기 of the prior academic year.
  if (month >= 3 && month <= 8) return { year, semester: 1 };
  if (month >= 9) return { year, semester: 2 };
  return { year: year - 1, semester: 2 };
}

/** 확정된 사실(이수·편성)의 시점 판정. 신청(`planned`)은 여기를 거치지 않는다. */
function classifyConfirmed(year: number, semester: number): 'past' | 'current' | 'upcoming' {
  const t = todaySemester();
  if (year < t.year) return 'past';
  if (year > t.year) return 'upcoming';
  if (semester === t.semester) return 'current';
  return semester > t.semester ? 'upcoming' : 'past';
}

function admissionYearFromId(studentId: string): number | null {
  const yearPart = studentId.slice(0, 2);
  const y = Number.parseInt(yearPart, 10);
  if (!Number.isFinite(y)) return null;
  return 2000 + y;
}

// Bump this when changing the filter logic so stale TanStack Query caches don't
// return data from older code paths.
const CURRICULUM_QUERY_VERSION = 'v4-required-subjects';

/** 시점이 겹치면 **가까운 쪽**을 남긴다. 한 과목이 여러 학기에 걸치는 일이 흔하다(종교학·체육 등). */
const STATUS_PRIORITY: Record<CurriculumSubjectStatus, number> = {
  current: 5,
  upcoming: 4,  // 확정 편성 — 배정이 끝났다
  required: 3,  // 지정 — 전원 수강이라 확실하지만 배정 전이다
  planned: 2,   // 신청 — 개설이 바뀔 수 있다
  past: 1,
};

// Exported so InquiryDesignPage can resolve a subject name (e.g. a
// recommendation's anchor_subject) to a full option with enrollment info when
// seeding a design from the comprehensive-analysis tab.
export function useCurriculumSubjects(studentId: string | null) {
  return useQuery<CurriculumSubjectOption[]>({
    queryKey: ['inquiry-design', 'curriculum-subjects', CURRICULUM_QUERY_VERSION, studentId],
    queryFn: async () => {
      if (!studentId) return [];

      const admissionYear = admissionYearFromId(studentId);
      if (admissionYear === null) return [];

      // 0) 학생 맥락 + **실제 이수 이력**. `academic_development` 는 학생부 원본이라
      //    "무엇을 들었는가"의 정본이다(3학년이면 1-1부터 전부 들어 있다).
      const { data: profile } = await supabase
        .from('student_basic_info')
        .select('name, grade, academic_development')
        .eq('id', studentId)
        .single();

      // 시점이 가장 가까운 것 하나만 남긴다.
      const best = new Map<string, { priority: number; entry: CurriculumSubjectEnrollment }>();
      const remember = (subject: string, entry: CurriculumSubjectEnrollment) => {
        if (!subject) return;
        const priority = STATUS_PRIORITY[entry.status];
        const existing = best.get(subject);
        if (!existing || priority > existing.priority) best.set(subject, { priority, entry });
      };

      // 1) 이수 완료·이수 중 — 학생부 교과 기록.
      //    `academic_year` 가 이 배열에 없으므로 입학연도 + 학년으로 유도한다
      //    (학년도 = 입학연도 + 학년 - 1, 이 저장소의 방과후 유도와 같은 식).
      const development = Array.isArray(profile?.academic_development)
        ? (profile!.academic_development as Array<Record<string, unknown>>)
        : [];
      for (const row of development) {
        const subject = typeof row.subject === 'string' ? row.subject : '';
        const grade = Number(row.grade);
        const semester = Number(row.semester);
        if (!subject || !Number.isFinite(grade) || !Number.isFinite(semester)) continue;
        const academicYear = admissionYear + grade - 1;
        remember(subject, {
          grade,
          semester,
          academic_year: academicYear,
          status: classifyConfirmed(academicYear, semester),
        });
      }

      // 2) 확정 편성 — 학년 제한 없이 전부 본다. 3학년에게는 다음 학기(3-2)가 여기 있다.
      //    ** 이름으로 매칭하지 않는다** — 동명이인이 있고(이 저장소의 실제 사례),
      //    이름 매칭은 오류가 아니라 **남의 과목이 섞이는** 형태로 조용히 틀린다.
      const { data: resourceRow } = await supabase
        .from('resource')
        .select('id')
        .eq('type', 'student')
        .eq('meta->>id', studentId)
        .maybeSingle();
      if (resourceRow?.id) {
        const { data: rows } = await supabase
          .from('student_enrollment')
          .select('subject_name, student_grade, semester, academic_year')
          .eq('student_resource_id', resourceRow.id);
        for (const e of rows ?? []) {
          if (!e.subject_name) continue;
          remember(e.subject_name, {
            grade: e.student_grade,
            semester: e.semester,
            academic_year: e.academic_year,
            status: classifyConfirmed(e.academic_year, e.semester),
          });
        }
      }

      // 3) 수요조사 신청 — 1·2학년이 "앞으로 들을 과목"을 아는 유일한 경로다.
      //    학년·학년도는 **그룹**에서 따라간다 — 라운드 연도를 쓰면 한 라운드가 두 학년치를
      //    함께 조사하는 경우(실재한다) 과목이 엉뚱한 학년으로 들어간다.
      const { data: submissions } = await supabase
        .from('course_selection_submission')
        .select('id')
        .eq('student_code', studentId);
      const submissionIds = (submissions ?? []).map((r: { id: string }) => r.id);
      if (submissionIds.length > 0) {
        const { data: items } = await supabase
          .from('course_selection_item')
          .select('subject_name, semester, course_selection_slot(course_selection_group(academic_year, target_grade))')
          .in('submission_id', submissionIds);
        for (const item of items ?? []) {
          const slot = (item as Record<string, unknown>).course_selection_slot as
            | { course_selection_group?: { academic_year?: number; target_grade?: number } }
            | null;
          const group = slot?.course_selection_group;
          if (!item.subject_name || !group?.academic_year || !group?.target_grade) continue;
          remember(item.subject_name, {
            grade: group.target_grade,
            semester: item.semester ?? 1,
            academic_year: group.academic_year,
            // 신청은 **확정이 아니다** — 개설이 취소되기도 한다(실제 사례 있음).
            // 시점으로 past/current 를 계산하지 않고 따로 부른다.
            status: 'planned',
          });
        }
      }

      // 4) 코호트 편제. **지정과목 판정을 서버에서 받는다** — 규칙이
      //    "편제 − 수요조사 선택지"라 4개 표를 조인해야 하고, 이 저장소가 그 규칙으로
      //    두 번 틀린 적이 있어 한 곳(`get_curriculum_subject_plan`)에 둔다.
      // 새 RPC 는 생성된 `types.ts` 에 없다 — 이 저장소 관례대로 캐스팅한다
      // (`schoolExamService`·`contextService` 와 동일).
      const { data: planRows, error: planErr } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
      }).rpc('get_curriculum_subject_plan', { p_admission_year: admissionYear });
      if (planErr) throw new Error(planErr.message);

      const meta = new Map<string, { area: string | null; category: string | null }>();
      for (const raw of (planRows ?? []) as Array<Record<string, unknown>>) {
        const subject = typeof raw.subject === 'string' ? raw.subject : '';
        if (!subject) continue;
        if (!meta.has(subject)) {
          meta.set(subject, {
            area: (raw.area as string | null) ?? null,
            category: (raw.category as string | null) ?? null,
          });
        }

        // **지정과목**(전원 수강)을 시점에 넣는다. 수요조사를 아는 학기에서만 주장한다 —
        // 모르는 해는 편제 전체가 "지정 후보"로 잡혀 거짓이 된다(실측: adm2026 의 2026학년도 12/12).
        if (!raw.is_required || !raw.has_survey) continue;
        const academicYear = Number(raw.academic_year);
        const gradeNo = Number(raw.grade);
        const semesterNo = Number(raw.semester);
        if (!Number.isFinite(academicYear) || !Number.isFinite(gradeNo) || !Number.isFinite(semesterNo)) continue;
        // 지난 학기의 지정과목은 이미 `academic_development` 가 사실로 갖고 있다.
        // 여기서 덮어쓰면 "이수 완료"가 "지정"으로 뒤집힌다.
        if (classifyConfirmed(academicYear, semesterNo) !== 'upcoming') continue;
        remember(subject, {
          grade: gradeNo,
          semester: semesterNo,
          academic_year: academicYear,
          status: 'required',
        });
      }

      // 5) 합치기. 개인 이력이 있는 과목이 먼저, 그다음 편제에만 있는 과목.
      const options: CurriculumSubjectOption[] = [];
      const seen = new Set<string>();
      for (const [subject, v] of best) {
        const m = meta.get(subject);
        options.push({ subject, area: m?.area ?? null, category: m?.category ?? null, enrollment: v.entry });
        seen.add(subject);
      }
      for (const [subject, m] of meta) {
        if (seen.has(subject)) continue;
        options.push({ subject, area: m.area, category: m.category, enrollment: null });
      }

      // 6) 정렬: 시점 우선순위 -> 가나다.
      const sortRank = (o: CurriculumSubjectOption): number =>
        o.enrollment ? 5 - STATUS_PRIORITY[o.enrollment.status] : 5;
      options.sort((a, b) => {
        const ra = sortRank(a);
        const rb = sortRank(b);
        if (ra !== rb) return ra - rb;
        return a.subject.localeCompare(b.subject, 'ko');
      });

      return options;
    },
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
  });
}

interface CurriculumSubjectComboboxProps {
  studentId: string | null;
  value: string | null;
  onSelect: (option: CurriculumSubjectOption) => void;
}

export const STATUS_LABEL: Record<CurriculumSubjectStatus, string> = {
  current: '이수 중',
  upcoming: '편성 확정',
  required: '지정',
  planned: '신청',
  past: '이수 완료',
};

/** 묶음 순서 = 가까운 시점부터. 편제에만 있는 과목(`enrollment === null`)이 맨 뒤. */
const BUCKET_ORDER: Array<{ key: CurriculumSubjectStatus; heading: string; hint?: string }> = [
  { key: 'current', heading: '이수 중' },
  { key: 'upcoming', heading: '편성 확정', hint: '다음 학기에 배정된 과목' },
  { key: 'required', heading: '지정', hint: '전원이 듣는 과목 · 신청 대상이 아니에요' },
  { key: 'planned', heading: '신청', hint: '수요조사에서 고른 과목 · 개설이 바뀔 수 있어요' },
  { key: 'past', heading: '이수 완료', hint: '지난 학기에 들은 과목' },
];

export function CurriculumSubjectCombobox({ studentId, value, onSelect }: CurriculumSubjectComboboxProps) {
  const [open, setOpen] = useState(false);
  const { data = [], isFetching } = useCurriculumSubjects(studentId);

  const partitioned = useMemo(() => {
    // 시점별 묶음 + 편제에만 있는 과목. 개인 이력이 하나도 없으면(전입 직후 등)
    // `other` 만 채워지므로 목록이 비지는 않는다.
    const buckets = new Map<CurriculumSubjectStatus, CurriculumSubjectOption[]>(
      BUCKET_ORDER.map((b) => [b.key, [] as CurriculumSubjectOption[]])
    );
    const other: CurriculumSubjectOption[] = [];
    for (const o of data) {
      const list = o.enrollment ? buckets.get(o.enrollment.status) : undefined;
      if (list) list.push(o);
      else other.push(o);
    }
    return { buckets, other };
  }, [data]);

  const handleSelect = (option: CurriculumSubjectOption) => {
    onSelect(option);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
          <span className="truncate text-left">
            {value ?? (isFetching ? '불러오는 중…' : '교과 검색')}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <Command>
          <CommandInput placeholder="과목 검색…" />
          <CommandList className="max-h-[360px]">
            <CommandEmpty>일치하는 과목이 없습니다.</CommandEmpty>
            {BUCKET_ORDER.map(({ key, heading, hint }) => {
              const list = partitioned.buckets.get(key) ?? [];
              if (list.length === 0) return null;
              return (
                <CommandGroup key={key} heading={`${heading} (${list.length})${hint ? ` · ${hint}` : ''}`}>
                  {list.map((s2) => (
                    <SubjectItem key={`${key}-${s2.subject}`} option={s2} value={value} onSelect={handleSelect} />
                  ))}
                </CommandGroup>
              );
            })}
            {partitioned.other.length > 0 && (
              <CommandGroup heading={`기타 교육과정 (${partitioned.other.length})`}>
                {partitioned.other.map((s2) => (
                  <SubjectItem key={`o-${s2.subject}`} option={s2} value={value} onSelect={handleSelect} />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface SubjectItemProps {
  option: CurriculumSubjectOption;
  value: string | null;
  onSelect: (option: CurriculumSubjectOption) => void;
}

function SubjectItem({ option, value, onSelect }: SubjectItemProps) {
  const enr = option.enrollment;
  const isSelected = value === option.subject;
  return (
    <CommandItem value={option.subject} onSelect={() => onSelect(option)} className="flex items-center gap-2">
      <Check className={cn('h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
      <span className="truncate text-sm">{option.subject}</span>
      <div className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-400">
        {enr && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
            {enr.academic_year} · {enr.grade}-{enr.semester}
          </span>
        )}
        {option.area && <span className="rounded bg-slate-50 px-1.5 py-0.5">{option.area}</span>}
        {enr && <span className="text-slate-500">{STATUS_LABEL[enr.status]}</span>}
      </div>
    </CommandItem>
  );
}

export function synthesizeTargetFromCurriculum(
  option: CurriculumSubjectOption,
  studentGrade: number | null
): { id: string; kind: 'subject'; name: string; academic_year: number; grade: number; semester: number | null; source: string; ref: Record<string, unknown> } {
  const today = todaySemester();
  return {
    id: `curriculum::${option.subject}::${option.enrollment?.academic_year ?? today.year}::${option.enrollment?.semester ?? 0}`,
    kind: 'subject',
    name: option.subject,
    academic_year: option.enrollment?.academic_year ?? today.year,
    grade: option.enrollment?.grade ?? studentGrade ?? 1,
    semester: option.enrollment?.semester ?? null,
    source: option.enrollment ? `enrollment-${option.enrollment.status}` : 'curriculum',
    ref: {
      subject: option.subject,
      area: option.area,
      category: option.category,
      enrolled: !!option.enrollment,
      enrollment_status: option.enrollment?.status ?? null,
    },
  };
}
