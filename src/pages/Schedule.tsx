import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/layout/Layout';
import { ScheduleHeader } from '@/components/schedule/ScheduleHeader';
import { ScheduleCalendar } from '@/components/schedule/ScheduleCalendar';
import { ScheduleCreateDialog, type ScheduleCreateInitialValues } from '@/components/schedule/ScheduleCreateDialog';
import { ScheduleDraftWidget } from '@/components/schedule/ScheduleDraftWidget';
import { ScheduleDetailDialog } from '@/components/schedule/ScheduleDetailDialog';
import MeetingTimeSearchDialog from '@/components/schedule/MeetingTimeSearchDialog';
import { MealDutyPlannerDialog } from '@/features/meal-duty/MealDutyPlannerDialog';
import { SelfStudySupervisionDialog, type SupervisionTab } from '@/features/self-study-supervision/SelfStudySupervisionDialog';
import { useManageableGrades } from '@/features/self-study-supervision/useManageableGrades';
import { useMySupervisionSwaps } from '@/features/self-study-supervision/useSupervisionSources';
import { GoogleCalendarExportDialog, type ExportOptions } from '@/components/schedule/GoogleCalendarExportDialog';
import { GoogleCalendarDirectExportDialog } from '@/components/schedule/GoogleCalendarDirectExportDialog';
import { GoogleCalendarExportService } from '@/services/googleCalendarExportService';

import { useSchedule, type ScheduleEvent } from '@/hooks/useSchedule';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { useSchoolLifeSchedule } from '@/features/school-life-schedule/useSchoolLifeSchedule';
import { SchoolLifeEventDialog } from '@/features/school-life-schedule/SchoolLifeEventDialog';
import { overlapsDay, type SchoolLifeEvent } from '@/features/school-life-schedule/types';
import { ImprovedCard } from '@/components/ui/improved-card';
import { ScheduleSurveyHost } from '@/features/schedule-survey';
import { usePendingSurveyCount } from '@/features/schedule-survey/hooks/useScheduleSurveys';
import { useCurrentResourceId } from '@/hooks/useCurrentResourceId';
import { usePageRefresh } from '@/hooks/usePageRefresh';
import { useHomeroomBirthdays } from '@/features/schedule-birthdays/useHomeroomBirthdays';
import { HomeroomBirthdayDialog } from '@/features/schedule-birthdays/HomeroomBirthdayDialog';
import { isBirthdayEvent } from '@/lib/homeroomBirthdays';

