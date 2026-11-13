import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Send, Calendar, CheckCircle2, AlertCircle, LogIn } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { getGoogleCalendarService } from '@/services/googleCalendarService';
import type { MeetingData } from '@/services/googleCalendarService';

interface GoogleCalendarDirectExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetings: MeetingData[];
}

interface EventTypes {
  schedule: boolean;
  event: boolean;
  duty: boolean;
  training: boolean;
  document_submission: boolean;
  personal: boolean;
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
];

export const GoogleCalendarDirectExportDialog = ({
  open,
  onOpenChange,
  meetings,
}: GoogleCalendarDirectExportDialogProps) => {
  const [calendarName, setCalendarName] = useState('Spacekijun 스케줄');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{
    success: number;
    failed: number;
    message?: string;
  } | null>(null);

  // Date range selection
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return date;
  });
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  // Event type selection
  const [eventTypes, setEventTypes] = useState<EventTypes>({
    schedule: true,
    event: true,
    duty: true,
    training: true,
    document_submission: true,
    personal: true,
  });

  const calendarService = getGoogleCalendarService();

  const handleEventTypeChange = (type: keyof EventTypes) => {
    setEventTypes(prev => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const selectedCount = Object.values(eventTypes).filter(Boolean).length;

  // Filter meetings based on date range and event types
  const filteredMeetings = meetings.filter(meeting => {
    // Date filter
    const meetingDate = new Date(meeting.starts_at);
    const startOfDay = new Date(startDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);

    if (meetingDate < startOfDay || meetingDate > endOfDay) {
      return false;
    }

    // Event type filter
    const kind = meeting.kind as keyof EventTypes;
    if (eventTypes[kind] === undefined) {
      return false;
    }

    return eventTypes[kind];
  });

  const checkAuth = async () => {
    try {
      await calendarService.initialize();
      const authenticated = await calendarService.isAuthenticated();
      setIsAuthenticated(authenticated);

      // If authenticated, validate token
      if (authenticated) {
        try {
          await calendarService.signIn(); // This will trigger token validation
        } catch (error: any) {
          // Token validation will automatically trigger 'google-auth-expired' event
          console.log('🔐 Token check failed, re-authentication required');
        }
      }
    } catch (error) {
      console.error('Failed to initialize calendar service:', error);
    }
  };

  // Check auth when dialog opens
  useEffect(() => {
    if (open) {
      checkAuth();
    }
  }, [open]);

  const handleMyAccountLogin = async () => {
    setIsAuthenticating(true);
    try {
      await calendarService.signIn();
      setIsAuthenticated(true);
    } catch (error: any) {
      console.error('Authentication failed:', error);
      setExportResult({
        success: 0,
        failed: 0,
        message: `인증 실패: ${error.message || '알 수 없는 오류'}`
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleExport = async () => {
    if (!calendarName.trim()) {
      setExportResult({
        success: 0,
        failed: 0,
        message: '캘린더 이름을 입력해주세요.'
      });
      return;
    }

    if (filteredMeetings.length === 0) {
      setExportResult({
        success: 0,
        failed: 0,
        message: '선택한 조건에 맞는 일정이 없습니다.'
      });
      return;
    }

    setIsExporting(true);
    setExportResult(null);

    try {
      // Use current authenticated account
      const result = await calendarService.createEventsFromMeetings(
        calendarName.trim(),
        filteredMeetings
      );

      setExportResult({
        success: result.success.length,
        failed: result.failed.length,
        message: result.failed.length > 0
          ? `일부 일정 전송 실패 (${result.failed.length}개)`
          : '모든 일정이 성공적으로 전송되었습니다!'
      });
    } catch (error: any) {
      console.error('Export failed:', error);
      setExportResult({
        success: 0,
        failed: filteredMeetings.length,
        message: error.message || '일정 전송에 실패했습니다.'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    setExportResult(null);
    onOpenChange(false);
  };

  const canExport = calendarName.trim() && startDate && endDate && selectedCount > 0 && filteredMeetings.length > 0 && isAuthenticated;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Google Calendar로 직접 전송
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Date Range Selection */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">기간 선택</Label>
              <p className="text-xs text-muted-foreground mt-1">
                전송할 일정의 기간을 선택하세요
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
                      disabled={isExporting}
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
                      disabled={isExporting}
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
              <Label className="text-sm font-medium">전송할 일정 종류</Label>
              <p className="text-xs text-muted-foreground mt-1">
                전송할 일정의 종류를 선택하세요 ({selectedCount}개 선택됨)
              </p>
            </div>

            <div className="space-y-3">
              {EVENT_TYPE_CONFIG.map((config) => (
                <div key={config.key} className="flex items-center space-x-3">
                  <Checkbox
                    id={config.key}
                    checked={eventTypes[config.key]}
                    onCheckedChange={() => handleEventTypeChange(config.key)}
                    disabled={isExporting}
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

          <Separator />

          {/* Calendar Name Input */}
          <div className="space-y-2">
            <Label htmlFor="calendar-name" className="text-sm font-medium">
              캘린더 이름
            </Label>
            <Input
              id="calendar-name"
              value={calendarName}
              onChange={(e) => setCalendarName(e.target.value)}
              placeholder="예: Spacekijun 스케줄"
              disabled={isExporting}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Google Calendar에서 "Other calendars"에 생성될 캘린더 이름입니다.
            </p>
          </div>

          <Separator />

          {/* Authentication Status */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Google 인증</Label>
            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-600">인증 완료</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <span className="text-sm text-orange-600">인증 필요</span>
                </>
              )}
            </div>
            {!isAuthenticated && (
              <Button
                onClick={handleMyAccountLogin}
                disabled={isAuthenticating}
                variant="outline"
                size="sm"
                className="w-full mt-2"
              >
                {isAuthenticating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mr-2" />
                    인증 중...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" />
                    Google Calendar 로그인
                  </>
                )}
              </Button>
            )}
          </div>

          <Separator />

          {/* Export Info */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-start space-x-2">
              <Calendar className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-900">전송 정보</p>
                <ul className="text-blue-700 mt-2 space-y-1">
                  <li>• 선택된 일정: {filteredMeetings.length}개</li>
                  <li>• 캘린더가 없으면 자동으로 생성됩니다</li>
                  <li>• 동일한 이름의 캘린더가 있으면 해당 캘린더에 추가됩니다</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Export Result */}
          {exportResult && (
            <Alert variant={exportResult.success > 0 ? 'default' : 'destructive'}>
              <AlertDescription>
                <div className="space-y-1">
                  <div className="font-medium">{exportResult.message}</div>
                  {exportResult.success > 0 && (
                    <div className="text-sm">
                      성공: {exportResult.success}개
                      {exportResult.failed > 0 && ` / 실패: ${exportResult.failed}개`}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Setup Requirements Warning */}
          {!isAuthenticated && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="text-sm space-y-2">
                  <p className="font-medium">Google Cloud Console 설정이 필요합니다:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Google Calendar API 활성화</li>
                    <li>OAuth 동의 화면에서 Calendar 권한 추가</li>
                    <li>로그인 시 Calendar 권한 승인</li>
                  </ol>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={handleClose} disabled={isExporting}>
            {exportResult ? '닫기' : '취소'}
          </Button>
          <Button
            onClick={handleExport}
            disabled={!canExport || isExporting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                전송 중...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                캘린더로 전송 ({filteredMeetings.length}개)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
