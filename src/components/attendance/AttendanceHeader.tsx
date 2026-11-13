import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AttendanceSession } from '@/hooks/useAttendance';
import { 
  Clock, 
  Users, 
  MapPin, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  RefreshCw,
  Download,
  BarChart3
} from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface AttendanceHeaderProps {
  session: AttendanceSession | null;
  loading: boolean;
  saving: boolean;
  onRefresh: () => void;
  onExport?: () => void;
  onViewStats?: () => void;
}

export const AttendanceHeader: React.FC<AttendanceHeaderProps> = ({
  session,
  loading,
  saving,
  onRefresh,
  onExport,
  onViewStats
}) => {
  if (!session) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">현재 진행 중인 수업이 없습니다</h3>
            <p className="text-sm">
              수업 시간에 맞춰 출석부가 자동으로 활성화됩니다.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const presentCount = session.total_students - session.attendance_count;
  const attendanceRate = session.total_students > 0 
    ? Math.round((presentCount / session.total_students) * 100)
    : 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'completed': return 'bg-blue-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return '진행 중';
      case 'completed': return '완료';
      case 'cancelled': return '취소됨';
      default: return status;
    }
  };

  return (
    <div className="space-y-4">
      {/* 메인 정보 카드 */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${getStatusColor(session.status)}`} />
                <Badge variant="secondary">
                  {getStatusLabel(session.status)}
                </Badge>
              </div>
              <div>
                <CardTitle className="text-2xl">
                  {session.meeting_data.subject} - {session.meeting_data.section_name}
                </CardTitle>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {session.period}교시 ({session.meeting_data.starts_at} - {session.meeting_data.ends_at})
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {session.meeting_data.room}
                  </div>
                  {session.meeting_data.teacher_name && (
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {session.meeting_data.teacher_name}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {saving && (
                <Badge variant="outline" className="text-blue-600">
                  저장 중...
                </Badge>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={onRefresh}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                새로고침
              </Button>
              {onViewStats && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={onViewStats}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  통계
                </Button>
              )}
              {onExport && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={onExport}
                >
                  <Download className="h-4 w-4 mr-2" />
                  내보내기
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* 전체 출석률 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">전체 출석률</span>
                <span className="text-2xl font-bold text-green-600">{attendanceRate}%</span>
              </div>
              <Progress value={attendanceRate} className="h-2" />
              <div className="text-xs text-muted-foreground">
                {session.total_students}명 중 {presentCount}명 출석
              </div>
            </div>
            
            {/* 출석 */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{presentCount}</div>
                <div className="text-sm text-muted-foreground">출석</div>
              </div>
            </div>
            
            {/* 지각 */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-yellow-100 rounded-lg">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{session.attendance_count}</div>
                <div className="text-sm text-muted-foreground">출석 외</div>
              </div>
            </div>
            
            {/* 기록된 수 */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
                <AlertCircle className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{session.attendance_count}</div>
                <div className="text-sm text-muted-foreground">기록됨</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* 빠른 정보 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">수업 날짜</span>
            </div>
            <div className="text-lg font-medium mt-1">
              {format(new Date(session.date), 'yyyy년 M월 d일 EEEE', { locale: ko })}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">학급 정보</span>
            </div>
            <div className="text-lg font-medium mt-1">
              {session.meeting_data.grade}학년 {session.meeting_data.section_name}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">마지막 업데이트</span>
            </div>
            <div className="text-lg font-medium mt-1">
              {format(new Date(session.updated_at), 'HH:mm:ss', { locale: ko })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};