export default function Schedule() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAdmin, profile, isStudentView, effectiveRole } = useAuth();
  const isStudent = isStudentView;
  const { toast } = useToast();
  const {
    events: allEvents,
    loading,
    selectedDate,
    setSelectedDate,
    viewMode,
    setViewMode,
    createEvent,
    deleteEvent,
    updateEvent,
    getEventsForDate: getAllEventsForDate,
    refetch,
    fetchMeals,
    importNeisSchedule
  } = useSchedule();

  // 학생 계정에서는 출장(event) / 업무(duty) / 연수(training) 숨김
  const STUDENT_HIDDEN_KINDS = ['event', 'duty', 'training', 'personal'] as const;
  const schoolEvents = isStudent
    ? allEvents.filter(e => !STUDENT_HIDDEN_KINDS.includes(e.kind as any))
    : allEvents;
  const getSchoolEventsForDate = isStudent
    ? (date: Date) => getAllEventsForDate(date).filter(e => !STUDENT_HIDDEN_KINDS.includes(e.kind as any))
    : getAllEventsForDate;

  const rangeStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), -6);
  const rangeEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 7, 23, 59, 59);
  const schoolLife = useSchoolLifeSchedule(rangeStart, rangeEnd);
  // 담임 반 학생 생일 — 가상 일정(저장하지 않는다). 담임 태그가 없으면 빈 목록
  const { data: myResourceId } = useCurrentResourceId();
  const birthdays = useHomeroomBirthdays(myResourceId, rangeStart, rangeEnd);
  const virtualEvents = [...schoolLife.calendarEvents, ...birthdays.events];
  const events = [...schoolEvents, ...virtualEvents].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const getEventsForDate = (date: Date) => [...getSchoolEventsForDate(date), ...virtualEvents.filter((event) => overlapsDay(event, date))]
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const [birthdayEvent, setBirthdayEvent] = useState<ScheduleEvent | null>(null);
  // [새로고침] — 이 화면이 그리는 쿼리를 **전부** 다시 부른다(종전엔 일정·생활기록만이라 나머지는 그대로였다)
  const pageRefresh = usePageRefresh([
    ['schedule-events'],
    ['task-due-dates-schedule'],
    ['school-life-context'],
    ['school-life-events'],
    ['school-calendar'],
    ['schedule', 'homeroom-birthdays'],
    ['schedule-surveys'],
    ['self-study-supervision-swaps'],
    ['academic-term'],
  ], () => fetchMeals());
  // ⚠️ extra 에 refetch() 를 넘기지 말 것 — 일정·업무 마감 쿼리를 위 목록과 한 번 더 불러
  // 먼저 나간 요청이 취소되고 CancelledError 로 «새로고침 실패»가 뜬다(2026-11-06). 쿼리가 아닌 급식만 여기서.
  const [schoolLifeOpen, setSchoolLifeOpen] = useState(false);
  const [selectedSchoolLife, setSelectedSchoolLife] = useState<SchoolLifeEvent | null>(null);
  const openSchoolLifeCreate = () => { setSelectedSchoolLife(null); setSchoolLifeOpen(true); };

  const location = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  // 일정 AI 도우미가 넘긴 초안 — 창을 닫거나 그냥 [일정 추가]로 열면 비운다
  // (남겨 두면 다음에 빈 창을 열 때 지난 초안이 다시 채워진다)
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleCreateInitialValues | undefined>(undefined);
  // 딥링크(공지사항 링크 등)로 진입한 일정 — 이벤트 로드 후 상세 모달 자동 오픈
  const [deepLinkEventId, setDeepLinkEventId] = useState<string | null>(null);
  const [showGoogleExportDialog, setShowGoogleExportDialog] = useState(false);
  const [showGoogleDirectExportDialog, setShowGoogleDirectExportDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // 일정 설문 — 목록 모달 + 공지/알림 딥링크(`?survey=…`)
  const [showSurveyHub, setShowSurveyHub] = useState(false);
  // 회의 가능 시간 검색 — 머리글 [부가 기능] (2026-09-28 도구 모음에서 옮겨 왔다)
  const [showMeetingSearch, setShowMeetingSearch] = useState(false);
  // 급식지도 월간 명단 — 머리글 [부가 기능] (2026-10-01)
  const [showMealDuty, setShowMealDuty] = useState(false);
  // 자습 감독 배정 · 교체 — 머리글 [부가 기능] + 알림 딥링크 `?supervision=swap` (2026-10-11)
  const [supervisionTab, setSupervisionTab] = useState<SupervisionTab | null>(null);
  const supervisionDeepLink = searchParams.get('supervision');
  const surveyDeepLinkId = searchParams.get('survey');
  // `?event=<id>` — 그 일정의 상세를 연다. 다른 달이면 캘린더가 아직 그 일정을 갖고 있지
  // 않으므로 **시작일로 먼저 이동**한다(안 하면 파라미터만 남고 조용히 아무 일도 없다).
  const eventDeepLinkId = searchParams.get('event');
  const pendingSurveyCount = usePendingSurveyCount(myResourceId);
  // 학생·직원은 자습 감독을 맡지 않는다
  const supervisionAvailable = !isStudent && effectiveRole !== 'staff';
  const supervisionGrades = useManageableGrades(supervisionAvailable ? myResourceId : null);
  const supervisionSwaps = useMySupervisionSwaps(supervisionAvailable && !!user);
  const pendingSupervisionSwapCount = (supervisionSwaps.data ?? []).filter((r) => !r.i_am_requester && r.status === 'pending').length;

  useEffect(() => {
    if (!supervisionDeepLink) return;
    if (supervisionAvailable) setSupervisionTab(supervisionDeepLink === 'plan' ? 'plan' : 'swap');
    searchParams.delete('supervision');
    setSearchParams(searchParams, { replace: true });
  }, [supervisionDeepLink, supervisionAvailable, searchParams, setSearchParams]);

  useEffect(() => {
    if (!eventDeepLinkId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('meeting')
        .select('starts_at')
        .eq('id', eventDeepLinkId)
        .maybeSingle();
      const startsAt = (data as { starts_at?: string } | null)?.starts_at;
      if (cancelled || !startsAt) return;
      setSelectedDate(new Date(startsAt));
    })();
    return () => { cancelled = true; };
  }, [eventDeepLinkId, setSelectedDate]);

  // URL 쿼리 파라미터에서 create=true인 경우 다이얼로그 자동 열기
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      if (isStudent) { setSelectedSchoolLife(null); setSchoolLifeOpen(true); } else setShowCreateDialog(true);
      // URL에서 create 파라미터 제거
      searchParams.delete('create');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // 연결된 스케줄 클릭 시 해당 스케줄의 월로 이동 + 상세 모달 자동 오픈
  useEffect(() => {
    const handleScheduleNavigation = async () => {
      const { scheduleId } = (location.state as { scheduleId?: string }) || {};
      if (scheduleId) {
        try {
          const { data, error } = await supabase
            .from('meeting')
            .select('starts_at')
            .eq('id', scheduleId)
            .single();

          if (error) throw error;
          if (data) {
            setSelectedDate(new Date(data.starts_at));
            // 해당 월 이벤트 로드 후 events에서 찾아 상세 모달을 연다 (아래 deepLinkEvent)
            setDeepLinkEventId(scheduleId);
          }
        } catch (error) {
          console.error('Failed to fetch schedule:', error);
          toast({
            title: '오류',
            description: '스케줄을 찾을 수 없습니다.',
            variant: 'destructive',
          });
        }
      }
    };

    handleScheduleNavigation();
  }, [location.state, setSelectedDate, toast]);

  // 딥링크 대상 이벤트 — 월 이동 후 events가 로드되면 매칭됨.
  // (학생 뷰에선 숨김 kind가 필터된 events를 쓰므로 접근 범위도 동일하게 제한)
  const deepLinkEvent = deepLinkEventId
    ? events.find((e) => e.id === deepLinkEventId) ?? null
    : null;


  // Auth check
  if (loading && !user) {
    return (
      <Layout>
        <div className="space-y-6">
          <ImprovedCard className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Skeleton className="h-6 w-6" />
                <div>
                  <Skeleton className="h-8 w-32 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-9" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <div className="flex gap-2">
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-8 w-8" />
              </div>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-8 w-16" />
            </div>
          </ImprovedCard>
          <Skeleton className="h-96 w-full" />
        </div>
      </Layout>
    );
  }

  const handleCreateEvent = () => {
    setScheduleDraft(undefined);
    if (isStudent) openSchoolLifeCreate(); else setShowCreateDialog(true);
  };

  const handleCreateEventOnDate = (date: Date) => {
    setSelectedDate(date);
    setScheduleDraft(undefined);
    setTimeout(() => { if (isStudent) openSchoolLifeCreate(); else setShowCreateDialog(true); }, 50);
  };

  const handleMoveEvent = async (eventId: string, newDate: Date): Promise<boolean> => {
    const event = events.find(e => e.id === eventId);
    if (!event || event.meta?.school_life_event_id || isBirthdayEvent(event)) return false;

    const oldStart = new Date(event.starts_at);
    const oldEnd = new Date(event.ends_at);
    const duration = oldEnd.getTime() - oldStart.getTime();

    const newStart = new Date(newDate);
    newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
    const newEnd = new Date(newStart.getTime() + duration);

    const result = await updateEvent(eventId, {
      starts_at: newStart.toISOString(),
      ends_at: newEnd.toISOString(),
    });

    if (result) {
      toast({ title: '일정 이동 완료', description: `${event.title}이(가) 이동되었습니다.` });
    }
    return !!result;
  };

  const handleCreateEventSubmit = async (eventData: any) => {
    const result = await createEvent(eventData as any);
    if (result) {
      setShowCreateDialog(false);
      setScheduleDraft(undefined);
      return typeof result === 'string' ? result : true; // Return meeting ID if available
    }
    return false;
  };


  const handleGoogleExport = () => {
    setShowGoogleExportDialog(true);
  };

  const handleGoogleDirectExport = () => {
    setShowGoogleDirectExportDialog(true);
  };

  const handleGoogleExportSubmit = async (options: ExportOptions) => {
    try {
      setIsExporting(true);
      await GoogleCalendarExportService.exportToGoogleCalendar(options);

      toast({
        title: '성공',
        description: '.ics 파일이 다운로드되었습니다. Google Calendar에서 가져오기를 진행하세요.',
      });

      setShowGoogleExportDialog(false);
    } catch (error) {
      console.error('Google Calendar export error:', error);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : 'Google Calendar 내보내기에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <ScheduleHeader
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onRefresh={pageRefresh.refresh}
          refreshing={pageRefresh.refreshing}
          onCreateEvent={handleCreateEvent}
          createDisabled={isStudent && (!schoolLife.context.data?.can_create || schoolLife.isPreview)}
          onGoogleExport={handleGoogleExport}
          onGoogleDirectExport={handleGoogleDirectExport}
          loading={loading}
          eventCount={events.length}
          isStudent={isStudent}
          onOpenSurveys={() => setShowSurveyHub(true)}
          pendingSurveyCount={pendingSurveyCount}
          onOpenMeetingSearch={isStudent ? undefined : () => setShowMeetingSearch(true)}
          onOpenMealDuty={isStudent ? undefined : () => setShowMealDuty(true)}
          onOpenSupervision={supervisionAvailable ? () => setSupervisionTab(supervisionGrades.length > 0 ? 'plan' : 'swap') : undefined}
          pendingSupervisionSwapCount={pendingSupervisionSwapCount}
        />

        {/*
          일정 설문 — 목록·생성·응답·결과·일정 만들기를 이 하나가 모두 소유한다.
          학생도 대상자가 될 수 있으므로 !isStudent로 감싸지 않는다(설문 '생성'만 canCreate로 막는다).
        */}
        <ScheduleSurveyHost
          open={showSurveyHub}
          onOpenChange={setShowSurveyHub}
          canCreate={!isStudent}
          deepLinkSurveyId={surveyDeepLinkId}
          onDeepLinkConsumed={() => {
            searchParams.delete('survey');
            setSearchParams(searchParams, { replace: true });
          }}
          onCreateEvent={handleCreateEventSubmit}
        />

        {schoolLife.isPreview && <p className="text-sm text-muted-foreground">개인·학급 일정은 실제 로그인 계정에서 확인하고 추가할 수 있습니다.</p>}
        {!schoolLife.isPreview && (schoolLife.context.isError || schoolLife.events.isError) && (
          <p role="alert" className="text-sm text-red-600">개인·학급 일정을 불러오지 못했습니다. 새로고침을 눌러 다시 시도해 주세요.</p>
        )}
        <SchoolLifeEventDialog open={schoolLifeOpen} onOpenChange={setSchoolLifeOpen} selectedDate={selectedDate}
          isStudent={isStudent}
          context={schoolLife.context.data} event={selectedSchoolLife}
          onSave={(draft, id) => schoolLife.save.mutateAsync({ draft, id })}
          onDelete={(id) => schoolLife.remove.mutateAsync(id)} />

        <div className="relative">
          {loading && events.length === 0 ? (
            <ImprovedCard className="p-3 sm:p-6 animate-in fade-in duration-300">
              <div className="space-y-3 sm:space-y-4">
                <Skeleton className="h-6 sm:h-8 w-full" />
                <div className="grid grid-cols-7 gap-1 sm:gap-4">
                  {Array.from({ length: 35 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 sm:h-24" />
                  ))}
                </div>
              </div>
            </ImprovedCard>
          ) : (
            <div className="animate-in fade-in duration-500">
              <ScheduleCalendar
                selectedDate={selectedDate}
                onDateSelect={setSelectedDate}
                viewMode={viewMode}
                events={events}
                getEventsForDate={getEventsForDate}
                onDelete={deleteEvent}
                onUpdate={updateEvent}
                onCreateEvent={isStudent && (!schoolLife.context.data?.can_create || schoolLife.isPreview) ? undefined : handleCreateEventOnDate}
                onOpenSchoolLifeEvent={(id) => { setSelectedSchoolLife(schoolLife.events.data?.find((event) => event.id === id) ?? null); setSchoolLifeOpen(true); }}
                onOpenBirthday={setBirthdayEvent}
                onMoveEvent={isAdmin && !isStudent ? handleMoveEvent : undefined}
                deepLinkEventId={eventDeepLinkId}
                onDeepLinkConsumed={() => {
                  searchParams.delete('event');
                  setSearchParams(searchParams, { replace: true });
                }}
              />
              {loading && events.length > 0 && (
                <div className="absolute inset-0 bg-white/40 backdrop-blur-sm flex items-center justify-center rounded-lg animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 bg-white px-3 sm:px-4 py-2 sm:py-3 rounded-lg shadow-lg border border-gray-200">
                    <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs sm:text-sm text-gray-700 font-medium">업데이트 중...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 딥링크 상세 모달 — 공지사항 일정 링크 등에서 진입 시 자동 오픈 */}
        {deepLinkEvent && (
          <ScheduleDetailDialog
            event={deepLinkEvent}
            open
            onOpenChange={(open) => {
              if (!open) setDeepLinkEventId(null);
            }}
            onDelete={deleteEvent}
            onUpdate={updateEvent}
          />
        )}

        {!isStudent && (
          <>
            <ScheduleCreateDialog
              open={showCreateDialog}
              onOpenChange={(open) => {
                setShowCreateDialog(open);
                if (!open) setScheduleDraft(undefined);
              }}
              onCreateEvent={handleCreateEventSubmit}
              selectedDate={selectedDate}
              initialValues={scheduleDraft}
              canCreateHomeroom={!schoolLife.isPreview && !!schoolLife.context.data?.can_create && !!schoolLife.context.data.classes.length}
              homeroomSaving={schoolLife.save.isPending}
              homeroomForm={(
                <SchoolLifeEventDialog embedded initialVisibility="homeroom" open={showCreateDialog}
                  onOpenChange={setShowCreateDialog} selectedDate={selectedDate} context={schoolLife.context.data}
                  onSave={(draft) => schoolLife.save.mutateAsync({ draft })}
                  onDelete={(id) => schoolLife.remove.mutateAsync(id)} />
              )}
            />

            <HomeroomBirthdayDialog
              open={birthdayEvent !== null}
              onOpenChange={(open) => { if (!open) setBirthdayEvent(null); }}
              date={birthdayEvent?.meta?.birthday_date ?? null}
              students={birthdayEvent?.meta?.birthday_students ?? []}
            />

            <GoogleCalendarExportDialog
              open={showGoogleExportDialog}
              onOpenChange={setShowGoogleExportDialog}
              onExport={handleGoogleExportSubmit}
              loading={isExporting}
            />

            <GoogleCalendarDirectExportDialog
              open={showGoogleDirectExportDialog}
              onOpenChange={setShowGoogleDirectExportDialog}
              // 학생 생일(가상 일정)은 외부 캘린더로 내보내지 않는다 — 학생 개인정보
              meetings={events.filter((event) => !isBirthdayEvent(event)).map(event => ({
                id: event.id,
                kind: event.kind,
                starts_at: event.starts_at,
                ends_at: event.ends_at,
                meta: event.meta
              }))}
            />

            <MeetingTimeSearchDialog open={showMeetingSearch} onOpenChange={setShowMeetingSearch} />

            <MealDutyPlannerDialog
              open={showMealDuty}
              onOpenChange={setShowMealDuty}
              initialDate={selectedDate}
              onCreateEvent={handleCreateEventSubmit}
            />

            {supervisionAvailable && (
              <SelfStudySupervisionDialog
                open={supervisionTab !== null}
                onOpenChange={(open) => { if (!open) setSupervisionTab(null); }}
                initialDate={selectedDate}
                initialTab={supervisionTab ?? undefined}
                manageableGrades={supervisionGrades}
                myName={profile?.name ?? null}
                myResourceId={myResourceId ?? null}
                onCreateEvent={handleCreateEventSubmit}
                onChanged={() => { void refetch(); }}
              />
            )}

            {/* 일정 AI 도우미 — 공지사항 AI 도우미와 같은 떠 있는 버튼. 초안은 일정 추가 창으로 이어진다 */}
            <ScheduleDraftWidget
              onUseDraft={(seed) => {
                // 달력도 그 날짜로 옮겨 저장 뒤 새 일정이 바로 보이게 한다
                if (seed.date) setSelectedDate(seed.date);
                setScheduleDraft(seed);
                setShowCreateDialog(true);
              }}
            />
          </>
        )}

      </div>
    </Layout>
  );
}
