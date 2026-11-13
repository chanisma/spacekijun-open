// ========================================
// 대상 규칙 빌더 — "1학년 수학 수업 교사", "정보화부장", "2학년 담임" 같은 조건을 쌓는다.
// 규칙은 저장되고, 명단은 서버(resolve_audience)가 푼다. 여기서 명단을 계산하지 않는다.
// 타입·요약 = src/lib/audienceRule.ts
// ========================================

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { useDepartments } from '@/hooks/useDepartments';
import { useResourceTags } from '@/hooks/useResourceTags';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import { useDutySeats } from '@/hooks/useDutySeats';
import {
  AUDIENCE_CRITERION_LABEL,
  AUDIENCE_CRITERION_ORDER,
  TASK_SCOPED_CRITERIA,
  newCriterion,
  type AudienceCriterion,
  type AudienceCriterionType,
  type AudienceRule,
} from '@/lib/audienceRule';
import {
  MULTI_GROUP_CLUSTERS,
  SUBJECT_GROUPS,
  groupsOfCluster,
  shortSubjectGroup,
  type SubjectGroupCatalogRow,
} from '@/lib/subjectClassification';
import { cn } from '@/lib/utils';

const GRADES = [1, 2, 3];
const HOMEROOM_TAG = /^\d+학년\s*\d+반$/;

interface Props {
  value: AudienceRule;
  onChange: (next: AudienceRule) => void;
  disabled?: boolean;
  /**
   * «이 할 일의 담당자» 조건을 고를 수 있는가(2026-10-01). 서버가 그 작업의 할 일로 펼치는 경로
   * (입력 받기·제출 받기)만 켠다 — 아니면 그 조건은 아무도 가리키지 않는다.
   */
  allowTaskScoped?: boolean;
}

export function AudienceRuleBuilder({ value, onChange, disabled, allowTaskScoped = false }: Props) {
  const update = (list: 'include' | 'exclude', index: number, next: AudienceCriterion | null) => {
    const items = [...value[list]];
    if (next === null) items.splice(index, 1);
    else items[index] = next;
    onChange({ ...value, [list]: items });
  };
  const add = (list: 'include' | 'exclude', type: AudienceCriterionType) =>
    onChange({ ...value, [list]: [...value[list], newCriterion(type)] });

  return (
    <div className="space-y-3">
      <CriterionList
        title="포함"
        tone="include"
        items={value.include}
        disabled={disabled}
        onUpdate={(i, c) => update('include', i, c)}
        onAdd={(t) => add('include', t)}
        empty="조건을 추가하세요. 여러 조건은 합쳐집니다(또는)."
        allowTaskScoped={allowTaskScoped}
      />
      {(value.exclude.length > 0 || value.include.length > 0) && (
        <CriterionList
          title="제외"
          tone="exclude"
          items={value.exclude}
          disabled={disabled}
          onUpdate={(i, c) => update('exclude', i, c)}
          onAdd={(t) => add('exclude', t)}
          empty="빼고 싶은 사람·수업이 있으면 추가하세요. 수업 조건은 그 수업만, 나머지는 사람 전체를 뺍니다."
          allowTaskScoped={allowTaskScoped}
        />
      )}
    </div>
  );
}

