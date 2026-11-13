/**
 * 업무 후보 — 「아직 시스템에 올라오지 않았지만 실제로 하고 있는 일」의 단일 출처 (2026-09-24).
 *
 * 출처는 업무 지도 artifact(교육청 지시 업무 지도)다. 학교 업무 지도가 **빈 칸 = "아직 시스템
 * 밖"**이라고 말하는데, 그 빈칸이 실제로 무엇인지는 말하지 못했다. 후보가 그 자리를 채운다.
 *
 * ⚠️ **후보는 Work 가 아니다 (사용자 결정).** "들어갈 수 있는 후보"일 뿐이라 자체 표(`work_candidate`)에
 * 살고, 사람이 고치고 지운다. 이 파일에는 상태 기계도 승격 경로도 없다 — **2026-10-05 에 생긴 «업무로
 * 만들기»는 `candidateToWork.ts`** 에 있다(초안을 채워 사람이 고친 뒤 만든다, 후보는 그대로 남는다).
 *
 * ── 2026-09-28: 업무 목록이 «재검토 반영 목록»으로 바뀌었다 (사용자 결정) ──
 * artifact 가 K-에듀파인 문서 9,236건을 기안(담당)자별로 업무 235개에 다시 배정했다.
 * 근거는 교육청 공문 3,052건(`meta.notices`)에서 **문서**(`evidence` 칼럼)로, 담당은
 * 발신 자리 대조(`seat_check`)에서 **분장표 ↔ 문서가 가리키는 사람**(`meta.owner`)으로 바뀌었다.
 * 옛 판독기(`candidateNotices`·`candidateSeatCheck`·…)는 읽을 값이 없어져 지웠다.
 */

export type WorkCandidateKind = 'area' | 'work';

export const WORK_CANDIDATE_KIND_LABEL: Record<WorkCandidateKind, string> = {
  area: '영역',
  work: '업무',
};

export interface WorkCandidate {
  id: string;
  academic_year: number;
  kind: WorkCandidateKind;
  /** artifact 식별자 — 업무 `W002`, 영역은 영역 키. 사람이 만든 후보는 null */
  code: string | null;
  name: string;
  /** 업무가 속한 영역(영역 후보는 자기 자신) */
  area_name: string | null;
  /** 연결된 분장 자리. 자리를 못 찾았거나 지워지면 null */
  seat_id: string | null;
  /** artifact 가 적어 둔 자리 이름 — 연결이 끊겨도 "누구 일이었는지"는 남는다 */
  seat_label: string | null;
  /** 부서 이름(문자열) — `event.meta.department` 와 같은 공간이라 바로 비교된다 */
  department: string | null;
  /** 에듀파인 단위과제(BRM) */
  brm: string | null;
  /** 의무·정기·사업·수시·시행·선택·준수 */
  work_type: string | null;
  /** 제출 규모 대·중·소·— */
  scale: string | null;
  /** 학교 안 처리 부담(artifact 산식) */
  load: number | null;
  /** 공문이 오간 달(3~9 등) */
  months: number[];
  /** 매월·분기·연 1회 같은 반복 힌트 */
  repeat_hint: string | null;
  /** 접수·의무·생산·행정실 지원·단계 수 */
  counts: Record<string, number>;
  /** 사업비(원) — 학교회계 세출예산 현액. 정렬·필터 대상이라 meta 가 아니라 칼럼이다 */
  budget: number | null;
  note: string | null;
  meta: Record<string, unknown>;
  /**
   * 근거 문서 — ⚠️ **목록 조회에는 없다**(업무 하나에 1,000건이 넘어 지도를 열 때마다 받으면
   * 무겁다). 서랍에서 펼칠 때 `useWorkCandidateEvidence` 가 따로 읽는다.
   */
  evidence?: unknown;
  /** 사람 × 업무 절차 검토 — ⚠️ 목록 조회에는 없다. `useWorkCandidateProcedures` 가 펼칠 때 읽는다 */
  procedures?: unknown;
  created_at: string;
  updated_at: string;
}

