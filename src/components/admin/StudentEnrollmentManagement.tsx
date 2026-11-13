import { useMemo, useState } from 'react';
import { Users, Upload, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  useEnrollmentTerms,
  useEnrollments,
  useDeleteEnrollment,
  groupBySubjectClassroom,
} from '@/features/student-enrollment/hooks/useStudentEnrollments';
import { StudentEnrollmentXlsxUploadDialog } from '@/features/student-enrollment/components/StudentEnrollmentXlsxUploadDialog';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import { mergeTermOptions } from './timetableTermOptions';
import { WorkflowInfoBanner } from './WorkflowInfoBanner';

export function StudentEnrollmentManagement() {
  const { toast } = useToast();
  const { data: terms = [], isLoading: loadingTerms } = useEnrollmentTerms();
  // 기본 선택 학기 = 학사력. 구 구현은 terms[0]을 썼는데 terms가 학기 오름차순이라
  // 2학기 데이터를 올려도 항상 1학기가 잡혔다(시간표 관리 화면과 같은 문제·같은 해법).
  const { data: academicTerm } = useAcademicTerm();
  const [academicYear, setAcademicYear] = useState<number | null>(null);
  const [semester, setSemester] = useState<number | null>(null);
  const [academicGrade, setAcademicGrade] = useState<number | null>(1);
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);

  const effectiveAY = academicYear ?? academicTerm?.year ?? terms[0]?.academicYear ?? null;
  const effectiveSem = semester ?? academicTerm?.semester ?? terms[0]?.semester ?? null;

  // 학사력 학기는 아직 편성 데이터가 없어도 선택 가능해야 한다(새 학기 업로드 대상).
  const termOptions = mergeTermOptions(terms, academicTerm);

  const { data: rows = [], isLoading: loadingRows } = useEnrollments({
    academicYear: effectiveAY,
    semester: effectiveSem,
  });

  const deleteMut = useDeleteEnrollment();

  const filteredRows = useMemo(() => {
    let r = rows;
    if (academicGrade != null) r = r.filter((x) => x.academic_grade === academicGrade);
    if (search.trim()) {
      const s = search.trim();
      r = r.filter((x) =>
        x.subject_name.includes(s) ||
        x.student_name.includes(s) ||
        (x.classroom ?? '').includes(s)
      );
    }
    return r;
  }, [rows, academicGrade, search]);

  const groups = useMemo(() => groupBySubjectClassroom(filteredRows), [filteredRows]);

  const matchStats = useMemo(() => {
    const total = filteredRows.length;
    return {
      total,
      curMissing: filteredRows.filter((r) => !r.curriculum_id).length,
      offMissing: filteredRows.filter((r) => !r.course_offering_id).length,
      stuMissing: filteredRows.filter((r) => !r.student_resource_id).length,
    };
  }, [filteredRows]);

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`"${label}" 삭제?`)) return;
    try {
      await deleteMut.mutateAsync(id);
      toast({ title: '삭제 완료' });
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  if (loadingTerms) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" />
            학생 편성 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            학기별 분반에 편성된 학생 명단. 과목 + 강의실로 묶어 보기.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4 mr-2" /> xlsx 업로드
        </Button>
      </div>

      <WorkflowInfoBanner
        step={3}
        totalSteps={5}
        title="학생 편성 관리"
        description="어떤 학생이 어떤 분반에 속하는지 (한 학생 × 여러 분반)"
        files={['학생편성현황(NNNN학년도 N학기 N학년).xlsx — 학년별 1개']}
        table="student_enrollment"
        prerequisites={[
          { step: 1, label: '교육과정 관리' },
          { step: 2, label: '과목 개설 관리 (분반 매칭의 출처)' },
        ]}
        enables={[
          { step: 4, label: '학생 시간표 cross-link (선택)' },
        ]}
      />

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>학기 · 학년 선택</CardTitle>
              <CardDescription className="mt-1">
                {effectiveAY != null && effectiveSem != null
                  ? `${effectiveAY}학년도 ${effectiveSem}학기 · ${academicGrade ? `${academicGrade}학년` : '전체 학년'}`
                  : '데이터 없음'}
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select
                value={effectiveAY != null && effectiveSem != null ? `${effectiveAY}-${effectiveSem}` : ''}
                onValueChange={(v) => { const [ay, sem] = v.split('-').map(Number); setAcademicYear(ay); setSemester(sem); }}
              >
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="학년도·학기" /></SelectTrigger>
                <SelectContent>
                  {termOptions.map((t) => (
                    <SelectItem key={`${t.academicYear}-${t.semester}`} value={`${t.academicYear}-${t.semester}`}>
                      {t.academicYear}학년도 {t.semester}학기
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={academicGrade != null ? String(academicGrade) : 'all'} onValueChange={(v) => setAcademicGrade(v === 'all' ? null : parseInt(v, 10))}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 학년</SelectItem>
                  <SelectItem value="1">1학년</SelectItem>
                  <SelectItem value="2">2학년</SelectItem>
                  <SelectItem value="3">3학년</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="과목·학생·강의실 검색" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[220px]" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {(matchStats.curMissing > 0 || matchStats.offMissing > 0 || matchStats.stuMissing > 0) && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                매칭 필요: 교과 <strong>{matchStats.curMissing}건</strong>, 분반 <strong>{matchStats.offMissing}건</strong>, 학생 <strong>{matchStats.stuMissing}건</strong>
                <span className="text-muted-foreground ml-2">(필터 결과 {matchStats.total}행 중)</span>
              </AlertDescription>
            </Alert>
          )}

          {loadingRows ? (
            <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : groups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>표시할 편성이 없습니다.</p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <div className="px-4 py-2 bg-muted/30 text-xs text-muted-foreground">
                {groups.length}개 분반 · 학생 편성 {filteredRows.length}건
              </div>
              <Accordion type="multiple" className="px-2">
                {groups.map((g) => (
                  <AccordionItem key={`${g.subject_name}|${g.classroom ?? ''}`} value={`${g.subject_name}|${g.classroom ?? ''}`}>
                    <AccordionTrigger className="hover:no-underline py-2">
                      <div className="flex items-center gap-2 flex-1 text-left flex-wrap">
                        {g.academic_grade != null && (
                          <Badge variant="outline" className="text-[10px]">{g.academic_grade}학년</Badge>
                        )}
                        <span className="font-medium">{g.subject_name}</span>
                        {g.credits != null && (
                          <Badge variant="outline" className="text-[10px]">{g.credits}학점</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{g.classroom}</span>
                        <Badge variant="secondary" className="text-[10px]">{g.rows.length}명</Badge>
                        {!g.curriculum_id && <Badge variant="destructive" className="text-[10px]">교과 ✗</Badge>}
                        {!g.course_offering_id && <Badge variant="destructive" className="text-[10px]">분반 ✗</Badge>}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <table className="w-full text-sm">
                        <thead className="text-xs text-muted-foreground">
                          <tr className="border-b">
                            <th className="text-left p-2 w-[10%]">학년</th>
                            <th className="text-left p-2 w-[12%]">반</th>
                            <th className="text-right p-2 w-[10%]">번호</th>
                            <th className="text-left p-2 w-[28%]">이름</th>
                            <th className="text-center p-2 w-[20%]">매칭</th>
                            <th className="text-right p-2 w-[20%]">작업</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((r) => (
                            <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/20">
                              <td className="p-2">{r.student_grade ?? '—'}</td>
                              <td className="p-2">{r.student_class ?? '—'}</td>
                              <td className="p-2 text-right">{r.student_no ?? '—'}</td>
                              <td className="p-2 font-medium">{r.student_name}</td>
                              <td className="p-2 text-center">
                                <Badge
                                  variant={r.student_resource_id ? 'outline' : 'destructive'}
                                  className={cn('text-[10px]', r.student_resource_id ? 'border-green-500/40 text-green-700 dark:text-green-400' : '')}
                                  title={r.student_resource_id ? '학생 매칭됨' : '학생 미매칭'}
                                >
                                  학생 {r.student_resource_id ? '✓' : '✗'}
                                </Badge>
                              </td>
                              <td className="p-2 text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDelete(r.id, `${r.subject_name} - ${r.student_name}`)}
                                  disabled={deleteMut.isPending}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
        </CardContent>
      </Card>

      <StudentEnrollmentXlsxUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
