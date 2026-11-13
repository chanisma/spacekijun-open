/**
 * 이세계 사회인 «내 기록»(`/isekai`, 2026-10-28 사용자 요청) — 학생이 독 게임 «고등학생이었던 내가 이세계에서는 사회인?»에서
 * 쌓은 플레이를 사원증·근무 기록부·인사기록·사내 드라마·면담 노트·업적으로 보여 준다. docs/features/isekai.md
 *
 * - 데이터 = 서버 `isekai3d_my_record()`(본인만 — isekai3d 표는 authenticated 에 닫혀 있다) · 업적 = `isekai3d_achievements()`.
 * - 교사·관리자는 자기 기록이 거의 없어 «예시로 보기»(지어낸 기록, `sampleRecord`)를 함께 준다. 예시와 관리자는 받기가 막힌다.
 * - 칭호·탭은 이 기기에만 기억한다(safeLocalStorage) — 잃어도 되는 편의.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { readStoredString, writeStoredString, removeStored } from '@/lib/safeLocalStorage';
import { achievedCount, ISEKAI_ACHIEVEMENTS, parseIsekaiAchievements, sampleAchievements, type IsekaiAchievementsData } from './model/achievements';
import { currentStreak, parseIsekaiRecord, recordStats, sampleRecord, seoulDate, type IsekaiRecord } from './model/record';
import { Hero } from './components/Hero';
import { Drama, Notes, Personnel, WorkLog } from './components/Sections';
import { AchievementBoard } from './components/AchievementBoard';
import './isekai.css';

type Tab = 'work' | 'personnel' | 'drama' | 'notes' | 'achievements';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'work', label: '근무 기록부', icon: '🗓️' },
  { id: 'personnel', label: '인사기록', icon: '📇' },
  { id: 'drama', label: '사내 드라마', icon: '🎬' },
  { id: 'notes', label: '면담 노트', icon: '📝' },
  { id: 'achievements', label: '업적', icon: '🏅' },
];
const TAB_KEY = 'isekai.tab';
const BADGE_KEY = 'isekai.badge';

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as unknown as (n: string, a?: Record<string, unknown>) => Promise<{ data: T; error: { message: string } | null }>)(name, args);
  if (error) throw new Error(error.message);
  return data;
}

export default function IsekaiPage() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const today = seoulDate();
  const isStudent = profile?.role === 'student';

  const recordQ = useQuery({
    queryKey: ['isekai', 'record', user?.id],
    enabled: !!user?.id,
    queryFn: async () => parseIsekaiRecord(await rpc('isekai3d_my_record')),
    staleTime: 30_000,
  });
  const achQ = useQuery({
    queryKey: ['isekai', 'achievements', user?.id],
    enabled: !!user?.id,
    queryFn: async () => parseIsekaiAchievements(await rpc('isekai3d_achievements')),
    staleTime: 30_000,
  });

  // 교사·관리자: 자기 기록이 비었으면 예시부터 보여 준다(바꿀 수 있다)
  const ownEmpty = !!recordQ.data && recordQ.data.days.length === 0 && recordQ.data.saves.length === 0 && recordQ.data.answers.length === 0;
  const [sample, setSample] = useState<boolean | null>(null);
  const showSample = !isStudent && (sample ?? ownEmpty);

  const [claiming, setClaiming] = useState<string | null>(null);
  const claimM = useMutation({
    mutationFn: async (ids: string[]) => {
      let amount = 0, coins: number | null = null, n = 0;
      for (const id of ids) {
        setClaiming(id);
        const r = await rpc<{ granted: boolean; amount: number; coins: number }>('isekai3d_achievement_claim', { p_id: id });
        if (r.granted) { amount += r.amount; n += 1; }
        coins = r.coins ?? coins;
      }
      return { amount, coins, n };
    },
    onSuccess: ({ amount, coins, n }) => {
      if (n > 0) toast.success(`결재 완료! ${n > 1 ? `업적 ${n}개 · ` : ''}${amount}코인을 받았어요${coins !== null ? ` (지갑 ${coins}코인)` : ''}`);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => { setClaiming(null); qc.invalidateQueries({ queryKey: ['isekai', 'achievements'] }); },
  });

  const record: IsekaiRecord | undefined = showSample ? sampleRecord(today) : recordQ.data;
  const ach: IsekaiAchievementsData | undefined = showSample ? sampleAchievements() : achQ.data;

  const loading = recordQ.isLoading || achQ.isLoading;
  const failed = recordQ.error || achQ.error;
  const name = showSample ? '김이세' : profile?.name ?? '사원';
  const code = showSample ? '25-10000' : (profile?.email ?? '').split('@')[0];
  const previewNote = showSample ? '예시 기록이에요 — 받기는 실제 학생 계정에서만 돼요.' : ach?.admin ? '관리자 계정은 진행도만 보이고 코인은 받을 수 없어요.' : null;

  return (
    <Layout>
      <PageContainer>
        <div className="isk">
          {!isStudent && (
            <div className="isk-preview-bar">
              <span>👀 학생에게 보이는 화면이에요. {ownEmpty ? '선생님 계정에는 플레이 기록이 없어 예시로 보여 드려요.' : ''}</span>
              <div className="flex gap-2">
                <button type="button" className="isk-filter" aria-pressed={showSample} onClick={() => setSample(true)}>예시로 보기</button>
                <button type="button" className="isk-filter" aria-pressed={!showSample} onClick={() => setSample(false)}>내 기록</button>
              </div>
            </div>
          )}

          {loading && !showSample ? (
            <div className="isk-panel isk-empty"><b className="isk-hand">사원증을 찾는 중…</b>이세계 인사팀이 서류철을 뒤지고 있어요.</div>
          ) : failed && !showSample ? (
            <div className="isk-panel isk-empty">
              <b>기록을 불러오지 못했어요</b>{(failed as Error).message}
              <div className="mt-3"><button type="button" className="isk-btn" onClick={() => { recordQ.refetch(); achQ.refetch(); }}>다시 시도</button></div>
            </div>
          ) : record && ach ? (
            <IsekaiView
              record={record} ach={ach} name={name} code={code} today={today} memoSeed={showSample ? 'sample' : user?.id ?? ''}
              previewNote={previewNote} claiming={claiming} onClaim={(ids) => claimM.mutate(ids)}
            />
          ) : null}
        </div>
      </PageContainer>
    </Layout>
  );
}

/** 화면 본문 — 데이터만 받는다(페이지 = 서버 읽기 · 회귀 하네스 = 예시 기록) */
export function IsekaiView({
  record, ach, name, code, today, memoSeed, previewNote, claiming, onClaim,
}: {
  record: IsekaiRecord; ach: IsekaiAchievementsData; name: string; code: string; today: string; memoSeed: string;
  previewNote: string | null; claiming: string | null; onClaim: (ids: string[]) => void;
}) {
  const stats = useMemo(() => recordStats(record), [record]);
  const [tab, setTab] = useState<Tab>(() => {
    const t = readStoredString(TAB_KEY);
    return TABS.some((x) => x.id === t) ? (t as Tab) : 'work';
  });
  useEffect(() => { writeStoredString(TAB_KEY, tab); }, [tab]);
  const [badgeId, setBadgeId] = useState<string | null>(() => readStoredString(BADGE_KEY));
  const pickBadge = (id: string | null) => { setBadgeId(id); if (id) writeStoredString(BADGE_KEY, id); else removeStored(BADGE_KEY); };
  const isReached = (id: string) => ach.claimed.includes(id) || (ach.progress[id] ?? 0) >= (ISEKAI_ACHIEVEMENTS.find((a) => a.id === id)?.goal ?? Infinity);
  const readyCount = ISEKAI_ACHIEVEMENTS.filter((a) => !ach.claimed.includes(a.id) && (ach.progress[a.id] ?? 0) >= a.goal).length;
  const badge = badgeId && isReached(badgeId) ? ISEKAI_ACHIEVEMENTS.find((a) => a.id === badgeId)?.badge ?? null : null;

  return (
    <>
      <Hero
        name={name} code={code} record={record} stats={stats} achieved={achievedCount(ach)} badge={badge}
        playedToday={record.days.some((d) => d.day === today)} streakNow={currentStreak(record.days, today)}
        memoSeed={memoSeed} today={today}
      />
      {record.days.length === 0 && record.saves.length === 0 && (
        <div className="isk-panel isk-empty">
          <b className="isk-hand">아직 입사 전이에요!</b>
          학생판(독) 앱의 «이세계에서는 사회인»을 플레이하면 출근 기록·세이브·드라마가 여기에 쌓여요.
          <div className="mt-3"><a className="isk-btn" href="/desktop-app">학생판 받으러 가기</a></div>
        </div>
      )}
      <div className="isk-tabs" role="tablist" aria-label="내 기록">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" className="isk-tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            <span aria-hidden="true">{t.icon}</span>{t.label}
            {t.id === 'achievements' && readyCount > 0 && !previewNote && <span className="isk-tab-dot" aria-label={`받을 업적 ${readyCount}개`}>{readyCount}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'work' && <WorkLog record={record} stats={stats} today={today} />}
        {tab === 'personnel' && <Personnel record={record} stats={stats} />}
        {tab === 'drama' && <Drama record={record} />}
        {tab === 'notes' && <Notes record={record} />}
        {tab === 'achievements' && (
          <AchievementBoard
            data={ach} preview={previewNote} claiming={claiming}
            onClaim={(id) => onClaim([id])} onClaimAll={onClaim}
            badgeId={badgeId} onBadge={pickBadge}
          />
        )}
      </div>
    </>
  );
}