/** 새로 만들거나 고칠 때 화면이 다루는 값 */
export interface WorkCandidateDraft {
  kind: WorkCandidateKind;
  name: string;
  area_name: string | null;
  seat_id: string | null;
  department: string | null;
  brm: string | null;
  work_type: string | null;
  scale: string | null;
  note: string | null;
}

export const WORK_TYPE_OPTIONS = ['의무', '정기', '사업', '수시', '시행', '선택', '준수'] as const;
export const SCALE_OPTIONS = ['대', '중', '소', '—'] as const;

export const CANDIDATE_NAME_MAX = 120;
export const CANDIDATE_NOTE_MAX = 500;

/**
 * artifact 의 자리 이름 → `duty_seat.name`.
 *
 * ⚠️ **행정실만 접두어가 다르다** — artifact 는 `행정실·지출·급여` 로 부서를 이름에 붙였는데
 * DB 는 부서를 `department_id` 로 갖고 이름은 `지출·급여` 다(시드가 그렇게 줄였다).
 * 이 한 줄이 없으면 행정실 자리 **9개**의 후보가 전부 「자리 없음」으로 떨어지는데,
 * 오류가 아니라 그냥 덜 붙은 것으로 보인다.
 */
export function normalizeCandidateSeatName(label: string): string {
  return label.startsWith('행정실·') ? label.slice('행정실·'.length) : label;
}

/** 자리 이름 → id. 못 찾으면 null(라벨은 그대로 남긴다) */
export function resolveCandidateSeatId(
  label: string | null | undefined,
  seatIdByName: Map<string, string>,
): string | null {
  if (!label) return null;
  return seatIdByName.get(label) ?? seatIdByName.get(normalizeCandidateSeatName(label)) ?? null;
}

/**
 * 행 키별 후보 수.
 *
 * 지도의 행 축과 **같은 키**를 써야 한 줄에 나란히 선다 — 자리 축은 `seat_id`,
 * 부서 축은 부서 **이름**(`event.meta.department` 가 이름이라 후보도 이름으로 갖는다).
 * 나머지 축(업무·상태·할 일 유형)은 후보에 대응하는 값이 없으므로 **아무것도 세지 않는다**
 * — 0 을 채우면 "후보가 없다"로 읽히는데 사실은 "그 축으로는 셀 수 없다"이다.
 */
