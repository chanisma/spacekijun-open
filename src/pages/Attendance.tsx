import React from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Layout } from '@/components/layout/Layout';
import { AttendanceView } from '@/components/attendance/AttendanceView';

const Attendance = () => {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>  
    );
  }

  return (
    <Layout>
      <div className="space-y-6">

        <AttendanceView attendanceType="class" />
      </div>
    </Layout>
  );
};

export default Attendance;