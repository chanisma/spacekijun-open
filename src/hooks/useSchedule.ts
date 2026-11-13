import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useResourceOperations, useCurrentResourceId } from '@/services/hooks/useUnifiedAuth';
import { ResourceId, toResourceId } from '@/services/unifiedAuth';
import { NotificationService } from '@/services/notificationService';
import { documentSubmissionService } from '@/services/documentSubmissionService';
import { UploadedFile, fileUploadService } from '@/services/fileUploadService';
import NeisApiService, { NeisScheduleEvent } from '@/services/neisApiService';
import { useScheduleEvents, useScheduleMutations } from './useScheduleEvents';
import { useTaskDueDatesForSchedule } from './useTasksJsonb';
import type { ScheduleViewMode } from '@/lib/scheduleUtils';
import { noClassMetaPatch, type NoClassSetting } from '@/lib/schoolDay';

export interface ScheduleEvent {
  id: string;
  kind: 'class' | 'homeroom' | 'assignment' | 'schedule' | 'duty' | 'training' | 'event' | 'document_submission' | 'personal' | 'task';
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  created_by: ResourceId; // Always resource.id
  source?: string;
  holiday?: boolean;
  section_name?: string;
  room_name?: string;
  assignee?: string;
  exchangeable?: boolean;
  date_only?: boolean;
  // Document submission specific fields
  submission_deadline?: string;
  required_files?: UploadedFile[];
  related_links?: string[];
  target?: string; // 제출 받을 대상
  files?: any[]; // 일반 첨부파일
  description?: string; // 일정 설명
  participant_count?: number;
  // Task specific fields
  meta?: any;
}

export interface MealInfo {
  id: string;
  date: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner';
  menu: any;
  calories?: number;
}

export interface UseScheduleOptions {
  /**
   * 일정 목록을 조회할지 여부 (기본 true).
   *
   * 이 훅은 호출만 해도 meeting 한 달치 + 업무 마감 한 달치 두 쿼리를 실행한다.
   * createEvent·importNeisSchedule 같은 mutation만 필요한 화면은 `loadEvents: false`를
   * 넘겨 조회를 끈다 — mutation은 전역 invalidate(`['schedule-events']`)로 동작하므로
   * 실제로 일정을 그리는 화면의 갱신에는 영향이 없다.
   */
  loadEvents?: boolean;
}

