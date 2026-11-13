import { useMemo, useState } from 'react';
import { GraduationCap, Upload, Loader2, Pencil, Trash2, Check, X, AlertCircle, Link2 } from 'lucide-react';
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
  useOfferingTerms,
  useOfferings,
  useUpdateOffering,
  useDeleteOffering,
  groupByGradeThenSubject,
  type CourseOfferingRow,
} from '@/features/course-offering/hooks/useCourseOfferings';
import { CourseOfferingXlsxUploadDialog } from '@/features/course-offering/components/CourseOfferingXlsxUploadDialog';
import { WorkflowInfoBanner } from './WorkflowInfoBanner';

export function CourseOfferingManagement() {
  const { toast } = useToast();
  const { data: terms = [], isLoading: loadingTerms } = useOfferingTerms();
  const [academicYear, setAcademicYear] = useState<number | null>(null);
  const [semester, setSemester] = useState<number | null>(null);
  const [grade, setGrade] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  // 첫 로드 시 가장 최근 학기 자동 선택
  const effectiveAY = academicYear ?? terms[0]?.academicYear ?? null;
  const effectiveSem = semester ?? terms[0]?.semester ?? null;

  const { data: rows = [], isLoading: loadingRows } = useOfferings({
    academicYear: effectiveAY,
    semester: effectiveSem,
    grade,
  });

  const grouped = useMemo(() => groupByGradeThenSubject(rows), [rows]);

  // 매칭 통계
  const matchStats = useMemo(() => {
    const total = rows.length;
    const curMissing = rows.filter((r) => !r.curriculum_id).length;
    const teaMissing = rows.filter((r) => !r.teacher_resource_id).length;
    return { total, curMissing, teaMissing };
  }, [rows]);

  const updateMut = useUpdateOffering();
  const deleteMut = useDeleteOffering();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject_name: string; class_label: string; classroom: string; teacher_name: string }>({
    subject_name: '', class_label: '', classroom: '', teacher_name: '',
  });

  const startEdit = (row: CourseOfferingRow) => {
    setEditingId(row.id);
    setDraft({
      subject_name: row.subject_name,
      class_label: row.class_label ?? '',
      classroom: row.classroom ?? '',
      teacher_name: row.teacher_name,
    });
  };

  const saveEdit = async (row: CourseOfferingRow) => {
    if (!draft.subject_name.trim() || !draft.teacher_name.trim()) {
      toast({ title: '과목명/교사명은 필수', variant: 'destructive' });
      return;
    }
    try {
      await updateMut.mutateAsync({
        id: row.id,
        patch: {
          subject_name: draft.subject_name.trim(),
          class_label: draft.class_label.trim() || null,
          classroom: draft.classroom.trim() || null,
          teacher_name: draft.teacher_name.trim(),
        },
      });
      setEditingId(null);
    } catch (e) {
      toast({ title: '수정 실패', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const handleDelete = async (row: CourseOfferingRow) => {
    if (!confirm(`"${row.subject_name} - ${row.classroom ?? ''} (${row.teacher_name})" 삭제?`)) return;
    try {
      await deleteMut.mutateAsync(row.id);
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  if (loadingTerms) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="h-6 w-6" />
            과목 개설 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            학년도·학기별 개설 과목과 분반·교사 배정. 학년 → 과목 → 분반 순으로 펼쳐 보기.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          xlsx 업로드
        </Button>
      </div>

      <WorkflowInfoBanner
        step={2}
        totalSteps={5}
        title="과목 개설 관리"
        description="실제 분반·교사 배정 (한 분반 = 과목 + 강의실 + 교사)"
        files={['과목개설목록(NNNN학년도 N학기 N학년).xlsx — 학년별 1개']}
        table="course_offering"
        prerequisites={[
          { step: 1, label: '교육과정 관리 (curriculum_id 자동 매칭에 필요)' },
        ]}
        enables={[
          { step: 3, label: '학생 편성의 분반 매칭' },
        ]}
      />

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>학기 · 학년 선택</CardTitle>
              <CardDescription className="mt-1">
                {effectiveAY != null && effectiveSem != null
                  ? `${effectiveAY}학년도 ${effectiveSem}학기 · ${grade ? `${grade}학년` : '전체 학년'}`
                  : '데이터 없음'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select
                value={effectiveAY != null && effectiveSem != null ? `${effectiveAY}-${effectiveSem}` : ''}
                onValueChange={(v) => {
                  const [ay, sem] = v.split('-').map(Number);
                  setAcademicYear(ay);
                  setSemester(sem);
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="학년도·학기" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((t) => (
                    <SelectItem key={`${t.academicYear}-${t.semester}`} value={`${t.academicYear}-${t.semester}`}>
                      {t.academicYear}학년도 {t.semester}학기
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={grade != null ? String(grade) : 'all'} onValueChange={(v) => setGrade(v === 'all' ? null : parseInt(v, 10))}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 학년</SelectItem>
                  <SelectItem value="1">1학년</SelectItem>
                  <SelectItem value="2">2학년</SelectItem>
                  <SelectItem value="3">3학년</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {(matchStats.curMissing > 0 || matchStats.teaMissing > 0) && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                매칭 필요: 교과 <strong>{matchStats.curMissing}건</strong>, 교사 <strong>{matchStats.teaMissing}건</strong>
                <span className="text-muted-foreground ml-2">(전체 {matchStats.total}행 중)</span>
              </AlertDescription>
            </Alert>
          )}

          {loadingRows ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : grouped.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>이 학기에 개설된 과목이 없습니다.</p>
            </div>
          ) : (
            grouped.map(({ grade: g, groups }) => (
              <div key={g ?? 'unknown'} className="border rounded-lg">
                <div className="px-4 py-2 bg-muted/30 font-semibold text-sm">
                  {g != null ? `${g}학년` : '학년 미지정'}
                  <span className="text-muted-foreground ml-2">
                    {groups.length}개 과목 · {groups.reduce((s, gr) => s + gr.rows.length, 0)}개 분반
                  </span>
                </div>
                <Accordion type="multiple" className="px-2">
                  {groups.map((g2) => (
                    <AccordionItem key={g2.subject_name} value={g2.subject_name}>
                      <AccordionTrigger className="hover:no-underline py-2">
                        <div className="flex items-center gap-2 flex-1 text-left">
                          <span className="font-medium">{g2.subject_name}</span>
                          {g2.credits != null && (
                            <Badge variant="outline" className="text-[10px]">{g2.credits}학점</Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px]">{g2.rows.length}분반</Badge>
                          {!g2.curriculumMatched && (
                            <Badge variant="destructive" className="text-[10px] gap-1">
                              <Link2 className="h-3 w-3" /> 교과 미매칭
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <table className="w-full text-sm">
                          <thead className="text-xs text-muted-foreground">
                            <tr className="border-b">
                              <th className="text-left p-2 w-[12%]">반</th>
                              <th className="text-left p-2 w-[28%]">강의실</th>
                              <th className="text-left p-2 w-[24%]">교사</th>
                              <th className="text-center p-2 w-[20%]">매칭</th>
                              <th className="text-right p-2 w-[16%]">작업</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g2.rows.map((row) => {
                              const isEditing = editingId === row.id;
                              return (
                                <tr key={row.id} className="border-b last:border-b-0 hover:bg-muted/20">
                                  <td className="p-2">
                                    {isEditing ? (
                                      <Input
                                        value={draft.class_label}
                                        onChange={(e) => setDraft({ ...draft, class_label: e.target.value })}
                                        className="h-8 text-xs"
                                      />
                                    ) : (
                                      row.class_label ?? '—'
                                    )}
                                  </td>
                                  <td className="p-2">
                                    {isEditing ? (
                                      <Input
                                        value={draft.classroom}
                                        onChange={(e) => setDraft({ ...draft, classroom: e.target.value })}
                                        className="h-8 text-xs"
                                      />
                                    ) : (
                                      <span className="text-xs">{row.classroom ?? '—'}</span>
                                    )}
                                  </td>
                                  <td className="p-2">
                                    {isEditing ? (
                                      <Input
                                        value={draft.teacher_name}
                                        onChange={(e) => setDraft({ ...draft, teacher_name: e.target.value })}
                                        className="h-8 text-xs"
                                      />
                                    ) : (
                                      <div>
                                        <span className="font-medium">{row.teacher_name}</span>
                                        {(row.meta as { teacher_username?: string } | null)?.teacher_username && (
                                          <span className="text-[10px] text-muted-foreground ml-1">
                                            ({(row.meta as { teacher_username?: string }).teacher_username})
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-2 text-center">
                                    <div className="flex justify-center gap-1">
                                      <Badge
                                        variant={row.curriculum_id ? 'outline' : 'destructive'}
                                        className={cn(
                                          'text-[10px]',
                                          row.curriculum_id ? 'border-green-500/40 text-green-700 dark:text-green-400' : ''
                                        )}
                                        title={row.curriculum_id ? '교과 매칭됨' : '교과 미매칭'}
                                      >
                                        교과 {row.curriculum_id ? '✓' : '✗'}
                                      </Badge>
                                      <Badge
                                        variant={row.teacher_resource_id ? 'outline' : 'destructive'}
                                        className={cn(
                                          'text-[10px]',
                                          row.teacher_resource_id ? 'border-green-500/40 text-green-700 dark:text-green-400' : ''
                                        )}
                                        title={row.teacher_resource_id ? '교사 매칭됨' : '교사 미매칭'}
                                      >
                                        교사 {row.teacher_resource_id ? '✓' : '✗'}
                                      </Badge>
                                    </div>
                                  </td>
                                  <td className="p-2 text-right">
                                    {isEditing ? (
                                      <div className="flex justify-end gap-1">
                                        <Button size="sm" variant="ghost" onClick={() => saveEdit(row)} disabled={updateMut.isPending}>
                                          <Check className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                          <X className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="flex justify-end gap-1">
                                        <Button size="sm" variant="ghost" onClick={() => startEdit(row)}>
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => handleDelete(row)} disabled={deleteMut.isPending}>
                                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <CourseOfferingXlsxUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
