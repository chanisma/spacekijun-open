import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isChosungMatch } from "@/lib/utils";

/**
 * 검색 가능한 Select 컴포넌트용 아이템 인터페이스
 */
export interface SelectItem {
  value: string;
  label: string;
  description?: string;
  /** 사람 항목의 리소스 타입. 학생/교직원 혼합 선택 및 붙여넣기 매칭에 사용. */
  resourceType?: ResourceType;
  /** 태그 색상 (태그 기반 일괄 선택 옵션용) */
  tagColor?: string;
  /** 이 옵션이 선택될 때 실제로 선택되어야 할 리소스 ID 목록 */
  expandsTo?: string[];
  /** 태그 항목(TAG_*)이 is_bulk_option=true 인지. quick-add 칩 vs 검색 목록 라우팅용. */
  isBulk?: boolean;
  /**
   * 그룹 항목(TAG_/CLASS_/COURSE_)을 검색 텍스트로 매칭할 때 쓰는 추가 키워드.
   * 예: 반 그룹은 ["2학년 1반","2-1"], 수업 그룹은 ["화학","화학 2-1"].
   * label 외에 이 토큰들로도 매칭되게 해 '#' 없이 자연 입력으로 찾게 한다.
   */
  searchTokens?: string[];
  /** 그룹 항목의 분류 — 렌더링 시 섹션/뱃지 라벨에 활용. */
  groupKind?: "tag" | "class" | "grade" | "course";
  /**
   * 학생 리소스의 학적 코드 (resource.meta->>'id', 예: "00-00305").
   * filterByStudent 결과에만 존재. value(resource.id, UUID)와는 별개의 식별자이며,
   * 학적 코드를 키로 쓰는 도메인(rescue-note 등)에서 value를 코드로 변환할 때 사용.
   */
  studentCode?: string;
  /** 학생 학년 (resource.meta->>'grade'). filterByStudent 결과에만 존재. */
  studentGrade?: number;
  /** 학생 반 (resource.meta->>'class'). filterByStudent 결과에만 존재. */
  studentClass?: number;
  /** 학생 번호 (resource.meta->>'number', 반 내 출석번호). filterByStudent 결과에만 존재. */
  studentNumber?: number;
}

/**
 * 리소스 타입
 */
export type ResourceType = "teacher" | "student" | "staff";

/**
 * useResourceSelect 훅 옵션
 */
interface UseResourceSelectOptions {
  /** 리소스 타입 필터 */
  resourceType?: ResourceType | ResourceType[];
  /** "전체" 옵션 포함 여부 (multi-select용) */
  includeAllOptions?: boolean;
  /** 태그 기반 일괄 선택 옵션 포함 여부 (is_bulk_option=true 태그를 quick-add 칩으로) */
  includeTagOptions?: boolean;
  /**
   * 모든 태그(bulk 여부 무관)를 검색 가능한 TAG_* 항목으로 포함.
   * includeTagOptions가 quick-add 칩(bulk 전용)을 담당한다면, 이 옵션은
   * 검색 목록에 전체 태그를 노출한다. enableTagSearch 기능의 데이터 소스.
   */
  includeAllTags?: boolean;
  /**
   * 학생 반(학년-반) 그룹을 CLASS_<grade>_<class> 항목으로,
   * 학년 전체 그룹을 GRADE_<grade> 항목("N학년 전체")으로 포함.
   * 각 항목의 expandsTo = 해당 반/학년 학생들의 resource.id. enableClassSearch의 데이터 소스.
   * student 타입 데이터가 로드돼 있어야 의미가 있다.
   */
  includeClassGroups?: boolean;
  /**
   * 수업(과목) 그룹을 COURSE_<subject>(전체) + COURSE_<subject>__<grade>_<class>(반별)
   * 항목으로 포함. enableCourseSearch의 데이터 소스.
   * 기준 학년도·학기는 academicTerm으로 주입한다(관리자 설정값). null이면 비활성.
   */
  includeCourseGroups?: boolean;
  /**
   * 수업 그룹의 기준 학년도·학기 (관리자 system_settings 'academic_term').
   * 하드코딩하지 않으며, null/미설정이면 수업 그룹 쿼리를 실행하지 않는다.
   */
  academicTerm?: { year: number; semester: number } | null;
  /** 쿼리 활성화 여부 */
  enabled?: boolean;
}

