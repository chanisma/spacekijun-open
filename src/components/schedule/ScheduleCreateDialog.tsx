import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { scheduleComposeDialogClass, ScheduleComposeHeader, ScheduleTypeOption } from './ScheduleComposeLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { NoClassDayField } from './NoClassDayField';
import type { NoClassSetting } from '@/lib/schoolDay';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileUpload } from '@/components/ui/file-upload';
import { SearchableMultiSelect, SearchableMultiSelectItem } from '@/components/ui/searchable-multi-select';
import { MultiFileUpload } from '@/components/ui/multi-file-upload';
import { CombinedFileUpload } from '@/components/ui/combined-file-upload';
import { GoogleDriveFileInfo } from '@/components/ui/google-drive/GoogleDrivePicker';
import { GoogleDriveIntegrationService } from '@/services/googleDriveIntegrationService';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CalendarIcon, Clock, Users, MapPin, RotateCcw, PenTool, Upload, X, File, FileText, Download, Puzzle, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatAssigneeTitle, parseDutyCsv, type DutyRecord } from '@/lib/dutyCsv';
import { UploadedFile } from '@/services/fileUploadService';
import { useResources } from '@/hooks/useTasks';
import { useCurrentUserResourceId } from '@/hooks/usePermissions';
import { MeetingFileService } from '@/services/meetingFileService';
import { supabase } from '@/integrations/supabase/client';
import type { TaskFile } from '@/types/tasks';
import { usePlugins, useCreatePluginInstance } from '@/hooks/usePlugins';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { useAbsenceLessons } from '@/hooks/useAbsenceLessons';
import { useTimetableTerm } from '@/hooks/useTimetableTerm';
import { absenceWindowOf } from '@/lib/absenceLessons';
import { notifyAbsenceParticipants } from '@/services/absenceLessonService';
import { AbsenceLessonsNotice } from './absence/AbsenceLessonsNotice';
import { useOpenAbsenceResolution } from './absence/useOpenAbsenceResolution';

// 헬퍼 함수들
const getFilePublicUrl = async (storagePath: string): Promise<string> => {
  try {
    const { data } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath);
    return data.publicUrl;
  } catch (error) {
    console.error('Error getting file URL:', error);
    return storagePath; // fallback to original path
  }
};

const addFileToMeetingMeta = async (meetingId: string, file: TaskFile): Promise<void> => {
  try {
    // 현재 meeting meta 가져오기
    const { data: meeting, error: selectError } = await supabase
      .from('meeting')
      .select('meta')
      .eq('id', meetingId)
      .single();

    if (selectError) {
      throw new Error(`미팅 조회 실패: ${selectError.message}`);
    }

    const currentMeta: any = meeting?.meta || {};

    // 카테고리에 따라 저장 위치 구분
    let updatedMeta = { ...currentMeta };

    if (file.category === 'template') {
      // 양식 파일은 meeting.meta.required_files에 저장
      const currentRequiredFiles = currentMeta.required_files || [];
      updatedMeta.required_files = [...currentRequiredFiles, file];
    } else {
      // 일반 첨부파일은 meeting.meta.files에 저장
      const currentFiles = currentMeta.files || [];
      updatedMeta.files = [...currentFiles, file];
    }

    // meta 업데이트
    const { error: updateError } = await supabase
      .from('meeting')
      .update({ meta: updatedMeta })
      .eq('id', meetingId);

    if (updateError) {
      throw new Error(`파일 정보 저장 실패: ${updateError.message}`);
    }

    console.log(`File metadata saved to meeting.meta.${file.category === 'template' ? 'required_files' : 'files'}:`, file.name);
  } catch (error) {
    console.error('Error adding file to meeting meta:', error);
    throw error;
  }
};

const uploadTemplateFileToMeeting = async (meetingId: string, originalFile: UploadedFile): Promise<TaskFile> => {
  try {
    // 원본 파일을 documents bucket에서 다운로드
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(originalFile.storage_path);

    if (downloadError) {
      throw new Error(`원본 파일 다운로드 실패: ${downloadError.message}`);
    }

    // kijunspace/meeting/ 위치에 업로드
    const fileExt = originalFile.file_name.split('.').pop();
    const newFileName = `${originalFile.id}.${fileExt}`;
    const newFilePath = `meeting/${meetingId}/${newFileName}`;

    const { error: uploadError } = await supabase.storage
      .from('kijunspace')
      .upload(newFilePath, fileData, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      throw new Error(`파일 업로드 실패: ${uploadError.message}`);
    }

    // 새 위치의 공개 URL 생성
    const { data: urlData } = supabase.storage
      .from('kijunspace')
      .getPublicUrl(newFilePath);

    // TaskFile 객체 생성
    const taskFile: TaskFile = {
      id: originalFile.id,
      name: originalFile.file_name,
      url: urlData.publicUrl,
      size: originalFile.file_size,
      type: originalFile.file_type,
      uploaded_at: originalFile.created_at,
      uploaded_by: originalFile.user_id,
      category: 'template'
    };

    return taskFile;
  } catch (error) {
    console.error('Template file upload failed:', error);
    throw error;
  }
};

// 일괄 업무 생성 레코드 타입·파싱은 `@/lib/dutyCsv` 단일 출처
// (담당자 칸 다중 이름 지원 때문에 CSV 파싱이 따옴표를 다뤄야 해서 순수 모듈로 분리됨)

/**
 * 다른 기능이 이 모달을 "채워진 채로" 열 때 쓰는 초깃값 (2026-09-17).
 * 현재 사용처 = 일정 설문 결과에서 '이 날짜로 일정 만들기'.
 * 넘기지 않으면 종전 동작 그대로다.
 */
