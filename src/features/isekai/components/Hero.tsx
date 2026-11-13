import { useState } from 'react';
import { ISEKAI_ACHIEVEMENTS, RANKS, rankOf } from '../model/achievements';
import { careerName, careerTally, dailyMemo, gameDuration, personaOf, type IsekaiRecord, type RecordStats, type SavePerson } from '../model/record';

/** 세이브의 사람 색으로 그린 작은 증명사진 */
export function DwellerAvatar({ person, size = 86 }: { person?: SavePerson; size?: number }) {
  const skin = person?.skin ?? '#f8d9c0', hair = person?.hair ?? '#3b2a20', shirt = person?.shirt ?? '#2a3c80';
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden="true">
      <path d="M14 80 C16 60 28 54 40 54 C52 54 64 60 66 80 Z" fill={shirt} />
      <path d="M33 54 L40 64 L47 54 Z" fill="#fff" opacity="0.85" />
      <rect x="35" y="44" width="10" height="12" rx="4" fill={skin} />
      <ellipse cx="40" cy="32" rx="17" ry="19" fill={skin} />
      <path d="M22 32 C20 14 32 9 40 9 C50 9 61 14 58 32 C55 22 47 19 40 19 C33 19 25 22 22 32 Z" fill={hair} />
      <circle cx="33" cy="34" r="2.2" fill="#1c2850" />
      <circle cx="47" cy="34" r="2.2" fill="#1c2850" />
      <path d="M35 42 Q40 46 45 42" stroke="#c0605a" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="29" cy="40" r="3" fill="#ff8a80" opacity="0.35" />
      <circle cx="51" cy="40" r="3" fill="#ff8a80" opacity="0.35" />
    </svg>
  );
}