export function countCandidatesByRow(
  candidates: WorkCandidate[],
  rowAxis: 'seat' | 'department' | string,
): Map<string, number> | null {
  if (rowAxis !== 'seat' && rowAxis !== 'department') return null;
  const out = new Map<string, number>();
  for (const candidate of candidates) {
    // ⚠️ **자리·부서가 없는 후보를 버리지 말 것** (2026-09-25) — 종전엔 `continue` 라
    //    57건(자리 없음)·30건(부서도 없음)이 어느 행에도 없이 **화면에서 사라졌다**.
    //    「분장 자리 없음」·「부서 없음」 행으로 보내 왜 미지정인지 볼 수 있게 한다.
    const key = rowAxis === 'seat'
      ? candidate.seat_id ?? UNASSIGNED_ROW_KEY
      : candidate.department ?? UNKNOWN_ROW_KEY;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/**
 * 미지정 행의 키 — `workPivot` 의 `UNASSIGNED_SEAT`·`UNKNOWN_BUCKET` 과 **같은 문자열**이어야
 * 후보 수가 그 행에 얹힌다. 한쪽만 바꾸면 오류 없이 «후보 0» 이 된다.
 */
export const UNASSIGNED_ROW_KEY = '__no_seat__';
export const UNKNOWN_ROW_KEY = '__none__';

/** 어느 행에 걸린 후보들 — 서랍·모달이 쓴다 */
export function candidatesForRow(
  candidates: WorkCandidate[],
  rowAxis: string,
  rowKey: string,
): WorkCandidate[] {
  if (rowAxis === 'seat') {
    return rowKey === UNASSIGNED_ROW_KEY
      ? candidates.filter((c) => !c.seat_id)
      : candidates.filter((c) => c.seat_id === rowKey);
  }
  if (rowAxis === 'department') {
    return rowKey === UNKNOWN_ROW_KEY
      ? candidates.filter((c) => !c.department)
      : candidates.filter((c) => c.department === rowKey);
  }
  return [];
}

/** 영역 → 그 영역의 업무들. 영역 후보가 없으면 이름만으로 묶는다 */
export function groupCandidatesByArea(
  candidates: WorkCandidate[],
): { area: string; areaCandidate: WorkCandidate | null; works: WorkCandidate[] }[] {
  const areas = new Map<string, { areaCandidate: WorkCandidate | null; works: WorkCandidate[] }>();
  const ensure = (name: string) => {
    let entry = areas.get(name);
    if (!entry) { entry = { areaCandidate: null, works: [] }; areas.set(name, entry); }
    return entry;
  };
  for (const candidate of candidates) {
    if (candidate.kind === 'area') ensure(candidate.name).areaCandidate = candidate;
    else ensure(candidate.area_name ?? '영역 없음').works.push(candidate);
  }
  return [...areas.entries()]
    .map(([area, entry]) => ({ area, ...entry }))
    // 업무가 많은 영역부터 — 영역만 있고 업무가 없는 것은 뒤로
    .sort((a, b) => b.works.length - a.works.length || a.area.localeCompare(b.area, 'ko'));
}

// ---------- 상세 (공문 본문까지 읽은 업무 20개 · 사업비 · 실제 처리 분포) ----------

export interface CandidateDetail {
  /** 기한 여유 — n=요구 수, 중앙/최소 일수, 7일이하 건수 */
  slack: { n?: number; 중앙?: number; 최소?: number; '7일이하'?: number } | null;
  /** 제출 방법 — [[교데통, 4], [에듀파인 자료집계, 1]] */
  methods: [string, number][];
  forms: string[];
  bases: string[];
  requestCount: number;
  schoolStepCount: number;
  memo: { 요약?: string; 개선?: string[] } | null;
}

/**
 * 예산 항목 하나 — `[세부항목 전체 이름, 금액, 확인여부]`.
 *
 * 이름은 `학교급식운영>급식재료구입비` 꼴로 **사업 > 세부항목**이 `>` 로 이어져 있다.
 */
export type BudgetItem = [name: string, amount: number, confirmed: boolean];

export interface CandidateBudget {
  total: number;
  spent: number;
  items: BudgetItem[];
}

/** `학교급식운영>급식재료구입비` → `{ program: '학교급식운영', item: '급식재료구입비' }` */
export function splitBudgetName(name: string): { program: string | null; item: string } {
  const at = name.indexOf('>');
  if (at < 0) return { program: null, item: name };
  return { program: name.slice(0, at).trim(), item: name.slice(at + 1).trim() };
}

/**
 * 예산이 붙은 후보는 **정확한 항목 이름으로 갈라 보여 준다** (2026-09-25 사용자 요청).
 *
 * 업무 이름이 뭉뚱그려져 있어서다 — 「학교급식 운영·무상급식·우유급식」 하나가 실제로는
 * 급식재료구입비·급식운영비·급식기구확충비·우유급식비 **네 항목**이다. 합계만 보이면
 * 어느 돈인지 알 수 없다.
 *
 * ⚠️ **한 업무 안에 같은 항목 이름이 두 줄 이상일 수 있다**(라이브 9건 — 「교기운영>농구부운영」이
 * 네 줄). 산출내역이 달라 예산서에서 갈라진 것이라 **이름으로 합치지 않는다** — 합치면
 * 예산서와 대조가 안 된다. 금액이 그 줄을 구분하는 유일한 표시다.
 */
export function budgetItemsOf(candidate: WorkCandidate): BudgetItem[] {
  return candidateBudget(candidate)?.items ?? [];
}

/**
 * 여러 후보에 **같이 붙은** 예산 항목 — `이름|금액` 키.
 *
 * ⚠️ artifact 가 산출내역 낱말로 업무에 붙이다 보니 같은 예산이 둘 이상에 걸린다(라이브 8개 항목
 * 9.5억 — 단순 합계 29.2억의 33%가 중복이고, 급식은 교무실·행정실 두 업무에 통째로 겹친다).
 * **그래서 사업비는 절대 합산하지 않는다** — 화면은 이 집합으로 겹친 줄에 표시만 한다.
 */
export function sharedBudgetKeys(candidates: WorkCandidate[]): Set<string> {
  const owners = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    for (const [name, amount] of budgetItemsOf(candidate)) {
      const key = `${name}|${amount}`;
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key)!.add(candidate.id);
    }
  }
  const shared = new Set<string>();
  for (const [key, ids] of owners) if (ids.size > 1) shared.add(key);
  return shared;
}