/**
 * 그룹 토큰 프리픽스 — 선택 시 expandsTo(개별 resource.id)로 전개되는 항목들.
 * 개별 리소스(UUID)·ALL_* 와 구분하는 데 쓴다.
 */
export const GROUP_PREFIXES = ["TAG_", "CLASS_", "GRADE_", "COURSE_"] as const;

export function isGroupValue(value: string): boolean {
  return GROUP_PREFIXES.some((p) => value.startsWith(p));
}

/** "1반" / "1" 등에서 앞쪽 정수를 뽑는다. 못 뽑으면 null. */
function parseLeadingInt(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const m = String(value).match(/\d+/);
  return m ? Number(m[0]) : null;
}

/**
 * Supabase/PostgREST는 .select()에 범위를 지정하지 않으면 한 번에 최대 1000행만
 * 반환한다(에러·경고 없음). 학생/수강 데이터는 수천 행이므로 .range()로 끝까지
 * 페이지네이션해 전부 모은다. 이 누락이 "수업명 검색 시 몇 명만 나옴"의 원인이었다.
 *
 * @param buildQuery 매 페이지마다 동일 조건의 쿼리를 새로 만드는 팩토리.
 *                   (PostgREST 쿼리 빌더는 1회용이라 매번 새로 생성해야 한다)
 */
const SUPABASE_PAGE_SIZE = 1000;

/**
 * .range() 기반 전체 조회. pageFetcher(from, to)가 [from,to] 구간을 반환하면
 * 짧은 페이지가 나올 때까지 반복해 전 행을 모은다.
 */
async function rangedFetchAll<T>(
  pageFetcher: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // 안전장치: 무한 루프 방지(최대 50페이지 = 5만 행)
  for (let page = 0; page < 50; page++) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await pageFetcher(from, to);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < SUPABASE_PAGE_SIZE) break; // 마지막 페이지
    from += SUPABASE_PAGE_SIZE;
  }
  return all;
}

/**
 * 리소스 데이터를 가져오고 필터링하는 훅
 */
