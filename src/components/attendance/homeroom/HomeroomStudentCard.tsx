import React, { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { StudentInfo } from '@/hooks/useAttendance';
import { 
  CheckCircle, 
  XCircle, 
  Clock,
  Home,
  Heart,
  Phone,
  AlertTriangle,
  MessageSquare,
  Edit,
  Check,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface HomeroomStudentCardProps {
  student: StudentInfo;
  isSelected: boolean;
  saving: boolean;
  onToggleSelection: (studentId: string) => void;
  onUpdateAttendance: (studentId: string, status: StudentInfo['status']) => void;
  onEdit: (student: StudentInfo) => void;
}

export const HomeroomStudentCard: React.FC<HomeroomStudentCardProps> = ({
  student,
  isSelected,
  saving,
  onToggleSelection,
  onUpdateAttendance,
  onEdit
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [startX, setStartX] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const getStatusInfo = (status: StudentInfo['status']) => {
    switch (status) {
      case 'present':
        return { icon: CheckCircle, color: 'text-green-600 bg-green-100', label: '출석' };
      case 'absent':
        return { icon: XCircle, color: 'text-red-600 bg-red-100', label: '결석' };
      case 'late':
        return { icon: Clock, color: 'text-yellow-600 bg-yellow-100', label: '지각' };
      case 'early_leave':
        return { icon: Home, color: 'text-blue-600 bg-blue-100', label: '조퇴' };
      case 'sick_leave':
        return { icon: Heart, color: 'text-pink-600 bg-pink-100', label: '병가' };
      case 'excused':
        return { icon: Check, color: 'text-purple-600 bg-purple-100', label: '공결' };
      case 'counseling_request':
        return { icon: MessageSquare, color: 'text-orange-600 bg-orange-100', label: '상담요청' };
      default:
        return { icon: AlertTriangle, color: 'text-gray-600 bg-gray-100', label: '미정' };
    }
  };

  const statusInfo = getStatusInfo(student.status);
  const StatusIcon = statusInfo.icon;

  // 터치/마우스 이벤트 핸들러
  const handleStart = (clientX: number) => {
    setIsDragging(true);
    setStartX(clientX);
    setDragOffset(0);
  };

  const handleMove = (clientX: number) => {
    if (!isDragging) return;
    
    const deltaX = clientX - startX;
    const maxOffset = 100; // 최대 드래그 거리
    const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, deltaX));
    setDragOffset(clampedOffset);
  };

  const handleEnd = () => {
    if (!isDragging) return;
    
    const threshold = 50; // 스와이프 임계값
    
    if (dragOffset > threshold) {
      // 오른쪽 스와이프 - 출석
      onUpdateAttendance(student.id, 'present');
    } else if (dragOffset < -threshold) {
      // 왼쪽 스와이프 - 결석
      onUpdateAttendance(student.id, 'absent');
    }
    
    setIsDragging(false);
    setDragOffset(0);
  };

  // 마우스 이벤트
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleMove(e.clientX);
  };

  const handleMouseUp = () => {
    handleEnd();
  };

  // 터치 이벤트
  const handleTouchStart = (e: React.TouchEvent) => {
    handleStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    handleEnd();
  };

  // 스와이프 힌트 색상
  const getSwipeHintColor = () => {
    if (dragOffset > 25) return 'bg-green-100 border-green-200';
    if (dragOffset < -25) return 'bg-red-100 border-red-200';
    return '';
  };

  return (
    <div className="relative">
      {/* 스와이프 백그라운드 힌트 */}
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-between p-4 rounded-lg bg-gray-100 z-0">
          <div className={cn(
            "flex items-center gap-2 text-green-600 transition-opacity",
            dragOffset > 25 ? 'opacity-100' : 'opacity-50'
          )}>
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">출석</span>
          </div>
          <div className={cn(
            "flex items-center gap-2 text-red-600 transition-opacity",
            dragOffset < -25 ? 'opacity-100' : 'opacity-50'
          )}>
            <span className="font-medium">결석</span>
            <XCircle className="h-5 w-5" />
          </div>
        </div>
      )}

      {/* 메인 카드 */}
      <Card 
        ref={cardRef}
        className={cn(
          "transition-all cursor-pointer hover:shadow-md relative z-10",
          isSelected && "ring-2 ring-primary",
          isDragging && "shadow-lg",
          getSwipeHintColor()
        )}
        style={{
          transform: `translateX(${dragOffset}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={isDragging ? handleMouseMove : undefined}
        onMouseUp={isDragging ? handleMouseUp : undefined}
        onMouseLeave={isDragging ? handleMouseUp : undefined}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* 학생 기본 정보 */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleSelection(student.id)}
                  className="mt-1"
                  onClick={(e) => e.stopPropagation()}
                />
                <div>
                  <div className="font-medium">{student.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {student.student_number}번
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                {student.health_status !== 'normal' && (
                  <Heart className="h-4 w-4 text-red-500" />
                )}
                {student.parent_contacted && (
                  <Phone className="h-4 w-4 text-blue-500" />
                )}
              </div>
            </div>

            {/* 출석 상태 */}
            <div 
              className={cn(
                "flex items-center gap-2 p-2 rounded-lg",
                statusInfo.color
              )}
            >
              <StatusIcon className="h-4 w-4" />
              <span className="font-medium text-sm">{statusInfo.label}</span>
              {student.recorded_at && (
                <span className="text-xs ml-auto">
                  {new Date(student.recorded_at).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              )}
            </div>

            {/* 특이사항 */}
            {student.notes && (
              <div className="text-xs p-2 bg-gray-50 rounded text-gray-600">
                {student.notes}
              </div>
            )}

            {/* 빠른 액션 버튼들 - 담임용 4개 버튼 */}
            <div className="space-y-2">
              {/* 첫 번째 줄: 출석, 결석 */}
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-green-600 hover:text-green-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateAttendance(student.id, 'present');
                  }}
                  disabled={saving || student.status === 'present'}
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  출석
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-red-600 hover:text-red-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateAttendance(student.id, 'absent');
                  }}
                  disabled={saving || student.status === 'absent'}
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  결석
                </Button>
              </div>
              
              {/* 두 번째 줄: 조퇴, 인정 */}
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-blue-600 hover:text-blue-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateAttendance(student.id, 'early_leave');
                  }}
                  disabled={saving || student.status === 'early_leave'}
                >
                  <Home className="h-3 w-3 mr-1" />
                  조퇴
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-purple-600 hover:text-purple-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateAttendance(student.id, 'excused');
                  }}
                  disabled={saving || student.status === 'excused'}
                >
                  <Check className="h-3 w-3 mr-1" />
                  인정
                </Button>
              </div>
              
              {/* 편집 버튼 */}
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(student);
                  }}
                  disabled={saving}
                  className="px-4"
                >
                  <Edit className="h-3 w-3 mr-1" />
                  상세
                </Button>
              </div>
            </div>

            {/* 스와이프 힌트 (모바일) */}
            <div className="text-xs text-center text-muted-foreground md:hidden">
              좌우로 스와이프하여 빠른 출석 체크
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};