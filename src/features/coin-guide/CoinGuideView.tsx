/**
 * 코인 얻는 법 본문 — 세션 없이 그려진다(값은 껍데기 `CoinGuidePage` 가 넘긴다 · 하네스 `scripts/coin-guide-test/main.tsx` 가 같은 몸을 띄운다).
 * 각 게임의 옷을 입힌 카드로 세계들을 한 화면에 모은다. 판정·문구 = `model/coinGuide.ts`.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ClipboardCheck, Coins, Egg, Gamepad2, MessageCircleQuestion, Newspaper, Sparkles, Telescope, TreePine, Trees, Trophy,
  type LucideIcon,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { CoinEconomyValues } from '@/lib/coinEconomy';
import { buildWorlds, isekai3dCoinTime, worldDailyMax, type EarnRow, type SpendRow, type World, type WorldId } from './model/coinGuide';
import './coin-guide.css';

/** 세계마다 한 색 — 머리의 하루 막대·궤도·쓰는 곳 점이 같은 색을 쓴다(밤하늘 바탕 대비 3:1 이상) */
const WORLD_TONE: Record<WorldId, { color: string; icon: LucideIcon; short: string }> = {
  study: { color: '#5fbf7f', icon: Trees, short: '자습실' },
  academy: { color: '#e7cea2', icon: Sparkles, short: '아카데미' },
  planner: { color: '#38b2a6', icon: ClipboardCheck, short: '플래너' },
  tamagotchi: { color: '#b4a6ff', icon: Egg, short: '다마고찌' },
  'star-tower': { color: '#ffb84d', icon: Telescope, short: '별까지 쌓기' },
  'world-today': { color: '#f58ba0', icon: Newspaper, short: '요즘 세상' },
  interview: { color: '#7fb2f5', icon: MessageCircleQuestion, short: '면접 준비' },
  isekai3d: { color: '#7be08a', icon: Gamepad2, short: '이세계 사회인' },
};

function Rows({ rows }: { rows: (EarnRow | SpendRow)[] }) {
  return (
    <div className="cg-rows">
      {rows.map((r) => (
        <div key={r.label} className="cg-row">
          <span className="cg-row-label">{r.label}</span>
          <span className="cg-row-amount">{r.amount}</span>
          {r.detail && <span className="cg-row-detail">{r.detail}</span>}
        </div>
      ))}
    </div>
  );
}

function Achievements({ world }: { world: World }) {
  const a = world.achievements;
  if (!a || a.count === 0) return null;
  return (
    <p className="cg-ach">
      <Trophy aria-hidden />
      <span>업적 {a.count}개 · 모두 모으면 +{a.total.toLocaleString()}{a.repeat ? ` · 반복 업적 ${a.repeat}종은 채울 때마다` : ''}</span>
    </p>
  );
}

function GoLink({ world, open, label = '바로 가기' }: { world: World; open: boolean; label?: string }) {
  if (!world.href || !open) return null;
  return <Link to={world.href} className="cg-go">{label}<ArrowRight aria-hidden /></Link>;
}

const todayLine = () => new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

