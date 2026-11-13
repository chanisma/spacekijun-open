// 공문 판단함 (2026-10-30, 1단계 = 읽기) — 관리자 전용.
// 서버 PC 가 올린 새 접수 공문과 1차 판정(근거·불확실 요인·물을 질문)을 보여 준다.
// 2단계(2026-10-30): 행마다 [결정] → 결정 창(업무 연결·새 업무·다른 사람·참고·무시).
// 2026-10-31: 규칙은 쓰지 않는다(쌓일수록 비용·충돌) — 대신 펼침에 «이전에 받은 비슷한 공문»(사람만 본다).
// 설계 = docs/plans/2026-10-30-official-doc-triage.md
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ChevronDown, ChevronRight, Gavel, HelpCircle, RefreshCw, X } from 'lucide-react';
import { toast } from '@/lib/toast';
import { CandidateWorkDialog } from '@/components/tasks/CandidateWorkDialog';
import { getCurrentAcademicYear } from '@/components/tasks/WorkTimelineFilters';
import { useWorkCandidates } from '@/hooks/useWorkCandidates';
import { OFFICIAL_DOC_LINK_KEY, agreesWithTriage, docLink, type DecisionDraft } from '@/lib/officialDocDecision';
import { OfficialDocDecisionDialog } from './OfficialDocDecisionDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { todayKeyKst } from '@/lib/taskVisibility';
import {
  OFFICIAL_DOC_LIST_LIMIT, getOfficialDocBody, getOfficialDocDetail, listOfficialDocs, saveDecision, withOfficialDocDetail,
  type OfficialDoc, type WorkOption,
} from '../officialDocService';
import {
  DATE_PRESETS,
  DEFAULT_DATE_PRESET,
  DOC_SORTS,
  dateRangeOf,
  sortDocs,
  type DatePreset,
  type DateRange,
  type DocSort,
  DECISION_LABELS,
  EMPTY_FACETS,
  FACET_LABELS,
  INBOX_FILTERS,
  UNCERTAIN_LABELS,
  activeFacetCount,
  parentDocOf,
  bodyBlocks,
  daysUntil,
  facetOptions,
  matchesFacets,
  matchesFilter,
  matchesQuery,
  needsAction,
  type InboxFacets,
  type InboxFilter,
} from '@/lib/officialDocInbox';

export const OFFICIAL_DOCS_QUERY_KEY = ['official-docs'] as const;

/** 가벼운 목록 행의 상세(머리 정보 · 최신 판정 전체) — 펼친 행·결정 창만 받는다(2026-11-13) */
const detailQuery = (doc: OfficialDoc) => ({
  queryKey: [...OFFICIAL_DOCS_QUERY_KEY, 'detail', doc.id, doc.triage?.id ?? null],
  queryFn: () => getOfficialDocDetail(doc.id),
  staleTime: 10 * 60_000,
});

function useOfficialDocFull(doc: OfficialDoc, enabled: boolean) {
  const { data, isLoading, error } = useQuery({ ...detailQuery(doc), enabled: enabled && !!doc.slim });
  if (!doc.slim) return { doc, loading: false, error: null as Error | null };
  return { doc: data ? withOfficialDocDetail(doc, data) : doc, loading: isLoading, error: (error as Error | null) ?? null };
}

function DeadlineChip({ deadline }: { deadline: string | null }) {
  const days = daysUntil(deadline);
  if (days === null || !deadline) return null;
  const tone = days < 0 ? 'bg-slate-100 text-slate-600' : days <= 3 ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700';
  const label = days < 0 ? '기한 지남' : days === 0 ? '오늘까지' : `D-${days}`;
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tone}`} title={deadline}>
      {label} · {deadline.slice(5).replace('-', '/')}
    </span>
  );
}

/** 의무 여부(odt-2) — 제목 낱말이 아니라 본문의 대상·조건으로 가린 것 */
const OBLIGATION_STYLE: Record<string, string> = {
  의무: 'bg-rose-50 text-rose-700',
  '해당 시': 'bg-amber-50 text-amber-800',
  협조: 'bg-violet-50 text-violet-700',
  선택: 'bg-sky-50 text-sky-700',
  없음: 'bg-slate-100 text-slate-500',
};

function ObligationChip({ value, why }: { value?: string; why?: string }) {
  if (!value) return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${OBLIGATION_STYLE[value] ?? 'bg-slate-100 text-slate-600'}`} title={why}>
      {value}
    </span>
  );
}

