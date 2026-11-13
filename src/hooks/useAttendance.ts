import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getPeriodFromDate } from '@/lib/timeUtils';
import type { ResourceMetaStudent } from '@/integrations/supabase/types';

export interface AttendanceSession {
  id: string;
  meeting_id: string;
  date: string;
  period: number;
  status: 'active' | 'completed' | 'cancelled';
  type: 'homeroom' | 'class'; // 담임 출석부 vs 수업 출석부
  meeting_data: {
    subject: string;
    section_name?: string;
    room: string;
    starts_at: string;
    ends_at: string;
    teacher_name?: string;
    grade?: number;
    class_number?: number;
  };
  total_students: number;
  attendance_count: number; // 출석이 아닌 학생 수 (실제로 기록된 수)
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  meeting_id: string;
  resource_id: string;
  period: number;
  date: string;
  status: string;
  notes?: string;
  health_status?: string;
  parent_contacted?: boolean;
  recorded_by: string;
  recorded_at: string;
}

export interface StudentInfo {
  id: string;
  name: string;
  student_number: number;
  grade: number;
  class_number?: number;
  status: 'present' | 'absent' | 'late' | 'early_leave' | 'counseling_request' | 'sick_leave' | 'excused';
  notes?: string;
  health_status?: 'normal' | 'fever' | 'sick' | 'injured';
  parent_contacted?: boolean;
  recorded_at?: string;
  recorded_by?: string;
}