/** 세계마다 다른 옷 — 장식만 다르고 줄(Rows)은 같은 부품 */
function WorldCard({ world, open }: { world: World; open: boolean }) {
  const daily = worldDailyMax(world);
  const dailyText = daily > 0 ? `하루 최대 ${daily.toLocaleString()}코인` : null;
  switch (world.id) {
    case 'study':
      return (
        <article className="cg-card" data-world="study">
          <div className="cg-forest" aria-hidden>{[0, 1, 2, 3, 4, 5].map((i) => <TreePine key={i} />)}</div>
          <h3 className="cg-sign">{world.name}</h3>
          <Rows rows={world.earn} />
          <p className="cg-note">자습실 좌석 앱에서 예약·출석하면 저절로 들어와요.{dailyText ? ` ${dailyText}.` : ''}</p>
        </article>
      );
    case 'academy':
      return (
        <article className="cg-card" data-world="academy">
          <span className="cg-crest" aria-hidden><Sparkles /></span>
          <p className="cg-eyebrow">STARLIGHT ACADEMY</p>
          <h3>{world.name}</h3>
          <Rows rows={world.earn} />
          <GoLink world={world} open={open} label="아카데미로" />
        </article>
      );
    case 'planner':
      return (
        <article className="cg-card" data-world="planner">
          <span className="cg-tab">{dailyText ?? '오늘'}</span>
          <h3>{world.name}</h3>
          <Rows rows={world.earn} />
          <GoLink world={world} open={open} label="계획 적으러" />
        </article>
      );
    case 'tamagotchi':
      return (
        <article className="cg-card" data-world="tamagotchi">
          <h3>{world.name}</h3>
          <div className="cg-lcd"><Rows rows={world.earn} /></div>
          <div className="cg-buttons" aria-hidden><span /><span /><span /></div>
          <Achievements world={world} />
          <GoLink world={world} open={open} label="펫 보러 가기" />
        </article>
      );
    case 'star-tower':
      return (
        <article className="cg-card" data-world="star-tower">
          <span className="cg-tower-moon" aria-hidden />
          <h3>{world.name}</h3>
          <Rows rows={world.earn} />
          <Achievements world={world} />
          <GoLink world={world} open={open} label="탑으로" />
        </article>
      );
    case 'world-today':
      return (
        <article className="cg-card" data-world="world-today">
          <header className="cg-masthead">
            <h3>{world.name}</h3>
            <p><span>{todayLine()}</span><span>{dailyText ?? '코인판'}</span></p>
          </header>
          <Rows rows={world.earn} />
          <GoLink world={world} open={open} label="오늘 기사 읽기" />
        </article>
      );
    case 'interview':
      return (
        <article className="cg-card" data-world="interview">
          <div className="cg-bubbles" aria-hidden>
            <span className="cg-bubble prof">그 활동에서 무엇을 배웠나요?</span>
            <span className="cg-bubble me">제가 가장 크게 배운 건…</span>
          </div>
          <h3>{world.name}</h3>
          <Rows rows={world.earn} />
          <GoLink world={world} open={open} label="면접실로" />
        </article>
      );
    default:
      return null;
  }
}

function Plumbob() {
  return (
    <svg className="cg-plumbob" viewBox="0 0 26 44" aria-hidden>
      <path d="M13 0 L26 18 L13 44 L0 18 Z" fill="#43d65a" />
      <path d="M13 0 L26 18 L13 22 Z" fill="#8bf59a" />
      <path d="M13 0 L0 18 L13 22 Z" fill="#5fe874" />
      <path d="M0 18 L13 22 L13 44 Z" fill="#2fb546" />
    </svg>
  );
}

function DwellersCard({ world, open, coinTime }: { world: World; open: boolean; coinTime: string | null }) {
  return (
    <article className="cg-card" data-world="isekai3d">
      <Plumbob />
      <div className="cg-dwellers-panel">
        <p className="cg-dwellers-title">스페이스기전 학생판 · 독의 게임</p>
        <h3>{world.name}</h3>
        <div className="cg-needs" aria-hidden>
          <span className="cg-need">재미<span><i style={{ width: '82%' }} /></span></span>
          <span className="cg-need low">에너지<span><i style={{ width: '38%' }} /></span></span>
          <span className="cg-need">사회성<span><i style={{ width: '64%' }} /></span></span>
          <span className="cg-need">공부<span><i style={{ width: '90%' }} /></span></span>
        </div>
        <Rows rows={world.spend.map((r) => (coinTime ? { ...r, detail: `${r.detail} · 동전 하나 = ${coinTime}` } : r))} />
        <Achievements world={world} />
      </div>
      <GoLink world={world} open={open} label="내 기록 · 업적 보기" />
    </article>
  );
}

