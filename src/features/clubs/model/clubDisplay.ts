// 동아리 표시 규칙 — 순수 함수(회귀 scripts/club-core-test 가 부른다)
import { getCategoryTone, type CategoryTone } from '@/features/creative-activities/utils/categories';
import type { ClubMember, ClubSummary } from '../types';

/** 분야 = category 칸, 없으면 이름의 괄호 안(«두잇(코딩)» → 코딩). 학교 명단은 category 를 비워 두고 이름에 적는다 */
export function clubField(c: Pick<ClubSummary, 'category' | 'name'>): string | null {
  if (c.category) return c.category;
  const m = c.name.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : null;
}

/** 괄호 앞 이름(«두잇(코딩)» → 두잇) */
export function clubShortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '') || name;
}

/** 색은 club_id 로 — 이름이 바뀌어도(반크 → 링크) 같은 동아리는 같은 색 */
export function clubTone(c: Pick<ClubSummary, 'club_id'>): CategoryTone {
  return getCategoryTone(`club:${c.club_id}`);
}

/** «해야 할 것» — 관리할 수 있는 사람에게만 의미가 있다 */
export interface ClubTodo {
  key: 'pending' | 'leader_unresolved' | 'no_leader' | 'no_advisor' | 'no_member';
  label: string;
  tone: 'amber' | 'slate' | 'rose';
}

export function clubTodos(c: ClubSummary, canManage: boolean): ClubTodo[] {
  if (!canManage || c.status !== 'active') return [];
  const out: ClubTodo[] = [];
  if ((c.pending_count ?? 0) > 0) out.push({ key: 'pending', label: `명단 확정 대기 ${c.pending_count}명`, tone: 'amber' });
  if (c.leader_unresolved) {
    out.push({ key: 'leader_unresolved', label: `기장 확인 필요 — 받은 목록의 ${c.leader_unresolved.name ?? ''} 학생이 명단에 없음`, tone: 'amber' });
  } else if (!c.leader && c.member_count > 0 && !c.former_name) {
    out.push({ key: 'no_leader', label: '기장 미정', tone: 'slate' });
  }
  if (c.advisors.length === 0) out.push({ key: 'no_advisor', label: '지도교사 없음', tone: 'rose' });
  if (c.member_count === 0) out.push({ key: 'no_member', label: '부원 명단 없음', tone: 'slate' });
  return out;
}

export function sortMembers(ms: ClubMember[]): ClubMember[] {
  return [...ms].sort((a, b) =>
    (a.role === 'leader' ? 0 : 1) - (b.role === 'leader' ? 0 : 1)
    || (a.grade ?? 9) - (b.grade ?? 9) || (a.class ?? 99) - (b.class ?? 99) || (a.number ?? 99) - (b.number ?? 99));
}

/** «2-5-17» · «20517» · 줄바꿈/쉼표 목록을 학번 문자열 배열로 (학생 제안 입력) */
export function parseStudentNumbers(raw: string): { ok: string[]; bad: string[] } {
  const ok: string[] = [];
  const bad: string[] = [];
  for (const tok of raw.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean)) {
    if (/^\d-\d{1,2}-\d{1,2}$/.test(tok)) ok.push(tok);
    else if (/^\d{5}$/.test(tok)) ok.push(`${tok[0]}-${Number(tok.slice(1, 3))}-${Number(tok.slice(3, 5))}`);
    else bad.push(tok);
  }
  return { ok: [...new Set(ok)], bad };
}
