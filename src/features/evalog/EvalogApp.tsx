import { useCallback, useState } from 'react';
import './index.css';
import { Layout } from '@/components/layout/Layout';
import MainLayout from './components/layout/MainLayout';
import Header from './components/layout/Header';
import StudentList from './components/student/StudentList';
import EvaluationPanel from './components/evaluation/EvaluationPanel';
import EvaluationWriter from './components/writer/EvaluationWriter';
import KeyboardHelp from './components/ui/keyboard-help';
import PDFUploadWorkflow from './components/upload/PDFUploadWorkflow';
import { DevTools } from './components/dev/DevTools';
import { Student } from './types';
import { useKeyboardShortcuts, useStudentNavigation } from './hooks/useKeyboardShortcuts';
import { useEvaluationState } from './hooks/useEvaluationState';
import { useAppUI } from './hooks/useAppUI';
import { AddStudentDialog } from './components/student/AddStudentDialog';
import { AIWriterWidget } from './components/ai/AIWriterWidget';
import * as XLSX from 'xlsx';
import { useEvaluationStore } from './hooks/useEvaluationStore';
import { toast } from '@/lib/toast';
import { supabase } from '@/integrations/supabase/client';
import { convertBasicInfoToStudent } from './services/adminService';
import { HelpCircle } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { EvalogGuideDialog } from './components/guide/EvalogGuideDialog';
import { useStudentSelfData } from './hooks/useStudentSelfData';
import { useStudentDeepLink } from '@/hooks/useStudentDeepLink';

