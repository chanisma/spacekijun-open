import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { useRescueAccess } from './hooks/useRescueAccess';
import { useStudentBasicInfo } from './hooks/useStudentBasicInfo';
import { useRescueRoster } from './hooks/useRescueRoster';
import { useHomeroomTeacher } from './hooks/useHomeroomTeacher';
import { Header } from './components/layout/Header';
import { LeftPanel } from './components/layout/LeftPanel';
import { CenterPanel } from './components/layout/CenterPanel';

export default function RescueNoteApp() {
  const access = useRescueAccess();
  const [params, setParams] = useSearchParams();
  const initialStudent = params.get('student');
  const [selectedClass, setSelectedClass] = useState<{ grade: number; classNum: number } | null>(
    access.homeroomClass
      ? { grade: access.homeroomClass.grade, classNum: access.homeroomClass.classNumber }
      : null
  );
  const [selectedGrade, setSelectedGrade] = useState<{ grade: number; classNums: number[] } | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(initialStudent);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [centerView, setCenterView] = useState<'dashboard' | 'my-notes'>('dashboard');

  // Resolve selected student → header label (direct fetch from student_basic_info)
  const studentInfoQ = useStudentBasicInfo(selectedStudent);
  const studentInfo = studentInfoQ.data ?? null;

  // Resolve selected class → header summary (총원·위기 인원). Reuses the cached
  // roster query that ClassGrid already populates; "위기" = 태그 1개 이상 보유.
  const classRosterQ = useRescueRoster(
    selectedClass?.grade ?? null,
    selectedClass?.classNum ?? null
  );
  const homeroomTeacherQ = useHomeroomTeacher(
    selectedClass?.grade ?? null,
    selectedClass?.classNum ?? null
  );
  const classSummary = useMemo(() => {
    if (!selectedClass) return null;
    const rows = classRosterQ.data ?? [];
    return {
      grade: selectedClass.grade,
      classNum: selectedClass.classNum,
      total: rows.length,
      // 위기 = 현재 상태가 주의(open) 또는 관찰(monitoring)인 학생 (태그 개수 아님)
      crisisCount: rows.filter((r) => r.status === 'open' || r.status === 'monitoring').length,
      homeroomTeacher: homeroomTeacherQ.data ?? null,
    };
  }, [selectedClass, classRosterQ.data, homeroomTeacherQ.data]);

  // URL → state: ?student= 파라미터가 바뀌면(예: 위기 관리 현황 테이블에서
  // 행 클릭으로 /rescue-note?student=XX 진입) 해당 학생 상세로 전환한다.
  // 이 방향 동기화가 없으면 주소만 바뀌고 화면이 갱신되지 않는다.
  useEffect(() => {
    const urlStudent = params.get('student');
    if (urlStudent && urlStudent !== selectedStudent) {
      setSelectedStudent(urlStudent);
      setSelectedClass(null);
      setSelectedGrade(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // state → URL: 학생 선택/해제 시 주소를 동기화한다.
  useEffect(() => {
    const urlStudent = params.get('student');
    if (selectedStudent) {
      if (urlStudent !== selectedStudent) setParams({ student: selectedStudent }, { replace: true });
    } else if (urlStudent) {
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent]);

  if (!access.canSeeMenu) {
    return (
      <Layout>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">
            이 메뉴는 담임교사·상담교사·업무담당자만 접근할 수 있습니다.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout fullWidth>
      <div className="flex flex-col h-full min-h-full bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <Header
          selectedStudent={
            studentInfo
              ? {
                  code: studentInfo.studentCode,
                  name: studentInfo.name,
                  grade: studentInfo.grade,
                  classNum: studentInfo.classNum,
                  numberInClass: studentInfo.numberInClass,
                }
              : null
          }
          selectedClass={classSummary}
          onShowDashboard={() => {
            setSelectedClass(null);
            setSelectedGrade(null);
            setSelectedStudent(null);
            setCenterView('dashboard');
          }}
          onShowMyNotes={() => {
            setSelectedClass(null);
            setSelectedGrade(null);
            setSelectedStudent(null);
            setCenterView('my-notes');
          }}
          activeView={selectedClass || selectedGrade || selectedStudent ? null : centerView}
        />
        <div className="flex flex-1 overflow-hidden relative">
          {/* Left panel wrapper — width animates open/closed; LeftPanel owns its w-72 */}
          <div
            className={`transition-all duration-300 ease-in-out ${isLeftPanelOpen ? 'w-72' : 'w-0'}`}
            style={{ overflow: isLeftPanelOpen ? 'visible' : 'hidden' }}
          >
            <div className="h-full overflow-hidden flex flex-col">
              <LeftPanel
                selectedClass={selectedClass}
                selectedGrade={selectedGrade}
                selectedStudent={selectedStudent}
                onSelectClass={(g, c) => {
                  setSelectedClass({ grade: g, classNum: c });
                  setSelectedGrade(null);
                  setSelectedStudent(null);
                }}
                onSelectGrade={(g, classNums) => {
                  setSelectedGrade({ grade: g, classNums });
                  setSelectedClass(null);
                  setSelectedStudent(null);
                }}
                onSelectStudent={(code) => setSelectedStudent(code)}
              />
            </div>
          </div>

          {/* Toggle button — anchored to the right edge of the panel */}
          <button
            onClick={() => setIsLeftPanelOpen((prev) => !prev)}
            className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-10 flex items-center justify-center bg-white border border-slate-200/80 rounded-r-lg shadow-sm hover:shadow-md text-slate-400 hover:text-brand-600 transition-all duration-200 border-l-0"
            style={{ left: isLeftPanelOpen ? '18rem' : '0px', opacity: 0.85 }}
            title={isLeftPanelOpen ? '학생 목록 숨기기' : '학생 목록 보기'}
          >
            {isLeftPanelOpen
              ? <ChevronLeft className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />
            }
          </button>

          <main className="flex-1 overflow-y-auto custom-scrollbar">
            <CenterPanel
              selectedClass={selectedClass}
              selectedGrade={selectedGrade}
              selectedStudent={selectedStudent}
              view={centerView}
              onSelectStudent={(code) => setSelectedStudent(code)}
            />
          </main>
        </div>
      </div>
    </Layout>
  );
}
