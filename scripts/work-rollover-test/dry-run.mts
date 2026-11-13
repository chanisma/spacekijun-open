// 라이브 업무 전부를 "다음 해로 가져오면" 어떻게 되는지 계획만 세워 본다(쓰기 없음).
// 입력 = work+task JSON 배열 파일. 사용: npx tsx scripts/work-rollover-test/dry-run.mts <works.json>
import { readFileSync } from 'node:fs';
import { inferWorkYear, planWorkRollover } from '../../src/lib/workRollover';

const works = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const everyone = new Map<string, string>();
for (const w of works) {
  for (const m of w.meta?.managers ?? []) everyone.set(m.id, m.name ?? '');
  for (const t of w.tasks ?? []) for (const a of t.meta?.assignees ?? []) everyone.set(a.id, a.name ?? '');
}
let unknown = 0, noName = 0, weekend = 0, dates = 0, progress = 0;
for (const w of works) {
  const year = inferWorkYear(w)!;
  const plan = planWorkRollover(w, { targetYear: year + 1, keepAssignees: true, activeResources: everyone, now: new Date('2026-09-23') });
  const u = [...new Set(plan.tasks.flatMap((t) => t.unknownKeys))];
  unknown += u.length;
  if (!plan.nameReplaced) noName++;
  for (const t of plan.tasks) { dates += t.dates.length; weekend += t.dates.filter((d) => d.weekend).length; if (t.hadProgress) progress++; }
  console.log(`${plan.nameReplaced ? ' ' : '!'} ${year}→${year + 1} | ${plan.name} | 할 일 ${plan.tasks.length}${u.length ? ` | 모르는 키 ${u.join(',')}` : ''}`);
}
console.log(`\n업무 ${works.length} · 이름 연도 미교체 ${noName} · 모르는 키 ${unknown} · 날짜 ${dates}(주말 ${weekend}) · 진척 비운 할 일 ${progress}`);