function App() {
  const { profile, isStudentView } = useAuth();
  // 학생 뷰 전용 안내 모달 — 교사 뷰는 Header 안에서 자체적으로 연다
  const [showStudentGuide, setShowStudentGuide] = useState(false);
  const isAdmin = profile?.role === 'admin';
  const isStudent = isStudentView;

  // Student self-data loading (hook is always called but only activates for student role)
  const { student: selfStudent, loading: selfLoading, error: selfError } = useStudentSelfData(isStudent);

  const [showPDFDebug, setShowPDFDebug] = useState(false);
  const [showAddStudentDialog, setShowAddStudentDialog] = useState(false);
  const [pdfInitialFile, setPdfInitialFile] = useState<File | null>(null);

  const { importData, getEvaluation, updateEvaluation, resetData, setSourceFilename } = useEvaluationStore();

  const {
    students,
    selectedStudent,
    selectedEvaluation,
    handleSelectStudent,
    handlePdfJsonLoaded,
    handleBatchAddStudents,
    handleUpdateStudentStatus,
    evaluationProgress,
    setStudents,
    setSelectedStudent
  } = useEvaluationState();

  // 헤더 통합 검색 딥링크 (?student=학생코드): 학생을 목록에 추가하고 선택
  useStudentDeepLink(useCallback(async (code: string) => {
    if (isStudent) return;
    try {
      const { data, error } = await supabase
        .from('student_basic_info' as any)
        .select('*, student_detailed_activities(*)')
        .eq('id', code)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error('학생 정보를 찾을 수 없습니다.');
        return;
      }
      const student = convertBasicInfoToStudent(data);
      handlePdfJsonLoaded(student);
      toast.success(`${student.name} 학생을 목록에 추가했습니다.`);
    } catch (err) {
      console.error('Failed to load student from deep link:', err);
      toast.error('학생 정보를 불러오지 못했습니다.');
    }
  }, [isStudent, handlePdfJsonLoaded]));

  const handleResetStudents = useCallback(() => {
    if (window.confirm('모든 학생 목록과 평가 데이터를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
      setStudents([]);
      setSelectedStudent(null);
      resetData();
      toast.success('모든 데이터가 초기화되었습니다.');
    }
  }, [setStudents, setSelectedStudent, resetData]);

  // 다시 불러오기: 현재 목록에 있는 학생들의 DB 자료(생기부·활동)만 재조회해 교체한다.
  // 우측 패널에서 작성 중인 평가 초안(useEvaluationStore.data, 학생 id 키)은 건드리지 않으며,
  // 그 연결이 끊기지 않도록 각 학생의 id 와 평가 상태(status)는 반드시 보존한다.
  const [reloadingStudents, setReloadingStudents] = useState(false);
  const handleReloadStudents = useCallback(async () => {
    if (students.length === 0) {
      toast.info('다시 불러올 학생이 없습니다.');
      return;
    }
    setReloadingStudents(true);
    try {
      type ReloadRow = { id?: string | null; student_no?: string | number | null; name?: string | null } & Record<string, unknown>;
      const fetchByColumn = async (column: 'id' | 'name', values: string[]) => {
        if (values.length === 0) return { data: [] as ReloadRow[], error: null };
        const { data, error } = await supabase
          .from('student_basic_info' as never)
          .select('*, student_detailed_activities(*)')
          .in(column, values);
        return { data: (data ?? []) as unknown as ReloadRow[], error };
      };

      // DB 출신 학생은 id(=학생코드)로 정확 매칭, 수동/PDF 추가 학생(UUID id)은 이름으로 조회
      const ids = [...new Set(students.map(s => s.id).filter(Boolean))];
      const names = [...new Set(students.map(s => s.name).filter(Boolean))];
      const [byIdRes, byNameRes] = await Promise.all([
        fetchByColumn('id', ids),
        fetchByColumn('name', names),
      ]);
      if (byIdRes.error && byNameRes.error) {
        throw byIdRes.error;
      }

      // 조회 결과를 id / 학번 / 이름 세 키로 색인. student_basic_info 에는 졸업생 등
      // 과거 데이터도 남아 있어 학번·이름이 겹칠 수 있으므로, 겹치면 그 키로는 매칭하지 않는다.
      const recordById = new Map<string, ReloadRow>();
      [...(byIdRes.data ?? []), ...(byNameRes.data ?? [])].forEach((r) => {
        if (r?.id && !recordById.has(String(r.id))) recordById.set(String(r.id), r);
      });
      const buildUniqueMap = (key: (r: ReloadRow) => string | null) => {
        const map = new Map<string, ReloadRow>();
        const dup = new Set<string>();
        recordById.forEach((r) => {
          const k = key(r);
          if (!k) return;
          if (map.has(k)) dup.add(k); else map.set(k, r);
        });
        dup.forEach((k) => map.delete(k));
        return map;
      };
      const uniqueByNo = buildUniqueMap(r => (r.student_no ? String(r.student_no) : null));
      const uniqueByName = buildUniqueMap(r => (r.name ? String(r.name) : null));

      let refreshed = 0;
      const next = students.map((s) => {
        const record =
          recordById.get(s.id) ??
          (s.studentNo ? uniqueByNo.get(String(s.studentNo)) : undefined) ??
          uniqueByName.get(s.name);
        if (!record) return s;
        refreshed++;
        const hydrated = convertBasicInfoToStudent(record);
        return {
          ...hydrated,
          id: s.id,                                        // 평가 초안(스토어 키)과의 연결 유지
          status: s.status,                                // 평가 진행 상태 보존
          studentId: hydrated.studentId ?? s.studentId,
          profileImage: s.profileImage ?? hydrated.profileImage,
        };
      });
      setStudents(next);

      const missed = students.length - refreshed;
      if (refreshed === 0) {
        toast.warning('DB에서 일치하는 학생 자료를 찾지 못했습니다.');
      } else if (missed > 0) {
        toast.success(`학생 ${refreshed}명의 자료를 다시 불러왔습니다. (${missed}명은 DB 미등록)`);
      } else {
        toast.success(`학생 ${refreshed}명의 자료를 다시 불러왔습니다.`);
      }
    } catch (err) {
      console.error('Failed to reload students:', err);
      toast.error('학생 자료를 다시 불러오지 못했습니다.');
    } finally {
      setReloadingStudents(false);
    }
  }, [students, setStudents]);

  const {
    showKeyboardHelp,
    setShowKeyboardHelp,
    showPDFUpload,
    setShowPDFUpload,
    cycleActivePanel
  } = useAppUI();

  const selectedIndex = selectedStudent
    ? students.findIndex(s => s.id === selectedStudent.id)
    : -1;

  // 학생 네비게이션
  const handleSelectByIndex = useCallback((index: number) => {
    if (index >= 0 && index < students.length) {
      handleSelectStudent(students[index]);
    }
  }, [students, handleSelectStudent]);

  useStudentNavigation(students, selectedIndex, handleSelectByIndex);

  // 학번 추출 헬퍼 함수
  const deriveStudentNo = (meta: any): string[] => {
    if (!meta) return [];
    return [meta.snum1, meta.snum2, meta.snum3]
      .filter(s => s)
      .map(s => String(s));
  };


  // 엑셀에서 학생 목록 및 데이터 불러오기
  const handleImportStudentsFromExcel = useCallback(async (file: File) => {
    // 파일명 저장 (확장자 제외, 평가현황 접미사 제거)
    // 예: "담임_평가데이터_26-108.xlsx" → "담임_평가데이터"
    const filenameWithoutExt = file.name
      .replace(/\.[^/.]+$/, '')      // 확장자 제거
      .replace(/_\d+-\d+$/, '');     // 평가현황 접미사 제거 (예: _26-108)
    setSourceFilename(filenameWithoutExt);

    // 1. 엑셀 파일 읽기
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });

        if (!wb.SheetNames.length) {
          throw new Error('엑셀 파일에 시트가 없습니다.');
        }

        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const json = XLSX.utils.sheet_to_json(ws) as any[];

        if (!json || json.length === 0) {
          throw new Error('데이터가 없는 엑셀 파일입니다.');
        }

        // 2. Supabase에서 학생 정보(사진 포함) 조회 - student_basic_info 활용
        let dbStudentMap: Record<string, any> = {};
        let resourceMap: Record<string, { picture: string | null; id: string | null }> = {};

        try {
          // A. Fetch Basic Info + Details
          const names = json.map(r => r['이름']).filter(n => n);

          if (names.length > 0) {
            const { data: dbStudents } = await supabase
              .from('student_basic_info' as any) // Cast for now
              .select('*, student_detailed_activities(*)')
              .in('name', names);

            if (dbStudents) {
              dbStudents.forEach((s: any) => {
                // Map by Name and also StudentNo (if available) for robust matching
                if (s.name) dbStudentMap[s.name] = s;
                if (s.student_no) dbStudentMap[String(s.student_no)] = s;
              });
            }

            // B. Fetch Resource table (for pictures primarily)
            const { data: resources } = await supabase
              .from('resource')
              .select('id, name, meta')
              .eq('type', 'student');

            if (resources) {
              resources.forEach((r: any) => {
                const resourceData = {
                  picture: r.meta?.picture || null,
                  id: r.meta?.id ? String(r.meta.id) : null
                };
                if (r.meta) {
                  const snums = deriveStudentNo(r.meta);
                  snums.forEach(snum => { resourceMap[snum] = resourceData; });
                  if (r.name) resourceMap[r.name] = resourceData;
                }
              });
            }
          }
        } catch (err) {
          console.error("Failed to fetch DB resources", err);
          // DB fetch failure shouldn't block the file import itself
          toast.error("DB 연동에 실패했으나 파일 불러오기를 계속합니다.");
        }

        let addedCount = 0;
        let updatedCount = 0;

        const newData: Record<string, any> = {};
        const statusUpdates = new Map<string, Student['status']>();

        // Helper to safely get string value, preserving undefined if missing
        const getSafeString = (val: any) => {
          if (val === undefined || val === null || val === '') return undefined;
          return String(val);
        };

        json.forEach(row => {
          const studentNumber = row['학번'] ? String(row['학번']) : undefined;
          const studentName = row['이름'];
          const importedStatus = row['평가상태'] as Student['status'] | undefined;

          if (!studentName) return;

          // 학생 찾기 또는 생성 (학번 우선, 없으면 이름으로 fallback)
          const targetStudent = students.find(s =>
            studentNumber
              ? s.studentNo === studentNumber  // 학번이 있으면 학번으로만 매칭
              : s.name === studentName         // 학번이 없으면 이름으로 매칭
          );

          let studentId = targetStudent?.id;
          let finalStudent: Student | null = null;

          // DB Matching (Priority: StudentNo -> Name)
          const dbRecord = (studentNumber && dbStudentMap[studentNumber]) || dbStudentMap[studentName];
          const resourceRecord = (studentNumber && resourceMap[studentNumber]) || resourceMap[studentName];

          if (!targetStudent) {
            // If we have a DB record, hydrate from it strictly
            if (dbRecord) {
              const hydrated = convertBasicInfoToStudent(dbRecord);

              finalStudent = {
                ...hydrated,
                status: importedStatus && ['평가중', '평가완료', '미평가'].includes(importedStatus) ? importedStatus : hydrated.status,
              };
            } else {
              // Fallback to legacy creation
              finalStudent = {
                id: crypto.randomUUID(),
                studentId: resourceRecord?.id || undefined,
                name: studentName,
                studentNo: studentNumber || '',
                grade: undefined,
                classNum: undefined,
                status: importedStatus && ['평가중', '평가완료', '미평가'].includes(importedStatus) ? importedStatus : '미평가',
                uploadedAt: new Date().toISOString(),
                totalScore: null,
                majorScore: null,
                attendance: '대기중',
              };
            }

            if (finalStudent) {
              handlePdfJsonLoaded(finalStudent);
              studentId = finalStudent.id;
              addedCount++;
            }
          } else {
            updatedCount++;
            if (importedStatus && ['평가중', '평가완료', '미평가'].includes(importedStatus)) {
              statusUpdates.set(targetStudent.id, importedStatus);
            }
          }

          if (studentId) {
            // 평가 데이터 준비
            const currentEval = getEvaluation(studentId);

            newData[studentId] = {
              homeroom: {
                autonomy: getSafeString(row['자율활동']) || currentEval.homeroom.autonomy,
                career: getSafeString(row['진로활동']) || currentEval.homeroom.career,
                behavior: getSafeString(row['행동특성']) || currentEval.homeroom.behavior,
              },
              subject: {
                content: getSafeString(row['교과세특']) || currentEval.subject.content,
                grade: getSafeString(row['성적']) || currentEval.subject.grade
              },
              club: {
                content: getSafeString(row['동아리활동']) || currentEval.club.content,
              }
            };
          }
        });

        // 데이터 일괄 업데이트
        if (Object.keys(newData).length > 0) {
          importData(newData);
        }

        // 상태 일괄 업데이트
        if (statusUpdates.size > 0) {
          setStudents(prev => prev.map(s =>
            statusUpdates.has(s.id) ? { ...s, status: statusUpdates.get(s.id)! } : s
          ));
        }

        toast.success(`학생 ${addedCount}명 추가, 데이터 ${Object.keys(newData).length}건 불러오기 완료`);
      } catch (error: any) {
        console.error('Excel Import Error:', error);
        toast.error(`파일 불러오기 실패: ${error.message || '알 수 없는 오류'}`);
      }
    };
    reader.onerror = () => {
      toast.error('파일 읽기 중 오류가 발생했습니다.');
    };
    reader.readAsBinaryString(file);
  }, [students, handlePdfJsonLoaded, getEvaluation, importData, setStudents, setSourceFilename]);

  const handlePDFImportLoop = (file: File) => {
    setPdfInitialFile(file);
    setShowPDFUpload(true);
  };

  // 전역 키보드 단축키
  useKeyboardShortcuts([
    {
      key: 'h',
      ctrl: true,
      shift: true,
      handler: () => setShowKeyboardHelp(true),
      description: '키보드 단축키 도움말'
    },
    {
      key: 'Tab',
      ctrl: true,
      handler: cycleActivePanel,
      description: '패널 전환'
    },
    {
      key: 's',
      ctrl: true,
      handler: () => {
        console.log('저장 기능 실행');
        // TODO: 저장 기능 구현
      },
      description: '저장'
    },
    {
      key: 'e',
      ctrl: true,
      handler: () => {
        if (selectedStudent) {
          console.log('빠른 평가:', selectedStudent.name);
          // TODO: 빠른 평가 모달 열기
        }
      },
      description: '빠른 평가'
    },
    {
      key: 'Escape',
      handler: () => {
        setShowKeyboardHelp(false);
        setShowPDFUpload(false);
        // 다른 모달들도 닫기
      },
      description: '닫기'
    }
  ]);

  // Student view: single-panel layout with only EvaluationPanel
  if (isStudent) {
    const studentForPanel = selfStudent || selectedStudent;
    const studentEval = studentForPanel ? getEvaluation(studentForPanel.id) : null;

    return (
      <Layout>
        <div className="evalog-wrapper h-[calc(100vh-120px)] md:h-[calc(100vh-57px)] -m-2 sm:-m-3 md:-m-4 lg:-m-6 md:-mb-6 overflow-hidden">
          <div className="flex flex-col h-full bg-gray-50">
            {selfLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            ) : selfError ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-muted-foreground p-8">
                  <p className="text-lg font-medium mb-2">데이터를 불러올 수 없습니다</p>
                  <p className="text-sm">{selfError}</p>
                </div>
              </div>
            ) : (
              <>
                {/* 학생 뷰에는 교사용 글래스 Header 가 없다 → [사용 방법] 진입점을 여기 둔다.
                    (수시 지원에서 같은 함정이 있었다 — 헤더로만 옮기면 학생은 안내를 못 찾는다) */}
                <div className="flex items-center justify-end border-b border-slate-100 bg-white px-3 py-1.5">
                  <button
                    onClick={() => setShowStudentGuide(true)}
                    title="사용 방법"
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-all hover:bg-brand-50 hover:text-brand-600"
                  >
                    <HelpCircle size={14} />
                    <span>사용 방법</span>
                  </button>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar bg-white">
                  <EvaluationPanel
                    student={studentForPanel}
                    evaluation={studentEval}
                    allStudents={studentForPanel ? [studentForPanel] : []}
                    isStudent={true}
                  />
                </div>
                <EvalogGuideDialog open={showStudentGuide} onOpenChange={setShowStudentGuide} />
              </>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="evalog-wrapper h-[calc(100vh-120px)] md:h-[calc(100vh-57px)] -m-2 sm:-m-3 md:-m-4 lg:-m-6 md:-mb-6 overflow-hidden">
        <MainLayout
        selectedStudent={selectedStudent}
        showPDFDebug={showPDFDebug}
        setShowPDFDebug={setShowPDFDebug}
        header={
          <Header
            evaluationProgress={evaluationProgress}
            student={selectedStudent}
            onBatchAddStudents={handleBatchAddStudents}
          />
        }
        leftPanel={
          <div data-panel="left" className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <StudentList
                students={students}
                selectedStudentId={selectedStudent?.id}
                onSelectStudent={handleSelectStudent}
                onAddStudentClick={() => setShowAddStudentDialog(true)}
                onExcelImport={handleImportStudentsFromExcel}
                onReset={handleResetStudents}
                onReload={handleReloadStudents}
                reloading={reloadingStudents}
              />
            </div>
            {isAdmin && (
              <DevTools
                onOpenDebug={() => setShowPDFDebug(true)}
                onAddStudent={handlePdfJsonLoaded}
              />
            )}
          </div>
        }
        centerPanel={
          // 중앙 스크롤 칸(flex-col)을 채워야 빈 상태의 `h-full` 이 풀린다 — 높이 없는 감싸개면
          // "평가할 학생을 선택해주세요"가 맨 위로 붙는다(시험 결과 분석은 감싸개가 없어 가운데였다)
          <div data-panel="center" className="flex flex-1 flex-col">
            <EvaluationPanel
              student={selectedStudent}
              evaluation={selectedEvaluation}
              allStudents={students}
            />
          </div>
        }
        rightPanel={
          <div data-panel="right" className="h-full">
            <EvaluationWriter
              student={selectedStudent}
              allStudents={students}
              onStatusChange={handleUpdateStudentStatus}
            />
          </div>
        }
      />
      <KeyboardHelp
        open={showKeyboardHelp}
        onOpenChange={setShowKeyboardHelp}
      />
      {showPDFUpload && (
        <PDFUploadWorkflow
          initialFile={pdfInitialFile}
          onComplete={(result) => {
            if (Array.isArray(result)) {
              handleBatchAddStudents(result as Student[]);
            } else {
              handlePdfJsonLoaded(result as Student);
            }
            setPdfInitialFile(null); // Reset
          }}
          onCancel={() => {
            setShowPDFUpload(false);
            setPdfInitialFile(null); // Reset
          }}
        />
      )}
      <AddStudentDialog
        open={showAddStudentDialog}
        onOpenChange={setShowAddStudentDialog}
        onAddStudent={(student) => handlePdfJsonLoaded(student as Student)}
        onBatchAddStudents={handleBatchAddStudents}
        onExcelImport={handleImportStudentsFromExcel}
      />

      {/* AI 문장 생성 위젯 */}
      <AIWriterWidget selectedStudent={selectedStudent} />
      </div>
    </Layout>
  );
}

export default App;