export function budgetItemKey(item: BudgetItem): string {
  return `${item[0]}|${item[1]}`;
}

/*
 * ⚠️ **«사업 이름이 특정되지 않습니다» 경고를 되살리지 말 것 (2026-09-25 사용자 결정).**
 *
 * 한때 여기에 셋이 있었다 — `budgetNameIsSpecific`(이름에 가운뎃점이 있으면 경고) ·
 * `splitMergedName`(묶인 조각 세기) · `budgetProgramOwners`(같은 과목 형제 업무로 소거법).
 * 셋 다 «이 돈이 어느 사업 것인지»를 **추론시키려는** 장치였고, 사용자가 전부 걷어내라고 했다.
 *
 * 이유: 그 답은 추론할 것이 아니라 **`meta.budget_notices`(돈이 오간 공문 제목)에 이미 있다**.
 * 「AI 중점학교 **운영비 교부**」처럼 제목이 사업을 직접 가리키므로, 경고·조각 수·형제 목록은
 * 화면만 채우고 답을 주지 못했다. 예산 칸은 **금액 + 예산과목 + 그 공문 목록**이면 된다.
 *
 * (`sharedBudgetKeys` 의 「겹침」은 **남는다** — 그것은 사업 이름 추론이 아니라
 *  «합산하지 마세요»라는 다른 뜻이다.)
 */

/**
 * **예산 관련 공문 제목** — 뭉뚱그린 이름이 어느 사업의 돈인지 말해 주는 유일한 단서
 * (2026-09-25: artifact 에 정보가 있었고, 내가 공문 단계를 통째로 버리면서 함께 빠졌다).
 *
 * 예산과목으로는 못 가른다(AI 업무 넷이 같은 과목). 반면 「2026학년도 학교스포츠클럽 활동비
 * 교부」 같은 제목은 사업을 직접 가리킨다 — 「학교스포츠클럽·학교체육 사업」 1,305만이
 * 토요스포츠데이 · 학교체육활성화 공모 · 스포츠클럽 활동비 · 교육장배 대회로 갈린다.
 */
export function candidateBudgetNotices(
  candidate: WorkCandidate,
): { date: string; kind: string; title: string }[] {
  const raw = (candidate.meta as { budget_notices?: unknown } | null)?.budget_notices;
  return Array.isArray(raw) ? (raw as { date: string; kind: string; title: string }[]) : [];
}

/**
 * **이 돈이 «들어온» 공문** = 예산 관련 공문 − 우리가 보낸 것 (2026-09-25).
 *
 * `budget_notices` 는 방향을 가리지 않고 돈 낱말로 추린 것이라 「지출품의: …」(우리가 쓴 것)가
 * 섞여 있다. 예산 칸에는 «돈이 어디서 왔는가»(교부·배정)만 남긴다 — 우리가 쓴 것은 아래
 * 근거 문서 목록이 전부 보여 준다.
 *
 * ⚠️ 2026-09-28 부터 **행위 이름으로** 가른다. 종전엔 발신 공문 목록(`meta.notices`)과 대조했는데
 *    그 목록이 없어졌다 — 대조를 그대로 두면 지출품의가 «들어온 돈»으로 되살아난다(오류 없이).
 *    옛 공문 단계에서 우리가 보낸 것의 행위는 이 셋뿐이다.
 */
export const OUTGOING_NOTICE_KINDS = new Set(['내부결재', '회계', '대외 보고']);

