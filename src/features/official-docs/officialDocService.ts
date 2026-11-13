// ========================================
// 공문 판단함 — 데이터 계층 (2026-10-30, 1단계 = 읽기)
//
// 표: official_doc(원장) · official_doc_triage(1차 판정 이력) · official_doc_decision(사람 결정 이력).
// 1단계는 관리자 전용 — RLS 가 is_admin() 만 연다. 원장·판정은 서버 PC 실행기만 쓴다(엣지 official-doc-ingest).
// 설계 = docs/plans/2026-10-30-official-doc-triage.md
// ========================================
import { supabase } from '@/integrations/supabase/client';
import { createWorkFromCandidate } from '@/services/candidateWorkService';
import {
  ruleInsert, taskInsert, workInsert, type DecisionDraft,
} from '@/lib/officialDocDecision';

/** 공문 성격 2판(2026-10-30) — «업무»를 목적별로 나눴다. «업무»는 1판 이력에만 남는다 */
export type DocNature = '제출' | '추천' | '설문' | '참석' | '실시' | '지침' | '기회' | '홍보' | '무관' | '업무';

/** 1차 판정 원본(result) — 서버 PC 의 로컬 LLM 이 낸 값. 모르는 칸은 비어 있다 */
/** 협조 = 부탁하는 말투 + 결과 확인 절차 없음(게시·안내 부탁) — 할 일로 세지 않는다 */
export type DocObligation = '의무' | '해당 시' | '협조' | '선택' | '없음';

export interface TriageResult {
  nature?: DocNature;
  needs_action?: boolean;
  /** odt-2 부터 — 본문으로 가린 의무 여부와 그 근거 문장 */
  obligation?: DocObligation;
  obligation_why?: string;
  /** 발신이 공식 교육기관(교육행정기관·학교·대학)인가 — odt-3 부터, 기회/홍보를 가른 근거 */
  sender_official?: boolean;
  /** 참가·신청할 거리(연수·대회·모집…)인가 — odt-6 부터 */
  opportunity?: boolean;
  /** odt-7 — 안 내도 되는 근거 문구 · 이 학교에 걸린 필수 명시 · 설문 응답 주체 */
  waivable?: boolean;
  explicit_required?: boolean;
  survey_respondent?: '학교' | '개인' | '해당 없음';
  /** odt-9 — 후속 공문이면 원 공문(본문 «관련» 번호 = 받은 공문의 시행번호). 새 일이 없으면 판정은 지침 */
  parent?: Array<{ doc_no: string; title: string; issued_no: string }>;
  adds_new_work?: boolean;
  summary?: string;
  deadline?: string | null;
  deadlines?: Array<{ date?: string; what?: string }>;
  target?: string;
  work_candidates?: Array<{ id?: string; name: string; score?: number; why?: string }>;
  assignees?: Array<{ name: string; seat?: string; why?: string }>;
  new_work?: boolean;
  uncertain?: Array<{ kind: string; detail: string }>;
  question?: string;
  confidence?: number;
  rules?: { 행위?: string; 수준?: string; 긴급?: boolean; 주체?: string };
}

export interface OfficialDocTriage {
  id: string;
  engine: 'rules' | 'llm';
  model: string | null;
  prompt_version: string | null;
  nature: DocNature | null;
  needs_action: boolean | null;
  deadline: string | null;
  confidence: number | null;
  question: string | null;
  result: TriageResult;
  created_at: string;
}

export interface OfficialDocDecision {
  id: string;
  decision: 'ignore' | 'info' | 'link_work' | 'link_task' | 'create_work' | 'reassign';
  nature: DocNature | null;
  work_id: string | null;
  task_id: string | null;
  work_candidate_id: string | null;
  assignee_names: string[];
  reason: string | null;
  created_at: string;
}

/** 공문 머리·꼬리에서 뗀 칸(2026-10-31, NEIS_helper odt-doc.js) — 본문에는 내용만 남는다 */
export interface OfficialDocMeta {
  표어?: string;
  발신기관?: string;
  수신?: string;
  경유?: string;
  제목?: string;
  발신명의?: string;
  수신자?: string;
  결재선?: string;
  협조자?: string;
  시행?: { 번호?: string; 일자?: string };
  접수?: { 번호?: string; 일자?: string };
  우편번호?: string;
  주소?: string;
  홈페이지?: string;
  전화?: string;
  전송?: string;
  이메일?: string;
  공개구분?: string;
  붙임?: string[];
  관련?: string;
  발송안내?: string;
  /** 이전에 받은 비슷한 공문(정리한 제목 0.85 이상, 같은 학년도 먼저) — 판정에는 쓰지 않고 사람만 본다 */
  similar?: Array<{ doc_no: string; date: string; title: string; approver: string; sim: number; same_year: boolean }>;
}

