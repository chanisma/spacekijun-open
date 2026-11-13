import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import type { NewsSource } from '../utils/newsSources';

export interface EducationalNews {
  id: string;
  source: NewsSource;
  title: string;
  url: string;
  article_date: string | null;
  category: string | null;
  analysis_status: string | null;
  academic_year: string | null;
  headline_summary: string | null;
  core_points: string[] | null;
  strategy_implications: string[] | null;
  analyzed_from: string | null;
  analyzed_at: string | null;
  analysis_error: string | null;
  collected_at: string | null;
  meta: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export const useEducationalNews = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [news, setNews] = useState<EducationalNews[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNews = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('educational_news' as any)
        .select('*')
        .order('article_date', { ascending: false, nullsFirst: false });

      if (error) {
        console.error('입시 뉴스 조회 오류:', error);
        toast({
          title: '오류',
          description: '입시 뉴스를 불러오는데 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }

      setNews((data || []) as EducationalNews[]);
    } catch (err) {
      console.error('입시 뉴스 조회 중 오류:', err);
      toast({
        title: '오류',
        description: '입시 뉴스를 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchNews();
  }, [user]);

  return { news, loading, fetchNews };
};