export function candidateIncomingBudgetNotices(
  candidate: WorkCandidate,
): { date: string; kind: string; title: string }[] {
  return candidateBudgetNotices(candidate).filter((n) => !OUTGOING_NOTICE_KINDS.has(n.kind));
}

/** meta 에서 상세를 꺼낸다 — 없으면 null. 화면이 `meta` 를 직접 파지 않게 하는 단일 출처 */
export function candidateDetail(candidate: WorkCandidate): CandidateDetail | null {
  const raw = (candidate.meta as { detail?: unknown } | null)?.detail;
  return raw && typeof raw === 'object' ? (raw as CandidateDetail) : null;
}

export function candidateBudget(candidate: WorkCandidate): CandidateBudget | null {
  const raw = (candidate.meta as { budget?: unknown } | null)?.budget;
  if (raw && typeof raw === 'object') return raw as CandidateBudget;
  // 칼럼만 있고 meta 가 없는 경우(사람이 나중에 넣은 값)도 받는다
  return typeof candidate.budget === 'number' ? { total: candidate.budget, spent: 0, items: [] } : null;
}

/** 근거 문서가 오간 기간 — 첫 문서 ~ 마지막 문서 */
export function candidatePeriod(candidate: WorkCandidate): { first: string | null; last: string | null } {
  const meta = candidate.meta as { first?: unknown; last?: unknown } | null;
  return {
    first: typeof meta?.first === 'string' ? meta.first : null,
    last: typeof meta?.last === 'string' ? meta.last : null,
  };
}

/** 행정실 업무인가 — artifact 가 교무실과 따로 세는 모집단 */
export function isAdminOfficeCandidate(candidate: WorkCandidate): boolean {
  return (candidate.meta as { office?: unknown } | null)?.office === 'admin';
}

/** 이 행정실 업무가 떠받친 교무실 업무 */
export function candidateSupports(candidate: WorkCandidate): [string, number][] {
  const raw = (candidate.meta as { supports?: unknown } | null)?.supports;
  return Array.isArray(raw) ? (raw as [string, number][]) : [];
}

// ---------- 담당 · 근거 문서 (2026-09-28 — artifact 「사람별 업무」) ----------

/**
 * 근거 등급 — 문서가 이 업무를 얼마나 강하게 입증하는가. `evidence[].tier` 가 **이 배열의 위치**다.
 *
 * ⚠️ 순서를 바꾸지 말 것 — 시드의 모든 문서가 위치로 등급을 가리켜서, 순서가 어긋나면 기안이
 *    안내로 보이는 식으로 **조용히** 틀린다. 추출기(`extract.mts` 의 `EXPECTED_TIERS`)와
 *    같아야 하고 회귀가 둘을 대조한다.
 * 색 — 범주 팔레트이고 **앱의 상태 색(에메랄드=완료·블루=진행·로즈=취소·인디고=제출)을 피했다**
 * (CLAUDE.md 「의미를 가진 색을 장식으로 재사용하지 말 것」). 막대 조각이라 흰 바탕 대비 3:1 이상
 * (가장 옅은 amber-600 이 3.2:1). 교육청 외는 가장 약한 근거라 무채색이다.
 */
export const EVIDENCE_TIERS = [
  { key: '기안-보고', label: '기안·보고', dot: 'bg-teal-600' },
  { key: '기안-내부결재', label: '기안·내부결재', dot: 'bg-violet-600' },
  { key: '기안-회계', label: '기안·회계', dot: 'bg-slate-600' },
  { key: '제출+기안연결', label: '제출 요구+기안', dot: 'bg-orange-600' },
  { key: '제출', label: '제출 요구', dot: 'bg-amber-600' },
  { key: '중요긴급', label: '중요·긴급', dot: 'bg-fuchsia-600' },
  { key: '안내', label: '안내', dot: 'bg-sky-600' },
  { key: '외부', label: '교육청 외', dot: 'bg-stone-500' },
] as const;