export function useResourceSelect(options: UseResourceSelectOptions = {}) {
  const {
    resourceType,
    includeAllOptions = false,
    includeTagOptions = false,
    includeAllTags = false,
    includeClassGroups = false,
    includeCourseGroups = false,
    academicTerm = null,
    enabled = true,
  } = options;

  // 타입 배열로 정규화
  const types = useMemo(() => {
    if (!resourceType) return [];
    return Array.isArray(resourceType) ? resourceType : [resourceType];
  }, [resourceType]);

  // 태그 옵션 쿼리. is_bulk_option("드롭다운 표시")=true 태그만 가져온다.
  // includeTagOptions: quick-add 칩으로 사용
  // includeAllTags:    검색 목록으로 사용
  // 두 경로 모두 동일한 bulk 태그 집합을 쓰며, 컴포넌트가 isBulk로 칩/검색 위치를 정한다.
  const {
    data: tagOptionsData,
    isLoading: tagOptionsLoading,
  } = useQuery({
    queryKey: ["resource-select", "tag-options"],
    queryFn: async () => {
      // 1. 태그 가져오기 — "드롭다운 표시"(is_bulk_option=true) 태그만.
      //    이 토글이 selector 노출의 단일 기준: ON이면 빠른추가 칩 + 검색 모두 가능,
      //    OFF면 칩에도 검색에도 나타나지 않는다.
      const { data: tags, error: tagsError } = await supabase
        .from("resource_tags")
        .select("*")
        .eq("is_bulk_option", true)
        .order("sort_order");

      if (tagsError) {
        console.error("태그 조회 오류:", tagsError);
        return [];
      }

      if (!tags || tags.length === 0) return [];

      // 2. 각 태그에 할당된 리소스 ID 가져오기
      const { data: assignments, error: assignmentsError } = await supabase
        .from("resource_tag_assignments")
        .select("tag_id, resource_id");

      if (assignmentsError) {
        console.error("태그 할당 조회 오류:", assignmentsError);
        return [];
      }

      // 3. 태그별 리소스 ID 그룹화
      const tagResourceMap = new Map<string, string[]>();
      (assignments || []).forEach((a) => {
        if (!tagResourceMap.has(a.tag_id)) {
          tagResourceMap.set(a.tag_id, []);
        }
        tagResourceMap.get(a.tag_id)!.push(a.resource_id);
      });

      // 4. SelectItem 형태로 변환
      return tags
        .filter((tag) => {
          const resourceIds = tagResourceMap.get(tag.id) || [];
          return resourceIds.length > 0; // 리소스가 있는 태그만
        })
        .map((tag) => ({
          value: `TAG_${tag.id}`,
          label: `전체 ${tag.name}`,
          description: `${tag.name} 태그가 지정된 모든 교직원`,
          tagColor: tag.color,
          expandsTo: tagResourceMap.get(tag.id) || [],
          isBulk: tag.is_bulk_option === true,
          groupKind: "tag" as const,
          searchTokens: [tag.name],
        }));
    },
    enabled: enabled && (includeTagOptions || includeAllTags),
  });

  // 교직원(teacher/staff) 리소스 쿼리
  const {
    data: staffResources = [],
    isLoading: staffLoading,
  } = useQuery({
    queryKey: ["resource-select", "staff", types],
    queryFn: async () => {
      const filterTypes = types.filter(t => t === "teacher" || t === "staff");
      if (filterTypes.length === 0) return [];

      const { data, error } = await supabase
        .from("resource")
        .select("id, name, type")
        .in("type", filterTypes)
        .order("name");

      if (error) {
        console.error("교직원 목록 조회 오류:", error);
        throw error;
      }

      const items: SelectItem[] = data.map(resource => ({
        value: resource.id,
        label: resource.name,
        description: resource.type === "teacher" ? "선생님" : "직원",
        resourceType: resource.type as ResourceType,
      }));

      // "전체" 옵션 추가
      if (includeAllOptions && items.length > 0) {
        const allOptions: SelectItem[] = [];

        if (filterTypes.includes("teacher") && filterTypes.includes("staff")) {
          allOptions.push({
            value: "ALL_STAFF",
            label: "전체 교직원",
            description: "모든 교직원 선택"
          });
        }

        if (filterTypes.includes("teacher")) {
          allOptions.push({
            value: "ALL_TEACHERS",
            label: "전체 선생님",
            description: "모든 선생님 선택"
          });
        }

        return [...allOptions, ...items];
      }

      return items;
    },
    enabled: enabled && types.some(t => t === "teacher" || t === "staff"),
  });

  // 학생 리소스 쿼리 — 재학생(status='active')만. 졸업/전출/자퇴 학생은 학적은 남아있어도
  // "현재 선택 가능한 학생" 목록에는 포함하지 않는다(CLAUDE.md 재학생 조회 원칙).
  // description에 "N학년 M반 K번"을 넣어 동명이인을 검색 목록에서 바로 구분할 수 있게 한다.
  const {
    data: studentResources = [],
    isLoading: studentLoading,
  } = useQuery({
    queryKey: ["resource-select", "student"],
    queryFn: async () => {
      // 전 재학생 조회 — 1000행 캡 우회(학생 수가 1000명을 넘어도 누락 없도록).
      type Row = { id: string; name: string; type: string; meta: unknown };
      const data = await rangedFetchAll<Row>((from, to) =>
        supabase
          .from("resource")
          .select("id, name, type, meta")
          .eq("type", "student")
          .eq("status", "active")
          .order("name")
          .range(from, to)
      );

      return data.map(resource => {
        const meta = resource.meta as unknown as
          { id?: string; grade?: number | string; class?: number | string; number?: number | string } | null;
        const grade = parseLeadingInt(meta?.grade) ?? undefined;
        const cls = parseLeadingInt(meta?.class) ?? undefined;
        const number = parseLeadingInt(meta?.number) ?? undefined;
        const studentGccnn =
          grade != null && cls != null && number != null
            ? `${grade}${String(cls).padStart(2, "0")}${String(number).padStart(2, "0")}`
            : undefined;
        const description = grade != null && cls != null
          ? `${grade}학년 ${cls}반${number != null ? ` ${number}번` : ""}`
          : "학생";
        return {
          value: resource.id,
          label: resource.name,
          description,
          resourceType: "student" as const,
          searchTokens: studentGccnn ? [studentGccnn] : undefined,
          studentCode: meta?.id,
          studentGrade: grade,
          studentClass: cls,
          studentNumber: number,
        };
      }) as SelectItem[];
    },
    enabled: enabled && types.includes("student"),
  });

  // 반(학년-반) 그룹 쿼리 — CLASS_<grade>_<class>. expandsTo = 그 반 학생 resource.id.
  // resource.meta(grade/class)를 권위 출처로 사용. 검색 토큰으로 "N학년 M반"·"N-M"을 단다.
  // 재학생(status='active')만 포함 — 졸업/전출/자퇴 학생이 반 전체 선택에 섞이지 않도록.
  const {
    data: classGroups = [],
    isLoading: classGroupsLoading,
  } = useQuery({
    queryKey: ["resource-select", "class-groups"],
    queryFn: async () => {
      // 전 재학생을 페이지네이션으로 모두 조회(1000행 캡 우회)
      type Row = { id: string; meta: unknown };
      let data: Row[];
      try {
        data = await rangedFetchAll<Row>((from, to) =>
          // .order("id"): 페이지 간 안정적 정렬 보장(없으면 range 경계에서 누락/중복 가능)
          supabase.from("resource").select("id, meta").eq("type", "student").eq("status", "active")
            .order("id").range(from, to)
        );
      } catch (error) {
        console.error("반 그룹 조회 오류:", error);
        return [];
      }

      // (grade, class) → 학생 id 목록, 그리고 grade → 학생 id 목록(학년 전체)
      const byClass = new Map<string, { grade: number; cls: number; ids: string[] }>();
      const byGrade = new Map<number, string[]>();
      for (const row of data) {
        const meta = row.meta as unknown as { grade?: number | string; class?: number | string } | null;
        const grade = parseLeadingInt(meta?.grade);
        const cls = parseLeadingInt(meta?.class);
        if (grade === null) continue;
        // 학년 전체: 반이 없어도 학년만 있으면 포함
        if (!byGrade.has(grade)) byGrade.set(grade, []);
        byGrade.get(grade)!.push(row.id);
        if (cls === null) continue;
        const key = `${grade}_${cls}`;
        if (!byClass.has(key)) byClass.set(key, { grade, cls, ids: [] });
        byClass.get(key)!.ids.push(row.id);
      }

      // 학년 전체 그룹 — GRADE_<grade>. 반 그룹보다 위에 노출(coarser 먼저).
      const gradeGroups: SelectItem[] = Array.from(byGrade.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([grade, ids]) => ({
          value: `GRADE_${grade}`,
          label: `${grade}학년 전체`,
          description: `학생 ${ids.length}명`,
          expandsTo: ids,
          groupKind: "grade" as const,
          searchTokens: [`${grade}학년 전체`, `${grade}학년`],
        }));

      const classGroupItems: SelectItem[] = Array.from(byClass.values())
        .sort((a, b) => a.grade - b.grade || a.cls - b.cls)
        .map(({ grade, cls, ids }) => ({
          value: `CLASS_${grade}_${cls}`,
          label: `${grade}학년 ${cls}반`,
          description: `학생 ${ids.length}명`,
          expandsTo: ids,
          groupKind: "class" as const,
          // '#' 없이 자연 입력으로 찾도록: "N학년 M반"·"N-M" 두 형태만 (공백형 제외)
          searchTokens: [`${grade}학년 ${cls}반`, `${grade}-${cls}`],
        }));

      return [...gradeGroups, ...classGroupItems];
    },
    enabled: enabled && includeClassGroups,
  });

  // 수업(과목) 그룹 쿼리 — 현재 학년도·학기 student_enrollment 기준.
  // COURSE_<subject>(전체) + COURSE_<subject>__<grade>_<class>(반별).
  // student_resource_id 가 비어있는 행은 제외(전개 시 null 유입 방지).
  const {
    data: courseGroups = [],
    isLoading: courseGroupsLoading,
  } = useQuery({
    queryKey: ["resource-select", "course-groups", academicTerm?.year, academicTerm?.semester],
    queryFn: async () => {
      // academicTerm은 enabled 가드로 보장되지만 타입 안정성을 위해 한 번 더 확인.
      if (!academicTerm) return [];
      // 한 학기 수강 행은 수천 건 → 1000행 캡을 페이지네이션으로 우회(전 학생 포함).
      type Row = {
        subject_name: string | null;
        student_grade: number | string | null;
        student_class: string | null;
        student_resource_id: string | null;
      };
      let data: Row[];
      try {
        data = await rangedFetchAll<Row>((from, to) =>
          supabase
            .from("student_enrollment")
            .select("id, subject_name, student_grade, student_class, student_resource_id")
            .eq("academic_year", academicTerm.year)
            .eq("semester", academicTerm.semester)
            .not("student_resource_id", "is", null)
            // .order("id"): 페이지 간 안정적 정렬 보장
            .order("id")
            .range(from, to)
        );
      } catch (error) {
        console.error("수업 그룹 조회 오류:", error);
        return [];
      }

      // subject → 전체 id 집합, 그리고 subject → (grade,class) → id 집합
      const subjectAll = new Map<string, Set<string>>();
      const subjectByClass = new Map<string, Map<string, { grade: number; cls: number; ids: Set<string> }>>();

      for (const row of data) {
        const subject = row.subject_name;
        const rid = row.student_resource_id;
        if (!subject || !rid) continue;
        const grade = parseLeadingInt(row.student_grade);
        const cls = parseLeadingInt(row.student_class);

        if (!subjectAll.has(subject)) subjectAll.set(subject, new Set());
        subjectAll.get(subject)!.add(rid);

        if (grade !== null && cls !== null) {
          if (!subjectByClass.has(subject)) subjectByClass.set(subject, new Map());
          const classMap = subjectByClass.get(subject)!;
          const key = `${grade}_${cls}`;
          if (!classMap.has(key)) classMap.set(key, { grade, cls, ids: new Set() });
          classMap.get(key)!.ids.add(rid);
        }
      }

      const result: SelectItem[] = [];
      for (const subject of Array.from(subjectAll.keys()).sort((a, b) => a.localeCompare(b, "ko"))) {
        const allIds = Array.from(subjectAll.get(subject)!);
        // 과목 전체 행
        result.push({
          value: `COURSE_${subject}`,
          label: `${subject} 전체`,
          description: `학생 ${allIds.length}명`,
          expandsTo: allIds,
          groupKind: "course",
          searchTokens: [subject],
        });
        // 반별 행
        const classMap = subjectByClass.get(subject);
        if (classMap) {
          for (const { grade, cls, ids } of Array.from(classMap.values()).sort(
            (a, b) => a.grade - b.grade || a.cls - b.cls
          )) {
            result.push({
              value: `COURSE_${subject}__${grade}_${cls}`,
              label: `${subject} · ${grade}-${cls}`,
              description: `학생 ${ids.size}명`,
              expandsTo: Array.from(ids),
              groupKind: "course",
              searchTokens: [subject, `${subject} ${grade}-${cls}`, `${subject} ${grade}학년 ${cls}반`],
            });
          }
        }
      }
      return result;
    },
    // academicTerm(관리자 설정) 없으면 비활성 — 달력 폴백 없음(요구사항)
    enabled: enabled && includeCourseGroups && !!academicTerm,
  });

  // 그룹 항목(TAG_/CLASS_/COURSE_) 병합 — 개별 리소스 타입과 독립적으로 켜진다.
  // 예: 교사 전용 selector라도 enableClassSearch가 켜지면 반 그룹(→학생 전개)을 노출.
  const groupItems = useMemo(() => {
    const result: SelectItem[] = [];
    // 검색용 전체 태그 (includeAllTags). quick-add 칩 전용 모드(includeTagOptions만)는
    // 아래 items에서 칩으로 쓰이므로 여기엔 bulk 칩이 중복돼도 무방(소비처가 라우팅).
    if ((includeTagOptions || includeAllTags) && tagOptionsData) {
      result.push(...tagOptionsData);
    }
    if (includeClassGroups) result.push(...classGroups);
    if (includeCourseGroups) result.push(...courseGroups);
    return result;
  }, [
    includeTagOptions, includeAllTags, tagOptionsData,
    includeClassGroups, classGroups, includeCourseGroups, courseGroups,
  ]);

  // 모든 리소스 병합
  const items = useMemo(() => {
    const result: SelectItem[] = [];

    // 태그 기반 일괄 선택 옵션 추가 (includeTagOptions 또는 includeAllTags)
    if ((includeTagOptions || includeAllTags) && tagOptionsData && tagOptionsData.length > 0) {
      result.push(...tagOptionsData);
    }

    if (types.some(t => t === "teacher" || t === "staff")) {
      result.push(...staffResources);
    }

    if (types.includes("student")) {
      result.push(...studentResources);
    }

    // 반/수업 그룹 (타입과 무관하게 플래그로 제어)
    if (includeClassGroups) result.push(...classGroups);
    if (includeCourseGroups) result.push(...courseGroups);

    return result;
  }, [
    types, staffResources, studentResources, includeTagOptions, includeAllTags,
    tagOptionsData, includeClassGroups, classGroups, includeCourseGroups, courseGroups,
  ]);

  // 로딩 상태
  const isLoading = useMemo(() => {
    if ((includeTagOptions || includeAllTags) && tagOptionsLoading) return true;
    if (types.some(t => t === "teacher" || t === "staff") && staffLoading) return true;
    if (types.includes("student") && studentLoading) return true;
    if (includeClassGroups && classGroupsLoading) return true;
    if (includeCourseGroups && courseGroupsLoading) return true;
    return false;
  }, [
    types, staffLoading, studentLoading, includeTagOptions, includeAllTags, tagOptionsLoading,
    includeClassGroups, classGroupsLoading, includeCourseGroups, courseGroupsLoading,
  ]);

  return {
    items,
    groupItems,
    isLoading,
    staffResources,
    studentResources,
    tagOptions: tagOptionsData || [],
  };
}

