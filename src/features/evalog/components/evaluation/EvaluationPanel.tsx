import React, { useState } from 'react';
import { FileText, ExternalLink, Copy, Info, Bot, BarChart } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import TextHighlighter from '../ui/text-highlighter';
import EvaluationCharts from '../charts/EvaluationCharts';
import CurriculumHierarchy from '../curriculum/CurriculumHierarchy';
import CurriculumSchedule from './CurriculumSchedule';
import AcademicGrades from './AcademicGrades';
import MockExamGrades from './MockExamGrades';
import GradeAnalysis from './GradeAnalysis';
import ReadingTab from './ReadingTab';
import ExtracurricularActivities from './ExtracurricularActivities';
import StudentSummary from './StudentSummary';
import SimilarityAnalysis from './SimilarityAnalysis';
import WordAnalysis from './WordAnalysis';
import CompetencyAnalysis from './CompetencyAnalysis';
import TextSearch from './TextSearch';
import TeacherObservationPanel from '../writer/TeacherObservationPanel';
import ActivityTimelineView from './ActivityTimelineView';
import { StudentInterviewRecord } from '@/features/interview-prep/components/StudentInterviewRecord';
import { Student, Evaluation } from '../../types';
import { useEvalogPermissions } from '../../hooks/useEvalogPermissions';
import type { EvalogGranularPermissions } from '../../types/permissions';
import { mapSubjectGroupToPermissionKey } from '../../types/permissions';

interface EvaluationPanelProps {
  student: Student | null;
  evaluation: Evaluation | null;
  allStudents: Student[];
  isStudent?: boolean;
}

