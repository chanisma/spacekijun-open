import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import {
  deleteCompoundAnalysis,
  fetchNewsRowsByIds,
  fetchVideoRowsByIds,
  listCompoundAnalyses,
  runCompoundAnalysis,
  saveCompoundAnalysis,
  type RunAnalysisInput,
  type SaveAnalysisInput,
} from '../services/newsAiAnalysisService';
import type { CompoundAnalysisRecord, CompoundAnalysisResult } from '../types/aiAnalysis';

export function useNewsAiAnalysis() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [history, setHistory] = useState<CompoundAnalysisRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  const refreshHistory = useCallback(async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const items = await listCompoundAnalyses();
      setHistory(items);
    } catch (err: any) {
      console.error('AI 분석 이력 조회 실패:', err);
      toast({
        title: '이력 조회 실패',
        description: err.message ?? '분석 이력을 불러오지 못했습니다.',
        variant: 'destructive',
      });
    } finally {
      setHistoryLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (user) refreshHistory();
  }, [user, refreshHistory]);

  /**
   * 진행 중인 시도. 1차가 형식을 어기면 서비스가 자동으로 2차를 보내는데,
   * 화면이 그걸 모르면 사용자에게는 **아무 설명 없이 두 배로 느려진 실행**으로 보인다.
   */
  const [attempt, setAttempt] = useState<{ attempt: number; total: number } | null>(null);

  const run = useCallback(
    async (input: Omit<RunAnalysisInput, 'onAttempt'>) => {
      setRunning(true);
      setAttempt(null);
      try {
        return await runCompoundAnalysis({
          ...input,
          onAttempt: info => setAttempt({ attempt: info.attempt, total: info.total }),
        });
      } finally {
        setRunning(false);
        setAttempt(null);
      }
    },
    []
  );

  const save = useCallback(
    async (input: Omit<SaveAnalysisInput, 'createdBy'>) => {
      if (!user) throw new Error('로그인이 필요합니다.');
      setSaving(true);
      try {
        const record = await saveCompoundAnalysis({ ...input, createdBy: user.id });
        setHistory(prev => [record, ...prev]);
        return record;
      } finally {
        setSaving(false);
      }
    },
    [user]
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteCompoundAnalysis(id);
        setHistory(prev => prev.filter(h => h.id !== id));
        toast({ title: '삭제됨', description: '분석 결과가 삭제되었습니다.' });
      } catch (err: any) {
        toast({
          title: '삭제 실패',
          description: err.message ?? '삭제 중 오류가 발생했습니다.',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  const loadSourceRows = useCallback(async (ids: string[]) => {
    return fetchNewsRowsByIds(ids);
  }, []);

  const loadVideoSourceRows = useCallback(async (ids: string[]) => {
    return fetchVideoRowsByIds(ids);
  }, []);

  return {
    history,
    historyLoading,
    running,
    attempt,
    saving,
    refreshHistory,
    run,
    save,
    remove,
    loadSourceRows,
    loadVideoSourceRows,
  };
}

export type { CompoundAnalysisRecord, CompoundAnalysisResult };