export interface ScheduleCreateInitialValues {
  title?: string;
  description?: string;
  /** 담당자 resource.id 배열 */
  assignee?: string[];
  kind?: 'schedule' | 'event' | 'duty' | 'training' | 'personal';
  /** 이 일정이 어느 일정 설문에서 나왔는지 (meeting.meta.survey_id 로 기록) */
  surveyId?: string;
  /** 날짜·시각 (일정 AI 도우미 — 2026-09-30). 넘기지 않으면 selectedDate·기본 시각 그대로 */
  date?: Date;
  startTime?: string;
  endTime?: string;
  dateOnly?: boolean;
}

interface ScheduleCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateEvent: (eventData: {
    title: string;
    kind: 'schedule' | 'event' | 'duty' | 'training' | 'document_submission' | 'personal';
    starts_at: string;
    ends_at: string;
    source?: string;
    description?: string;
    assignee?: string;
    exchangeable?: boolean;
    date_only?: boolean;
    survey_id?: string;
    /** 학사일정 «수업 없는 날 · 학년» (2026-10-11) */
    no_class?: NoClassSetting;
    // Document submission specific fields
    required_files?: UploadedFile[];
    related_links?: string[];
  }) => Promise<string | boolean>;
  selectedDate?: Date;
  homeroomForm?: React.ReactNode;
  canCreateHomeroom?: boolean;
  homeroomSaving?: boolean;
  /** 열릴 때 폼을 미리 채운다 (일정 설문 결과 → 일정 만들기) */
  initialValues?: ScheduleCreateInitialValues;
}