const EvaluationPanel: React.FC<EvaluationPanelProps> = ({
  student,
  evaluation,
  allStudents,
  isStudent = false
}) => {
  const { permissions } = useEvalogPermissions(student);
  const { toast } = useToast();

  const [highlights, setHighlights] = useState<any[]>([]);

  const handleAddHighlight = (highlight: any) => {
    const newHighlight = {
      ...highlight,
      id: Date.now().toString(),
      timestamp: new Date(),
    };
    setHighlights([...highlights, newHighlight]);
  };

  const handleRemoveHighlight = (id: string) => {
    setHighlights(highlights.filter(h => h.id !== id));
  };

  const handleUpdateNote = (id: string, note: string) => {
    setHighlights(highlights.map(h =>
      h.id === id ? { ...h, note } : h
    ));
  };


  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-50/50 border border-slate-100 flex items-center justify-center">
          <FileText size={32} className="text-slate-300" />
        </div>
        <p className="text-sm font-medium">평가할 학생을 선택해주세요</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* 탭 콘텐츠 */}

      {/* 탭 콘텐츠 */}
      {/* 탭 콘텐츠 */}
      <div className="flex-1 p-4 pt-2 flex flex-col">
        <Tabs defaultValue="summary" className="flex-1 flex flex-col">
          <div className="pb-2 -mx-4 px-4 sticky top-0 z-10 bg-slate-50/80 backdrop-blur-md">
            <TabsList className="bg-slate-100/50 p-1 rounded-xl h-auto flex flex-wrap gap-0.5 w-full sm:inline-flex sm:flex-nowrap sm:w-auto border border-white/50 backdrop-blur-sm sm:whitespace-nowrap sm:overflow-x-auto sm:[&::-webkit-scrollbar]:hidden sm:[-ms-overflow-style:none] sm:[scrollbar-width:none]">
              <TabsTrigger value="text-search" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                검색
              </TabsTrigger>
              <TabsTrigger value="summary" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                요약정보
              </TabsTrigger>
              <TabsTrigger value="grades" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                교과성적
              </TabsTrigger>
              <TabsTrigger value="mock-exam" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                모의고사
              </TabsTrigger>
              <TabsTrigger value="grade-analysis" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                성적분석
              </TabsTrigger>
              {!isStudent && <TabsTrigger value="activities" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                비교과
              </TabsTrigger>}
              <TabsTrigger value="schedule" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                교육과정
              </TabsTrigger>
              <TabsTrigger value="curriculum" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                과목위계
              </TabsTrigger>
              {!isStudent && <TabsTrigger value="similarity" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                유사도
              </TabsTrigger>}
              <TabsTrigger value="word-analysis" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                단어분석
              </TabsTrigger>
              <TabsTrigger value="keyword-analysis" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                역량분석
              </TabsTrigger>
              <TabsTrigger value="reading" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                독서
              </TabsTrigger>
              {/* 평가자료 탭 비활성화 — TabsContent는 아래 유지 (다시 활성화 시 이 블록 복원) */}
              {/* {!isStudent && <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                평가자료
              </TabsTrigger>} */}
              {!isStudent && <TabsTrigger value="notes" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                관찰노트
              </TabsTrigger>}
              <TabsTrigger value="ai-analysis" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                활동 타임라인
              </TabsTrigger>
              {/* 면접 준비 — 학생이 `/interview-prep` 에서 답한 기록. 학생 시점에서는
                  숨긴다(학생은 자기 메뉴에서 더 나은 화면으로 본다). 트리거와
                  TabsContent 를 **같은 조건**으로 막는다 — 한쪽만 막으면 조건이 어긋난다. */}
              {!isStudent && <TabsTrigger value="interview-prep" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm px-2.5 sm:px-4 py-1.5 text-xs font-medium text-slate-500 transition-all">
                면접 준비
              </TabsTrigger>}
            </TabsList>
          </div>

          <div className="flex-1 flex flex-col rounded-2xl bg-white/40 border border-white/50 shadow-inner mt-2 overflow-y-auto custom-scrollbar min-h-0">
            {/* 텍스트 검색 탭 */}
            <TabsContent value="text-search" className="p-4 m-0 h-full">
              <TextSearch student={student} />
            </TabsContent>

            {/* 지원자 요약정보 탭 */}
            <TabsContent value="summary" className="p-4 m-0">
              <StudentSummary student={student} />
            </TabsContent>

            {/* 학생부(교과) 탭 */}
            <TabsContent value="grades" className="p-4 m-0">
              <AcademicGrades student={student} permissions={permissions} />
            </TabsContent>

            {/* 모의고사 성적 탭 */}
            <TabsContent value="mock-exam" className="p-4 m-0">
              <MockExamGrades student={student} />
            </TabsContent>

            {/* 성적분석 탭 */}
            <TabsContent value="grade-analysis" className="p-4 m-0">
              <GradeAnalysis student={student} />
            </TabsContent>

            {/* 학생부(비교과) 탭 — 학생에게는 감춘다(2026-09-04 사용자 결정).
                트리거뿐 아니라 콘텐츠도 함께 막아 두 곳의 조건이 어긋나지 않게 한다. */}
            {!isStudent && (
              <TabsContent value="activities" className="p-4 m-0">
                <ExtracurricularActivities student={student} permissions={permissions} />
              </TabsContent>
            )}

            {/* 편제및시간배당 탭 */}
            <TabsContent value="schedule" className="p-4 m-0">
              <CurriculumSchedule student={student} />
            </TabsContent>

            {/* 과목위계 탭 */}
            <TabsContent value="curriculum" className="p-4 m-0">
              <CurriculumHierarchy student={student} />
            </TabsContent>

            {/* 유사도 탭 — 다른 학생과의 대조라 학생에게는 감춘다 */}
            {!isStudent && (
              <TabsContent value="similarity" className="p-4 m-0">
                <SimilarityAnalysis student={student} permissions={permissions} />
              </TabsContent>
            )}

            {/* 비교과 단어 분석 탭 */}
            <TabsContent value="word-analysis" className="p-4 m-0">
              <WordAnalysis student={student} />
            </TabsContent>

            {/* 역량분석 탭 (구 '키워드분석', 2026-09-12).
                `value`는 `keyword-analysis`로 **유지한다** — 이 값은 화면 상태 키라
                라벨이 바뀌어도 함께 바꿀 이유가 없고, 바꾸면 인쇄 레지스트리의
                `tabLabel` 짝과 딥링크가 조용히 어긋난다. */}
            <TabsContent value="keyword-analysis" className="p-4 m-0">
              <CompetencyAnalysis student={student} />
            </TabsContent>

            {/* 독서 탭 */}
            <TabsContent value="reading" className="p-4 m-0">
              <ReadingTab student={student} />
            </TabsContent>

            <TabsContent value="charts" className="p-4 m-0">
              <EvaluationCharts
                student={student}
                evaluation={evaluation}
                allStudents={allStudents}
              />
            </TabsContent>

            {/* External Documents & Tools Tab (Renamed from Documents) */}
            <TabsContent value="documents" className="p-4 m-0 h-full">
              <div className="h-full bg-white rounded-xl border border-slate-100 shadow-sm p-8 flex flex-col items-center justify-center space-y-10">

                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-bold text-slate-800">외부 평가 자료 및 도구</h3>
                  <p className="text-slate-500">리로스쿨 포트폴리오와 Google NotebookLM을 활용하여 심층적인 평가를 진행하세요.</p>
                </div>

                <div className="w-full max-w-2xl grid gap-6">
                  {/* Option 1: Riroschool */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 hover:shadow-md transition-all group">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm">
                        R
                      </div>
                      <div className="text-left">
                        <h4 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">리로스쿨 포트폴리오</h4>
                        <p className="text-sm text-slate-500">학생의 누적된 활동 기록과 포트폴리오를 조회합니다.</p>
                      </div>
                    </div>
                    <Button
                      className="w-full h-11 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-sm font-medium"
                      onClick={() => {
                        const id = student.studentId || student.studentNo;
                        if (id) {
                          window.open(`https://kijun.riroschool.kr/portfolio.php?action=article&db=1551&my_id=${id}&dbn=1502`, '_blank');
                        } else {
                          // Toast or alert if no ID?
                        }
                      }}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      포트폴리오 새 창에서 열기
                    </Button>
                  </div>

                  {/* Option 2: NotebookLM */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 hover:shadow-md transition-all group">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white shadow-sm">
                        <FileText className="h-6 w-6" />
                      </div>
                      <div className="text-left">
                        <h4 className="font-semibold text-slate-900 group-hover:text-purple-600 transition-colors">Google NotebookLM</h4>
                        <p className="text-sm text-slate-500">AI를 활용하여 학생 데이터를 심층 분석하고 질의응답을 진행합니다.</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        className="flex-1 h-11 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-purple-600 transition-colors shadow-sm font-medium"
                        onClick={() => window.open('https://notebooklm.google.com/', '_blank')}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        NotebookLM 열기
                      </Button>
                      <Button
                        className="flex-1 h-11 bg-slate-800 text-white hover:bg-slate-700 transition-colors shadow-sm font-medium"
                        onClick={() => {
                          // 권한 기반 필터링: 접근 불가 영역 제거
                          const filtered: Record<string, any> = { ...student };

                          if (!permissions.attendance) delete filtered.section2_attendance;
                          if (!permissions.behavior) delete filtered.section8_behavior_characteristics;

                          // 비교과 활동 필터링
                          if (filtered.section5_creative_activities) {
                            filtered.section5_creative_activities = filtered.section5_creative_activities.filter((a: any) => {
                              if (a.type === '자율활동') return permissions.autonomy;
                              if (a.type === '동아리활동') return permissions.club;
                              if (a.type === '진로활동') return permissions.career_activity;
                              return true;
                            });
                          }

                          if (!permissions.volunteer) delete filtered.volunteer_activities;

                          // 세특 필터링
                          if (filtered.section6_academic_development) {
                            filtered.section6_academic_development = filtered.section6_academic_development.filter((s: any) => {
                              return permissions.canViewSeteuk(s.subject_group || s.category || '');
                            });
                          }

                          const dataToCopy = JSON.stringify(filtered, null, 2);
                          navigator.clipboard.writeText(dataToCopy).then(() => {
                            toast({ title: '학생 데이터가 클립보드에 복사되었습니다.' });
                          });
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mr-2"
                        >
                          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                        </svg>
                        학생 데이터 복사
                      </Button>
                    </div>

                    <div className="mt-4 p-3 bg-blue-50/50 border border-blue-100 rounded-lg flex gap-3 text-sm text-slate-600">
                      <div className="shrink-0 mt-0.5 text-blue-500">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 16v-4" />
                          <path d="M12 8h.01" />
                        </svg>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-800">사용 팁:</span> '데이터 복사' 후 NotebookLM에서 <span className="inline-block px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-700 mx-1">소스 추가</span> &gt; <span className="inline-block px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-700 mx-1">복사된 텍스트</span>를 선택하여 붙여넣으세요. 우측 스튜디오 메뉴에서 마인드맵 등 원하는 형태로 자료를 분석할 수 있습니다.
                      </div>
                    </div>
                  </div>

                  {/* Option 3: Riroschool Grade Analysis */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 hover:shadow-md transition-all group">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm">
                        <BarChart className="h-6 w-6" />
                      </div>
                      <div className="text-left">
                        <h4 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">리로스쿨 성적분석자료</h4>
                        <p className="text-sm text-slate-500">학생의 내신성적, 모의성적을 분석하는 자료를 조회합니다.</p>
                      </div>
                    </div>
                    <Button
                      className="w-full h-11 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-indigo-600 transition-colors shadow-sm font-medium"
                      onClick={() => {
                        const id = student.studentId || student.studentNo;
                        if (id) {
                          window.open(`https://kijun.riroschool.kr/board.php?action=stat_all&hide_plan=checked&code=44f5b1868e58be94761452f34b57aeab&db=1010&my_id=${id}`, '_blank');
                        }
                      }}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      성적분석자료 새 창에서 열기
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* 관찰노트 — 교사가 쓰는 메모라 학생에게는 감춘다 */}
            {!isStudent && (
            <TabsContent value="notes" className="p-4 m-0 h-full">
              <div className="h-full bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <TeacherObservationPanel
                  studentId={student.studentId || student.studentNo || ''}
                  studentName={student.name}
                  readonly={true}
                />
              </div>
            </TabsContent>
            )}

            {/* 활동 타임라인 탭 (구 'AI 분석', 2026-09-12 개편).
                기록별 AI 요약은 이 안의 두 번째 보기로 그대로 남아 있다. */}
            <TabsContent value="ai-analysis" className="p-4 m-0">
              <ActivityTimelineView student={student} />
            </TabsContent>

            {/* 면접 준비 — 트리거와 같은 조건으로 막는다(위 주석 참고). */}
            {!isStudent && (
              <TabsContent value="interview-prep" className="p-4 m-0">
                <StudentInterviewRecord studentCode={student.studentId || student.id} />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div >
    </div >
  );
};

export default EvaluationPanel;