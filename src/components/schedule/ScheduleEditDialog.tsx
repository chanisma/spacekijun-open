import React, { useState, useEffect, useRef } from 'react';
import { DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar as CalendarIcon, Save, X, Upload, File, FileText, Users, PenTool, RotateCcw, Plus } from 'lucide-react';
import { SearchableMultiSelect, SearchableMultiSelectItem } from '@/components/ui/searchable-multi-select';
import { FileUpload } from '@/components/ui/file-upload';
import { MultiFileUpload } from '@/components/ui/multi-file-upload';
import { CombinedFileUpload } from '@/components/ui/combined-file-upload';
import { GoogleDriveFileInfo } from '@/components/ui/google-drive/GoogleDrivePicker';
import { GoogleDriveIntegrationService } from '@/services/googleDriveIntegrationService';
import { cn } from '@/lib/utils';
import { getEventTypeColor, getEventFullLabel } from '@/lib/scheduleUtils';
import { noClassMetaPatch, readNoClassSetting, type NoClassSetting } from '@/lib/schoolDay';
import { NoClassDayField } from './NoClassDayField';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ScheduleEvent } from '@/hooks/useSchedule';
import { MeetingFileService } from '@/services/meetingFileService';
import { useResources } from '@/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';
import { UploadedFile } from '@/services/fileUploadService';
import type { TaskFile } from '@/types/tasks';
import { EnhancedFileList } from '@/components/ui/file-list';
import type { Document } from '@/features/documents/types';
import { usePlugins, usePluginInstances, useCreatePluginInstance, useDeletePluginInstance } from '@/hooks/usePlugins';
import { Puzzle } from 'lucide-react';

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

interface ScheduleEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: ScheduleEvent | null;
  onUpdate: (eventId: string, eventData: any) => Promise<boolean>;
  onCreate?: (eventData: any) => Promise<boolean>;
  onBatchCreate?: (batchData: BatchDutyData) => Promise<boolean>;
}

interface EditingEventData {
  title: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  scope?: string;
  assignee?: string[];
  exchangeable?: boolean;
  date_only?: boolean;
  description?: string;
}

interface DutyRecord {
  담당자: string;
  근무일: string;
  시작시간: string;
  종료시간: string;
  근무내용: string;
  비고?: string;
}

interface BatchDutyData {
  title: string;
  description?: string;
  duties: DutyRecord[];
  files?: File[];
}

type CreationMode = 'single' | 'batch';

