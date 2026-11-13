/**
 * 코인 얻는 법(`/coins`, 2026-10-27 사용자 요청) — 통합 지갑(`academy_user_stats.coins`)을 함께 쓰는 세계들의 보상 안내.
 * 숫자 = 코인 경제 설정(관리자가 바꾸면 그대로 따라간다). 이 파일은 껍데기(지갑·설정·메뉴 읽기)만, 본문은 `CoinGuideView`.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useCoinEconomy } from '@/lib/coinEconomy';
import { useNavSections } from '@/hooks/useNavSections';
import { CoinGuideView } from './CoinGuideView';

function useMyCoins() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['coin-guide', 'wallet', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('academy_user_stats').select('coins').eq('user_id', user!.id).maybeSingle();
      if (error) throw new Error(error.message);
      return data?.coins ?? 0;
    },
    staleTime: 30_000,
  });
}

export default function CoinGuidePage() {
  const values = useCoinEconomy();
  const wallet = useMyCoins();
  const { flatItems, loading: navLoading } = useNavSections();
  const openHrefs = useMemo(() => new Set(flatItems.map((i) => i.href)), [flatItems]);
  return (
    <Layout>
      <PageContainer>
        <CoinGuideView values={values} coins={wallet.data} isMenuOpen={(href) => navLoading || openHrefs.has(href)} />
      </PageContainer>
    </Layout>
  );
}
