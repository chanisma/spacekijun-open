/**
 * 업무 수행 지식(work_knowledge) — 웹 «업무 지식» 칸의 단일 출처 (2026-10-24).
 *
 * 서버 RPC `get_work_knowledge` 가 계보(«지난 업무 가져오기»로 이어진 여러 해) 전체의 지식을 돌려주고,
 * 화면(`WorkKnowledgeSection`)은 그리기만 한다. 종류 이름·순서·출처 문구·입력 검사는 여기 한 곳.
 * 에이전트 도구(list/save/update_work_knowledge)와 같은 표·같은 함수를 쓴다 — 웹에서 남긴 지식을 에이전트가 읽는다.
 */

export type WorkKnowledgeKind = 'procedure' | 'tip' | 'caution' | 'reference' | 'insight';

/** 사람이 웹에서 고르는 종류(인사이트는 돌아보기에서 에이전트가 남긴다) */
export const WRITABLE_KNOWLEDGE_KINDS = ['procedure', 'tip', 'caution', 'reference'] as const satisfies readonly WorkKnowledgeKind[];

export const KNOWLEDGE_KIND_LABEL: Record<WorkKnowledgeKind, string> = {
  procedure: '절차',
  tip: '요령',
  caution: '주의',
  reference: '참고',
  insight: '인사이트',
};

export const KNOWLEDGE_KIND_HINT: Record<WorkKnowledgeKind, string> = {
  procedure: '이 업무는 이렇게 한다(순서·방법)',
  tip: '알면 빨라지는 요령',
  caution: '놓치기 쉬운 것·지난번에 문제가 된 것',
  reference: '참고할 문서·근거·연락처',
  insight: '돌아보기에서 찾은 다음에 더 나은 방법',
};

export interface WorkKnowledgeItem {
  knowledge_id: number;
  kind: WorkKnowledgeKind;
  title: string;
  body: string;
  basis?: string;
  suggestions?: Array<{ text: string; basis?: string; task_title?: string }>;
  action_type?: string;
  status?: 'archived';
  archived_reason?: string;
  /** 'this_work' 또는 'N년 전 업무' */
  from: string;
  source_work?: string;
  source_year?: number | string;
  task_now?: { task_id: string; title: string };
  task_then?: string;
  /** 작업에 붙은 지식 — 올해 이어진 같은 작업(«지난 업무 가져오기» 계보) */
  action_now?: { action_id: string; title: string; type: string };
  action_then?: string;
  by?: string;
  at: string;
  decision?: 'applied' | 'dismissed';
}

export interface WorkKnowledgeData {
  can_view: boolean;
  can_write?: boolean;
  lineage?: Array<{ work_id: string; name: string; year?: number | string; generations_ago: number }>;
  items?: WorkKnowledgeItem[];
}

export const isThisWork = (item: Pick<WorkKnowledgeItem, 'from'>) => item.from === 'this_work';

/** 출처 한 줄 — «이 업무» · «2025년 업무 · 1년 전» */
export function knowledgeOriginLabel(item: Pick<WorkKnowledgeItem, 'from' | 'source_year' | 'source_work'>): string {
  if (isThisWork(item)) return '이 업무';
  const year = item.source_year != null && item.source_year !== '' ? `${item.source_year}년 업무` : '지난 업무';
  return `${year} · ${item.from.replace(' 업무', '')}`;
}

/** 계보 요약 — «지난 2개 해의 지식도 함께 보입니다» (계보가 없으면 null) */
export function lineageSummary(lineage: WorkKnowledgeData['lineage']): string | null {
  const past = (lineage ?? []).filter((l) => l.generations_ago > 0);
  if (past.length === 0) return null;
  const years = past.map((l) => (l.year != null && l.year !== '' ? `${l.year}` : '?')).join('·');
  return `지난 ${past.length}개 해(${years})의 지식도 함께 보입니다 — «지난 업무 가져오기»로 이어진 업무`;
}

/** 서버 CHECK 와 같은 입력 검사 — 맞으면 null */
export function knowledgeInputError(input: { title: string; body: string; basis?: string }): string | null {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return '제목을 적어 주세요.';
  if (title.length > 200) return '제목은 200자까지입니다.';
  if (!body) return '내용을 적어 주세요.';
  if (body.length > 4000) return '내용은 4000자까지입니다.';
  if ((input.basis ?? '').length > 1000) return '근거는 1000자까지입니다.';
  return null;
}

/**
 * «붙일 곳» 값 — 업무 전체('') · 할 일('task:<id>') · 작업('action:<id>').
 * 작업 지식은 같은 종류라도 할 일마다 설정이 다르므로 «그 작업»에 붙는다(할 일은 서버가 작업에서 채운다).
 */
export function knowledgeTargetToColumns(target: string): { task_id: string | null; action_id: string | null } {
  if (target.startsWith('action:')) return { task_id: null, action_id: target.slice(7) || null };
  if (target.startsWith('task:')) return { task_id: target.slice(5) || null, action_id: null };
  return { task_id: null, action_id: null };
}

/** 보관 이유 검사 — 다음 담당자가 왜 빠졌는지 알 수 있게 비울 수 없다 */
export function archiveReasonError(reason: string): string | null {
  const r = reason.trim();
  if (!r) return '보관 이유를 적어 주세요 — 다음 담당자가 왜 빠졌는지 봅니다.';
  if (r.length > 500) return '보관 이유는 500자까지입니다.';
  return null;
}

/** 보이는 순서 — 서버가 «가까운 해 먼저 · 최근 먼저»로 주지만, 보관한 것은 맨 아래로 */
export function sortKnowledge(items: WorkKnowledgeItem[]): WorkKnowledgeItem[] {
  return [...items].sort((a, b) => Number(a.status === 'archived') - Number(b.status === 'archived'));
}
