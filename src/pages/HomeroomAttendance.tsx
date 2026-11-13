import { useAuth } from '@/components/auth/AuthProvider';
import { Layout } from '@/components/layout/Layout';
import { HomeroomAttendanceHeader } from '@/components/attendance/homeroom/HomeroomAttendanceHeader';
import { HomeroomAttendanceGrid } from '@/components/attendance/homeroom/HomeroomAttendanceGrid';
import { useAttendance } from '@/hooks/useAttendance';

export default function HomeroomAttendance() {
  const { user } = useAuth();
  const attendanceData = useAttendance('homeroom');

  return (
    <Layout>
      <div className="space-y-6">
        <HomeroomAttendanceHeader
          session={attendanceData.currentSession}
          loading={attendanceData.loading}
          saving={attendanceData.saving}
          onRefresh={attendanceData.refetch}
        />
        
        <HomeroomAttendanceGrid
          students={attendanceData.students}
          selectedStudents={attendanceData.selectedStudents}
          searchQuery={attendanceData.searchQuery}
          filterStatus={attendanceData.filterStatus}
          saving={attendanceData.saving}
          onUpdateAttendance={attendanceData.updateAttendance}
          onBulkUpdate={attendanceData.bulkUpdateAttendance}
          onToggleSelection={attendanceData.toggleStudentSelection}
          onSelectAll={attendanceData.selectAllStudents}
          onClearSelection={attendanceData.clearSelection}
          onSearchChange={attendanceData.setSearchQuery}
          onFilterChange={attendanceData.setFilterStatus}
        />
      </div>
    </Layout>
  );
}