import React, { useState } from 'react';
import { AttendanceHeader } from './AttendanceHeader';
import { AttendanceGrid } from './AttendanceGrid';
import { useAttendance } from '@/hooks/useAttendance';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface AttendanceViewProps {
  sessionId?: string;
  attendanceType?: 'homeroom' | 'class';
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({ sessionId, attendanceType = 'class' }) => {
  const { toast } = useToast();
  const {
    currentSession,
    students,
    selectedStudents,
    filterStatus,
    searchQuery,
    loading,
    saving,
    updateAttendance,
    bulkUpdateAttendance,
    toggleStudentSelection,
    selectAllStudents,
    clearSelection,
    setFilterStatus,
    setSearchQuery,
    refetch
  } = useAttendance(sessionId, attendanceType);

  const handleExport = () => {
    if (!currentSession) return;
    
    // CSV 데이터 생성
    const headers = ['번호', '이름', '출석', '특이사항', '건강상태', '학부모연락', '기록시간'];
    const csvData = students.map(student => [
      student.student_number,
      student.name,
      getStatusLabel(student.status),
      student.notes || '',
      student.health_status || '정상',
      student.parent_contacted ? '완료' : '미완료',
      student.recorded_at ? new Date(student.recorded_at).toLocaleString('ko-KR') : ''
    ]);
    
    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');
    
    // 파일 다운로드
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `출석부_${currentSession.meeting_data.subject}_${currentSession.date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: '내보내기 완료',
      description: '출석부가 CSV 파일로 다운로드되었습니다.',
    });
  };

  const handleViewStats = () => {
    toast({
      title: '통계 기능',
      description: '통계 기능은 곧 추가될 예정입니다.',
    });
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      'present': '출석',
      'absent': '결석',
      'late': '지각',
      'early_leave': '조퇴',
      'sick_leave': '병가',
      'excused': '공결',
      'counseling_request': '상담요청'
    };
    return statusMap[status] || status;
  };

  if (loading && !currentSession) {
    return (
      <div className="space-y-6">
        {/* 헤더 스켈레톤 */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-6 w-6" />
              <div>
                <Skeleton className="h-8 w-64 mb-2" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </Card>
        
        {/* 검색 및 필터 스켈레톤 */}
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <Skeleton className="h-6 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
        </Card>
        
        {/* 그리드 스켈레톤 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4" />
                    <div>
                      <Skeleton className="h-4 w-16 mb-1" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-4" />
                </div>
                <Skeleton className="h-8 w-full" />
                <div className="flex gap-1">
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AttendanceHeader
        session={currentSession}
        loading={loading}
        saving={saving}
        onRefresh={refetch}
        onExport={handleExport}
        onViewStats={handleViewStats}
      />
      
      {currentSession && (
        <AttendanceGrid
          students={students}
          selectedStudents={selectedStudents}
          searchQuery={searchQuery}
          filterStatus={filterStatus}
          saving={saving}
          onUpdateAttendance={updateAttendance}
          onBulkUpdate={bulkUpdateAttendance}
          onToggleSelection={toggleStudentSelection}
          onSelectAll={selectAllStudents}
          onClearSelection={clearSelection}
          onSearchChange={setSearchQuery}
          onFilterChange={setFilterStatus}
        />
      )}
    </div>
  );
};