export const useSchedule = (options?: UseScheduleOptions) => {
  const loadEvents = options?.loadEvents ?? true;
  const { toast } = useToast();
  const {
    resourceId,
    createWithCurrentResource,
    deleteOwnedByResource,
    canModify,
    isReady
  } = useResourceOperations();

  // State 변수들을 먼저 선언 - selectedDate 초기화 최적화
  const [meals, setMeals] = useState<MealInfo[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    // 시간 부분을 제거하여 날짜만 유지 (안정화)
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  });
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('month');

  // 최적화된 TanStack Query 훅 사용 - useMemo로 날짜 범위 캐싱
  const { start: dateRangeStart, end: dateRangeEnd } = useMemo(() => {
    const now = selectedDate;
    let start: Date, end: Date;

    // 계획표(plan)는 그 달 전체를 표로 펼치므로 월 뷰와 같은 범위를 쓴다.
    // (아래 else가 '하루'로 떨어지므로 여기서 명시적으로 묶어야 한다)
    if (viewMode === 'month' || viewMode === 'plan') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      // 앞뒤로 일주일씩 여유를 둠
      start.setDate(start.getDate() - 7);
      end.setDate(end.getDate() + 7);
    } else if (viewMode === 'week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1);
      start = new Date(startOfWeek);
      end = new Date(startOfWeek);
      end.setDate(startOfWeek.getDate() + 6);
    } else { // day
      start = new Date(now);
      end = new Date(now);
    }

    return { start, end };
  }, [selectedDate, viewMode]);

  const { data: scheduleEvents = [], isLoading: scheduleLoading, refetch: refetchEvents } = useScheduleEvents(dateRangeStart, dateRangeEnd, { enabled: loadEvents });
  const { data: taskEvents = [], isLoading: taskLoading, refetch: refetchTaskEvents } = useTaskDueDatesForSchedule(dateRangeStart, dateRangeEnd, { enabled: loadEvents });
  const { createEvent: createEventMutation, updateEvent: updateEventMutation, deleteEvent: deleteEventMutation } = useScheduleMutations();
  const queryClient = useQueryClient();

  /**
   * 일정 변경 후 목록 갱신.
   *
   * `loadEvents: false`인 화면은 자기 쿼리가 비활성이라 refetch가 동작하지 않으므로,
   * 공유 캐시를 무효화해서 **실제로 일정을 그리고 있는 화면**이 갱신되게 한다.
   * (useSchedule.createEvent는 useScheduleMutations를 거치지 않고 직접 insert하므로
   *  여기서 무효화하지 않으면 다른 화면이 새 일정을 놓친다)
   */
  const refreshEvents = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['schedule-events'] });
  }, [queryClient]);

  // Combine schedule events and task events
  const events = useMemo(() => {
    const combined = [...scheduleEvents, ...taskEvents];
    // Sort by start time
    return combined.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [scheduleEvents, taskEvents]);

  // Combined loading state
  const loading = scheduleLoading || taskLoading;

  // TanStack Query가 로딩 상태를 관리하므로 불필요한 상태 제거
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // 브라우저 메모리에 저장된 NEIS 데이터 (달력 범위 바깥으로 나갔을 때 사용)
  const [cachedNeisEvents, setCachedNeisEvents] = useState<ScheduleEvent[]>([]);
  const [neisDateRange, setNeisDateRange] = useState<{start: Date, end: Date} | null>(null);

  // assignee 문자열을 JSONB 형태로 변환하는 함수
  const convertAssigneeToJsonb = useCallback(async (assigneeString: string | any, eventType?: string) => {
    try {
      // assigneeString이 문자열이 아닌 경우 처리
      if (typeof assigneeString !== 'string') {
        console.warn('assigneeString is not a string:', assigneeString);
        if (assigneeString && typeof assigneeString === 'object') {
          // 이미 JSONB 형태인 경우 그대로 반환
          return assigneeString;
        }
        // 다른 타입인 경우 문자열로 변환 시도
        assigneeString = String(assigneeString || '');
      }

      const assigneeItems = assigneeString.split(',').map(item => item.trim()).filter(Boolean);
      const assigneeObject: { [key: string]: { name: string; signature: number } } = {};

      // 각 항목에 대해 처리 (이름 또는 ID일 수 있음)
      for (const item of assigneeItems) {
        try {
          // UUID 형태인지 확인 (resource ID)
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item);

          if (isUUID) {
            // ID로 검색 (resource 테이블에서)
            const { data: resource } = await supabase
              .from('resource')
              .select('id, name')
              .eq('id', item)
              .eq('type', 'teacher')
              .maybeSingle();

            if (resource) {
              // resource에서 찾은 경우, 해당 이름으로 profile 찾기
              const { data: profileData } = await supabase
                .from('profiles')
                .select('id, name')
                .eq('name', resource.name)
                .maybeSingle();

              // 일관성을 위해 항상 이름을 키로 사용
              // training인 경우에만 signature 포함
              if (eventType === 'training') {
                assigneeObject[resource.name] = { name: resource.name, signature: 0 };
              } else {
                (assigneeObject as any)[resource.name] = { name: resource.name };
              }
            } else {
              // resource도 찾을 수 없는 경우
              if (eventType === 'training') {
                assigneeObject[item] = { name: item, signature: 0 };
              } else {
                (assigneeObject as any)[item] = { name: item };
              }
            }
          } else {
            // 이름으로 검색 (profiles 테이블에서)
            const { data: profileData } = await supabase
              .from('profiles')
              .select('id, name')
              .eq('name', item)
              .maybeSingle();

            if (profileData) {
              // profile이 있는 경우, 해당 이름으로 resource 찾기
              const { data: resourceData } = await supabase
                .from('resource')
                .select('id, name')
                .eq('name', profileData.name)
                .eq('type', 'teacher')
                .maybeSingle();

              if (resourceData) {
                // resource가 있는 경우 이름을 키로 사용
                if (eventType === 'training') {
                  assigneeObject[resourceData.name] = { name: resourceData.name, signature: 0 };
                } else {
                  (assigneeObject as any)[resourceData.name] = { name: resourceData.name };
                }
              } else {
                // resource가 없는 경우 이름을 키로 사용
                if (eventType === 'training') {
                  assigneeObject[item] = { name: item, signature: 0 };
                } else {
                  (assigneeObject as any)[item] = { name: item };
                }
              }
            } else {
              // profile이 없는 경우 이름을 키로 사용
              if (eventType === 'training') {
                assigneeObject[item] = { name: item, signature: 0 };
              } else {
                (assigneeObject as any)[item] = { name: item };
              }
            }
          }
        } catch (error) {
          console.error(`Failed to find user for item: ${item}`, error);
          // 오류 발생 시 원본 항목을 키와 name으로 사용
          if (eventType === 'training') {
            assigneeObject[item] = { name: item, signature: 0 };
          } else {
            (assigneeObject as any)[item] = { name: item };
          }
        }
      }

      return assigneeObject;
    } catch (error) {
      console.error('Failed to convert assignee to JSONB:', error);
      // 변환 실패 시 원본 문자열 반환
      return assigneeString;
    }
  }, []);

  const addTeachersToMeeting = async (meetingId: string, source?: string, customAssignees?: string) => {
    try {
      // Teacher allocation is now handled through meta.assignee JSONB field
      // This function is kept for backward compatibility but does minimal work

      if (process.env.NODE_ENV === 'development') {
        console.log('🎯 Teacher allocation debug (legacy function):', {
          meetingId,
          source,
          customAssignees,
          note: 'Teacher allocation is now handled through meta.assignee JSONB field'
        });
      }

      // No actual allocation needed - it's handled in the meta.assignee field
      return;
    } catch (error) {
      console.error('교사 할당 오류:', error);
      // Don't re-throw as this is now a legacy function
    }
  };

  // 달력 뷰모드에 따른 적절한 날짜 범위 계산
  const getCalendarDateRange = useCallback((centerDate: Date, mode: ScheduleViewMode) => {
    const center = new Date(centerDate);

    switch (mode) {
      case 'day':
        // 하루 뷰: 해당 일만
        const dayStart = new Date(center.getFullYear(), center.getMonth(), center.getDate());
        const dayEnd = new Date(center.getFullYear(), center.getMonth(), center.getDate() + 1);
        return { start: dayStart, end: dayEnd };

      case 'week':
        // 주 뷰: 해당 주 (일요일 시작)
        const dayOfWeek = center.getDay();
        const weekStart = new Date(center.getFullYear(), center.getMonth(), center.getDate() - dayOfWeek);
        const weekEnd = new Date(center.getFullYear(), center.getMonth(), center.getDate() - dayOfWeek + 7);
        return { start: weekStart, end: weekEnd };

      case 'month':
      default:
        // 월 뷰: 해당 월 + 달력에 표시되는 이전/다음 월 일부
        const monthStart = new Date(center.getFullYear(), center.getMonth(), 1);
        const monthEnd = new Date(center.getFullYear(), center.getMonth() + 1, 1);

        // 달력 첫 주의 일요일부터
        const firstDayOfWeek = monthStart.getDay();
        const calendarStart = new Date(monthStart.getTime() - firstDayOfWeek * 24 * 60 * 60 * 1000);

        // 달력 마지막 주의 토요일까지
        const lastDayOfWeek = monthEnd.getDay();
        const daysToAdd = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek;
        const calendarEnd = new Date(monthEnd.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

        return { start: calendarStart, end: calendarEnd };
    }
  }, []);

  // 달력 범위 바깥으로 나갔을 때 해당 월의 NEIS 데이터를 브라우저 메모리에 저장
  const fetchNeisForOutOfRange = useCallback(async (year: number, month: number): Promise<ScheduleEvent[]> => {
    try {
      console.log(`📅 ${year}년 ${month}월 NEIS 데이터 브라우저 메모리에 fetch 시작...`);

      // API에서 해당 월 데이터 가져오기
      const monthEvents = await NeisApiService.getSchoolScheduleForMonth(year, month);

      if (monthEvents.length === 0) {
        console.log(`📭 ${year}년 ${month}월 NEIS 학사일정이 없습니다.`);
        return [];
      }

      // ScheduleEvent 형식으로 변환 (리소스 ID 없이)
      const scheduleEvents: ScheduleEvent[] = (monthEvents.map((neisEvent, index) => {
        const dateStr = neisEvent.AA_YMD;
        const formattedDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;

        return {
          id: `neis-memory-${neisEvent.AA_YMD}-${index}`,
          kind: 'schedule' as const,
          title: neisEvent.EVENT_NM,
          starts_at: `${formattedDate}T00:00:00`,
          ends_at: `${formattedDate}T23:59:59`,
          status: 'scheduled',
          created_by: '',
          scope: undefined,
          holiday: false,
          section_name: undefined,
          room_name: undefined,
          assignee: undefined,
          exchangeable: false,
        };
      }) as any);

      console.log(`✅ ${year}년 ${month}월 NEIS 데이터 ${scheduleEvents.length}개 브라우저 메모리에 저장`);
      return scheduleEvents;

    } catch (error) {
      console.error(`❌ ${year}년 ${month}월 NEIS 브라우저 메모리 fetch 실패:`, error);
      return [];
    }
  }, []);

  // fetchEvents 함수는 useScheduleEvents 훅으로 대체되었습니다.

  const fetchMeals = async (startDate?: Date, endDate?: Date) => {
    try {
      const start = startDate || new Date();
      const end = endDate || new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Note: meals table doesn't exist yet in the database schema
      // This is a placeholder for future implementation
      const mealsData: MealInfo[] = [
        {
          id: '1',
          date: new Date().toISOString().split('T')[0],
          meal_type: 'lunch',
          menu: ['김치찌개', '쌀밥', '계란말이', '배추김치'],
          calories: 650
        }
      ];
      setMeals(mealsData);
    } catch (error) {
      console.error('급식 조회 오류:', error);
    }
  };

  const createEvent = useCallback(async (eventData: {
    title: string;
    kind: 'schedule' | 'event' | 'duty' | 'training' | 'document_submission' | 'personal';
    starts_at: string;
    ends_at: string;
    source?: string;
    description?: string;
    assignee?: string;
    exchangeable?: boolean;
    date_only?: boolean;
    /** 일정 설문 결과로 만든 일정이면 그 설문 id (meta.survey_id 로 기록) */
    survey_id?: string;
    /** 자습 감독 일정의 표지(meta.supervision) — 이력·교체 RPC 가 이걸로 찾는다 (2026-10-11) */
    supervision?: { grade: number; slot: 'morning' | 'evening' | 'saturday'; with_morning?: boolean };
    /** 학사일정 «수업 없는 날 · 학년» — NEIS 와 같은 meta 값으로 저장한다 (2026-10-11) */
    no_class?: NoClassSetting;
    // Document submission specific fields
    required_files?: UploadedFile[];
    related_links?: string[];
    target?: string;
  }) => {
    if (!isReady) {
      toast({
        title: '오류',
        description: '사용자 리소스 정보를 확인할 수 없습니다.',
        variant: 'destructive',
      });
      return false;
    }

    // 서류제출 일정 신규 생성 중단 (2026-08-12) — UI(생성·편집 다이얼로그)에서도 막지만,
    // AI 어시스턴트 등 다른 경로가 이 훅을 공유하므로 관문에서 한 번 더 차단한다.
    // 기존 서류제출 일정의 열람·수정·삭제는 그대로 동작한다.
    if (eventData.kind === 'document_submission') {
      toast({
        title: '생성 불가',
        description: '서류제출 일정은 더 이상 새로 만들 수 없습니다.',
        variant: 'destructive',
      });
      return false;
    }

    try {
      // Debug logging for all meeting creation
      console.log('Creating meeting:', {
        kind: eventData.kind,
        title: eventData.title,
        resourceId,
        isReady,
        starts_at: eventData.starts_at,
        ends_at: eventData.ends_at
      });

      // Convert assignee to JSONB format for events with assignees (exclude schedule which has no assignees)
      let assigneeData = eventData.assignee;
      // document_submission 은 위 관문에서 이미 return 되므로 여기 도달하지 않는다
      // (남겨 두면 타입 좁히기와 어긋나 컴파일 오류가 된다 — 2026-09-17 정리)
      if ((eventData.kind === 'event' || eventData.kind === 'training' || eventData.kind === 'duty' || eventData.kind === 'personal') && eventData.assignee) {
        assigneeData = await convertAssigneeToJsonb(eventData.assignee, eventData.kind);
      }

      // Create meeting using unified resource system
      const meeting = await createWithCurrentResource('meeting', {
        kind: eventData.kind,
        starts_at: eventData.starts_at,
        ends_at: eventData.ends_at,
        status: 'scheduled',
        meta: {
          title: eventData.title,
          source: eventData.source,
          description: eventData.description,
          assignee: assigneeData,
          exchangeable: eventData.exchangeable || false,
          date_only: eventData.date_only,
          // 일정 설문에서 만들어진 일정의 출처 (설문 결과 화면이 "이 날짜는 이미 일정이 있다"를 안다)
          ...(eventData.survey_id ? { survey_id: eventData.survey_id } : {}),
          ...(eventData.supervision ? { supervision: eventData.supervision } : {}),
          ...(eventData.kind === 'schedule' && eventData.no_class?.enabled
            ? noClassMetaPatch(eventData.no_class, { source: eventData.source })
            : {}),
          // 서류제출(document_submission) 전용 meta 는 여기서 붙지 않는다 —
          // 위 관문이 그 종류를 먼저 return 시키므로 도달 불가 코드였다 (2026-09-17 정리).
          // 기존 서류제출 일정의 열람·수정은 updateEvent 쪽 경로가 그대로 담당한다.
        }
      });

      if (!meeting) {
        throw new Error('Failed to create meeting');
      }

      // Note: No longer saving participants to meta

      // Add teachers to meeting allocation based on scope (AFTER owner is allocated)
      // This prevents duplicate allocation of current user
      try {
        await addTeachersToMeeting(meeting.id, eventData.source, eventData.assignee);
      } catch (teacherAllocationError) {
        console.error('교사 할당 중 오류:', teacherAllocationError);
        // Don't fail the entire operation if teacher allocation fails
        // The meeting and owner allocation are already successful
      }

      // For document submission meetings, we'll handle submission records in the UI
      // rather than using database triggers to avoid deployment issues


      // Database trigger will automatically create notifications
      // No need to send notifications from frontend

      // Refresh events
      await refreshEvents();
      return meeting.id;
    } catch (error) {
      console.error('일정 생성 오류:', error);
      
      // More specific error messages for debugging
      let errorMessage = '일정 생성 중 오류가 발생했습니다.';
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        if (error.message.includes('document_submission')) {
          errorMessage = '서류 제출 일정 생성 중 오류가 발생했습니다. 관리자에게 문의하세요.';
        }
      }
      
      toast({
        title: '오류',
        description: errorMessage,
        variant: 'destructive',
      });
      return false;
    }
  }, [isReady, resourceId, createWithCurrentResource, toast, refreshEvents]);

  const canDeleteEvent = useCallback(async (eventId: string): Promise<boolean> => {
    if (!isReady) return false;
    return await canModify('meeting', eventId);
  }, [isReady, canModify]);

  /**
   * Clean up documents and storage files associated with a document submission meeting
   */
  const cleanupDocumentSubmissionFiles = useCallback(async (meetingId: string): Promise<void> => {
    try {
      // Get meeting data to check if it's a document submission and get required files
      const { data: meeting, error: fetchError } = await supabase
        .from('meeting')
        .select('kind, meta')
        .eq('id', meetingId)
        .single();

      if (fetchError) {
        console.error('Error fetching meeting for cleanup:', fetchError);
        return;
      }

      // Only process document submission meetings
      if (!meeting || meeting.kind !== 'document_submission') {
        return;
      }

      const meta = meeting.meta as {
        title?: string;
        description?: string;
        required_files?: UploadedFile[];
        related_links?: string[];
      };

      const requiredFiles = meta?.required_files || [];

      if (requiredFiles.length === 0) {
        return;
      }

      // Get current user for security validation
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.error('Cannot cleanup files: user not authenticated');
        return;
      }

      // Delete each file from storage and documents table
      const deletePromises = requiredFiles.map(async (file) => {
        try {
          // Security check: verify file belongs to current user before deleting
          const { data: documentCheck, error: checkError } = await supabase
            .from('documents')
            .select('user_id, storage_path')
            .eq('id', file.id)
            .single();

          if (checkError || !documentCheck) {
            console.warn(`Document ${file.id} not found or inaccessible:`, checkError);
            return;
          }

          if (documentCheck.user_id !== user.id) {
            console.warn(`Security: Attempted to delete document ${file.id} not owned by current user`);
            return;
          }

          // Delete from storage first
          console.log(`🗑️ Attempting to delete storage file: ${documentCheck.storage_path}`);
          console.log(`👤 Current user ID: ${user.id}`);
          
          // Parse storage path to verify format
          const pathParts = documentCheck.storage_path.split('/');
          console.log(`📂 Path parts:`, pathParts);
          if (pathParts.length >= 2) {
            const folderUserId = pathParts[0];
            const fileName = pathParts.slice(1).join('/');
            console.log(`📁 Folder user ID: ${folderUserId}`);
            console.log(`📄 File name: ${fileName}`);
            console.log(`🔐 User ID match: ${folderUserId === user.id ? '✅' : '❌'}`);
          }
          
          const { error: storageError } = await supabase.storage
            .from('documents')
            .remove([documentCheck.storage_path]);

          if (storageError) {
            console.error(`❌ Failed to delete storage file ${documentCheck.storage_path}:`, storageError);
            console.error('Storage error details:', JSON.stringify(storageError, null, 2));
            
            // Check for specific policy-related errors
            if (storageError.message?.includes('policy') || storageError.message?.includes('permission')) {
              console.error('🚨 STORAGE POLICY ISSUE DETECTED');
              console.error('💡 This appears to be a missing DELETE policy for documents bucket');
              console.error('📋 Solution: Apply migration 20250826120000_fix_documents_bucket_policies.sql');
              console.error('🔧 Or manually add DELETE policy for documents bucket in Supabase dashboard');
            }
            
            // Continue with document deletion even if storage fails
          } else {
            console.log(`✅ Successfully deleted storage file: ${documentCheck.storage_path}`);
          }

          // Delete from documents table (RLS policies will enforce user ownership)
          const { error: documentError } = await supabase
            .from('documents')
            .delete()
            .eq('id', file.id);

          if (documentError) {
            console.warn(`Failed to delete document record ${file.id}:`, documentError);
          } else {
            console.log(`Successfully deleted document ${file.id} (${file.file_name})`);
          }
        } catch (error) {
          console.error(`Error cleaning up file ${file.id}:`, error);
        }
      });

      // Wait for all deletions to complete
      await Promise.all(deletePromises);

      console.log(`Cleaned up ${requiredFiles.length} files for meeting ${meetingId}`);

    } catch (error) {
      console.error('Error during document cleanup:', error);
      // Don't throw here - we don't want to prevent meeting deletion if file cleanup fails
    }
  }, []);

  const deleteEvent = useCallback(async (eventId: string): Promise<boolean> => {
    if (!isReady) {
      toast({
        title: '오류',
        description: '사용자 리소스 정보를 확인할 수 없습니다.',
        variant: 'destructive',
      });
      return false;
    }

    try {
      // Check if user can modify this event
      const canModifyEvent = await canModify('meeting', eventId);
      if (!canModifyEvent) {
        toast({
          title: '권한 없음',
          description: '본인이 생성한 일정만 삭제할 수 있습니다.',
          variant: 'destructive',
        });
        return false;
      }

      // Clean up document submission files before deleting the meeting
      console.log(`Starting cleanup for meeting ${eventId}`);
      await cleanupDocumentSubmissionFiles(eventId);

      // Delete meeting (assignees stored in meta.assignee JSONB field)
      console.log(`Deleting meeting ${eventId}`);
      await deleteOwnedByResource('meeting', eventId);

      console.log(`Successfully deleted meeting ${eventId}`);

      await refreshEvents();
      return true;

    } catch (error) {
      console.error('일정 삭제 오류:', error);
      toast({
        title: '오류',
        description: '일정 삭제에 실패했습니다.',
        variant: 'destructive',
      });
      return false;
    }
  }, [isReady, canModify, cleanupDocumentSubmissionFiles, deleteOwnedByResource, toast, refreshEvents]);

  const updateEvent = useCallback(async (eventId: string, eventData: {
    title?: string;
    kind?: 'schedule' | 'event' | 'duty' | 'training' | 'document_submission';
    starts_at?: string;
    ends_at?: string;
    source?: string;
    description?: string;
    assignee?: string;
    exchangeable?: boolean;
    date_only?: boolean;
    event_date?: string; // For updating meta.event_date when date changes
    meta?: any; // Allow full meta object update
    // Document submission specific fields
    required_files?: UploadedFile[];
    related_links?: string[];
    target?: string;
  }): Promise<boolean> => {
    if (!isReady) {
      toast({
        title: '오류',
        description: '사용자 리소스 정보를 확인할 수 없습니다.',
        variant: 'destructive',
      });
      return false;
    }

    try {
      // Check if user can modify this event
      const canModifyEvent = await canModify('meeting', eventId);
      if (!canModifyEvent) {
        toast({
          title: '권한 없음',
          description: '본인이 생성한 일정만 수정할 수 있습니다.',
          variant: 'destructive',
        });
        return false;
      }

      // Get current meeting data
      const { data: currentMeeting, error: fetchError } = await supabase
        .from('meeting')
        .select('*')
        .eq('id', eventId)
        .single();

      if (fetchError || !currentMeeting) {
        throw new Error('Failed to fetch current meeting data');
      }

      const currentMeta = currentMeeting.meta as any || {};

      // Prepare update data
      const updateData: any = {};
      let metaUpdates: any;

      // If eventData.meta is provided, use it as base (allows full meta update including files)
      if (eventData.meta !== undefined) {
        metaUpdates = { ...currentMeta, ...eventData.meta };

        // 삭제된 파일을 storage와 documents 테이블에서도 제거
        if (eventData.meta.files !== undefined) {
          const currentFiles = currentMeta.files || [];
          const updatedFiles = eventData.meta.files || [];

          // 삭제된 파일 찾기 (현재 파일 목록에는 있지만 업데이트된 목록에는 없는 파일)
          const deletedFiles = currentFiles.filter((currentFile: any) =>
            !updatedFiles.some((updatedFile: any) => updatedFile.id === currentFile.id)
          );

          // 삭제된 각 파일을 storage와 documents 테이블에서 제거
          for (const deletedFile of deletedFiles) {
            try {
              const fileName = `${deletedFile.id}_${deletedFile.name}`;
              const filePath = `meeting/${eventId}/${fileName}`;

              // Storage에서 파일 삭제
              const { error: storageError } = await supabase.storage
                .from('kijunspace')
                .remove([filePath]);

              if (storageError) {
                console.error('Storage 파일 삭제 실패:', storageError);
              }

              // documents 테이블에서 레코드 삭제
              const { error: dbError } = await supabase
                .from('documents')
                .delete()
                .eq('id', deletedFile.id);

              if (dbError) {
                console.error('Documents 테이블 레코드 삭제 실패:', dbError);
              }
            } catch (error) {
              console.error('파일 삭제 중 오류:', error);
            }
          }
        }
      } else {
        metaUpdates = { ...currentMeta };
      }

      // Update basic fields
      if (eventData.kind !== undefined) updateData.kind = eventData.kind;
      if (eventData.starts_at !== undefined) updateData.starts_at = eventData.starts_at;
      if (eventData.ends_at !== undefined) updateData.ends_at = eventData.ends_at;

      // Update individual meta fields (only if meta object wasn't provided)
      if (eventData.meta === undefined) {
        if (eventData.title !== undefined) metaUpdates.title = eventData.title;
        if (eventData.description !== undefined) metaUpdates.description = eventData.description;
        if (eventData.assignee !== undefined) {
          // Convert assignee to JSONB format for training, duty, and document_submission events
          const eventKind = eventData.kind || currentMeeting.kind;
          if ((eventKind === 'training' || eventKind === 'duty' || eventKind === 'document_submission') && eventData.assignee) {
            metaUpdates.assignee = await convertAssigneeToJsonb(eventData.assignee);
          } else {
            metaUpdates.assignee = eventData.assignee;
          }
        }
        if (eventData.date_only !== undefined) metaUpdates.date_only = eventData.date_only;
        if (eventData.event_date !== undefined) metaUpdates.event_date = eventData.event_date;

        // Handle document submission specific fields
        if (eventData.kind === 'document_submission' || currentMeeting.kind === 'document_submission') {
          if (eventData.required_files !== undefined) metaUpdates.required_files = eventData.required_files;
          if (eventData.related_links !== undefined) metaUpdates.related_links = eventData.related_links;
          if (eventData.target !== undefined) metaUpdates.target = eventData.target;
          if (eventData.description !== undefined) metaUpdates.description = eventData.description;
          if (eventData.ends_at !== undefined) metaUpdates.submission_deadline = eventData.ends_at;
        }
      }

      updateData.meta = metaUpdates;

      // Update meeting
      const { error: updateError } = await supabase
        .from('meeting')
        .update(updateData)
        .eq('id', eventId);

      if (updateError) {
        throw updateError;
      }

      // Teacher allocations are now managed through meta.assignee JSONB field
      // No need for separate meeting_allocation table operations


      await refreshEvents();
      return true;

    } catch (error) {
      console.error('일정 수정 오류:', error);
      toast({
        title: '오류',
        description: '일정 수정에 실패했습니다.',
        variant: 'destructive',
      });
      return false;
    }
  }, [isReady, canModify, resourceId, toast, refreshEvents, addTeachersToMeeting]);

  // useScheduleEvents 훅이 자동으로 데이터를 로드하므로 별도 useEffect 불필요
  // 초기 로드만 관리
  useEffect(() => {
    if (isReady && isInitialLoad) {
      fetchMeals().then(() => {
        setIsInitialLoad(false);
      });
    }
  }, [isReady, isInitialLoad]);

  const getEventsForDate = (date: Date) => {
    // 서울 시간대 기준으로 날짜 비교
    const dateStr = date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
    return events.filter(event => 
      event.starts_at.startsWith(dateStr)
    );
  };

  const getMealsForDate = (date: Date) => {
    // 서울 시간대 기준으로 날짜 비교
    const dateStr = date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
    return meals.filter(meal => meal.date === dateStr);
  };

  // Document submission functions
  const submitDocument = useCallback(async (meetingId: string, meetingTitle: string, file: File, notes?: string): Promise<any | null> => {
    if (!resourceId) {
      toast({
        title: '오류',
        description: '로그인이 필요합니다.',
        variant: 'destructive',
      });
      return null;
    }
    
    try {
      const result = await (documentSubmissionService as any).createSubmission(meetingId, meetingTitle, file, notes);
      
      if (result) {
        // Refresh events to update submission statistics
        await refreshEvents();
        toast({
          title: "문서가 제출되었습니다",
          description: `${file.name} 파일이 성공적으로 제출되었습니다.`
        });
      } else {
        toast({
          title: "제출 실패",
          description: "문서 제출 중 오류가 발생했습니다.",
          variant: "destructive"
        });
      }
      
      return result;
    } catch (error) {
      console.error('Error submitting document:', error);
      toast({
        title: "제출 실패",
        description: "문서 제출 중 오류가 발생했습니다.",
        variant: "destructive"
      });
      return null;
    }
  }, [resourceId, toast, refreshEvents]);

  const getSubmissionsForMeeting = useCallback(async (meetingId: string): Promise<any[]> => {
    try {
      return await (documentSubmissionService as any).getSubmissionsForMeeting(meetingId);
    } catch (error) {
      console.error('Error fetching submissions:', error);
      return [];
    }
  }, []);

  const getUserSubmissions = useCallback(async (meetingId: string): Promise<any[]> => {
    if (!resourceId) return [];
    
    try {
      return await (documentSubmissionService as any).getUserSubmissionsForMeeting(meetingId, resourceId);
    } catch (error) {
      console.error('Error fetching user submissions:', error);
      return [];
    }
  }, [resourceId]);

  const deleteSubmission = useCallback(async (documentId: string): Promise<boolean> => {
    try {
      const success = await (documentSubmissionService as any).deleteSubmission(documentId);
      
      if (success) {
        // Refresh events to update submission statistics
        await refreshEvents();
      } else {
        toast({
          title: "삭제 실패",
          description: "제출물 삭제 중 오류가 발생했습니다.",
          variant: "destructive"
        });
      }
      
      return success;
    } catch (error) {
      console.error('Error deleting submission:', error);
      toast({
        title: "삭제 실패",
        description: "제출물 삭제 중 오류가 발생했습니다.",
        variant: "destructive"
      });
      return false;
    }
  }, [toast, refreshEvents]);

  const canSubmitDocument = useCallback(async (meetingId: string): Promise<boolean> => {
    if (!resourceId) return false;
    
    try {
      return await (documentSubmissionService as any).canUserSubmit(meetingId, resourceId);
    } catch (error) {
      console.error('Error checking submission permissions:', error);
      return false;
    }
  }, [resourceId]);

  const downloadSubmission = useCallback(async (storagePath: string): Promise<string | null> => {
    try {
      return await (documentSubmissionService as any).downloadSubmission(storagePath);
    } catch (error) {
      console.error('Error downloading submission:', error);
      toast({
        title: "다운로드 실패",
        description: "파일 다운로드 중 오류가 발생했습니다.",
        variant: "destructive"
      });
      return null;
    }
  }, [toast]);

  const importNeisSchedule = useCallback(async (): Promise<number> => {
    if (!isReady || !resourceId) {
      toast({
        title: '오류',
        description: '사용자 리소스 정보를 확인할 수 없습니다.',
        variant: 'destructive',
      });
      return 0;
    }

    try {
      // 현재 학년도 NEIS 학사일정 불러오기 (모든 기존 NEIS 데이터 삭제 후 새로 저장)
      const importedCount = await NeisApiService.importCurrentSchoolYearSchedule(resourceId);

      if (importedCount > 0) {
        toast({
          title: '성공',
          description: `${importedCount}개의 학사일정을 불러왔습니다.`,
        });

        // 기존 브라우저 캐시 초기화 (DB에 새로운 데이터가 들어왔으므로)
        setCachedNeisEvents([]);
        setNeisDateRange(null);

        // 일정 목록 새로고침 (TanStack Query가 자동으로 관리)
      } else {
        toast({
          title: '알림',
          description: '불러올 새로운 학사일정이 없습니다.',
        });
      }

      return importedCount;
    } catch (error) {
      console.error('NEIS 학사일정 불러오기 오류:', error);

      let errorMessage = 'NEIS 학사일정을 불러오는데 실패했습니다.';
      if (error instanceof Error) {
        if (error.message.includes('NEIS API')) {
          errorMessage = `NEIS API 오류: ${error.message}`;
        }
      }

      toast({
        title: '오류',
        description: errorMessage,
        variant: 'destructive',
      });
      return 0;
    }
  }, [isReady, resourceId, toast]);

  return {
    events,
    meals,
    loading,
    selectedDate,
    setSelectedDate,
    viewMode,
    setViewMode,
    resourceId,
    isReady,
    fetchMeals,
    createEvent,
    deleteEvent,
    updateEvent,
    canDeleteEvent,
    getEventsForDate,
    getMealsForDate,
    refetch: () => {
      setIsInitialLoad(false);
      return Promise.all([refetchEvents(), refetchTaskEvents(), fetchMeals()]);
    },
    importNeisSchedule
  };
};