export interface OfficialDoc {
  id: string;
  doc_no: string;
  registered_at: string | null;
  title: string;
  sender: string | null;
  approver_name: string | null;
  approval_type: string | null;
  process_status: string | null;
  /** 목록(list_official_docs)에는 없다 — 펼칠 때 getOfficialDocBody 로 받는다 */
  body?: string | null;
  body_status: 'none' | 'stored' | 'private' | 'failed';
  meta?: OfficialDocMeta | null;
  first_seen_at: string;
  /** 가벼운 목록(p_slim)에서 온 행 — meta 가 없고 판정 result 는 목록이 쓰는 칸만. 펼치거나 결정할 땐 getOfficialDocDetail 로 채운다 */
  slim?: boolean;
  /** 가장 최근 판정·결정(없으면 null) */
  triage: OfficialDocTriage | null;
  decision: OfficialDocDecision | null;
}

const table = (name: string) => supabase.from(name as never);

export interface OfficialDocList {
  /** 기간 안 공문(접수 등록일 최신순, 본문 없음) */
  docs: OfficialDoc[];
  /** 기간 밖의 원 공문·비슷한 공문 — 결정만 실렸다(판정·meta 없음). 화면에 행으로 그리지 않는다 */
  related: OfficialDoc[];
  /** 기간 안 전체 수 — docs 보다 크면 limit 에 잘린 것 */
  total: number;
  /** 기간 밖에 남은 판단 대기 수 */
  pendingOutside: number;
}

export const OFFICIAL_DOC_LIST_LIMIT = 1000;

/**
 * 공문 목록 — 접수 등록일 기간(한국 날짜 'YYYY-MM-DD', 양끝 포함, null = 끝 없음) (2026-11-04).
 * RPC `list_official_docs` 가 최신 판정·결정 1건씩만 싣는다 — 이력 전체를 embed 로 받지 말 것
 * (판정을 다시 돌릴 때마다 쌓여 받은 양의 ~80% 를 버렸다). 본문은 펼칠 때 `getOfficialDocBody`.
 */
/** `mine` = 결재권자가 나이고 결정 없는 것만(업무노트 «공문 제안», 2026-11-12 — 관리자도 전부를 받지 않게) */
/** `slim` = meta 빼고 판정은 목록이 쓰는 칸만(공문 판단함, 2026-11-13 — 30일 치 1.53M자 → 0.58M자). 펼칠 때 `getOfficialDocDetail` */
export async function listOfficialDocs(range: { from: string | null; to: string | null; mine?: boolean; slim?: boolean }): Promise<OfficialDocList> {
  const { data, error } = await supabase.rpc('list_official_docs' as never, {
    p_from: range.from,
    p_to: range.to,
    p_limit: OFFICIAL_DOC_LIST_LIMIT,
    ...(range.mine ? { p_mine: true } : {}),
    ...(range.slim ? { p_slim: true } : {}),
  } as never);
  if (error) throw new Error((error as { message: string }).message);
  const v = (data ?? {}) as { docs?: OfficialDoc[]; related?: OfficialDoc[]; total?: number; pending_outside?: number };
  return {
    docs: v.docs ?? [],
    related: v.related ?? [],
    total: Number(v.total ?? 0),
    pendingOutside: Number(v.pending_outside ?? 0),
  };
}

/** 본문 한 건 — 목록은 본문을 싣지 않는다 */
export async function getOfficialDocBody(id: string): Promise<string | null> {
  const { data, error } = await table('official_doc').select('body').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return ((data ?? null) as { body: string | null } | null)?.body ?? null;
}

