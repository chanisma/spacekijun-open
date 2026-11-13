/**
 * 별까지 쌓기 — «별을 쌓은 사람들» 판(2026-10-20 사용자 요청 «다마고치 참고», docs/features/star-tower.md §12).
 * 학교 전체 20위 + 내 자리. 줄마다 그 사람의 «지금 탑»을 실제 층 그림으로 작게 쌓아 보여 준다(다마고찌가 펫을 그 방과 함께 그리듯).
 * 순서 = 서버 tower_ranking, 값·규칙 = model/ranking.ts. 이 판은 그리기만 한다.
 */
import { useEffect, useRef, useState } from 'react';
import { BASE_FLOOR, ROOF_FLOOR } from '../model/catalog';
import { magnitudeLabel, magnitudeOf, rgbCss, starTint } from '../model/rank';
import { MEDAL, RANKING_ORDER_NOTE, RANKING_SIZE, ownerLabel, type RankingData, type RankingRow } from '../model/ranking';
import { loadTowerAssets, type TowerAssets } from '../scene/assets';
import type { TowerApi } from '../services/towerApi';
import { RankStar } from './sheets';
import { Sheet, formatDuration } from './ui';

/** 장면(TowerScene.layout)과 같은 쌓기 규칙 — 다음 층은 앞 층의 deck 줄에 앉는다 */
const BASE_SINK = 6;
const BOX_W = 44;
const BOX_H = 88;

/** 그 사람의 지금 탑 — 갑판 · 층들 · 돔 + 꼭대기에 등성 빛깔의 별(완성한 탑이 있을 때) */
function MiniTower({ floors, towers, assets }: { floors: string[]; towers: number; assets: TowerAssets | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !assets) return;
    const keys = [BASE_FLOOR, ...floors, ROOF_FLOOR];
    const placed: { s: TowerAssets['floors'][string]; a: number }[] = [];
    let a = -BASE_SINK;
    let w = 1;
    for (const k of keys) {
      const s = assets.floors[k];
      if (!s) continue;
      placed.push({ s, a });
      w = Math.max(w, s.w);
      a += s.h - s.deck - 2;
    }
    const last = placed[placed.length - 1];
    const starRoom = towers > 0 ? 10 : 2;
    const h = (last ? last.a + last.s.h : 1) + starRoom;
    // 원래 크기로 한 번 그리고 상자에 맞춰 줄인다(작은 탑은 정수 배로만 키운다 — 도트가 번지지 않게)
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const g = off.getContext('2d')!;
    for (const p of placed) g.drawImage(p.s.img, Math.round(w / 2 - p.s.w / 2), h - p.a - p.s.h);
    if (towers > 0 && last) {
      const [r, gg, b] = starTint(towers).rgb;
      const cx = Math.round(w / 2);
      const cy = h - (last.a + last.s.h) - 5;
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect(cx - 2, cy, 5, 1); g.fillRect(cx, cy - 2, 1, 5);
      g.fillStyle = '#fff'; g.fillRect(cx, cy, 1, 1);
    }
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    c.width = BOX_W * dpr; c.height = BOX_H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    const fit = Math.min((BOX_W * dpr) / w, (BOX_H * dpr - 2 * dpr) / h);
    const scale = fit >= 1 ? Math.floor(fit) : fit;
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.imageSmoothingQuality = 'high';
    const dw = Math.round(w * scale);
    const dh = Math.round(h * scale);
    ctx.drawImage(off, Math.round((c.width - dw) / 2), c.height - dh - dpr, dw, dh);
  }, [floors, towers, assets]);
  return (
    <canvas ref={ref} role="img" aria-label={`${floors.length}층 탑`}
      style={{ width: BOX_W, height: BOX_H, flex: 'none', borderRadius: 3, background: 'linear-gradient(#0b0d2a, #1d2350 70%, #24406a)', imageRendering: 'pixelated' }} />
  );
}

