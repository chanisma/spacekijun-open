// ========================================
// Timetable Data Hook (Optimized)
// 시간표 데이터를 가져오는 최적화된 hook
// ========================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
import { ResourceId } from '@/services/unifiedAuth';
import type { ClassSwap } from '@/types/classSwap';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { useTimetableTerm } from '@/hooks/useTimetableTerm';
import { weekdayTimeCode, classNumberFromLabel } from '@/lib/timetableSource';
import { effectiveSlotLabel } from '@/lib/timetableOverride';
import { fetchEffectiveTeacherTimetable } from '@/services/timetableOverrideService';

/**
 * meeting.meta 중 시간표 표시에 쓰는 필드만. (구 구현은 존재하지 않는
 * `MeetingMeta` 를 types.ts 에서 import 해 컴파일 에러를 내고 있었다.)
 */
interface TimetableMeetingMeta {
  participants?: unknown[];
  title?: string;
  section_name?: string;
  room_name?: string;
  grade?: string;
  section_id?: string;
}

const isMeetingMeta = (meta: unknown): meta is TimetableMeetingMeta => {
  return (
    !!meta &&
    typeof meta === 'object' &&
    Array.isArray((meta as TimetableMeetingMeta).participants)
  );
};

/**
 * `section.meta.grade` / `meta.class` 는 라이브에서 JSON **숫자**다(문자열이 아니다).
 * 아래 두 함수가 표기를 한 곳에서 통일한다 — grade 는 숫자, class_number 는 문자열.
 * 이 정합이 깨지면 `findSwappableClasses` 의 `!==` 비교가 항상 참이 되어
 * 수업 교체 후보가 조용히 0건이 된다(2026-08-14 실제 장애 원인).
 */
const toGradeNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return undefined;
};

/** `section.meta` 는 `Json` 타입이라 속성 접근이 막힌다 — 한 곳에서만 좁힌다. */
const readSectionMeta = (meta: unknown, key: 'grade' | 'class'): unknown => {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined;
  return (meta as Record<string, unknown>)[key];
};

const toClassText = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return undefined;
};

export interface TimetableEntry {
  id: string;
  period: number;
  weekday: number;
  subject?: string;
  section_name?: string;
  room_name?: string;
  teacher_name?: string;
  grade?: number;
  class_number?: string;
  week_span?: number[];
  type: 'pattern' | 'meeting';
  starts_at?: string;
  ends_at?: string;
  meeting_kind?: string;
  status?: string;
  is_combined?: boolean;
  resource_id: ResourceId;
  section_id?: string;
  weekday_time?: string;
  /**
   * `teacher_timetable.activity_type` — 'subject' | 'club' | 'career' | 'autonomy'.
   * 수업 교체를 막는 것은 `club`(동아리) 하나뿐이다(`isSwappableLesson`).
   * 과목명 문자열이 아니라 이 값이 정본이다.
   */
  activity_type?: string;
  /** 운영 시간표(기간 한정 임시 시간표) 칸이면 그 이름 — 정규 수업이면 없음 */
  override_title?: string;
  // Class swap fields
  is_swapped?: boolean;
  swap_id?: string;
  swapped_with?: string;
  swap_date?: string;
}

// 교사 리소스 조회 훅
export function useTimetableResources(enabled: boolean = false) {
  return useQuery({
    queryKey: ['timetable-resources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resource')
        .select('id, name, type, meta')
        .eq('type', 'teacher')
        .order('name');

      if (error) {
        console.error('교사 리소스 조회 오류:', error);
        throw error;
      }

      return data || [];
    },
    enabled: enabled,             // 조건부 활성화
    staleTime: 5 * 60 * 1000,     // 5분간 fresh - 교사 리소스는 자주 변경되지 않음
    gcTime: 15 * 60 * 1000,       // 15분간 캐시 보관
    refetchOnMount: false,        // 마운트 시 자동 refetch 방지
    refetchOnWindowFocus: false,  // 윈도우 포커스 시 refetch 방지
    refetchOnReconnect: true,     // 네트워크 재연결 시만 refetch
  });
}