export const useAttendance = (sessionId?: string, attendanceType?: 'homeroom' | 'class') => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentSession, setCurrentSession] = useState<AttendanceSession | null>(null);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchCurrentSession = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // 현재 시간 기준으로 진행 중인 수업 찾기
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      
      // timeUtils를 사용하여 현재 교시 계산
      const currentPeriod = getPeriodFromDate(now) || 0;

      if (attendanceType === 'homeroom') {
        await fetchHomeroomAttendance(today, currentPeriod);
      } else {
        await fetchClassAttendance(today, currentPeriod);
      }
    } catch (error) {
      console.error('Error fetching session:', error);
      toast({
        title: '오류',
        description: '출석 세션을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchHomeroomAttendance = async (date: string, period: number) => {
    try {
      // 사용자 프로필에서 담임반 정보 가져오기
      const { data: profile } = await supabase
        .from('profiles')
        .select('grade, class_number')
        .eq('id', user?.id)
        .single();


      if (!profile?.grade) {
        toast({
          title: '담임반 정보 없음',
          description: '프로필에서 담임하는 학년을 설정해주세요.',
          variant: 'destructive',
        });
        return;
      }

      // 해당 학급의 학생 목록 가져오기 (새로운 JSON 스키마 사용)
      const { data: studentResources } = await (supabase as any)
        .from('resource')
        .select('id, name, meta')
        .eq('type', 'student')
        .eq('meta->grade', profile.grade)
        .eq('meta->class', profile.class_number);

      if (!studentResources) return;

      // 기존 출석 기록 가져오기 (section_id는 null인 담임 출석부 기록)
      const { data: attendanceRecords } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('date', date)
        .is('section_id', null)
        .in('resource_id', studentResources.map(s => s.id));

      // 학생 정보 구성
      const studentsData = studentResources.map(resource => {
        const record = attendanceRecords?.find(r => r.resource_id === resource.id);
        const meta = resource.meta as any as ResourceMetaStudent;
        return {
          id: resource.id,
          name: resource.name,
          student_number: meta?.number || 0,
          grade: meta?.grade || profile.grade,
          class_number: meta?.class || profile.class_number,
          status: (record?.status || 'present') as StudentInfo['status'],
          notes: record?.notes,
          health_status: record?.health_status as StudentInfo['health_status'],
          parent_contacted: record?.parent_contacted,
          recorded_at: record?.created_at,
          recorded_by: record?.recorded_by
        };
      });

      setStudents(studentsData);
      setCurrentSession({
        id: `homeroom-${date}-${period}`,
        meeting_id: 'homeroom',
        date,
        period,
        status: 'active',
        type: 'homeroom',
        meeting_data: {
          subject: '담임 출석',
          room: `${profile.grade}-${profile.class_number}교실`,
          starts_at: '09:00',
          ends_at: '09:10',
          teacher_name: user?.email || '',
          grade: profile.grade,
          class_number: profile.class_number
        },
        total_students: studentsData.length,
        attendance_count: attendanceRecords?.length || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error fetching homeroom attendance:', error);
    }
  };

  const fetchClassAttendance = async (date: string, period: number) => {
    try {
      // 사용자가 접근 가능한 섹션 목록과 해당 학생 가져오기
      const { data: sections } = await supabase
        .from('section')
        .select('id, name, subject, meta');
      
      if (!sections?.length) {
        toast({
          title: '수업 정보 없음',
          description: '접근 가능한 수업이 없습니다.',
          variant: 'destructive',
        });
        return;
      }
      
      // 첫 번째 섹션의 학생들 가져오기 (새로운 JSON 스키마 사용)
      const section = sections[0];
      const { data: studentResources, error: studentError } = await supabase
        .from('resource')
        .select('id, name, type, meta')
        .eq('type', 'student');
      
      // JSON 배열에서 섹션 이름으로 필터링 (클라이언트 사이드)
      const filteredStudents = studentResources?.filter(resource => {
        const meta = resource.meta as any as ResourceMetaStudent;
        return meta?.section?.includes(section.name);
      }) || [];

      if (!filteredStudents?.length) {
        toast({
          title: '학생 정보 없음',
          description: '해당 섹션에 배정된 학생이 없습니다.',
          variant: 'destructive',
        });
        return;
      }

      // 기존 출석 기록 가져오기 (해당 섹션과 날짜에 맞는 기록)
      const { data: attendanceRecords } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('date', date)
        .eq('section_id', section.id)
        .in('resource_id', filteredStudents.map(r => r.id));

      // 학생 정보 구성
      const studentsData = filteredStudents.map(resource => {
        const record = attendanceRecords?.find(r => r.resource_id === resource.id);
        const meta = resource.meta as any as ResourceMetaStudent;
        const sectionMeta = section.meta as any;
        return {
          id: resource.id,
          name: resource.name,
          student_number: meta?.number || 0,
          grade: parseInt(String(sectionMeta?.grade || meta?.grade || 1)),
          class_number: parseInt(String(meta?.class || 0)),
          status: (record?.status || 'present') as StudentInfo['status'],
          notes: record?.notes,
          health_status: record?.health_status as StudentInfo['health_status'],
          parent_contacted: record?.parent_contacted,
          recorded_at: record?.created_at,
          recorded_by: record?.recorded_by
        };
      });

      setStudents(studentsData);
      setCurrentSession({
        id: `class-${section.id}-${date}-${period}`,
        meeting_id: section.id,
        date,
        period,
        status: 'active',
        type: 'class',
        meeting_data: {
          subject: section.subject || '수업',
          section_name: section.name,
          room: '교실',
          starts_at: '09:00',
          ends_at: '09:45',
          teacher_name: user?.email || '',
          grade: parseInt((section.meta as any)?.grade) || 1
        },
        total_students: studentsData.length,
        attendance_count: attendanceRecords?.length || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching class attendance:', error);
    }
  };

  const updateAttendance = async (
    studentId: string, 
    status: StudentInfo['status'], 
    notes?: string,
    healthStatus?: StudentInfo['health_status'],
    parentContacted?: boolean
  ) => {
    if (!currentSession || !user) return;

    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const sectionId = currentSession.type === 'homeroom' ? null : currentSession.meeting_id;
      
      if (status === 'present') {
        // 출석인 경우 기록 삭제 (출석이 아닌 경우만 기록)
        const deleteQuery = supabase
          .from('attendance_records')
          .delete()
          .eq('resource_id', studentId)
          .eq('date', today);
          
        if (sectionId) {
          deleteQuery.eq('section_id', sectionId);
        } else {
          deleteQuery.is('section_id', null);
        }
        
        await deleteQuery;
      } else {
        // 출석이 아닌 경우 기록 저장/업데이트
        // meeting 레코드 확보 (담임/수업에 따라 처리)
        let meetingId: string;
        
        if (currentSession.type === 'homeroom') {
          // 담임 출석부의 경우: 담임 meeting 생성 또는 찾기
          const grade = currentSession.meeting_data.grade;
          const classNumber = currentSession.meeting_data.class_number;
          
          const { data: existingMeeting } = await supabase
            .from('meeting')
            .select('id')
            .eq('kind', 'homeroom')
            .eq('starts_at', `${today}T09:00:00+09:00`)
            .eq('status', 'approved')
            .maybeSingle();

          if (existingMeeting) {
            meetingId = existingMeeting.id;
          } else {
            // 담임 meeting 생성
            const { data: newMeeting, error: meetingError } = await supabase
              .from('meeting')
              .insert({
                kind: 'homeroom',
                section_id: null,
                starts_at: `${today}T09:00:00+09:00`,
                ends_at: `${today}T09:10:00+09:00`,
                status: 'approved',
                meta: { grade, class_number: classNumber }
              })
              .select('id')
              .maybeSingle();

            if (meetingError || !newMeeting) {
              console.error('Meeting creation error:', meetingError);
              throw meetingError || new Error('Failed to create meeting');
            }
            meetingId = newMeeting.id;
          }
        } else {
          // 수업 출석부의 경우: section meeting 생성 또는 찾기
          const { data: existingMeeting } = await supabase
            .from('meeting')
            .select('id')
            .eq('kind', 'class')
            .eq('section_id', currentSession.meeting_id)
            .eq('starts_at', `${today}T09:00:00+09:00`)
            .eq('status', 'approved')
            .maybeSingle();

          if (existingMeeting) {
            meetingId = existingMeeting.id;
          } else {
            // 수업 meeting 생성
            const { data: newMeeting, error: meetingError } = await supabase
              .from('meeting')
              .insert({
                kind: 'class',
                section_id: currentSession.meeting_id,
                starts_at: `${today}T09:00:00+09:00`,
                ends_at: `${today}T09:45:00+09:00`,
                status: 'approved',
                meta: { period: currentSession.period }
              })
              .select('id')
              .maybeSingle();

            if (meetingError || !newMeeting) {
              console.error('Meeting creation error:', meetingError);
              throw meetingError || new Error('Failed to create meeting');
            }
            meetingId = newMeeting.id;
          }
        }

        // 기존 레코드 확인
        let query = supabase
          .from('attendance_records')
          .select('id')
          .eq('resource_id', studentId)
          .eq('date', today);
        
        if (sectionId) {
          query = query.eq('section_id', sectionId);
        } else {
          query = query.is('section_id', null);
        }
        
        const { data: existingRecord } = await query.maybeSingle();

        if (existingRecord) {
          // 기존 레코드 업데이트
          const { error } = await supabase
            .from('attendance_records')
            .update({
              meeting_id: meetingId,
              period: currentSession.period,
              status,
              notes,
              health_status: healthStatus,
              parent_contacted: parentContacted,
              recorded_by: user.id,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingRecord.id);

          if (error) {
            console.error('Update error:', error);
            throw error;
          }
        } else {
          // 새 레코드 삽입
          const { error } = await supabase
            .from('attendance_records')
            .insert({
              resource_id: studentId,
              date: today,
              section_id: sectionId,
              meeting_id: meetingId,
              period: currentSession.period,
              status,
              notes,
              health_status: healthStatus,
              parent_contacted: parentContacted,
              recorded_by: user.id
            });

          if (error) {
            console.error('Insert error:', error);
            throw error;
          }
        }
      }

      // 로컬 상태 업데이트
      setStudents(prev =>
        prev.map(student =>
          student.id === studentId
            ? { 
                ...student, 
                status, 
                notes,
                health_status: healthStatus || student.health_status,
                parent_contacted: parentContacted || student.parent_contacted,
                recorded_at: new Date().toISOString(),
                recorded_by: user.email || 'unknown'
              }
            : student
        )
      );

      toast({
        title: '저장 완료',
        description: '출석 정보가 저장되었습니다.',
      });
    } catch (error) {
      console.error('Error updating attendance:', error);
      toast({
        title: '오류',
        description: '출석 정보 저장에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const bulkUpdateAttendance = async (studentIds: string[], status: StudentInfo['status']) => {
    setSaving(true);
    try {
      for (const studentId of studentIds) {
        await updateAttendance(studentId, status);
      }

      setSelectedStudents([]);

      toast({
        title: '일괄 처리 완료',
        description: `${studentIds.length}명의 출석 정보가 저장되었습니다.`,
      });
    } catch (error) {
      console.error('Error bulk updating attendance:', error);
      toast({
        title: '오류',
        description: '일괄 출석 처리에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudents(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const selectAllStudents = () => {
    const filteredStudentIds = getFilteredStudents().map(s => s.id);
    setSelectedStudents(filteredStudentIds);
  };

  const clearSelection = () => {
    setSelectedStudents([]);
  };

  const getFilteredStudents = () => {
    let filtered = students;
    
    // 상태 필터
    if (filterStatus !== 'all') {
      filtered = filtered.filter(student => student.status === filterStatus);
    }
    
    // 검색 필터
    if (searchQuery) {
      filtered = filtered.filter(student => 
        student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.student_number.toString().includes(searchQuery)
      );
    }
    
    return filtered.sort((a, b) => a.student_number - b.student_number);
  };

  useEffect(() => {
    fetchCurrentSession();
  }, [user, attendanceType]);

  return {
    currentSession,
    students: getFilteredStudents(),
    allStudents: students,
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
    refetch: fetchCurrentSession,
  };
};