/** 가벼운 목록 행의 빠진 칸 — 머리 정보(meta)와 최신 판정 전체 (2026-11-13) */
export async function getOfficialDocDetail(id: string): Promise<{ meta: OfficialDocMeta | null; triage: OfficialDocTriage | null }> {
  const [doc, triage] = await Promise.all([
    table('official_doc').select('meta').eq('id', id).maybeSingle(),
    table('official_doc_triage')
      .select('id, engine, model, prompt_version, nature, needs_action, deadline, confidence, question, result, created_at')
      .eq('doc_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (doc.error) throw new Error(doc.error.message);
  if (triage.error) throw new Error(triage.error.message);
  return {
    meta: ((doc.data ?? null) as { meta: OfficialDocMeta | null } | null)?.meta ?? null,
    triage: (triage.data ?? null) as OfficialDocTriage | null,
  };
}

/** 가벼운 행 + 상세 = 종전 목록과 같은 모양의 한 건 */
export function withOfficialDocDetail(doc: OfficialDoc, detail: Awaited<ReturnType<typeof getOfficialDocDetail>>): OfficialDoc {
  return { ...doc, meta: detail.meta, triage: detail.triage ?? doc.triage, slim: false };
}

/** 연결할 수 있는 업무 — 진행 중인 업무 전부(관리자 화면이라 범위를 좁히지 않는다) */
export interface WorkOption { id: string; name: string; department: string | null; year: number | null }

export async function listActiveWorks(): Promise<WorkOption[]> {
  const { data, error } = await supabase
    .from('work')
    .select('id, name, meta')
    .eq('status', 'active')
    .order('name')
    .range(0, 1999);
  if (error) throw new Error(error.message);
  return (data ?? []).map((w) => {
    const meta = (w.meta ?? {}) as { department?: string; year?: number | string };
    return { id: w.id as string, name: w.name as string, department: meta.department ?? null, year: meta.year ? Number(meta.year) : null };
  });
}

export interface SaveDecisionResult { decisionId: string; workId: string | null; taskId: string | null; ruleId: string | null }

/**
 * 결정 저장 — ①(필요하면) 할 일·업무를 만들고 ②결정 행을 남기고 ③(고르면) 규칙을 남긴다.
 * ①이 실패하면 아무것도 남기지 않는다. ②가 실패하면 ①에서 만든 할 일·업무를 지워 되돌린다
 * (업무 생성 경로 `createWorkFromCandidate` 와 같은 «만들고 실패하면 지우기» 방식 — RPC 트랜잭션은 없다).
 * ③이 실패해도 결정은 남긴다(규칙은 다시 만들 수 있다) — 호출부가 알린다.
 */
export async function saveDecision(
  doc: OfficialDoc,
  d: DecisionDraft,
  opts: {
    year: number;
    department: string | null;
    createdWorkId?: string | null;
    /** createdWorkId 업무(«참고해서 새 업무로»가 먼저 만든 업무)에 공문 할 일도 넣는다 — 업무 후보 경로는 넣지 않는다 */
    addDocTaskToCreated?: boolean;
  },
): Promise<SaveDecisionResult> {
  let workId: string | null = opts.createdWorkId ?? null;
  let taskId: string | null = null;
  let createdWork = false;

  const linkTarget = d.kind === 'link_work' ? d.workId : d.kind === 'create_work' && opts.addDocTaskToCreated ? workId : null;
  if (linkTarget) {
    const t = taskInsert(d, doc);
    const { data, error } = await supabase
      .from('task')
      .insert({ event_id: linkTarget, ...t, meta: t.meta as never })
      .select('id')
      .single();
    if (error || !data) throw new Error(`할 일을 만들지 못했습니다: ${error?.message ?? '알 수 없는 오류'}`);
    workId = linkTarget;
    taskId = data.id as string;
  } else if (d.kind === 'create_work' && !workId) {
    const r = await createWorkFromCandidate(workInsert(d, doc, opts.year, opts.department));
    workId = r.workId;
    createdWork = true;
  }

  const { data: dec, error: decError } = await table('official_doc_decision')
    .insert({
      doc_id: doc.id,
      triage_id: doc.triage?.id ?? null,
      decision: d.kind,
      nature: d.nature,
      work_id: d.kind === 'link_work' || d.kind === 'create_work' ? workId : null,
      task_id: taskId,
      work_candidate_id: d.candidateId,
      assignee_names: d.assignees.map((a) => a.name),
      reason: d.reason.trim() || null,
      via: 'web',
    } as never)
    .select('id')
    .single();
  if (decError || !dec) {
    if (taskId) await supabase.from('task').delete().eq('id', taskId);
    if (createdWork && workId) {
      await supabase.from('task').delete().eq('event_id', workId);
      await supabase.from('work').delete().eq('id', workId);
    }
    throw new Error(`결정을 남기지 못했습니다: ${decError?.message ?? '알 수 없는 오류'}`);
  }
  const decisionId = (dec as { id: string }).id;

  let ruleId: string | null = null;
  if (d.makeRule) {
    const { data: rule, error: ruleError } = await table('doc_rule')
      .insert(ruleInsert(d, decisionId, { workId, candidateId: d.candidateId }, opts.year) as never)
      .select('id')
      .single();
    if (ruleError) throw new Error(`결정은 남겼지만 규칙을 남기지 못했습니다: ${ruleError.message}`);
    ruleId = (rule as { id: string }).id;
  }
  return { decisionId, workId, taskId, ruleId };
}

/** 승인된 규칙 목록·끄기 */
export interface DocRule {
  id: string;
  kind: 'route' | 'term' | 'nature';
  condition: { sender?: string; title_all?: string[] };
  outcome: Record<string, unknown>;
  note: string | null;
  status: 'proposed' | 'active' | 'retired';
  hits: number;
  overturned: number;
  created_at: string;
}

export async function listDocRules(): Promise<DocRule[]> {
  const { data, error } = await table('doc_rule').select('*').neq('status', 'retired').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DocRule[];
}

export async function retireDocRule(id: string): Promise<void> {
  const { error } = await table('doc_rule').update({ status: 'retired' } as never).eq('id', id);
  if (error) throw new Error(error.message);
}