/**
 * 그룹 선택을 실제 리소스 ID로 확장하는 유틸리티.
 * TAG_/CLASS_/COURSE_ 형식의 토큰을 expandsTo(구성원 resource.id)로 전개하고,
 * 일반 리소스 ID는 그대로 통과시킨다. ALL_* 는 호출부에서 이미 개별 값으로
 * 펼쳐지므로 여기선 무시한다.
 *
 * @param groupOptions expandsTo를 가진 모든 그룹 항목(items 또는 groupItems)
 */
export function expandGroupSelections(
  selectedValues: string[],
  groupOptions: SelectItem[]
): string[] {
  const result: string[] = [];
  const groupMap = new Map(
    groupOptions.filter(opt => opt.expandsTo).map(opt => [opt.value, opt.expandsTo!])
  );

  for (const value of selectedValues) {
    if (isGroupValue(value)) {
      // 그룹 토큰 — 매핑이 있으면 전개, 없으면(데이터 미로드 등) 조용히 건너뜀
      const expanded = groupMap.get(value);
      if (expanded) result.push(...expanded);
    } else if (!value.startsWith("ALL_")) {
      // 일반 리소스 ID
      result.push(value);
    }
  }

  return [...new Set(result)];
}

/**
 * @deprecated expandGroupSelections 로 대체. TAG_ 전용 호환 별칭.
 */
