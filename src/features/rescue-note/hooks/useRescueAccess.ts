import { useMemo } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUnifiedAuth } from '@/services/hooks/useUnifiedAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RESCUE_ROLE, type RescueRole } from '../constants';
import type { RescueAccess } from '../types/permissions';

interface ClassEntry { grade: number; classNumber: number; }

const COUNSELOR_TAG = '상담교사';
const STAFF_ADMIN_TAG = '위기관리담당자';
const HOMEROOM_TAG_PATTERN = /^(\d+)학년\s*(\d+)반$/;
// 학년 부장: "N학년 부장" → 해당 학년 전체 열람/기록 (담임과 staff_admin 사이의 scoped 권한)
const GRADE_HEAD_TAG_PATTERN = /^(\d+)학년\s*부장$/;

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
  return Array.from(set.values()).sort((a, b) =>
    a.grade - b.grade || a.classNumber - b.classNumber
  );
}

async function fetchMyResourceTagsByResourceId(resourceId: string): Promise<string[]> {
  // resource_tag_assignments(resource_id) → resource_tags(name)
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

export function useRescueAccess(): RescueAccess {
  const { isAdmin } = useAuth();
  const { user } = useUnifiedAuth();
  const meta = user?.primaryResource?.meta as Record<string, unknown> | undefined;
  const resourceId = user?.primaryResource?.id ?? null;

  const tagsQ = useQuery({
    queryKey: ['rescue-note', 'my-resource-tags', resourceId],
    queryFn: () => fetchMyResourceTagsByResourceId(resourceId!),
    enabled: !!resourceId,
    staleTime: 5 * 60 * 1000,
  });
  // useMemo 로 안정적 참조 유지 — 아래 useMemo 들의 의존성으로 쓰이므로
  // 매 렌더마다 새 배열([])을 만들면 불필요한 재계산이 발생한다.
  const tagNames = useMemo(() => tagsQ.data ?? [], [tagsQ.data]);

  // Server-side authoritative permission check via SECURITY DEFINER RPCs.
  // Used as a fallback when client-side tag fetch returns empty (e.g. user
  // hasn't been linked to user_resource but a tag is attached server-side).
  const accessRpcQ = useQuery({
    queryKey: ['rescue-note', 'can-access-rescue-rpc'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_access_rescue');
      if (error) throw error;
      return Boolean(data);
    },
    staleTime: 5 * 60 * 1000,
  });
  const roleRpcQ = useQuery({
    queryKey: ['rescue-note', 'current-rescue-role-rpc'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('current_rescue_role');
      if (error) throw error;
      return (data as RescueRole | null) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
  const serverCanAccess = accessRpcQ.data === true;
  const serverRescueRole = roleRpcQ.data ?? null;

  // ----- Role detection -----
  // Priority (highest wins, regardless of source):
  //   1. staff_admin (위기관리담당자)  — higher authority
  //   2. counselor   (상담교사)
  //   3. null         (no rescue staff role)
  //
  // 한 사용자가 여러 출처(클라이언트 태그, 서버 RPC, legacy meta)에서 서로
  // 다른 역할을 갖고 있을 때 더 높은 권한이 항상 이김. 예: 클라이언트가
  // counselor 태그만 보이지만 서버 RPC가 staff_admin 을 반환하면 → staff_admin.
  const hasCounselorTag = tagNames.includes(COUNSELOR_TAG);
  const hasStaffAdminTag = tagNames.includes(STAFF_ADMIN_TAG);
  const metaRescueRole = (meta?.rescue_role as RescueRole | undefined) ?? null;

  const roleCandidates: RescueRole[] = [];
  if (hasStaffAdminTag) roleCandidates.push(RESCUE_ROLE.STAFF_ADMIN);
  if (hasCounselorTag) roleCandidates.push(RESCUE_ROLE.COUNSELOR);
  if (serverRescueRole) roleCandidates.push(serverRescueRole);
  if (metaRescueRole) roleCandidates.push(metaRescueRole);

  const rescueRole: RescueRole | null =
    roleCandidates.includes(RESCUE_ROLE.STAFF_ADMIN) ? RESCUE_ROLE.STAFF_ADMIN :
    roleCandidates.includes(RESCUE_ROLE.COUNSELOR) ? RESCUE_ROLE.COUNSELOR :
    null;
  const isRescueStaff = rescueRole === RESCUE_ROLE.COUNSELOR || rescueRole === RESCUE_ROLE.STAFF_ADMIN;

  // ----- Homeroom detection (tag-first, meta fallback) -----
  const homeroomClassesFromTags: ClassEntry[] = useMemo(() => {
    const set = new Map<string, ClassEntry>();
    tagNames.forEach((name) => {
      const m = name.match(HOMEROOM_TAG_PATTERN);
      if (m) {
        const g = Number(m[1]);
        const c = Number(m[2]);
        if (Number.isFinite(g) && Number.isFinite(c)) {
          set.set(`${g}-${c}`, { grade: g, classNumber: c });
        }
      }
    });
    return Array.from(set.values()).sort((a, b) => a.grade - b.grade || a.classNumber - b.classNumber);
  }, [tagNames]);

  const metaHomeroomClass: ClassEntry | null = useMemo(() => {
    if (meta?.grade && meta?.class_number) {
      const g = Number(meta.grade);
      const c = Number(meta.class_number);
      if (Number.isFinite(g) && Number.isFinite(c)) {
        return { grade: g, classNumber: c };
      }
    }
    return null;
  }, [meta?.grade, meta?.class_number]);

  // ----- 학년 부장 detection ("N학년 부장" tag → 해당 학년 전체) -----
  const gradeHeadGrades: number[] = useMemo(() => {
    const set = new Set<number>();
    tagNames.forEach((name) => {
      const m = name.match(GRADE_HEAD_TAG_PATTERN);
      if (m) {
        const g = Number(m[1]);
        if (Number.isFinite(g)) set.add(g);
      }
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [tagNames]);
  const isGradeHead = gradeHeadGrades.length > 0;

  const isHomeroom = homeroomClassesFromTags.length > 0 || !!metaHomeroomClass;
  const canSeeMenu = isHomeroom || isGradeHead || isRescueStaff || isAdmin || serverCanAccess;

  // 학년 부장은 자기 학년의 모든 반이 필요하므로 전체 반 목록을 가져온다.
  const { data: allClasses = [] } = useQuery({
    queryKey: ['rescue-note', 'all-classes'],
    queryFn: fetchAllClasses,
    enabled: isRescueStaff || isAdmin || isGradeHead,
    staleTime: 10 * 60 * 1000,
  });

  return useMemo<RescueAccess>(() => {
    const homeroomClass: ClassEntry | null =
      homeroomClassesFromTags[0] ?? metaHomeroomClass ?? null;

    let visibleClasses: ClassEntry[] = [];
    if (isAdmin || isRescueStaff) {
      visibleClasses = allClasses;
    } else {
      // 담임 반 + 학년 부장 학년의 모든 반을 합집합으로 누적
      const set = new Map<string, ClassEntry>();
      homeroomClassesFromTags.forEach((c) => set.set(`${c.grade}-${c.classNumber}`, c));
      if (metaHomeroomClass) {
        set.set(`${metaHomeroomClass.grade}-${metaHomeroomClass.classNumber}`, metaHomeroomClass);
      }
      gradeHeadGrades.forEach((g) => {
        allClasses
          .filter((c) => c.grade === g)
          .forEach((c) => set.set(`${c.grade}-${c.classNumber}`, c));
      });
      visibleClasses = Array.from(set.values()).sort(
        (a, b) => a.grade - b.grade || a.classNumber - b.classNumber
      );
    }

    return {
      canSeeMenu,
      isHomeroom,
      homeroomClass,
      rescueRole,
      isAdmin,
      visibleClasses,
      canAccessDashboard: canSeeMenu,
      canManageTagDefinitions: rescueRole === RESCUE_ROLE.STAFF_ADMIN || isAdmin,
    };
  }, [canSeeMenu, isHomeroom, homeroomClassesFromTags, metaHomeroomClass, gradeHeadGrades, rescueRole, isAdmin, isRescueStaff, allClasses]);
}