/**
 * 사람의 근거 등급 — 입증(기안) > 집행(행정실 회계 기안) > 유력(제출·긴급) > 참고(안내만).
 * 세기의 순서라 **한 색의 명도 단계**로 그린다 — 상태 색을 빌리면 입증이 «완료»로 읽힌다.
 */
export const OWNER_GRADES = ['입증', '집행', '유력', '참고'] as const;

export function ownerGradeClass(grade: string): string {
  switch (grade) {
    case '입증': return 'bg-slate-800 text-white';
    case '집행': return 'bg-slate-600 text-white';
    case '유력': return 'bg-slate-200 text-slate-700';
    default: return 'bg-slate-100 text-slate-500';
  }
}

export interface CandidateOwner {
  /** 분장표에서 그 자리를 맡은 사람(교대했으면 순서대로) */
  seatPeople: string[];
  /** 문서 근거가 가장 강한 사람 */
  top: string;
  grade: string;
  /** 분장 자리 사람이 문서로도 가장 강하게 입증했다 */
  same: boolean;
  /** 분장 자리는 아니지만 그 사람 교과의 일이다 */
  subject: boolean;
  /** [이름, 등급, 그 사람 밑에 배정된 문서 수, 분장 자리 사람인가] — 근거가 강한 순 */
  people: [name: string, grade: string, docs: number, inSeat: boolean][];
}

export function candidateOwner(candidate: WorkCandidate): CandidateOwner | null {
  const raw = (candidate.meta as { owner?: unknown } | null)?.owner;
  return raw && typeof raw === 'object' ? (raw as CandidateOwner) : null;
}

/**
 * 분장표와 문서가 가리키는 사람이 같은가 — 네 갈래.
 *
 * ⚠️ **«다름»을 오류로 그리지 말 것.** 재검토에서 다름은 분장표 갱신·기간 한정 이관·협력으로
 *    갈렸다(artifact 판정 선택지). 화면은 사실만 적고, 로즈·경고 색을 쓰지 않는다.
 */
export type OwnerMatch = 'same' | 'subject' | 'different' | 'no-seat';

export function ownerMatchOf(candidate: WorkCandidate): OwnerMatch | null {
  const owner = candidateOwner(candidate);
  if (!owner) return null;
  if (!candidate.seat_label) return 'no-seat';
  if (owner.same) return 'same';
  if (owner.subject) return 'subject';
  return 'different';
}

export const OWNER_MATCH_LABEL: Record<OwnerMatch, string> = {
  same: '분장과 같음',
  subject: '교과 업무',
  different: '분장과 다름',
  'no-seat': '분장 자리 없음',
};

/** 근거 등급별 문서 수 — `EVIDENCE_TIERS` 순서 */
export function candidateTierCounts(candidate: WorkCandidate): number[] {
  const raw = (candidate.meta as { tier_counts?: unknown } | null)?.tier_counts;
  return Array.isArray(raw) ? (raw as number[]) : [];
}

/** 근거 문서 수 — 목록에서도 쓸 수 있게 `counts` 에서 읽는다(근거 본문은 목록에 없다) */
export function candidateDocCount(candidate: WorkCandidate): number {
  const value = candidate.counts?.docs;
  return typeof value === 'number' ? value : 0;
}

/**
 * 옛 카탈로그에서 값을 이어받은 업무 이름 — **이름이 바뀐 경우만** 돌려준다.
 * (유형·규모·사업비·상세가 어디서 왔는지 말해 준다. 같은 이름이면 말할 것이 없다.)
 */
export function candidateRenamedFrom(candidate: WorkCandidate): string | null {
  const from = (candidate.meta as { carried_from?: unknown } | null)?.carried_from;
  return typeof from === 'string' && from !== candidate.name ? from : null;
}

export interface EvidenceDoc {
  /** `MM-DD` — 학년도 안의 날짜 */
  date: string;
  /** 1 = 학교가 만든 문서(기안) · 0 = 받은 문서(담당 접수) */
  dir: 0 | 1;
  /** `EVIDENCE_TIERS` 위치 */
  tier: number;
  /** ⚠️ null = artifact 가 제목을 가렸다 — 빈칸으로 그리지 말고 «제목 가림»이라고 말할 것 */
  title: string | null;
  /**
   * 그 문서를 다룬 사람. 교대한 자리는 그 날짜의 실제 사람이다.
   * 배열인 이유 — 같은 문서가 기안자·담당자 두 사람 밑에 온 것(163건)을 한 줄로 합쳤다.
   */
  who: string[];
}

