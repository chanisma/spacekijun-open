import { useMemo, useState } from 'react';
import {
  APPROACH_LABEL, CAREER_EMOJI, KIND_LABEL, careerName, careerTally, fillName, gameDuration, heatmap, personaOf, skillWins,
  type EpisodeRow, type IsekaiRecord, type RecordStats,
} from '../model/record';
import { DwellerAvatar } from './Hero';

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const fmtDate = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(m)}월 ${Number(d)}일`; };

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="isk-empty"><b>{title}</b>{children}</div>;
}

// ── 근무 기록부 ────────────────────────────────────────────────────
export function WorkLog({ record, stats, today }: { record: IsekaiRecord; stats: RecordStats; today: string }) {
  const cols = useMemo(() => heatmap(record.days, today, 16), [record.days, today]);
  const [picked, setPicked] = useState<string | null>(null);
  const pickedDay = record.days.find((d) => d.day === picked);
  // 이번 주 출근 도장(월~일)
  const week = cols[cols.length - 1];
  const recent = [...record.days].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 6);
  const bestDay = [...record.days].sort((a, b) => b.used - a.used)[0];

  return (
    <div className="isk-panel">
      <div className="isk-panel-title"><h2 className="isk-display">근무 기록부</h2><p>오락기에 동전을 넣고 논 날이 출근 도장으로 찍혀요. 시간은 게임 속 시간이에요.</p></div>
      <div className="isk-grid-2">
        <div className="isk-card">
          <div className="isk-hand text-lg mb-2">이번 주 출근 도장</div>
          <div className="isk-stamp-row">
            {week.map((c, i) => (
              <div key={c.day} className="isk-attend isk-hand" data-on={c.level > 0}>
                {c.level > 0 ? <>출근<br />{WEEKDAYS[i]}</> : <>{WEEKDAYS[i]}<br />{c.future ? '·' : '휴무'}</>}
              </div>
            ))}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-[color:var(--isk-sub)]">첫 출근</dt><dd className="font-bold">{stats.firstDay ? fmtDate(stats.firstDay) : '—'}</dd></div>
            <div><dt className="text-[color:var(--isk-sub)]">최근 출근</dt><dd className="font-bold">{stats.lastDay ? fmtDate(stats.lastDay) : '—'}</dd></div>
            <div><dt className="text-[color:var(--isk-sub)]">넣은 동전</dt><dd className="font-bold">{stats.coins}개</dd></div>
            <div><dt className="text-[color:var(--isk-sub)]">동전에 쓴 코인</dt><dd className="font-bold">{stats.paid}코인</dd></div>
          </dl>
          {bestDay && <p className="mt-3 text-sm">🏆 가장 열심히 일한 날 — <b>{fmtDate(bestDay.day)}</b> (게임 속 {gameDuration(bestDay.used)})</p>}
        </div>
        <div className="isk-card">
          <div className="isk-hand text-lg mb-2">16주 근무 잔디</div>
          <div className="isk-heat-scroll">
            <div className="flex gap-1.5">
              <div className="grid gap-1 text-[11px] text-[color:var(--isk-sub)]" style={{ gridTemplateRows: 'repeat(7, 16px)' }}>
                {WEEKDAYS.map((w, i) => <span key={w} style={{ lineHeight: '16px' }}>{i % 2 === 0 ? w : ''}</span>)}
              </div>
              <div className="isk-heat" role="grid" aria-label="날짜별 근무 기록">
                {cols.map((col, ci) => (
                  <div key={ci} className="isk-heat-col" role="row">
                    {col.map((c) => (
                      <button
                        key={c.day} type="button" role="gridcell" className="isk-heat-cell" data-l={c.level} data-future={c.future} data-today={c.day === today}
                        title={`${fmtDate(c.day)} · ${c.level ? `게임 속 ${gameDuration(c.used)} · 동전 ${c.coins}개` : '휴무'}`}
                        aria-label={`${fmtDate(c.day)} ${c.level ? `게임 속 ${gameDuration(c.used)}` : '휴무'}`}
                        onClick={() => setPicked(c.day)} disabled={c.future}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="isk-heat-legend">
            휴무 <span className="isk-heat-cell" data-l="0" /> <span className="isk-heat-cell" data-l="1" /> <span className="isk-heat-cell" data-l="2" />
            <span className="isk-heat-cell" data-l="3" /> <span className="isk-heat-cell" data-l="4" /> 야근(?)
          </div>
          <p className="mt-2 text-sm min-h-[1.5em]">
            {picked ? (pickedDay ? <>📅 <b>{fmtDate(picked)}</b> · 게임 속 {gameDuration(pickedDay.used)} 근무 · 동전 {pickedDay.coins}개</> : <>📅 <b>{fmtDate(picked)}</b> · 이날은 쉬었어요</>) : '칸을 누르면 그날 기록이 보여요.'}
          </p>
        </div>
      </div>
      {recent.length > 0 && (
        <div className="isk-card mt-3.5">
          <div className="isk-hand text-lg mb-2">최근 근무 일지</div>
          <ul className="flex flex-col gap-2">
            {recent.map((d) => (
              <li key={d.day} className="flex items-center gap-3 text-sm">
                <span className="w-20 shrink-0 font-bold">{fmtDate(d.day)}</span>
                <div className="isk-bar flex-1" data-tone="blue"><span style={{ width: `${Math.min(100, (d.used / 2880) * 100)}%` }} /></div>
                <span className="w-24 shrink-0 text-right">{gameDuration(d.used)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── 인사기록(통계) ─────────────────────────────────────────────────
export function Personnel({ record, stats }: { record: IsekaiRecord; stats: RecordStats }) {
  const persona = personaOf(record.tally);
  const careers = careerTally(record.tally).slice(0, 6);
  const skills = skillWins(record.tally).slice(0, 6);
  const maxCareer = careers[0]?.n ?? 1;
  const maxSkill = skills[0]?.n ?? 1;
  const cards = (record.tally['card.won'] ?? 0) + (record.tally['card.lost'] ?? 0);

  return (
    <div className="isk-panel">
      <div className="isk-panel-title"><h2 className="isk-display">인사기록 카드</h2><p>게임이 기록한 선택들로 만든 나의 직장인 프로필이에요.</p></div>
      <div className="isk-grid-2">
        <div className="isk-card">
          <div className="text-xs text-[color:var(--isk-sub)]">업무 성향</div>
          <div className="isk-hand text-2xl">{persona.title}</div>
          <p className="text-sm text-[color:var(--isk-sub)] mb-4">{persona.line}</p>
          <div className="flex justify-between text-xs font-bold mb-1"><span className="text-[#3a7bd5]">안전한 선택</span><span className="text-[#d2475d]">모험 선택</span></div>
          <div className="isk-scale" role="img" aria-label={`모험 선택 비율 ${Math.round(persona.risky * 100)}%`}>
            <span className="isk-scale-pin" style={{ left: `${persona.risky * 100}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div><div className="isk-display text-2xl font-extrabold">{cards}</div><div className="text-xs text-[color:var(--isk-sub)]">직업 카드</div></div>
            <div><div className="isk-display text-2xl font-extrabold">{persona.winRate === null ? '—' : `${Math.round(persona.winRate * 100)}%`}</div><div className="text-xs text-[color:var(--isk-sub)]">성공률</div></div>
            <div><div className="isk-display text-2xl font-extrabold">{record.tally['card.won'] ?? 0}</div><div className="text-xs text-[color:var(--isk-sub)]">성공</div></div>
          </div>
        </div>
        <div className="isk-card">
          <div className="isk-hand text-lg mb-2">경력 사항</div>
          {careers.length === 0 ? <Empty title="아직 경력이 없어요">게임에서 직업 카드를 고르면 여기에 쌓여요.</Empty> : (
            <ul className="flex flex-col gap-2.5">
              {careers.map((c) => (
                <li key={c.id} className="text-sm">
                  <div className="flex justify-between mb-1"><span>{CAREER_EMOJI[c.id] ?? '💼'} <b>{c.name}</b></span><span className="text-[color:var(--isk-sub)]">{c.n}번</span></div>
                  <div className="isk-bar"><span style={{ width: `${(c.n / maxCareer) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="isk-card">
          <div className="isk-hand text-lg mb-2">특기(이긴 기술)</div>
          {skills.length === 0 ? <Empty title="아직 특기가 없어요">직업 카드에서 이기면 그 기술이 특기로 올라와요.</Empty> : (
            <ul className="flex flex-col gap-2.5">
              {skills.map((s) => (
                <li key={s.id} className="text-sm">
                  <div className="flex justify-between mb-1"><b>{s.name}</b><span className="text-[color:var(--isk-sub)]">{s.n}승</span></div>
                  <div className="isk-bar" data-tone="gold"><span style={{ width: `${(s.n / maxSkill) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="isk-card">
          <div className="isk-hand text-lg mb-2">내 세이브 파일</div>
          {record.saves.length === 0 ? <Empty title="저장한 게임이 없어요">게임에서 저장하면 가족과 자산이 여기 보여요.</Empty> : (
            <ul className="flex flex-col gap-3">
              {record.saves.map((s) => (
                <li key={s.slot} className="flex items-center gap-3 min-w-0">
                  <div className="flex -space-x-4 shrink-0">
                    {(s.people.length ? s.people : [undefined]).slice(0, 3).map((p, i) => (
                      <div key={i} className="rounded-full bg-[#eef2ff] border-2 border-white overflow-hidden"><DwellerAvatar person={p} size={44} /></div>
                    ))}
                  </div>
                  <div className="min-w-0 text-sm">
                    <div className="font-bold truncate" title={s.people.map((p) => p.name).join(', ')}>슬롯 {s.slot} · {s.people.map((p) => p.name).join('·') || '주인공'}</div>
                    <div className="text-[color:var(--isk-sub)]">게임 {s.day ?? '?'}일차 · {s.money === null ? '?' : s.money.toLocaleString()}원</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <div><dt className="text-xs text-[color:var(--isk-sub)]">최장 생활</dt><dd className="font-extrabold">{stats.bestDay}일</dd></div>
            <div><dt className="text-xs text-[color:var(--isk-sub)]">받은 질문</dt><dd className="font-extrabold">{record.asked}개</dd></div>
            <div><dt className="text-xs text-[color:var(--isk-sub)]">답한 질문</dt><dd className="font-extrabold">{stats.answered}개</dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
}

// ── 사내 드라마 ────────────────────────────────────────────────────
const POSTER_TONES = [
  'linear-gradient(160deg, #2a3c80, #6a4fb3)', 'linear-gradient(160deg, #b23a48, #f08a5d)', 'linear-gradient(160deg, #1e6f5c, #29bb89)',
  'linear-gradient(160deg, #3d2c8d, #916bbf)', 'linear-gradient(160deg, #a0522d, #e0a458)', 'linear-gradient(160deg, #0f4c75, #3282b8)',
];
const toneOf = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return POSTER_TONES[h % POSTER_TONES.length]; };
const STATUS: Record<string, string> = { done: '완결', active: '방영 중', dropped: '조기 종영' };

export function Drama({ record }: { record: IsekaiRecord }) {
  const [open, setOpen] = useState<EpisodeRow | null>(null);
  const done = record.episodes.filter((e) => e.status === 'done').length;
  return (
    <div className="isk-panel">
      <div className="isk-panel-title"><h2 className="isk-display">사내 드라마 앨범</h2><p>회사에서 벌어진 이야기들. 완결 {done}편 · 모두 {record.episodes.length}편</p></div>
      {record.episodes.length === 0 ? <Empty title="아직 방영한 드라마가 없어요">게임에서 직장 이야기가 시작되면 포스터가 여기 걸려요.</Empty> : (
        <div className="isk-posters">
          {record.episodes.map((e) => (
            <button key={e.id} type="button" className="isk-poster" style={{ background: toneOf(e.id) }} onClick={() => setOpen(open?.id === e.id ? null : e)} aria-expanded={open?.id === e.id}>
              {e.genre && <span className="isk-poster-genre">{e.genre}</span>}
              {e.status === 'done' && <span className="isk-poster-seal"><span className="isk-stamp isk-hand">완결</span></span>}
              <div className="isk-poster-title isk-display">{fillName(e.title)}</div>
              <div className="isk-poster-log">{fillName(e.logline)}</div>
              <div className="isk-poster-foot">
                <span>{e.career ? `${CAREER_EMOJI[e.career] ?? '💼'} ${careerName(e.career)}` : ''}</span>
                <span>{STATUS[e.status] ?? e.status} · {e.answered}/{Math.max(e.scenes, e.answered)}장면</span>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="isk-card mt-3.5" role="region" aria-label={`${open.title} 줄거리`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="isk-display text-xl font-extrabold">{fillName(open.title)}</div>
              <div className="text-sm text-[color:var(--isk-sub)]">출연 · {open.cast.length ? open.cast.join(', ') : '—'}</div>
            </div>
            <button type="button" className="isk-btn-ghost shrink-0" onClick={() => setOpen(null)}>닫기</button>
          </div>
          <p className="mt-2 text-sm">{fillName(open.logline)}</p>
          {open.picks.length > 0 ? (
            <ol className="mt-3 flex flex-col gap-1.5 text-sm list-decimal pl-5">
              {open.picks.map((p, i) => <li key={i}>내 선택 — <b>{fillName(p)}</b></li>)}
            </ol>
          ) : <p className="mt-3 text-sm text-[color:var(--isk-sub)]">아직 고른 장면이 없어요.</p>}
        </div>
      )}
    </div>
  );
}

// ── 면담 노트(내가 한 답) ──────────────────────────────────────────
export function Notes({ record }: { record: IsekaiRecord }) {
  const [kind, setKind] = useState<'all' | 'career' | 'life' | 'explore'>('all');
  const [limit, setLimit] = useState(20);
  const rows = record.answers.filter((a) => kind === 'all' || a.kind === kind);
  return (
    <div className="isk-panel">
      <div className="isk-panel-title"><h2 className="isk-display">면담 노트</h2><p>게임 속 질문에 내가 남긴 답이에요. 나만 볼 수 있어요.</p></div>
      <div className="flex flex-wrap gap-2 mb-3">
        {(['all', 'career', 'life', 'explore'] as const).map((k) => (
          <button key={k} type="button" className="isk-filter" aria-pressed={kind === k} onClick={() => { setKind(k); setLimit(20); }}>
            {k === 'all' ? `전체 ${record.answers.length}` : `${KIND_LABEL[k]} ${record.answers.filter((a) => a.kind === k).length}`}
          </button>
        ))}
      </div>
      {rows.length === 0 ? <Empty title="아직 남긴 답이 없어요">게임에서 질문 카드가 오면 답해 보세요. 여기 차곡차곡 모여요.</Empty> : (
        <div className="isk-notes">
          {rows.slice(0, limit).map((a) => (
            <article key={a.id} className="isk-note" data-kind={a.kind}>
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span className="isk-chip">{KIND_LABEL[a.kind] ?? a.kind}</span>
                {a.career && <span className="isk-chip">{CAREER_EMOJI[a.career] ?? '💼'} {careerName(a.career)}{a.level ? ` Lv.${a.level}` : ''}</span>}
                {a.approach && APPROACH_LABEL[a.approach] && <span className="isk-chip">{APPROACH_LABEL[a.approach]}</span>}
                <span className="text-xs text-[color:var(--isk-sub)] ml-auto">{a.at ? new Date(a.at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }) : ''}</span>
              </div>
              <div className="isk-note-ask">Q. {fillName(a.ask)}</div>
              <div className="isk-note-ans">A. {a.text ? fillName(a.text) : a.picked ? fillName(a.picked) : '(답을 고르지 않았어요)'}</div>
            </article>
          ))}
          {rows.length > limit && <button type="button" className="isk-btn-ghost self-center" onClick={() => setLimit((l) => l + 20)}>더 보기 ({rows.length - limit})</button>}
        </div>
      )}
    </div>
  );
}
