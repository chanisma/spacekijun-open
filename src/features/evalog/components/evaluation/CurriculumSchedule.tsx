import React from 'react';
import { Student } from '../../types';
import { CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';

import { getSchoolCurriculum } from '../../utils/curriculumUtils';

interface CurriculumScheduleProps {
  student: Student;
}

const CurriculumSchedule: React.FC<CurriculumScheduleProps> = ({ student }) => {
  // 학생 정보에서 입학년도 추출 (없으면 기본값 사용)
  const admissionYear = student.section1_personal_info?.admissionYear;
  // TODO: 학교명도 학생 정보에서 가져와야 하지만, 현재 구조상 기본값 사용 혹은 추후 student 필드 추가 고려
  const curriculum = getSchoolCurriculum('샘플고등학교', admissionYear ? parseInt(admissionYear) : undefined);

  if (!curriculum) {
    return null;
  }
  const semesters = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'];

  // PDF 데이터 우선 사용
  const academicData = student.section6_academic_development || [];

  // 카테고리 이름 정규화 함수 (괄호 안 내용 제거)
  const normalizeCategory = (cat: string) => {
    return cat.replace(/\([^)]*\)/g, '').trim();
  };

  // 학생이 수강한 과목을 학기별/카테고리별로 그룹화
  const studentSubjectsBySemester: Record<string, Record<string, any[]>> = {};

  academicData.forEach((subj: any) => {
    // 학기 결정 (PDF: grade-semester, Mock: semester)
    const sem = subj.grade && subj.semester
      ? `${subj.grade}-${subj.semester}`
      : subj.semester;

    // 카테고리 결정 및 정규화 (PDF: subject_group, Mock: category)
    const rawCategory = subj.subject_group || subj.category;
    const category = normalizeCategory(rawCategory);

    if (!studentSubjectsBySemester[sem]) {
      studentSubjectsBySemester[sem] = {};
    }
    if (!studentSubjectsBySemester[sem][category]) {
      studentSubjectsBySemester[sem][category] = [];
    }

    // content 또는 remarks에 "(공동교육과정)" 포함 여부 확인
    const contentField = subj.content || subj.remarks || '';
    const isShared = contentField.includes('(공동교육과정)');

    studentSubjectsBySemester[sem][category].push({
      subject: subj.subject,
      credits: subj.units || 0,
      isTaken: true,
      isShared: isShared
    });
  });

  // 교육과정의 카테고리 + 학생이 수강한 과목의 카테고리
  const allCategories = new Set<string>();
  curriculum.subjects.forEach(subj => allCategories.add(subj.category));
  Object.values(studentSubjectsBySemester).forEach(semData => {
    Object.keys(semData).forEach(cat => allCategories.add(cat));
  });

  // 카테고리별로 curriculum + 학생 과목 정리
  const categoryStats = Array.from(allCategories).map(category => {
    // 학생이 수강한 과목의 단위 합계 (3학년 2학기 제외)
    const takenUnits = academicData
      .filter((g: any) => {
        const rawCategoryField = g.subject_group || g.category;
        const categoryField = normalizeCategory(rawCategoryField);

        // 학기 확인
        const sem = g.grade && g.semester
          ? `${g.grade}-${g.semester}`
          : g.semester;

        // 3학년 2학기는 제외
        return categoryField === category && sem !== '3-2';
      })
      .reduce((sum: number, s: any) => sum + (s.units || 0), 0);

    // 교육과정의 해당 카테고리 총 단위 (3학년 2학기 제외)
    const curriculumTotalUnits = curriculum.subjects
      .filter(s => s.category === category)
      .reduce((sum, subject) => {
        const subjectTotalUnits = Object.entries(subject.semesters).reduce((semSum: number, [sem, credits]) => {
          // 3학년 2학기는 제외
          if (sem === '3-2') return semSum;
          return semSum + (typeof credits === 'number' ? credits : 0);
        }, 0);
        return sum + subjectTotalUnits;
      }, 0);

    // 이수비율
    const percentage = curriculumTotalUnits > 0
      ? ((takenUnits / curriculumTotalUnits) * 100).toFixed(1)
      : takenUnits > 0 ? '100.0' : '0.0';

    // 학기별 과목 정리
    const subjectsBySemester: Record<string, any[]> = {};

    semesters.forEach(sem => {
      const semKey = sem as '1-1' | '1-2' | '2-1' | '2-2' | '3-1' | '3-2';

      // Curriculum 과목 (해당 카테고리의 과목만)
      const curriculumSubjects = curriculum.subjects
        .filter(s => s.category === category && s.semesters[semKey])
        .map(s => ({
          subject: s.subject,
          credits: s.semesters[semKey] as number,
          isTaken: false,
          isShared: s.isShared || false
        }));

      // 학생이 수강한 과목 (해당 카테고리의 과목만)
      const studentSubjectsInCategory = studentSubjectsBySemester[sem]?.[category] || [];

      // 과목명 정규화 함수: 괄호 안 내용 제거 + 띄어쓰기 제거
      const normalizeSubjectName = (name: string) => {
        return name.replace(/\([^)]*\)/g, '').replace(/\s+/g, '').trim();
      };

      // 전체 학생 과목에서 이수 여부 확인 (카테고리 무관)
      const allStudentSubjectsInSem: any[] = [];
      Object.values(studentSubjectsBySemester[sem] || {}).forEach(subjects => {
        allStudentSubjectsInSem.push(...subjects);
      });

      // Curriculum 과목과 학생 과목 매칭 (과목명 + 학년 + 학기만으로)
      const matchedCurriculumSubjects = curriculumSubjects.map(currSubj => {
        // 전체 학생 과목 중에서 같은 과목명 찾기 (띄어쓰기 무시, 카테고리 무관)
        const matchingStudent = allStudentSubjectsInSem.find(
          studentSubj => normalizeSubjectName(studentSubj.subject) === normalizeSubjectName(currSubj.subject)
        );

        if (matchingStudent) {
          // 매칭되면 isTaken: true
          return {
            ...currSubj,
            isTaken: true,
            isShared: matchingStudent.isShared || currSubj.isShared
          };
        }
        return currSubj;
      });

      // 해당 카테고리에 속한 학생 과목 중 Curriculum에 없는 과목 추가
      const unmatchedStudentSubjects = studentSubjectsInCategory.filter(studentSubj => {
        // 전체 curriculum에서 확인 (카테고리 무관)
        const isInCurriculum = curriculum.subjects.some(
          currSubj => normalizeSubjectName(currSubj.subject) === normalizeSubjectName(studentSubj.subject)
        );
        return !isInCurriculum;
      });

      // 병합: 매칭된 curriculum 과목 + curriculum에 없는 학생 과목
      const mergedSubjects = [...matchedCurriculumSubjects, ...unmatchedStudentSubjects];

      if (mergedSubjects.length > 0) {
        subjectsBySemester[sem] = mergedSubjects;
      }
    });

    return {
      category,
      percentage,
      totalUnits: takenUnits,
      curriculumTotalUnits,
      subjectsBySemester
    };
  }).filter(stat => Object.keys(stat.subjectsBySemester).length > 0);

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100/50">
        <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
          <CalendarClock size={18} />
        </div>
        <h3 className="font-semibold text-slate-800">편제 및 시간배당</h3>
      </div>
      <p className="text-xs text-slate-500 mb-6 pl-1">※ 지원자 고등학교의 편제를 과목, 학년 학기 별로 표기 후 지원자의 이수실태를 색으로 표기함.</p>

      <div className="overflow-hidden rounded-xl border border-gray-100/60 shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50/80 border-b border-gray-100 text-slate-500">
              <th className="py-3 px-2 text-center font-medium w-24">편제명</th>
              <th className="py-3 px-2 text-center font-medium w-20">이수비율</th>
              <th className="py-3 px-2 text-center font-medium w-20">이수단위</th>
              {semesters.map(sem => {
                const [grade, semester] = sem.split('-');
                return (
                  <th key={sem} className="py-3 px-2 text-center font-medium border-l border-gray-50 text-slate-600">
                    {grade}-{semester}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50/50">
            {categoryStats.map((stat, idx) => (
              <tr key={stat.category} className={cn("transition-colors", idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30 hover:bg-slate-50')}>
                <td className="py-3 px-2 text-center font-semibold text-slate-700">{stat.category}</td>
                <td className="py-3 px-2 text-center text-slate-600 font-mono">{stat.percentage}%</td>
                <td className="py-3 px-2 text-center font-bold text-slate-800">{stat.totalUnits}</td>
                {semesters.map(sem => {
                  const semSubjects = (stat.subjectsBySemester[sem] || []).sort((a, b) => {
                    // 1. 수강한 과목을 먼저
                    if (a.isTaken && !b.isTaken) return -1;
                    if (!a.isTaken && b.isTaken) return 1;
                    // 2. 같은 그룹 내에서는 과목명 가나다순
                    return a.subject.localeCompare(b.subject, 'ko');
                  });
                  return (
                    <td key={sem} className="py-2 px-2 align-top border-l border-gray-50">
                      <div className="flex flex-col gap-1.5">
                        {semSubjects.map((subject, subIdx) => (
                          <div
                            key={subIdx}
                            className={cn(
                              "px-2 py-1.5 rounded-md text-[11px] flex items-center justify-between border transition-all",
                              subject.isTaken
                                ? 'bg-brand-50/50 text-slate-800 border-brand-100 shadow-sm'
                                : 'bg-slate-50/50 text-slate-400 border-slate-100/50'
                            )}
                          >
                            <span className={cn("font-medium", !subject.isTaken && "line-through opacity-70")}>
                              {subject.subject} <span className="text-[10px] text-slate-400 font-normal">({subject.credits})</span>
                            </span>
                            {subject.isShared && (
                              <span className="ml-1 px-1.5 py-0 text-[9px] bg-sky-500 text-white rounded-full font-bold shadow-sm">공</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CurriculumSchedule;
