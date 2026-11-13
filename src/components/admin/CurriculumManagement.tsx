import { useMemo, useState } from 'react';
import { BookOpen, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  useCurriculumAdmissionYears,
  useCurriculumByCohort,
  buildMatrix,
  SEMESTER_KEYS,
  type CurriculumRow,
} from '@/features/curriculum-management/hooks/useCurriculum';
import { CurriculumCellPanel } from '@/features/curriculum-management/components/CurriculumCellPanel';
import { CurriculumXlsxUploadDialog } from '@/features/curriculum-management/components/CurriculumXlsxUploadDialog';
import { WorkflowInfoBanner } from './WorkflowInfoBanner';

interface SelectedCell {
  category: string;
  semesterLabel: string;
  rows: CurriculumRow[];
}

export function CurriculumManagement() {
  const { data: years = [], isLoading: loadingYears } = useCurriculumAdmissionYears();
  const [admissionYear, setAdmissionYear] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);

  // 첫 진입 시 가장 최근 입학년도 자동 선택
  const effectiveYear = admissionYear ?? years[0] ?? null;

  const { data: rows = [], isLoading: loadingRows } = useCurriculumByCohort(effectiveYear);

  const { matrix, categories } = useMemo(() => buildMatrix(rows), [rows]);

  // 선택된 셀이 데이터 갱신 후 stale 되지 않도록 동기화
  const liveSelectedRows = useMemo(() => {
    if (!selectedCell) return null;
    const cell = matrix[selectedCell.category]?.[selectedCell.semesterLabel];
    return cell?.subjects ?? [];
  }, [selectedCell, matrix]);

  const handleCellClick = (category: string, semesterLabel: string) => {
    const cell = matrix[category]?.[semesterLabel];
    if (!cell || cell.subjects.length === 0) return;
    setSelectedCell({ category, semesterLabel, rows: cell.subjects });
  };

  const isCellSelected = (category: string, semesterLabel: string) =>
    selectedCell?.category === category && selectedCell?.semesterLabel === semesterLabel;

  // 학기 합계 (열별)
  const semesterTotals = useMemo(() => {
    const totals: Record<string, { hours: number; credits: number; subjects: number }> = {};
    SEMESTER_KEYS.forEach((s) => {
      let hours = 0, credits = 0, subjects = 0;
      categories.forEach((cat) => {
        const cell = matrix[cat]?.[s.label];
        if (cell) {
          hours += cell.totalHours;
          credits += cell.totalCredits;
          subjects += cell.subjects.length;
        }
      });
      totals[s.label] = { hours, credits, subjects };
    });
    return totals;
  }, [matrix, categories]);

  if (loadingYears) {
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
            <BookOpen className="h-6 w-6" />
            교육과정 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            입학년도(코호트)별 6학기 교육과정 운영 현황. 셀을 클릭해 과목 목록을 펼치고 인라인 수정.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          xlsx 보고서 업로드
        </Button>
      </div>

      <WorkflowInfoBanner
        step={1}
        totalSteps={5}
        title="교육과정 관리"
        description="학교 교육과정 편성 (코호트별 6학기 운영 과목·학점)"
        files={['학교교육과정 편제 및 시간배당 관리 보고서(N학기 N학년).xlsx — 학년·학기별 6개']}
        table="school_curriculum"
        prerequisites={[]}
        enables={[
          { step: 2, label: '과목 개설의 교과 매칭' },
          { step: 3, label: '학생 편성의 교과 매칭' },
          { step: 4, label: '학생 시간표의 교과 매칭' },
        ]}
      />

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>입학년도 선택</CardTitle>
              <CardDescription className="mt-1">
                {effectiveYear ? `${effectiveYear} 입학생 코호트의 3개년 운영 데이터` : '데이터 없음'}
              </CardDescription>
            </div>
            <Select
              value={effectiveYear != null ? String(effectiveYear) : ''}
              onValueChange={(v) => setAdmissionYear(parseInt(v, 10))}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="입학년도 선택" />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}학년도 입학
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {loadingRows ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>이 입학년도의 데이터가 없습니다.</p>
              <p className="text-xs mt-2">우측 상단의 「xlsx 보고서 업로드」 버튼으로 추가하세요.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium text-muted-foreground w-[14%]">교과군</th>
                    {SEMESTER_KEYS.map((s) => (
                      <th key={s.label} className="text-center p-2 font-medium">
                        <div>{s.grade}학년 {s.semester}학기</div>
                        <div className="text-[10px] text-muted-foreground font-normal">
                          ({s.label})
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat) => (
                    <tr key={cat} className="border-b hover:bg-muted/30">
                      <td className="p-2 font-medium">{cat}</td>
                      {SEMESTER_KEYS.map((s) => {
                        const cell = matrix[cat]?.[s.label];
                        const isEmpty = !cell || cell.subjects.length === 0;
                        const selected = isCellSelected(cat, s.label);
                        return (
                          <td
                            key={s.label}
                            className={cn(
                              'p-1 text-center align-top transition-colors',
                              !isEmpty && 'cursor-pointer hover:bg-primary/5',
                              selected && 'bg-primary/10 ring-2 ring-primary ring-inset'
                            )}
                            onClick={() => handleCellClick(cat, s.label)}
                          >
                            {isEmpty ? (
                              <span className="text-xs text-muted-foreground/30">—</span>
                            ) : (
                              <ul className="py-1 text-left space-y-0.5">
                                {cell.subjects.map((subj) => (
                                  <li key={subj.id} className="text-xs leading-tight">
                                    <span className="font-medium">{subj.subject}</span>
                                    <span className="text-muted-foreground ml-0.5">
                                      ({subj.hours != null
                                        ? `${subj.hours}시간, ${subj.credits}학점`
                                        : `${subj.credits}학점`})
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="bg-muted/20 font-medium">
                    <td className="p-2">합계</td>
                    {SEMESTER_KEYS.map((s) => {
                      const t = semesterTotals[s.label];
                      return (
                        <td key={s.label} className="p-2 text-center">
                          <div className="text-sm">
                            {t.hours > 0 ? `${t.hours}시간 · ` : ''}{t.credits}학점
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {t.subjects}과목
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedCell && liveSelectedRows && liveSelectedRows.length > 0 && effectiveYear != null && (
        <CurriculumCellPanel
          category={selectedCell.category}
          semesterLabel={selectedCell.semesterLabel}
          rows={liveSelectedRows}
          admissionYear={effectiveYear}
          onClose={() => setSelectedCell(null)}
        />
      )}

      <CurriculumXlsxUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        defaultAcademicYear={new Date().getFullYear()}
      />
    </div>
  );
}