/** DB 에서 읽은 근거 칸 → 문서 목록. 모양이 어긋난 줄은 버린다(화면이 죽지 않게) */
export function parseEvidence(raw: unknown): EvidenceDoc[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((d): d is EvidenceDoc =>
    !!d && typeof d === 'object'
    && typeof (d as EvidenceDoc).date === 'string'
    && typeof (d as EvidenceDoc).tier === 'number'
    && Array.isArray((d as EvidenceDoc).who));
}

export function evidenceTierLabel(tier: number): string {
  return EVIDENCE_TIERS[tier]?.label ?? '—';
}

// ---------- 절차 검토 (2026-09-29 — 사람 × 업무) ----------

/**
 * 사람 × 업무 검토 종류 — 사용자 요청 "절차적인 업무를 우선 파악해 표시, 일회성은 간단하게".
 *
 * 절차 = 서로 다른 단계가 순서대로 이어져 하나의 결과로 간다(학기·건마다 되풀이되면 `cycle`) ·
 * 반복 = 같은 처리가 되풀이될 뿐 단계가 없다 · 일회성 = 한 번 하고 끝 · 참고 = 받은 안내뿐.
 * 판정은 문서 제목을 한 건씩 읽은 검토 결과이고(`scripts/work-procedure-review/`), 모든 단계에
 * 근거 문서가 달려 있다(검증기가 색인과 대조했다).
 */
export const PROCEDURE_KINDS = ['절차', '반복', '일회성', '참고'] as const;
export type ProcedureKind = (typeof PROCEDURE_KINDS)[number];

export interface ProcedureDoc {
  date: string;
  /** 1 = 학교가 만든 문서(기안) */
  dir: 0 | 1;
  /** null = artifact 가 제목을 가렸다 */
  title: string | null;
}

export interface ProcedureStep {
  name: string;
  /** 그 단계를 **다른 사람**이 했으면 그 이름(2단계 검토 — 다른 사람의 업무에서 찾은 단계) */
  by: string | null;
  docs: ProcedureDoc[];
}

export interface ProcedureEntry {
  person: string;
  kind: ProcedureKind;
  /** 되풀이 주기 — `1학기·2학기`·`매월`·`건마다` */
  cycle: string | null;
  summary: string;
  steps: ProcedureStep[];
  /** 다른 사람의 업무에서 찾은 연관 업무(간혹 있다) */
  related: { person: string; work: string; role: string; docs: ProcedureDoc[] }[];
  /** 2단계 재검토로 바뀐 점 */
  revised: string | null;
  /** 일회성만 — 심층 분석(2026-09-29). ⚠️ «해마다 돌아오는가»는 없다(작년 공문 데이터가 필요해 나중에) */
  once?: OnceAnalysis;
}

/**
 * 일회성 업무 심층 분석 (2026-09-29 사용자 요청) — 세 각도.
 * ⚠️ «해마다 돌아오는가»는 **싣지 않았다**(사용자 결정 «나중에 진행» — 작년 공문 데이터 없이는 제목 추정뿐).
 */
export interface OnceAnalysis {
  action: '명단·자료 제출' | '품의·구입' | '신청·응모' | '추천' | '설문·의견 회신' | '실시·참석' | '보고' | '요청·협조' | '기타';
  load: '가벼움' | '보통' | '무거움';
  owner: '본 업무' | '다른 사람 절차의 조각' | '개인 업무' | '분류 오류';
  /** 조각이면 주관자 */
  ownerPerson: string | null;
  /** 조각·분류 오류면 맞는 업무 이름 */
  ownerWork: string | null;
  ownerNote: string | null;
  promote: '올릴 만함' | '처리하고 끝';
  promoteWhy: string;
}

