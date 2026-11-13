import React from 'react';
import {
  StudentDashboardData,
  useAfterSchoolEnrollments,
  useCareerSubmissions,
  CareerSubmission,
} from '@/hooks/useStudentDashboard';
import { AfterschoolTermList } from './AfterschoolTermList';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Activity,
  BookOpen,
  Calendar,
  Clock,
  ExternalLink,
  GraduationCap,
  Heart,
  Loader2,
  MapPin,
  School,
  Target,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StudentDetailDialogProps {
  student: StudentDashboardData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Section Component (evalog pattern)
const Section = ({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn('bg-white/60 border border-white/50 rounded-xl p-5 shadow-sm', className)}>
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100/50">
      <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
        <Icon size={18} />
      </div>
      <h3 className="font-semibold text-slate-800">{title}</h3>
    </div>
    {children}
  </div>
);

// Calculate byte size (copied from evalog)
function calculateByteSize(text: string): number {
  if (!text) return 0;
  let bytes = 0;
  for (const char of text) {
    if (char === '\n') bytes += 2;
    else if (/[가-힣]/.test(char)) bytes += 3;
    else bytes += 1;
  }
  return bytes;
}

// Extract real content (copied from evalog)
function extractRealContent(text: string | null | undefined): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return text;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed['특기사항'] ?? parsed['세부능력 및 특기사항'] ?? parsed['content'] ?? '';
  } catch {
    return text;
  }
}