export const ScheduleCreateDialog: React.FC<ScheduleCreateDialogProps> = ({
  open,
  onOpenChange,
  onCreateEvent,
  selectedDate,
  homeroomForm,
  canCreateHomeroom = false,
  homeroomSaving = false,
  initialValues
}) => {
  const [homeroomSelected, setHomeroomSelected] = useState(false);
  useEffect(() => { if (!open) setHomeroomSelected(false); }, [open]);
  const [eventType, setEventType] = useState<'schedule' | 'event' | 'duty' | 'training' | 'document_submission' | 'personal'>('schedule');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<Date>(selectedDate || new Date());

  // 다이얼로그가 열릴 때 selectedDate로 날짜 동기화
  useEffect(() => {
    if (open && selectedDate) {
      setDate(selectedDate);
    }
  }, [open, selectedDate]);

  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('09:50');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState<string[]>([]); // 다중 선택을 위해 배열로 변경
  const [exchangeable, setExchangeable] = useState(false);
  const [dateOnly, setDateOnly] = useState(false);
  // 학사일정의 «수업 없는 날 · 학년» (2026-10-11)
  const [noClass, setNoClass] = useState<NoClassSetting>({ enabled: false, grades: [] });

  // 근무 일괄 생성 관련 state
  const [dutyCreationMode, setDutyCreationMode] = useState<'single' | 'batch'>('single');
  const [batchTitle, setBatchTitle] = useState('');
  const [batchDescription, setBatchDescription] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedDuties, setParsedDuties] = useState<DutyRecord[]>([]);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);

  const { data: resources } = useResources();
  const { data: currentUserResourceId } = useCurrentUserResourceId();

  // ── 결강 미리보기 (출장·개인일정) ─────────────────────────
  // 시간에 걸린 내 수업을 저장 **전에** 알리고, 저장 뒤 「결강 처리」 모달로 잇는다.
  // 판정 = src/lib/absenceLessons.ts. 저장을 막지는 않는다(사용자 결정).
  const isAbsenceType = eventType === 'event' || eventType === 'personal';
  const absenceStart = useMemo(() => {
    const d = new Date(date);
    const [h, m] = startTime.split(':').map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  }, [date, startTime]);
  const absenceEnd = useMemo(() => {
    const d = new Date(date);
    const [h, m] = endTime.split(':').map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  }, [date, endTime]);
  // 출장 대상자 선택값은 resource.id 다(태그를 고르면 구성원 id 로 펼쳐진다)
  const iAmAbsent =
    eventType === 'personal' ||
    (eventType === 'event' && !!currentUserResourceId && assignee.includes(currentUserResourceId));
  const absencePreview = useAbsenceLessons(
    isAbsenceType ? { startsAt: absenceStart, endsAt: absenceEnd, dateOnly } : null,
    open && isAbsenceType && iAmAbsent && !homeroomSelected
  );
  const absenceMySlots = useMemo(
    () =>
      absencePreview.weekEntries
        .filter((e) => e.type === 'pattern')
        .map((e) => ({ weekday: e.weekday, period: e.period })),
    [absencePreview.weekEntries]
  );
  /** 저장 뒤 결강 처리 모달을 열 것인가 — 아직 해결되지 않은 내 수업이 있을 때만 */
  const willResolveAbsence =
    isAbsenceType && iAmAbsent && absencePreview.lessons.some((l) => l.state !== 'approved');
  const otherAbsentees = eventType === 'event' ? assignee.filter((id) => id !== currentUserResourceId) : [];
  const { term: timetableTerm } = useTimetableTerm();
  const openAbsenceResolution = useOpenAbsenceResolution();

  // Resources를 SearchableMultiSelectItem 형태로 변환
  const resourceItems: SearchableMultiSelectItem[] = React.useMemo(() => {
    return resources?.map(resource => ({
      value: resource.id,
      label: resource.name,
      description: resource.type
    })) || [];
  }, [resources]);

  // CSV 담당자 이름이 실제 교사와 매칭되는지 미리 확인한다.
  // 매칭 실패해도 저장은 되지만(이름 그대로 기록) 그 사람 화면엔 일정이 안 뜨므로,
  // 오타 하나가 조용히 누락으로 이어지지 않게 미리보기에서 경고한다.
  const teacherNames = useMemo(
    () => new Set((resources ?? []).filter(r => r.type === 'teacher').map(r => r.name)),
    [resources]
  );
  const unmatchedAssignees = useMemo(() => {
    // 리소스 로딩 전에는 판정하지 않는다(빈 목록 기준으로 전원 미매칭 경고가 뜨는 것 방지)
    if (teacherNames.size === 0) return [];
    const names = new Set<string>();
    parsedDuties.forEach(duty => duty.담당자목록.forEach(name => {
      if (!teacherNames.has(name)) names.add(name);
    }));
    return [...names];
  }, [parsedDuties, teacherNames]);

  // 요약 표시용 — 행이 아니라 사람 단위로 집계(한 행에 여러 명이 올 수 있음)
  const uniqueAssigneeNames = useMemo(
    () => [...new Set(parsedDuties.flatMap(duty => duty.담당자목록))],
    [parsedDuties]
  );

  const [loading, setLoading] = useState(false);

  // Document submission specific state
  const [requiredFiles, setRequiredFiles] = useState<UploadedFile[]>([]);
  const [relatedLinks, setRelatedLinks] = useState<string[]>(['']);
  const [submitTo, setSubmitTo] = useState<string[]>([]);

  // General file attachment state
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [googleDriveFiles, setGoogleDriveFiles] = useState<GoogleDriveFileInfo[]>([]);
  const [uploading, setUploading] = useState(false);

  // 플러그인 관련 state
  const [selectedPlugins, setSelectedPlugins] = useState<string[]>([]);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false); // Add state
  const { data: availablePlugins = [] } = usePlugins();
  const createPluginInstance = useCreatePluginInstance();

  // 다른 기능이 넘긴 초깃값을 열릴 때 한 번 적용한다 (2026-09-17).
  // selectedDate 동기화 effect와 분리해 둔 이유: 그쪽은 매 열림마다 날짜만 맞추는
  // 기존 동작이고, 이쪽은 initialValues 가 있을 때만 폼을 덮어쓴다.
  useEffect(() => {
    if (!open || !initialValues) return;
    if (initialValues.kind) setEventType(initialValues.kind);
    if (initialValues.title !== undefined) setTitle(initialValues.title);
    if (initialValues.description !== undefined) setDescription(initialValues.description);
    if (initialValues.assignee) setAssignee(initialValues.assignee);
    // selectedDate 동기화 effect 보다 **뒤에** 선언돼 있어 같은 커밋에서 이쪽이 이긴다
    if (initialValues.date) setDate(initialValues.date);
    if (initialValues.startTime) setStartTime(initialValues.startTime);
    if (initialValues.endTime) setEndTime(initialValues.endTime);
    if (initialValues.dateOnly !== undefined) setDateOnly(initialValues.dateOnly);
  }, [open, initialValues]);

  const resetForm = () => {
    setTitle('');
    setNoClass({ enabled: false, grades: [] });
    setDate(selectedDate || new Date());
    setStartTime('09:00');
    setEndTime('09:50');
    setDescription('');
    setAssignee([]);
    setExchangeable(false);
    setRequiredFiles([]);
    setRelatedLinks(['']);
    setSubmitTo([]);
    setAttachedFiles([]);
    setGoogleDriveFiles([]);
    setUploading(false);
    // 근무 일괄 생성 초기화
    setDutyCreationMode('single');
    setBatchTitle('');
    setBatchDescription('');
    setCsvFile(null);
    setParsedDuties([]);
    setBatchFiles([]);
    // 플러그인 초기화
    setSelectedPlugins([]);
  };

  // CSV 파일 업로드 처리
  const handleCsvFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processCsvFile(file);
  };

  // CSV 파일 처리 함수
  const processCsvFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      alert('올바른 CSV 파일을 선택해주세요.');
      return;
    }

    setCsvFile(file);

    const resetCsvSelection = () => {
      setCsvFile(null);
      setParsedDuties([]);
      const fileInput = document.getElementById('csvFile') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    };

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;

      if (!text || text.trim() === '') {
        alert('CSV 파일이 비어있습니다.');
        resetCsvSelection();
        return;
      }

      // 파싱·검증은 `@/lib/dutyCsv` 단일 출처(담당자 칸 다중 이름 포함)
      const { records, errors } = parseDutyCsv(text);

      if (errors.length > 0) {
        alert(`CSV 파일에 오류가 있습니다:\n\n${errors.join('\n')}\n\n파일을 수정한 후 다시 업로드해 주세요.`);
        resetCsvSelection();
        return;
      }

      setParsedDuties(records);
    };
    reader.onerror = (error) => {
      console.error('FileReader error:', error);
      alert('파일 읽기 오류가 발생했습니다.');
    };
    reader.readAsText(file, 'utf-8');
  };

  // 샘플 CSV 파일 다운로드 함수
  const downloadSampleCSV = async () => {
    try {
      const response = await fetch('/dutyform.csv');
      const csvContent = await response.text();

      // UTF-8 BOM 추가하여 한글 호환성 향상
      const utf8BOM = '\uFEFF';
      const csvWithBOM = utf8BOM + csvContent;

      const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', 'dutyform_sample.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 메모리 정리
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('샘플 파일 다운로드 오류:', error);
      alert('샘플 파일 다운로드에 실패했습니다.');
    }
  };

  // 드래그 상태 관리
  const [isDragOver, setIsDragOver] = React.useState(false);

  // 드래그 이벤트 처리
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      processCsvFile(file);
    }
  };

  // 일괄 파일 추가
  const handleBatchFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setBatchFiles(prev => [...prev, ...files]);
  };

  // 일괄 파일 제거
  const removeBatchFile = (index: number) => {
    setBatchFiles(prev => prev.filter((_, i) => i !== index));
  };


  const uploadFilesToMeeting = async (meetingId: string) => {
    if (attachedFiles.length === 0 && googleDriveFiles.length === 0 && (eventType !== 'document_submission' || requiredFiles.length === 0)) return;

    setUploading(true);
    try {
      // 일반 첨부파일 업로드 (attachment 카테고리)
      for (const file of attachedFiles) {
        await MeetingFileService.uploadMeetingFile(meetingId, file, undefined, 'attachment');
      }

      // Google Drive 파일 처리 및 등록 (pending 파일은 실제 생성/업로드 후 등록)
      for (const googleFile of googleDriveFiles) {
        const integrationOptions = {
          targetType: 'meeting' as const,
          targetId: meetingId
        };
        await GoogleDriveIntegrationService.processPendingAndRegister(googleFile, integrationOptions);
      }

      // 서류제출의 경우 양식 파일을 kijunspace/meeting/에 업로드하고 required_files에 저장
      if (eventType === 'document_submission') {
        for (const uploadedFile of requiredFiles) {
          try {
            // 파일을 kijunspace/meeting/에 업로드하고 TaskFile 생성
            const taskFile = await uploadTemplateFileToMeeting(meetingId, uploadedFile);

            // meeting.meta.required_files에 추가
            await addFileToMeetingMeta(meetingId, taskFile);

            console.log('Template file uploaded and linked to meeting:', taskFile.name);
          } catch (error) {
            console.error('Template file upload failed:', error);
          }
        }
      }
    } catch (error) {
      console.error('파일 업로드 실패:', error);
      // 파일 업로드 실패해도 일정 생성은 성공으로 처리
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 근무 일괄 생성 처리
      if (eventType === 'duty' && dutyCreationMode === 'batch') {
        await handleBatchDutyCreate();
        return;
      }

      // 기존 단일 생성 로직
      const startDateTime = new Date(date);
      const [startHour, startMinute] = startTime.split(':').map(Number);
      startDateTime.setHours(startHour, startMinute, 0, 0);

      const endDateTime = new Date(date);
      const [endHour, endMinute] = endTime.split(':').map(Number);
      endDateTime.setHours(endHour, endMinute, 0, 0);

      const result = await onCreateEvent({
        title,
        kind: eventType,
        starts_at: startDateTime.toISOString(),
        ends_at: endDateTime.toISOString(),
        source: 'custom',
        description,
        assignee: (() => {
          if (eventType === 'personal') {
            // 개인일정의 경우 현재 사용자를 기본 할당
            return currentUserResourceId ? currentUserResourceId : assignee.join(',');
          }
          return (eventType === 'duty' || eventType === 'training' || eventType === 'schedule' || eventType === 'event' || eventType === 'document_submission') ? assignee.join(',') : undefined;
        })(),
        exchangeable: eventType === 'duty' ? false : undefined, // 근무 교환 기능 비활성화
        date_only: dateOnly,
        // 일정 설문 결과에서 만든 일정이면 출처를 남긴다 (meeting.meta.survey_id)
        ...(initialValues?.surveyId ? { survey_id: initialValues.surveyId } : {}),
        // 학사일정 «수업 없는 날» — NEIS 와 같은 값으로 저장된다(meta.sbtr_dd_sc_nm·no_class_grades)
        ...(eventType === 'schedule' && noClass.enabled ? { no_class: noClass } : {}),
        // Document submission specific data - save to meta
        ...(eventType === 'document_submission' && {
          target: submitTo.join(','), // meeting.meta.target에 제출 받을 대상 저장
          related_links: relatedLinks.filter(link => link.trim() !== ''),
          submission_deadline: new Date(`${date.toISOString().split('T')[0]}T${endTime}:00`).toISOString()
          // required_files는 uploadFilesToMeeting에서 자동으로 추가됨
        })
      });

      if (result && typeof result === 'string') {
        // 일정 생성 성공 후 파일 업로드
        await uploadFilesToMeeting(result);

        // 선택한 플러그인 인스턴스 생성
        for (const pluginId of selectedPlugins) {
          try {
            await createPluginInstance.mutateAsync({
              pluginId,
              entityType: 'meeting',
              entityId: result,
              data: {}, // 초기 데이터는 빈 객체
              settings: {}
            });
          } catch (error) {
            console.error('Failed to create plugin instance:', error);
          }
        }

        // 출장·개인일정 — 폼을 비우기 전에(값이 필요하다) 결강 후속 처리
        const openResolution = isAbsenceType ? await followUpAbsence(result) : false;

        // Reset form and close dialog for all event types
        resetForm();
        onOpenChange(false);

        // 생성 모달이 닫힌 **다음** 프레임에 연다 — 닫히는 모달의 포커스 복귀가
        // 새 모달의 포커스를 빼앗지 않게(docs/nested-modal-pitfalls.md 의 rAF 규칙)
        if (openResolution) {
          requestAnimationFrame(() => openAbsenceResolution(result));
        }
      } else if (result) {
        // result가 boolean true인 경우
        resetForm();
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Failed to create event:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 출장·개인일정 저장 직후.
   * ① 출장이면 다른 대상자 중 그 시간에 수업이 있는 선생님께 알린다 — 요청자는 본인이어야 해서
   *    등록한 사람이 남의 수업을 대신 처리할 수 없다.
   * ② 내 수업이 걸려 있으면 결강 처리 모달을 열라고 돌려준다(true).
   * 알림 실패는 일정 저장을 되돌리지 않고 화면에 말한다(알림은 실패해도 조용하다).
   */
  const followUpAbsence = async (meetingId: string): Promise<boolean> => {
    if (eventType === 'event' && otherAbsentees.length > 0 && timetableTerm) {
      const window = absenceWindowOf(absenceStart, absenceEnd, dateOnly);
      if (window) {
        const uuidOnly = otherAbsentees.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
        const res = await notifyAbsenceParticipants({
          meetingId,
          title,
          window,
          participantIds: uuidOnly,
          excludeResourceId: currentUserResourceId,
          term: { year: timetableTerm.year, semester: timetableTerm.semester },
        });
        if (!res.ok) {
          toast.error(`출장은 저장했지만 대상자에게 수업 처리 알림을 보내지 못했습니다${res.error ? ` (${res.error})` : ''}`);
        } else if (res.sent > 0) {
          toast.success(`수업이 겹치는 대상자 ${res.sent}명에게 수업 처리 알림을 보냈습니다`);
        }
      }
    }
    return willResolveAbsence;
  };

  // 일괄 근무 생성 처리
  const handleBatchDutyCreate = async () => {
    if (!batchTitle.trim() || parsedDuties.length === 0) {
      alert('제목과 CSV 데이터를 입력해주세요.');
      return;
    }

    try {
      // 일괄 생성을 위한 meeting 레코드들 준비
      const meetings = parsedDuties.map(duty => {
        const dutyDate = new Date(duty.근무일);
        const startTime = duty.시작시간.split(':').map(Number);
        const endTime = duty.종료시간.split(':').map(Number);

        const startDateTime = new Date(dutyDate);
        startDateTime.setHours(startTime[0], startTime[1], 0, 0);

        const endDateTime = new Date(dutyDate);
        endDateTime.setHours(endTime[0], endTime[1], 0, 0);

        return {
          title: `${batchTitle} - ${formatAssigneeTitle(duty.담당자목록)}`,
          kind: 'duty' as const,
          starts_at: startDateTime.toISOString(),
          ends_at: endDateTime.toISOString(),
          // 쉼표로 결합된 이름 문자열 — convertAssigneeToJsonb가 분리해 담당자 N명으로 배정한다
          assignee: duty.담당자,
          scope: 'teachers',
          exchangeable: false, // 교환 가능 기능 비활성화
          description: batchDescription || duty.근무내용
        };
      });

      // 각 근무 일정을 개별적으로 생성
      const results = [];
      for (const meeting of meetings) {
        const result = await onCreateEvent(meeting);
        if (result) {
          results.push(result);
        }
      }

      if (results.length > 0) {
        alert(`${results.length}개의 업무 일정이 생성되었습니다.`);
        resetForm();
        onOpenChange(false);
      } else {
        throw new Error('일괄 생성에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error creating batch duties:', error);
      alert('일괄 생성 중 오류가 발생했습니다.');
    }
  };

  const getEventTypeInfo = (type: string) => {
    switch (type) {
      case 'schedule':
        return { label: '학사일정', color: 'bg-green-500', icon: <CalendarIcon className="h-4 w-4" /> };
      case 'event':
        return { label: '출장', color: 'bg-purple-500', icon: <Users className="h-4 w-4" /> };
      case 'duty':
        return { label: '업무', color: 'bg-orange-500', icon: <Clock className="h-4 w-4" /> };
      case 'training':
        return { label: '연수', color: 'bg-pink-500', icon: <MapPin className="h-4 w-4" /> };
      case 'document_submission':
        return { label: '서류제출', color: 'bg-blue-500', icon: <PenTool className="h-4 w-4" /> };
      case 'personal':
        return { label: '개인일정', color: 'bg-indigo-500', icon: <CalendarIcon className="h-4 w-4" /> };
      default:
        return { label: '기타', color: 'bg-gray-500', icon: <CalendarIcon className="h-4 w-4" /> };
    }
  };

  const eventTypeInfo = getEventTypeInfo(eventType);

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      // 업로드 중이거나 로딩 중일 때는 다이얼로그 닫기 방지
      if (!newOpen && (uploading || loading || homeroomSaving)) {
        return;
      }
      onOpenChange(newOpen);
    }}>
      <DialogContent className={scheduleComposeDialogClass}>
        <ScheduleComposeHeader title="새 일정 만들기" label={homeroomSelected ? '학급일정' : eventTypeInfo.label}
          description="일정 유형을 고르고 필요한 내용을 채워주세요." />

        <div className="schedule-compose-scroll schedule-compose-fields space-y-5">
          {/* 일정 유형 선택 */}
          <div className="space-y-2.5">
          <p className="text-xs font-semibold text-slate-500">일정 유형</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-label="일정 유형">
            {[
              { value: 'schedule', label: '학사일정', tone: 'green' as const, icon: <CalendarIcon /> },
              { value: 'event', label: '출장', tone: 'purple' as const, icon: <Users /> },
              { value: 'duty', label: '업무', tone: 'orange' as const, icon: <Clock /> },
              { value: 'training', label: '연수', tone: 'pink' as const, icon: <MapPin /> },
              { value: 'homeroom', label: '학급일정', tone: 'teal' as const, icon: <Users />, disabled: !canCreateHomeroom },
              { value: 'personal', label: '개인일정', tone: 'indigo' as const, icon: <CalendarIcon /> }
            ].map((type) => (
              <ScheduleTypeOption
                key={type.value}
                label={type.label} icon={type.icon} tone={type.tone}
                disabled={type.disabled || homeroomSaving || loading || uploading}
                selected={homeroomSelected ? type.value === 'homeroom' : eventType === type.value}
                title={type.disabled ? '담임 학급 태그가 연결된 계정에서 추가할 수 있습니다.' : undefined}
                onClick={() => {
                  if (type.disabled || homeroomSaving) return;
                  setHomeroomSelected(type.value === 'homeroom');
                  if (type.value !== 'homeroom') setEventType(type.value as typeof eventType);
                }}
              />
            ))}
          </div>
          </div>

          {homeroomSelected ? homeroomForm : <form onSubmit={handleSubmit} className="space-y-6">
          {/* 근무 생성 모드 선택 (근무 선택시에만 표시) */}
          {eventType === 'duty' && (
            <div className="schedule-compose-section space-y-3">
              <Label className="text-orange-800 font-medium">생성 모드 선택</Label>
              <RadioGroup value={dutyCreationMode} onValueChange={(value) => setDutyCreationMode(value as 'single' | 'batch')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="single" id="single" />
                  <Label htmlFor="single" className="flex items-center gap-2 cursor-pointer">
                    <FileText className="h-4 w-4" />
                    단일 업무 생성
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="batch" id="batch" />
                  <Label htmlFor="batch" className="flex items-center gap-2 cursor-pointer">
                    <Users className="h-4 w-4" />
                    일괄 업무 생성 (CSV 파일)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* 기본 정보 */}
          <div className="space-y-4 rounded-2xl bg-slate-50 p-4">
            {/* 근무 일괄 생성 모드일 때는 특별한 제목 입력 */}
            {eventType === 'duty' && dutyCreationMode === 'batch' ? (
              <div>
                <Label htmlFor="batchTitle">일괄 생성 제목</Label>
                <Input
                  id="batchTitle"
                  value={batchTitle}
                  onChange={(e) => setBatchTitle(e.target.value)}
                  placeholder="일괄 업무 일정 제목을 입력하세요 (예: 2025년 1월 당직)"
                  required
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="title">제목</Label>
                <Input
                  id="title"
                  className="h-12 bg-white text-base"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={eventType === 'duty' ? '당직, 야간근무, 주말근무 등' : '일정 제목을 입력하세요'}
                  required
                />
              </div>
            )}

            {/* 일괄 모드가 아니거나 근무가 아닌 경우에만 날짜/시간 입력 표시 */}
            {!(eventType === 'duty' && dutyCreationMode === 'batch') && (
              <>
                <div>
                  <Label>날짜</Label>
                  <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, 'yyyy년 M월 d일', { locale: ko }) : '날짜 선택'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[60]" align="start">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={(date) => {
                          if (date) {
                            setDate(date);
                            setIsCalendarOpen(false);
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startTime">시작 시간</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      disabled={dateOnly}
                      required={!dateOnly}
                    />
                  </div>

                  <div>
                    <Label htmlFor="endTime">종료 시간</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      disabled={dateOnly}
                      required={!dateOnly}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="dateOnly"
                    checked={dateOnly}
                    onCheckedChange={(checked) => {
                      const isAllDay = checked as boolean;
                      if (isAllDay) {
                        // 하루 종일 선택시 시간을 00:00부터 23:59로 설정
                        setStartTime('00:00');
                        setEndTime('23:59');
                      }
                      setDateOnly(isAllDay);
                    }}
                  />
                  <Label htmlFor="dateOnly" className="text-sm font-normal">
                    하루 종일
                  </Label>
                </div>
                {eventType === 'schedule' && (
                  <NoClassDayField value={noClass} onChange={setNoClass} idPrefix="create-no-class" />
                )}
              </>
            )}
          </div>

          {/* 근무 특별 옵션 */}
          {eventType === 'duty' && (
            <Card className="rounded-2xl border-slate-200 bg-white shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-600" />
                  업무 상세 설정
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 단일 생성 모드 */}
                {dutyCreationMode === 'single' && (
                  <>
                    <div>
                      <Label className="flex items-center">
                        <Users className="mr-2 h-4 w-4" />
                        담당자 (여러명 선택 가능)
                      </Label>
                      <SearchableMultiSelect
                        filterByTeacher={true}
                        includeTagOptions={true}
                        selectedValues={assignee}
                        onSelectionChange={setAssignee}
                        placeholder="담당자를 검색하거나 선택하세요"
                        searchPlaceholder="이름을 입력하세요 (쉼표로 구분하여 여러명 입력 가능)"
                        emptyText="검색된 담당자가 없습니다"
                        maxSelectedDisplay={2}
                      />
                    </div>
                  </>
                )}

                {/* 일괄 생성 모드 */}
                {dutyCreationMode === 'batch' && (
                  <>
                    {/* CSV 파일 업로드 */}
                    <div>
                      <Label htmlFor="csvFile">CSV 파일</Label>
                      <div
                        className={cn(
                          "border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 cursor-pointer",
                          isDragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400",
                          csvFile && "border-green-400 bg-green-50"
                        )}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => document.getElementById('csvFile')?.click()}
                      >
                        <input
                          id="csvFile"
                          type="file"
                          accept=".csv"
                          onChange={handleCsvFileChange}
                          className="hidden"
                        />
                        <Upload className={cn(
                          "mx-auto h-8 w-8 mb-3 transition-colors",
                          isDragOver ? "text-blue-500" : csvFile ? "text-green-500" : "text-gray-400"
                        )} />
                        <div className="space-y-1">
                          {csvFile ? (
                            <>
                              <p className="text-sm font-medium text-green-700">
                                ✓ {csvFile.name}
                              </p>
                              <p className="text-xs text-green-600">
                                파일이 선택되었습니다. 다른 파일로 변경하려면 클릭하세요.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className={cn(
                                "text-sm font-medium",
                                isDragOver ? "text-blue-600" : "text-gray-600"
                              )}>
                                {isDragOver ? "파일을 놓아주세요" : "CSV 파일을 드래그하거나 클릭하세요"}
                              </p>
                              <p className="text-xs text-gray-500">
                                형식: 근무일자(YYYY-MM-DD), 시작 시간(HH:mm), 종료 시간(HH:mm), 근무자
                              </p>
                              <p className="text-xs text-blue-600">
                                근무자 칸에 이름을 쉼표로 구분해 여러 명을 넣으면 한 일정에 함께 배정됩니다.
                                (예: 홍길동,김철수 — 엑셀이 아닌 메모장에서 작성한다면 <code>&quot;홍길동,김철수&quot;</code>처럼 큰따옴표로 감싸거나 세미콜론(;)으로 구분)
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 샘플 파일 다운로드 버튼 */}
                    <div className="flex justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={downloadSampleCSV}
                        className="text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        샘플 CSV 파일 다운로드
                      </Button>
                    </div>

                    {/* CSV 내용 간단 표시 */}
                    {parsedDuties.length > 0 && (
                      <div className="space-y-3">
                        {/* 요약 정보 */}
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-medium text-green-800 flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              업로드된 파일 내용
                            </h4>
                            <Badge variant="secondary" className="bg-green-100 text-green-700">
                              {parsedDuties.length}건
                            </Badge>
                          </div>

                          {/* 기간 및 담당자 요약 */}
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-green-700 font-medium">기간:</span>
                              <span className="ml-2 text-green-600">
                                {parsedDuties.length > 0 && (
                                  `${parsedDuties[0].근무일} ~ ${parsedDuties[parsedDuties.length - 1].근무일}`
                                )}
                              </span>
                            </div>
                            <div>
                              <span className="text-green-700 font-medium">담당자:</span>
                              <span className="ml-2 text-green-600">
                                {uniqueAssigneeNames.slice(0, 3).join(', ')}
                                {uniqueAssigneeNames.length > 3 && ` 외 ${uniqueAssigneeNames.length - 3}명`}
                                {uniqueAssigneeNames.length > 0 && ` (총 ${uniqueAssigneeNames.length}명)`}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 교사 명단과 매칭되지 않는 이름 경고 — 저장은 되지만 그 사람에게 안 보이므로 */}
                        {unmatchedAssignees.length > 0 && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-sm font-medium text-amber-800">
                              교사 명단에서 찾을 수 없는 이름 {unmatchedAssignees.length}건
                            </p>
                            <p className="mt-1 text-xs text-amber-700">
                              {unmatchedAssignees.join(', ')}
                            </p>
                            <p className="mt-1.5 text-xs text-amber-600">
                              이대로 생성하면 해당 이름은 기록만 되고 그 교사의 일정에는 표시되지 않습니다. 이름을 확인해 주세요.
                            </p>
                          </div>
                        )}

                        {/* 상세 내역 테이블 */}
                        <Card>
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm">상세 내역</CardTitle>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const element = document.getElementById('duty-details');
                                  if (element) {
                                    element.style.display = element.style.display === 'none' ? 'block' : 'none';
                                  }
                                }}
                                className="text-xs h-6 px-2"
                              >
                                상세보기/숨기기
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div id="duty-details" className="max-h-40 overflow-y-auto" style={{ display: 'none' }}>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b bg-gray-50">
                                    <th className="text-left p-2 font-medium">담당자</th>
                                    <th className="text-left p-2 font-medium">근무일</th>
                                    <th className="text-left p-2 font-medium">시간</th>
                                    <th className="text-left p-2 font-medium">내용</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {parsedDuties.map((duty, index) => (
                                    <tr key={index} className="border-b hover:bg-gray-50">
                                      <td className="p-2">
                                        <span className="flex flex-wrap gap-1">
                                          {duty.담당자목록.map((name) => (
                                            <span
                                              key={name}
                                              className={cn(
                                                'rounded px-1.5 py-0.5',
                                                teacherNames.size > 0 && !teacherNames.has(name)
                                                  ? 'bg-amber-100 text-amber-800'
                                                  : 'bg-gray-100 text-gray-700'
                                              )}
                                            >
                                              {name}
                                            </span>
                                          ))}
                                        </span>
                                      </td>
                                      <td className="p-2">{duty.근무일}</td>
                                      <td className="p-2">{duty.시작시간}-{duty.종료시간}</td>
                                      <td className="p-2">{duty.근무내용}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}

                  </>
                )}

                {/* 교환 가능 옵션 - 비활성화 */}
                {false && (
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="flex items-center gap-2">
                        <RotateCcw className="h-4 w-4" />
                        교환 가능
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        다른 교사와 근무 교환을 허용합니다
                      </p>
                    </div>
                    <Switch
                      checked={exchangeable}
                      onCheckedChange={setExchangeable}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 출장 특별 옵션 */}
          {eventType === 'event' && (
            <Card className="rounded-2xl border-slate-200 bg-white shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-purple-600" />
                  출장 대상자 설정
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="flex items-center">
                    <Users className="mr-2 h-4 w-4" />
                    대상자 (여러명 선택 가능)
                  </Label>
                  <SearchableMultiSelect
                    filterByTeacher={true}
                    includeTagOptions={true}
                    selectedValues={assignee}
                    onSelectionChange={setAssignee}
                    placeholder="출장 대상자를 검색하거나 선택하세요"
                    searchPlaceholder="이름을 입력하세요 (쉼표로 구분하여 여러명 입력 가능)"
                    emptyText="검색된 대상자가 없습니다"
                    maxSelectedDisplay={3}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* 연수 특별 옵션 */}
          {eventType === 'training' && (
            <Card className="rounded-2xl border-slate-200 bg-white shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-pink-600" />
                  연수 참석자 설정
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="flex items-center">
                    <Users className="mr-2 h-4 w-4" />
                    참석자 (여러명 선택 가능)
                  </Label>
                  <SearchableMultiSelect
                    filterByTeacher={true}
                    includeTagOptions={true}
                    selectedValues={assignee}
                    onSelectionChange={setAssignee}
                    placeholder="참석자를 검색하거나 선택하세요"
                    searchPlaceholder="이름을 입력하세요 (쉼표로 구분하여 여러명 입력 가능)"
                    emptyText="검색된 참석자가 없습니다"
                    maxSelectedDisplay={3}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* 개인일정 특별 옵션 */}
          {eventType === 'personal' && (
            <p className="flex items-center gap-2 text-xs leading-relaxed text-slate-500">
              <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-indigo-500" />개인일정은 본인에게만 표시됩니다.
            </p>
          )}

          {/* 결강 미리보기 — 출장 대상자 카드 바로 아래라야 "나를 넣으면 내 수업이 걸린다" 가 한눈에 읽힌다 */}
          {isAbsenceType && (
            <AbsenceLessonsNotice
              kind={eventType as 'event' | 'personal'}
              iAmAbsent={iAmAbsent}
              lessons={absencePreview.lessons}
              loading={absencePreview.isLoading}
              weekday={absencePreview.window?.weekday}
              mySlots={absenceMySlots}
              hasOtherParticipants={otherAbsentees.length > 0}
            />
          )}

          {/* 서류 제출 특별 옵션 */}
          {eventType === 'document_submission' && (
            <Card className="rounded-2xl border-slate-200 bg-white shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <PenTool className="h-4 w-4 text-blue-600" />
                  서류 제출 설정
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 제출 기한 설정 */}
                <div className="space-y-2">
                  <Label className="text-sm text-blue-700">제출 기한</Label>
                  <p className="text-xs text-muted-foreground">
                    위에서 설정한 날짜와 종료 시간이 제출 기한으로 사용됩니다.
                  </p>
                </div>

                {/* 제출 받을 대상 설정 */}
                <div className="space-y-2">
                  <Label className="flex items-center text-sm text-blue-700">
                    <Users className="mr-2 h-4 w-4" />
                    제출 받을 대상 (담임교사, 부장교사 등)
                  </Label>
                  <SearchableMultiSelect
                    filterByTeacher={true}
                    includeTagOptions={true}
                    selectedValues={submitTo}
                    onSelectionChange={setSubmitTo}
                    placeholder="서류를 제출받을 담당자를 선택하세요"
                    searchPlaceholder="이름을 입력하세요 (쉼표로 구분하여 여러명 입력 가능)"
                    emptyText="검색된 담당자가 없습니다"
                    maxSelectedDisplay={3}
                  />
                </div>

                {/* 서류 제출 대상자 설정 */}
                <div className="space-y-2">
                  <Label className="flex items-center text-sm text-blue-700">
                    <Users className="mr-2 h-4 w-4" />
                    서류 제출 대상자 (여러명 선택 가능)
                  </Label>
                  <SearchableMultiSelect
                    filterByTeacher={true}
                    includeTagOptions={true}
                    selectedValues={assignee}
                    onSelectionChange={setAssignee}
                    placeholder="서류를 제출해야 할 대상자를 선택하세요"
                    searchPlaceholder="이름을 입력하세요 (쉼표로 구분하여 여러명 입력 가능)"
                    emptyText="검색된 대상자가 없습니다"
                    maxSelectedDisplay={3}
                  />
                </div>

                {/* 관련 링크 */}
                <div className="space-y-3">
                  <Label className="text-sm text-blue-700">관련 링크 (클라우드 문서 등)</Label>
                  {relatedLinks.map((link, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder="https://docs.google.com/document/d/..."
                        value={link}
                        onChange={(e) => {
                          const newLinks = [...relatedLinks];
                          newLinks[index] = e.target.value;
                          setRelatedLinks(newLinks);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (index === relatedLinks.length - 1) {
                            setRelatedLinks([...relatedLinks, '']);
                          } else {
                            setRelatedLinks(prev => prev.filter((_, i) => i !== index));
                          }
                        }}
                      >
                        {index === relatedLinks.length - 1 ? '추가' : '삭제'}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 일반 일정 옵션 제거 - 학사/행사는 전교사 대상 */}


          {/* 설명 */}
          <div>
            <Label htmlFor="description">상세 설명 (선택)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="추가 정보나 특이사항을 입력하세요"
              rows={3}
            />
          </div>

          {/* 플러그인 선택 */}
          {availablePlugins.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Puzzle className="h-4 w-4" />
                기능 추가 (선택)
              </Label>
              <div className="space-y-2">
                {selectedPlugins.map((pluginId, index) => {
                  const plugin = availablePlugins.find(p => p.id === pluginId);
                  return (
                    <div key={index} className="flex items-center gap-2">
                      <Select
                        value={pluginId}
                        onValueChange={(value) => {
                          const newPlugins = [...selectedPlugins];
                          newPlugins[index] = value;
                          setSelectedPlugins(newPlugins);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="기능 선택">
                            {plugin?.name || '기능 선택'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availablePlugins
                            .filter(p => !selectedPlugins.includes(p.id) || p.id === pluginId)
                            .map(plugin => (
                              <SelectItem key={plugin.id} value={plugin.id}>
                                <div className="flex items-center gap-2">
                                  <Puzzle className="h-4 w-4" />
                                  <span>{plugin.name}</span>
                                  {plugin.description && (
                                    <span className="text-xs text-muted-foreground ml-2">
                                      ({plugin.description})
                                    </span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedPlugins(prev => prev.filter((_, i) => i !== index));
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                {selectedPlugins.length < availablePlugins.length && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedPlugins([...selectedPlugins, ''])}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    기능 추가
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 파일 첨부 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">파일 첨부 (선택)</label>
            <CombinedFileUpload
              localFiles={attachedFiles}
              onLocalFilesChange={setAttachedFiles}
              googleDriveFiles={googleDriveFiles}
              onGoogleDriveFilesChange={setGoogleDriveFiles}
              maxFileSize={5 * 1024 * 1024}
              maxFiles={10}
              showGoogleDrive={true}
            />
            {/* 업로드 중 표시 */}
            {uploading && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                파일 업로드 중...
              </div>
            )}
          </div>

          {/* 버튼 */}
          <div className="schedule-compose-footer">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading || uploading}
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={loading || uploading || (
                eventType === 'duty' && dutyCreationMode === 'batch' ?
                  (!batchTitle.trim() || parsedDuties.length === 0) :
                  !title
              )}
            >
              {loading ? '일정 생성 중...' :
                uploading ? '파일 업로드 중...' :
                  eventType === 'duty' && dutyCreationMode === 'batch' && parsedDuties.length > 0 ?
                    `일괄 생성 (${parsedDuties.length}건)` :
                    willResolveAbsence ? '저장하고 수업 처리' : '일정 추가'}
            </Button>
          </div>
        </form>}
        </div>

      </DialogContent>
    </Dialog>
  );
};
