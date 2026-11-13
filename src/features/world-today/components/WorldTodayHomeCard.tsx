import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Globe2, Newspaper } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { useMenuVisibility } from '@/hooks/useMenuVisibility';
import { isPathVisible } from '@/lib/menuVisibility';
import { fetchLatestWorldNews } from '../services/worldNewsService';
import { newsDate, sourceName } from '../utils/story';
import { useWorldInterests, useWorldNewsForMe } from '../hooks/useWorldInterests';
import { matchedFields } from '../utils/fields';

export function WorldTodayHomeCard() {
  const { user, profile, effectiveRole } = useAuth();
  const menu = useMenuVisibility();
  if (!user || menu.isLoading || menu.error || !isPathVisible(menu.config, '/world-today', { isAdmin: false })) return null;
  // 관리자 미리보기에서는 관심 분야를 읽지 않는다(요즘 세상 화면과 같은 규칙).
  const preview = profile?.role === 'admin' && effectiveRole !== 'admin';
  return <WorldTodayHomeContent userId={user.id} personal={!preview} />;
}

function WorldTodayHomeContent({ userId, personal }: { userId: string; personal: boolean }) {
  // 관심 분야가 있으면 그 분야의 최신 소식을, 없거나 아직 걸린 소식이 없으면 전체 최신 소식을 보여 준다.
  const interests = useWorldInterests(userId, personal);
  const forMe = useWorldNewsForMe(userId, interests.fields, 1, personal);
  const pick = forMe.data?.[0];
  const reasons = pick ? matchedFields(pick, interests.fields) : [];
  const latest = useQuery({
    queryKey: ['world-today', 'latest', userId],
    queryFn: ({ signal }) => fetchLatestWorldNews(signal),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
  const news = pick ?? latest.data;
  // 맞춤 소식을 알기 전에는 전체 최신 소식을 그리지 않는다 — 그렸다 바꾸면 카드가 눈앞에서 다른 기사로 바뀐다.
  const waiting = latest.isPending || (personal && (interests.isPending || (interests.fields.length > 0 && forMe.isPending)));

  return (
    <section aria-labelledby="student-world-today-title" className="col-span-full grid min-w-0 gap-6 overflow-hidden rounded-2xl border border-[#e4d9e8] bg-[#fcf9f3] p-5 sm:p-6 lg:grid-cols-[1.1fr_1fr] lg:gap-8">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-xs font-semibold text-[#896941]">
          <Globe2 className="h-4 w-4" aria-hidden="true" /> 리아와 루온의 탐구 아카데미
        </p>
        <h2 id="student-world-today-title" className="mt-3 text-xl font-bold tracking-tight text-[#41344f]">요즘 세상</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#594565]">오늘 만난 소식이, 나의 탐구 주제가 된다면?</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[#766b7f]">AI와 과학·기술을 중심으로 변화하는 세상을 만나 보세요. 마음에 남는 질문 하나를 관측 일지에 담고, 나만의 탐구로 이어 갈 수 있어요.</p>
        <Link to="/world-today" className="mt-5 inline-flex min-h-11 items-center gap-3 rounded-full bg-[#644574] px-5 py-2.5 text-sm font-semibold text-[#fff8f0] transition-colors hover:bg-[#4d345a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#806395] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fcf9f3]">
          요즘 세상 둘러보기 <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="flex min-w-0 flex-col justify-center rounded-xl border border-[#eae1ed] bg-white/80 p-4 sm:p-5">
        <p className="flex items-center gap-2 text-xs font-semibold text-[#896941]"><Newspaper className="h-4 w-4" aria-hidden="true" /> {pick ? `내 관심 분야 · ${reasons.join(' · ')}` : '가장 최근 도착한 소식'}</p>
        {waiting ? <p role="status" className="py-6 text-sm text-[#807587]">새로운 소식을 불러오고 있어요.</p> : !pick && latest.isError ? (
          <div role="status" className="mt-4 text-sm leading-6 text-[#807587]">
            <p>{news ? '새 소식을 확인하지 못했어요. 잠시 후 다시 확인해 주세요.' : '소식을 불러오지 못했어요.'}</p>
            <button type="button" disabled={latest.isFetching} onClick={() => void latest.refetch()} className="mt-2 min-h-11 rounded px-2 font-semibold text-[#644574] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#806395] disabled:opacity-50">{latest.isFetching ? '확인 중…' : '다시 시도'}</button>
          </div>
        ) : news ? (
          <Link to={`/world-today?story=${news.id}`} className="group mt-3 block min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#806395] focus-visible:ring-offset-4">
            <span className="text-[11px] font-medium text-[#806395]">{news.category}</span>
            <h3 className="mt-2 break-words text-base font-bold leading-7 text-[#41344f] group-hover:underline">{news.title}</h3>
            {(news.classroom_hook || news.why_it_matters) && <p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-[#766b7f]">{news.classroom_hook || news.why_it_matters}</p>}
            <p className="mt-3 text-[11px] leading-5 text-[#807587]">{sourceName(news.source)} · {newsDate(news.published_at)}</p>
            <span className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#644574]">이 소식으로 관측 시작하기 <ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
          </Link>
        ) : <p className="py-6 text-sm leading-6 text-[#807587]">아직 도착한 소식이 없어요. 새로운 이야기가 도착하면 이곳에 소개할게요.</p>}
        {personal && interests.isSuccess && interests.fields.length === 0 && (
          <Link to="/world-today?interests=1" className="mt-1 inline-flex min-h-11 items-center gap-1.5 self-start rounded text-xs font-semibold text-[#806395] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#806395]">
            관심 분야를 고르면 맞춤 소식을 먼저 보여 드려요 <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}