export const StudentDetailDialog: React.FC<StudentDetailDialogProps> = ({
  student,
  open,
  onOpenChange,
}) => {
  // Fetch additional data when dialog opens
  const { data: afterschoolData, isLoading: afterschoolLoading } = useAfterSchoolEnrollments(
    open ? student?.student_code ?? null : null
  );
  const { data: careerData, isLoading: careerLoading } = useCareerSubmissions(
    open ? student?.student_code ?? null : null
  );

  if (!student) return null;

  const initials = student.name ? student.name.slice(0, 2) : '??';

  // Render volunteer activities
  const renderVolunteerActivities = () => {
    const volunteer = student.volunteer;
    if (!volunteer) return null;

    // Handle array of volunteer activities
    if (Array.isArray(volunteer) && volunteer.length > 0) {
      const groupedByGrade: Record<number, any[]> = {};
      volunteer.forEach((activity: any) => {
        const grade = activity.grade || 1;
        if (!groupedByGrade[grade]) groupedByGrade[grade] = [];
        groupedByGrade[grade].push(activity);
      });

      const totalHours = volunteer.reduce((sum: number, a: any) => sum + (parseFloat(a.hours) || 0), 0);

      return (
        <Section title="봉사활동" icon={Heart}>
          <div className="grid gap-6">
            {[1, 2, 3].map((grade) => {
              const gradeActivities = groupedByGrade[grade];
              if (!gradeActivities || gradeActivities.length === 0) return null;

              return (
                <div key={grade} className="flex gap-4">
                  <div className="flex-shrink-0 w-16 pt-2 text-center">
                    <div className="w-10 h-10 mx-auto rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold shadow-sm border border-orange-200">
                      {grade}
                    </div>
                    <span className="text-xs text-slate-500 mt-1 block">학년</span>
                  </div>
                  <div className="flex-1 space-y-3">
                    {gradeActivities.map((activity: any, idx: number) => (
                      <div
                        key={idx}
                        className="bg-white/60 p-3 rounded-xl border border-white/50 shadow-sm flex items-start sm:items-center gap-3 flex-col sm:flex-row"
                      >
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                            <Calendar size={14} />
                          </div>
                          <span className="text-xs font-medium text-slate-700">
                            {activity.dateOrPeriod || activity.date || '-'}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-slate-800">
                            {activity.institution || activity.place || '장소 없음'}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            {activity.activity || extractRealContent(activity.content)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded-lg text-xs font-bold border border-orange-100">
                            {activity.hours}시간
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="flex justify-end pt-4 border-t border-dashed border-gray-200">
              <div className="flex items-center gap-3 bg-brand-50 px-4 py-2 rounded-xl border border-brand-100">
                <span className="text-sm text-brand-700">전체 누계 시간</span>
                <span className="text-xl font-bold text-brand-600">{totalHours}시간</span>
              </div>
            </div>
          </div>
        </Section>
      );
    }

    // Handle simple object/string
    return (
      <Section title="봉사활동" icon={Heart}>
        <p className="text-sm text-slate-700">
          {typeof volunteer === 'object' ? JSON.stringify(volunteer) : volunteer}
        </p>
      </Section>
    );
  };

  // Render reading activities
  const renderReadingActivities = () => {
    const reading = student.reading;
    if (!reading) return null;

    if (Array.isArray(reading) && reading.length > 0) {
      return (
        <Section title="독서활동" icon={BookOpen}>
          <div className="space-y-3">
            {reading.map((item: any, idx: number) => (
              <div key={idx} className="bg-white/60 p-3 rounded-xl border border-white/50 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  {item.grade && (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-xs font-medium border border-emerald-100">
                      {item.grade}학년
                    </span>
                  )}
                  {item.title && <span className="text-sm font-semibold text-slate-800">{item.title}</span>}
                </div>
                {item.author && <p className="text-xs text-slate-500">저자: {item.author}</p>}
                {item.content && (
                  <p className="text-sm text-slate-600 mt-2">{extractRealContent(item.content)}</p>
                )}
              </div>
            ))}
          </div>
        </Section>
      );
    }

    return (
      <Section title="독서활동" icon={BookOpen}>
        <p className="text-sm text-slate-700">
          {typeof reading === 'object' ? JSON.stringify(reading) : reading}
        </p>
      </Section>
    );
  };

  // Render academic development (세부능력 및 특기사항)
  const renderAcademicDevelopment = () => {
    const academicDev = student.academic_development;
    if (!academicDev || academicDev.length === 0) return null;

    // Group by grade
    const groupedByGrade: Record<string, any[]> = {};
    academicDev.forEach((subject: any) => {
      const grade = subject.grade?.toString() || '1';
      if (!groupedByGrade[grade]) groupedByGrade[grade] = [];
      groupedByGrade[grade].push(subject);
    });

    return (
      <Section title="세부능력 및 특기사항" icon={GraduationCap}>
        <div className="space-y-6">
          {['1', '2', '3'].map((grade) => {
            const gradeSubjects = groupedByGrade[grade];
            if (!gradeSubjects || gradeSubjects.length === 0) return null;

            // Merge same subjects across semesters
            const mergedMap = new Map<string, any>();
            gradeSubjects.forEach((subject: any) => {
              const subjectName = subject.subject || subject.subject_name || 'Unknown';
              const content = extractRealContent(subject.content || subject.remarks || '');
              if (!content.trim()) return;

              if (mergedMap.has(subjectName)) {
                const existing = mergedMap.get(subjectName);
                if (content !== existing.content) {
                  existing.content = existing.content + '\n' + content;
                }
              } else {
                mergedMap.set(subjectName, { ...subject, content });
              }
            });

            const merged = Array.from(mergedMap.values());
            if (merged.length === 0) return null;

            return (
              <div key={grade} className="flex gap-4">
                <div className="flex-shrink-0 w-12 pt-2 text-center hidden sm:block">
                  <div className="h-full w-0.5 bg-gray-200 mx-auto relative">
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 bg-white border-2 border-gray-200 text-gray-400 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                      {grade}
                    </span>
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-1 gap-3">
                  <h4 className="text-sm font-semibold text-slate-500 pl-1 mb-1 block sm:hidden">
                    {grade}학년
                  </h4>
                  {merged.map((subject: any, idx: number) => {
                    const content = subject.content;
                    const byteSize = calculateByteSize(content);

                    return (
                      <div
                        key={`${grade}-${idx}`}
                        className="bg-white/70 p-4 rounded-xl border border-white/60 shadow-sm hover:shadow-md transition-shadow group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-medium border border-slate-200">
                              {subject.subject_group || subject.category || '교과'}
                            </span>
                            <span className="text-sm font-bold text-slate-800">
                              {subject.subject || subject.subject_name}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-300 font-mono group-hover:text-slate-400 transition-colors">
                            {byteSize}B
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed font-normal whitespace-pre-wrap">
                          {content}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    );
  };

  // Render afterschool enrollments — 학년도·학년별 (묶는 규칙은 utils/afterschoolTerms.ts)
  const renderAfterSchool = () => (
    <AfterschoolTermList enrollments={afterschoolData} isLoading={afterschoolLoading} />
  );

  // Render career submissions (리로스쿨)
  const renderCareerSubmissions = () => {
    if (careerLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
          <span className="ml-2 text-slate-500">불러오는 중...</span>
        </div>
      );
    }

    if (!careerData || careerData.length === 0) {
      return (
        <div className="text-center py-12 text-slate-400">
          <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>등록된 리로스쿨 과제 내역이 없습니다</p>
        </div>
      );
    }

    // Group by board_name
    const groupedByBoard: Record<string, CareerSubmission[]> = {};
    careerData.forEach((submission) => {
      const boardName = submission.board_name || '기타';
      if (!groupedByBoard[boardName]) groupedByBoard[boardName] = [];
      groupedByBoard[boardName].push(submission);
    });

    return (
      <div className="space-y-4">
        {/* Summary */}
        <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">총 제출 과제</p>
              <p className="text-2xl font-bold text-indigo-600">{careerData.length}건</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600">게시판 수</p>
              <p className="text-2xl font-bold text-purple-600">{Object.keys(groupedByBoard).length}개</p>
            </div>
          </div>
        </div>

        {/* Grouped by Board */}
        {Object.entries(groupedByBoard).map(([boardName, submissions]) => (
          <Section key={boardName} title={boardName} icon={Activity} className="!p-4">
            <div className="space-y-2">
              {submissions.map((submission: CareerSubmission) => (
                <div
                  key={submission.id}
                  className="p-3 bg-white/70 rounded-lg border border-white/50 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {submission.assignment_name}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-1 text-xs text-slate-500">
                        {submission.teacher_in_charge && (
                          <span className="flex items-center gap-1">
                            <User size={12} />
                            {submission.teacher_in_charge}
                          </span>
                        )}
                        {submission.deadline && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            마감: {submission.deadline}
                          </span>
                        )}
                        {submission.submission_datetime && (
                          <span className="flex items-center gap-1 text-green-600">
                            <Calendar size={12} />
                            제출: {submission.submission_datetime}
                          </span>
                        )}
                      </div>
                    </div>
                    {submission.material_link_url && (
                      <a
                        href={submission.material_link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                        title="자료 링크 열기"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="student-dashboard-wrapper max-w-2xl max-h-[85vh] p-0 overflow-hidden border-border bg-card text-card-foreground">
        {/* 헤더 - 프로필 */}
        <DialogHeader className="p-6 pb-4 bg-gradient-to-br from-primary/5 to-secondary/50 border-b border-border">
          <div className="flex items-start gap-4">
            <Avatar className="h-20 w-20 ring-4 ring-white shadow-lg">
              <AvatarImage src={student.picture || undefined} alt={student.name} />
              <AvatarFallback className="bg-gradient-to-br from-brand-400 to-brand-600 text-white text-xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <DialogTitle className="text-xl font-bold text-foreground mb-1">
                {student.name}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mb-2">
                {student.grade}학년 {student.class_num}반 {student.number}번 ({student.student_code})
              </p>
              <div className="flex flex-wrap gap-2">
                {student.major && (
                  <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                    <GraduationCap className="h-3 w-3 mr-1" />
                    {student.major}
                  </Badge>
                )}
                {student.career && (
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                    <Target className="h-3 w-3 mr-1" />
                    {student.career}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* 탭 컨텐츠 */}
        <Tabs defaultValue="overview" className="flex-1">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-muted/40 px-6 overflow-x-auto">
            <TabsTrigger value="overview">개요</TabsTrigger>
            <TabsTrigger value="study-room">자습실</TabsTrigger>
            <TabsTrigger value="academic">학업</TabsTrigger>
            <TabsTrigger value="activities">활동</TabsTrigger>
            <TabsTrigger value="afterschool">방과후</TabsTrigger>
            <TabsTrigger value="career">리로스쿨</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[400px]">
            {/* 개요 탭 */}
            <TabsContent value="overview" className="p-6 pt-4 m-0">
              <div className="grid grid-cols-2 gap-4">
                {/* 자습실 이용 현황 */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-indigo-500" />
                      자습실 이용
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">총 예약</span>
                        <span className="font-bold text-lg text-foreground">
                          {student.total_reservations}회
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">출석</span>
                        <span className="font-semibold text-green-600">{student.attended_count}회</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">출석률</span>
                        <span
                          className={cn(
                            'font-bold text-lg',
                            student.attendance_rate >= 80
                              ? 'text-green-600'
                              : student.attendance_rate >= 50
                                ? 'text-amber-600'
                                : 'text-red-600'
                          )}
                        >
                          {student.attendance_rate}%
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 기본 정보 */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                      <User className="h-4 w-4 text-blue-500" />
                      기본 정보
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      {student.birthday && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">생년월일</span>
                          <span className="text-slate-700">{student.birthday}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">학번</span>
                        <span className="text-slate-700 font-mono">{student.student_no}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* 자습실 탭 */}
            <TabsContent value="study-room" className="p-6 pt-4 m-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-5 w-5 text-indigo-500" />
                    자습실 이용 통계
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <p className="text-2xl font-bold text-slate-800">{student.total_reservations}</p>
                      <p className="text-xs text-slate-500 mt-1">총 예약</p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{student.attended_count}</p>
                      <p className="text-xs text-slate-500 mt-1">출석</p>
                    </div>
                    <div className="p-4 bg-amber-50 rounded-lg">
                      <p className="text-2xl font-bold text-amber-600">
                        {student.total_reservations - student.attended_count}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">미출석</p>
                    </div>
                  </div>

                  {/* 출석률 바 */}
                  <div className="mt-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-500">출석률</span>
                      <span className="font-semibold">{student.attendance_rate}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full transition-all duration-500',
                          student.attendance_rate >= 80
                            ? 'bg-green-500'
                            : student.attendance_rate >= 50
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                        )}
                        style={{ width: `${student.attendance_rate}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 학업 탭 */}
            <TabsContent value="academic" className="p-6 pt-4 m-0">
              {renderAcademicDevelopment() || (
                <div className="text-center py-12 text-slate-400">
                  <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>등록된 학업 발달 사항이 없습니다</p>
                </div>
              )}
            </TabsContent>

            {/* 활동 탭 (evalog 비교과 스타일) */}
            <TabsContent value="activities" className="p-6 pt-4 m-0">
              <div className="space-y-6">
                {renderVolunteerActivities()}
                {renderReadingActivities()}
                {!student.volunteer && !student.reading && (
                  <div className="text-center py-12 text-slate-400">
                    <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>등록된 활동 내역이 없습니다</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* 방과후 탭 */}
            <TabsContent value="afterschool" className="p-6 pt-4 m-0">
              {renderAfterSchool()}
            </TabsContent>

            {/* 리로스쿨 탭 */}
            <TabsContent value="career" className="p-6 pt-4 m-0">
              {renderCareerSubmissions()}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default StudentDetailDialog;
