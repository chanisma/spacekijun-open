import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, MapPin, Users, Calendar, FileText, Link, Edit, File, Download, PenTool, Check, Printer, Puzzle, QrCode, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getEventTypeColor, getEventFullLabel } from '@/lib/scheduleUtils';
import { getAssigneeDisplayText } from '@/lib/assigneeUtils';
import type { ScheduleEvent } from '@/hooks/useSchedule';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/hooks/useProfile';
import { useCurrentResourceId, useResourceOperations } from '@/services/hooks/useUnifiedAuth';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ScheduleEditDialog } from './ScheduleEditDialog';
import { TrainingSignDialog } from './TrainingSignDialog';
import { TrainingSignatureQrDialog } from './TrainingSignatureQrDialog';
import { TrainingSignLinksPanel, useTrainingSignLinks } from './TrainingSignLinksPanel';
import { SignatureStrokesView } from '@/components/signature/SignatureStrokesView';
import { useTrainingSignatures } from '@/hooks/useTrainingSignatures';
import { trainingAssigneeNames } from '@/lib/trainingSignature';
import { MeetingFileService } from '@/services/meetingFileService';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { TaskFile } from '@/types/tasks';
import { EnhancedFileList } from '@/components/ui/file-list';
import { usePluginInstances, useUpdatePluginInstance } from '@/hooks/usePlugins';
import { PluginRenderer } from '@/components/plugins/PluginRenderer';
import { AbsenceDetailSection } from './absence/AbsenceDetailSection';
import { fetchActiveSwapsForAbsence } from '@/services/absenceLessonService';
import { useCancelClassSwap } from '@/hooks/useClassSwapMutations';
import { NotificationService } from '@/services/notificationService';
import { LinkedObjectsSection } from '@/features/work-ontology/components/LinkedObjectsSection';

interface ScheduleDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: ScheduleEvent | null;
  onDelete?: (eventId: string) => Promise<boolean>;
  onUpdate?: (eventId: string, eventData: any) => Promise<boolean>;
}