function Row({ row, assets }: { row: RankingRow; assets: TowerAssets | null }) {
  const m = magnitudeOf(row.towers);
  return (
    <li className="st-row" data-ranking-rank={row.rank} data-ranking-mine={row.mine ? '' : undefined}
      style={{ gap: 10, padding: '6px 8px', outline: row.mine ? '2px solid var(--st-accent)' : undefined }}>
      {/* 메달 그림 글자는 같은 크기에서 숫자보다 작아 보여 2배로 */}
      <span aria-label={`${row.rank}위`} style={{ width: '2.4em', flex: 'none', textAlign: 'center', fontWeight: 700, fontSize: MEDAL[row.rank] ? 'calc(var(--st-fs) * 2)' : 'calc(var(--st-fs) * 4 / 3)' }}>
        {MEDAL[row.rank] ?? row.rank}
      </span>
      <MiniTower floors={row.floors} towers={row.towers} assets={assets} />
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="name" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ownerLabel(row)}>
          {ownerLabel(row)}
        </span>
        <span className="blurb" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <RankStar towers={row.towers} size={14} />
          <b style={{ color: rgbCss(starTint(row.towers).rgb) }}>{magnitudeLabel(m)}</b>
        </span>
        <span className="st-hint" style={{ display: 'block' }}>완성한 탑 {row.towers}개 · 지금 {row.floors.length}층 · 집중 {formatDuration(row.focusSeconds)}</span>
      </span>
    </li>
  );
}

export function RankingSheet({ api, onClose }: { api: TowerApi; onClose: () => void }) {
  const [data, setData] = useState<RankingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<TowerAssets | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    // 그림은 장면과 같은 캐시 — 첫 로딩 화면이 이미 받아 두었다
    void loadTowerAssets().then((a) => { if (alive) setAssets(a); });
    setError(null);
    api.ranking().then((d) => { if (alive) setData(d); }, (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [api, attempt]);

  const meInList = data?.rows.some((r) => r.mine) ?? false;
  return (
    <Sheet title="별을 쌓은 사람들" onClose={onClose}>
      <p className="st-hint" style={{ margin: 0 }}>
        학교에서 별을 가장 높이 쌓은 {RANKING_SIZE}명이에요. {RANKING_ORDER_NOTE} 별빛 친구의 탑에만 이름이 보여요.
      </p>
      {error ? (
        <div className="st-row" role="alert" style={{ justifyContent: 'space-between' }}>
          <span>순위를 불러오지 못했어요. ({error})</span>
          <button type="button" className="st-btn" onClick={() => setAttempt((n) => n + 1)}>다시 불러오기</button>
        </div>
      ) : !data ? (
        <p className="st-hint" style={{ margin: 0 }} aria-live="polite">불러오는 중…</p>
      ) : data.rows.length === 0 ? (
        <p className="st-row" style={{ margin: 0 }} data-ranking-empty>아직 층을 지은 사람이 없어요. 첫 층을 올려 첫 줄의 주인공이 되어 보세요!</p>
      ) : (
        <ol data-ranking-board style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {data.rows.map((r) => <Row key={r.rank} row={r} assets={assets} />)}
        </ol>
      )}
      {data && data.excluded && (
        <p className="st-hint" style={{ margin: 0 }} data-ranking-excluded>관리자 계정은 재화가 무한(테스트용)이라 순위에서 빠져요.</p>
      )}
      {data && !data.excluded && data.me && !meInList && (
        <p className="st-row" style={{ margin: 0 }} data-ranking-me>
          나의 자리 — <b className="st-good">{data.me.rank}위</b> / {data.players}명 · {magnitudeLabel(magnitudeOf(data.me.towers))} · 지금 {data.me.floors}층
        </p>
      )}
      {data && !data.excluded && !data.me && data.rows.length > 0 && (
        <p className="st-hint" style={{ margin: 0 }} data-ranking-me>첫 층을 지으면 나도 이 판에 올라요.</p>
      )}
    </Sheet>
  );
}
