// 탐구 탐색 — `inquiry_*` 표 조회.
//
// 설계 = docs/features/creative-activities-graphrag.md §6, 방법론 = 스킬 `/inquiry-graphrag`
//
// ── 왜 뷰 하나로 통일하는가 ────────────────────────────────────────────────
// 활동 본문은 교사가 `inquiry_activity` 를, 학생이 `inquiry_activity_public` 을 읽는다.
// 그런데 **화면 코드는 한 벌이어야 한다** — 역할마다 다른 쿼리를 두면 한쪽만 고치는 실수가 난다.
// 뷰에는 화면이 쓸 것이 전부 있고 `student_code` 만 없으므로 **양쪽 다 뷰를 쓴다**.
// (교사도 같은 행을 받는다. 뷰가 `is_teacher_or_admin ∨ 학생` 을 스스로 판정한다.)
//
// ── 그래프는 'club' 이다 ───────────────────────────────────────────────────
// `inquiry_theme` 은 `(graph, id)` 가 키다. 창체 화면은 **창체 활동끼리 묶은** 주제군을 봐야 한다
// (전체 그래프는 세특이 81%라 리프가 그쪽에 지배당한다 — §8-11).
import { supabase } from '@/integrations/supabase/client';
import type { InquiryActivity, InquiryLeafTheme, InquiryTopTheme, LeafReport, TopReport } from '../types';

const GRAPH = 'club';

/** 활동 카드에 필요한 열만 — 뷰가 넓어서 다 받으면 목록이 무거워진다. */
const ACTIVITY_COLUMNS =
  'id, area, subject_name, grade, academic_year, title, concepts, n_sentences, club_name, hours, level, strength, breadth, research_question, method_types, output_types, career_fields, extension_hint, is_mine';

/** 상위 갈래 — 첫 화면. `report` 에 landscape·entry 가 있다(이 층에만 있는 값). */
export async function fetchTopThemes(): Promise<InquiryTopTheme[]> {
  const { data, error } = await supabase
    .from('inquiry_theme')
    .select('id, name, size, graded, level_dist, mean_sentences, report')
    .eq('graph', GRAPH)
    .eq('level', 'top')
    .order('size', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: (r.report as unknown as TopReport | null)?.name ?? r.name ?? r.id,
    size: r.size,
    graded: r.graded,
    levelDist: (r.level_dist ?? {}) as Record<string, number>,
    meanSentences: r.mean_sentences,
    report: (r.report ?? null) as unknown as TopReport | null,
  }));
}

/** 어느 갈래의 리프 주제군. */
export async function fetchLeafThemes(topId: string): Promise<InquiryLeafTheme[]> {
  const { data, error } = await supabase
    .from('inquiry_theme')
    .select('id, name, size, graded, level_dist, mean_sentences, report')
    .eq('graph', GRAPH)
    .eq('level', 'leaf')
    .eq('parent_id', topId)
    .order('size', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    parentId: topId,
    name: (r.report as unknown as LeafReport | null)?.name ?? r.name ?? r.id,
    size: r.size,
    graded: r.graded,
    levelDist: (r.level_dist ?? {}) as Record<string, number>,
    meanSentences: r.mean_sentences,
    report: (r.report ?? null) as unknown as LeafReport | null,
  }));
}

/**
 * 주제군의 활동. 구성원 id 를 먼저 받고 뷰에서 본문을 받는다(두 번 왕복).
 *
 * 한 번에 조인하지 않는 이유 — 구성원 표와 본문 뷰의 열람 규칙이 다르다(뷰는 `is_inquiry` 만 낸다).
 * 조인해 두면 "구성원인데 안 보이는 활동"이 조용히 사라지는데, 나눠 받으면 **몇 건이 가려졌는지** 셀 수 있다.
 */
