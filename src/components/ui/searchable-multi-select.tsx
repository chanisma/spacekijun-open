import * as React from "react";
import { Check, ChevronDown, ChevronUp, ClipboardPaste, ListFilter, X } from "lucide-react";
import { cn, isChosungMatch } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SpreadsheetPasteSelector } from "@/components/ui/spreadsheet-paste-selector";
import {
  analyzeSpreadsheetSelection,
  getSpreadsheetPersonLabel,
  getStudentGccnn,
  parseSpreadsheetClipboard,
  type SpreadsheetSelectionMode,
} from "@/components/ui/spreadsheet-selection";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  PickerContent,
  PickerRoot,
  PickerTrigger,
} from "@/components/ui/responsive-picker";
import { useIsMobileModal } from "@/hooks/useIsMobileModal";
import { NameOverlay, NamePreview } from "@/components/ui/name-list-overlay";
import {
  useResourceSelect,
  filterItems,
  getAllSelectionHelpers,
  matchesGroupSearch,
  isGroupValue,
  type SelectItem,
} from "@/hooks/useResourceSelect";
import { useAcademicTerm } from "@/hooks/useAcademicTerm";
import { useOptionalAuth } from "@/components/auth/AuthProvider";
import { FACULTY_ROLES, TEACHER_ROLES } from "@/lib/roles";
import { AudienceRulePanel } from "@/components/ui/audience-rule-panel";
import {
  resolveFacultyRule,
  resolveStudentAudience,
  useFacultyAudienceVocab,
  useStudentAudienceVocab,
  type AudienceTarget,
} from "@/hooks/useStudentAudience";
import {
  MENTION_KIND_LABEL,
  buildFacultyMentions,
  buildStudentMentions,
  filterMentions,
  type MentionItem,
} from "@/lib/audienceMentions";
import type { StudentCriterion } from "@/lib/studentAudienceRule";
import type { AudienceCriterion } from "@/lib/audienceRule";

// 기존 인터페이스 호환성을 위해 re-export
export type SearchableMultiSelectItem = SelectItem;

/**
 * 그룹(태그·학년·반·수업)에 **누가 들어 있는지** 보여준다 (2026-08-22 사용자 요청).
 * 이름을 모르면 "전체 1학년 부장"을 골라도 되는지 판단할 수 없어 결국 고르고 나서 확인하게 된다.
 * 규칙(10명 이하 인라인 / 초과 요약+오버레이)은 공용 `NamePreview`가 소유한다.
 */
function GroupMembers({ names }: { names: string[] }) {
  return <NamePreview names={names} className="block" />;
}

/**
 * 선택된 대상 칩 (2026-08-22 디자인 정리).
 *
 * 종전에는 `Badge`(굵은 테두리 + `font-semibold`) 안에 `Button`을 넣어 ①제거 X가 이름만큼
 * 진하게 보이고 ②칩마다 높이가 들쭉날쭉했다. 지금은 **고정 높이 알약 + inset ring**(테두리보다
 * 부드럽다)에 이름만 또렷하게 두고, 제거 버튼은 평소 흐리게 있다가 hover·포커스에서 살아난다.
 * 학생 학번은 이름과 붙은 한 문자열이 아니라 **앞쪽 옅은 접두**로 분리해 이름이 먼저 읽힌다.
 */
