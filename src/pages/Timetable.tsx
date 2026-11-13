import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { Layout } from '@/components/layout/Layout';
import { TimetableView } from '@/components/timetable/TimetableView';
import { StudentTimetableView } from '@/components/timetable/StudentTimetableView';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

const Timetable = () => {
  const { user, profile, loading: authLoading, isStudentView } = useAuth();
  const isStudent = isStudentView;
  const [searchParams] = useSearchParams();
  const [teacherResourceId, setTeacherResourceId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  // URL 쿼리 파라미터에서 teacher 이름을 읽어서 resource ID로 변환 (교사 전용)
  useEffect(() => {
    if (isStudent) return;
    const teacherName = searchParams.get('teacher');
    if (teacherName && user) {
      setLoading(true);
      (async () => {
        const { data, error } = await supabase
          .from('resource')
          .select('id')
          .eq('name', teacherName)
          .eq('type', 'teacher')
          .single();

        try {
          if (data && !error) {
            setTeacherResourceId(data.id);
          } else {
            console.warn('교사를 찾을 수 없습니다:', teacherName);
          }
        } catch (error) {
          console.error('교사 검색 오류:', error);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [searchParams, user, isStudent]);

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </Layout>
    );
  }

  // Student: show read-only class timetable
  if (isStudent) {
    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <StudentTimetableView />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 max-w-full">
        <TimetableView resourceId={teacherResourceId} />
      </div>
    </Layout>
  );
};

export default Timetable;