export async function fetchThemeActivities(themeId: string, limit = 60): Promise<{ rows: InquiryActivity[]; memberCount: number }> {
  const { data: members, error: e1 } = await supabase
    .from('inquiry_theme_member')
    .select('activity_id')
    .eq('graph', GRAPH)
    .eq('theme_id', themeId);
  if (e1) throw e1;
  const ids = (members ?? []).map((m) => m.activity_id);
  if (!ids.length) return { rows: [], memberCount: 0 };

  const { data, error } = await supabase
    .from('inquiry_activity_public')
    .select(ACTIVITY_COLUMNS)
    .in('id', ids.slice(0, 1000))
    .order('level', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return { rows: (data ?? []) as InquiryActivity[], memberCount: ids.length };
}

/** 활동 한 건. */
export async function fetchActivity(id: string): Promise<InquiryActivity | null> {
  const { data, error } = await supabase
    .from('inquiry_activity_public')
    .select(ACTIVITY_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as InquiryActivity | null;
}

/**
 * 이 활동의 이웃 — **심화 경로(DEEPENED_FROM)와 비슷한 활동(SIMILAR_TO)은 다른 질문에 답한다.**
 * 앞은 "이 다음엔 뭘 했나"(같은 학생의 시간 순), 뒤는 "남들은 뭘 했나"(학생 간).
 * 그래서 한 목록으로 합치지 않는다.
 */
export async function fetchActivityNeighbors(id: string): Promise<{
  deepenedInto: InquiryActivity[];
  deepenedFrom: InquiryActivity[];
  similar: InquiryActivity[];
}> {
  const { data: edges, error } = await supabase
    .from('inquiry_edge')
    .select('source_id, target_id, type, weight')
    .or(`source_id.eq.${id},target_id.eq.${id}`)
    .in('type', ['DEEPENED_FROM', 'SIMILAR_TO'])
    .order('weight', { ascending: false })
    .limit(60);
  if (error) throw error;

  const into: string[] = [];   // 이 활동에서 **뻗어 나간** 것
  const from: string[] = [];   // 이 활동이 **딛고 선** 것
  const sim: string[] = [];
  for (const e of edges ?? []) {
    if (e.type === 'DEEPENED_FROM') {
      // 규약: source 가 target 을 심화했다 → target 이 앞선 활동이다
      if (e.target_id === id) into.push(e.source_id);
      else from.push(e.target_id);
    } else if (e.source_id === id) sim.push(e.target_id);
    else sim.push(e.source_id);
  }

  const wanted = [...new Set([...into, ...from, ...sim.slice(0, 12)])];
  if (!wanted.length) return { deepenedInto: [], deepenedFrom: [], similar: [] };
  const { data, error: e2 } = await supabase
    .from('inquiry_activity_public')
    .select(ACTIVITY_COLUMNS)
    .in('id', wanted);
  if (e2) throw e2;
  const byId = new Map(((data ?? []) as InquiryActivity[]).map((a) => [a.id, a]));
  const pick = (xs: string[]) => xs.map((x) => byId.get(x)).filter((x): x is InquiryActivity => !!x);
  return { deepenedInto: pick(into), deepenedFrom: pick(from), similar: pick(sim.slice(0, 12)) };
}

/**
 * 연도를 가로지르는 프로그램 — "이 활동은 몇 해 운영됐나".
 * 군집이 코호트별로 만들어지므로 같은 프로그램이 해마다 따로 잡히는데, 그것을 이어 둔 것이다(§5-4).
 */
export async function fetchRecurringPrograms(): Promise<
  { programId: string; years: number[]; area: string; grade: number | null; token: string | null; title: string; students: number }[]
> {
  const { data, error } = await supabase
    .from('inquiry_activity_type')
    .select('id, program_id, program_years, area, grade, shared_token, titles, students')
    .not('program_id', 'is', null)
    .order('students', { ascending: false });
  if (error) throw error;
  const byProgram = new Map<string, { years: Set<number>; students: number; area: string; grade: number | null; token: string | null; title: string }>();
  for (const r of data ?? []) {
    const cur = byProgram.get(r.program_id!) ?? {
      years: new Set<number>(), students: 0, area: r.area, grade: r.grade, token: r.shared_token, title: (r.titles ?? [])[0] ?? '',
    };
    for (const y of r.program_years ?? []) cur.years.add(y);
    cur.students += r.students;
    byProgram.set(r.program_id!, cur);
  }
  return [...byProgram].map(([programId, v]) => ({
    programId, years: [...v.years].sort(), area: v.area, grade: v.grade, token: v.token, title: v.title, students: v.students,
  })).sort((a, b) => b.students - a.students);
}

/**
 * 제목·연구질문·**키워드(개념)** 검색.
 *
 * 개념까지 보는 것이 이 화면에서 가장 실질적이다 — 활동당 평균 5.1개 · 고유 73,616종이고,
 * 실측으로 결과가 1.5~3.8배 늘어난다(미토콘드리아 15→57 · 면역 168→286).
 *
 * **RPC 를 쓰는 이유**: 개념이 `text[]` 라 PostgREST 의 `or=(...ilike...)` 로는 원소 부분일치를
 * 걸 수 없다. 그리고 그냥 `unnest + ilike` 로 풀면 34,180행 순차 스캔이라 실측 1,820ms 다
 * — 서버의 trigram 인덱스를 타야 1ms 대가 된다. `search_inquiry_activities` 는 같은 공개 뷰에서
 * 고르므로 역할 판정과 `did` 비노출이 그대로 적용된다.
 */
export async function searchInquiryActivities(q: string, limit = 40): Promise<InquiryActivity[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const { data, error } = await supabase.rpc('search_inquiry_activities', { p_q: term, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as unknown as InquiryActivity[];
}

/**
 * 주제군을 그래프로 볼 재료.
 *
 * **개념은 이 주제군 안에서 2건 이상에 붙은 것만** 가져온다 — 한 활동에만 붙은 개념은
 * 다리 노릇을 못 하면서 화면만 채운다(리프 하나에 개념이 수백 개인 경우가 흔하다).
 * 그 필터를 서버에서 못 하므로(집계가 필요하다) 받아서 센다 — 리프가 최대 200건이라 감당된다.
 */
export async function fetchThemeGraph(themeId: string, maxActivities = 60): Promise<{
  activities: InquiryActivity[];
  links: { activity_id: string; concept_key: string }[];
  conceptLabels: Map<string, string>;
  edges: { source_id: string; target_id: string; type: string }[];
}> {
  const { rows: activities } = await fetchThemeActivities(themeId, maxActivities);
  if (!activities.length) return { activities: [], links: [], conceptLabels: new Map(), edges: [] };
  const ids = activities.map((a) => a.id);

  const [linkRes, edgeRes] = await Promise.all([
    supabase.from('inquiry_activity_concept').select('activity_id, concept_key').in('activity_id', ids),
    supabase.from('inquiry_edge').select('source_id, target_id, type').in('source_id', ids).in('type', ['DEEPENED_FROM', 'SIMILAR_TO']),
  ]);
  if (linkRes.error) throw linkRes.error;
  if (edgeRes.error) throw edgeRes.error;

  const count = new Map<string, number>();
  for (const l of linkRes.data ?? []) count.set(l.concept_key, (count.get(l.concept_key) ?? 0) + 1);
  const bridges = new Set([...count].filter(([, n]) => n >= 2).map(([k]) => k));
  const links = (linkRes.data ?? []).filter((l) => bridges.has(l.concept_key));

  const conceptLabels = new Map<string, string>();
  if (bridges.size) {
    const { data: cs } = await supabase.from('inquiry_concept').select('key, label').in('key', [...bridges]);
    for (const c of cs ?? []) conceptLabels.set(c.key, c.label);
  }
  return { activities, links, conceptLabels, edges: edgeRes.data ?? [] };
}