function CriterionList({
  title,
  tone,
  items,
  disabled,
  onUpdate,
  onAdd,
  empty,
  allowTaskScoped,
}: {
  title: string;
  tone: 'include' | 'exclude';
  items: AudienceCriterion[];
  disabled?: boolean;
  onUpdate: (index: number, next: AudienceCriterion | null) => void;
  onAdd: (type: AudienceCriterionType) => void;
  empty: string;
  allowTaskScoped?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className={cn('text-[11px] font-semibold uppercase tracking-wider', tone === 'include' ? 'text-slate-500' : 'text-rose-500')}>
          {title}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-blue-600" disabled={disabled}>
              {tone === 'include' ? <Plus className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
              {tone === 'include' ? '조건 추가' : '제외 조건 추가'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {AUDIENCE_CRITERION_ORDER
              .filter((t) => tone === 'include' || t !== 'all_faculty')
              .filter((t) => allowTaskScoped || !TASK_SCOPED_CRITERIA.includes(t))
              .map((t) => (
              <DropdownMenuItem key={t} onSelect={() => onAdd(t)}>
                {AUDIENCE_CRITERION_LABEL[t]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-slate-400">{empty}</p>
      ) : (
        items.map((c, i) => (
          <div
            key={i}
            className={cn(
              'flex items-start gap-2 rounded-lg border p-2.5',
              tone === 'include' ? 'border-slate-200 bg-white' : 'border-rose-100 bg-rose-50/40',
            )}
          >
            <span className="mt-0.5 w-16 shrink-0 text-xs font-medium text-slate-600">{AUDIENCE_CRITERION_LABEL[c.type]}</span>
            <div className="min-w-0 flex-1">
              <CriterionEditor value={c} disabled={disabled} onChange={(next) => onUpdate(i, next)} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-slate-400 hover:text-rose-600"
              aria-label="조건 지우기"
              disabled={disabled}
              onClick={() => onUpdate(i, null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))
      )}
    </div>
  );
}

function toggle<T>(list: T[] | undefined, item: T): T[] {
  const set = list ?? [];
  return set.includes(item) ? set.filter((x) => x !== item) : [...set, item];
}

function Chip({ active, onClick, children, disabled, title }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center rounded-md border px-2 text-xs transition-colors disabled:opacity-50',
        active ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  );
}

function GradeChips({ grades, onChange, disabled, allLabel = '전 학년' }: {
  grades: number[] | undefined;
  onChange: (next: number[]) => void;
  disabled?: boolean;
  allLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {GRADES.map((g) => (
        <Chip key={g} active={(grades ?? []).includes(g)} disabled={disabled} onClick={() => onChange(toggle(grades, g))}>
          {g}학년
        </Chip>
      ))}
      {(grades ?? []).length === 0 && <span className="text-[11px] text-slate-400">({allLabel})</span>}
    </div>
  );
}

function useTaughtSubjects() {
  return useQuery({
    queryKey: ['subject-group-catalog'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('subject_group_catalog', {});
      if (error) throw error;
      return (data ?? []) as SubjectGroupCatalogRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 조건 하나의 편집기 — 「조건으로 고르기」 패널(교직원 쪽)도 이것을 그대로 쓴다(2026-10-01).
 * 조건의 화면을 두 벌로 만들지 않는다. 패널은 직접 지정(people)을 메뉴에서 빼서 선택기 안에 선택기를 열지 않는다.
 */
export function CriterionEditor({ value, onChange, disabled }: {
  value: AudienceCriterion;
  onChange: (next: AudienceCriterion) => void;
  disabled?: boolean;
}) {
  switch (value.type) {
    case 'teaching':
      return <TeachingEditor value={value} onChange={onChange} disabled={disabled} />;
    case 'homeroom':
    case 'grade_head':
      return <GradeChips grades={value.grades} disabled={disabled} onChange={(grades) => onChange({ ...value, grades })} />;
    case 'department':
      return <DepartmentEditor value={value} onChange={onChange} disabled={disabled} />;
    case 'seat':
      return <SeatEditor value={value} onChange={onChange} disabled={disabled} />;
    case 'position':
      return (
        <div className="flex flex-wrap gap-1">
          <Chip active={value.kinds.includes('head')} disabled={disabled} onClick={() => onChange({ ...value, kinds: toggle(value.kinds, 'head') })}>
            부장 전원
          </Chip>
          <Chip active={value.kinds.includes('admin')} disabled={disabled} onClick={() => onChange({ ...value, kinds: toggle(value.kinds, 'admin') })}>
            교장·교감
          </Chip>
          <span className="self-center text-[11px] text-slate-400">업무분장 자리 기준</span>
        </div>
      );
    case 'tag':
      return <TagEditor value={value} onChange={onChange} disabled={disabled} />;
    case 'club':
      return <ClubEditor value={value} onChange={onChange} disabled={disabled} />;
    case 'all_faculty':
      return (
        <div className="flex flex-wrap gap-1">
          <Chip active={value.types.includes('teacher')} disabled={disabled} onClick={() => onChange({ ...value, types: toggle(value.types, 'teacher') })}>
            교사
          </Chip>
          <Chip active={value.types.includes('staff')} disabled={disabled} onClick={() => onChange({ ...value, types: toggle(value.types, 'staff') })}>
            직원
          </Chip>
        </div>
      );
    case 'task_assignees':
      // 고를 것이 없다 — 서버가 그 할 일의 지금 담당자로 푼다(담당자를 바꾸면 명단도 따라간다)
      return <p className="pt-0.5 text-xs text-slate-500">담당자를 바꾸면 명단도 함께 바뀝니다.</p>;
    case 'people':
      return (
        <SearchableMultiSelect
          filterByTeacher
          selectedValues={value.ids}
          onSelectionChange={(ids) => onChange({ ...value, ids })}
          placeholder="교직원 선택"
          searchPlaceholder="이름으로 찾기 (초성 가능)"
          emptyText="검색 결과가 없습니다."
          disabled={disabled}
        />
      );
  }
}

function TeachingEditor({ value, onChange, disabled }: {
  value: Extract<AudienceCriterion, { type: 'teaching' }>;
  onChange: (next: AudienceCriterion) => void;
  disabled?: boolean;
}) {
  const { data: catalog = [] } = useTaughtSubjects();
  // 과목 후보 = 올해 개설 과목 중 고른 학년·교과(군)·묶음에 맞는 것.
  // 교과(군)과 묶음은 같은 차원이라 OR — 서버 audience_unit_matches 와 같은 규칙.
  const subjects = useMemo(() => {
    const grades = value.grades ?? [];
    const groups = value.subjectGroups ?? [];
    const clusters = value.subjectClusters ?? [];
    const anyKind = groups.length > 0 || clusters.length > 0;
    return catalog
      .filter((r) => r.teacher_count > 0)
      .filter((r) => grades.length === 0 || r.taught_grades.some((g) => grades.includes(g)))
      .filter((r) => !anyKind
        || (r.subject_group !== null && groups.includes(r.subject_group))
        || (r.subject_cluster !== null && clusters.includes(r.subject_cluster)))
      .map((r) => r.subject_name)
      .sort((a, b) => a.localeCompare(b, 'ko'));
  }, [catalog, value.grades, value.subjectGroups, value.subjectClusters]);
  const noKind = (value.subjectGroups ?? []).length === 0 && (value.subjectClusters ?? []).length === 0;

  return (
    <div className="space-y-1.5">
      <GradeChips grades={value.grades} disabled={disabled} onChange={(grades) => onChange({ ...value, grades })} />
      <div className="flex flex-wrap items-center gap-1">
        {/* 묶음 — 여러 교과(군)를 한 번에(어문학과 = 국어·제2외국어/한문, 예체능 = 기가·정보·체육·예술·교양, 교육학 제외) */}
        {MULTI_GROUP_CLUSTERS.map((c) => (
          <Chip
            key={c}
            title={`${groupsOfCluster(c).join(' · ')}${c === '예체능' ? ' (교육학 제외)' : ''}`}
            active={(value.subjectClusters ?? []).includes(c)}
            disabled={disabled}
            onClick={() => onChange({ ...value, subjectClusters: toggle(value.subjectClusters, c) })}
          >
            {c}
          </Chip>
        ))}
        <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden />
        {SUBJECT_GROUPS.map((g) => (
          <Chip
            key={g}
            title={g}
            active={(value.subjectGroups ?? []).includes(g)}
            disabled={disabled}
            onClick={() => onChange({ ...value, subjectGroups: toggle(value.subjectGroups, g) })}
          >
            {shortSubjectGroup(g)}
          </Chip>
        ))}
        {noKind && <span className="text-[11px] text-slate-400">(전 교과)</span>}
      </div>
      <details className="group">
        <summary className="cursor-pointer select-none text-[11px] text-slate-500 hover:text-slate-700">
          과목으로 더 좁히기 {(value.subjects ?? []).length > 0 && `· ${(value.subjects ?? []).length}개 선택`}
        </summary>
        <div className="mt-1.5 flex max-h-40 flex-wrap gap-1 overflow-y-auto">
          {subjects.map((s) => (
            <Chip
              key={s}
              active={(value.subjects ?? []).includes(s)}
              disabled={disabled}
              onClick={() => onChange({ ...value, subjects: toggle(value.subjects, s) })}
            >
              {s}
            </Chip>
          ))}
          {subjects.length === 0 && <span className="text-[11px] text-slate-400">해당하는 올해 개설 과목이 없습니다.</span>}
        </div>
      </details>
    </div>
  );
}

function DepartmentEditor({ value, onChange, disabled }: {
  value: Extract<AudienceCriterion, { type: 'department' }>;
  onChange: (next: AudienceCriterion) => void;
  disabled?: boolean;
}) {
  const { departmentObjects } = useDepartments({ source: 'database', category: 'school' });
  return (
    <div className="flex flex-wrap gap-1">
      {departmentObjects.map((d) => (
        <Chip key={d.id} active={value.ids.includes(d.id)} disabled={disabled} onClick={() => onChange({ ...value, ids: toggle(value.ids, d.id) })}>
          {d.name}
        </Chip>
      ))}
    </div>
  );
}

function SeatEditor({ value, onChange, disabled }: {
  value: Extract<AudienceCriterion, { type: 'seat' }>;
  onChange: (next: AudienceCriterion) => void;
  disabled?: boolean;
}) {
  const { data: term } = useAcademicTerm();
  const { data: seats = [] } = useDutySeats(term?.year ?? new Date().getFullYear());
  return (
    <div className="flex max-h-44 flex-wrap gap-1 overflow-y-auto">
      {seats.map((s) => (
        <Chip key={s.id} active={value.names.includes(s.name)} disabled={disabled} onClick={() => onChange({ ...value, names: toggle(value.names, s.name) })}>
          {s.name}
        </Chip>
      ))}
      {seats.length === 0 && <span className="text-[11px] text-slate-400">올해 업무분장이 없습니다(관리자 → 업무분장).</span>}
    </div>
  );
}

/** 동아리 — club_info(그 학년도). 고른 동아리가 없으면 동아리 담당 교사 전원 */
function ClubEditor({ value, onChange, disabled }: {
  value: Extract<AudienceCriterion, { type: 'club' }>;
  onChange: (next: AudienceCriterion) => void;
  disabled?: boolean;
}) {
  const { data: term } = useAcademicTerm();
  const year = term?.year ?? new Date().getFullYear();
  const { data: clubs = [] } = useQuery({
    queryKey: ['club-info', 'audience', year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('club_info')
        .select('name, teacher_name, meta')
        .eq('academic_year', year)
        .order('name');
      if (error) throw error;
      // 지금은 없는 동아리(명칭 변경·교체)는 고를 수 없다 — 서버도 대상에서 뺀다
      return ((data ?? []) as { name: string; teacher_name: string | null; meta: { place?: string; status?: string } | null }[])
        .filter((c) => c.meta?.status !== 'inactive');
    },
    staleTime: 5 * 60 * 1000,
  });
  return (
    <div className="space-y-1">
      <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
        {clubs.map((c) => (
          <Chip
            key={c.name}
            title={[c.teacher_name && `담당 ${c.teacher_name}`, c.meta?.place && `장소 ${c.meta.place}`].filter(Boolean).join(' · ')}
            active={value.names.includes(c.name)}
            disabled={disabled}
            onClick={() => onChange({ ...value, names: toggle(value.names, c.name) })}
          >
            {c.name}
          </Chip>
        ))}
        {clubs.length === 0 && <span className="text-[11px] text-slate-400">{year}학년도 동아리 목록이 없습니다.</span>}
      </div>
      {value.names.length === 0 && clubs.length > 0 && (
        <span className="text-[11px] text-slate-400">(동아리 담당 교사 전원 · 동아리를 고르면 그 담당 교사만)</span>
      )}
    </div>
  );
}

function TagEditor({ value, onChange, disabled }: {
  value: Extract<AudienceCriterion, { type: 'tag' }>;
  onChange: (next: AudienceCriterion) => void;
  disabled?: boolean;
}) {
  const { data: tags = [] } = useResourceTags();
  // 학급 담임 태그는 [담임] 조건으로 고른다 — 27개가 목록을 덮지 않게 뺀다
  const visible = (tags as { id: string; name: string }[]).filter((t) => !HOMEROOM_TAG.test(t.name));
  return (
    <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
      {visible.map((t) => (
        <Chip key={t.id} active={value.ids.includes(t.id)} disabled={disabled} onClick={() => onChange({ ...value, ids: toggle(value.ids, t.id) })}>
          {t.name}
        </Chip>
      ))}
    </div>
  );
}
