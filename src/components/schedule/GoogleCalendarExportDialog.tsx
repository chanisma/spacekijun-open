import { useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Calendar, Download, Globe, X, User, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface GoogleCalendarExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (options: ExportOptions) => void;
  loading?: boolean;
}

export interface ExportOptions {
  startDate: Date;
  endDate: Date;
  eventTypes: {
    schedule: boolean;      // 학사일정 (always available)
    event: boolean;         // 행사 (always available)
    duty: boolean;          // 근무 (user-related only)
    training: boolean;      // 연수 (user-related only)
    document_submission: boolean; // 서류제출 (user-related only)
    personal: boolean;      // 개인일정 (user-related only)
    task: boolean;          // 업무 (user-related only)
  };
}

const EVENT_TYPE_CONFIG = [
  {
    key: 'schedule' as const,
    label: '학사일정',
    description: 'NEIS 학사일정',
    color: 'bg-green-500',
    userRelatedOnly: false,
  },
  {
    key: 'event' as const,
    label: '출장',
    description: '출장',
    color: 'bg-purple-500',
    userRelatedOnly: false,
  },
  {
    key: 'duty' as const,
    label: '업무',
    description: '업무 배정',
    color: 'bg-orange-500',
    userRelatedOnly: true,
  },
  {
    key: 'training' as const,
    label: '연수',
    description: '연수 및 교육',
    color: 'bg-pink-500',
    userRelatedOnly: true,
  },
  {
    key: 'document_submission' as const,
    label: '서류제출',
    description: '서류 제출 마감일',
    color: 'bg-blue-500',
    userRelatedOnly: true,
  },
  {
    key: 'personal' as const,
    label: '개인일정',
    description: '개인적인 일정',
    color: 'bg-indigo-500',
    userRelatedOnly: true,
  },
  {
    // duty가 '업무'로 통일되며 라벨이 겹치지 않게 task는 '업무 마감'으로 구분
    key: 'task' as const,
    label: '업무 마감',
    description: '업무 마감일',
    color: 'bg-yellow-500',
    userRelatedOnly: true,
  },
];

export const GoogleCalendarExportDialog = ({
  open,
  onOpenChange,
  onExport,
  loading = false,
}: GoogleCalendarExportDialogProps) => {
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return date;
  });

  const [eventTypes, setEventTypes] = useState<ExportOptions['eventTypes']>({
    schedule: true,
    event: true,
    duty: true,
    training: true,
    document_submission: true,
    personal: true,
    task: true,
  });

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  const handleEventTypeChange = (type: keyof ExportOptions['eventTypes']) => {
    setEventTypes(prev => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const handleExport = () => {
    if (startDate && endDate) {
      onExport({
        startDate,
        endDate,
        eventTypes,
      });
    }
  };

  const selectedCount = Object.values(eventTypes).filter(Boolean).length;
  const canExport = startDate && endDate && selectedCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Google Calendar로 일정 내보내기
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Date Range Selection */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">기간 선택</Label>
              <p className="text-xs text-muted-foreground mt-1">
                내보낼 일정의 기간을 선택하세요
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Start Date */}
              <div className="space-y-2">
                <Label className="text-sm">시작일</Label>
                <Popover open={showStartDatePicker} onOpenChange={setShowStartDatePicker}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, 'yyyy년 M월 d일', { locale: ko }) : '날짜 선택'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => {
                        if (date) {
                          setStartDate(date);
                          setShowStartDatePicker(false);
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label className="text-sm">종료일</Label>
                <Popover open={showEndDatePicker} onOpenChange={setShowEndDatePicker}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, 'yyyy년 M월 d일', { locale: ko }) : '날짜 선택'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={endDate}
                      onSelect={(date) => {
                        if (date) {
                          setEndDate(date);
                          setShowEndDatePicker(false);
                        }
                      }}
                      disabled={(date) => startDate && date < startDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <Separator />

          {/* Event Type Selection */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">내보낼 일정 종류</Label>
              <p className="text-xs text-muted-foreground mt-1">
                내보낼 일정의 종류를 선택하세요 ({selectedCount}개 선택됨)
              </p>
            </div>

            <div className="space-y-3">
              {EVENT_TYPE_CONFIG.map((config) => (
                <div key={config.key} className="flex items-center space-x-3">
                  <Checkbox
                    id={config.key}
                    checked={eventTypes[config.key]}
                    onCheckedChange={() => handleEventTypeChange(config.key)}
                  />
                  <div className="flex items-center space-x-3 flex-1">
                    <div className={`w-3 h-3 rounded ${config.color}`} />
                    <div className="flex-1">
                      <Label htmlFor={config.key} className="text-sm font-medium cursor-pointer">
                        {config.label}
                      </Label>
                      <div className="text-xs text-muted-foreground">
                        {config.description}
                        {config.userRelatedOnly && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            관련 일정만
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Export Info */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-start space-x-2">
              <Globe className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-900">내보내기 정보</p>
                <ul className="text-blue-700 mt-2 space-y-1">
                  <li>• 학사일정과 출장은 모든 일정이 내보내집니다</li>
                  <li>• 나머지 일정은 본인과 관련된 일정만 내보내집니다</li>
                  <li>• 생성된 파일을 Google Calendar에서 가져오기하세요</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={handleExport}
            disabled={!canExport || loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                내보내는 중...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                .ics 파일 다운로드
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};