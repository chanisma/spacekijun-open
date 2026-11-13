/**
 * 별까지 쌓기 — 겹쳐 뜨는 판 넷: 층 짓기 · 물물교환 · 도감(별자리·병 편지·기록) · 낚은 것.
 * 값 계산은 model/ 의 순수 함수(서버와 같은 숫자)로 하고, 판은 그리기만 한다.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Lock } from 'lucide-react';
import {
  ALL_CATCHES, BOTTLE_COIN, CATCHES, CATCH_BY_KEY, DEEP_CATCHES, EMPTY_INVENTORY, FLOORS, FLOOR_BY_KEY, RARE_CATCHES, STAR_COIN, TRADES, bottleSaleMax, canAfford, floorCost, maxTrades, starSaleMax,
  type Inventory, type TradeKind,
} from '../model/catalog';
import { MERCHANT_AT, VISITORS, altitudeBand, visitorUnlocked } from '../model/visitors';
import { CONSTELLATIONS, RANK_CONSTELLATIONS, nextConstellation, type Constellation } from '../model/constellations';
import { LETTERS, LETTER_BY_KEY, LETTER_KINDS, letterKindCounts } from '../model/letters';
import { TOWER_ACHIEVEMENTS, achievementState, rewardOf, type TowerAchievementsData } from '../model/achievements';
import { magnitudeLabel, magnitudeNote, magnitudeOf, rankLadder, rgbCss, starTint, type PastTower } from '../model/rank';
import type { FinishResult } from '../services/towerApi';
import { CostChips, FloorThumb, ItemIcon, Sheet, formatDuration } from './ui';

/** 층 순서 바꾸기 — 위에서 아래로 보여 주고(탑 모양 그대로), 저장할 때 아래→위로 보낸다 */
function ReorderFloors({ floors, busy, onSave }: { floors: string[]; busy: boolean; onSave: (next: string[]) => void }) {
  const [order, setOrder] = useState<string[]>(() => [...floors].reverse());
  const changed = order.join() !== [...floors].reverse().join();
  const move = (i: number, d: -1 | 1) => setOrder((o) => {
    const j = i + d;
    if (j < 0 || j >= o.length) return o;
    const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  return (
    <>
      <h3 className="st-section">층 순서 바꾸기</h3>
      <p className="st-hint" style={{ margin: 0 }}>위가 돔 바로 아래 층입니다. 순서를 바꿔도 재료는 들지 않아요.</p>
      {order.map((k, i) => (
        <div key={k} className="st-row" style={{ padding: '4px 8px' }}>
          <FloorThumb floorKey={k} />
          <span className="grow name">{FLOOR_BY_KEY[k]?.name ?? k}</span>
          <button type="button" className="st-btn ghost" aria-label={`${FLOOR_BY_KEY[k]?.name} 위로`} disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp size={16} /></button>
          <button type="button" className="st-btn ghost" aria-label={`${FLOOR_BY_KEY[k]?.name} 아래로`} disabled={i === order.length - 1} onClick={() => move(i, 1)}><ChevronDown size={16} /></button>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="st-btn ghost" disabled={!changed} onClick={() => setOrder([...floors].reverse())}>되돌리기</button>
        <button type="button" className="st-btn primary" disabled={!changed || busy} onClick={() => onSave([...order].reverse())}>순서 저장</button>
      </div>
    </>
  );
}

/** 나의 별 — 등성 빛깔의 작은 별(랭크 단추·랭크 판). 완성한 탑이 없으면 흐린 잿빛 */
export function RankStar({ towers, size = 18 }: { towers: number; size?: number }) {
  const c = starTint(towers).rgb;
  const glow = towers > 0 ? Math.min(1, 0.35 + towers * 0.1) : 0.15;
  return (
    <span aria-hidden style={{
      display: 'inline-block', width: size, height: size, flex: 'none',
      clipPath: 'polygon(50% 0, 61% 38%, 100% 50%, 61% 62%, 50% 100%, 39% 62%, 0 50%, 39% 38%)',
      background: `radial-gradient(circle, #fff 0 18%, ${rgbCss(c)} 45%, ${rgbCss(c, glow)} 100%)`,
    }} />
  );
}

/** 랭크 판 — 등성이 무엇인지 · 지금 등성 · 다음 등성까지 · 사다리 · 지난 탑들 */
export function RankSheet({ towers, floors, pastTowers, onClose, onOpenRanking }: {
  towers: number; floors: number; pastTowers: PastTower[]; onClose: () => void;
  /** «별을 쌓은 사람들»(학교 순위) 판으로 — 2026-10-20 */
  onOpenRanking?: () => void;
}) {
  const m = magnitudeOf(towers);
  const tint = starTint(towers);
  const full = floors >= FLOORS.length;
  return (
    <Sheet title={`나의 별 · ${magnitudeLabel(m)}`} onClose={onClose}
      footer={onOpenRanking && <button type="button" className="st-btn" data-open-ranking onClick={onOpenRanking}>별을 쌓은 사람들 보기</button>}>
      <div className="st-row" data-rank-now style={{ gap: 12 }}>
        <span style={{ width: 64, height: 64, flex: 'none', display: 'grid', placeItems: 'center', background: '#0b0d2a', borderRadius: 4 }}>
          <RankStar towers={towers} size={towers > 0 ? 40 + Math.min(16, towers * 2) : 28} />
        </span>
        <div className="grow">
          <div className="name" style={{ fontSize: 'calc(var(--st-fs) * 4 / 3)' }}>{magnitudeLabel(m)} <span className="st-hint">· {tint.name}{tint.cls ? `(${tint.cls}형)` : ''}</span></div>
          <div className="blurb">{magnitudeNote(m)}</div>
          <div className="blurb">완성한 탑 <b className="st-good">{towers}개</b></div>
        </div>
      </div>
      <p className="st-hint" style={{ margin: 0 }}>
        등성은 별이 얼마나 밝게 보이는지를 나타내는 숫자예요. <b>숫자가 작을수록 밝아요</b> — 1등성 다음은 0등성, 그다음은 −1등성.
        탑을 하나 완성할 때마다 한 등성씩 밝아지고, 끝은 없어요.
      </p>
      {full ? (
        <p className="st-good" style={{ margin: 0 }}>이 탑은 완성했어요. [짓기]에서 새 탑을 쌓으면 {magnitudeLabel(m - 1)}을 향해 다시 시작해요.</p>
      ) : (
        <div data-rank-progress>
          <div className="st-hint">{magnitudeLabel(m - 1)}까지 — 지금 탑 <b>{floors} / {FLOORS.length}층</b></div>
          <div style={{ height: 8, marginTop: 4, background: 'rgba(255,255,255,.12)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${(floors / FLOORS.length) * 100}%`, height: '100%', background: rgbCss(starTint(towers + 1).rgb) }} />
          </div>
        </div>
      )}
      <h3 className="st-section">등성 사다리</h3>
      {rankLadder(towers).map((r) => (
        <div key={r.m} className="st-row" style={{ padding: '4px 8px', opacity: r.reached ? 1 : 0.6, outline: r.current ? '2px solid var(--st-accent)' : undefined }} data-rank-step={r.m}>
          <RankStar towers={r.towers} size={16} />
          <span className="name" style={{ minWidth: '4.5em' }}>{magnitudeLabel(r.m)}</span>
          <span className="grow blurb">{magnitudeNote(r.m)}</span>
          <span className="st-hint">{r.towers === 0 ? '시작' : `탑 ${r.towers}개`}</span>
        </div>
      ))}
      {pastTowers.length > 0 && (
        <>
          <h3 className="st-section">지난 탑 {pastTowers.length}개 · 수평선에 서 있어요</h3>
          {pastTowers.map((p, i) => (
            <div key={i} className="st-row" style={{ padding: '4px 8px' }}>
              <RankStar towers={i + 1} size={14} />
              <span className="grow">{i + 1}번째 탑{p.floors[0] ? ` · 첫 층 ${FLOOR_BY_KEY[p.floors[0]]?.name ?? p.floors[0]}` : ''}</span>
              {p.doneAt && <span className="st-hint">{new Date(p.doneAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</span>}
            </div>
          ))}
        </>
      )}
      <p className="st-hint" style={{ margin: 0 }}>별의 빛깔(붉은 별 → 푸른 별)은 게임의 표현이에요. 실제 별의 밝기와 색은 서로 상관이 없어요.</p>
    </Sheet>
  );
}

export function BuildSheet({ inventory, floors, busy, onBuild, onReorder, onClose, towers = 0, onNewTower }: {
  inventory: Inventory; floors: string[]; busy: boolean; onBuild: (key: string) => void; onReorder: (next: string[]) => void; onClose: () => void;
  towers?: number; onNewTower?: () => void;
}) {
  const n = floors.length;
  const next = nextConstellation(n);
  const rows = useMemo(() => FLOORS.filter((f) => !floors.includes(f.key))
    .map((f) => ({ f, cost: floorCost(f.key, n) }))
    .sort((a, b) => Number(canAfford(inventory, b.cost)) - Number(canAfford(inventory, a.cost))), [floors, inventory, n]);
  return (
    <Sheet title={`층 짓기 · 지금 ${n}층 / ${FLOORS.length}`} onClose={onClose}>
      <p className="st-hint" style={{ margin: 0 }}>
        새 층은 돔 바로 아래에 올라갑니다. 쌓을수록 재료가 늘고, 4층마다 별 조각이 하나 더 듭니다.
        {next && <> 다음 별자리 <b className="st-good">«{next.name}»</b>까지 {next.unlockAt - n}층.</>}
      </p>
      {rows.length === 0 && (
        <div className="st-row" data-tower-complete style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div className="name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RankStar towers={towers} size={22} />탑이 하늘에 닿았어요 — 나의 별 {magnitudeLabel(magnitudeOf(towers))}
          </div>
          <p className="st-hint" style={{ margin: 0 }}>
            새 탑을 쌓으면 이 탑은 수평선으로 물러나 작은 실루엣으로 남고, 1층부터 다시 시작해요.
            가진 재료 · 도감 · 병 편지 · 집중 기록은 그대로예요. 다음 탑을 완성하면 <b className="st-good">{magnitudeLabel(magnitudeOf(towers + 1))}</b>.
          </p>
          <p className="st-hint" style={{ margin: 0 }}>비공정 상인은 새 탑이 다시 구름층({MERCHANT_AT}층)에 닿으면 돌아와요.</p>
          {onNewTower && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="st-btn primary" disabled={busy} onClick={onNewTower}>새 탑 쌓기</button>
            </div>
          )}
        </div>
      )}
      {rows.map(({ f, cost }) => {
        const ok = canAfford(inventory, cost);
        return (
          <div key={f.key} className="st-row">
            <FloorThumb floorKey={f.key} />
            <div className="grow">
              <div className="name">{f.name}</div>
              <div className="blurb">{f.blurb}</div>
              <CostChips cost={cost} have={inventory} />
            </div>
            <button type="button" className="st-btn primary" disabled={!ok || busy} onClick={() => onBuild(f.key)}>짓기</button>
          </div>
        );
      })}
      {floors.length >= 2 && <ReorderFloors key={floors.join()} floors={floors} busy={busy} onSave={onReorder} />}
    </Sheet>
  );
}

/**
 * 비공정 상인 — 별 조각·남는 병 → 코인(통합 지갑). 하루 상한이 있어 «오늘 N/10코인»을 늘 보인다.
 * 별 조각과 남는 병은 상한을 따로 센다(서버 원장 종류가 다르다).
 */
function CoinSaleRow({ resource, have, coins, today, unlimited, busy, onSell }: {
  resource: 'star' | 'bottle'; have: number; coins: number | null; today: number; unlimited: boolean; busy: boolean; onSell: (times: number) => void;
}) {
  const rule = resource === 'star' ? STAR_COIN : BOTTLE_COIN;
  const max = unlimited ? 0 : resource === 'star' ? starSaleMax(have, today) : bottleSaleMax(have, today);
  const full = today >= rule.dailyCap;
  const name = resource === 'star' ? '별 조각' : '남는 병';
  return (
    <>
      <div className="st-row" data-star-coin={resource === 'star' ? '' : undefined} data-bottle-coin={resource === 'bottle' ? '' : undefined}>
        <CostChips cost={{ [resource]: 1 }} have={{ ...EMPTY_INVENTORY, [resource]: have }} />
        <span aria-hidden>→</span>
        <span className="grow">코인 {rule.rate}</span>
        {[1, 5].map((times) => (
          <button key={times} type="button" className="st-btn" disabled={busy || max < times} onClick={() => onSell(times)}>{times}개</button>
        ))}
      </div>
      <p className="st-hint" style={{ margin: 0 }}>
        {unlimited ? `관리자 계정(테스트용)은 ${name}을 코인으로 바꿀 수 없어요. `
          : full ? `${name}: 오늘은 다 바꿨어요(하루 ${rule.dailyCap}코인). 내일 다시 와요. `
          : `${name}: 오늘 ${today}/${rule.dailyCap}코인 바꿈. `}
        {resource === 'star' && <>코인은 별빛 아카데미·다마고찌와 같은 지갑이에요{coins !== null ? ` — 지금 ${coins}코인` : ''}.</>}
      </p>
    </>
  );
}

export function TradeSheet({ inventory, floors, focus, busy, onTrade, onClose, coins = null, starCoinsToday = 0, unlimited = false, onSellStars,
  letters = 0, bottleCoinsToday = 0, onSellBottles }: {
  inventory: Inventory; floors: number; focus: 'raft' | 'merchant'; busy: boolean; onTrade: (kind: TradeKind, times: number) => void; onClose: () => void;
  coins?: number | null; starCoinsToday?: number; unlimited?: boolean; onSellStars?: (times: number) => void;
  /** 받은 병 편지 수 — 다 모아야 «남는 병»이 생긴다 */
  letters?: number; bottleCoinsToday?: number; onSellBottles?: (times: number) => void;
}) {
  const merchantOpen = floors >= MERCHANT_AT;
  const row = (k: TradeKind) => {
    const t = TRADES[k];
    const max = maxTrades(inventory, k);
    return (
      <div key={k} className="st-row">
        <CostChips cost={t.give} have={inventory} />
        <span aria-hidden>→</span>
        <span className="grow"><CostChips cost={t.get} /></span>
        {[1, 5].map((times) => (
          <button key={times} type="button" className="st-btn" disabled={busy || max < times} onClick={() => onTrade(k, times)}>{times}번</button>
        ))}
        <button type="button" className="st-btn ghost" disabled={busy || max < 2} onClick={() => onTrade(k, max)}>최대{max > 1 ? ` ${max}` : ''}</button>
      </div>
    );
  };
  const kinds = (who: 'raft' | 'merchant') => (Object.keys(TRADES) as TradeKind[]).filter((k) => TRADES[k].who === who);
  const raft = (
    <>
      <h3 className="st-section">뗏목 상인</h3>
      <p className="st-hint" style={{ margin: 0 }}>지나가는 뗏목이 물고기를 재료로 바꿔 줍니다. 물고기는 층을 지을 때도 쓰니 조금은 남겨 두세요.</p>
      {kinds('raft').map(row)}
    </>
  );
  const merchant = (
    <>
      <h3 className="st-section">비공정 상인</h3>
      {merchantOpen ? (
        <>
          <p className="st-hint" style={{ margin: 0 }}>구름층에 정박한 비공정. 뗏목보다 고철을 싸게 주고, 남는 별 조각을 재료 한 꾸러미나 코인으로, 편지를 다 읽은 뒤의 남는 병을 코인으로 바꿔 줍니다.</p>
          {kinds('merchant').map(row)}
          {onSellStars && <CoinSaleRow resource="star" have={inventory.star} coins={coins} today={starCoinsToday} unlimited={unlimited} busy={busy} onSell={onSellStars} />}
          {onSellBottles && (letters >= LETTERS.length || inventory.bottle > 0
            ? <CoinSaleRow resource="bottle" have={inventory.bottle} coins={coins} today={bottleCoinsToday} unlimited={unlimited} busy={busy} onSell={onSellBottles} />
            : <p className="st-hint" style={{ margin: 0 }} data-bottle-coin-locked>병 편지를 모두 모으면({letters}/{LETTERS.length}통) 그 뒤로 걸리는 병을 코인으로 사 줘요.</p>)}
        </>
      ) : (
        <p className="st-hint" style={{ margin: 0 }}>탑이 구름층({MERCHANT_AT}층)에 닿으면 비공정 상인이 정박합니다. 지금 {floors}층 — {MERCHANT_AT - floors}층 더.</p>
      )}
    </>
  );
  return (
    <Sheet title={focus === 'merchant' ? '비공정 상인' : '물물교환'} onClose={onClose}>
      {focus === 'merchant' ? <>{merchant}{raft}</> : <>{raft}{merchant}</>}
    </Sheet>
  );
}

function ConstellationGlyph({ c, lit }: { c: Pick<Constellation, 'stars' | 'lines'>; lit: boolean }) {
  return (
    <svg width="64" height="50" viewBox="-2 -2 44 34" aria-hidden style={{ flex: 'none', background: '#0b0d2a', borderRadius: 3 }}>
      {lit && c.lines.map(([i, j], k) => (
        <line key={k} x1={c.stars[i][0]} y1={c.stars[i][1]} x2={c.stars[j][0]} y2={c.stars[j][1]} stroke="#aabeff" strokeOpacity="0.55" strokeWidth="0.8" />
      ))}
      {c.stars.map(([x, y, b], k) => <circle key={k} cx={x} cy={y} r={lit ? 0.6 + b * 0.45 : 0.7} fill={lit ? '#fff6d8' : '#4a4a7a'} />)}
    </svg>
  );
}

export type CodexTab = 'stars' | 'fish' | 'visitors' | 'letters' | 'achievements' | 'log';

function VisitorThumb({ name, met }: { name: string; met: boolean }) {
  return (
    <span style={{ width: 76, height: 50, flex: 'none', display: 'grid', placeItems: 'center', background: '#0b0d2a', borderRadius: 3, overflow: 'hidden' }}>
      <img className={`st-sprite ${met ? '' : 'st-silhouette'}`} src={`/images/star-tower/visitor-${name}.png`} alt="" style={{ maxWidth: 72, maxHeight: 46 }} />
    </span>
  );
}

/** 업적 — 진행 막대 · 보상 · [받기](관리자는 진행만). 진행도·받은 것은 서버 값을 그대로 그린다 */
function AchievementList({ data, busy, onClaim }: { data: TowerAchievementsData | null; busy: boolean; onClaim?: (id: string, title: string) => void }) {
  if (!data) return <p className="st-hint" style={{ margin: 0 }}>업적을 불러오는 중이에요…</p>;
  const done = TOWER_ACHIEVEMENTS.filter((a) => achievementState(a, data) !== 'locked').length;
  return (
    <>
      <p className="st-hint" style={{ margin: 0 }}>
        달성한 업적 <b className="st-good">{done}/{TOWER_ACHIEVEMENTS.length}</b> · 업적마다 한 번 코인을 받아요(별빛 아카데미·다마고찌와 같은 지갑).
        {data.admin && ' 관리자 계정(테스트용)은 진행만 보이고 코인은 받을 수 없어요.'}
      </p>
      {TOWER_ACHIEVEMENTS.map((a) => {
        const st = achievementState(a, data);
        const have = Math.min(a.goal, data.progress[a.id] ?? 0);
        return (
          <div key={a.id} className="st-row" data-achievement={a.id} data-state={st} style={{ opacity: st === 'locked' ? 0.75 : 1 }}>
            <div className="grow">
              <div className="name">{a.title} <span className="st-hint">· {rewardOf(a, data)}코인</span></div>
              <div className="blurb">{a.desc}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,.12)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${(have / a.goal) * 100}%`, height: '100%', background: st === 'locked' ? 'var(--st-accent)' : '#7be3a8' }} />
                </div>
                <span className="st-hint" style={{ minWidth: '3.5em', textAlign: 'right' }}>{have}/{a.goal}</span>
              </div>
            </div>
            {st === 'claimed' ? <span className="st-good">받음</span>
              : st === 'ready' && !data.admin && onClaim ? <button type="button" className="st-btn primary" disabled={busy} onClick={() => onClaim(a.id, a.title)}>받기</button>
              : st === 'ready' ? <span className="st-good">달성</span>
              : <Lock size={14} aria-label="아직" />}
          </div>
        );
      })}
    </>
  );
}

export function CodexSheet({ floors, visitors, caught, letters, focusSeconds, sessions, initialTab = 'stars', onClose, towers = 0, achievements = null, busy = false, onClaim }: {
  floors: string[]; visitors: string[]; caught: string[]; letters: string[]; focusSeconds: number; sessions: number; initialTab?: CodexTab; onClose: () => void;
  towers?: number;
  /** 업적 — 서버 값(없으면 불러오는 중) */
  achievements?: TowerAchievementsData | null; busy?: boolean; onClaim?: (id: string, title: string) => void;
}) {
  const [tab, setTab] = useState<CodexTab>(initialTab);
  // 도감은 «가 본 높이»로 적는다 — 탑을 완성한 적이 있으면 새 탑이 낮아도 별자리·높은 하늘은 이미 본 것이다
  const n = towers > 0 ? FLOORS.length : floors.length;
  const opened = CONSTELLATIONS.filter((c) => n >= c.unlockAt).length + RANK_CONSTELLATIONS.filter((c) => towers >= c.towersAt).length;
  const allStars = CONSTELLATIONS.length + RANK_CONSTELLATIONS.length;
  const found = new Set(letters);
  const read = LETTERS.filter((l) => found.has(l.key)).length;
  const kindCounts = letterKindCounts(letters);
  const ready = achievements && !achievements.admin ? TOWER_ACHIEVEMENTS.filter((a) => achievementState(a, achievements) === 'ready').length : 0;
  const achDone = achievements ? TOWER_ACHIEVEMENTS.filter((a) => achievementState(a, achievements) !== 'locked').length : 0;
  return (
    <Sheet title="별지기의 도감" onClose={onClose}>
      <div className="st-tabs" role="tablist">
        {([
          ['stars', `별자리 ${opened}/${allStars}`],
          ['fish', `낚시 ${ALL_CATCHES.filter((c) => caught.includes(c.key)).length}/${ALL_CATCHES.length}`],
          ['visitors', `방문자 ${visitors.length}/${VISITORS.length}`],
          ['letters', `병 편지 ${read}/${LETTERS.length}`],
          ['achievements', `업적 ${achDone}/${TOWER_ACHIEVEMENTS.length}${ready ? ` · 받기 ${ready}` : ''}`],
          ['log', '기록'],
        ] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === 'stars' && (
        <>
          <h3 className="st-section">층 별자리 · 2층마다 하나</h3>
          {CONSTELLATIONS.map((c) => {
            const lit = n >= c.unlockAt;
            return (
              <div key={c.key} className="st-row">
                <ConstellationGlyph c={c} lit={lit} />
                <div className="grow">
                  <div className="name">{lit ? c.name : '이름 모를 별들'}</div>
                  <div className="blurb">{lit ? c.story : `${c.unlockAt}층을 쌓으면 밤하늘에 선이 이어집니다.`}</div>
                </div>
              </div>
            );
          })}
          <h3 className="st-section">등성 별자리 · 탑을 완성할 때마다 하나</h3>
          {RANK_CONSTELLATIONS.map((c) => {
            const lit = towers >= c.towersAt;
            return (
              <div key={c.key} className="st-row" data-rank-constellation={c.key}>
                <ConstellationGlyph c={c} lit={lit} />
                <div className="grow">
                  <div className="name">{lit ? c.name : '아직 어두운 별들'}</div>
                  <div className="blurb">{lit ? c.story : `탑을 ${c.towersAt}개 완성하면(${magnitudeLabel(magnitudeOf(c.towersAt))}) 하늘에 이어집니다.`}</div>
                </div>
              </div>
            );
          })}
        </>
      )}
      {tab === 'fish' && (
        <>
          <p className="st-hint" style={{ margin: 0 }}>한 번이라도 걸린 것이 적힙니다. 희귀 물고기는 그 시각·날씨·계절에만 걸려요 — 5분 칸이 차는 «그 순간»을 봅니다. 깊은 바다 물고기는 탑을 완성할수록 올라와요.</p>
          {ALL_CATCHES.map((c) => {
            const got = caught.includes(c.key);
            const rare = RARE_CATCHES.find((r) => r.key === c.key);
            const deep = DEEP_CATCHES.find((r) => r.key === c.key);
            return (
              <div key={c.key} className="st-row">
                <span style={{ width: 56, height: 40, flex: 'none', display: 'grid', placeItems: 'center', background: '#0b0d2a', borderRadius: 3 }}>
                  <img className={`st-sprite ${got ? '' : 'st-silhouette'}`} src={`/images/star-tower/item-${c.icon}.png`} alt="" style={{ width: 'auto', height: 'auto', transform: 'scale(2)' }} />
                </span>
                <div className="grow">
                  <div className="name">{got ? c.label : '???'}{rare && <span className="st-good"> · 희귀</span>}{deep && <span className="st-good"> · 깊은 바다</span>}</div>
                  <div className="blurb">
                    {deep ? (towers >= deep.towersAt ? '깊은 바다에서 가끔 올라와요' : deep.hint) : rare ? rare.hint : '언제든'}{got ? '' : ' — 아직 못 낚았어요'}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
      {tab === 'visitors' && (
        <>
          <p className="st-hint" style={{ margin: 0 }}>하늘을 지나가는 방문자를 눌러 인사하면 여기에 적힙니다. 높이마다 사는 방문자가 다릅니다.</p>
          {VISITORS.map((v) => {
            const met = visitors.includes(v.key);
            const reached = visitorUnlocked(v, n, towers);
            const band = altitudeBand(v.band[0]);
            return (
              <div key={v.key} className="st-row">
                <VisitorThumb name={v.sprites[0]} met={met} />
                <div className="grow">
                  <div className="name">{met ? v.name : '???'}{v.nightOnly && <span className="st-hint"> · 밤에만</span>}{v.towersAt && <span className="st-good"> · 등성</span>}</div>
                  <div className="blurb">
                    {met ? v.story : reached ? `${band}을 지나갑니다 — 보이면 눌러서 인사해 보세요.`
                      : v.towersAt && towers < v.towersAt ? `${band} — 탑 ${v.towersAt}개를 완성하면(${magnitudeLabel(magnitudeOf(v.towersAt))}) 나타납니다.`
                      : `${band} — ${v.unlockAt}층을 쌓으면 나타납니다.`}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
      {tab === 'letters' && (
        <>
          <p className="st-hint" style={{ margin: 0 }}>
            어떤 편지가 걸릴지는 바다 마음이에요(무작위). 별지기의 편지만은 순서대로 이어져요.
            {read >= LETTERS.length && ' 편지를 다 모았어요 — 이제 걸리는 병은 비공정 상인이 코인으로 사 줘요.'}
          </p>
          {LETTER_KINDS.map((k) => (
            <div key={k.kind} data-letter-kind={k.kind}>
              <h3 className="st-section">{k.label} {kindCounts[k.kind].have}/{kindCounts[k.kind].total}</h3>
              <p className="st-hint" style={{ margin: '0 0 6px' }}>{k.blurb}</p>
              {LETTERS.filter((l) => l.kind === k.kind).map((l) => (
                found.has(l.key)
                  ? <article key={l.key} className="st-letter"><b>{l.title}</b><p style={{ margin: '6px 0 0' }}>{l.body}</p></article>
                  : <div key={l.key} className="st-letter locked"><Lock size={12} style={{ verticalAlign: '-2px' }} /> 아직 바다를 떠도는 병 — 낚시하다 보면 걸립니다.</div>
              ))}
            </div>
          ))}
        </>
      )}
      {tab === 'achievements' && <AchievementList data={achievements} busy={busy} onClaim={onClaim} />}
      {tab === 'log' && (
        <div className="st-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div>총 집중 <b className="st-good">{formatDuration(focusSeconds)}</b></div>
          <div>끝까지 채운 집중 <b>{sessions}번</b></div>
          <div>지금 탑 <b>{floors.length} / {FLOORS.length}층</b></div>
          <div>완성한 탑 <b>{towers}개</b> · 나의 별 <b className="st-good">{magnitudeLabel(magnitudeOf(towers))}</b></div>
          <div>읽은 병 편지 <b>{read} / {LETTERS.length}통</b></div>
          <p className="st-hint" style={{ margin: 0 }}>중간에 그만둔 집중도 다 찬 5분만큼 시간에 들어갑니다.</p>
        </div>
      )}
    </Sheet>
  );
}

export function CatchSheet({ result, onClose, onReadLetters }: {
  result: FinishResult; onClose: () => void; onReadLetters: () => void;
}) {
  const totals: Partial<Inventory> = {};
  for (const k of result.catches) {
    const c = CATCH_BY_KEY[k];
    if (!c) continue;
    for (const [r, v] of Object.entries(c.gives) as [keyof Inventory, number][]) totals[r] = (totals[r] ?? 0) + v;
  }
  if (result.bonusStars > 0) totals.star = (totals.star ?? 0) + result.bonusStars;
  const bottles = result.catches.filter((k) => k === 'bottle').length;
  // 병이 걸렸는데 새 편지가 그보다 적으면 나머지는 «남는 병»(편지를 다 모은 뒤)
  const spare = Math.max(0, bottles - result.letters.length);
  const kinds = [...new Set(result.letters.map((k) => LETTER_BY_KEY[k]?.kind).filter((x) => x && x !== 'story'))]
    .map((kind) => LETTER_KINDS.find((x) => x.kind === kind)?.label);
  const title = result.outcome === 'completed' ? '끝까지 채웠어요!' : '그만둔 데까지 건졌어요';
  return (
    <Sheet title={title} onClose={onClose} footer={<button type="button" className="st-btn primary" onClick={onClose}>탑으로</button>}>
      {result.catches.length === 0 ? (
        <p className="st-hint" style={{ margin: 0 }}>5분이 차기 전이라 아무것도 걸리지 않았어요. 다음엔 조금만 더 기다려 볼까요?</p>
      ) : (
        <div className="st-catch-grid">
          {result.catches.map((k, i) => {
            const c = CATCH_BY_KEY[k];
            return (
              <div key={i} className={`st-catch ${c?.rare ? 'rare' : ''}`} style={{ animationDelay: `${i * 70}ms` }}>
                <ItemIcon name={c?.icon ?? 'fish-sardine'} size={2} label={c?.label} />
                <span>{c?.label ?? k}</span>
              </div>
            );
          })}
        </div>
      )}
      {result.bonusStar && (
        <div className="st-row"><ItemIcon name="star" label="별 조각" /><span className="grow">완주 보너스 — 별 조각 {result.bonusStars}개 (그리고 한 번 더 걸렸어요)</span></div>
      )}
      {Object.keys(totals).length > 0 && <div><span className="st-hint">받은 것 </span><CostChips cost={totals} /></div>}
      {result.letters.length > 0 && (
        <div className="st-row" data-new-letters>
          <ItemIcon name="bottle" label="병 편지" />
          <span className="grow">
            병 편지를 주웠어요 — {result.letters.map((k) => `«${LETTER_BY_KEY[k]?.title ?? k}»`).join(' · ')}
            {kinds.length > 0 && <span className="st-hint"> ({kinds.join(' · ')})</span>}
          </span>
          <button type="button" className="st-btn" onClick={onReadLetters}>읽기</button>
        </div>
      )}
      {spare > 0 && (
        <div className="st-row" data-spare-bottles>
          <ItemIcon name="bottle" label="남는 병" />
          <span className="grow">편지를 다 모아서 남는 병 {spare}개가 됐어요 — 비공정 상인이 코인으로 사 줘요.</span>
        </div>
      )}
    </Sheet>
  );
}