export const ScheduleDetailDialog: React.FC<ScheduleDetailDialogProps> = ({
  open,
  onOpenChange,
  event,
  onDelete,
  onUpdate
}) => {
  const { user, isStudentView, isAdmin } = useAuth();
  const { profile } = useProfile();
  const isStudent = isStudentView;

  // 관리자에게만 작성자 표시 — created_by 는 resource.id(합성 일정은 빈 문자열)
  const creatorId = event?.created_by || null;
  const { data: creatorName } = useQuery({
    queryKey: ['schedule-creator-name', creatorId],
    enabled: open && isAdmin && !!creatorId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resource')
        .select('name')
        .eq('id', creatorId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.name as string | undefined) ?? null;
    },
  });
  const { toast } = useToast();
  const { resourceId } = useCurrentResourceId();
  // 권한 판정만 필요하므로 useSchedule()을 쓰지 않는다
  // (그 훅은 호출만으로 meeting·업무 마감 한 달치를 조회한다 — 이 다이얼로그는 목록을 그리지 않음)
  const { canModify, isReady: canModifyReady } = useResourceOperations();
  const canDeleteEvent = async (eventId: string): Promise<boolean> => {
    if (!canModifyReady) return false;
    return await canModify('meeting', eventId);
  };
  const [canDelete, setCanDelete] = React.useState(false);
  const [canEdit, setCanEdit] = React.useState(false);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [meetingFiles, setMeetingFiles] = React.useState<TaskFile[]>([]);
  const [templateFiles, setTemplateFiles] = React.useState<TaskFile[]>([]);
  const [meetingInfo, setMeetingInfo] = React.useState<any>(null);

  // 연수 서명 관련 상태
  const [isSignatureDialogOpen, setIsSignatureDialogOpen] = React.useState(false);
  const [isQrDialogOpen, setIsQrDialogOpen] = React.useState(false);

  const isTraining = event?.kind === 'training';

  // 참석자 명단·서명 여부는 상태로 들고 다니지 않고 원본에서 파생시킨다.
  // (구 구현은 meeting을 두 번 더 조회해 boolean 두 개를 채웠는데, 조회 시점이 어긋나면
  //  "서명완료"인데 서명이 없는 상태가 만들어졌다.)
  const assigneeNames = React.useMemo(() => {
    const fromMeta = trainingAssigneeNames(
      (meetingInfo?.meta as Record<string, unknown> | undefined)?.assignee,
    );
    if (fromMeta.length > 0) return fromMeta;
    // meeting을 아직 못 읽었으면 목록 쿼리가 준 요약 문자열로 대신한다.
    return trainingAssigneeNames(event?.assignee);
  }, [meetingInfo?.meta, event?.assignee]);

  const { data: trainingSignatures = [] } = useTrainingSignatures(
    event?.id,
    isTraining && open,
  );

  // 서명 링크가 있는 연수(2026-10-25 이후 생성)면 로그인 없는 서명만 쓴다 — 없으면(enabled=false·오류) 기존 방식
  const { data: signLinks } = useTrainingSignLinks(event?.id, isTraining && open);

  const isUserAssignee = !!profile?.name && assigneeNames.includes(profile.name);
  const mySignature = React.useMemo(
    () => trainingSignatures.find((s) => s.signer_name === profile?.name) ?? null,
    [trainingSignatures, profile?.name],
  );
  const hasUserSigned = !!mySignature;

  const cancelSwap = useCancelClassSwap();

  /**
   * 출장·개인일정을 지우면 그 일정으로 보낸 교체·대체 요청이 주인 없이 남는다.
   * - 대기 중 요청은 함께 취소한다(상대가 아직 아무것도 하지 않았다)
   * - 승인된 요청은 **건드리지 않는다** — 상대가 이미 수업을 맡기로 했으므로 조용히 되돌리면
   *   상대만 모른 채 시간표가 바뀐다. 개수를 알리고 교체 관리에서 직접 정리하게 한다.
   */
  const handleDelete = async () => {
    if (!event || !onDelete) return;
    const linked =
      (event.kind === 'event' || event.kind === 'personal') && resourceId
        ? await fetchActiveSwapsForAbsence(event.id, resourceId).catch(() => [])
        : [];
    const pending = linked.filter((s) => s.status === 'pending');
    const approved = linked.filter((s) => s.status === 'approved');

    const lines = ['이 일정을 삭제하시겠습니까?'];
    if (pending.length > 0) lines.push(`\n이 일정으로 보낸 대기 중 교체·대체 요청 ${pending.length}건도 함께 취소됩니다.`);
    if (approved.length > 0)
      lines.push(`\n이미 승인된 교체·대체 ${approved.length}건은 그대로 남습니다. 필요하면 시간표의 교체 관리에서 취소하세요.`);
    if (!window.confirm(lines.join(''))) return;

    const success = await onDelete(event.id);
    if (!success) return;

    for (const swap of pending) {
      try {
        await cancelSwap.mutateAsync(swap.id);
        await NotificationService.notifyClassSwapCancelled(
          swap.id,
          swap.approver_resource_id,
          swap.meta.requester_name || '',
          swap.meta.requester_section_name || '',
          swap.meta.approver_section_name || '',
          swap.approver_swap_date
        );
      } catch (e) {
        console.error('연결된 교체 요청 취소 실패:', e);
      }
    }
    onOpenChange(false);
  };

  // 플러그인 관련
  const { data: pluginInstances = [] } = usePluginInstances('meeting', event?.id || '');
  const updatePluginInstance = useUpdatePluginInstance();

  const loadMeetingFiles = React.useCallback(async () => {
    if (!event?.id) return;

    try {
      const [allFiles, attachments, meetingData] = await Promise.all([
        MeetingFileService.getMeetingFiles(event.id),
        MeetingFileService.getMeetingAttachmentFiles(event.id),
        supabase
          .from('meeting')
          .select('*')
          .eq('id', event.id)
          .single()
      ]);

      // 첨부파일 섹션에는 템플릿 파일을 제외한 일반 첨부파일만 표시
      setMeetingFiles(attachments);

      // 서류제출 이벤트의 경우 meeting.meta.required_files에서 템플릿 파일 로드
      if (event.kind === 'document_submission' && (meetingData.data?.meta as any)?.required_files) {
        const templateFiles = (meetingData.data.meta as any).required_files.map((file: any) => ({
          id: file.id,
          name: file.name || file.file_name || file.title,
          url: file.url || file.storage_path,
          size: file.size || file.file_size,
          type: file.type || file.file_type,
          uploaded_at: file.uploaded_at || file.created_at || file.updated_at,
          uploaded_by: file.uploaded_by || file.user_id,
          category: 'template'
        }));
        setTemplateFiles(templateFiles);
      } else {
        // 다른 종류의 이벤트는 기존 방식으로 템플릿 파일 로드
        const templates = await MeetingFileService.getMeetingTemplateFiles(event.id);
        setTemplateFiles(templates);
      }

      if (meetingData.data) {
        setMeetingInfo(meetingData.data);
      }
    } catch (error) {
      console.error('파일 로드 실패:', error);
      setMeetingFiles([]);
      setTemplateFiles([]);
      setMeetingInfo(null);
    }
  }, [event?.id]);

  React.useEffect(() => {
    if (event && user && open) {
      // Handle canDeleteEvent and canEdit separately to avoid dependency issues
      const checkPermissions = async () => {
        try {
          const canDelete = await canDeleteEvent(event.id);
          setCanDelete(canDelete);

          // 수정 권한 체크: canDeleteEvent와 동일한 로직 (생성자 또는 관리자)
          setCanEdit(canDelete);
        } catch (error) {
          console.error('Error checking permissions:', error);
          setCanDelete(false);
          setCanEdit(false);
        }
      };

      checkPermissions();
      loadMeetingFiles();
    } else {
      setCanDelete(false);
      setCanEdit(false);
      setMeetingFiles([]);
      setTemplateFiles([]);
      setMeetingInfo(null);
    }
  }, [event?.id, user, open, profile?.name, resourceId, loadMeetingFiles]);

  const handleDownloadFile = async (file: TaskFile) => {
    try {
      if (!file.url) {
        toast({
          title: '다운로드 실패',
          description: '파일 URL을 찾을 수 없습니다.',
          variant: 'destructive',
        });
        return;
      }

      // 파일 다운로드를 위한 링크 생성
      const link = document.createElement('a');
      link.href = file.url;
      link.download = file.name || 'download';
      link.target = '_blank';

      // 임시로 DOM에 추가하고 클릭 후 제거
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: '다운로드 시작',
        description: `${file.name} 파일 다운로드를 시작합니다.`,
      });
    } catch (error) {
      console.error('다운로드 실패:', error);
      toast({
        title: '다운로드 실패',
        description: '파일 다운로드 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  if (!event) return null;


  const startDate = new Date(event.starts_at);
  const endDate = new Date(event.ends_at);

  const handleEditClick = () => {
    setEditDialogOpen(true);
  };

  const handleEditComplete = async (eventId: string, eventData: any) => {
    if (onUpdate) {
      const success = await onUpdate(eventId, eventData);
      if (success) {
        setEditDialogOpen(false);
        onOpenChange(false);
      }
      return success;
    }
    return false;
  };

  const handlePrintSignatures = () => {
    if (!event) return;

    const meetingTime = `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`;
    const meetingDate = format(startDate, 'yyyy년 M월 d일 (E)', { locale: ko });

    const printUrl = `/training-signature-print?meetingId=${encodeURIComponent(event.id)}&meetingTitle=${encodeURIComponent(event.title)}&meetingDate=${encodeURIComponent(meetingDate)}&meetingTime=${encodeURIComponent(meetingTime)}`;
    window.open(printUrl, '_blank', 'width=800,height=600');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col [&>button.absolute]:hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-base">
              <Badge className={cn(getEventTypeColor(event.kind, 'solid'), "text-xs md:text-sm")}>
                {getEventFullLabel(event.kind)}
              </Badge>
              <span className="hidden sm:inline">일정 세부정보</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 md:space-y-4 overflow-y-auto flex-1 pr-2">
            {/* 제목 */}
            <div>
              <h3 className="text-base md:text-lg font-semibold text-gray-900">
                {event.title}
              </h3>
            </div>

            {/* 기본 정보 카드 */}
            <Card>
              <CardContent className="p-3 md:p-4 space-y-2.5 md:space-y-3">
                {/* 날짜 및 시간 */}
                <div className="flex items-start gap-2 md:gap-3">
                  <Calendar className="h-4 w-4 md:h-5 md:w-5 text-gray-500 mt-0.5" />
                  <div className="flex-1 space-y-0.5 md:space-y-1">
                    <p className="text-sm md:text-base font-medium text-gray-900">
                      {format(startDate, 'yyyy년 M월 d일 (E)', { locale: ko })}
                    </p>
                    <p className="text-xs md:text-sm text-gray-600 flex items-center gap-1">
                      <Clock className="h-3 w-3 md:h-4 md:w-4" />
                      {format(startDate, 'HH:mm')} - {format(endDate, 'HH:mm')}
                    </p>
                  </div>
                </div>

                {/* 장소 */}
                {event.room_name && (
                  <div className="flex items-center gap-2 md:gap-3">
                    <MapPin className="h-4 w-4 md:h-5 md:w-5 text-gray-500" />
                    <span className="text-sm md:text-base text-gray-700">{event.room_name}</span>
                  </div>
                )}

                {/* 담당자/참석자 */}
                {event.assignee && (
                  <div className="flex items-start gap-2 md:gap-3">
                    <Users className="h-4 w-4 md:h-5 md:w-5 text-gray-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm md:text-base text-gray-700">{getAssigneeDisplayText(event.assignee)}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 출장·개인일정 — 걸린 내 수업의 교체·대체 처리 현황 (없으면 그리지 않는다) */}
            {!isStudent && (event.kind === 'event' || event.kind === 'personal') && (
              <AbsenceDetailSection
                enabled={open}
                meeting={{
                  id: event.id,
                  kind: event.kind,
                  starts_at: event.starts_at,
                  ends_at: event.ends_at,
                  created_by: event.created_by,
                  date_only: event.date_only,
                  assignee: (meetingInfo?.meta as Record<string, unknown> | undefined)?.assignee ?? event.meta?.assignee ?? event.assignee,
                }}
              />
            )}

            {/* 근무 전용 정보 */}
            {event.kind === 'duty' && (
              <Card className="bg-orange-50 border-orange-200">
                <CardContent className="p-3 md:p-4">
                  <h4 className="font-medium text-orange-900 mb-1.5 md:mb-2 text-sm md:text-base">업무 정보</h4>
                  <div className="space-y-1.5 md:space-y-2 text-xs md:text-sm">
                    {event.exchangeable && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-orange-800">교환 가능한 업무</span>
                      </div>
                    )}
                    {(event as any).scope && (
                      <div className="text-orange-700">
                        대상: {(event as any).scope === 'teachers' ? '교사' : (event as any).scope}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 연수 전용 서명 정보 */}
            {event.kind === 'training' && (
              <Card className="bg-pink-50 border-pink-200">
                <CardHeader className="pb-2 md:pb-3 p-3 md:p-4">
                  <CardTitle className="text-xs md:text-sm flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <PenTool className="h-3 w-3 md:h-4 md:w-4 text-pink-600" />
                      <span className="text-xs md:text-sm">연수 참석 서명</span>
                      {hasUserSigned && (
                        <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                          <Check className="h-3 w-3 mr-1" />
                          서명완료
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrintSignatures}
                      className="text-pink-600 border-pink-300 hover:bg-pink-50 h-7 md:h-8 px-2 md:px-3 text-xs md:text-sm"
                    >
                      <Printer className="h-3 w-3 mr-1" />
                      <span className="hidden sm:inline">출력</span>
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 md:space-y-4 p-3 md:p-4 pt-0">
                  {/* 진행 현황은 참석자·주관자 모두에게 보인다 */}
                  <div className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2">
                    <span className="text-xs text-pink-700">서명 현황</span>
                    <span className="text-xs font-semibold text-pink-900">
                      {trainingSignatures.length} / {assigneeNames.length}명
                    </span>
                  </div>

                  {signLinks?.enabled ? (
                    /* 2026-10-25 이후 만든 연수 — 로그인 없는 서명만(기존 «서명하기»·«QR로 서명받기» 대신, 사용자 결정) */
                    <>
                      <TrainingSignLinksPanel meetingId={event.id} data={signLinks} myName={profile?.name ?? null} mySignatureStrokes={mySignature?.strokes} />
                      {!isUserAssignee && !signLinks.canManage && (
                        <p className="text-center text-xs text-pink-700 md:text-sm">참석자 명단에 없어 서명 대상이 아닙니다.</p>
                      )}
                    </>
                  ) : (
                    <>
                    {isUserAssignee ? (
                      hasUserSigned ? (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-center gap-1.5 text-green-700">
                            <Check className="h-4 w-4" />
                            <span className="text-xs font-medium md:text-sm">서명이 완료되었습니다</span>
                          </div>
                          {/* 내가 그린 서명을 그대로 보여준다 — 무엇이 인쇄될지 미리 확인 */}
                          <div className="flex h-16 items-center justify-center rounded-lg border border-pink-200 bg-white p-2 text-gray-800 md:h-20">
                            <SignatureStrokesView
                              value={mySignature?.strokes}
                              title={`${profile?.name ?? ''} 서명`}
                            />
                          </div>
                          <Button
                            onClick={() => setIsSignatureDialogOpen(true)}
                            variant="outline"
                            className="h-8 w-full border-pink-300 text-xs text-pink-700 hover:bg-pink-50 md:h-9 md:text-sm"
                          >
                            <RotateCcw className="mr-1.5 h-3 w-3 md:h-4 md:w-4" />
                            다시 서명하기
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2.5 md:space-y-3">
                          <p className="text-xs text-pink-700 md:text-sm">
                            연수 참석 확인을 위해 직접 서명해주세요.
                          </p>
                          <Button
                            onClick={() => setIsSignatureDialogOpen(true)}
                            className="h-8 w-full bg-pink-600 text-xs hover:bg-pink-700 md:h-9 md:text-sm"
                          >
                            <PenTool className="mr-1.5 h-3 w-3 md:h-4 md:w-4" />
                            서명하기
                          </Button>
                        </div>
                      )
                    ) : (
                      <p className="text-center text-xs text-pink-700 md:text-sm">
                        참석자 명단에 없어 서명 대상이 아닙니다.
                      </p>
                    )}

                    {/* 휴대폰으로 받기 — 강의실에서 QR을 띄워 각자 자기 기기로 서명 */}
                    <Button
                      onClick={() => setIsQrDialogOpen(true)}
                      variant="outline"
                      className="h-8 w-full border-pink-200 text-xs text-pink-700 hover:bg-pink-50 md:h-9 md:text-sm"
                    >
                      <QrCode className="mr-1.5 h-3 w-3 md:h-4 md:w-4" />
                      QR로 서명받기
                    </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 서류 제출 전용 정보 */}
            {event.kind === 'document_submission' && (
              <Card className="bg-cyan-50 border-cyan-200">
                <CardContent className="p-3 md:p-4">
                  <h4 className="font-medium text-cyan-900 mb-1.5 md:mb-2 flex items-center gap-1.5 md:gap-2 text-sm md:text-base">
                    <FileText className="h-3 w-3 md:h-4 md:w-4" />
                    서류 제출 정보
                  </h4>
                  <div className="space-y-1.5 md:space-y-2 text-xs md:text-sm">
                    {event.participant_count !== undefined && (
                      <div className="mb-3">
                        <div>
                          <span className="text-cyan-700">대상자 수:</span>
                          <span className="ml-2 font-medium">
                            {event.participant_count}명
                          </span>
                        </div>
                      </div>
                    )}

                    {/* 제출 받을 대상 정보 표시 */}
                    {meetingInfo?.meta?.target && (
                      <div className="mb-3">
                        <div>
                          <span className="text-cyan-700">제출 받을 대상:</span>
                          <span className="ml-2 font-medium">
                            {meetingInfo.meta.target}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* 상세 설명 표시 */}
                    {meetingInfo?.meta?.description && (
                      <div className="mb-3">
                        <div>
                          <span className="text-cyan-700">상세 설명:</span>
                          <div className="ml-2 mt-1 p-2 bg-white rounded border text-sm">
                            {meetingInfo.meta.description}
                          </div>
                        </div>
                      </div>
                    )}

                    {templateFiles && templateFiles.length > 0 ? (
                      <div>
                        <span className="text-cyan-700 font-medium text-xs md:text-sm">양식 파일:</span>
                        <div className="mt-1.5 md:mt-2 space-y-1.5 md:space-y-2">
                          {templateFiles.map((file) => (
                            <div key={file.id} className="flex items-center justify-between p-1.5 md:p-2 bg-white rounded border">
                              <div className="flex items-center gap-1.5 md:gap-2 flex-1 min-w-0">
                                <span className="text-xs md:text-sm">{MeetingFileService.getFileIcon(file.type)}</span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-cyan-800 text-xs md:text-sm font-medium truncate">{file.name}</p>
                                  <p className="text-[10px] md:text-xs text-cyan-600">
                                    {file.type} • {MeetingFileService.formatFileSize(file.size)}
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownloadFile(file)}
                                className="text-cyan-600 hover:text-cyan-700 flex-shrink-0 h-7 md:h-8 px-2"
                                title="다운로드"
                              >
                                <Download className="h-3 w-3 md:h-4 md:w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="text-cyan-700 font-medium text-xs md:text-sm">양식 파일:</span>
                        <div className="mt-1.5 md:mt-2 text-xs md:text-sm text-cyan-600">
                          등록된 양식 파일이 없습니다.
                        </div>
                      </div>
                    )}

                    {event.related_links && event.related_links.length > 0 && (
                      <div>
                        <span className="text-cyan-700 font-medium text-xs md:text-sm">관련 링크:</span>
                        <ul className="mt-1 space-y-0.5 md:space-y-1">
                          {event.related_links.map((link, index) => (
                            <li key={index}>
                              <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-600 hover:text-cyan-700 underline text-xs md:text-sm flex items-center gap-1 break-all"
                              >
                                <Link className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{link}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 공휴일 표시 */}
            {event.holiday && (
              <Card className="bg-red-50 border-red-200">
                <CardContent className="p-3 md:p-4">
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span className="text-red-800 font-medium text-xs md:text-sm">공휴일</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 첨부파일 목록 */}
            {meetingFiles.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-900 mb-1.5 md:mb-2 flex items-center gap-1.5 md:gap-2 text-sm md:text-base">
                  <File className="h-3 w-3 md:h-4 md:w-4" />
                  첨부파일
                  <Badge variant="secondary" className="text-xs">{meetingFiles.length}개</Badge>
                </h4>
                <EnhancedFileList
                  documents={meetingFiles.map(file => ({
                    id: file.id,
                    file_name: file.name,
                    file_type: file.type,
                    file_size: file.size,
                    storage_path: file.url || '',
                    upload_status: 'completed',
                    created_at: file.uploaded_at,
                    updated_at: file.uploaded_at,
                    user_id: file.uploaded_by || '',
                    title: file.name,
                    meta: {
                      category: 'attachment'
                    }
                  }))}
                  loading={false}
                  onDownload={async (doc) => {
                    const file = meetingFiles.find(f => f.id === doc.id);
                    if (file) {
                      await handleDownloadFile(file);
                    }
                  }}
                  onDelete={async () => {}}
                  onUpdate={async () => {}}
                  enableRename={false}
                  enableDelete={false}
                  enableBulkActions={false}
                  enableSearch={false}
                  enableViewModeToggle={false}
                  showBreadcrumb={false}
                  showBadges={false}
                  showFileSize={false}
                  showModifiedDate={false}
                  showDirectoryColumn={false}
                  compactMode={true}
                  maxHeight="400px"
                  defaultViewMode="list"
                  emptyStateMessage="첨부파일이 없습니다."
                />
              </div>
            )}

            {/* 이어진 업무 — 업무 온톨로지 연결(2026-11-08). 연결이 없으면 칸 자체가 없다 */}
            <LinkedObjectsSection type="meeting" id={event.id} />

            {/* 플러그인 섹션 */}
            {pluginInstances.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900 mb-1.5 md:mb-2 flex items-center gap-1.5 md:gap-2 text-sm md:text-base">
                  <Puzzle className="h-3 w-3 md:h-4 md:w-4" />
                  추가 기능
                  <Badge variant="secondary" className="text-xs">{pluginInstances.length}개</Badge>
                </h4>
                <div className="space-y-3">
                  {pluginInstances.map((instance) => {
                    return (
                      <PluginRenderer
                        key={instance.id}
                        pluginType={instance.plugin?.type || ''}
                        instance={instance}
                        entityId={event.id}
                        entityType="meeting"
                        readonly={false}
                        onUpdate={async (data) => {
                          await updatePluginInstance.mutateAsync({
                            instanceId: instance.id,
                            data
                          });
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-row flex-nowrap items-center justify-end gap-2 pt-3 md:pt-4 border-t flex-shrink-0">
            {/* 관리자 전용 — 누가 만든 일정인지 */}
            {isAdmin && creatorId && (
              <span
                className="mr-auto min-w-0 truncate text-xs text-slate-500"
                title={creatorName ? `작성자: ${creatorName}` : undefined}
              >
                작성자 <span className="font-medium text-slate-700">{creatorName ?? '…'}</span>
              </span>
            )}
            {onDelete && user && canDelete && !isStudent && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                className="h-8 md:h-9 px-3 md:px-4 text-xs md:text-sm"
              >
                삭제
              </Button>
            )}
            {onUpdate && canEdit && !isStudent && (
              <Button
                variant="outline"
                onClick={handleEditClick}
                className="h-8 md:h-9 gap-1 px-3 md:px-4 text-xs md:text-sm"
              >
                <Edit className="h-3 w-3 md:h-4 md:w-4" />
                수정
              </Button>
            )}
            <Button onClick={() => onOpenChange(false)} className="h-8 md:h-9 px-3 md:px-4 text-xs md:text-sm">
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>

      </Dialog>

      {/* Schedule Edit Dialog */}
      {onUpdate && (
        <ScheduleEditDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          event={event}
          onUpdate={handleEditComplete}
        />
      )}

      {/* 연수 서명 — 상세 모달의 형제로 렌더한다(중첩하면 포커스 트랩이 겹친다) */}
      {event?.kind === 'training' && profile?.name && (
        <TrainingSignDialog
          open={isSignatureDialogOpen}
          onOpenChange={setIsSignatureDialogOpen}
          meetingId={event.id}
          meetingTitle={event.title}
          meetingDate={startDate}
          signerName={profile.name}
          resourceId={resourceId}
          existing={mySignature}
        />
      )}

      {event?.kind === 'training' && (
        <TrainingSignatureQrDialog
          open={isQrDialogOpen}
          onOpenChange={setIsQrDialogOpen}
          meetingId={event.id}
          meetingTitle={event.title}
          totalAssignees={assigneeNames.length}
        />
      )}
    </>
  );
};