export function expandTagSelections(
  selectedValues: string[],
  tagOptions: SelectItem[]
): string[] {
  return expandGroupSelections(selectedValues, tagOptions);
}

/**
 * 아이템 필터링 유틸리티 (초성 검색 포함)
 */
export function filterItems(items: SelectItem[], searchValue: string): SelectItem[] {
  if (!searchValue) return items;

  return items.filter(item =>
    isChosungMatch(item.label, searchValue) ||
    (item.description && isChosungMatch(item.description, searchValue)) ||
    item.searchTokens?.some(token => isChosungMatch(token, searchValue))
  );
}

/**
 * 그룹 항목(CLASS_/COURSE_ 등)을 검색어로 매칭한다.
 * label·description 외에 searchTokens 로도 매칭해 "2학년 1반"·"2-1"·과목명 같은
 * 자연 입력('#' 없이)으로 찾게 한다. 검색어가 비면 매칭 안 함(기본 목록 오염 방지).
 */
export function matchesGroupSearch(item: SelectItem, searchValue: string): boolean {
  const q = searchValue.trim();
  if (!q) return false;
  if (isChosungMatch(item.label, q)) return true;
  if (item.description && isChosungMatch(item.description, q)) return true;
  for (const token of item.searchTokens ?? []) {
    if (isChosungMatch(token, q)) return true;
    // 토큰 정규화 비교(공백 제거) — "2-1" 입력이 "2-1" 토큰과 어긋나지 않게
    if (token.replace(/\s+/g, "").toLowerCase().includes(q.replace(/\s+/g, "").toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * "전체 선택" 관련 유틸리티
 */
export function getAllSelectionHelpers(items: SelectItem[], selectedValues: string[]) {
  // 그룹 옵션들 (TAG_/CLASS_/COURSE_ 형식 — expandsTo 보유)
  const groupOptions = items.filter(item => isGroupValue(item.value));
  // 하위호환: 기존 호출부가 tagOptions 라는 이름을 기대하므로 동일 배열을 별칭으로 노출
  const tagOptions = groupOptions;

  // 실제 개별 아이템들 (ALL_*, 그룹 토큰 제외)
  const individualItems = items.filter(
    item => !item.value.startsWith("ALL_") && !isGroupValue(item.value)
  );

  // 모든 교직원 값
  const allStaffValues = individualItems.map(item => item.value);

  // 선생님만
  const teacherValues = individualItems
    .filter(item => item.description === "선생님")
    .map(item => item.value);

  // 전체 교직원 선택 여부
  const isAllStaffSelected = allStaffValues.length > 0 &&
    allStaffValues.every(v => selectedValues.includes(v));

  // 전체 선생님 선택 여부
  const isAllTeachersSelected = teacherValues.length > 0 &&
    teacherValues.every(v => selectedValues.includes(v)) &&
    !isAllStaffSelected;

  // 각 그룹 옵션의 선택 여부 (모든 구성원이 선택돼 있으면 그룹도 선택 상태)
  const tagSelectionStatus = new Map<string, boolean>();
  groupOptions.forEach(opt => {
    if (opt.expandsTo && opt.expandsTo.length > 0) {
      const isSelected = opt.expandsTo.every(v => selectedValues.includes(v));
      tagSelectionStatus.set(opt.value, isSelected);
    }
  });

  return {
    individualItems,
    allStaffValues,
    teacherValues,
    isAllStaffSelected,
    isAllTeachersSelected,
    tagOptions,
    groupOptions,
    tagSelectionStatus,
  };
}
