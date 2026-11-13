import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { useStudentDeepLink } from '@/hooks/useStudentDeepLink';
import { useStudentBasicInfo } from '@/features/rescue-note/hooks/useStudentBasicInfo';
import { useWishlistAccess } from './hooks/useWishlistAccess';
import { Header } from './components/layout/Header';
import { LeftPanel } from './components/layout/LeftPanel';
import { CenterPanel } from './components/layout/CenterPanel';
import { RightPanel } from './components/layout/RightPanel';
import { WishlistView } from './components/WishlistView';

export default function AdmissionWishlistPage() {
  const access = useWishlistAccess();
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<{ grade: number; classNum: number } | null>(null);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  // 학생/학급 선택은 상호 배타 — 하나 고르면 다른 하나 해제
  const selectStudent = (code: string) => { setSelectedStudent(code); setSelectedClass(null); };
  const selectClass = (grade: number, classNum: number) => {
    setSelectedClass({ grade, classNum }); setSelectedStudent(null);
  };
  const deselectClass = () => setSelectedClass(null);

  // 헤더 검색 딥링크(?student=) → 교사/admin 뷰에서 학생 선택
  useStudentDeepLink((code) => selectStudent(code));

  // 교사/admin 뷰: 선택 학생 정보 (Header 배지 + CenterPanel 라벨)
  const studentInfoQ = useStudentBasicInfo(access.canBrowseStudents ? selectedStudent : null);
  const studentInfo = studentInfoQ.data ?? null;
  const studentLabel = studentInfo
    ? `${studentInfo.name} (${studentInfo.grade}-${studentInfo.classNum}${studentInfo.numberInClass ? ` #${studentInfo.numberInClass}` : ''})`
    : null;

  // 선택 학생을 대신 신청할 수 있는지 — admin = 전 학생, 담임 = 자기 반 학생만 (서버 RLS 와 동일).
  // 학생 정보 로딩 전(반 미상)에는 false 라 편집 UI 가 깜빡이지 않는다.
  const canEditSelected = access.canEditStudent(studentInfo?.grade, studentInfo?.classNum);

  // ---- 학생 본인 뷰 (단일 컬럼 — 학급 선택 불필요) ----
  if (access.isStudent) {
    if (!access.ownStudentCode) {
      return (
        <Layout>
          <div className="p-8 text-center text-sm text-muted-foreground">
            학생 정보를 확인할 수 없습니다. 프로필 등록 후 다시 시도하세요.
          </div>
        </Layout>
      );
    }
    return (
      <Layout fullWidth>
        <div className="flex h-full min-h-full overflow-hidden relative bg-gradient-to-b from-slate-50 via-white to-slate-50">
          <main className="flex-1 overflow-y-auto custom-scrollbar">
            {/* 학생 뷰는 글래스 Header 가 없다 → [사용 방법] 을 이 안에 둔다(끄면 학생은 안내를 못 찾는다) */}
            <WishlistView studentCode={access.ownStudentCode} readOnly={false} showGuideButton />
          </main>

          {/* 우측 성적 패널 (본인 모의/내신 — 수능최저·반영내신 계산 원천). 토글 + 너비 애니메이션 */}
          <button
            onClick={() => setIsRightPanelOpen((prev) => !prev)}
            className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-10 flex items-center justify-center bg-white border border-slate-200/80 rounded-l-lg shadow-sm hover:shadow-md text-slate-400 hover:text-brand-600 transition-all duration-200 border-r-0"
            style={{ right: isRightPanelOpen ? '18rem' : '0px', opacity: 0.85 }}
            title={isRightPanelOpen ? '성적 데이터 숨기기' : '성적 데이터 보기'}
          >
            {isRightPanelOpen
              ? <ChevronRight className="w-3.5 h-3.5" />
              : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
          <div
            className={`transition-all duration-300 ease-in-out ${isRightPanelOpen ? 'w-72' : 'w-0'}`}
            style={{ overflow: isRightPanelOpen ? 'visible' : 'hidden' }}
          >
            <div className="h-full overflow-hidden flex flex-col">
              <RightPanel studentCode={access.ownStudentCode} />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // ---- 교사/admin 뷰 (Header + LeftPanel + CenterPanel) ----
  if (!access.canBrowseStudents) {
    return (
      <Layout>
        <div className="p-8 text-center text-sm text-muted-foreground">
          이 메뉴는 담임교사·학년부장·관리자만 접근할 수 있습니다.
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
          proxyEditing={canEditSelected}
          selectedClass={selectedClass}
        />

        <div className="flex flex-1 overflow-hidden relative">
          {/* Left panel wrapper — 너비 애니메이션 열기/닫기 (LeftPanel 은 자체 w-72 보유) */}
          <div
            className={`transition-all duration-300 ease-in-out ${isLeftPanelOpen ? 'w-72' : 'w-0'}`}
            style={{ overflow: isLeftPanelOpen ? 'visible' : 'hidden' }}
          >
            <div className="h-full overflow-hidden flex flex-col">
              <LeftPanel
                selectedStudent={selectedStudent}
                selectedClass={selectedClass}
                onSelectStudent={selectStudent}
                onSelectClass={selectClass}
                onDeselectClass={deselectClass}
              />
            </div>
          </div>

          {/* 토글 버튼 — 패널 오른쪽 가장자리에 고정 */}
          <button
            onClick={() => setIsLeftPanelOpen((prev) => !prev)}
            className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-10 flex items-center justify-center bg-white border border-slate-200/80 rounded-r-lg shadow-sm hover:shadow-md text-slate-400 hover:text-brand-600 transition-all duration-200 border-l-0"
            style={{ left: isLeftPanelOpen ? '18rem' : '0px', opacity: 0.85 }}
            title={isLeftPanelOpen ? '학생 목록 숨기기' : '학생 목록 보기'}
          >
            {isLeftPanelOpen
              ? <ChevronLeft className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          <main className="flex-1 overflow-y-auto custom-scrollbar">
            <CenterPanel
              selectedStudent={selectedStudent}
              selectedClass={selectedClass}
              // admin = 전 학생, 담임 = 자기 반 학생, 학년부장 = 자기 학년 전체 대신 신청.
              canEdit={canEditSelected}
              studentLabel={studentLabel}
              onSelectStudent={selectStudent}
            />
          </main>

          {/* Right panel — 학생 선택 시에만 (성적 데이터). 우측 가장자리 토글 + 너비 애니메이션 */}
          {selectedStudent && (
            <>
              <button
                onClick={() => setIsRightPanelOpen((prev) => !prev)}
                className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-10 flex items-center justify-center bg-white border border-slate-200/80 rounded-l-lg shadow-sm hover:shadow-md text-slate-400 hover:text-brand-600 transition-all duration-200 border-r-0"
                style={{ right: isRightPanelOpen ? '18rem' : '0px', opacity: 0.85 }}
                title={isRightPanelOpen ? '성적 데이터 숨기기' : '성적 데이터 보기'}
              >
                {isRightPanelOpen
                  ? <ChevronRight className="w-3.5 h-3.5" />
                  : <ChevronLeft className="w-3.5 h-3.5" />}
              </button>
              <div
                className={`transition-all duration-300 ease-in-out ${isRightPanelOpen ? 'w-72' : 'w-0'}`}
                style={{ overflow: isRightPanelOpen ? 'visible' : 'hidden' }}
              >
                <div className="h-full overflow-hidden flex flex-col">
                  <RightPanel studentCode={selectedStudent} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
