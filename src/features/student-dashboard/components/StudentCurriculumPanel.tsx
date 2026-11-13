import React from 'react';
import { StudentDashboardData } from '@/hooks/useStudentDashboard';
import CurriculumSchedule from '@/features/evalog/components/evaluation/CurriculumSchedule';
import { Student } from '@/features/evalog/types';

interface StudentCurriculumPanelProps {
    student: StudentDashboardData;
}

/**
 * Adapts StudentDashboardData to evalog's Student type for CurriculumSchedule
 */
export const StudentCurriculumPanel: React.FC<StudentCurriculumPanelProps> = ({ student }) => {
    // Convert StudentDashboardData to evalog Student format
    const evalogStudent: Student = React.useMemo(() => {
        // Extract admission year from student_code (e.g., "00-00472" -> 2025)
        const yearPrefix = student.student_code?.split('-')[0];
        const admissionYear = yearPrefix ? 2000 + parseInt(yearPrefix) : undefined;

        return {
            id: student.student_code,
            studentNo: student.student_no,
            name: student.name,
            status: '미평가',
            totalScore: null,
            majorScore: null,
            attendance: '대기중',
            profileImage: student.picture,
            // Map section1_personal_info for admission year
            section1_personal_info: {
                admissionYear: admissionYear?.toString(),
            } as any,
            // Map academic_development to section6_academic_development
            section6_academic_development: student.academic_development?.map((record: any) => ({
                grade: record.grade,
                semester: record.semester,
                subject: record.subject,
                subject_group: record.subject_group || record.category,
                units: record.units,
                rank: record.rank,
                content: record.content || record.remarks,
                remarks: record.remarks || record.content,
                category: record.category,
            })) || [],
        };
    }, [student]);

    if (!student.academic_development || student.academic_development.length === 0) {
        return (
            <div className="text-center py-12 text-slate-400">
                <p>교육과정 정보가 없습니다</p>
            </div>
        );
    }

    return <CurriculumSchedule student={evalogStudent} />;
};