export function Plumbob({ mood }: { mood: 'happy' | 'idle' }) {
  return (
    <svg className="isk-plumbob" data-mood={mood} viewBox="0 0 20 34" aria-hidden="true">
      <defs>
        <linearGradient id={`isk-pb-${mood}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={mood === 'happy' ? '#b9ffcf' : '#fff1a8'} />
          <stop offset="1" stopColor={mood === 'happy' ? '#1fae5a' : '#e0a800'} />
        </linearGradient>
      </defs>
      <path d="M10 0 L20 13 L10 34 L0 13 Z" fill={`url(#isk-pb-${mood})`} stroke="#0b5a2c" strokeOpacity="0.35" />
      <path d="M10 0 L10 34 M0 13 L20 13" stroke="#fff" strokeOpacity="0.45" strokeWidth="0.8" />
    </svg>
  );
}

/** 인사평가 등급 — 출근·답·드라마·업적을 고루 본다(재미용, 어디에도 저장하지 않는다) */
export function gradeOf(s: RecordStats, achieved: number): { grade: string; note: string } {
  const score = Math.min(s.playDays, 30) / 30 * 30 + Math.min(s.answered, 30) / 30 * 25 + Math.min(s.episodesDone, 5) / 5 * 20 + achieved / ISEKAI_ACHIEVEMENTS.length * 25;
  if (score >= 80) return { grade: 'S', note: '전설의 사원. 이세계 본사가 스카우트를 고민 중이에요.' };
  if (score >= 55) return { grade: 'A', note: '믿고 맡기는 에이스. 다음 분기 승진 1순위!' };
  if (score >= 30) return { grade: 'B', note: '성실함이 빛나요. 조금만 더 하면 A!' };
  if (score >= 10) return { grade: 'C', note: '이제 막 회사에 적응하는 중. 첫 월급날이 기다려져요.' };
  return { grade: '?', note: '아직 평가할 기록이 부족해요. 첫 출근부터!' };
}

export function Hero({
  name, code, record, stats, achieved, badge, playedToday, streakNow, memoSeed, today,
}: {
  name: string; code: string; record: IsekaiRecord; stats: RecordStats; achieved: number; badge: string | null;
  playedToday: boolean; streakNow: number; memoSeed: string; today: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const rank = rankOf(achieved);
  const mainSave = [...record.saves].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0];
  const topCareer = careerTally(record.tally)[0];
  const persona = personaOf(record.tally);
  const grade = gradeOf(stats, achieved);
  const dept = topCareer ? `${topCareer.name}부` : '인재개발원(배치 대기)';
  const joined = stats.firstDay ? stats.firstDay.replace(/-/g, '.') : '아직';

  return (
    <section className="isk-hero" aria-label="내 사원증">
      <div className="isk-skyline" />
      <div className="isk-idwrap">
        <button type="button" className="isk-id" data-flipped={flipped} onClick={() => setFlipped((f) => !f)} aria-label={flipped ? '사원증 앞면 보기' : '사원증 뒷면(인사평가) 보기'}>
          <div className="isk-id-face">
            <div className="isk-id-strap" />
            <div className="isk-id-body">
              <div className="isk-id-company">주식회사 이세계 · ISEKAI CORP.</div>
              <div className="isk-id-row">
                <div className="isk-photo">
                  <Plumbob mood={playedToday ? 'happy' : 'idle'} />
                  <DwellerAvatar person={mainSave?.people[0]} />
                </div>
                <div className="min-w-0 flex flex-col gap-1.5">
                  <span className="isk-rank-chip">{rank.name}</span>
                  <div className="isk-name isk-display truncate" title={name}>{name}</div>
                  {badge ? <span className="isk-badge-ribbon">🎖 {badge}</span> : <span className="text-xs text-[color:var(--isk-sub)]">업적을 달성하면 칭호를 달 수 있어요</span>}
                </div>
              </div>
              <dl className="isk-id-fields">
                <dt>소속</dt><dd title={dept}>{dept}</dd>
                <dt>사번</dt><dd>ISK-{code || '0000'}</dd>
                <dt>입사</dt><dd>{joined}</dd>
                <dt>세이브</dt><dd>{mainSave ? `${mainSave.people.map((p) => p.name).join('·') || '주인공'} 가족 · 게임 ${mainSave.day ?? '?'}일차` : '아직 없음'}</dd>
              </dl>
              <div className="isk-barcode" />
              <div className="isk-flip-hint">카드를 눌러 뒷면(인사평가)을 보세요</div>
            </div>
          </div>
          <div className="isk-id-face isk-id-back">
            <div className="isk-id-strap" />
            <div className="isk-id-body">
              <div className="isk-id-company">인사평가표 · 대외비</div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-[color:var(--isk-sub)]">종합 등급</div>
                  <div className="isk-grade isk-display">{grade.grade}</div>
                </div>
                <span className="isk-stamp isk-hand">{rank.name}<br />승인</span>
              </div>
              <p className="text-sm leading-relaxed">{grade.note}</p>
              <div className="isk-card" style={{ padding: 10 }}>
                <div className="text-xs text-[color:var(--isk-sub)]">업무 성향</div>
                <div className="isk-hand text-lg">{persona.title}</div>
                <div className="text-xs text-[color:var(--isk-sub)]">{persona.line}</div>
              </div>
              <div className="isk-flip-hint" style={{ marginTop: 'auto' }}>다시 눌러 앞면으로</div>
            </div>
          </div>
        </button>
      </div>

      <div className="isk-hero-side">
        <div className="isk-messenger">
          <span aria-hidden="true" style={{ fontSize: 22 }}>💬</span>
          <div><b>이세계 팀장</b> · 사내 메신저<br />{dailyMemo(memoSeed, today)}</div>
        </div>
        <div className="isk-kpis">
          <Kpi label="출근한 날" value={stats.playDays} unit="일" />
          <Kpi label="연속 출근" value={streakNow} unit="일" sub={`최고 ${record.bestStreak}일`} />
          <Kpi label="게임 속 근무" value={gameDuration(stats.gameMinutes)} />
          <Kpi label="최고 자산" value={stats.bestMoney.toLocaleString()} unit="원" />
        </div>
        <div className="isk-ladder">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div className="isk-hand text-lg">승진 사다리</div>
            <div className="text-sm text-[color:var(--isk-sub)]">
              {rank.next ? <>업적 <b className="text-[color:var(--isk-ink)]">{rank.next.need}개</b> 더 달성하면 <b className="text-[color:var(--isk-ink)]">{rank.next.name}</b>!</> : '최고 직급 달성 — 이세계의 사장님!'}
            </div>
          </div>
          <div className="isk-ladder-steps">
            {RANKS.map((r, i) => (
              <div key={r.name} className="isk-step" data-on={i <= rank.index} data-here={i === rank.index}>
                <div className="isk-step-bar" />{r.name}
              </div>
            ))}
          </div>
        </div>
        {topCareer && (
          <div className="self-start rounded-full bg-[#fffdf6e6] px-3 py-1 text-sm text-[color:var(--isk-ink)]">
            가장 많이 한 일 · <b>{careerName(topCareer.id)}</b> ({topCareer.n}번)
          </div>
        )}
      </div>
    </section>
  );
}

function Kpi({ label, value, unit, sub }: { label: string; value: string | number; unit?: string; sub?: string }) {
  return (
    <div className="isk-kpi">
      <div className="isk-kpi-label">{label}</div>
      <div className="isk-kpi-value isk-display">{value}{unit && <small>{unit}</small>}</div>
      {sub && <div className="text-xs text-[color:var(--isk-sub)]">{sub}</div>}
    </div>
  );
}
