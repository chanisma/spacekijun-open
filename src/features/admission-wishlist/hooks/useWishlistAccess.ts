import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUnifiedAuth } from '@/services/hooks/useUnifiedAuth';
import { supabase } from '@/integrations/supabase/client';

// 담임 = "N학년 M반" 태그, 학년 부장 = "N학년 부장" 태그.
// (rescue-note useRescueAccess 와 동일 규칙 — 권한 판정은 서버 can_care_student 가
//  최종 게이트이고, 여기서는 학생 선택 UI 에 보여줄 반 목록만 산출한다.)
const HOMEROOM_TAG_PATTERN = /^(\d+)학년\s*(\d+)반$/;
const GRADE_HEAD_TAG_PATTERN = /^(\d+)학년\s*부장$/;

export interface ClassEntry { grade: number; classNumber: number; }

export interface WishlistAccess {
  /** 뷰어가 학생 본인인지 (자기 데이터만 열람·수정) */
  isStudent: boolean;
  /** 학생 본인의 student_code (학생일 때만) */
  ownStudentCode: string | null;
  /** 교사/admin 으로서 학생을 선택해 열람할 수 있는지 */
  canBrowseStudents: boolean;
  /** 학생 선택 패널에 표시할 반 목록 (담임 반 + 학년부장 학년 전체, admin/부장 = 전체) */
  visibleClasses: ClassEntry[];
  /** 담임 본인 반 (패널 기본 펼침용) */
  homeroomClass: ClassEntry | null;
  isAdmin: boolean;
  /**
   * 선택한 학생을 대신 신청(추가·수정·삭제)할 수 있는지 — admin 은 전 학생,
   * 담임은 자기 반 학생, 학년부장은 자기 학년 전체 학생.
   * 서버 can_write_wishlist RLS 와 동일 규칙이라 UI 와 RLS 가 어긋나지 않는다.
   */
  canEditStudent: (grade: number | null | undefined, classNumber: number | null | undefined) => boolean;
}

async function fetchAllClasses(): Promise<ClassEntry[]> {
  const { data, error } = await supabase
    .from('student_basic_info')
    .select('grade, class_num')
    .not('grade', 'is', null)
    .not('class_num', 'is', null);
  if (error) throw error;
  const set = new Map<string, ClassEntry>();
  (data ?? []).forEach((r: any) => {
    const key = `${r.grade}-${r.class_num}`;
    if (!set.has(key)) set.set(key, { grade: r.grade, classNumber: r.class_num });
  });
  return Array.from(set.values()).sort((a, b) => a.grade - b.grade || a.classNumber - b.classNumber);
}

async function fetchMyResourceTags(resourceId: string): Promise<string[]> {
  const { data: assigns, error: aErr } = await supabase
    .from('resource_tag_assignments')
    .select('tag_id')
    .eq('resource_id', resourceId);
  if (aErr) throw aErr;
  const tagIds = Array.from(new Set((assigns ?? []).map((a: any) => a.tag_id as string)));
  if (tagIds.length === 0) return [];
  const { data: tags, error: tErr } = await supabase
    .from('resource_tags')
    .select('name')
    .in('id', tagIds);
  if (tErr) throw tErr;
  return Array.from(new Set((tags ?? []).map((t: any) => t.name as string)));
}