const FACET_KEYS = Object.keys(FACET_LABELS) as Array<keyof InboxFacets>;
const ALL = '__all__'; // Radix Select 는 빈 값을 못 쓴다 — «전체»를 이 값으로 나타낸다

/** 드롭다운 하나 — 항목마다 «고르면 남는 건수» */
function FacetSelect({ docs, facets, name, onChange }: {
  docs: OfficialDoc[];
  facets: InboxFacets;
  name: keyof InboxFacets;
  onChange: (name: keyof InboxFacets, value: string) => void;
}) {
  const options = facetOptions(docs, facets, name);
  const value = facets[name];
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(name, v === ALL ? '' : v)}>
      <SelectTrigger
        className={`h-8 w-auto min-w-[6.5rem] gap-1 text-xs ${value ? 'border-blue-300 bg-blue-50 text-blue-800' : ''}`}
        aria-label={FACET_LABELS[name]}
      >
        <span className="text-slate-500">{FACET_LABELS[name]}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>전체</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label} <span className="ml-1 text-xs text-slate-400">{o.count}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** 본문 — `|` 로 시작하는 줄 묶음은 표로, 나머지는 줄 그대로 (수집기가 ODT 표를 | 줄로 바꿔 보낸다) */
function DocBody({ text }: { text: string }) {
  const parts = bodyBlocks(text);
  return (
    <div className="max-h-[28rem] space-y-2 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">
      {parts.map((p, i) =>
        p.table ? (
          <div key={i} className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
              <tbody>
                {p.table.map((row, r) => (
                  <tr key={r} className={r === 0 ? 'bg-slate-100 font-medium' : ''}>
                    {row.map((c, ci) => (
                      <td key={ci} className="border border-slate-200 px-2 py-1 align-top">{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p key={i} className="whitespace-pre-wrap break-words">{(p.lines ?? []).join('\n')}</p>
        ),
      )}
    </div>
  );
}

/** 본문 — 목록은 본문을 싣지 않는다(2026-11-04). 펼친 행만 한 건 받는다 */
function DocBodySection({ doc }: { doc: OfficialDoc }) {
  const stored = doc.body_status === 'stored';
  const { data: body, isLoading, error } = useQuery({
    queryKey: [...OFFICIAL_DOCS_QUERY_KEY, 'body', doc.id],
    queryFn: () => getOfficialDocBody(doc.id),
    enabled: stored,
    staleTime: 10 * 60_000,
  });
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-slate-500">본문</div>
      {stored && isLoading ? (
        <Skeleton className="h-24 w-full rounded-md" />
      ) : stored && error ? (
        <p className="text-xs text-rose-600">본문을 불러오지 못했습니다: {(error as Error).message}</p>
      ) : stored && body ? (
        <DocBody text={body} />
      ) : (
        <p className="text-xs text-slate-500">
          {doc.body_status === 'private' ? '개인정보가 들어 있을 수 있어 본문을 저장하지 않았습니다.' : '본문을 받지 못했습니다.'}
        </p>
      )}
    </div>
  );
}

/** 공문 정보 — 머리·꼬리에서 뗀 메타 중 사람이 볼 만한 것 */
function DocMeta({ meta }: { meta: NonNullable<OfficialDoc['meta']> }) {
  const rows: Array<[string, string | undefined]> = [
    ['발신', [meta.발신기관, meta.발신명의 && meta.발신명의 !== meta.발신기관 ? `(${meta.발신명의})` : ''].filter(Boolean).join(' ')],
    ['시행', meta.시행 && [meta.시행.번호, meta.시행.일자].filter(Boolean).join(' · ')],
    ['수신', meta.수신자 || (meta.수신 !== '수신자 참조' ? meta.수신 : undefined)],
    ['관련', meta.관련],
    ['문의', [meta.결재선?.split(' ').slice(0, 2).join(' '), meta.전화, meta.이메일].filter(Boolean).join(' · ')],
    ['공개', meta.공개구분],
  ];
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-slate-500">공문 정보</div>
      <dl className="grid grid-cols-[3rem_1fr] gap-x-2 gap-y-0.5 text-xs text-slate-700">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-400">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {!!meta.붙임?.length && (
        <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">
          {meta.붙임.map((a, i) => <li key={i}>붙임 {a}</li>)}
        </ul>
      )}
    </div>
  );
}

/** 이전에 받은 비슷한 공문 — 참고만(대장 검증: 같은 학년도면 담당 같음 ~80%, 지난 학년도면 ~45%) */
function SimilarDocs({ items, byNo }: { items: NonNullable<NonNullable<OfficialDoc['meta']>['similar']>; byNo: Map<string, OfficialDoc> }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-slate-500">
        이전에 받은 비슷한 공문 <span className="font-normal text-slate-400">— 참고만, 목적이 다를 수 있습니다</span>
      </div>
      <ul className="space-y-1 text-xs text-slate-700">
        {items.map((s) => {
          const past = byNo.get(s.doc_no);
          return (
            <li key={s.doc_no} className="min-w-0">
              <span className="text-slate-400">{s.date}</span> <span className="break-words">{s.title}</span>
              <span className="ml-1 text-slate-500">· 담당 {s.approver || '-'}</span>
              {!s.same_year && <span className="ml-1 rounded bg-amber-50 px-1 text-amber-700">지난 학년도 — 담당이 바뀌었을 수 있음</span>}
              {past?.decision && (
                <span className="ml-1 rounded bg-emerald-50 px-1 text-emerald-700">
                  결정: {DECISION_LABELS[past.decision.decision]}
                  {past.decision.assignee_names.length > 0 && ` · ${past.decision.assignee_names.join(', ')}`}
                  {past.decision.reason && ` — ${past.decision.reason}`}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DocRow({ doc, parent, byNo, onDecide }: {
  doc: OfficialDoc;
  parent: OfficialDoc | null;
  byNo: Map<string, OfficialDoc>;
  onDecide: (doc: OfficialDoc) => void;
}) {
  const [open, setOpen] = useState(false);
  const r = doc.triage?.result ?? {};
  const action = needsAction(doc);
  // 펼친 행만 상세를 받는다 — 접힌 행은 가벼운 목록 칸(r)으로 그린다
  const full = useOfficialDocFull(doc, open);
  const fr = full.doc.triage?.result ?? {};
  return (
    <li className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-w-0 items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
      >
        {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {doc.decision ? (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                {DECISION_LABELS[doc.decision.decision]}
              </span>
            ) : action ? (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">처리 필요</span>
            ) : (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">판단 대기</span>
            )}
            {doc.triage?.nature && <Badge variant="outline" className="text-xs font-normal">{doc.triage.nature}</Badge>}
            <ObligationChip value={r.obligation} why={fr.obligation_why} />
            <DeadlineChip deadline={doc.triage?.deadline ?? null} />
            <span className="min-w-0 truncate font-medium text-slate-900" title={doc.title}>{doc.title}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-500">
            {[doc.registered_at?.slice(0, 10), doc.sender, doc.approver_name && `담당(결재권자) ${doc.approver_name}`, doc.process_status]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {r.parent?.[0] && (
            <div className="mt-0.5 truncate text-xs text-indigo-700" title={r.parent[0].title}>
              ↳ 후속 공문 · 원 공문: {r.parent[0].title}
              {parent?.decision && <span className="text-slate-500"> ({DECISION_LABELS[parent.decision.decision]})</span>}
            </div>
          )}
          {r.summary && <p className="mt-1 line-clamp-2 text-sm text-slate-700">{r.summary}</p>}
        </div>
      </button>

      {open && (
        <div className="space-y-3 px-9 pb-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => onDecide(full.doc)}>
              <Gavel className="mr-1 h-4 w-4" /> {doc.decision ? '결정 고치기' : '결정하기'}
            </Button>
            {doc.decision && (
              <span className="text-xs text-slate-500">
                현재: {DECISION_LABELS[doc.decision.decision]}
                {doc.decision.assignee_names.length > 0 && ` · ${doc.decision.assignee_names.join(', ')}`}
                {doc.decision.reason && ` — ${doc.decision.reason}`}
              </span>
            )}
          </div>
          {full.loading && <Skeleton className="h-16 w-full rounded-md" />}
          {full.error && <p className="text-xs text-rose-600">판정·공문 정보를 불러오지 못했습니다: {full.error.message}</p>}
          {fr.obligation && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">의무 여부</div>
              <p className="text-slate-700">
                <ObligationChip value={fr.obligation} />
                {fr.obligation_why && <span className="ml-1.5">{fr.obligation_why}</span>}
              </p>
            </div>
          )}
          {full.doc.triage?.question && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-900">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{full.doc.triage.question}</span>
            </div>
          )}
          {!!fr.uncertain?.length && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">불확실한 점</div>
              <ul className="list-disc space-y-0.5 pl-5 text-slate-700">
                {fr.uncertain.map((u, i) => (
                  <li key={i}><span className="font-medium">{UNCERTAIN_LABELS[u.kind] ?? u.kind}</span> — {u.detail}</li>
                ))}
              </ul>
            </div>
          )}
          {!!fr.work_candidates?.length && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">업무 후보</div>
              <ul className="space-y-0.5 text-slate-700">
                {fr.work_candidates.map((c, i) => (
                  <li key={i}>
                    <span className="font-medium">{c.name}</span>
                    {typeof c.score === 'number' && <span className="ml-1 text-xs text-slate-400">{Math.round(c.score * 100)}%</span>}
                    {c.why && <span className="text-slate-500"> — {c.why}</span>}
                  </li>
                ))}
              </ul>
              {fr.new_work && <p className="mt-1 text-xs text-slate-500">맞는 업무가 없어 새 업무가 필요해 보입니다.</p>}
            </div>
          )}
          {!!fr.assignees?.length && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">담당 후보</div>
              <ul className="space-y-0.5 text-slate-700">
                {fr.assignees.map((a, i) => (
                  <li key={i}>
                    <span className="font-medium">{a.name}</span>
                    {a.seat && <span className="text-slate-500"> ({a.seat})</span>}
                    {a.why && <span className="text-slate-500"> — {a.why}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!fr.deadlines?.length && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">기한</div>
              <ul className="space-y-0.5 text-slate-700">
                {fr.deadlines.map((d, i) => <li key={i}>{d.date} {d.what && `— ${d.what}`}</li>)}
              </ul>
            </div>
          )}
          {!!full.doc.meta?.similar?.length && <SimilarDocs items={full.doc.meta.similar} byNo={byNo} />}
          {full.doc.meta && Object.keys(full.doc.meta).length > 0 && <DocMeta meta={full.doc.meta} />}
          <DocBodySection doc={doc} />
          <p className="text-xs text-slate-400">
            {doc.doc_no}
            {doc.triage && ` · 판정 ${doc.triage.engine === 'llm' ? doc.triage.model ?? 'LLM' : '규칙'} ${doc.triage.created_at.slice(0, 16).replace('T', ' ')}`}
            {typeof doc.triage?.confidence === 'number' && ` · 확신 ${Math.round(doc.triage.confidence * 100)}%`}
          </p>
        </div>
      )}
    </li>
  );
}

export function OfficialDocInbox() {
  const [filter, setFilter] = useState<InboxFilter>('pending');
  const [query, setQuery] = useState('');
  const [facets, setFacets] = useState<InboxFacets>(EMPTY_FACETS);
  const setFacet = (name: keyof InboxFacets, value: string) => setFacets((f) => ({ ...f, [name]: value }));
  const [preset, setPreset] = useState<DatePreset>(DEFAULT_DATE_PRESET);
  const [custom, setCustom] = useState<DateRange>({ from: null, to: null });
  const [sort, setSort] = useState<DocSort>('priority');
  const range = dateRangeOf(preset, todayKeyKst(), custom);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [...OFFICIAL_DOCS_QUERY_KEY, 'list', range.from, range.to],
    queryFn: () => listOfficialDocs({ ...range, slim: true }),
    staleTime: 60_000,
    placeholderData: keepPreviousData, // 기간을 바꾸는 동안 목록이 뼈대로 깜빡이지 않게
  });

  const queryClient = useQueryClient();
  const year = getCurrentAcademicYear();
  const { data: candidates = [] } = useWorkCandidates(year);
  const [deciding, setDeciding] = useState<OfficialDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [candidateFlow, setCandidateFlow] = useState<{ doc: OfficialDoc; draft: DecisionDraft } | null>(null);

  // 결정 창은 판정 전체(업무 후보·담당 후보·질문)를 쓴다 — 가벼운 행이면 상세를 받은 뒤 연다(펼친 행에서 열면 이미 받아 둔 것)
  const openDecision = async (doc: OfficialDoc) => {
    if (!doc.slim) { setDeciding(doc); return; }
    try {
      setDeciding(withOfficialDocDetail(doc, await queryClient.fetchQuery(detailQuery(doc))));
    } catch (e) {
      toast.error(`공문을 불러오지 못했습니다: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    }
  };
  const refreshAll = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: OFFICIAL_DOCS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: ['works-jsonb'] }),
  ]);
  const save = async (doc: OfficialDoc, draft: DecisionDraft, work: WorkOption | null, createdWorkId?: string) => {
    setSaving(true);
    try {
      const r = await saveDecision(doc, draft, { year, department: work?.department ?? null, createdWorkId });
      toast.success('결정을 남겼습니다');
      setDeciding(null);
      await refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '결정을 남기지 못했습니다.');
      await refreshAll();
    } finally {
      setSaving(false);
    }
  };
  const flowCandidate = candidateFlow ? candidates.find((c) => c.id === candidateFlow.draft.candidateId) ?? null : null;

  const docs = useMemo(() => sortDocs(data?.docs ?? [], sort), [data, sort]);
  // 원 공문·비슷한 공문은 기간 밖에 있을 수 있다 — 서버가 related 로 함께 준다(결정만)
  const known = useMemo(() => [...docs, ...(data?.related ?? [])], [docs, data]);
  const byNo = useMemo(() => new Map(known.map((d) => [d.doc_no, d])), [known]);
  const truncated = (data?.total ?? 0) > docs.length;
  const pendingOutside = data?.pendingOutside ?? 0;
  const accuracy = useMemo(() => {
    const judged = docs.map(agreesWithTriage).filter((v): v is boolean => v !== null);
    return { n: judged.length, ok: judged.filter(Boolean).length };
  }, [docs]);
  // 상태 단추의 건수는 드롭다운·검색 조건을 건 뒤의 수, 드롭다운 건수는 상태 단추 조건을 건 뒤의 수
  const faceted = useMemo(() => docs.filter((d) => matchesFacets(d, facets) && matchesQuery(d, query)), [docs, facets, query]);
  const counts = useMemo(
    () => Object.fromEntries(INBOX_FILTERS.map((f) => [f.value, faceted.filter((d) => matchesFilter(d, f.value)).length])),
    [faceted],
  );
  const inStatus = useMemo(() => docs.filter((d) => matchesFilter(d, filter) && matchesQuery(d, query)), [docs, filter, query]);
  const shown = useMemo(() => faceted.filter((d) => matchesFilter(d, filter)), [faceted, filter]);
  const activeFacets = activeFacetCount(facets);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        <AlertCircle className="h-4 w-4" /> 공문을 불러오지 못했습니다: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {INBOX_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? 'default' : 'outline'}
              className={filter === f.value ? 'bg-blue-600 hover:bg-blue-700' : ''}
              onClick={() => setFilter(f.value)}
            >
              {f.label} <span className="ml-1 text-xs opacity-80">{counts[f.value] ?? 0}</span>
            </Button>
          ))}
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목·발신·담당 검색"
          className="h-9 w-full text-base sm:w-64 sm:text-sm"
        />
        {accuracy.n > 0 && (
          <span className="ml-auto text-xs text-slate-500" title="이 기간 공문에서 사람의 결정과 AI 1순위(할 일 여부·업무 후보)가 맞은 비율">
            AI 일치 {accuracy.ok}/{accuracy.n} ({Math.round((accuracy.ok / accuracy.n) * 100)}%)
          </span>
        )}
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> 새로고침
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
          <SelectTrigger
            className={`h-8 w-auto min-w-[7.5rem] gap-1 text-xs ${preset !== DEFAULT_DATE_PRESET ? 'border-blue-300 bg-blue-50 text-blue-800' : ''}`}
            aria-label="접수 기간"
          >
            <span className="text-slate-500">접수</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {preset === 'custom' && (
          <div className="flex items-center gap-1">
            <Input
              type="date"
              aria-label="접수 시작일"
              value={custom.from ?? ''}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value || null }))}
              className="h-8 w-auto text-base sm:text-xs"
            />
            <span className="text-xs text-slate-400">~</span>
            <Input
              type="date"
              aria-label="접수 끝날"
              value={custom.to ?? ''}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value || null }))}
              className="h-8 w-auto text-base sm:text-xs"
            />
          </div>
        )}
        <Select value={sort} onValueChange={(v) => setSort(v as DocSort)}>
          <SelectTrigger
            className={`h-8 w-auto min-w-[7rem] gap-1 text-xs ${sort !== 'priority' ? 'border-blue-300 bg-blue-50 text-blue-800' : ''}`}
            aria-label="표시 순서"
          >
            <span className="text-slate-500">순서</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOC_SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden />
        {FACET_KEYS.map((name) => (
          <FacetSelect key={name} docs={inStatus} facets={facets} name={name} onChange={setFacet} />
        ))}
        {activeFacets > 0 && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setFacets(EMPTY_FACETS)}>
            <X className="mr-1 h-3.5 w-3.5" /> 조건 {activeFacets}개 지우기
          </Button>
        )}
        <span className="ml-auto text-xs text-slate-500">{shown.length}건</span>
      </div>

      {(truncated || (pendingOutside > 0 && preset !== 'all')) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {truncated && (
            <span>
              이 기간 공문 {data?.total}건 중 최근 {OFFICIAL_DOC_LIST_LIMIT}건만 보입니다 — 기간을 좁혀 주세요.
            </span>
          )}
          {pendingOutside > 0 && preset !== 'all' && (
            <span className="flex items-center gap-1">
              기간 밖에 판단 대기 공문이 {pendingOutside}건 있습니다.
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-amber-900 underline" onClick={() => setPreset('all')}>
                전체 기간 보기
              </Button>
            </span>
          )}
        </div>
      )}

      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          {preset === 'all'
            ? '아직 올라온 공문이 없습니다. 학교 서버 PC 가 매일 아침 새 접수 공문을 올립니다.'
            : '이 기간에 접수된 공문이 없습니다.'}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {shown.length === 0 ? (
            <li className="p-6 text-center text-sm text-slate-500">조건에 맞는 공문이 없습니다.</li>
          ) : (
            shown.map((doc) => <DocRow key={doc.id} doc={doc} parent={parentDocOf(doc, known)} byNo={byNo} onDecide={openDecision} />)
          )}
        </ul>
      )}

      <OfficialDocDecisionDialog
        doc={deciding}
        parentWorkId={deciding ? parentDocOf(deciding, known)?.decision?.work_id ?? null : null}
        open={!!deciding}
        onOpenChange={(v) => { if (!v) setDeciding(null); }}
        saving={saving}
        onSave={(doc, draft, work) => save(doc, draft, work)}
        onOpenCandidate={(doc, draft) => { setDeciding(null); setCandidateFlow({ doc, draft }); }}
      />
      {candidateFlow && flowCandidate && (
        <CandidateWorkDialog
          open
          onOpenChange={(v) => { if (!v) setCandidateFlow(null); }}
          candidate={flowCandidate}
          extraWorkMeta={{ [OFFICIAL_DOC_LINK_KEY]: docLink(candidateFlow.doc) }}
          onCreated={async ({ workId }) => {
            const flow = candidateFlow;
            setCandidateFlow(null);
            await save(flow.doc, { ...flow.draft, kind: 'create_work' }, null, workId);
          }}
        />
      )}
    </div>
  );
}