export function CoinGuideView({ values, coins, isMenuOpen }: {
  /** 코인 경제 설정 — null = 아직 못 읽음(뼈대만) */
  values: CoinEconomyValues | null;
  /** 내 지갑 — undefined = 읽는 중 */
  coins: number | undefined;
  /** 이 경로가 지금 내 메뉴에 있는가(관리자가 끈 기능은 카드를 뺀다) */
  isMenuOpen: (href: string) => boolean;
}) {
  const worlds = useMemo(() => (values ? buildWorlds(values) : []), [values]);
  const isOpen = (w: World) => !!w.href && isMenuOpen(w.href);
  // 메뉴가 꺼진 세계(관리자가 감춘 기능)는 카드도 뺀다 — 자습실(별도 앱)·이세계 사회인(학생판)은 메뉴와 무관하게 남긴다
  const visible = worlds.filter((w) => !w.href || w.id === 'isekai3d' || isOpen(w));
  const earnWorlds = visible.filter((w) => w.earn.length > 0);
  const daily = earnWorlds.map((w) => ({ w, max: worldDailyMax(w) })).filter((d) => d.max > 0);
  const dailyTotal = daily.reduce((s, d) => s + d.max, 0);
  const dwellers = visible.find((w) => w.id === 'isekai3d' && w.spend.length > 0);
  const shops = visible.filter((w) => w.id !== 'isekai3d' && w.spend.length > 0);

  return (
    <div className="cg-root">
      <section className="cg-hero" aria-label="내 지갑">
        <div className="cg-hero-text">
          <p className="cg-eyebrow">MY WALLET</p>
          <div className="cg-balance">
            {coins === undefined ? <Skeleton className="h-16 w-40 bg-white/10" /> : <strong>{coins.toLocaleString()}</strong>}
            <span>코인</span>
          </div>
          <p className="cg-hero-lead">
            자습실에서 모아도, 다마고찌에서 모아도 같은 지갑이에요. 아카데미 공방에서도, 가챠에서도, 이세계의 오락기에서도 같은 코인으로 써요.
          </p>
        </div>
        <div className="cg-orbit" aria-hidden>
          <div className="cg-orbit-ring">
            {(Object.keys(WORLD_TONE) as WorldId[]).map((id, i, all) => {
              const a = (i / all.length) * Math.PI * 2 - Math.PI / 2;
              const { color, icon: Icon } = WORLD_TONE[id];
              return (
                <span key={id} className="cg-planet"
                  style={{ left: `${50 + 50 * Math.cos(a)}%`, top: `${50 + 50 * Math.sin(a)}%`, background: color, boxShadow: `0 0 0 3px #141033, 0 0 18px -2px ${color}` }}>
                  <Icon />
                </span>
              );
            })}
          </div>
          <div className="cg-orbit-ring inner" />
          <span className="cg-coin"><Coins /></span>
        </div>
        {dailyTotal > 0 && (
          <div className="cg-daily">
            <p className="cg-daily-head">
              <span>매일 다 챙기면 — 하루에 모을 수 있는 코인</span>
              <span><strong>{dailyTotal.toLocaleString()}</strong> 코인</span>
            </p>
            <div className="cg-bar" role="img" aria-label={daily.map((d) => `${WORLD_TONE[d.w.id].short} ${d.max}코인`).join(', ')}>
              {daily.map((d) => <span key={d.w.id} style={{ flexGrow: d.max, background: WORLD_TONE[d.w.id].color }} />)}
            </div>
            <ul className="cg-legend">
              {daily.map((d) => (
                <li key={d.w.id}><i style={{ background: WORLD_TONE[d.w.id].color }} />{WORLD_TONE[d.w.id].short} <b>{d.max}</b></li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <div className="cg-section-title">
          <h2>세계마다 모으는 법</h2>
          <p className="text-muted-foreground">하루 횟수가 정해진 보상은 한국 시간 자정에 다시 채워져요. 업적·이야기 보상은 한 번씩만 받아요.</p>
        </div>
        {!values ? (
          <div className="cg-grid">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-3xl" />)}</div>
        ) : (
          <div className="cg-grid">{earnWorlds.map((w) => <WorldCard key={w.id} world={w} open={isOpen(w)} />)}</div>
        )}
      </section>

      {values && (dwellers || shops.length > 0) && (
        <section>
          <div className="cg-section-title">
            <h2>모은 코인은 이렇게 써요</h2>
            <p className="text-muted-foreground">어디서 모았든 같은 지갑에서 빠져나가요. 의뢰가 거절·취소되면 낸 만큼 돌려받아요.</p>
          </div>
          <div className="cg-spend">
            {dwellers && <DwellersCard world={dwellers} open={isOpen(dwellers)} coinTime={isekai3dCoinTime(values)} />}
            <div className="cg-shop border bg-card text-card-foreground">
              {shops.map((w) => (
                <div key={w.id} className="cg-shop-group">
                  <h4><i style={{ background: WORLD_TONE[w.id].color }} />{w.name}</h4>
                  <ul>
                    {w.spend.map((r) => (
                      <li key={r.label} className="bg-muted">
                        <span>{r.label}</span><b>{r.amount}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
