import React from 'react';
import { cn } from '@/lib/utils';
import { StudentDashboardData } from '@/hooks/useStudentDashboard';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Clock, GraduationCap, Users } from 'lucide-react';

interface StudentCardProps {
  student: StudentDashboardData;
  onClick?: () => void;
  isSelected?: boolean;
}

export const StudentCard: React.FC<StudentCardProps> = ({
  student,
  onClick,
  isSelected = false,
}) => {
  const initials = student.name ? student.name.slice(0, 2) : '??';

  // 출석률에 따른 색상
  const getAttendanceColor = (rate: number) => {
    if (rate >= 80) return 'text-green-600 bg-green-50';
    if (rate >= 50) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <Card
      onClick={onClick}
      className={cn(
        'cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02]',
        'glass hover:bg-white/90',
        isSelected && 'ring-2 ring-primary border-primary shadow-md'
      )}
    >
      <CardContent className="p-4">
        {/* 상단: 프로필 */}
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-12 w-12 ring-2 ring-white shadow-sm">
            <AvatarImage src={student.picture || undefined} alt={student.name} />
            <AvatarFallback className="bg-gradient-to-br from-brand-400 to-brand-600 text-white font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-foreground truncate">{student.name}</h3>
            <p className="text-xs text-muted-foreground">
              {student.grade}학년 {student.class_num}반 {student.number}번
            </p>
          </div>
        </div>

        {/* 중단: 정보 뱃지 */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {student.major && (
            <Badge variant="secondary" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
              <GraduationCap className="h-3 w-3 mr-1" />
              {student.major}
            </Badge>
          )}
          {student.career && (
            <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
              {student.career}
            </Badge>
          )}
        </div>

        {/* 하단: 통계 */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
          {/* 자습실 이용 */}
          <div className="flex items-center gap-2 text-xs">
            <div className="p-1.5 rounded-md bg-indigo-50">
              <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
            </div>
            <div>
              <p className="text-muted-foreground">자습실</p>
              <p className="font-semibold text-foreground">{student.total_reservations}회</p>
            </div>
          </div>

          {/* 출석률 */}
          <div className="flex items-center gap-2 text-xs">
            <div className={cn('p-1.5 rounded-md', getAttendanceColor(student.attendance_rate))}>
              <Clock className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-muted-foreground">출석률</p>
              <p className={cn('font-semibold', getAttendanceColor(student.attendance_rate).split(' ')[0])}>
                {student.attendance_rate}%
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StudentCard;
