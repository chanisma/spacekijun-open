/**
 * Class Detail Panel Component
 * 반 상세 정보 사이드 패널 (Sheet)
 */

import React, { useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Users,
  BookOpen,
  GraduationCap,
  Search,
  ChevronDown,
  ChevronUp,
  Beaker,
  Calculator,
  Globe,
  Palette,
  Lock,
  X,
} from 'lucide-react';
import type { ClassAssignment, StudentData } from '../../types/class-assignment.types';
import { useClassAssignmentContext } from '../../context/ClassAssignmentContext';
import { getStudentSubjects } from '../../utils/algorithms/subjectBased';
import { getClassDetails, detectGradeScale } from '../../utils/statistics';

interface ClassDetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  classAssignment: ClassAssignment | null;
}

// 과목 카테고리 매핑
const SUBJECT_CATEGORIES: { [key: string]: { icon: React.ReactNode; color: string } } = {
  '과학': { icon: <Beaker className="h-3 w-3" />, color: 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800' },
  '수학': { icon: <Calculator className="h-3 w-3" />, color: 'text-purple-600 bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800' },
  '사회': { icon: <Globe className="h-3 w-3" />, color: 'text-green-600 bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' },
  '예체능': { icon: <Palette className="h-3 w-3" />, color: 'text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800' },
  '기타': { icon: <BookOpen className="h-3 w-3" />, color: 'text-gray-600 bg-gray-50 border-gray-200 dark:bg-gray-950 dark:border-gray-800' },
};

// 과목에서 카테고리 추론
function getSubjectCategory(subject: string): string {
  const scienceKeywords = ['물리', '화학', '생명', '지구과학', '과학'];
  const mathKeywords = ['수학', '확률', '통계', '미적분', '기하'];
  const socialKeywords = ['정치', '경제', '사회', '지리', '역사', '윤리', '세계'];
  const artKeywords = ['미술', '음악', '체육', '연극', '무용'];

  if (scienceKeywords.some(k => subject.includes(k))) return '과학';
  if (mathKeywords.some(k => subject.includes(k))) return '수학';
  if (socialKeywords.some(k => subject.includes(k))) return '사회';
  if (artKeywords.some(k => subject.includes(k))) return '예체능';
  return '기타';
}

// 학생 카드 컴포넌트
const StudentDetailCard: React.FC<{
  student: StudentData;
  isLocked: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ student, isLocked, isExpanded, onToggle }) => {
  const subjects = getStudentSubjects(student);
  const avgGrade = (student as any).averageGrade;

  return (
    <div
      className={`p-3 rounded-lg border transition-all cursor-pointer hover:bg-muted/50 ${
        isLocked ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20' : 'border-border'
      }`}
      onClick={onToggle}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {isLocked && <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{student.name}</div>
            <div className="text-xs text-muted-foreground">
              {student.class_num}반 {student.number}번
              {avgGrade && ` · ${avgGrade.toFixed(1)}등급`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {subjects.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {subjects.length}과목
            </Badge>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* 확장된 내용 */}
      {isExpanded && subjects.length > 0 && (
        <div className="mt-3 pt-3 border-t space-y-2">
          {student.courseSelections?.semester1 && student.courseSelections.semester1.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5">1학기</div>
              <div className="flex flex-wrap gap-1">
                {student.courseSelections.semester1.map((s, i) => {
                  const category = getSubjectCategory(s);
                  const style = SUBJECT_CATEGORIES[category] || SUBJECT_CATEGORIES['기타'];
                  return (
                    <Badge
                      key={i}
                      variant="outline"
                      className={`text-xs ${style.color}`}
                    >
                      {style.icon}
                      <span className="ml-1">{s}</span>
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
          {student.courseSelections?.semester2 && student.courseSelections.semester2.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5">2학기</div>
              <div className="flex flex-wrap gap-1">
                {student.courseSelections.semester2.map((s, i) => {
                  const category = getSubjectCategory(s);
                  const style = SUBJECT_CATEGORIES[category] || SUBJECT_CATEGORIES['기타'];
                  return (
                    <Badge
                      key={i}
                      variant="outline"
                      className={`text-xs ${style.color}`}
                    >
                      {style.icon}
                      <span className="ml-1">{s}</span>
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {isExpanded && subjects.length === 0 && (
        <div className="mt-3 pt-3 border-t text-xs text-muted-foreground text-center">
          과목 선택 데이터 없음
        </div>
      )}
    </div>
  );
};

export const ClassDetailPanel: React.FC<ClassDetailPanelProps> = ({
  isOpen,
  onClose,
  classAssignment,
}) => {
  const { lockedStudents } = useClassAssignmentContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());

  // 반 상세 통계
  const classDetails = useMemo(() => {
    if (!classAssignment) return null;
    const gradeScale = detectGradeScale(classAssignment.students);
    return getClassDetails(classAssignment, gradeScale);
  }, [classAssignment]);

  // 필터링된 학생 목록 (가나다순)
  const filteredStudents = useMemo(() => {
    if (!classAssignment) return [];
    const students = !searchQuery.trim()
      ? classAssignment.students
      : classAssignment.students.filter(s => {
          const query = searchQuery.toLowerCase();
          return s.name.toLowerCase().includes(query) || s.student_code.includes(query);
        });
    return [...students].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [classAssignment, searchQuery]);

  // 과목별 학생 수 집계
  const subjectStats = useMemo(() => {
    if (!classAssignment) return [];

    const stats: Map<string, number> = new Map();
    classAssignment.students.forEach(s => {
      getStudentSubjects(s).forEach(subj => {
        stats.set(subj, (stats.get(subj) || 0) + 1);
      });
    });

    return Array.from(stats.entries())
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count);
  }, [classAssignment]);

  const toggleStudent = (studentCode: string) => {
    const newExpanded = new Set(expandedStudents);
    if (newExpanded.has(studentCode)) {
      newExpanded.delete(studentCode);
    } else {
      newExpanded.add(studentCode);
    }
    setExpandedStudents(newExpanded);
  };

  const expandAll = () => {
    if (!classAssignment) return;
    setExpandedStudents(new Set(classAssignment.students.map(s => s.student_code)));
  };

  const collapseAll = () => {
    setExpandedStudents(new Set());
  };

  if (!classAssignment) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        {/* 헤더 */}
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {classAssignment.classNum}반
              {classAssignment.specialClass && classAssignment.specialConfig && (
                <Badge variant="secondary" className="text-xs">
                  {classAssignment.specialConfig.name}
                </Badge>
              )}
            </SheetTitle>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            <span>{classAssignment.students.length}명</span>
            {classDetails && (
              <span>평균 {classDetails.averageGrade.toFixed(1)}등급</span>
            )}
          </div>
        </SheetHeader>

        {/* 탭 컨텐츠 */}
        <Tabs defaultValue="students" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mx-6 mt-4 max-w-[calc(100%-3rem)]">
            <TabsTrigger value="students" className="text-xs">
              학생
            </TabsTrigger>
            <TabsTrigger value="subjects" className="text-xs">
              과목 분포
            </TabsTrigger>
            <TabsTrigger value="statistics" className="text-xs">
              통계
            </TabsTrigger>
          </TabsList>

          {/* 학생 탭 */}
          <TabsContent value="students" className="flex-1 flex flex-col min-h-0 mt-0 px-6 pb-6">
            <div className="flex items-center gap-2 py-4 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="학생 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={expandAll} className="text-xs h-9">
                펼치기
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll} className="text-xs h-9">
                접기
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredStudents.map((student) => (
                <StudentDetailCard
                  key={student.student_code}
                  student={student}
                  isLocked={lockedStudents.has(student.student_code)}
                  isExpanded={expandedStudents.has(student.student_code)}
                  onToggle={() => toggleStudent(student.student_code)}
                />
              ))}
              {filteredStudents.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  검색 결과가 없습니다.
                </div>
              )}
            </div>
          </TabsContent>

          {/* 과목 분포 탭 */}
          <TabsContent value="subjects" className="flex-1 overflow-y-auto mt-0 px-6 pb-6">
            {subjectStats.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                과목 선택 데이터가 없습니다.
              </div>
            ) : (
              <div className="space-y-2 pt-4">
                {subjectStats.map(({ subject, count }) => {
                  const category = getSubjectCategory(subject);
                  const style = SUBJECT_CATEGORIES[category] || SUBJECT_CATEGORIES['기타'];
                  const percentage = (count / classAssignment.students.length * 100).toFixed(0);

                  return (
                    <div
                      key={subject}
                      className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30"
                    >
                      <Badge variant="outline" className={`${style.color} shrink-0`}>
                        {style.icon}
                      </Badge>
                      <span className="flex-1 text-sm truncate">{subject}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-14 text-right">
                          {count}명 ({percentage}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* 통계 탭 */}
          <TabsContent value="statistics" className="flex-1 overflow-y-auto mt-0 px-6 pb-6">
            {classDetails && (
              <div className="space-y-4 pt-4">
                {/* 기본 통계 */}
                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-medium text-sm mb-3">기본 정보</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">학생 수</span>
                        <span className="font-medium">{classDetails.studentCount}명</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">평균 등급</span>
                        <span className="font-medium">{classDetails.averageGrade.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">등급 체계</span>
                        <span className="font-medium">{classDetails.gradeScale}등급제</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">출신 반 수</span>
                        <span className="font-medium">
                          {Object.keys(classDetails.originDistribution).length}개
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 성적 분포 */}
                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-medium text-sm mb-3">성적 분포</h4>
                    <div className="space-y-2">
                      {Object.entries(classDetails.gradeDistribution).map(([label, count]) => {
                        const percentage = classDetails.studentCount > 0
                          ? (count / classDetails.studentCount * 100).toFixed(0)
                          : 0;
                        return (
                          <div key={label} className="flex items-center gap-2">
                            <span className="text-sm w-20 shrink-0">{label}</span>
                            <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                              {count}명 ({percentage}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* 출신반 분포 */}
                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-medium text-sm mb-3">출신반 분포</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(classDetails.originDistribution)
                        .sort((a, b) => b[1] - a[1])
                        .map(([originClass, count]) => (
                          <Badge key={originClass} variant="outline">
                            {originClass}반: {count}명
                          </Badge>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};