export function useWishlistAccess(): WishlistAccess {
  const { isAdmin, isStudentView } = useAuth();
  const { user } = useUnifiedAuth();
  const resource = user?.primaryResource;
  const resourceId = resource?.id ?? null;
  const resourceType = resource?.type ?? null;
  const meta = (resource?.meta ?? {}) as Record<string, unknown>;

  // 학생 본인 코드: student resource 의 meta.id. admin 학생 미리보기는 제외(자기 데이터 아님).
  const ownStudentCode =
    resourceType === 'student' && !isAdmin ? ((meta.id as string) ?? null) : null;
  const isStudent = (resourceType === 'student' && !isAdmin) || (isStudentView && !isAdmin);

  const tagsQ = useQuery({
    queryKey: ['admission-wishlist', 'my-tags', resourceId],
    queryFn: () => fetchMyResourceTags(resourceId!),
    enabled: !!resourceId && !isStudent,
    staleTime: 5 * 60 * 1000,
  });
  const tagNames = useMemo(() => tagsQ.data ?? [], [tagsQ.data]);

  const homeroomFromTags = useMemo(() => {
    const set = new Map<string, ClassEntry>();
    tagNames.forEach((name) => {
      const m = name.match(HOMEROOM_TAG_PATTERN);
      if (m) {
        const g = Number(m[1]); const c = Number(m[2]);
        if (Number.isFinite(g) && Number.isFinite(c)) set.set(`${g}-${c}`, { grade: g, classNumber: c });
      }
    });
    return Array.from(set.values());
  }, [tagNames]);

  const metaHomeroom = useMemo<ClassEntry | null>(() => {
    if (meta.grade && meta.class_number) {
      const g = Number(meta.grade); const c = Number(meta.class_number);
      if (Number.isFinite(g) && Number.isFinite(c)) return { grade: g, classNumber: c };
    }
    return null;
  }, [meta.grade, meta.class_number]);

  const gradeHeadGrades = useMemo(() => {
    const set = new Set<number>();
    tagNames.forEach((name) => {
      const m = name.match(GRADE_HEAD_TAG_PATTERN);
      if (m) { const g = Number(m[1]); if (Number.isFinite(g)) set.add(g); }
    });
    return Array.from(set);
  }, [tagNames]);

  const isHomeroom = homeroomFromTags.length > 0 || !!metaHomeroom;
  const isGradeHead = gradeHeadGrades.length > 0;
  const canBrowseStudents = !isStudent && (isAdmin || isHomeroom || isGradeHead);

  const { data: allClasses = [] } = useQuery({
    queryKey: ['admission-wishlist', 'all-classes'],
    queryFn: fetchAllClasses,
    enabled: canBrowseStudents && (isAdmin || isGradeHead),
    staleTime: 10 * 60 * 1000,
  });

  return useMemo<WishlistAccess>(() => {
    const homeroomClass = homeroomFromTags[0] ?? metaHomeroom ?? null;
    let visibleClasses: ClassEntry[] = [];
    if (isAdmin) {
      visibleClasses = allClasses;
    } else {
      const set = new Map<string, ClassEntry>();
      homeroomFromTags.forEach((c) => set.set(`${c.grade}-${c.classNumber}`, c));
      if (metaHomeroom) set.set(`${metaHomeroom.grade}-${metaHomeroom.classNumber}`, metaHomeroom);
      gradeHeadGrades.forEach((g) => {
        allClasses.filter((c) => c.grade === g).forEach((c) => set.set(`${c.grade}-${c.classNumber}`, c));
      });
      visibleClasses = Array.from(set.values()).sort((a, b) => a.grade - b.grade || a.classNumber - b.classNumber);
    }

    // 담임으로서 쓰기 가능한 반 집합 (반 태그 + 레거시 meta).
    const writableClassKeys = new Set<string>();
    homeroomFromTags.forEach((c) => writableClassKeys.add(`${c.grade}-${c.classNumber}`));
    if (metaHomeroom) writableClassKeys.add(`${metaHomeroom.grade}-${metaHomeroom.classNumber}`);
    // 학년부장으로서 쓰기 가능한 학년 집합 (해당 학년 전체 R/W).
    const writableGradeHeadGrades = new Set<number>(gradeHeadGrades);

    const canEditStudent = (
      grade: number | null | undefined,
      classNumber: number | null | undefined
    ): boolean => {
      if (isAdmin) return true; // admin = 전 학생 대리 신청
      if (grade == null || classNumber == null) return false;
      if (writableGradeHeadGrades.has(grade)) return true; // 학년부장 = 자기 학년 전체
      return writableClassKeys.has(`${grade}-${classNumber}`); // 담임 = 자기 반 학생만
    };

    return {
      isStudent,
      ownStudentCode,
      canBrowseStudents,
      visibleClasses,
      homeroomClass,
      isAdmin,
      canEditStudent,
    };
  }, [isStudent, ownStudentCode, canBrowseStudents, homeroomFromTags, metaHomeroom, gradeHeadGrades, allClasses, isAdmin]);
}
