import { useState } from 'react';
import {
  ACHIEVEMENT_GROUPS, ISEKAI_ACHIEVEMENTS, achievedCount, achievementState, rewardOf, unlockedBadges,
  type AchievementGroup, type IsekaiAchievementsData,
} from '../model/achievements';

const fmt = (n: number, unit: string) => (unit === '원' ? `${n.toLocaleString()}원` : `${n}${unit}`);

export function AchievementBoard({
  data, preview, claiming, onClaim, onClaimAll, badgeId, onBadge,
}: {
  data: IsekaiAchievementsData;
  /** 예시·관리자 — 받기 단추를 막는다 */
  preview: string | null;
  claiming: string | null;
  onClaim: (id: string) => void;
  onClaimAll: (ids: string[]) => void;
  badgeId: string | null;
  onBadge: (id: string | null) => void;
}) {
  const [fresh, setFresh] = useState<string[]>([]);
  // 44개라 묶음 하나씩 볼 수 있게(기본 = 전체)
  const [group, setGroup] = useState<AchievementGroup | 'all'>('all');
  const ready = ISEKAI_ACHIEVEMENTS.filter((a) => achievementState(a, data) === 'ready');
  const claimedSum = ISEKAI_ACHIEVEMENTS.filter((a) => achievementState(a, data) === 'claimed').reduce((s, a) => s + rewardOf(a, data), 0);
  const total = ISEKAI_ACHIEVEMENTS.reduce((s, a) => s + rewardOf(a, data), 0);
  const badges = unlockedBadges(data);
  const claim = (id: string) => { setFresh((f) => [...f, id]); onClaim(id); };

  return (
    <div className="isk-panel">
      <div className="isk-panel-title">
        <h2 className="isk-display">업적 결재판</h2>
        <p>달성 {achievedCount(data)}/{ISEKAI_ACHIEVEMENTS.length} · 받은 코인 {claimedSum}/{total} · 업적마다 한 번 코인을 받아요</p>
      </div>
      {preview && <p className="isk-preview-bar mb-3">{preview}</p>}
      {ready.length > 1 && !preview && (
        <div className="flex justify-end mb-3">
          <button type="button" className="isk-btn" data-tone="gold" disabled={!!claiming}
            onClick={() => { setFresh((f) => [...f, ...ready.map((a) => a.id)]); onClaimAll(ready.map((a) => a.id)); }}>
            ✍️ 한꺼번에 결재 받기 ({ready.reduce((s, a) => s + rewardOf(a, data), 0)}코인)
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="업적 묶음">
        <button type="button" className="isk-filter" aria-pressed={group === 'all'} onClick={() => setGroup('all')}>전체</button>
        {ACHIEVEMENT_GROUPS.map((g) => {
          const list = ISEKAI_ACHIEVEMENTS.filter((a) => a.group === g.id);
          const done = list.filter((a) => achievementState(a, data) !== 'locked').length;
          return (
            <button key={g.id} type="button" className="isk-filter" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
              {g.label} {done}/{list.length}
            </button>
          );
        })}
      </div>

      {ACHIEVEMENT_GROUPS.filter((g) => group === 'all' || g.id === group).map((g) => (
        <section key={g.id} className="mb-5 last:mb-0">
          <div className="flex items-baseline gap-2 mb-2"><h3 className="isk-hand text-xl">{g.label}</h3><span className="text-sm text-[color:var(--isk-sub)]">{g.hint}</span></div>
          <div className="isk-ach-grid">
            {ISEKAI_ACHIEVEMENTS.filter((a) => a.group === g.id).map((a) => {
              const st = achievementState(a, data);
              const have = Math.min(a.goal, data.progress[a.id] ?? 0);
              return (
                <article key={a.id} className="isk-ach" data-state={st}>
                  {st === 'claimed' && <span className="isk-ach-seal" data-fresh={fresh.includes(a.id)}><span className="isk-stamp isk-hand">결재<br />완료</span></span>}
                  <div className="isk-ach-title pr-16">{st === 'locked' ? '🔒 ' : '🏅 '}{a.title}</div>
                  <div className="isk-ach-desc pr-12">{a.desc}</div>
                  <div className="text-xs text-[color:var(--isk-sub)]">칭호 «{a.badge}»</div>
                  <div className="isk-bar" data-tone={st === 'locked' ? 'blue' : undefined} role="progressbar" aria-valuemin={0} aria-valuemax={a.goal} aria-valuenow={have} aria-label={`${a.title} 진행`}>
                    <span style={{ width: `${(have / a.goal) * 100}%` }} />
                  </div>
                  <div className="isk-ach-foot">
                    <span className="text-sm">{fmt(have, a.unit)} / {fmt(a.goal, a.unit)}</span>
                    {st === 'ready' && !preview ? (
                      <button type="button" className="isk-btn" data-tone="gold" disabled={!!claiming} onClick={() => claim(a.id)}>
                        {claiming === a.id ? '결재 중…' : `${rewardOf(a, data)}코인 받기`}
                      </button>
                    ) : (
                      <span className="isk-ach-coin">{st === 'claimed' ? `받음 · ${rewardOf(a, data)}코인` : `🪙 ${rewardOf(a, data)}코인`}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <div className="isk-card mt-4">
        <div className="isk-hand text-lg mb-1">사원증에 달 칭호</div>
        <p className="text-sm text-[color:var(--isk-sub)] mb-2">달성한 업적의 칭호를 하나 골라 사원증에 달 수 있어요(이 기기에 기억해요).</p>
        {badges.length === 0 ? <p className="text-sm">아직 달 수 있는 칭호가 없어요. 첫 출근부터!</p> : (
          <div className="isk-badges">
            <button type="button" className="isk-badge-pick" aria-pressed={!badgeId} onClick={() => onBadge(null)}>달지 않기</button>
            {badges.map((b) => (
              <button key={b.id} type="button" className="isk-badge-pick" aria-pressed={badgeId === b.id} onClick={() => onBadge(b.id)}>🎖 {b.badge}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
