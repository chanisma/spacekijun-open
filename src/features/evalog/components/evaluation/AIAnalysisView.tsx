import React, { useCallback, useEffect, useState } from 'react';
import {
  Bot, Loader2, ChevronDown, ChevronRight, Tag, Sparkles, FileText, TrendingUp, Info,
  MoreVertical, Eraser, Trash2,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  fetchStudentAnalyses,
  clearAnalysisResult,
  deleteActivityRecord,
} from '../../services/activityAnalysisService';
import {
  aggregateByCategoryGrade,
  identifyStrengths,
  detectCrossPatterns,
  analyzeGrowthTrajectory,
  getTopCategory as mapTop,
  SUBJECT_SUBTYPE_LABEL,
} from '../../utils/analysisAggregation';
import type { Student } from '../../types';
import type { ActivityWithAnalysis } from '../../types/analysis';

interface AIAnalysisViewProps {
  student: Student;
}

const AIAnalysisView: React.FC<AIAnalysisViewProps> = ({ student }) => {
  const { isAdmin } = useAuth();
  const [activities, setActivities] = useState<ActivityWithAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Delete confirmation (admin only)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'clear' | 'delete'; label: string } | null>(null);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'clear') {
        await clearAnalysisResult(deleteTarget.id);
        setActivities(prev =>
          prev.map(a => a.id === deleteTarget.id ? { ...a, analysis: null } : a)
        );
        toast.success('분석 결과가 초기화되었습니다');
      } else {
        await deleteActivityRecord(deleteTarget.id);
        setActivities(prev => prev.filter(a => a.id !== deleteTarget.id));
        toast.success('레코드가 삭제되었습니다');
      }
    } catch (err) {
      console.error('[AIAnalysisView] Delete error:', err);
      toast.error(deleteTarget.type === 'clear' ? '분석 결과 초기화 실패' : '레코드 삭제 실패');
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  const studentId = student.studentId || student.id;

  useEffect(() => {
    if (!studentId) return;

    setLoading(true);
    fetchStudentAnalyses(studentId)
      .then(data => {
        setActivities(data);
        // 기본적으로 모든 카테고리 + (카테고리,학년) 조합 펼침
        const analyzed = data.filter(a => a.analysis);
        const cats = new Set(analyzed.map(a => mapTop(a.category)));
        const catGrades = new Set(analyzed.map(a => `${mapTop(a.category)}::${a.grade}`));
        setExpandedCategories(cats);
        setExpandedGrades(catGrades);
      })
      .catch(err => {
        console.error('[AIAnalysisView] Error:', err);
      })
      .finally(() => setLoading(false));
  }, [studentId]);

  const toggleCategory = (c: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  const toggleGrade = (key: string) => {
    setExpandedGrades(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleItem = (key: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">분석 결과 로딩 중...</p>
      </div>
    );
  }

  const analyzed = activities.filter(a => a.analysis);
  if (analyzed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
          <Bot size={28} className="text-slate-300" />
        </div>
        <p className="text-sm font-medium">AI 분석 결과가 없습니다</p>
        <p className="text-xs text-slate-400">관리자 기능에서 AI 분석을 실행해주세요.</p>
      </div>
    );
  }

  const categoryGroups = aggregateByCategoryGrade(analyzed);
  const strengths = identifyStrengths(analyzed);
  const crossPatterns = detectCrossPatterns(analyzed, 2);
  const trajectory = analyzeGrowthTrajectory(analyzed);

  return (
    <div className="space-y-4">
      {/* Top Competencies */}
      {strengths.topCompetencies.length > 0 && (
        <div className="bg-violet-50/50 border border-violet-100 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-violet-800 mb-2 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" /> 핵심 역량 (상위 5개)
          </h4>
          <div className="flex flex-wrap gap-2">
            {strengths.topCompetencies.map(c => (
              <span
                key={c.name}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-violet-200 text-violet-700 text-xs font-medium shadow-sm"
              >
                {c.name}
                <span className="text-violet-400 ml-0.5">×{c.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Cross Patterns */}
      {crossPatterns.length > 0 && (
        <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4" /> 교차 테마 (다영역 공통 키워드)
          </h4>
          <div className="flex flex-wrap gap-2">
            {crossPatterns.slice(0, 8).map(p => (
              <span
                key={p.keyword}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-blue-200 text-blue-700 text-xs"
              >
                <Tag className="h-3 w-3" /> {p.keyword}
                <span className="text-blue-400">({p.categories.length}개 영역)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Growth Trajectory */}
      {trajectory.length > 1 && (
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-emerald-800 mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4" /> 성장 궤적
          </h4>
          <div className="flex gap-3">
            {trajectory.map((t, i) => (
              <div key={t.grade} className="flex-1 bg-white rounded-lg p-3 border border-emerald-100">
                <p className="text-xs font-semibold text-emerald-700 mb-1">{t.grade}학년</p>
                {t.newKeywords.length > 0 && (
                  <div className="mt-1">
                    <p className="text-[10px] text-slate-400 mb-0.5">
                      {i === 0 ? '주요 키워드' : '새로 등장'}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {t.newKeywords.slice(0, 5).map(k => (
                        <span key={k} className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[10px]">
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {t.newCompetencies.length > 0 && (
                  <div className="mt-1">
                    <p className="text-[10px] text-slate-400 mb-0.5">
                      {i === 0 ? '역량' : '새 역량'}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {t.newCompetencies.slice(0, 3).map(c => (
                        <span key={c} className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 text-[10px]">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category > Grade > Activity Details */}
      <div className="space-y-2">
        {categoryGroups.map(catGroup => {
          const totalCount = catGroup.grades.reduce((s, g) => s + g.activities.length, 0);
          const isCatExpanded = expandedCategories.has(catGroup.category);
          return (
            <div key={catGroup.category} className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                className="w-full bg-slate-50 px-4 py-3 flex items-center gap-2 text-left hover:bg-slate-100 transition-colors"
                onClick={() => toggleCategory(catGroup.category)}
              >
                {isCatExpanded
                  ? <ChevronDown className="w-4 h-4 text-slate-500" />
                  : <ChevronRight className="w-4 h-4 text-slate-500" />}
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-sm">{catGroup.category}</span>
                <span className="text-xs text-slate-400">({totalCount}건)</span>
              </button>

              {isCatExpanded && (
                <div className="p-3 space-y-2">
                  {catGroup.grades.map(gradeSub => {
                    const gradeKey = `${catGroup.category}::${gradeSub.grade}`;
                    const isGradeExpanded = expandedGrades.has(gradeKey);
                    return (
                      <div key={gradeKey} className="border border-slate-100 rounded-lg overflow-hidden">
                        <button
                          className="w-full bg-white px-3 py-2 flex items-center gap-2 text-left hover:bg-slate-50 transition-colors"
                          onClick={() => toggleGrade(gradeKey)}
                        >
                          {isGradeExpanded
                            ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                          <span className="text-xs font-semibold text-slate-600">{gradeSub.grade}학년</span>
                          <span className="text-[11px] text-slate-400">({gradeSub.activities.length}건)</span>
                        </button>

                        {isGradeExpanded && (
                          <div className="px-2 pb-2 space-y-1.5">
                            {gradeSub.activities.map(activity => {
                              const an = activity.analysis!;
                              const itemKey = activity.id;
                              const isExpanded = expandedItems.has(itemKey);
                              const subtypeLabel = SUBJECT_SUBTYPE_LABEL[activity.category];

                              return (
                                <div key={activity.id} className="bg-white border border-slate-100 rounded-lg">
                                  <div className="flex items-center">
                                    <button
                                      className="flex-1 px-3 py-2 flex items-center gap-2 text-left hover:bg-slate-50 transition-colors"
                                      onClick={() => toggleItem(itemKey)}
                                    >
                                      {isExpanded
                                        ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                                      <span className="text-sm font-medium text-slate-700">
                                        {activity.subject_name || activity.category}
                                      </span>
                                      {subtypeLabel && (
                                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] shrink-0">
                                          {subtypeLabel}
                                        </span>
                                      )}
                                      {activity.semester != null && (
                                        <span className="text-[10px] text-slate-400 shrink-0">
                                          {activity.semester}학기
                                        </span>
                                      )}
                                      <span className="text-xs text-slate-400 flex-1 truncate ml-2">
                                        {an.summary}
                                      </span>
                                    </button>
                                    {isAdmin && (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button className="p-1.5 mr-2 rounded hover:bg-slate-100 transition-colors">
                                            <MoreVertical className="h-3.5 w-3.5 text-slate-400" />
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem
                                            onClick={() => setDeleteTarget({ id: activity.id, type: 'clear', label: activity.subject_name || activity.category })}
                                          >
                                            <Eraser className="h-3.5 w-3.5 mr-2" /> 분석 결과 초기화
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            className="text-red-600 focus:text-red-600"
                                            onClick={() => setDeleteTarget({ id: activity.id, type: 'delete', label: activity.subject_name || activity.category })}
                                          >
                                            <Trash2 className="h-3.5 w-3.5 mr-2" /> 레코드 삭제
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </div>

                                  {isExpanded && (
                                    <div className="px-3 pb-3 space-y-2">
                                      {/* What / Why / How */}
                                      <div className="grid grid-cols-3 gap-2">
                                        <div className="bg-blue-50/50 rounded-lg p-2">
                                          <p className="text-[11px] font-semibold text-blue-600 mb-1">What</p>
                                          <ul className="space-y-0.5">
                                            {an.what.map((w, i) => (
                                              <li key={i} className="text-xs text-slate-600">• {w}</li>
                                            ))}
                                          </ul>
                                        </div>
                                        <div className="bg-green-50/50 rounded-lg p-2">
                                          <p className="text-[11px] font-semibold text-green-600 mb-1">Why</p>
                                          <ul className="space-y-0.5">
                                            {an.why.map((w, i) => (
                                              <li key={i} className="text-xs text-slate-600">• {w}</li>
                                            ))}
                                          </ul>
                                        </div>
                                        <div className="bg-amber-50/50 rounded-lg p-2">
                                          <p className="text-[11px] font-semibold text-amber-600 mb-1">How</p>
                                          <ul className="space-y-0.5">
                                            {an.how.map((w, i) => (
                                              <li key={i} className="text-xs text-slate-600">• {w}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      </div>

                                      {/* Tags */}
                                      <div className="flex flex-wrap gap-1.5">
                                        {an.keywords.map(k => (
                                          <span key={k} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[11px]">
                                            <Tag className="h-2.5 w-2.5" /> {k}
                                          </span>
                                        ))}
                                        {an.competencies.map(c => (
                                          <span key={c} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 text-[11px]">
                                            <Sparkles className="h-2.5 w-2.5" /> {c}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 text-xs text-slate-400 px-1">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>Solar Pro 4 AI 분석 결과입니다. 분석 시점: {analyzed[0]?.analysis?.analyzed_at?.slice(0, 10) || '-'}</span>
      </div>

      {/* Delete Confirmation Dialog (admin only) */}
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

export default AIAnalysisView;