/** DB 에서 읽은 절차 칸 → 목록. 모양이 어긋난 줄은 버린다(화면이 죽지 않게) */
export function parseProcedures(raw: unknown): ProcedureEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is ProcedureEntry =>
      !!e && typeof e === 'object'
      && typeof (e as ProcedureEntry).person === 'string'
      && (PROCEDURE_KINDS as readonly string[]).includes((e as ProcedureEntry).kind))
    .map((e) => ({
      ...e,
      steps: Array.isArray(e.steps) ? e.steps : [],
      related: Array.isArray(e.related) ? e.related : [],
    }));
}

export interface ProcedureSummary {
  procedure: number;
  repeat: number;
  once: number;
  reference: number;
  max_steps: number;
  related: number;
  /** 일회성 중 «업무로 올릴 만함» */
  once_promote?: number;
  /** 일회성 중 «분류 오류»(다른 업무에 들어가야 맞다) */
  once_misfiled?: number;
}

/** 목록 칩용 요약 — 본문(`procedures` 칼럼)은 목록 조회에 없다 */
export function candidateProcedureSummary(candidate: WorkCandidate): ProcedureSummary | null {
  const raw = (candidate.meta as { procedure_summary?: unknown } | null)?.procedure_summary;
  return raw && typeof raw === 'object' ? (raw as ProcedureSummary) : null;
}

/**
 * 절차 칸 순서 — **절차가 먼저**(사용자 요청 "절차적인 업무를 우선"), 같은 종류면 단계 많은 순.
 * 시드가 이미 이 순서로 넣지만, 화면이 저장 순서에 기대면 사람이 고친 값에서 순서가 깨진다.
 */
export function sortProcedures(entries: ProcedureEntry[]): ProcedureEntry[] {
  const order = (k: ProcedureKind) => PROCEDURE_KINDS.indexOf(k);
  return [...entries].sort((a, b) => order(a.kind) - order(b.kind) || b.steps.length - a.steps.length);
}

/** 원(₩) → 사람이 읽는 금액. 억/만 단위로 접는다(원 단위는 표에서 못 읽는다) */
export function formatMoney(won: number): string {
  if (won >= 100_000_000) return `${(won / 100_000_000).toFixed(1)}억`;
  if (won >= 10_000) return `${Math.round(won / 10_000).toLocaleString()}만`;
  return `${won.toLocaleString()}원`;
}

/** 후보 한 줄 요약 — 유형·규모·부담·반복을 한 줄로 */
export function candidateSummary(candidate: WorkCandidate): string {
  const parts: string[] = [];
  if (candidate.work_type) parts.push(candidate.work_type);
  if (candidate.scale && candidate.scale !== '—') parts.push(`규모 ${candidate.scale}`);
  if (candidate.repeat_hint) parts.push(candidate.repeat_hint);
  if (typeof candidate.load === 'number' && candidate.load > 0) parts.push(`부담 ${Math.round(candidate.load)}`);
  return parts.join(' · ');
}

/** 저장 전 다듬기 — 빈 문자열은 null 로(표에 ''와 null 이 섞이면 필터가 갈린다) */
export function normalizeCandidateDraft(draft: WorkCandidateDraft): WorkCandidateDraft {
  const trim = (v: string | null) => {
    const value = (v ?? '').trim();
    return value ? value : null;
  };
  return {
    kind: draft.kind,
    name: (draft.name ?? '').trim().slice(0, CANDIDATE_NAME_MAX),
    area_name: trim(draft.area_name),
    seat_id: draft.seat_id || null,
    department: trim(draft.department),
    brm: trim(draft.brm),
    work_type: trim(draft.work_type),
    scale: trim(draft.scale),
    note: trim(draft.note)?.slice(0, CANDIDATE_NOTE_MAX) ?? null,
  };
}

export function validateCandidateDraft(draft: WorkCandidateDraft): string | null {
  const normalized = normalizeCandidateDraft(draft);
  if (!normalized.name) return '이름을 적어 주세요.';
  if (normalized.kind !== 'area' && normalized.kind !== 'work') return '종류가 올바르지 않습니다.';
  return null;
}
