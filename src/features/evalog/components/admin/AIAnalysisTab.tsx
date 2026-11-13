import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2, Bot, ChevronDown, ChevronRight, Download, RotateCcw,
  CheckCircle2, XCircle, SkipForward, Tag, Sparkles, FileText,
  MoreVertical, Eraser, Trash2,
} from 'lucide-react';
import {
  getAnalysisStats,
  batchAnalyze,
  fetchActivitiesForAnalysis,
  clearAnalysisResult,
  deleteActivityRecord,
} from '../../services/activityAnalysisService';
import {
  aggregateByGradeCategory,
  identifyStrengths,
  exportAnalysisToCSV,
} from '../../utils/analysisAggregation';
import type {
  AnalysisFilter,
  AnalysisStats,
  AnalysisProgress,
  ActivityWithAnalysis,
} from '../../types/analysis';

type Step = 'configure' | 'analyzing' | 'done';

const CATEGORIES = [
  { value: 'all', label: '전체' },
  { value: 'regular', label: '교과' },
  { value: '자율활동', label: '자율활동' },
  { value: '동아리활동', label: '동아리활동' },
  { value: '진로활동', label: '진로활동' },
  { value: '행동특성및종합의견', label: '행동특성' },
];

export const AIAnalysisTab: React.FC = () => {
  const [step, setStep] = useState<Step>('configure');

  // Filter state
  const [grade, setGrade] = useState<string>('all');
  const [semester, setSemester] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [onlyUnanalyzed, setOnlyUnanalyzed] = useState(true);
  const [reanalyzeAll, setReanalyzeAll] = useState(false);

  // Stats
  const [stats, setStats] = useState<AnalysisStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Progress
  const [progress, setProgress] = useState<AnalysisProgress>({
    current: 0, total: 0, status: 'idle', successCount: 0, failCount: 0, skipCount: 0,
  });
  const abortRef = useRef<AbortController | null>(null);

  // Results
  const [resultActivities, setResultActivities] = useState<ActivityWithAnalysis[]>([]);
  const [expandedGrades, setExpandedGrades] = useState<Set<number>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'clear' | 'delete'; label: string } | null>(null);

  // Build filter from state ('all' means no filter)
  const buildFilter = useCallback((): AnalysisFilter => ({
    grade: grade !== 'all' ? parseInt(grade) : undefined,
    semester: semester !== 'all' ? parseInt(semester) : undefined,
    category: category !== 'all' ? category : undefined,
    onlyUnanalyzed: reanalyzeAll ? false : onlyUnanalyzed,
  }), [grade, semester, category, onlyUnanalyzed, reanalyzeAll]);

  // Load stats when filter changes
  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const filter: AnalysisFilter = {
        grade: grade !== 'all' ? parseInt(grade) : undefined,
        semester: semester !== 'all' ? parseInt(semester) : undefined,
        category: category !== 'all' ? category : undefined,
      };
      const result = await getAnalysisStats(filter);
      setStats(result);
    } catch (err) {
      console.error('[AIAnalysis] Stats error:', err);
      toast.error('통계 조회 실패');
    } finally {
      setLoadingStats(false);
    }
  }, [grade, semester, category]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Start analysis
  const handleStartAnalysis = useCallback(async () => {
    const filter = buildFilter();
    abortRef.current = new AbortController();

    setStep('analyzing');
    setProgress({
      current: 0, total: 0, status: 'analyzing', successCount: 0, failCount: 0, skipCount: 0,
    });

    try {
      const finalProgress = await batchAnalyze(
        filter,
        (p) => setProgress({ ...p }),
        abortRef.current.signal
      );

      // 결과 로드 (에러/취소 시에도 부분 결과 표시)
      const activities = await fetchActivitiesForAnalysis({
        ...filter,
        onlyUnanalyzed: false,
      });
      setResultActivities(activities);

      // 기본적으로 모든 학년 펼침
      const grades = new Set(activities.map(a => a.grade));
      setExpandedGrades(grades);

      setStep('done');

      if (finalProgress.status === 'cancelled') {
        toast.info(`분석 취소됨: ${finalProgress.successCount}건 완료, 저장됨`);
      } else if (finalProgress.status === 'error') {
        toast.error(`API 연속 오류로 중단됨: ${finalProgress.successCount}건 완료, ${finalProgress.failCount}건 실패`);
      } else {
        toast.success(`분석 완료: ${finalProgress.successCount}건 성공`);
      }
    } catch (err) {
      console.error('[AIAnalysis] Batch error:', err);
      toast.error('분석 중 오류 발생');
      setStep('configure');
    }
  }, [buildFilter]);

  // Cancel analysis
  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Reset
  const handleReset = useCallback(() => {
    setStep('configure');
    setResultActivities([]);
    setExpandedGrades(new Set());
    setExpandedCategories(new Set());
    loadStats();
  }, [loadStats]);

  // Export CSV
  const handleExportCSV = useCallback(() => {
    const csv = exportAnalysisToCSV(resultActivities);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_analysis_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV 파일 다운로드');
  }, [resultActivities]);

  // Delete handlers
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'clear') {
        await clearAnalysisResult(deleteTarget.id);
        setResultActivities(prev =>
          prev.map(a => a.id === deleteTarget.id ? { ...a, analysis: null } : a)
        );
      } else {
        await deleteActivityRecord(deleteTarget.id);
        setResultActivities(prev => prev.filter(a => a.id !== deleteTarget.id));
      }
    } catch (err) {
      console.error('[AIAnalysis] Delete error:', err);
      toast.error(deleteTarget.type === 'clear' ? '분석 결과 초기화 실패' : '레코드 삭제 실패');
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  // Toggle expand
  const toggleGrade = (g: number) => {
    setExpandedGrades(prev => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });
  };

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Step: Configure */}
      {step === 'configure' && (
        <>
          <div className="p-6 border-2 border-dashed rounded-lg text-center space-y-4">
            <div className="flex justify-center">
              <div className="p-3 rounded-xl bg-violet-50 text-violet-600">
                <Bot size={32} />
              </div>
            </div>
            <h3 className="text-lg font-semibold">AI 활동 분석</h3>
            <p className="text-sm text-slate-500 max-w-lg mx-auto">
              학생의 세부능력및특기사항 텍스트를 AI(Solar Pro 4)로 분석하여<br />
              육하원칙(What/Why/How) 기반 구조화된 결과를 생성합니다.
            </p>
          </div>

          {/* Filters */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-4">
            <h4 className="font-semibold text-sm text-slate-700">분석 대상 설정</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1">학년 (현재 기준)</Label>
                <Select value={grade} onValueChange={setGrade}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="전체" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="1">1학년</SelectItem>
                    <SelectItem value="2">2학년</SelectItem>
                    <SelectItem value="3">3학년</SelectItem>
                    <SelectItem value="0">졸업생</SelectItem>
                  </SelectContent>
                </Select>
                {grade !== 'all' && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    {(() => {
                      const y = new Date().getFullYear();
                      if (grade === '0') return `${(y - 3) % 100}학번 이전`;
                      const g = parseInt(grade);
                      return `${(y - g + 1) % 100}학번 (${y - g + 1}년 입학)`;
                    })()}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1">학기</Label>
                <Select value={semester} onValueChange={setSemester}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="전체" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="1">1학기</SelectItem>
                    <SelectItem value="2">2학기</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1">카테고리</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="전체" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="only-unanalyzed"
                  checked={onlyUnanalyzed && !reanalyzeAll}
                  onCheckedChange={(v) => { setOnlyUnanalyzed(!!v); if (v) setReanalyzeAll(false); }}
                />
                <Label htmlFor="only-unanalyzed" className="text-sm">미분석 건만</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="reanalyze-all"
                  checked={reanalyzeAll}
                  onCheckedChange={(v) => { setReanalyzeAll(!!v); if (v) setOnlyUnanalyzed(false); }}
                />
                <Label htmlFor="reanalyze-all" className="text-sm text-amber-600">전체 재분석</Label>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 border text-center">
                <p className="text-2xl font-bold text-slate-700">{stats.total}</p>
                <p className="text-xs text-slate-500 mt-1">전체 레코드</p>
              </div>
              <div className="bg-white rounded-lg p-4 border text-center">
                <p className="text-2xl font-bold text-green-600">{stats.analyzed}</p>
                <p className="text-xs text-slate-500 mt-1">분석 완료</p>
              </div>
              <div className="bg-white rounded-lg p-4 border text-center">
                <p className="text-2xl font-bold text-amber-600">{stats.unanalyzed}</p>
                <p className="text-xs text-slate-500 mt-1">미분석</p>
              </div>
            </div>
          )}

          {loadingStats && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-2">
              <Loader2 className="animate-spin h-4 w-4" /> 통계 로딩 중...
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleStartAnalysis}
              disabled={loadingStats || (stats?.total === 0)}
              className="min-w-[160px]"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {reanalyzeAll
                ? `전체 재분석 (${stats?.total || 0}건)`
                : `분석 시작 (${stats?.unanalyzed || 0}건)`}
            </Button>
          </div>

          <div className="bg-slate-50 p-4 rounded text-sm text-slate-600">
            <h4 className="font-bold mb-2">분석 안내</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Solar Pro 4 AI가 각 레코드를 What(무엇을)/Why(왜)/How(어떻게) 구조로 분석합니다.</li>
              <li>분석 속도: 약 100건/분 (API 제한). 500건 기준 약 5분 소요됩니다.</li>
              <li>분석 중 취소해도 완료된 결과는 보존됩니다.</li>
              <li>"전체 재분석"은 기존 결과를 덮어씁니다. 주의해서 사용하세요.</li>
            </ul>
          </div>
        </>
      )}

      {/* Step: Analyzing */}
      {step === 'analyzing' && (
        <div className="flex-1 flex flex-col items-center justify-center space-y-6">
          <Loader2 className="w-12 h-12 animate-spin text-violet-500" />
          <h3 className="text-lg font-semibold">
            {progress.status === 'retrying' ? 'API 재시도 중...'
              : progress.status === 'paused' ? '청크 휴식 중...'
              : progress.status === 'error' ? 'API 연속 오류로 중단됨'
              : 'AI 분석 진행 중...'}
          </h3>

          {progress.currentStudentName && (
            <p className="text-sm text-slate-500">
              {progress.currentStudentName}
              {progress.currentSubject && ` — ${progress.currentSubject}`}
            </p>
          )}

          {/* Status badges */}
          <div className="flex gap-2">
            {progress.status === 'retrying' && progress.retryAttempt && (
              <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                재시도 {progress.retryAttempt}/3
              </span>
            )}
            {progress.status === 'paused' && (
              <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                API 보호 휴식 (3초)
              </span>
            )}
            {(progress.consecutiveFailures ?? 0) > 0 && progress.status !== 'error' && (
              <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                연속 실패: {progress.consecutiveFailures}/5
              </span>
            )}
          </div>

          <div className="w-80">
            <div className="bg-slate-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  progress.status === 'error' ? 'bg-red-500'
                    : progress.status === 'retrying' ? 'bg-amber-500'
                    : 'bg-violet-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-sm text-slate-500">
              <span>{progress.current} / {progress.total}</span>
              <span>{progressPercent}%</span>
            </div>
          </div>

          <div className="flex gap-6 text-sm">
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="w-4 h-4" /> 성공: {progress.successCount}
            </span>
            <span className="flex items-center gap-1 text-red-500">
              <XCircle className="w-4 h-4" /> 실패: {progress.failCount}
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <SkipForward className="w-4 h-4" /> 스킵: {progress.skipCount}
            </span>
          </div>

          {/* Circuit breaker error message */}
          {progress.status === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 max-w-md text-center">
              <p className="font-semibold mb-1">API 연속 오류 감지</p>
              <p>5회 연속 실패하여 자동 중단되었습니다. 완료된 {progress.successCount}건은 저장되어 있습니다.</p>
              <p className="mt-2 text-xs text-red-500">"미분석 건만" 옵션으로 나중에 이어서 분석할 수 있습니다.</p>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            {progress.status === 'error' ? (
              <Button variant="outline" onClick={handleReset}>
                설정으로 돌아가기
              </Button>
            ) : (
              <Button variant="outline" onClick={handleCancel}>
                분석 취소
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <>
          {/* Summary */}
          <div className="bg-green-50 border border-green-100 rounded-lg p-6">
            <h4 className="font-semibold text-green-800 mb-3">분석 완료</h4>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="bg-white rounded-lg p-3 border border-green-200">
                <p className="text-xl font-bold text-slate-700">{progress.current}</p>
                <p className="text-xs text-slate-500 mt-1">전체 처리</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-green-200">
                <p className="text-xl font-bold text-green-600">{progress.successCount}</p>
                <p className="text-xs text-slate-500 mt-1">성공</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-green-200">
                <p className="text-xl font-bold text-red-500">{progress.failCount}</p>
                <p className="text-xs text-slate-500 mt-1">실패</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-green-200">
                <p className="text-xl font-bold text-slate-400">{progress.skipCount}</p>
                <p className="text-xs text-slate-500 mt-1">스킵</p>
              </div>
            </div>
          </div>

          {/* Strength Summary */}
          {resultActivities.length > 0 && (() => {
            const strengths = identifyStrengths(resultActivities);
            if (strengths.topCompetencies.length === 0) return null;
            return (
              <div className="bg-violet-50 border border-violet-100 rounded-lg p-4">
                <h4 className="font-semibold text-violet-800 text-sm mb-2">주요 역량 (전체 분석 기반)</h4>
                <div className="flex flex-wrap gap-2">
                  {strengths.topCompetencies.map(c => (
                    <span
                      key={c.name}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-medium"
                    >
                      <Sparkles className="h-3 w-3" />
                      {c.name}
                      <span className="text-violet-400 ml-0.5">({c.count})</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Collapsible Results by Grade > Category */}
          <div className="flex-1 overflow-auto space-y-2">
            {aggregateByGradeCategory(resultActivities.filter(a => a.analysis)).map(gradeGroup => (
              <div key={gradeGroup.grade} className="border rounded-md">
                <button
                  className="w-full bg-slate-50 p-3 flex items-center gap-2 text-left hover:bg-slate-100 transition-colors"
                  onClick={() => toggleGrade(gradeGroup.grade)}
                >
                  {expandedGrades.has(gradeGroup.grade)
                    ? <ChevronDown className="w-4 h-4 text-slate-500" />
                    : <ChevronRight className="w-4 h-4 text-slate-500" />}
                  <span className="font-semibold text-sm">{gradeGroup.grade}학년</span>
                  <span className="text-xs text-slate-400">
                    ({gradeGroup.categories.reduce((sum, c) => sum + c.activities.length, 0)}건)
                  </span>
                </button>

                {expandedGrades.has(gradeGroup.grade) && (
                  <div className="p-3 space-y-2">
                    {gradeGroup.categories.map(catGroup => {
                      const catKey = `${gradeGroup.grade}-${catGroup.category}`;
                      return (
                        <div key={catKey} className="border rounded">
                          <button
                            className="w-full px-3 py-2 flex items-center gap-2 text-left bg-white hover:bg-slate-50 transition-colors"
                            onClick={() => toggleCategory(catKey)}
                          >
                            {expandedCategories.has(catKey)
                              ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                            <FileText className="w-3.5 h-3.5 text-blue-500" />
                            <span className="text-sm font-medium">{catGroup.category}</span>
                            <span className="text-xs text-slate-400">({catGroup.activities.length})</span>
                          </button>

                          {expandedCategories.has(catKey) && (
                            <div className="px-3 pb-3 space-y-2">
                              {catGroup.activities.map(activity => (
                                <ActivityAnalysisCard
                                  key={activity.id}
                                  activity={activity}
                                  onRequestDelete={setDeleteTarget}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 shrink-0 pt-2">
            <Button variant="outline" onClick={handleExportCSV} disabled={resultActivities.length === 0}>
              <Download className="h-4 w-4 mr-2" /> CSV 내보내기
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" /> 다시 분석
            </Button>
          </div>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === 'clear' ? '분석 결과 초기화' : '레코드 삭제'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'clear'
                ? `"${deleteTarget.label}"의 AI 분석 결과를 초기화합니다. 원본 텍스트는 유지되며 재분석할 수 있습니다.`
                : `"${deleteTarget?.label}"의 레코드를 완전히 삭제합니다. 이 작업은 되돌릴 수 없습니다.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className={deleteTarget?.type === 'delete' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {deleteTarget?.type === 'clear' ? '초기화' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ─── Sub-component: Activity Analysis Card ────

const ActivityAnalysisCard: React.FC<{
  activity: ActivityWithAnalysis;
  onRequestDelete?: (target: { id: string; type: 'clear' | 'delete'; label: string }) => void;
}> = ({ activity, onRequestDelete }) => {
  const an = activity.analysis;
  const label = activity.subject_name || activity.category;

  if (!an) return null;

  return (
    <div className="bg-slate-50 rounded-lg p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-800">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{an.summary}</span>
          {onRequestDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded hover:bg-slate-200 transition-colors">
                  <MoreVertical className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onRequestDelete({ id: activity.id, type: 'clear', label })}
                >
                  <Eraser className="h-3.5 w-3.5 mr-2" /> 분석 결과 초기화
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={() => onRequestDelete({ id: activity.id, type: 'delete', label })}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> 레코드 삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-xs font-semibold text-blue-600 mb-1">What (무엇을)</p>
          <ul className="space-y-0.5">
            {an.what.map((w, i) => (
              <li key={i} className="text-xs text-slate-600">• {w}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-green-600 mb-1">Why (왜)</p>
          <ul className="space-y-0.5">
            {an.why.map((w, i) => (
              <li key={i} className="text-xs text-slate-600">• {w}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-amber-600 mb-1">How (어떻게)</p>
          <ul className="space-y-0.5">
            {an.how.map((w, i) => (
              <li key={i} className="text-xs text-slate-600">• {w}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {an.keywords.map(k => (
          <span key={k} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-xs">
            <Tag className="h-2.5 w-2.5" /> {k}
          </span>
        ))}
        {an.competencies.map(c => (
          <span key={c} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 text-xs">
            <Sparkles className="h-2.5 w-2.5" /> {c}
          </span>
        ))}
      </div>
    </div>
  );
};