function SelectedChip({
  code,
  label,
  count,
  tone = "neutral",
  title,
  removeLabel,
  onRemove,
}: {
  code?: string | null;
  label: string;
  /** 그룹 칩의 구성원 수 — 이름 뒤에 옅게 붙는다 */
  count?: number;
  tone?: "neutral" | "group" | "warning";
  title?: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  const tones = {
    neutral: "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100",
    group: "bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-100",
    warning: "bg-amber-50 text-amber-800 ring-amber-300 hover:bg-amber-100",
  } as const;
  return (
    <span
      title={title ?? label}
      className={cn(
        "group inline-flex h-6 max-w-[14rem] items-center gap-1 rounded-full pl-2 pr-1",
        "text-xs font-medium ring-1 ring-inset transition-colors",
        tones[tone]
      )}
    >
      {code && <span className="shrink-0 text-[10px] tabular-nums opacity-60">{code}</span>}
      <span className="truncate">{label}</span>
      {typeof count === "number" && (
        <span className="shrink-0 text-[10px] tabular-nums opacity-60">{count}명</span>
      )}
      {/* 제거 버튼은 3단계로 드러난다: 평소 흐림 → 칩 hover에서 반쯤 → 버튼 hover에서 또렷 */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-40",
          "transition group-hover:opacity-70 hover:bg-black/10 hover:!opacity-100",
          "focus-visible:!opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current"
        )}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

interface SearchableMultiSelectProps {
  items?: SearchableMultiSelectItem[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  maxSelectedDisplay?: number;
  /**
   * 휴대폰 선택 시트의 머리글 (2026-09-20). 생략하면 `placeholder` 를 쓴다.
   * 데스크톱 팝오버에는 머리글이 없으므로 표시되지 않는다.
   */
  pickerTitle?: string;
  /** 단일 항목 선택: 새 선택으로 교체하고 팝오버를 닫는다. */
  singleSelect?: boolean;
  filterByTeacher?: boolean; // teacher 타입 리소스만 필터링
  filterByStudent?: boolean; // student 타입 리소스만 필터링
  includeTagOptions?: boolean; // 태그 기반 일괄 선택 옵션(quick-add 칩) 포함
  // ─── 그룹 검색 (opt-in, 필요한 위치에만 적용) ───
  /** 태그명으로 검색해 해당 태그의 전원을 한 번에 선택 (bulk·non-bulk 모든 태그) */
  enableTagSearch?: boolean;
  /** "2학년 1반"·"2-1" 입력으로 그 반 학생 전원 선택 */
  enableClassSearch?: boolean;
  /** 수업(과목)명 검색 → 과목 전체 또는 특정 반 학생 전원 선택. 관리자 학사력 설정 필요 */
  enableCourseSearch?: boolean;
  /**
   * 엑셀·구글 스프레드시트 셀 범위를 붙여넣어 여러 명 선택.
   * 미지정 시 filterByTeacher/filterByStudent 모드에서 자동 활성화.
   */
  enableSpreadsheetPaste?: boolean;
}

export function SearchableMultiSelect({
  items,
  selectedValues,
  onSelectionChange,
  placeholder = "선택하세요...",
  searchPlaceholder = "검색...",
  emptyText = "검색 결과가 없습니다.",
  className,
  disabled = false,
  maxSelectedDisplay = 3,
  singleSelect = false,
  filterByTeacher = false,
  filterByStudent = false,
  includeTagOptions = false,
  enableTagSearch = false,
  enableClassSearch = false,
  enableCourseSearch = false,
  enableSpreadsheetPaste,
  pickerTitle,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  // 휴대폰에서는 팝오버가 아니라 아래에서 올라오는 시트로 뜬다(`responsive-picker`).
  // 목록 높이·자동 포커스·[완료] 버튼이 그에 맞춰 갈린다.
  const isMobilePicker = useIsMobileModal();
  const [searchValue, setSearchValue] = React.useState("");
  const [inputValue, setInputValue] = React.useState("");
  const [spreadsheetOpen, setSpreadsheetOpen] = React.useState(false);
  const [spreadsheetMatrix, setSpreadsheetMatrix] = React.useState<string[][]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const spreadsheetRef = React.useRef<HTMLDivElement>(null);
  const [quickAddOpen, setQuickAddOpen] = React.useState(true);

  /**
   * 조건으로 고르기 (2026-10-01). 대상마다 권한이 다르다 — 서버와 같은 경계:
   * - 학생 조건 = **교사·관리자**(`resolve_student_audience` → `is_teacher_or_admin`, 학생 정보)
   * - 교직원 조건 = **교직원**(`resolve_faculty_rule` → `is_staff_teacher_or_admin`)
   * 학생이 쓰는 선택기(협업 보드 초대)에는 나오지 않는다. 역할은 미리보기를 반영한 값.
   */
  const auth = useOptionalAuth();
  const role = auth?.effectiveRole ?? null;
  const ruleTargets = React.useMemo<AudienceTarget[]>(() => {
    if (singleSelect || !role) return [];
    const targets: AudienceTarget[] = [];
    if (filterByStudent && TEACHER_ROLES.includes(role)) targets.push("student");
    if (filterByTeacher && FACULTY_ROLES.includes(role)) targets.push("faculty");
    return targets;
  }, [singleSelect, role, filterByStudent, filterByTeacher]);
  const ruleSearchEnabled = ruleTargets.length > 0;
  const [ruleOpen, setRuleOpen] = React.useState(false);
  /**
   * 교사·학생이 한 목록에 섞이는 선택기(일정 설문·협업 보드)의 목록 거르기 (2026-10-01 사용자 요청).
   * 고른 결과에는 둘이 섞여도 되고, **고를 때** 한쪽만 보고 싶다는 요구다. 값으로 저장하지 않는다.
   */
  const mixedMode = filterByTeacher && filterByStudent;
  const [kindFilter, setKindFilter] = React.useState<"all" | "faculty" | "student">("all");
  /**
   * 조건으로 더한 결과를 **그룹 칩 하나**로 접어 보여 주기 위한 기록(값으로는 저장하지 않는다 —
   * 소비처는 지금처럼 resource id 목록만 받는다). 태그·학급 그룹 칩과 같은 규칙을 탄다:
   * 구성원이 전부 선택돼 있을 때만 칩이 되고, 몇 명을 지우면 개별 칩으로 풀린다.
   */
  const [ruleGroups, setRuleGroups] = React.useState<SelectItem[]>([]);

  // 리소스 데이터 훅 사용
  // filterByTeacher와 filterByStudent는 함께 켤 수 있다. 둘 다 켜면
  // 교직원(teacher/staff) + 학생을 한 목록에 합쳐 보여준다. 빠른 추가
  // (ALL_*/TAG_*)는 교직원 전용 헬퍼라 teacher 모드일 때만 포함한다.
  const resourceTypes = React.useMemo(() => {
    const types: ("teacher" | "staff" | "student")[] = [];
    if (filterByTeacher) types.push("teacher", "staff");
    if (filterByStudent) types.push("student");
    return types;
  }, [filterByTeacher, filterByStudent]);

  // 교직원과 학생을 동시에 보여줄 때는 "전체 교직원/선생님" 일괄 선택을 끈다.
  // (ALL_*는 개별 항목 전체를 값으로 잡아 학생까지 휩쓸어버리므로 의미가 모호해짐)
  const teacherOnly = filterByTeacher && !filterByStudent;
  const spreadsheetPasteEnabled =
    !singleSelect && (enableSpreadsheetPaste ?? (filterByTeacher || filterByStudent));
  const spreadsheetMode: SpreadsheetSelectionMode =
    filterByStudent && filterByTeacher
      ? "mixed"
      : filterByStudent
        ? "student"
        : "teacher";

  // 그룹 검색 기능이 하나라도 켜지면 resource 데이터 훅을 쓴다(items 미사용 모드).
  const usesResourceData =
    filterByTeacher || filterByStudent || enableTagSearch || enableClassSearch || enableCourseSearch;

  // 수업 그룹 기준 학년도·학기 (관리자 설정). 미설정이면 수업 그룹 비활성.
  const { data: academicTerm } = useAcademicTerm();

  const { items: resourceItems, groupItems, isLoading } = useResourceSelect({
    resourceType: resourceTypes.length > 0 ? resourceTypes : undefined,
    includeAllOptions: teacherOnly,
    includeTagOptions: teacherOnly && includeTagOptions,
    includeAllTags: enableTagSearch,
    includeClassGroups: enableClassSearch,
    includeCourseGroups: enableCourseSearch,
    academicTerm: enableCourseSearch ? academicTerm ?? null : null,
    enabled: usesResourceData,
  });

  // 사용할 아이템 목록 결정
  const activeItems = React.useMemo(
    () => (usesResourceData ? resourceItems : (items || [])),
    [usesResourceData, resourceItems, items]
  );
  const spreadsheetAnalysis = React.useMemo(
    () =>
      analyzeSpreadsheetSelection(
        spreadsheetMatrix,
        activeItems,
        selectedValues,
        spreadsheetMode
      ),
    [spreadsheetMatrix, activeItems, selectedValues, spreadsheetMode]
  );
  const spreadsheetColumnCount = Math.max(
    spreadsheetMode === "teacher" ? 1 : 2,
    ...spreadsheetMatrix.map(row => row.length)
  );
  const spreadsheetPopoverWidth = Math.min(
    800,
    Math.max(420, spreadsheetColumnCount * 148 + 56)
  );

  // 전체 선택 관련 헬퍼
  const {
    individualItems,
    allStaffValues,
    teacherValues,
    isAllStaffSelected: helperAllStaffSelected,
    isAllTeachersSelected: helperAllTeachersSelected,
    tagOptions: tagOptionsFromHelper,
    tagSelectionStatus,
  } = getAllSelectionHelpers(activeItems, selectedValues);
  /** 조건 패널의 문장 속 이름 대조용(이미 받아 둔 목록 — AI 에는 보내지 않는다) */
  const ruleStudents = React.useMemo(
    () => (ruleTargets.includes("student")
      ? individualItems.filter((item) => item.resourceType === "student").map((item) => ({ id: item.value, name: item.label }))
      : []),
    [ruleTargets, individualItems]
  );
  const ruleFaculty = React.useMemo(
    () => (ruleTargets.includes("faculty")
      ? individualItems
        .filter((item) => item.resourceType === "teacher" || item.resourceType === "staff")
        .map((item) => ({ id: item.value, name: item.label }))
      : []),
    [ruleTargets, individualItems]
  );
  // 학생 전용/혼합 모드에서 전원이 선택돼도 "전체 교직원"으로 오인하지 않는다.
  const isAllStaffSelected = teacherOnly && helperAllStaffSelected;
  const isAllTeachersSelected = teacherOnly && helperAllTeachersSelected;

  // 선택된 아이템들 (ALL_* 제외)
  const selectedItems = individualItems.filter(item =>
    selectedValues.includes(item.value)
  );

  // 목록에서 해석되지 않은 선택값 — 목록이 아직 로드 전이거나, 리소스가 삭제·비활성됐거나,
  // 과거 데이터가 id 대신 이름 문자열을 담은 경우. 숨기면 트리거·뱃지 모두에서 사라져
  // "선택 없음"으로 보이고 사용자가 같은 사람을 중복 추가하게 된다(부서 select 버그와
  // 동일 부류, 2026-08-12). 원문 값을 그대로 노출하고 제거도 가능하게 한다.
  const unresolvedValues = selectedValues.filter(
    value =>
      !value.startsWith("ALL_") &&
      !isGroupValue(value) &&
      !individualItems.some(item => item.value === value)
  );

  // 그룹 구성원 이름 해석용 — 그룹의 expandsTo(리소스 id)를 표시 이름으로 바꾼다.
  // 학생은 학번 접두를 붙여(getSpreadsheetPersonLabel) 동명이인을 구분한다.
  const labelByValue = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const item of activeItems) {
      if (item.value.startsWith("ALL_") || isGroupValue(item.value)) continue;
      map.set(item.value, getSpreadsheetPersonLabel(item));
    }
    return map;
  }, [activeItems]);

  /** 그룹 구성원 이름 목록(해석 못한 id는 제외 — 로딩 중이면 자연히 빈 목록) */
  const memberLabelsOf = React.useCallback(
    (item: SelectItem) =>
      (item.expandsTo ?? [])
        .map((value) => labelByValue.get(value))
        .filter((name): name is string => Boolean(name)),
    [labelByValue]
  );

  /**
   * 선택 결과를 **그룹 칩 + 남은 개별 칩**으로 나눈다 (2026-08-22 사용자 요청).
   *
   * 태그를 고르면 값은 개별 구성원으로 전개되므로(`toggleSelection`) 종전엔 태그를 골랐다는
   * 사실이 칩 목록에서 사라지고 이름 30개가 늘어섰다. 구성원이 **전부** 선택된 그룹은
   * 그 그룹 칩 하나로 접어 보여주고(이름은 hover 오버레이), 그 구성원은 개별 칩에서 뺀다.
   *
   * 큰 그룹부터 훑으며 **이미 다른 그룹이 전부 덮은 그룹은 건너뛴다** — 예컨대 '전체 담임'을
   * 고른 결과로 '1학년 부장'까지 우연히 다 채워졌을 때 고르지도 않은 태그 칩이 튀어나오는
   * 것을 막는다(부분집합 억제).
   */
  const { groupChips, chipItems } = React.useMemo(() => {
    const selectedSet = new Set(selectedValues);
    const seenValues = new Set<string>();
    const candidates = [...tagOptionsFromHelper, ...(groupItems ?? []), ...ruleGroups].filter((g) => {
      if (seenValues.has(g.value)) return false; // tagOptions와 groupItems에 같은 태그가 겹칠 수 있다
      seenValues.add(g.value);
      return (g.expandsTo?.length ?? 0) > 0 && g.expandsTo!.every((v) => selectedSet.has(v));
    });
    candidates.sort((a, b) => (b.expandsTo?.length ?? 0) - (a.expandsTo?.length ?? 0));

    const covered = new Set<string>();
    const chips: {
      value: string; label: string; members: string[]; names: string[]; tagColor?: string;
    }[] = [];
    for (const group of candidates) {
      const members = group.expandsTo ?? [];
      if (members.every((v) => covered.has(v))) continue;
      members.forEach((v) => covered.add(v));
      chips.push({
        value: group.value,
        label: group.label,
        members,
        names: memberLabelsOf(group),
        tagColor: group.tagColor,
      });
    }
    return { groupChips: chips, chipItems: selectedItems.filter((item) => !covered.has(item.value)) };
  }, [selectedValues, tagOptionsFromHelper, groupItems, ruleGroups, selectedItems, memberLabelsOf]);

  // 개별(사람) 항목만 검색 필터 — 그룹 토큰/ALL_ 제외, 초성 검색 포함
  const individualFilteredItems = React.useMemo(() => {
    const onlyPeople = activeItems.filter(
      item => !item.value.startsWith("ALL_") && !isGroupValue(item.value)
        // 교사·학생 섞인 목록의 거르기 — 교직원 = teacher·staff
        && (!mixedMode || kindFilter === "all"
          || (kindFilter === "student" ? item.resourceType === "student" : item.resourceType !== "student"))
    );
    return filterItems(onlyPeople, searchValue);
  }, [activeItems, searchValue, mixedMode, kindFilter]);

  // 검색어와 매칭되는 그룹 항목들 (태그·반·수업). 검색어가 있을 때만 노출.
  // groupItems 는 hook이 켜진 기능에 맞춰 이미 추려서 내려준다.
  // 섞인 목록을 거를 때 그룹도 같은 쪽만 — 태그 = 교직원, 학년·반·수업 = 학생
  const matchedGroupItems = React.useMemo(() => {
    if (!searchValue.trim() || !groupItems) return [];
    return groupItems.filter(item => matchesGroupSearch(item, searchValue)
      && (!mixedMode || kindFilter === "all"
        || (kindFilter === "faculty" ? item.groupKind === "tag" : item.groupKind !== "tag")));
  }, [groupItems, searchValue, mixedMode, kindFilter]);

  // 빠른 추가 칩 (ALL_*, bulk TAG_*) — 교직원 전용 모드에서만 노출
  const quickAddItems = React.useMemo(() => {
    if (!teacherOnly || !includeTagOptions) return [];
    return activeItems.filter(
      item => item.value.startsWith("ALL_") || (item.value.startsWith("TAG_") && item.isBulk)
    );
  }, [activeItems, teacherOnly, includeTagOptions]);

  const hasQuickAddItems = quickAddItems.length > 0;

  const isItemSelected = (item: SelectItem) => {
    if (item.value === "ALL_STAFF") return isAllStaffSelected;
    if (item.value === "ALL_TEACHERS") return isAllTeachersSelected;
    if (isGroupValue(item.value)) return tagSelectionStatus.get(item.value) || false;
    return selectedValues.includes(item.value);
  };

  /**
   * 선택 후 검색어를 비우고 입력으로 포커스를 되돌린다 (2026-08-22 사용자 요청).
   * 이름을 치고 Enter로 고른 뒤 검색어가 남아 있으면 목록이 계속 걸러진 상태라
   * 다음 사람을 고르려면 매번 직접 지워야 했다. 여러 명을 연달아 고르는 것이 이
   * 컴포넌트의 기본 사용법이므로 그 흐름이 끊기지 않게 한다.
   */
  const resetSearchInput = () => {
    setInputValue("");
    setSearchValue("");
    // 목록 재렌더 뒤에 포커스를 되돌린다(클릭 선택 시 입력에서 포커스가 빠질 수 있다)
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  // 아이템 선택/해제
  const toggleSelection = (value: string) => {
    if (singleSelect) {
      onSelectionChange(selectedValues.includes(value) ? [] : [value]);
      setInputValue('');
      setSearchValue('');
      setOpen(false);
      return;
    }
    // 어느 경로(개별·그룹·빠른 추가)로 골랐든 검색 입력은 비운다.
    // 아래 분기들은 searchValue를 읽지 않으므로 먼저 호출해도 안전하다.
    resetSearchInput();

    // "전체 교직원" 선택/해제 처리
    if (value === "ALL_STAFF") {
      if (isAllStaffSelected) {
        // "전체 교직원"이 이미 선택된 경우 - 모든 선택 해제
        onSelectionChange([]);
      } else {
        // "전체 교직원" 선택 - 모든 교직원 선택 (실제 값은 개별 이름들만)
        onSelectionChange(allStaffValues);
      }
      return;
    }

    // "전체 선생님" 선택/해제 처리
    if (value === "ALL_TEACHERS") {
      if (isAllTeachersSelected) {
        // "전체 선생님"이 이미 선택된 경우 - 선생님만 모두 해제
        const newSelectedValues = selectedValues.filter(v => !teacherValues.includes(v));
        onSelectionChange(newSelectedValues);
      } else {
        // "전체 선생님" 선택 - 모든 선생님 선택 (실제 값은 개별 이름들만)
        const nonTeacherValues = selectedValues.filter(v => !teacherValues.includes(v));
        onSelectionChange([...teacherValues, ...nonTeacherValues]);
      }
      return;
    }

    // 그룹(TAG_/CLASS_/COURSE_) 선택/해제 처리 — expandsTo로 전개/해제
    if (isGroupValue(value)) {
      // activeItems(병합본)와 groupItems 양쪽에서 찾는다(검색 결과/뱃지 모두 대응)
      const groupOption =
        tagOptionsFromHelper.find(t => t.value === value) ??
        groupItems?.find(g => g.value === value);
      if (groupOption?.expandsTo) {
        const isGroupSelected = tagSelectionStatus.get(value);
        if (isGroupSelected) {
          // 이미 선택됨 - 해당 그룹 구성원만 해제
          const newSelectedValues = selectedValues.filter(v => !groupOption.expandsTo!.includes(v));
          onSelectionChange(newSelectedValues);
        } else {
          // 선택 - 해당 그룹 구성원 전체 추가
          const newValues = [...new Set([...selectedValues, ...groupOption.expandsTo])];
          onSelectionChange(newValues);
        }
      }
      return;
    }

    // 개별 교직원 선택/해제 처리
    if (selectedValues.includes(value)) {
      // 개별 교직원 해제
      const newSelectedValues = selectedValues.filter(v => v !== value);
      onSelectionChange(newSelectedValues);
    } else {
      // 개별 교직원 추가
      onSelectionChange([...selectedValues, value]);
    }
  };

  // 선택된 아이템 제거
  const removeSelected = (value: string) => {
    if (value === "ALL_STAFF") {
      // "전체 교직원" 제거 시 모든 선택 해제
      onSelectionChange([]);
    } else if (value === "ALL_TEACHERS") {
      // "전체 선생님" 제거 시 선생님만 모두 해제
      const newSelectedValues = selectedValues.filter(v => !teacherValues.includes(v));
      onSelectionChange(newSelectedValues);
    } else {
      // 개별 교직원 제거
      onSelectionChange(selectedValues.filter(v => v !== value));
    }
  };

  // 모든 선택 해제
  const clearAll = () => {
    onSelectionChange([]);
  };

  const focusSpreadsheet = () => {
    window.requestAnimationFrame(() => spreadsheetRef.current?.focus());
  };

  const openSpreadsheet = (matrix: string[][] = spreadsheetMatrix) => {
    setRuleOpen(false);
    setSpreadsheetMatrix(matrix);
    setSpreadsheetOpen(true);
    focusSpreadsheet();
  };

  const toggleRulePanel = () => {
    if (ruleOpen) {
      setRuleOpen(false);
      return;
    }
    setSpreadsheetOpen(false);
    setSpreadsheetMatrix([]);
    setRuleOpen(true);
  };

  const applyRuleSelection = (ids: string[], label: string) => {
    if (ids.length === 0) return;
    onSelectionChange([...new Set([...selectedValues, ...ids])]);
    setRuleGroups((prev) => [
      ...prev.filter((g) => g.label !== label),
      { value: `RULE_${Date.now()}`, label, expandsTo: ids },
    ]);
    setRuleOpen(false);
  };

  /**
   * 검색창 `@` 바로 추가 (2026-10-01 사용자 요청) — `@방송부` 를 고르면 AI 없이 그 조건 하나를 서버가 풀어 더한다.
   * 이미 있는 태그·반·수업 그룹 검색의 연장이다. 후보 = 조건 패널의 `@` 와 같은 목록(사람 항목은 뺀다 — 이름은 그냥 검색으로).
   * 어휘는 `@` 를 친 뒤에야 불러온다(선택기를 열 때마다 부르지 않게).
   */
  const mentionQuery = ruleSearchEnabled && inputValue.trimStart().startsWith("@")
    ? inputValue.trimStart().slice(1)
    : null;
  const mentionActive = mentionQuery !== null;
  const studentVocabForMention = useStudentAudienceVocab(mentionActive && ruleTargets.includes("student"));
  const facultyVocabForMention = useFacultyAudienceVocab(
    mentionActive && ruleTargets.includes("faculty"), academicTerm?.year ?? null);
  const mentionOptions = React.useMemo<MentionItem[]>(() => {
    if (mentionQuery === null) return [];
    const all = [
      ...(ruleTargets.includes("student") ? buildStudentMentions(studentVocabForMention.data) : []),
      ...(ruleTargets.includes("faculty") ? buildFacultyMentions(facultyVocabForMention.data) : []),
    ].filter((item) => item.criterion);
    return filterMentions(all, mentionQuery, 12);
  }, [mentionQuery, ruleTargets, studentVocabForMention.data, facultyVocabForMention.data]);
  const [mentionResolving, setMentionResolving] = React.useState<string | null>(null);
  const [mentionError, setMentionError] = React.useState<string | null>(null);
  const addMention = async (item: MentionItem) => {
    if (!item.criterion || mentionResolving) return;
    setMentionResolving(item.key);
    setMentionError(null);
    try {
      const rule = { include: [{ all: [item.criterion] }], exclude: [] };
      const ids = item.target === "student"
        ? (await resolveStudentAudience({ include: [{ all: [item.criterion as StudentCriterion] }], exclude: [] })).rows.map((r) => r.resource_id)
        : (await resolveFacultyRule(rule as { include: { all: AudienceCriterion[] }[]; exclude: [] })).rows.map((r) => r.resource_id);
      if (ids.length === 0) {
        setMentionError(`「${item.label}」에 해당하는 사람이 없습니다.`);
        return;
      }
      const prefix = ruleTargets.length > 1 ? (item.target === "student" ? "학생 · " : "교직원 · ") : "";
      applyRuleSelection(ids, `${prefix}${MENTION_KIND_LABEL[item.kind]} · ${item.label}`);
      resetSearchInput();
    } catch (error) {
      setMentionError((error as Error).message);
    } finally {
      setMentionResolving(null);
    }
  };
  const mentionVocabLoading = mentionActive
    && ((ruleTargets.includes("student") && studentVocabForMention.isLoading)
      || (ruleTargets.includes("faculty") && facultyVocabForMention.isLoading));

  const closeSpreadsheet = () => {
    setSpreadsheetOpen(false);
    setSpreadsheetMatrix([]);
  };

  const applySpreadsheetSelection = () => {
    if (spreadsheetAnalysis.matchedValues.length === 0) return;
    onSelectionChange([
      ...new Set([...selectedValues, ...spreadsheetAnalysis.matchedValues]),
    ]);
    closeSpreadsheet();
  };

  const handleInputPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    if (!spreadsheetPasteEnabled) return;
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\r\n]/.test(text)) return;

    const matrix = parseSpreadsheetClipboard(text);
    if (matrix.length === 0) return;

    event.preventDefault();
    setInputValue("");
    setSearchValue("");
    openSpreadsheet(matrix);
  };

  // 쉼표로 구분된 텍스트 입력 처리
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (singleSelect) return;

    if (e.key === ',') {
      // 쉼표 입력 시 무조건 처리
      e.preventDefault();
      processTextInput();
    } else if (e.key === 'Enter') {
      // 쉼표가 포함된 경우에만 수동 처리 (일괄 추가)
      if (inputValue.includes(',')) {
        e.preventDefault();
        processTextInput();
      }
      // 그 외(단일 검색 결과 등)는 Command의 기본 키보드 네비게이션/onSelect 동작을 따름
    } else if (e.key === 'Backspace' && !inputValue && selectedValues.length > 0) {
      // 백스페이스로 마지막 선택 아이템 제거
      removeSelected(selectedValues[selectedValues.length - 1]);
    }
  };

  // 텍스트 입력 처리
  const processTextInput = () => {
    if (!inputValue.trim()) return;

    const searchTerms = inputValue.split(',').map(term => term.trim()).filter(Boolean);
    const newSelections: string[] = [];

    searchTerms.forEach(term => {
      // 정확한 매치 찾기
      const exactMatch = activeItems.find(item =>
        item.label.toLowerCase() === term.toLowerCase()
      );

      if (exactMatch && !selectedValues.includes(exactMatch.value)) {
        newSelections.push(exactMatch.value);
      } else {
        // 부분 매치 찾기 (초성 검색 포함)
        const partialMatch = activeItems.find(item =>
          isChosungMatch(item.label, term) &&
          !selectedValues.includes(item.value)
        );

        if (partialMatch && !newSelections.includes(partialMatch.value)) {
          newSelections.push(partialMatch.value);
        }
      }
    });

    if (newSelections.length > 0) {
      onSelectionChange([...selectedValues, ...newSelections]);
    }

    setInputValue('');
    setSearchValue('');
  };

  // 입력값 변경 처리
  const handleInputChange = (value: string) => {
    setInputValue(value);
    setSearchValue(value);
  };

  // 휠 이벤트 핸들러 - 스크롤 허용
  const handleWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const target = e.currentTarget;
    const scrollTop = target.scrollTop;
    const scrollHeight = target.scrollHeight;
    const height = target.clientHeight;
    const wheelDelta = e.deltaY;
    const isDeltaPositive = wheelDelta > 0;

    if (isDeltaPositive && scrollTop + height >= scrollHeight) {
      // 맨 아래에서 아래로 스크롤 시도
      e.preventDefault();
    } else if (!isDeltaPositive && scrollTop <= 0) {
      // 맨 위에서 위로 스크롤 시도
      e.preventDefault();
    }
    // 그 외의 경우는 기본 스크롤 동작 허용
  }, []);

  // 선택된 아이템 표시 텍스트
  const getDisplayText = () => {
    if (selectedValues.length === 0) {
      return placeholder;
    }

    // "전체 교직원"이 선택된 경우 "전체 교직원"만 표시
    if (isAllStaffSelected) {
      return "전체 교직원";
    }

    // "전체 선생님"이 선택된 경우 "전체 선생님"만 표시
    if (isAllTeachersSelected) {
      return "전체 선생님";
    }

    // 칩 목록과 같은 단위로 요약한다 — 칩은 "전체 1학년 부장"인데 트리거만 개인 이름을
    // 늘어놓으면 같은 선택이 두 가지로 보인다. 미해석 값도 포함(빼면 개수와 목록이 어긋난다).
    const allLabels = [
      ...groupChips.map((group) => `${group.label}(${group.members.length})`),
      ...chipItems.map(getSpreadsheetPersonLabel),
      ...unresolvedValues,
    ];

    if (allLabels.length <= maxSelectedDisplay) {
      return allLabels.join(', ');
    }

    const remainingCount = allLabels.length - maxSelectedDisplay;
    return `${allLabels.slice(0, maxSelectedDisplay).join(', ')} +${remainingCount}개`;
  };

  // Callback Ref for reliable focus on mount
  const setInputFocus = React.useCallback((node: HTMLInputElement | null) => {
    // 휴대폰에서는 자동 포커스하지 않는다 — 시트가 열리자마자 키보드가 올라와
    // 목록이 두세 줄로 줄어든다. 대개는 **검색이 아니라 목록을 훑으러** 연다.
    if (node && !isMobilePicker) {
      // Force focus immediately when mounted to prevent ARIA errors
      // (Focus must leave the Trigger before the Dialog becomes aria-hidden)
      node.focus();
    }
    inputRef.current = node;
  }, [isMobilePicker]);

  // Determine if loading
  const isDataLoading = usesResourceData && isLoading;
  const handlePopoverOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSpreadsheetOpen(false);
      setSpreadsheetMatrix([]);
      setRuleOpen(false);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <PickerRoot open={open} onOpenChange={handlePopoverOpenChange}>
        <PickerTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between text-left font-normal", singleSelect && "h-auto min-h-10 whitespace-normal py-2")}
            disabled={disabled}
          >
            <span className={singleSelect ? "min-w-0 break-words" : "truncate"}>
              {isDataLoading ? "로딩 중..." : getDisplayText()}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PickerTrigger>
        <PickerContent
          title={pickerTitle ?? (placeholder === "선택하세요..." ? "선택" : placeholder)}
          description={isMobilePicker && selectedValues.length > 0 ? `${selectedValues.length}명 선택됨` : undefined}
          className="p-0 w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)]"
          align="start"
          style={
            spreadsheetOpen
              ? {
                  width: `min(calc(100vw - 2rem), max(var(--radix-popover-trigger-width), ${spreadsheetPopoverWidth}px))`,
                }
              : ruleOpen
                ? { width: "min(calc(100vw - 2rem), max(var(--radix-popover-trigger-width), 520px))" }
                : undefined
          }
          mobileFooter={isMobilePicker ? (
            <Button type="button" className="h-11 w-full" onClick={() => handlePopoverOpenChange(false)}>
              완료{selectedValues.length > 0 ? ` (${selectedValues.length})` : ''}
            </Button>
          ) : undefined}
          onOpenAutoFocus={(e) => {
            // Prevent Radix's default focus behavior to avoid race conditions
            // We rely on the callback ref to focus the input immediately
            e.preventDefault();
          }}
        >
          <Command shouldFilter={false}>
            <div className="flex items-center border-b px-3 [&_[cmdk-input-wrapper]]:min-w-0 [&_[cmdk-input-wrapper]]:flex-1 [&_[cmdk-input-wrapper]]:border-0 [&_[cmdk-input-wrapper]]:px-0">
              <CommandInput
                ref={setInputFocus}
                placeholder={searchPlaceholder}
                value={inputValue}
                onValueChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                onPaste={handleInputPaste}
                className="h-9"
              />
              {spreadsheetPasteEnabled && !isDataLoading && (
                <Button
                  type="button"
                  variant={spreadsheetOpen ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  aria-pressed={spreadsheetOpen}
                  onClick={() => {
                    if (spreadsheetOpen) {
                      closeSpreadsheet();
                    } else {
                      openSpreadsheet([]);
                    }
                  }}
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  셀 붙여넣기
                </Button>
              )}
              {ruleSearchEnabled && !isDataLoading && (
                <Button
                  type="button"
                  variant={ruleOpen ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  aria-pressed={ruleOpen}
                  onClick={toggleRulePanel}
                >
                  <ListFilter className="h-3.5 w-3.5" />
                  조건
                </Button>
              )}
              {selectedValues.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1"
                  onClick={clearAll}
                  aria-label="선택 전체 해제"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {spreadsheetOpen && (
              <SpreadsheetPasteSelector
                ref={spreadsheetRef}
                mode={spreadsheetMode}
                matrix={spreadsheetMatrix}
                analysis={spreadsheetAnalysis}
                onMatrixChange={setSpreadsheetMatrix}
                onApply={applySpreadsheetSelection}
                onClose={closeSpreadsheet}
              />
            )}
            {ruleOpen && (
              <AudienceRulePanel
                targets={ruleTargets}
                onApply={applyRuleSelection}
                onClose={() => setRuleOpen(false)}
                students={ruleStudents}
                faculty={ruleFaculty}
              />
            )}
            {/* `@` 바로 추가 안내 — 검색창이 비어 있을 때만(알아야 쓰는 기능이라 한 줄로 알린다) */}
            {ruleSearchEnabled && !inputValue && !ruleOpen && !spreadsheetOpen && !isDataLoading && (
              <div className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">
                <span className="font-semibold text-slate-600">@</span>
                {ruleTargets.includes("student") ? " 동아리·과목·선생님 이름" : " 부서·업무분장·과목 이름"}을 치면 그 사람들을 바로 추가합니다
              </div>
            )}
            {/* 교사·학생이 섞인 목록 — 고를 때 한쪽만 보기(고른 결과는 섞여도 된다) */}
            {mixedMode && !ruleOpen && !spreadsheetOpen && !isDataLoading && (
              <div className="flex items-center gap-1 border-b px-2 py-1.5" role="tablist" aria-label="목록에서 볼 대상">
                {([["all", "전체"], ["faculty", "교사"], ["student", "학생"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={kindFilter === value}
                    onClick={() => setKindFilter(value)}
                    className={cn(
                      "h-9 rounded-md px-3 text-xs transition-colors sm:h-7 sm:px-2.5",
                      kindFilter === value ? "bg-slate-800 font-medium text-white" : "text-slate-500 hover:bg-slate-100"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {/* 조건 패널이 열려 있으면 사람 목록은 접는다 — 패널이 자기 결과·[N명 추가]를 갖고,
                둘을 함께 펴면 팝오버가 화면을 넘는다 */}
            {!ruleOpen && <CommandList
              ref={listRef}
              className={cn(
                "overflow-y-auto overscroll-contain",
                spreadsheetOpen ? "max-h-[160px]" : "max-h-[200px]"
              )}
              onWheel={handleWheel}
            >
              {isDataLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  데이터를 불러오는 중입니다...
                </div>
              ) : mentionActive ? (
                // `@이름` — 사람 목록 대신 「이름으로 바로 추가」 후보(과목·동아리·선생님 수업·부서…)
                <CommandGroup heading="이름으로 바로 추가">
                  {mentionVocabLoading && (
                    <div className="px-2 py-3 text-xs text-muted-foreground">목록을 불러오는 중입니다...</div>
                  )}
                  {mentionError && <div className="px-2 py-1.5 text-xs text-rose-600">{mentionError}</div>}
                  {!mentionVocabLoading && mentionOptions.length === 0 && (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      맞는 이름이 없습니다. 과목·동아리·선생님·부서 이름을 @ 뒤에 적어 보세요.
                    </div>
                  )}
                  {mentionOptions.map((item) => (
                    <CommandItem
                      key={item.key}
                      value={item.key}
                      onSelect={() => void addMention(item)}
                      className="cursor-pointer"
                    >
                      <span className="mr-2 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {ruleTargets.length > 1 ? `${item.target === "student" ? "학생" : "교직원"} · ` : ""}{MENTION_KIND_LABEL[item.kind]}
                      </span>
                      <span className="min-w-0 flex-1 truncate" title={item.label}>{item.label}</span>
                      {mentionResolving === item.key
                        ? <span className="ml-2 shrink-0 text-xs text-muted-foreground">추가 중…</span>
                        : item.hint && <span className="ml-2 shrink-0 text-xs text-muted-foreground">{item.hint}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : (
                <>
                  {hasQuickAddItems && (
                    <div className="border-b px-1 py-2">
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center justify-between">
                        <span>빠른 추가</span>
                        <button
                          type="button"
                          onClick={() => setQuickAddOpen(!quickAddOpen)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {quickAddOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      </div>
                      {quickAddOpen && (
                        <div className="flex flex-wrap gap-1 px-2 pb-1">
                          {quickAddItems.map(item => {
                            // 칩은 이름을 펼 자리가 없다 — 구성원이 있으면 hover 오버레이로만 보여준다
                            const memberNames = memberLabelsOf(item);
                            const chip = (
                              <button
                                type="button"
                                onClick={() => toggleSelection(item.value)}
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                                  isItemSelected(item)
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background hover:bg-accent border-input"
                                )}
                              >
                                {item.tagColor && (
                                  <span
                                    className="w-2 h-2 rounded-full inline-block"
                                    style={{ backgroundColor: item.tagColor }}
                                  />
                                )}
                                {item.label}
                                {memberNames.length > 0 && (
                                  <span className="opacity-60">{memberNames.length}</span>
                                )}
                                {isItemSelected(item) && <Check className="h-3 w-3" />}
                              </button>
                            );
                            if (memberNames.length === 0) {
                              return <React.Fragment key={item.value}>{chip}</React.Fragment>;
                            }
                            return (
                              <NameOverlay key={item.value} names={memberNames} side="bottom">
                                {chip}
                              </NameOverlay>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {/* 매칭된 그룹(태그·반·수업) — 검색 시에만, 사람 목록 위에 표시 */}
                  {matchedGroupItems.length > 0 && (
                    <CommandGroup heading="그룹으로 추가">
                      {matchedGroupItems.map((item) => {
                        const selected = tagSelectionStatus.get(item.value) || false;
                        const kindLabel =
                          item.groupKind === "class" ? "반" :
                          item.groupKind === "grade" ? "학년" :
                          item.groupKind === "course" ? "수업" : "태그";
                        const memberNames = memberLabelsOf(item);
                        return (
                          <CommandItem
                            key={item.value}
                            value={`${item.label} ${(item.searchTokens ?? []).join(" ")}`}
                            onSelect={() => toggleSelection(item.value)}
                            className="cursor-pointer items-start"
                          >
                            <Check className={cn("mr-2 mt-0.5 h-4 w-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                            {/* min-w-0 필수 — 없으면 자식 truncate가 죽고 행이 밀린다 */}
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="flex items-center gap-2">
                                {item.tagColor ? (
                                  <span
                                    className="w-3 h-3 rounded-full inline-block shrink-0"
                                    style={{ backgroundColor: item.tagColor }}
                                  />
                                ) : (
                                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                                    {kindLabel}
                                  </span>
                                )}
                                <span className="truncate">{item.label}</span>
                                {/* 인원수로 통일 — 태그 description("… 태그가 지정된 모든 교직원")은
                                    아래 명단이 보이면 같은 말을 두 번 하는 셈이라 대체한다 */}
                                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                  {memberNames.length > 0 ? `${memberNames.length}명` : item.description}
                                </span>
                              </span>
                              <GroupMembers names={memberNames} />
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )}
                  {individualFilteredItems.length === 0 && matchedGroupItems.length === 0 && (
                    <CommandEmpty>{emptyText}</CommandEmpty>
                  )}
                  <CommandGroup>
                    {individualFilteredItems.map((item) => {
                      // 개별 사람 목록 — 그룹 토큰은 위 "그룹으로 추가" 섹션에서 처리됨.
                      // 선택 상태: ALL_* 는 집계 헬퍼, 그 외는 개별 선택 여부.
                      const isSelected = item.value === "ALL_STAFF" ? isAllStaffSelected :
                        item.value === "ALL_TEACHERS" ? isAllTeachersSelected :
                          selectedValues.includes(item.value);
                      const displayLabel = getSpreadsheetPersonLabel(item);

                      return (
                        <CommandItem
                          key={item.value}
                          value={displayLabel}
                          onSelect={() => toggleSelection(item.value)}
                          className="cursor-pointer"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              isSelected ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col">
                            <span className="flex items-center gap-2">
                              {displayLabel}
                            </span>
                            {item.description && (
                              <span className="text-sm text-muted-foreground">
                                {item.description}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>}
          </Command>
        </PickerContent>
      </PickerRoot>

      {/* 선택된 대상 칩 목록 */}
      {!singleSelect && selectedValues.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {isAllStaffSelected ? (
            // "전체 교직원"이 선택된 경우 그 칩 하나만 — 개별 이름을 다 늘어놓지 않는다
            <SelectedChip
              tone="group"
              label="전체 교직원"
              removeLabel="전체 교직원 선택 해제"
              onRemove={() => removeSelected("ALL_STAFF")}
            />
          ) : isAllTeachersSelected ? (
            <SelectedChip
              tone="group"
              label="전체 선생님"
              removeLabel="전체 선생님 선택 해제"
              onRemove={() => removeSelected("ALL_TEACHERS")}
            />
          ) : (
            // 그룹 칩(태그·학년·반) + 남은 개별 칩
            // (+ 목록에서 해석 안 된 값도 앰버로 노출 — 숨기면 중복 추가를 부른다)
            <>
              {groupChips.map((group) => (
                <NameOverlay key={group.value} names={group.names} side="top">
                  <SelectedChip
                    tone="group"
                    label={group.label}
                    count={group.members.length}
                    title={`${group.label} — ${group.names.join(", ")}`}
                    removeLabel={`${group.label} 선택 해제`}
                    onRemove={() => {
                      const drop = new Set(group.members);
                      onSelectionChange(selectedValues.filter((v) => !drop.has(v)));
                    }}
                  />
                </NameOverlay>
              ))}
              {chipItems.map((item) => (
                <SelectedChip
                  key={item.value}
                  code={getStudentGccnn(item)}
                  label={item.label}
                  title={getSpreadsheetPersonLabel(item)}
                  removeLabel={`${getSpreadsheetPersonLabel(item)} 선택 해제`}
                  onRemove={() => removeSelected(item.value)}
                />
              ))}
              {unresolvedValues.map((value) => (
                <SelectedChip
                  key={value}
                  tone="warning"
                  label={value}
                  title={`목록에서 찾을 수 없는 항목: ${value}`}
                  removeLabel={`${value} 선택 해제`}
                  onRemove={() => removeSelected(value)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