export const ScheduleEditDialog: React.FC<ScheduleEditDialogProps> = ({
  open,
  onOpenChange,
  event,
  onUpdate,
  onCreate,
  onBatchCreate
}) => {
  const [editingEvent, setEditingEvent] = useState<EditingEventData | null>(null);
  // 학사일정 «수업 없는 날 · 학년» (2026-10-11) — 열 때마다 일정의 meta 에서 다시 읽는다
  const [noClass, setNoClass] = useState<NoClassSetting>({ enabled: false, grades: [] });
  useEffect(() => {
    if (open) setNoClass(readNoClassSetting(event?.meta));
  }, [open, event]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Document submission specific state
  const [relatedLinks, setRelatedLinks] = useState<string[]>(['']);
  const [submitTo, setSubmitTo] = useState<string[]>([]);

  // General file attachment state
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [googleDriveFiles, setGoogleDriveFiles] = useState<GoogleDriveFileInfo[]>([]);
  const [uploading, setUploading] = useState(false);

  // Existing files state - 일반 첨부파일용 (meeting.meta.files)
  const [existingFiles, setExistingFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesToDelete, setFilesToDelete] = useState<string[]>([]); // 삭제 예정 파일 ID 목록

  // 일괄 생성 관련 state
  const [creationMode, setCreationMode] = useState<CreationMode>('single');
  const [batchTitle, setBatchTitle] = useState('');
  const [batchDescription, setBatchDescription] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedDuties, setParsedDuties] = useState<DutyRecord[]>([]);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);

  // 플러그인 관련 state
  const [selectedPlugins, setSelectedPlugins] = useState<string[]>([]);
  const { data: availablePlugins = [] } = usePlugins();
  const { data: existingPluginInstances = [], isLoading: pluginInstancesLoading } =
    usePluginInstances('meeting', event?.id || '');
  // 이번 열림에서 플러그인 선택을 서버 데이터로 초기화했는지. 초기화 후의 refetch가
  // 사용자가 만지는 중인 체크 상태를 덮어쓰지 않게 한다.
  const pluginsInitializedRef = useRef(false);
  const createPluginInstance = useCreatePluginInstance();
  const deletePluginInstance = useDeletePluginInstance();

  // 리소스 데이터 가져오기
  const { data: resources } = useResources();

  // assignee를 SearchableMultiSelect가 기대하는 resource UUID 배열로 변환
  // 저장 시에는 name을 JSONB 키로 사용하지만, 피커는 resource.id를 value로 사용하므로
  // name → resource.id 역조회가 필요함. 매칭되지 않으면 원본 문자열을 유지(레거시 호환).
  const resolveNamesToResourceIds = async (names: string[]): Promise<string[]> => {
    if (names.length === 0) return [];

    const { data, error } = await supabase
      .from('resource')
      .select('id, name')
      .eq('type', 'teacher')
      .in('name', names);

    if (error || !data) {
      console.warn('assignee name 해석 실패, 이름 그대로 사용:', error);
      return names;
    }

    const nameToId = new Map(data.map((r) => [r.name, r.id]));
    // 원본 순서 유지, 매칭되면 id로 치환
    return names.map((n) => nameToId.get(n) ?? n);
  };

  const getAssigneeArray = async (assignee: any): Promise<string[]> => {
    if (!assignee) return [];

    let names: string[] = [];

    if (typeof assignee === 'string') {
      // Legacy 행사/출장 records may store comma-separated names
      names = assignee.split(',').map((n) => n.trim()).filter(Boolean);
    } else if (typeof assignee === 'object') {
      // JSONB 객체에서 name 값들을 추출 (이제 name에 실제 이름이 저장됨)
      names = Object.values(assignee)
        .map((item: any) => item?.name)
        .filter(Boolean) as string[];
    }

    return resolveNamesToResourceIds(names);
  };

  // 이름 배열을 JSONB assignee 형태로 변환하는 헬퍼 함수 (연수 일정용)
  const convertNamesToJsonbAssignee = async (names: string[]): Promise<any> => {
    if (!names || names.length === 0) return undefined;

    const assigneeObject: { [key: string]: { name: string; signature: number } } = {};

    for (const item of names) {
      try {
        // UUID 형태인지 확인 (resource ID)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item);

        if (isUUID) {
          // ID로 검색 (resource 테이블에서)
          const { data: resource } = await supabase
            .from('resource')
            .select('id, name')
            .eq('id', item)
            .maybeSingle();

          if (resource) {
            // 일관성을 위해 항상 이름을 키로 사용
            assigneeObject[resource.name] = { name: resource.name, signature: 0 };
          } else {
            // resource도 찾을 수 없는 경우
            assigneeObject[item] = { name: item, signature: 0 };
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
              assigneeObject[resourceData.name] = { name: resourceData.name, signature: 0 };
            } else {
              // resource가 없는 경우 이름을 키로 사용
              assigneeObject[item] = { name: item, signature: 0 };
            }
          } else {
            // profile이 없는 경우 이름을 키로 사용
            assigneeObject[item] = { name: item, signature: 0 };
          }
        }
      } catch (error) {
        console.error(`Failed to find user for item: ${item}`, error);
        // 오류 발생 시 원본 항목을 키와 name으로 사용
        assigneeObject[item] = { name: item, signature: 0 };
      }
    }

    return assigneeObject;
  };

  // SearchableMultiSelect 컴포넌트가 filterByTeacher prop으로 자동 처리하므로 resourceItems 불필요

  // Initialize editing state when event changes
  useEffect(() => {
    const initializeEvent = async () => {
      // Reset all states when dialog opens
      if (open) {
        setRelatedLinks(['']);
        setSubmitTo([]);
        setAttachedFiles([]);
        setGoogleDriveFiles([]);
        setExistingFiles([]);
        setLoadingFiles(false);
        setFilesToDelete([]); // 삭제 예정 목록 초기화
        // 플러그인 선택은 항상 비운 뒤 서버 데이터 도착 시 아래 동기화 effect가 채운다.
        // 기존 이벤트를 리셋에서 제외하면 직전에 열었던 다른 일정의 선택이 살아남아
        // 저장 시 그 플러그인이 이 일정에 실제로 생성된다(2026-08-12 수정).
        setSelectedPlugins([]);
        pluginsInitializedRef.current = false;
      }

      if (event && open) {
        const assigneeArray = await getAssigneeArray(event.assignee);
        setEditingEvent({
          title: event.title,
          kind: event.kind,
          starts_at: event.starts_at,
          ends_at: event.ends_at,
          scope: (event as any).scope,
          assignee: assigneeArray,
          exchangeable: event.exchangeable,
          date_only: event.date_only,
          description: event.description
        });
        setSelectedDate(new Date(event.starts_at));

        // 시간 추출하여 별도 state로 설정
        const eventStartTime = new Date(event.starts_at);
        const eventEndTime = new Date(event.ends_at);
        setStartTime(eventStartTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
        setEndTime(eventEndTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));

        setCreationMode('single'); // 기존 이벤트 편집시 단일 모드

        // 모든 이벤트에 대해 일반 첨부파일 로드
        setLoadingFiles(true);
        try {
          const attachments = await MeetingFileService.getMeetingAttachmentFiles(event.id);

          // 일반 첨부파일을 FileUpload 호환 형태로 변환
          const convertedGeneralFiles = attachments.map((file: any) => ({
            id: file.id,
            file_name: file.name || '파일명 없음',
            file_size: file.size || 0,
            file_type: file.type || 'unknown',
            storage_path: file.url || '',
            upload_status: 'completed',
            created_at: file.uploaded_at || new Date().toISOString(),
            user_id: file.uploaded_by || ''
          }));

          setExistingFiles(convertedGeneralFiles);
        } catch (error) {
          console.error('일반 첨부파일 로드 실패:', error);
          setExistingFiles([]);
        } finally {
          setLoadingFiles(false);
        }

        // document_submission인 경우 추가 데이터 로드
        if (event.kind === 'document_submission') {
          // 관련 링크 로드
          const links = (event as any).related_links || [];
          setRelatedLinks(links.length > 0 ? links : ['']);

          // 제출 받을 대상 로드 - meta.target은 이름 CSV, 피커는 resource.id를 기대함
          const rawTargets: string[] = (event as any).target
            ? (event as any).target.split(',').map((t: string) => t.trim()).filter(Boolean)
            : [];
          const resolvedTargets = await resolveNamesToResourceIds(rawTargets);
          setSubmitTo(resolvedTargets);
        }
      } else if (open && !event) {
        // 새 이벤트 생성시 초기화
        setCreationMode('single');
        setSelectedDate(new Date());
        setStartTime('09:00');
        setEndTime('18:00');
        setEditingEvent({
          title: '',
          kind: 'duty',
          starts_at: new Date().toISOString(),
          ends_at: new Date().toISOString(),
          scope: '',
          assignee: [],
          exchangeable: false,
          date_only: false,
          description: ''
        });
      }
    };

    initializeEvent();
  }, [event, open]);

  // 플러그인 인스턴스 로드를 별도 useEffect로 분리.
  // 로딩 완료를 기다렸다가(빈 결과 포함) 이번 열림당 1회만 초기화한다 —
  // 구 구현은 length > 0일 때만 발화해 "플러그인 없음"이라는 정보를 버렸고,
  // 그 탓에 직전 일정의 선택이 유령처럼 남았다.
  useEffect(() => {
    if (!open || !event || pluginInstancesLoading || pluginsInitializedRef.current) return;
    setSelectedPlugins(existingPluginInstances.map((instance: any) => instance.plugin_id));
    pluginsInitializedRef.current = true;
  }, [event, open, pluginInstancesLoading, existingPluginInstances]);



  // File handling functions

  const handleDeleteExistingFile = (fileId: string) => {
    // 즉시 삭제하지 않고 삭제 예정 목록에 추가
    setFilesToDelete(prev => [...prev, fileId]);
  };

  const handleCancelDelete = (fileId: string) => {
    // 삭제 예정 목록에서 제거
    setFilesToDelete(prev => prev.filter(id => id !== fileId));
  };

  const uploadFilesToMeeting = async (meetingId: string) => {
    if (attachedFiles.length === 0 && googleDriveFiles.length === 0) {
      return;
    }

    setUploading(true);

    try {
      // 일반 첨부파일 업로드 (attachment 카테고리)
      if (attachedFiles.length > 0) {
        for (const file of attachedFiles) {
          await MeetingFileService.uploadMeetingFile(meetingId, file, undefined, 'attachment');
        }
      }

      // Google Drive 파일 처리 및 등록 (pending 파일은 실제 생성/업로드 후 등록)
      if (googleDriveFiles.length > 0) {
        for (const googleFile of googleDriveFiles) {
          const integrationOptions = {
            targetType: 'meeting' as const,
            targetId: meetingId
          };
          await GoogleDriveIntegrationService.processPendingAndRegister(googleFile, integrationOptions);
        }
      }
    } catch (error) {
      console.error('❌ 파일 업로드 실패:', error);
      // 파일 업로드 실패해도 일정 수정은 성공으로 처리
    } finally {
      setUploading(false);
    }
  };

  // CSV 파일 파싱 함수
  const parseCSV = (text: string): DutyRecord[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const records: DutyRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length >= 5) {
        records.push({
          담당자: values[0],
          근무일: values[1],
          시작시간: values[2],
          종료시간: values[3],
          근무내용: values[4],
          비고: values[5] || ''
        });
      }
    }

    return records;
  };

  // CSV 파일 업로드 처리
  const handleCsvFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      alert('올바른 CSV 파일을 선택해주세요.');
      return;
    }

    setCsvFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const duties = parseCSV(text);
      setParsedDuties(duties);
    };
    reader.readAsText(file, 'utf-8');
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

  // 일괄 생성 처리
  const handleBatchCreate = async () => {
    if (!batchTitle.trim() || parsedDuties.length === 0) {
      alert('제목과 CSV 데이터를 입력해주세요.');
      return;
    }

    if (!onBatchCreate) {
      alert('일괄 생성 기능이 지원되지 않습니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      const batchData: BatchDutyData = {
        title: batchTitle,
        description: batchDescription,
        duties: parsedDuties,
        files: batchFiles
      };

      const success = await onBatchCreate(batchData);
      if (success) {
        // 초기화
        setBatchTitle('');
        setBatchDescription('');
        setCsvFile(null);
        setParsedDuties([]);
        setBatchFiles([]);
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Error creating batch duties:', error);
      alert('일괄 생성 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 모드 전환 시 초기화
  const handleModeChange = (mode: CreationMode) => {
    setCreationMode(mode);
    if (mode === 'batch') {
      setBatchTitle('');
      setBatchDescription('');
      setCsvFile(null);
      setParsedDuties([]);
      setBatchFiles([]);
    } else if (mode === 'single' && !event) {
      // 단일 모드로 전환시 editingEvent 초기화
      const now = new Date();
      setStartTime('09:00');
      setEndTime('18:00');
      setEditingEvent({
        title: '',
        kind: 'duty',
        starts_at: now.toISOString(),
        ends_at: now.toISOString(),
        scope: '',
        assignee: [],
        exchangeable: false,
        date_only: false,
        description: ''
      });
      setSelectedDate(now);
    }
  };



  // 시간 변경 핸들러
  const handleTimeChange = (time: string, field: 'start' | 'end') => {
    if (field === 'start') {
      setStartTime(time);
    } else {
      setEndTime(time);
    }
  };

  const handleCancel = async () => {
    // 모든 상태 초기화
    setRelatedLinks(['']);
    setSubmitTo([]);
    setAttachedFiles([]);
    setGoogleDriveFiles([]);
    setExistingFiles([]);
    setLoadingFiles(false);
    setFilesToDelete([]); // 삭제 예정 목록 초기화
    // 플러그인 선택은 무조건 비운다 — 다음 열림에서 초기화 effect가 서버 데이터로 채운다
    setSelectedPlugins([]);
    pluginsInitializedRef.current = false;

    if (event) {
      const assigneeArray = await getAssigneeArray(event.assignee);
      setEditingEvent({
        title: event.title,
        kind: event.kind,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        scope: (event as any).scope,
        assignee: assigneeArray,
        exchangeable: event.exchangeable,
        date_only: event.date_only,
        description: event.description
      });
      setSelectedDate(new Date(event.starts_at));

      // 시간 원복
      const eventStartTime = new Date(event.starts_at);
      const eventEndTime = new Date(event.ends_at);
      setStartTime(eventStartTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      setEndTime(eventEndTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } else {
      // 새 이벤트 생성 취소시 초기화
      setCreationMode('single');
      setBatchTitle('');
      setBatchDescription('');
      setCsvFile(null);
      setParsedDuties([]);
      setBatchFiles([]);
      setStartTime('09:00');
      setEndTime('18:00');
    }
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (!editingEvent || !selectedDate) return;

    setIsSubmitting(true);
    try {
      // 별도 state로 관리하는 시간 사용
      const startDateTime = new Date(selectedDate);
      const [startHour, startMinute] = startTime.split(':').map(Number);
      if (isNaN(startHour) || isNaN(startMinute)) {
        throw new Error('Invalid start time format');
      }
      startDateTime.setHours(startHour, startMinute, 0, 0);

      const endDateTime = new Date(selectedDate);
      const [endHour, endMinute] = endTime.split(':').map(Number);
      if (isNaN(endHour) || isNaN(endMinute)) {
        throw new Error('Invalid end time format');
      }
      endDateTime.setHours(endHour, endMinute, 0, 0);

      // assignee 처리 - duty, event(출장), training, document_submission 일정인 경우 JSONB 형태로 변환
      let assigneeData: any;
      // 개인일정도 만들 때(useScheduleMutations.createEvent)처럼 JSONB 이름 객체로 저장한다 —
      // 열 때 getAssigneeArray 가 이름을 resource id 로 바꿔 두므로, 문자열로 저장하면
      // 상세 창에 이름 대신 id 가 찍혔다(2026-10-11)
      if (['duty', 'event', 'training', 'document_submission', 'personal'].includes(editingEvent.kind) && editingEvent.assignee && editingEvent.assignee.length > 0) {
        assigneeData = await convertNamesToJsonbAssignee(editingEvent.assignee);
      } else if (editingEvent.assignee && editingEvent.assignee.length > 0) {
        // 다른 타입의 경우 첫 번째 assignee만 문자열로 사용 — 열 때 id 로 바뀐 값을 이름으로 되돌린다
        const [first] = editingEvent.assignee;
        assigneeData = first;
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(first)) {
          const { data: resource } = await supabase
            .from('resource')
            .select('name')
            .eq('id', first)
            .maybeSingle();
          if (resource?.name) assigneeData = resource.name;
        }
      } else {
        assigneeData = undefined;
      }

      const eventData: any = {
        title: editingEvent.title,
        kind: editingEvent.kind,
        starts_at: startDateTime.toISOString(),
        ends_at: endDateTime.toISOString(),
        scope: editingEvent.scope,
        assignee: assigneeData,
        exchangeable: editingEvent.exchangeable,
        date_only: editingEvent.date_only,
        description: editingEvent.description
      };

      // 기존 이벤트 수정 시 meta 업데이트
      if (event) {
        const existingMeta = event?.meta || {};

        // existingFiles를 TaskFile 형태로 변환 (삭제 예정 파일 제외)
        const updatedFiles = existingFiles
          .filter(file => !filesToDelete.includes(file.id))
          .map(file => ({
            id: file.id,
            name: file.file_name,
            url: file.storage_path,
            size: file.file_size,
            type: file.file_type,
            uploaded_at: file.created_at,
            uploaded_by: file.user_id,
            category: 'attachment'
          }));

        // meta 기본 구조 설정 (title, assignee, 삭제된 파일이 제외된 files 포함)
        eventData.meta = {
          ...existingMeta,
          title: editingEvent.title,
          assignee: assigneeData,
          files: updatedFiles,
          // 학사일정 «수업 없는 날» — 기존 값(NEIS 공휴일 등)을 보고 덮어쓸 두 키를 정한다
          ...(editingEvent.kind === 'schedule' ? noClassMetaPatch(noClass, existingMeta) : {}),
        };

        // document_submission인 경우 추가 필드 업데이트
        if (editingEvent.kind === 'document_submission') {
          eventData.meta = {
            ...eventData.meta, // 이미 업데이트된 title, assignee, files 포함
            target: submitTo.join(','),
            description: editingEvent.description,
            related_links: relatedLinks.filter(link => link.trim() !== ''),
            submission_deadline: endDateTime.toISOString()
          };

          // target field for updateEvent hook
          eventData.target = submitTo.join(',');
        }
      }

      if (event) {
        // 기존 이벤트 수정
        const originalDate = new Date(event.starts_at);
        const newDate = new Date(selectedDate);
        const dateChanged = originalDate.toDateString() !== newDate.toDateString();

        // 날짜가 변경되면 meeting.meta.event_date도 업데이트
        if (dateChanged) {
          eventData.event_date = startDateTime.toISOString().split('T')[0]; // YYYY-MM-DD 형식
        }

        // 🔧 수정: onUpdate() 전에 파일 먼저 삭제
        // 삭제 예정 파일 삭제 (documents 테이블 및 storage에서 실제 삭제)
        for (const fileId of filesToDelete) {
          try {
            await MeetingFileService.deleteMeetingFile(event.id, fileId);
          } catch (error) {
            console.error('파일 삭제 실패:', error);
          }
        }

        console.log('🔄 onUpdate 호출 시작');
        const success = await onUpdate(event.id, eventData);
        console.log(`✅ onUpdate 완료, success=${success}`);
        if (success) {
          // 일정 수정 성공 후 파일 업로드
          await uploadFilesToMeeting(event.id);

          // 플러그인 인스턴스 업데이트 (데이터 보존하며 업데이트)

          // 1. 기존 플러그인 인스턴스 ID와 선택된 플러그인 ID 비교
          const existingPluginIds = existingPluginInstances.map((instance: any) => instance.plugin_id);

          // 2. 제거된 플러그인 인스턴스만 삭제
          const pluginsToRemove = existingPluginInstances.filter(
            (instance: any) => !selectedPlugins.includes(instance.plugin_id)
          );
          for (const instance of pluginsToRemove) {
            try {
              await deletePluginInstance.mutateAsync(instance.id);
            } catch (error) {
              console.error('Failed to delete plugin instance:', error);
            }
          }

          // 3. 새로 추가된 플러그인만 생성
          const pluginsToAdd = selectedPlugins.filter(
            (pluginId: string) => !existingPluginIds.includes(pluginId)
          );
          for (const pluginId of pluginsToAdd) {
            try {
              await createPluginInstance.mutateAsync({
                pluginId,
                entityType: 'meeting',
                entityId: event.id,
                data: {},
                settings: {}
              });
            } catch (error) {
              console.error('Failed to create plugin instance:', error);
            }
          }

          onOpenChange(false);
        }
      } else {
        // 새 이벤트 생성
        if (!onCreate) {
          alert('새 이벤트 생성 기능이 지원되지 않습니다.');
          return;
        }

        if (editingEvent.kind === 'schedule' && noClass.enabled) eventData.no_class = noClass;
        const success = await onCreate(eventData);
        if (success) {
          onOpenChange(false);
        }
      }
    } catch (error) {
      console.error('❌ handleSave 에러 발생:', error);
      alert('일정 저장 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 기존 이벤트 편집 모드인 경우에만 event와 editingEvent 필요
  if (event && !editingEvent) return null;
  // 단일 생성 모드에서 editingEvent가 없으면 대기
  if (!event && creationMode === 'single' && !editingEvent) return null;

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      // 업로드 중이거나 로딩 중일 때는 다이얼로그 닫기 방지
      if (!newOpen && (uploading || isSubmitting)) {
        return;
      }
      onOpenChange(newOpen);
    }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              {event && editingEvent ? (
                <>
                  <Badge className={cn(getEventTypeColor(editingEvent.kind, 'solid'))}>
                    {getEventFullLabel(editingEvent.kind)}
                  </Badge>
                  일정 수정
                </>
              ) : (
                <>
                  <Badge className="bg-orange-500 text-white">
                    업무
                  </Badge>
                  업무 일정 생성
                </>
              )}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-2 pb-4">
          {/* 생성 모드 선택 (새 이벤트 생성시만 표시) */}
          {!event && (
            <div className="space-y-3">
              <Label>생성 모드</Label>
              <RadioGroup value={creationMode} onValueChange={handleModeChange}>
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

          {/* 단일 생성 모드 */}
          {(event || creationMode === 'single') && editingEvent && (
            <>
              {/* 제목 */}
              <div className="space-y-2">
                <Label htmlFor="title">제목</Label>
                <Input
                  id="title"
                  value={editingEvent.title}
                  onChange={(e) => setEditingEvent(prev => prev ? { ...prev, title: e.target.value } : null)}
                  placeholder="일정 제목을 입력하세요"
                />
              </div>

              {/* 일정 종류 (새 일정 생성시만 표시) */}
              {!event && (
                <div className="space-y-2">
                  <Label>일정 종류</Label>
                  <Select
                    value={editingEvent.kind}
                    onValueChange={(value) => setEditingEvent(prev => prev ? { ...prev, kind: value } : null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="일정 종류 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="schedule">학사일정</SelectItem>
                      <SelectItem value="event">출장</SelectItem>
                      <SelectItem value="duty">업무</SelectItem>
                      <SelectItem value="training">연수</SelectItem>
                      {/* 서류제출 일정은 신규 생성 중단 (2026-08-12) */}
                      <SelectItem value="document_submission" disabled>서류제출 (생성 중단)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* 담당자/대상자 (근무, 출장, 연수일 때만 표시 - 서류제출은 서류 제출 설정 안에서 처리) */}
              {(editingEvent.kind === 'duty' || editingEvent.kind === 'event' || editingEvent.kind === 'training') && (
                <div className="space-y-2">
                  <Label>
                    {editingEvent.kind === 'event' ? '출장 대상자' : editingEvent.kind === 'training' ? '연수 참석자' : '담당자'}
                  </Label>
                  <SearchableMultiSelect
                    filterByTeacher={true}
                    includeTagOptions={true}
                    selectedValues={editingEvent.assignee || []}
                    onSelectionChange={(values) => setEditingEvent(prev => prev ? { ...prev, assignee: values } : null)}
                    placeholder={
                      editingEvent.kind === 'event'
                        ? '출장 대상자를 선택하세요'
                        : editingEvent.kind === 'training'
                          ? '연수 참석자를 선택하세요'
                          : '담당자를 선택하세요'
                    }
                    searchPlaceholder="이름을 입력하세요 (쉼표로 구분하여 여러명 입력 가능)"
                  />
                </div>
              )}

              {/* 날짜 */}
              <div className="space-y-2">
                <Label>날짜</Label>
                <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={true}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, 'yyyy년 M월 d일', { locale: ko }) : '날짜 선택'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[60]" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        setSelectedDate(date);
                        setIsCalendarOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* 시간 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startTime">시작 시간</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={startTime}
                    onChange={(e) => handleTimeChange(e.target.value, 'start')}
                    disabled={!!editingEvent.date_only}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endTime">종료 시간</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={endTime}
                    onChange={(e) => handleTimeChange(e.target.value, 'end')}
                    disabled={!!editingEvent.date_only}
                  />
                </div>
              </div>

              {/* 하루 종일 옵션 */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="date_only"
                  checked={editingEvent.date_only || false}
                  onCheckedChange={(checked) => {
                    const isAllDay = checked as boolean;
                    if (isAllDay) {
                      // 하루 종일 선택시 시간을 00:00부터 23:59로 설정
                      setStartTime('00:00');
                      setEndTime('23:59');
                    }
                    setEditingEvent(prev => prev ? { ...prev, date_only: isAllDay } : null);
                  }}
                />
                <Label htmlFor="date_only" className="text-sm font-normal">
                  하루 종일
                </Label>
              </div>

              {editingEvent.kind === 'schedule' && (
                <NoClassDayField value={noClass} onChange={setNoClass} idPrefix="edit-no-class" />
              )}

              {/* 서류 제출 특별 옵션 */}
              {editingEvent.kind === 'document_submission' && (
                <Card className="bg-blue-50 border-blue-200">
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

                    {/* 서류 제출 대상자 설정 */}
                    <div className="space-y-2">
                      <Label className="flex items-center text-sm text-blue-700">
                        <Users className="mr-2 h-4 w-4" />
                        서류 제출 대상자 (여러명 선택 가능)
                      </Label>
                      <SearchableMultiSelect
                        filterByTeacher={true}
                        includeTagOptions={true}
                        selectedValues={editingEvent.assignee || []}
                        onSelectionChange={(values) => setEditingEvent(prev => prev ? { ...prev, assignee: values } : null)}
                        placeholder="서류를 제출해야 할 대상자를 선택하세요"
                        searchPlaceholder="이름을 입력하세요 (쉼표로 구분하여 여러명 입력 가능)"
                      />
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

              {/* 설명 */}
              <div className="space-y-2">
                <Label htmlFor="description">설명 (선택)</Label>
                <Textarea
                  id="description"
                  value={editingEvent.description || ''}
                  onChange={(e) => setEditingEvent(prev => prev ? { ...prev, description: e.target.value } : null)}
                  placeholder="일정에 대한 상세 설명을 입력하세요"
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
                      const plugin = availablePlugins.find((p: any) => p.id === pluginId);
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
                                .filter((p: any) => !selectedPlugins.includes(p.id) || p.id === pluginId)
                                .map((plugin: any) => (
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
              <div className="space-y-4">
                <label className="text-sm font-medium">파일 첨부 (선택)</label>

                {/* 기존 첨부된 파일 목록 - 삭제 예정이 아닌 파일만 표시 */}
                {event && existingFiles.filter(f => !filesToDelete.includes(f.id)).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-gray-700">기존 첨부 파일</h4>
                    {loadingFiles ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                        파일 목록 로드 중...
                      </div>
                    ) : (
                      <EnhancedFileList
                        documents={existingFiles
                          .filter(file => !filesToDelete.includes(file.id))
                          .map(file => ({
                            id: file.id,
                            file_name: file.title || file.file_name,
                            file_type: file.file_type || 'unknown',
                            file_size: file.file_size || 0,
                            upload_status: 'completed',
                            storage_path: file.storage_path || '',
                            created_at: file.created_at,
                            updated_at: file.created_at,
                            user_id: file.user_id || '',
                            title: file.title || file.file_name,
                            meta: {}
                          }))}
                        loading={false}
                        onDownload={async (doc) => {
                          const file = existingFiles.find(f => f.id === doc.id);
                          if (file && file.storage_path) {
                            const url = await getFilePublicUrl(file.storage_path);
                            window.open(url, '_blank');
                          }
                        }}
                        onDelete={async (id) => {
                          handleDeleteExistingFile(id);
                        }}
                        onUpdate={async () => { }}
                        enableRename={false}
                        enableDelete={true}
                        enableBulkActions={false}
                        enableSearch={false}
                        enableViewModeToggle={false}
                        showBreadcrumb={false}
                        showBadges={false}
                        showFileSize={true}
                        showModifiedDate={true}
                        showDirectoryColumn={false}
                        compactMode={true}
                        maxHeight="300px"
                        defaultViewMode="list"
                        emptyStateMessage="첨부파일이 없습니다."
                      />
                    )}
                  </div>
                )}

                {/* 삭제 예정 파일 목록 */}
                {filesToDelete.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-red-700">삭제 예정 파일</h4>
                      <Badge variant="destructive">{filesToDelete.length}개</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      저장 버튼을 누르면 아래 파일들이 삭제됩니다.
                    </p>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {existingFiles
                        .filter(file => filesToDelete.includes(file.id))
                        .map((file) => (
                          <Card key={file.id} className="border-red-200 bg-red-50">
                            <CardContent className="p-3">
                              <div className="flex items-center gap-3">
                                {/* 파일 아이콘 */}
                                <div className="flex-shrink-0">
                                  <div className="w-12 h-12 rounded bg-red-100 flex items-center justify-center">
                                    <File className="h-5 w-5 text-red-500" />
                                  </div>
                                </div>

                                {/* 파일 정보 */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate" title={file.file_name}>
                                    {file.file_name}
                                  </p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Badge variant="destructive" className="text-xs">삭제 예정</Badge>
                                  </div>
                                </div>

                                {/* 취소 버튼 */}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCancelDelete(file.id)}
                                  className="flex-shrink-0"
                                >
                                  <RotateCcw className="h-4 w-4 mr-1" />
                                  취소
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  </div>
                )}

                {/* 새 파일 추가 */}
                <div className="space-y-2">
                  <CombinedFileUpload
                    localFiles={attachedFiles}
                    onLocalFilesChange={setAttachedFiles}
                    googleDriveFiles={googleDriveFiles}
                    onGoogleDriveFilesChange={setGoogleDriveFiles}
                    maxFileSize={5 * 1024 * 1024}
                    maxFiles={10}
                    showGoogleDrive={true}
                  />
                </div>

                {/* 업로드 중 표시 */}
                {uploading && (
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    파일 업로드 중...
                  </div>
                )}
              </div>
            </>
          )}

          {/* 일괄 생성 모드 */}
          {!event && creationMode === 'batch' && (
            <>
              {/* 제목 */}
              <div className="space-y-2">
                <Label htmlFor="batchTitle">제목</Label>
                <Input
                  id="batchTitle"
                  value={batchTitle}
                  onChange={(e) => setBatchTitle(e.target.value)}
                  placeholder="일괄 업무 일정 제목을 입력하세요"
                />
              </div>

              {/* CSV 파일 업로드 */}
              <div className="space-y-2">
                <Label htmlFor="csvFile">CSV 파일</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  <input
                    id="csvFile"
                    type="file"
                    accept=".csv"
                    onChange={handleCsvFileChange}
                    className="hidden"
                  />
                  <Label htmlFor="csvFile" className="cursor-pointer">
                    <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600">
                      {csvFile ? csvFile.name : 'CSV 파일을 선택하세요'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      형식: 담당자, 근무일, 시작시간, 종료시간, 근무내용, 비고
                    </p>
                  </Label>
                </div>
              </div>

              {/* 파싱된 데이터 미리보기 */}
              {parsedDuties.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">미리보기 ({parsedDuties.length}건)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-40 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-1">담당자</th>
                            <th className="text-left p-1">근무일</th>
                            <th className="text-left p-1">시간</th>
                            <th className="text-left p-1">내용</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedDuties.map((duty, index) => (
                            <tr key={index} className="border-b">
                              <td className="p-1">{duty.담당자}</td>
                              <td className="p-1">{duty.근무일}</td>
                              <td className="p-1">{duty.시작시간}-{duty.종료시간}</td>
                              <td className="p-1">{duty.근무내용}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 상세 설명 (선택) */}
              <div className="space-y-2">
                <Label htmlFor="batchDescription">상세 설명 (선택)</Label>
                <Textarea
                  id="batchDescription"
                  value={batchDescription}
                  onChange={(e) => setBatchDescription(e.target.value)}
                  placeholder="일괄 근무 일정에 대한 상세 설명을 입력하세요"
                  rows={3}
                />
              </div>

              {/* 파일 첫부 (선택) */}
              <div className="space-y-2">
                <Label>파일 첫부 (선택)</Label>
                <div className="space-y-2">
                  <input
                    type="file"
                    multiple
                    onChange={handleBatchFilesChange}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {batchFiles.length > 0 && (
                    <div className="space-y-1">
                      {batchFiles.map((file, index) => (
                        <div key={index} className="flex min-w-0 items-center justify-between gap-2 rounded bg-gray-50 p-2">
                          <span className="min-w-0 flex-1 truncate text-sm" title={file.name}>
                            {file.name}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="shrink-0"
                            onClick={() => removeBatchFile(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* 버튼 */}
          <DialogFooter className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting || uploading}
              className="flex items-center gap-1"
            >
              <X className="h-4 w-4" />
              취소
            </Button>

            {/* 단일 생성 버튼 */}
            {(event || creationMode === 'single') && (
              <Button
                onClick={handleSave}
                disabled={isSubmitting || uploading || !editingEvent?.title.trim()}
                className="flex items-center gap-1"
              >
                <Save className="h-4 w-4" />
                {isSubmitting ? '저장 중...' :
                  uploading ? '파일 업로드 중...' : '저장'}
              </Button>
            )}

            {/* 일괄 생성 버튼 */}
            {!event && creationMode === 'batch' && (
              <Button
                onClick={handleBatchCreate}
                disabled={isSubmitting || !batchTitle.trim() || parsedDuties.length === 0}
                className="flex items-center gap-1"
              >
                <Save className="h-4 w-4" />
                {isSubmitting ? '생성 중...' : `일괄 생성 (${parsedDuties.length}건)`}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};