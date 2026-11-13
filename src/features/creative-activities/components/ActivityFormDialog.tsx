// ========================================
// 활동 생성·편집
//
// 폼의 순서가 곧 설계의 주장이다: **무엇을 했는가**가 맨 위에 오고
// 주최(동아리)는 그 아래 맥락 칸에 있다. 동아리를 먼저 고르게 하면
// "동아리 기록"이라는 옛 사고로 되돌아간다.
//
// 디자인 규약 = components/tasks/dialogDesign.tsx 공용 부품.
// ========================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { matchInquiryClubHost } from '../utils/inquiryClubHost';
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  GitBranch,
  History,
  Loader2,
  Save,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';
import { useActivityHosts } from '../hooks/useActivityHosts';
import { findSimilarActivities, type SimilarActivity } from '../services/activityService';
import { useLineageNodes } from '../hooks/useActivities';
import { useActivityPosts } from '../hooks/useActivityPosts';
import { getLineageParentCandidates } from '../utils/lineage';
import {
  ACTIVITY_AREA_GROUPS,
  ACTIVITY_SCALES,
  ACTIVITY_STATUSES,
  BUDGET_SOURCES,
  OPERATOR_TYPES,
  areaForGroup,
  getAreaGroup,
  getAreaGroupLabel,
  getAreaGroupTone,
  getBudgetSourceLabel,
  getHostKindLabel,
  getOperatorLabel,
  getScaleLabel,
  getStatusLabel,
  type ActivityAreaGroup,
} from '../utils/activityLabels';
import { ParticipantPicker } from './ParticipantPicker';
import type {
  ActivityArea,
  ActivityHost,
  ActivityBudgetSource,
  ActivityInput,
  ActivityOperatorType,
  ActivityScale,
  ActivityStatus,
  ActivityTeacherRole,
  ActivityWithContext,
  ParticipantInput,
} from '../types';

const NONE = '__none__';

interface ActivityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 편집 모드면 대상 활동 */
  activity?: ActivityWithContext | null;
  /** 편집 모드에서 기존 참여자 */
  initialParticipants?: ParticipantInput[];
  onSubmit: (payload: {
    input: ActivityInput;
    teachers: { resource_id: string; role: ActivityTeacherRole }[];
    participants: ParticipantInput[];
    /** 주최(다대다) — 첫 항목이 대표 */
    hostIds: string[];
  }) => Promise<void> | void;
  isSubmitting?: boolean;
  /** 신규 생성 시 담당교사로 미리 채울 내 리소스 id */
  myResourceId?: string | null;
  /** 학생 모드 — 동아리 영역만, 주최는 내 소속 동아리로 한정하고 필수 */
  clubOnly?: boolean;
  /** 학생 모드에서 고를 수 있는 주최(내 소속 동아리) */
  myHosts?: ActivityHost[];
  /**
   * 신규 생성 시 미리 채울 값. 제안을 활동으로 개설할 때 쓴다
   * — 제안의 `parent_activity_id`가 그대로 계보 부모가 된다.
   */
  seed?: {
    name?: string;
    areaGroup?: ActivityAreaGroup;
    careerFields?: string[];
    lineageParentId?: string | null;
    // AI 초안(ActivityDraftWidget)에서 오는 값들
    content?: string;
    startsOn?: string;
    endsOn?: string | null;
    place?: string;
    hostId?: string | null;
    hostClubName?: string;
    operatorName?: string;
    keywords?: string[];
    relatedSubjects?: string[];
  } | null;
}

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 쉼표·공백으로 나눈 태그 입력 → 배열 (빈 값·중복 제거) */
function parseTags(raw: string): string[] {
  return [...new Set(raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))];
}

