// 일정 AI 도우미 라이브 검증 — 실제 모델(solar-pro4, 추론 'none')이 날짜표를 보고
// 상대 날짜를 맞게 고르는지 잰다. 프롬프트·파서는 앱과 같은 것을 import 한다.
//
// 실행: npx tsx scripts/schedule-draft-test/live.mts   (키 = .env.local 의 SOLAR_API_KEY)
import { existsSync, readFileSync } from 'node:fs';
import {
  SCHEDULE_DRAFT_SYSTEM_PROMPT,
  buildScheduleDraftUserPrompt,
  parseScheduleDraft,
  type ScheduleDraft,
} from '../../src/lib/scheduleDraft';

function envValue(name: string): string | null {
  if (process.env[name]) return process.env[name]!;
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(new RegExp(`^${name}\\s*=\\s*(.+)$`, 'm'));
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
  }
  return null;
}
const KEY = envValue('SOLAR_API_KEY') ?? envValue('UPSTAGE_API_KEY');
if (!KEY) {
  console.log('SOLAR_API_KEY 가 없습니다 — 건너뜁니다.');
  process.exit(0);
}

const TODAY = new Date(2026, 8, 30); // 수요일
const EFFORT = process.env.EFFORT ?? 'none';

const CASES: { source: string; expect: Partial<ScheduleDraft> }[] = [
  {
    source: '다음 주 수요일 오후 2시부터 4시까지 전북교육청에서 AI 교육 담당자 협의회. 김민수 선생님 출장.',
    expect: { date: '2026-10-07', startTime: '14:00', endTime: '16:00', kind: 'event' },
  },
  {
    source: '이번 주 금요일 7교시 후 교직원 회의실에서 학업성적관리위원회 회의 있습니다.',
    expect: { date: '2026-10-02', kind: 'duty' },
  },
  {
    source: '10월 20일(화) 15:30 도서관 교직원 연수 - 생성형 AI 활용 수업. 개인 노트북 지참',
    expect: { date: '2026-10-20', startTime: '15:30', kind: 'training' },
  },
  {
    source: '2학기 중간고사 10/13~10/16',
    expect: { date: '2026-10-13', kind: 'schedule', allDay: true },
  },
  {
    source: '내일 오후 병원 때문에 3시에 조퇴합니다',
    expect: { date: '2026-10-01', startTime: '15:00', kind: 'personal' },
  },
];

let fails = 0;
for (const c of CASES) {
  const t0 = Date.now();
  const res = await fetch('https://api.upstage.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: 'solar-pro4',
      temperature: 0.1,
      reasoning_effort: EFFORT,
      messages: [
        { role: 'system', content: SCHEDULE_DRAFT_SYSTEM_PROMPT },
        { role: 'user', content: buildScheduleDraftUserPrompt(c.source, TODAY) },
      ],
    }),
  });
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  if (!res.ok) {
    console.log(`✗ HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    fails += 1;
    continue;
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? '';
  try {
    const draft = parseScheduleDraft(raw);
    const wrong = Object.entries(c.expect).filter(([k, v]) => draft[k as keyof ScheduleDraft] !== v);
    if (wrong.length) fails += 1;
    console.log(
      `${wrong.length ? '✗' : '✓'} ${seconds}s  ${c.source.slice(0, 30)}…\n    → ${draft.kind} ${draft.date} ${draft.allDay ? '종일' : `${draft.startTime}~${draft.endTime}`} "${draft.title}" people=${JSON.stringify(draft.people)}` +
        (wrong.length ? `\n    기대와 다름: ${wrong.map(([k, v]) => `${k}=${v}`).join(', ')}` : '') +
        (draft.checks.length ? `\n    checks: ${draft.checks.join(' / ')}` : '')
    );
  } catch (error) {
    fails += 1;
    console.log(`✗ ${seconds}s 파싱 실패: ${(error as Error).message}\n    ${raw.slice(0, 300)}`);
  }
}
console.log(fails ? `\n✗ ${fails}/${CASES.length} 어긋남` : `\n✓ ${CASES.length}건 모두 기대대로`);
