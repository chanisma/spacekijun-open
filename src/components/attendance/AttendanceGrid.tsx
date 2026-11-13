import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { StudentInfo } from '@/hooks/useAttendance';
import { StudentCard } from './StudentCard';
import { 
  Search, 
  Filter,
  CheckCircle, 
  XCircle, 
  Clock,
  Home,
  Heart,
  Phone,
  AlertTriangle,
  MessageSquare,
  Edit,
  Users,
  Check,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttendanceGridProps {
  students: StudentInfo[];
  selectedStudents: string[];
  searchQuery: string;
  filterStatus: string;
  saving: boolean;
  onUpdateAttendance: (
    studentId: string, 
    status: StudentInfo['status'], 
    notes?: string,
    healthStatus?: StudentInfo['health_status'],
    parentContacted?: boolean
  ) => void;
  onBulkUpdate: (studentIds: string[], status: StudentInfo['status']) => void;
  onToggleSelection: (studentId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSearchChange: (query: string) => void;
  onFilterChange: (status: string) => void;
}

interface StudentDetailDialogProps {
  student: StudentInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateAttendance: (
    studentId: string, 
    status: StudentInfo['status'], 
    notes?: string,
    healthStatus?: StudentInfo['health_status'],
    parentContacted?: boolean
  ) => void;
}

const StudentDetailDialog: React.FC<StudentDetailDialogProps> = ({
  student,
  open,
  onOpenChange,
  onUpdateAttendance
}) => {
  const [status, setStatus] = useState<StudentInfo['status']>(student?.status || 'present');
  const [notes, setNotes] = useState(student?.notes || '');
  const [healthStatus, setHealthStatus] = useState<StudentInfo['health_status']>(student?.health_status || 'normal');
  const [parentContacted, setParentContacted] = useState(student?.parent_contacted || false);

  const handleSave = () => {
    if (student) {
      onUpdateAttendance(student.id, status, notes, healthStatus, parentContacted);
      onOpenChange(false);
    }
  };

  if (!student) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            {student.name} ({student.student_number}번) 출석 관리
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* 출석 상태 */}
          <div>
            <Label htmlFor="status">출석 상태</Label>
            <Select value={status} onValueChange={(value: StudentInfo['status']) => setStatus(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="present">출석</SelectItem>
                <SelectItem value="absent">결석</SelectItem>
                <SelectItem value="late">지각</SelectItem>
                <SelectItem value="early_leave">조퇴</SelectItem>
                <SelectItem value="sick_leave">병가</SelectItem>
                <SelectItem value="excused">공결</SelectItem>
                <SelectItem value="counseling_request">상담 요청</SelectItem>
              </SelectContent>
            </Select>
          </div>


          {/* 건강 상태 */}
          <div>
            <Label htmlFor="health_status">건강 상태</Label>
            <Select value={healthStatus} onValueChange={(value: StudentInfo['health_status']) => setHealthStatus(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">정상</SelectItem>
                <SelectItem value="fever">발열</SelectItem>
                <SelectItem value="sick">아프</SelectItem>
                <SelectItem value="injured">부상</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 학부모 연락 */}
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="parent_contacted" 
              checked={parentContacted}
              onCheckedChange={(checked) => setParentContacted(!!checked)}
            />
            <label 
              htmlFor="parent_contacted" 
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              학부모 연락 완료
            </label>
          </div>

          {/* 특이사항 */}
          <div>
            <Label htmlFor="notes">특이사항</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="특이사항이나 메모를 입력하세요"
              rows={3}
            />
          </div>

          {/* 버튼 */}
          <DialogFooter className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button onClick={handleSave}>
              저장
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const AttendanceGrid: React.FC<AttendanceGridProps> = ({
  students,
  selectedStudents,
  searchQuery,
  filterStatus,
  saving,
  onUpdateAttendance,
  onBulkUpdate,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onSearchChange,
  onFilterChange
}) => {
  const [selectedStudent, setSelectedStudent] = useState<StudentInfo | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

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

  const handleQuickStatus = (studentId: string, status: StudentInfo['status']) => {
    onUpdateAttendance(studentId, status);
  };

  const handleStudentClick = (student: StudentInfo) => {
    setSelectedStudent(student);
    setDetailDialogOpen(true);
  };

  const bulkStatusOptions = [
    { value: 'present', label: '출석', icon: CheckCircle, color: 'text-green-600' },
    { value: 'absent', label: '결석', icon: XCircle, color: 'text-red-600' },
    { value: 'late', label: '지각', icon: Clock, color: 'text-yellow-600' }
  ];

  return (
    <div className="space-y-6">
      {/* 검색 및 필터 */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              학생 목록 ({students.length}명)
            </CardTitle>
            
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="이름 또는 번호로 검색"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="pl-10 w-full sm:w-64"
                />
              </div>
              
              <Select value={filterStatus} onValueChange={onFilterChange}>
                <SelectTrigger className="w-full sm:w-32">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="present">출석</SelectItem>
                  <SelectItem value="absent">결석</SelectItem>
                  <SelectItem value="late">지각</SelectItem>
                  <SelectItem value="early_leave">조퇴</SelectItem>
                  <SelectItem value="sick_leave">병가</SelectItem>
                  <SelectItem value="excused">공결</SelectItem>
                  <SelectItem value="counseling_request">상담요청</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        
        {/* 일괄 처리 */}
        {selectedStudents.length > 0 && (
          <CardContent className="pt-0">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {selectedStudents.length}명 선택됨
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    일괄 처리할 상태를 선택하세요
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  {bulkStatusOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <Button
                        key={option.value}
                        variant="outline"
                        size="sm"
                        className={cn("gap-1", option.color)}
                        onClick={() => onBulkUpdate(selectedStudents, option.value as StudentInfo['status'])}
                        disabled={saving}
                      >
                        <Icon className="h-3 w-3" />
                        {option.label}
                      </Button>
                    );
                  })}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearSelection}
                  >
                    <X className="h-3 w-3 mr-1" />
                    취소
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* 학생 그리드 - 모바일에서 2열, 데스크톱에서 4열 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
        {students.map((student) => {
          const isSelected = selectedStudents.includes(student.id);
          
          return (
            <StudentCard
              key={student.id}
              student={student}
              isSelected={isSelected}
              saving={saving}
              onToggleSelection={onToggleSelection}
              onUpdateAttendance={handleQuickStatus}
              onEdit={handleStudentClick}
            />
          );
        })}
      </div>

      {/* 빈 상태 */}
      {students.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">검색 결과가 없습니다</h3>
            <p className="text-sm text-muted-foreground">
              다른 검색어나 필터를 시도해보세요.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 상세 정보 다이얼로그 */}
      <StudentDetailDialog
        student={selectedStudent}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onUpdateAttendance={onUpdateAttendance}
      />

      {/* 전체 선택 플로팅 버튼 */}
      {students.length > 0 && selectedStudents.length === 0 && (
        <div className="fixed bottom-6 right-6">
          <Button
            size="lg"
            className="rounded-full shadow-lg"
            onClick={onSelectAll}
          >
            <Check className="h-5 w-5 mr-2" />
            전체 선택
          </Button>
        </div>
      )}
    </div>
  );
};