export function ActivityFormDialog({
  open,
  onOpenChange,
  activity,
  initialParticipants,
  onSubmit,
  isSubmitting,
  myResourceId,
  seed,
  clubOnly = false,
  myHosts,
}: ActivityFormDialogProps) {
  const isEdit = !!activity;
  const { data: term } = useAcademicTerm();
  const hostsQuery = useActivityHosts();
  const hosts = hostsQuery.data ?? [];
  const { data: lineageNodes = [] } = useLineageNodes();

  // ── 무엇을 했는가 ──
  const [name, setName] = useState('');
  const [areaGroup, setAreaGroup] = useState<ActivityAreaGroup>('club');
  const [content, setContent] = useState('');
  // 진로·분야 — 첫 화면의 카테고리 축이라 본문 필수 입력으로 올렸다(쉼표 구분 다중값)
  const [careerFields, setCareerFields] = useState('');

  // ── 언제·어디서 ──
  const [academicYear, setAcademicYear] = useState<number>(term?.year ?? new Date().getFullYear());
  const [semester, setSemester] = useState<string>(String(term?.semester ?? 1));
  const [startsOn, setStartsOn] = useState(todayISO());
  const [endsOn, setEndsOn] = useState('');
  const [place, setPlace] = useState('');

  // ── 맥락·계보 ──
  // 주최는 다대다다 — 첫 항목이 대표 주최(primary)
  const [hostIds, setHostIds] = useState<string[]>([]);
  const hostSeedHandled = useRef(false);
  const changeHostIds = (ids: string[]) => {
    hostSeedHandled.current = true;
    setHostIds(ids);
  };
  const [lineageParentId, setLineageParentId] = useState<string>(NONE);
  const [lineageNote, setLineageNote] = useState('');

  // ── 운영·예산 ──
  const [operatorType, setOperatorType] = useState<ActivityOperatorType>('internal');
  const [operatorName, setOperatorName] = useState('');
  const [scale, setScale] = useState<ActivityScale>('group');
  const [budgetSource, setBudgetSource] = useState<string>(NONE);
  const [budgetProgram, setBudgetProgram] = useState('');
  const [budgetPlanned, setBudgetPlanned] = useState('');
  const [budgetSpent, setBudgetSpent] = useState('');

  // ── 분류 ──
  const [keywords, setKeywords] = useState('');
  const [relatedSubjects, setRelatedSubjects] = useState('');

  const [status, setStatus] = useState<ActivityStatus>('done');
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  const [participants, setParticipants] = useState<ParticipantInput[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 중복 감지 — 이름을 적는 동안 비슷한 활동을 찾아 보여 준다.
  // 편집 중에는 하지 않는다(자기 자신이 잡히고, 이미 만들어진 활동이라 의미가 없다).
  const [similar, setSimilar] = useState<SimilarActivity[]>([]);

  // 열릴 때 1회 시딩. 폼을 쓰는 중에 라이브 쿼리가 값을 지우면 안 된다.
  useEffect(() => {
    if (!open) return;

    hostSeedHandled.current = !!activity || !!seed?.hostId;
    if (activity) {
      setName(activity.name);
      setAreaGroup(getAreaGroup(activity.area));
      setContent(activity.content ?? '');
      setAcademicYear(activity.academic_year);
      setSemester(activity.semester ? String(activity.semester) : NONE);
      setStartsOn(activity.starts_on);
      setEndsOn(activity.ends_on ?? '');
      setPlace(activity.place ?? '');
      setHostIds(activity.hosts.map((h) => h.id));
      setLineageParentId(activity.lineage_parent_id ?? NONE);
      setLineageNote(activity.lineage_note ?? '');
      setOperatorType(activity.operator_type);
      setOperatorName(activity.operator_name ?? '');
      setScale(activity.scale);
      setBudgetSource(activity.budget_source ?? NONE);
      setBudgetProgram(activity.budget_program ?? '');
      setBudgetPlanned(activity.budget_planned != null ? String(activity.budget_planned) : '');
      setBudgetSpent(activity.budget_spent != null ? String(activity.budget_spent) : '');
      setKeywords(activity.keywords.join(', '));
      setRelatedSubjects(activity.related_subjects.join(', '));
      setCareerFields(activity.career_fields.join(', '));
      setStatus(activity.status);
      setTeacherIds(activity.teachers.map((t) => t.resource_id));
      setParticipants(initialParticipants ?? []);
      setShowAdvanced(
        !!activity.budget_source || activity.keywords.length > 0 || !!activity.lineage_parent_id
      );
    } else {
      setName(seed?.name ?? '');
      setAreaGroup(seed?.areaGroup ?? 'club');
      setContent(seed?.content ?? '');
      setCareerFields((seed?.careerFields ?? []).join(', '));
      setAcademicYear(term?.year ?? new Date().getFullYear());
      setSemester(String(term?.semester ?? 1));
      setStartsOn(seed?.startsOn ?? todayISO());
      setEndsOn(seed?.endsOn ?? '');
      setPlace(seed?.place ?? '');
      setHostIds(seed?.hostId ? [seed.hostId] : []);
      setLineageParentId(seed?.lineageParentId ?? NONE);
      setLineageNote('');
      // 업체명이 있으면 외부 운영으로 본다 — 교내 운영에 업체명이 붙는 조합은 없다
      setOperatorType(seed?.operatorName ? 'external' : 'internal');
      setOperatorName(seed?.operatorName ?? '');
      setScale('group');
      setBudgetSource(NONE);
      setBudgetProgram('');
      setBudgetPlanned('');
      setBudgetSpent('');
      setKeywords((seed?.keywords ?? []).join(', '));
      setRelatedSubjects((seed?.relatedSubjects ?? []).join(', '));
      setStatus('done');
      setTeacherIds(myResourceId ? [myResourceId] : []);
      setParticipants([]);
      // 계보·예산·분류 칸에 씨앗 값이 있으면 펼쳐 보여 준다(안 보이는 값이 저장되면 안 된다)
      setShowAdvanced(
        !!seed?.lineageParentId || !!seed?.operatorName || !!seed?.keywords?.length
      );
    }
    // open이 바뀔 때만 — 폼 사용 중 재시딩 방지
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activity?.id]);

  // 주최를 고르면 그 맥락의 기본 영역을 따라간다(신규 작성일 때만 — 편집 중 덮어쓰기 방지)
  // 학생은 자기 소속 동아리에서만 고른다(서버도 같은 제약 — can_link_activity_host)
  const hostOptions = clubOnly ? (myHosts ?? []) : hosts;
  const matchedClubHost = matchInquiryClubHost(seed?.hostClubName, hostOptions);
  // 주최 목록이 폼보다 늦게 도착해도 한 번만 적용한다. 사용자가 고른 값은 보존한다.
  useEffect(() => {
    if (!open || isEdit || hostSeedHandled.current || !seed?.hostClubName) return;
    if (clubOnly ? myHosts === undefined : !hostsQuery.isSuccess) return;
    if (!matchedClubHost) return;
    hostSeedHandled.current = true;
    setHostIds([matchedClubHost.id]);
  }, [open, isEdit, seed?.hostClubName, clubOnly, myHosts, hostsQuery.isSuccess, matchedClubHost]);

  const selectedHosts = hostIds
    .map((id) => hostOptions.find((h) => h.id === id) ?? hosts.find((h) => h.id === id))
    .filter((h): h is ActivityHost => !!h);
  const selectedHost = selectedHosts[0] ?? null;
  useEffect(() => {
    if (isEdit || clubOnly || !selectedHost?.default_area) return;
    setAreaGroup(getAreaGroup(selectedHost.default_area));
  }, [selectedHost?.id, selectedHost?.default_area, isEdit, clubOnly]);

  // 학생은 동아리 영역 고정 — 서버도 강제하지만 화면이 먼저 고정해 혼선을 없앤다
  useEffect(() => {
    if (clubOnly && areaGroup !== 'club') setAreaGroup('club');
  }, [clubOnly, areaGroup]);

  const debouncedName = useDebounce(name, 500);
  useEffect(() => {
    if (!open || isEdit) {
      setSimilar([]);
      return;
    }
    const n = debouncedName.trim();
    if (n.length < 3) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    void findSimilarActivities(n, academicYear).then((rows) => {
      if (!cancelled) setSimilar(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, isEdit, debouncedName, academicYear]);

  // 계보 부모 후보 — 자기 자신·자손은 제외(순환 방지)
  const lineageCandidates = useMemo(
    () => getLineageParentCandidates(activity?.id ?? null, lineageNodes),
    [activity?.id, lineageNodes]
  );

  // 계보 부모를 고르면 그 활동의 **운영 회고**를 자동으로 띄운다.
  // 다음 해 담당자가 "무엇이 잘됐고 무엇을 바꿔야 하는지"를 폼에서 바로 보는 것이
  // 인수인계의 실질이다(소통 루프 D).
  const parentId = lineageParentId === NONE ? null : lineageParentId;
  const { data: parentPosts = [] } = useActivityPosts(parentId, showAdvanced);
  const inheritedNotes = useMemo(
    () => parentPosts.filter((p) => p.kind === 'retrospective' || p.kind === 'log'),
    [parentPosts]
  );

  const tone = getAreaGroupTone(areaGroup);

  // 주최(동아리) 선택은 영역이 '동아리'일 때만 노출한다 — 자율·진로·봉사 활동에
  // 동아리 목록을 보여 줄 이유가 없다.
  // 학생 모드에서는 주최가 필수이므로 항상 보여 준다
  const showHostPicker = areaGroup === 'club' || clubOnly;
  // 학생은 주최(동아리)를 반드시 골라야 한다 — 없으면 서버가 참여자 등록을 막는다
  const canSubmit =
    name.trim().length > 0 && !!startsOn && !isSubmitting && (!clubOnly || hostIds.length > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    // 편집 시 영역을 그룹으로만 고르므로, 이미 같은 그룹이면 **원래 값을 보존**한다.
    // 그러지 않으면 기존 '진로활동' 행이 저장만 눌러도 조용히 '자율활동'으로 바뀐다.
    const resolvedArea: ActivityArea =
      activity && getAreaGroup(activity.area) === areaGroup
        ? activity.area
        : areaForGroup(areaGroup);

    const input: ActivityInput = {
      name: name.trim(),
      area: resolvedArea,
      content: content.trim() || null,
      academic_year: academicYear,
      semester: semester === NONE ? null : Number(semester),
      starts_on: startsOn,
      ends_on: endsOn || null,
      place: place.trim() || null,
      lineage_parent_id: lineageParentId === NONE ? null : lineageParentId,
      lineage_note: lineageNote.trim() || null,
      operator_type: operatorType,
      operator_name: operatorName.trim() || null,
      scale,
      budget_source: budgetSource === NONE ? null : (budgetSource as ActivityBudgetSource),
      budget_program: budgetProgram.trim() || null,
      budget_planned: budgetPlanned ? Number(budgetPlanned) : null,
      budget_spent: budgetSpent ? Number(budgetSpent) : null,
      keywords: parseTags(keywords),
      related_subjects: parseTags(relatedSubjects),
      career_fields: parseTags(careerFields),
      status,
    };

    await onSubmit({
      input,
      teachers: teacherIds.map((id, i) => ({
        resource_id: id,
        role: (i === 0 ? 'lead' : 'co') as ActivityTeacherRole,
      })),
      participants,
      hostIds,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2">
            <TitleIconChip icon={Sparkles} tone="indigo" />
            <DialogTitle className="text-base">
              {isEdit ? '활동 수정' : '활동 기록'}
            </DialogTitle>
          </div>
          <DialogDescription className="mt-1 text-xs text-slate-500">
            동아리가 아니라 <span className="font-medium text-slate-600">그 동아리가 진행한 활동</span>을
            기록합니다. 활동에 이름을 붙여야 나중에 찾고 이어갈 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(92vh-11rem)] space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          {/* ── 무엇을 했는가 — 맨 위에 온다 ── */}
          <section className="space-y-3">
            <SectionLabel icon={Sparkles}>무엇을 했는가</SectionLabel>

            <div className="space-y-1.5">
              <Label htmlFor="ca-name" className="text-xs text-slate-600">
                활동 이름 <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="ca-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9"
                autoFocus
              />
            </div>

            <div className={cn('grid gap-3', showHostPicker && 'sm:grid-cols-2')}>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">영역</Label>
                <Select
                  value={areaGroup}
                  onValueChange={(v) => {
                    const next = v as ActivityAreaGroup;
                    setAreaGroup(next);
                    // 숨겨진 주최가 조용히 저장되지 않게 비운다.
                    // effect가 아니라 여기서 하는 이유: 편집 시딩을 건드리면 안 된다.
                    if (next !== 'club' && !clubOnly) changeHostIds([]);
                  }}
                >
                  <SelectTrigger className={cn('h-9', tone.text)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_AREA_GROUPS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {getAreaGroupLabel(g)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 주최(동아리) 선택은 영역이 '동아리'일 때만 — 자율·진로·봉사 활동에는
                  주최 맥락이 없거나 학년·학교 단위라 동아리 목록을 보여 줄 이유가 없다. */}
              {/*
                주최는 **여러 개**를 걸 수 있다 — 하나의 활동을 여러 동아리가 함께 하는
                경우가 실제로 있다. 첫 번째가 대표 주최이며 목록·카드가 그것을 보여 준다.
              */}
              {showHostPicker && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-600">
                    주최 동아리
                    {clubOnly ? <span className="text-rose-500"> *</span> : ' (선택 · 여러 곳 가능)'}
                  </Label>

                  {!isEdit && seed?.hostClubName && (
                    <p className="text-xs leading-5 text-slate-500" role="status">
                      원본 동아리: <span className="font-medium text-slate-700">{seed.hostClubName}</span>
                      {hostIds.length > 0 ? ' · 선택한 주최 동아리를 확인해 주세요.'
                        : hostsQuery.isError ? ' · 동아리 목록을 불러오지 못했습니다.'
                        : !hostsQuery.isSuccess || (clubOnly && myHosts === undefined) ? ' · 동아리 목록을 확인하고 있습니다.'
                        : !matchedClubHost ? ' · 이름이 일치하는 동아리를 하나로 확인할 수 없습니다. 주최를 직접 선택해 주세요.'
                        : ' · 주최 동아리를 선택해 주세요.'}
                    </p>
                  )}

                  {selectedHosts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedHosts.map((h, i) => (
                        <span
                          key={h.id}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pl-2 pr-1 text-xs text-slate-700"
                        >
                          {i === 0 && (
                            <span className="rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-500">
                              대표
                            </span>
                          )}
                          <span className="max-w-[10rem] truncate" title={h.name}>
                            {h.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => changeHostIds(hostIds.filter((id) => id !== h.id))}
                            className="rounded-full p-0.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                            aria-label={`${h.name} 주최에서 제외`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <Select
                    value={NONE}
                    onValueChange={(v) => {
                      if (v !== NONE && !hostIds.includes(v)) changeHostIds([...hostIds, v]);
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={clubOnly ? '내 동아리 선택' : '주최 추가…'} />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {hostOptions.filter((h) => !hostIds.includes(h.id)).length === 0 ? (
                        <SelectItem value={NONE} disabled>
                          {clubOnly ? '소속된 동아리가 없습니다' : '추가할 주최가 없습니다'}
                        </SelectItem>
                      ) : (
                        hostOptions
                          .filter((h) => !hostIds.includes(h.id))
                          .map((h) => (
                            <SelectItem key={h.id} value={h.id}>
                              <span className="text-slate-400">[{getHostKindLabel(h.kind)}]</span>{' '}
                              {h.name}
                            </SelectItem>
                          ))
                      )}
                    </SelectContent>
                  </Select>

                  {clubOnly && (
                    <p className="text-[11px] leading-relaxed text-slate-400">
                      내가 소속된 동아리만 고를 수 있습니다. 참여자도 그 동아리 부원 중에서
                      고르게 됩니다.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 중복 감지 — 같은 활동을 두 번 만들지 않게 한다 */}
            {!isEdit && similar.length > 0 && (
              <div className="space-y-1.5 rounded-md border-l-2 border-amber-300 bg-amber-50/70 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                  <History className="h-3.5 w-3.5" />
                  비슷한 활동이 이미 있습니다
                </div>
                <ul className="space-y-1.5">
                  {similar.slice(0, 3).map((sa) => (
                    <li key={sa.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
                      <span className="tabular-nums text-slate-400">{sa.academic_year}</span>
                      <span className="min-w-0 truncate font-medium text-slate-700">{sa.name}</span>
                      {sa.hostNames.length > 0 && (
                        <span className="truncate text-[11px] text-slate-400">
                          {sa.hostNames.join(' · ')}
                        </span>
                      )}
                      {sa.sameYear ? (
                        <span className="text-[11px] text-amber-700">
                          같은 해 활동 — <b>합류</b>가 맞습니다(주최·참여자를 그 활동에 더하세요)
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setLineageParentId(sa.id);
                            setShowAdvanced(true);
                          }}
                          className="rounded border border-fuchsia-200 bg-fuchsia-50 px-1.5 py-0.5 text-[11px] font-medium text-fuchsia-700 transition hover:bg-fuchsia-100"
                        >
                          이 활동 이어받기
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  같은 해 활동이면 새로 만들지 말고 그 활동을 열어 주최·참여자를 더하세요.
                  지난해 활동이면 <span className="font-medium">이어받기</span>로 계보를 이으면 됩니다.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ca-content" className="text-xs text-slate-600">
                내용 — 무엇을 했는가
              </Label>
              <Textarea
                id="ca-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
                className="resize-none text-sm"
              />
            </div>

            {/* 진로·분야 — 첫 화면의 카테고리 축이라 본문에 둔다 */}
            <div className="space-y-1.5">
              <Label htmlFor="ca-careers" className="text-xs text-slate-600">
                진로 · 분야 <span className="text-slate-400">(쉼표로 구분해 여러 개)</span>
              </Label>
              <Input
                id="ca-careers"
                value={careerFields}
                onChange={(e) => setCareerFields(e.target.value)}
                className="h-9"
              />
              <p className="text-[11px] leading-relaxed text-slate-400">
                여기 적은 분야가 활동 목록의 <span className="font-medium text-slate-500">분류 카드</span>가
                됩니다. 여러 분야에 걸친 활동은 각 분야에 모두 나타납니다.
              </p>
            </div>
          </section>

          {/* ── 언제·어디서 ── */}
          <section className="space-y-3">
            <SectionLabel icon={CalendarDays}>언제 · 어디서</SectionLabel>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="ca-start" className="text-xs text-slate-600">
                  시작일 <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="ca-start"
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ca-end" className="text-xs text-slate-600">
                  종료일
                </Label>
                <Input
                  id="ca-end"
                  type="date"
                  value={endsOn}
                  min={startsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ca-place" className="text-xs text-slate-600">
                  장소
                </Label>
                <Input
                  id="ca-place"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="ca-year" className="text-xs text-slate-600">
                  학년도
                </Label>
                <Input
                  id="ca-year"
                  type="number"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(Number(e.target.value))}
                  className="h-9 tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">학기</Label>
                <Select value={semester} onValueChange={setSemester}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1학기</SelectItem>
                    <SelectItem value="2">2학기</SelectItem>
                    <SelectItem value={NONE}>연간</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">규모</Label>
                <Select value={scale} onValueChange={(v) => setScale(v as ActivityScale)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_SCALES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {getScaleLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">상태</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ActivityStatus)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {getStatusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* ── 담당·참여 ── */}
          <section className="space-y-3">
            <SectionLabel icon={Users}>담당 교사 · 참여 학생</SectionLabel>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">담당 교사 (첫 번째가 주담당)</Label>
              <SearchableMultiSelect
                selectedValues={teacherIds}
                onSelectionChange={setTeacherIds}
                filterByTeacher
                maxSelectedDisplay={4}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">참여 학생</Label>
              <ParticipantPicker
                value={participants}
                onChange={setParticipants}
                hostId={selectedHost?.id ?? null}
                hostName={selectedHost?.name ?? null}
                academicYear={academicYear}
              />
            </div>
          </section>

          {/* ── 접이식: 운영·예산·계보·분류 ── */}
          <section className="space-y-3">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center justify-between rounded-md border border-dashed border-slate-200 px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                운영 · 예산 · 계보 · 분류
              </span>
              <span className="text-[11px] text-slate-400">
                {showAdvanced ? '접기' : '펼치기'}
              </span>
            </button>

            {showAdvanced && (
              <div className="space-y-5 rounded-md border border-slate-200 p-3.5">
                {/* 운영·예산 */}
                <div className="space-y-3">
                  <SectionLabel icon={Wallet}>운영 · 예산</SectionLabel>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-600">운영 주체</Label>
                      <Select
                        value={operatorType}
                        onValueChange={(v) => setOperatorType(v as ActivityOperatorType)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPERATOR_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {getOperatorLabel(t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ca-operator" className="text-xs text-slate-600">
                        업체·기관명
                      </Label>
                      <Input
                        id="ca-operator"
                        value={operatorName}
                        onChange={(e) => setOperatorName(e.target.value)}
                        disabled={operatorType === 'internal'}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-600">예산 출처</Label>
                      <Select value={budgetSource} onValueChange={setBudgetSource}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="미지정" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>미지정</SelectItem>
                          {BUDGET_SOURCES.map((b) => (
                            <SelectItem key={b} value={b}>
                              {getBudgetSourceLabel(b)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ca-budget-program" className="text-xs text-slate-600">
                        사업명
                      </Label>
                      <Input
                        id="ca-budget-program"
                        value={budgetProgram}
                        onChange={(e) => setBudgetProgram(e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="ca-budget-planned" className="text-xs text-slate-600">
                        계획 예산 (원)
                      </Label>
                      <Input
                        id="ca-budget-planned"
                        type="number"
                        min="0"
                        value={budgetPlanned}
                        onChange={(e) => setBudgetPlanned(e.target.value)}
                        className="h-9 tabular-nums"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ca-budget-spent" className="text-xs text-slate-600">
                        집행 예산 (원)
                      </Label>
                      <Input
                        id="ca-budget-spent"
                        type="number"
                        min="0"
                        value={budgetSpent}
                        onChange={(e) => setBudgetSpent(e.target.value)}
                        className="h-9 tabular-nums"
                      />
                    </div>
                  </div>
                </div>

                {/* 계보 — 이 시스템의 핵심 */}
                <div className="space-y-3">
                  <SectionLabel icon={GitBranch}>계보 — 이전 활동에서 이어짐</SectionLabel>
                  <p className="text-[11.5px] leading-relaxed text-slate-500">
                    작년(또는 이전) 활동을 이어받는 것이라면 여기서 연결합니다. 연결하면 카드에
                    <span className="font-medium text-fuchsia-700"> “N년째”</span> 배지가 붙고, 후배가
                    그 활동이 어떻게 발전해 왔는지 볼 수 있습니다.
                  </p>
                  <Select value={lineageParentId} onValueChange={setLineageParentId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="이어받은 활동 선택" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value={NONE}>없음 (새로 시작하는 활동)</SelectItem>
                      {lineageCandidates
                        .slice()
                        .sort((a, b) => b.academic_year - a.academic_year)
                        .map((n) => (
                          <SelectItem key={n.id} value={n.id}>
                            <span className="tabular-nums text-slate-400">{n.academic_year}</span>{' '}
                            {n.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {lineageParentId !== NONE && (
                    <>
                      <Input
                        value={lineageNote}
                        onChange={(e) => setLineageNote(e.target.value)}
                        className="h-9"
                        aria-label="이번에 달라진 점"
                      />

                      {/* 전년도 회고 승계 — 인수인계의 실질 */}
                      {inheritedNotes.length > 0 && (
                        <div className="rounded-md border border-slate-200 bg-slate-50/70 p-2.5">
                          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            <History className="h-3.5 w-3.5" />
                            이전 담당자가 남긴 기록
                          </div>
                          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                            {inheritedNotes.map((n) => (
                              <li key={n.id} className="text-[12px] leading-relaxed text-slate-600">
                                <span className="mr-1 font-medium text-slate-500">
                                  {n.kind === 'retrospective' ? '회고' : '기록'}
                                </span>
                                {n.content}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* 분류축 */}
                <div className="space-y-3">
                  <SectionLabel icon={BookOpen}>분류 — 탐색과 분석의 뼈대</SectionLabel>
                  <div className="space-y-1.5">
                    <Label htmlFor="ca-keywords" className="text-xs text-slate-600">
                      키워드 (쉼표로 구분)
                    </Label>
                    <Input
                      id="ca-keywords"
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ca-subjects" className="text-xs text-slate-600">
                      연계 교과
                    </Label>
                    <Input
                      id="ca-subjects"
                      value={relatedSubjects}
                      onChange={(e) => setRelatedSubjects(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button
            type="button"
            variant="ghost"
            className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            <X className="h-3.5 w-3.5" />
            취소
          </Button>
          <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isEdit ? '수정 저장' : '활동 기록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