// 시간표 데이터 조회 훅
export function useTimetableData(
  selectedResource?: ResourceId,
  currentDate?: Date,
  /** 조회 여부 (기본 true) — 결강 판정처럼 조건부로만 필요한 화면이 끈다 */
  enabledOverride: boolean = true
) {
  const { resourceId: currentResourceId, isLoading: isCurrentResourceLoading } = useCurrentResourceId();
  // 시간표는 학기 단위로 운영된다 — 학사력(미설정 시 최신 학기)이 어느 학기를 볼지 결정한다.
  const { term, isLoading: isTermLoading } = useTimetableTerm();

  // QueryKey 정규화: 주 단위로 캐시 (같은 주는 항상 같은 키)
  const baseDate = currentDate || new Date();
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 }); // 월요일 시작
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 }); // 일요일 끝
  const weekKey = format(weekStart, 'yyyy-MM-dd'); // 예: "2025-10-13"
  // queryFn 안(교체 반영 단계)에서 weekStart·baseDate 를 다시 선언하므로 수업 조회 범위는 여기서 잡아 둔다
  const lessonWeek = { from: weekStart, to: weekEnd };

  return useQuery({
    queryKey: [
      'timetable-data',
      selectedResource || currentResourceId,
      weekKey,
      term?.year ?? null,
      term?.semester ?? null,
    ],
    queryFn: async (): Promise<TimetableEntry[]> => {
      const targetResourceId = selectedResource || currentResourceId;

      if (!targetResourceId || !term) return [];

      const entries: TimetableEntry[] = [];

      try {
        // Get teacher resource data
        const { data: teacherResource, error: teacherError } = await supabase
          .from('resource')
          .select('id, name, type')
          .eq('id', targetResourceId)
          .single();

        if (teacherError) {
          console.error('교사 리소스 조회 오류:', teacherError);
          throw teacherError;
        }

        // 1. 수업 시간표 — 그 주에 실제로 들어가는 수업(해당 학기)
        //
        //    정규 시간표(teacher_timetable)에 운영 시간표(시험·수능 대비 등 기간 한정 임시 시간표)를
        //    날짜마다 덮은 결과다. 판정 단일 출처 = SQL teacher_timetable_effective(). 한 주 안에서
        //    요일은 한 번씩만 나오므로 요일 모양(pattern) 그대로 쓴다. 섹션명은 teacherSectionName()
        //    규칙과 같다(effectiveSlotLabel — 운영 칸은 과목명이 비어 있을 수 있다).
        const slots = await fetchEffectiveTeacherTimetable({
          year: term.year,
          semester: term.semester,
          from: lessonWeek.from,
          to: lessonWeek.to,
          teacherResourceId: targetResourceId,
        });

        if (slots && slots.length > 0) {
          // grade/class_number/section_id/is_combined 는 구 구현과 동일하게 section 테이블에서
          // 얻는다. class_label 에 "3학년 4반 한문" 같은 비표준 값이 있어 직접 파싱하면
          // 그 행에서 동작이 달라진다(section.meta->>'class' 가 정답 3 을 갖고 있다).
          const sectionNames = [...new Set(slots.map(effectiveSlotLabel))];

          const { data: sections, error: sectionsError } = await supabase
            .from('section')
            .select('id, name, subject, is_combined, meta')
            .in('name', sectionNames);

          // Create a lookup map for section metadata (optional)
          const sectionMetadata: Record<string, (typeof sections)[number]> = {};
          if (!sectionsError && sections) {
            sections.forEach(section => {
              sectionMetadata[section.name] = section;
            });
          } else {
            console.warn('섹션 메타데이터 조회 오류 (계속 진행):', sectionsError);
          }

          slots.forEach((slot) => {
            try {
              const sectionName = effectiveSlotLabel(slot);
              const weekday = slot.day_of_week;
              const period = slot.period;

              if (weekday >= 1 && weekday <= 7 && period >= 1 && period <= 8) {
                const timeStr = weekdayTimeCode(weekday, period);
                const sectionMeta = sectionMetadata[sectionName];

                entries.push({
                  id: sectionMeta?.id ? `${sectionMeta.id}-${timeStr}` : `${sectionName.replace(/\s+/g, '-')}-${timeStr}`,
                  period,
                  weekday,
                  subject: sectionName,
                  section_name: sectionName,
                  room_name: undefined,
                  teacher_name: teacherResource.name,
                  // section.meta 가 정본이지만 값이 JSON 숫자(3)라 그대로 쓰면
                  // 문자열을 기대하는 비교(교체 후보 매칭)와 어긋난다 → 표기를 문자열로 통일.
                  // section 행이 없는 학기(새 학기 업로드 직후)에는 슬롯에서 폴백해
                  // 학년·반을 잃지 않는다.
                  grade: toGradeNumber(readSectionMeta(sectionMeta?.meta, 'grade')) ?? slot.grade,
                  class_number:
                    toClassText(readSectionMeta(sectionMeta?.meta, 'class')) ??
                    classNumberFromLabel(slot.class_label),
                  week_span: null,
                  type: 'pattern' as const,
                  is_combined: sectionMeta?.is_combined || false,
                  resource_id: targetResourceId as ResourceId,
                  section_id: sectionMeta?.id,
                  weekday_time: timeStr,
                  activity_type: slot.activity_type ?? undefined,
                  override_title: slot.override_title ?? undefined,
                });
              }
            } catch (slotError) {
              console.error('시간표 슬롯 처리 오류:', slotError, slot);
            }
          });
        }

        // 2. 미팅 및 일정 (meeting 테이블에서)
        const { data: meetings, error: meetingError } = await supabase
          .from('meeting')
          .select(`
            id,
            kind,
            starts_at,
            ends_at,
            status,
            created_by,
            creator,
            meta
          `)
          .or(`created_by.eq.${targetResourceId},creator.eq.${targetResourceId}`)
          .neq('kind', 'event')
          .neq('kind', 'schedule')
          .gte('starts_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .lte('starts_at', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());

        if (meetingError) {
          console.error('미팅 조회 오류:', meetingError);
        } else {
          meetings?.forEach((meeting: any) => {
            try {
              if (!(meeting as any).starts_at) return;

              const startDate = new Date((meeting as any).starts_at);
              if (isNaN(startDate.getTime())) return; // Skip invalid dates

              const weekday = startDate.getDay() === 0 ? 7 : startDate.getDay(); // Sunday = 7
              const hour = startDate.getHours();
              const period = hour - 8 + 1; // 8시 = 1교시, 9시 = 2교시...

              if (period >= 1 && period <= 8) {
                const meta = isMeetingMeta((meeting as any).meta) ? (meeting as any).meta : {};
                entries.push({
                  id: (meeting as any).id,
                  period,
                  weekday,
                  subject: meta?.title || (meeting as any).kind,
                  section_name: meta?.section_name || meta?.title,
                  room_name: meta?.room_name,
                  teacher_name: teacherResource.name,
                  grade: parseInt(meta?.grade as string) || undefined,
                  week_span: null,
                  type: 'meeting',
                  starts_at: (meeting as any).starts_at,
                  ends_at: (meeting as any).ends_at,
                  meeting_kind: (meeting as any).kind,
                  status: (meeting as any).status,
                  is_combined: false,
                  resource_id: targetResourceId,
                  section_id: meta?.section_id
                });
              }
            } catch (meetingProcessError) {
              console.error('미팅 데이터 처리 오류:', meetingProcessError, meeting);
            }
          });
        }

        // 3. 교체/대체된 수업 (class_swap 테이블에서)
        // 선택된 주의 시작/끝 날짜 계산
        const baseDate = currentDate || new Date();
        const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 }); // 월요일 시작
        const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
        const weekStartStr = format(weekStart, 'yyyy-MM-dd');
        const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

        // 승인된 교체/대체 조회 (이 교사가 요청자 또는 승인자인 경우)
        // requester_swap_date 또는 approver_swap_date가 현재 주에 포함되는 교체 조회
        const { data: allSwaps, error: swapError} = await (supabase as any)
          .from('class_swap')
          .select('*')
          .eq('status', 'approved')
          .or(`requester_resource_id.eq.${targetResourceId},approver_resource_id.eq.${targetResourceId}`);

        // JavaScript에서 날짜 필터링 (현재 주에 포함되는 교체만)
        const classSwaps = (allSwaps as any)?.filter((swap: any) => {
          const requesterDate = new Date(swap.requester_swap_date);
          const approverDate = new Date(swap.approver_swap_date);
          return (
            (requesterDate >= weekStart && requesterDate <= weekEnd) ||
            (approverDate >= weekStart && approverDate <= weekEnd)
          );
        }) || [];

        if (swapError) {
          console.error('교체 수업 조회 오류:', swapError);
        } else if (classSwaps && classSwaps.length > 0) {
          // 교체/대체된 수업 처리
          classSwaps.forEach((swap: any) => {
            try {
              // 이 교사가 요청자인지 승인자인지 확인
              const isRequester = swap.requester_resource_id === targetResourceId;
              const isSubstitute = swap.meta?.type === 'substitute';

              if (isSubstitute) {
                // === 대체(Substitute) 처리 ===
                // 대체: 요청자 수업을 승인자가 대신 가르침 (같은 날짜)
                // 요청자: 원래 수업이 사라짐 (대체 교사가 가르침)
                // 승인자: 대체 날짜에 요청자의 과목을 가르침

                const substituteDate = new Date(swap.requester_swap_date); // 대체는 같은 날짜
                const isSubstituteDateThisWeek = substituteDate >= weekStart && substituteDate <= weekEnd;

                if (isSubstituteDateThisWeek) {
                  if (!isRequester) {
                    // 승인자(대체 교사): 요청자의 과목을 가르침
                    const substituteWeekday = substituteDate.getDay() === 0 ? 7 : substituteDate.getDay();

                    entries.push({
                      id: `swap-${swap.id}-substitute`,
                      period: swap.requester_original_period,
                      weekday: substituteWeekday,
                      subject: swap.meta.requester_section_name || '대체수업', // 요청자의 과목명
                      section_name: swap.meta.requester_section_name || '대체수업',
                      room_name: undefined,
                      teacher_name: teacherResource.name,
                      grade: toGradeNumber((swap as any).meta.grade),
                      class_number: toClassText((swap as any).meta.class),
                      week_span: null,
                      type: 'pattern' as const,
                      is_combined: false,
                      resource_id: targetResourceId as ResourceId,
                      section_id: swap.requester_section_id, // 요청자의 section
                      weekday_time: `${substituteWeekday}${swap.requester_original_period}`,
                      is_swapped: true,
                      swap_id: swap.id,
                      swapped_with: swap.meta.requester_name,
                      swap_date: swap.requester_swap_date
                    });
                  }
                  // 요청자는 이 시간에 수업이 없음 (아래 swappedTimes에서 제거됨)
                }
              } else {
                // === 교체(Swap) 처리 ===
                // approver_swap_date가 이번 주에 포함되고, 내가 요청자인 경우에만 추가
                // 요청자는 approver_swap_date에 자기 수업을 가르침
                const approverDate = new Date(swap.approver_swap_date);
                const isApproverDateThisWeek = approverDate >= weekStart && approverDate <= weekEnd;

                if (isRequester && isApproverDateThisWeek) {
                  // 요청자: approver_swap_date에 상대의 원래 교시에 내 과목을 가르침
                  // 예: A교사(월1 수학)가 10/13(일)에 1교시(B교사의 원래 교시)에 자기 수학 수업
                  const swapWeekday = approverDate.getDay() === 0 ? 7 : approverDate.getDay();

                  entries.push({
                    id: `swap-${swap.id}-requester`,
                    period: swap.approver_original_period, // 상대 교시
                    weekday: swapWeekday, // 교체 날짜의 실제 요일
                    subject: swap.meta.requester_section_name || '교체수업', // 내 과목
                    section_name: swap.meta.requester_section_name || '교체수업',
                    room_name: undefined,
                    teacher_name: teacherResource.name,
                    grade: toGradeNumber((swap as any).meta.grade),
                    class_number: toClassText((swap as any).meta.class),
                    week_span: null,
                    type: 'pattern' as const,
                    is_combined: false,
                    resource_id: targetResourceId as ResourceId,
                    section_id: swap.requester_section_id,
                    weekday_time: `${swapWeekday}${swap.approver_original_period}`,
                    is_swapped: true,
                    swap_id: swap.id,
                    swapped_with: swap.meta.approver_name,
                    swap_date: swap.approver_swap_date
                  });
                }

                // requester_swap_date가 이번 주에 포함되고, 내가 승인자인 경우에만 추가
                // 승인자는 requester_swap_date에 자기 수업을 가르침
                const requesterDate = new Date(swap.requester_swap_date);
                const isRequesterDateThisWeek = requesterDate >= weekStart && requesterDate <= weekEnd;

                if (!isRequester && isRequesterDateThisWeek) {
                  // 승인자: requester_swap_date에 상대의 원래 교시에 내 과목을 가르침
                  // 예: B교사(일7 국어)가 10/6(월)에 2교시(A교사의 원래 교시)에 자기 국어 수업
                  const swapWeekday = requesterDate.getDay() === 0 ? 7 : requesterDate.getDay();

                  entries.push({
                    id: `swap-${swap.id}-approver`,
                    period: swap.requester_original_period, // 상대 교시
                    weekday: swapWeekday, // 교체 날짜의 실제 요일
                    subject: swap.meta.approver_section_name || '교체수업', // 내 과목
                    section_name: swap.meta.approver_section_name || '교체수업',
                    room_name: undefined,
                    teacher_name: teacherResource.name,
                    grade: toGradeNumber((swap as any).meta.grade),
                    class_number: toClassText((swap as any).meta.class),
                    week_span: null,
                    type: 'pattern' as const,
                    is_combined: false,
                    resource_id: targetResourceId as ResourceId,
                    section_id: swap.approver_section_id,
                    weekday_time: `${swapWeekday}${swap.requester_original_period}`,
                    is_swapped: true,
                    swap_id: swap.id,
                    swapped_with: swap.meta.requester_name,
                    swap_date: swap.requester_swap_date
                  });
                }
              }
            } catch (swapProcessError) {
              console.error('교체 수업 처리 오류:', swapProcessError, swap);
            }
          });
        }

        // 교체/대체된 수업과 패턴 수업 충돌 처리
        // 교체/대체로 인해 제거해야 할 원래 시간대 목록
        const swappedTimes = new Set<string>();

        classSwaps.forEach((swap: any) => {
          const isRequester = swap.requester_resource_id === targetResourceId;
          const isSubstitute = swap.meta?.type === 'substitute';

          if (isSubstitute) {
            // === 대체(Substitute) 패턴 제거 ===
            const substituteDate = new Date(swap.requester_swap_date);
            const isSubstituteDateThisWeek = substituteDate >= weekStart && substituteDate <= weekEnd;

            if (isRequester && isSubstituteDateThisWeek) {
              // 요청자: 대체 날짜에 원래 수업이 없어짐 (대체 교사가 가르침)
              const substituteWeekday = substituteDate.getDay() === 0 ? 7 : substituteDate.getDay();
              // 대체 날짜의 요일이 원래 요일과 같으면 패턴 제거
              if (substituteWeekday === swap.requester_original_weekday) {
                const timeKey = `${swap.requester_original_weekday}${swap.requester_original_period}`;
                swappedTimes.add(timeKey);
              }
            }
            // 승인자(대체 교사)는 패턴 제거 불필요 (원래 수업 없었음)
          } else {
            // === 교체(Swap) 패턴 제거 ===
            // requester_swap_date가 이번 주인 경우에만 패턴 제거 확인
            const requesterDate = new Date(swap.requester_swap_date);
            const isRequesterDateThisWeek = requesterDate >= weekStart && requesterDate <= weekEnd;

            if (isRequester && isRequesterDateThisWeek) {
              // 요청자: requester_swap_date에 원래 시간의 수업이 없어짐 (다른 날로 이동)
              const swapWeekday = requesterDate.getDay() === 0 ? 7 : requesterDate.getDay();
              // 교체 날짜의 요일이 원래 요일과 같으면 패턴 제거
              if (swapWeekday === swap.requester_original_weekday) {
                const timeKey = `${swap.requester_original_weekday}${swap.requester_original_period}`;
                swappedTimes.add(timeKey);
              }
            }

            // approver_swap_date가 이번 주인 경우에만 패턴 제거 확인
            const approverDate = new Date(swap.approver_swap_date);
            const isApproverDateThisWeek = approverDate >= weekStart && approverDate <= weekEnd;

            if (!isRequester && isApproverDateThisWeek) {
              // 승인자: approver_swap_date에 원래 시간의 수업이 없어짐 (다른 날로 이동)
              const swapWeekday = approverDate.getDay() === 0 ? 7 : approverDate.getDay();
              // 교체 날짜의 요일이 원래 요일과 같으면 패턴 제거
              if (swapWeekday === swap.approver_original_weekday) {
                const timeKey = `${swap.approver_original_weekday}${swap.approver_original_period}`;
                swappedTimes.add(timeKey);
              }
            }
          }
        });

        const finalEntries = entries.filter(entry => {
          // 교체 수업은 항상 포함
          if (entry.is_swapped) return true;

          // 패턴 수업: 교체로 인해 제거된 시간이 아니면 포함
          return !swappedTimes.has(entry.weekday_time || '');
        });

        return finalEntries;

      } catch (error) {
        console.error('시간표 조회 오류:', error);
        throw error;
      }
    },
    // 학기가 해석되기 전에는 조회하지 않는다(빈 결과 캐싱 방지).
    enabled:
      enabledOverride &&
      !!(selectedResource || currentResourceId) &&
      !isCurrentResourceLoading &&
      !isTermLoading &&
      !!term,
    staleTime: 10 * 60 * 1000,    // 10분간 fresh - 시간표는 상대적으로 안정적
    gcTime: 30 * 60 * 1000,       // 30분간 캐시 보관
    refetchOnMount: false,        // 마운트 시 자동 refetch 방지
    refetchOnWindowFocus: false,  // 윈도우 포커스 시 refetch 방지
    refetchOnReconnect: true,     // 네트워크 재연결 시만 refetch
  });
}

// 시간표 관련 mutation 훅
export function useTimetableMutations() {
  const queryClient = useQueryClient();

  const invalidateTimetableQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['timetable-data'] });
    queryClient.invalidateQueries({ queryKey: ['timetable-resources'] });
  };

  return {
    invalidateTimetableQueries,
  };
}

// 상수 내보내기
export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
export const PERIODS = Array.from({ length: 8 }, (_, i) => i + 1);