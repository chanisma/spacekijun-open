/**
 * 에이전트(MCP) «업무 진행하기» 의 지식·판정 — 단일 출처 (2026-10-24).
 *
 * 엣지 함수 mcp 는 src 를 직접 못 읽으므로 이 파일을 묶어 쓴다(`scripts/mcp-docgen/build-bundle.mts` → `_shared/mcpWorkOps.bundle.js`).
 * 여기 있는 것:
 *   ① 기능 지식(get_work_guide) — 업무 > 할 일 > 작업, 완료 방식, 작업 종류마다 «무엇·언제·누구에게 알림·완료와의 관계·에이전트가 할 수 있는 것»
 *   ② 자동화 수준(actionAutomation) — auto(에이전트가 바로) · confirm(미리보기 → 사용자 확인 → 실행) · person(사람이 웹·나이스에서)
 *   ③ 진행 상황 정리(enrichProgress) — DB 가 준 사실에 작업마다 수준·다음 할 일을 붙인다
 *   ④ 결과 정리(shapeActionResults) — 요청 보드를 «칸 이름 = 값» 표로, 숫자 칸은 합·평균
 *   ⑤ 돌아보기 지표(reviewMetrics) — 기록에서 코드로 계산한다(해석은 에이전트가). 사람 단위로 세지 않는다(사용자 결정)
 *
 * ⚠️ 이 파일을 고치면 묶음을 다시 만들고 `mcp` 를 배포할 것. 작업 종류가 생기면 ACTION_GUIDES 에 적을 것 —
 *    회귀(work-ops.mts)가 웹 레지스트리의 모든 종류가 여기서 풀리는지 본다.
 */

export type AutomationLevel = 'auto' | 'confirm' | 'person';

export interface ActionGuide {
  /** 사람이 읽는 종류 이름 */
  label: string;
  level: AutomationLevel;
  /** 무엇을 하는 작업인가 */
  what: string;
  /** 에이전트가 이 작업에 쓸 수 있는 도구(순서대로) */
  agentTools: string[];
  /** 누구에게 언제 알림이 가는가 */
  notifies: string;
  /** 할 일 완료와의 관계 */
  completion: string;
  /** 알아 둘 것 */
  notes?: string[];
}

const REQUEST_NOTES = [
  '요청을 보내기 전에는 아무에게도 알림이 가지 않는다(연결·저장만으로는 안 간다).',
  '대상 규칙을 비우면 «이 할 일의 담당자» — 담당자가 바뀌면 보내기 전 명단도 따라 바뀐다(보낸 뒤 명단 변경은 웹 [명단 다시 계산]).',
  '보낸 뒤에는 칸 구성·축·공개 방식이 잠긴다 — 보내기 전에 칸을 확정할 것.',
  '마감(due_date)이 지나도 요청은 저절로 닫히지 않는다.',
];

const ACTION_GUIDES: Record<string, ActionGuide> = {
  'collect.input': {
    label: '입력 받기', level: 'confirm',
    what: '대상(예: 1학년 수학 교사 전원)에게서 값을 받아 표로 모은다. 한 줄 = 사람 · 담당 학년×과목 · 담당 학급(axis) × 직접 입력 구분(dimensions).',
    agentTools: ['update_action', 'send_request', 'remind_pending', 'get_action_results'],
    notifies: '요청을 보낼 때 대상 전원 · 다시 알림 때 아직 안 낸 사람.',
    completion: '입력 받기는 할 일 완료의 조건이 아니다(응답자는 담당자가 아니다). 할 일이 완료·취소되면 요청이 저절로 마감된다.',
    notes: [...REQUEST_NOTES, '응답 공개: private = 요청한 사람만 봄 · shared = 대상자 모두가 표를 봄.'],
  },
  'submit.file': {
    label: '파일 제출 받기', level: 'confirm',
    what: '대상이 파일을 올린다(구글 공용 드라이브).',
    agentTools: ['update_action', 'send_request', 'remind_pending', 'get_action_results'],
    notifies: '요청을 보낼 때 대상 전원 · 다시 알림 때 아직 안 낸 사람.',
    completion: '그 할 일의 담당자는 열린 제출 요청을 다 내면 저절로 완료된다. 요청이 열리면 이미 완료였던 담당자도 대기로 돌아간다(의도).',
    notes: [...REQUEST_NOTES, '파일 제출은 에이전트가 대신 할 수 없다 — 대상자가 웹 «내 할 일»에서 낸다.'],
  },
  'submit.document': {
    label: '양식 문서 제출 받기', level: 'confirm',
    what: '지정한 양식의 빈칸을 대상이 채워 낸다. 값으로 모여 표로 보고 문서로 다시 연다.',
    agentTools: ['update_action', 'send_request', 'remind_pending', 'get_action_results'],
    notifies: '요청을 보낼 때 대상 전원 · 다시 알림 때 아직 안 낸 사람.',
    completion: '담당자는 다 내면 저절로 완료(파일 제출과 같다).',
    notes: REQUEST_NOTES,
  },
  'submit.physical': {
    label: '실물 제출 받기', level: 'confirm',
    what: '대상이 서류를 직접 낸다. 책임자가 웹에서 [받음]을 체크한다.',
    agentTools: ['update_action', 'send_request', 'remind_pending', 'get_action_results'],
    notifies: '요청을 보낼 때 대상 전원 · 다시 알림 때 아직 안 받은 사람.',
    completion: '책임자가 [받음]을 체크하면 그 담당자가 완료된다 — [받음]은 실물을 확인한 사람이 웹에서 한다(에이전트가 대신하지 않는다).',
    notes: REQUEST_NOTES,
  },
  'message.send': {
    label: '메시지 보내기', level: 'confirm',
    what: '대상에게 SPACEKIJUN 알림으로 메시지를 보낸다. 같은 작업으로 여러 번 보낼 수 있다.',
    agentTools: ['update_action', 'send_message', 'get_action_results'],
    notifies: '보낼 때 받는 사람 전원(교직원).',
    completion: '완료와 관계없다.',
    notes: [
      'SPACEKIJUN 에 로그인한 적 없는 사람(not_linked)에게는 알림이 가지 않는다 — 쿨메신저로 따로 보내라고 사용자에게 알린다.',
      '본문에 맥락에 없는 날짜·숫자를 지어 넣지 않는다.',
    ],
  },
  'document.spec_fill': {
    label: 'HWPX 스펙 기반 문서 생성', level: 'auto',
    what: '생성 방식(양식 + 채울 칸)으로 한글 문서를 만든다. 에이전트가 칸을 모두 써서 저장한다(초안 — 남에게 알림 없음).',
    agentTools: ['get_document_generation', 'create_document'],
    notifies: '없음.',
    completion: '완료와 관계없다 — 문서를 만든 뒤 담당자가 «내 할 일»에서 완료한다.',
    notes: ['create_document 는 check_only:true 로 먼저 검사하고 사용자 확인 뒤 저장한다(문서 생성 도구의 관례).'],
  },
  'document.template_fill': {
    label: 'HWPX 직접 작성', level: 'person',
    what: '양식 파일을 rhwp 편집기에서 직접 고친다(웹).',
    agentTools: [], notifies: '없음.', completion: '완료와 관계없다.',
  },
  'neis.screen': {
    label: 'NEIS 업무 화면', level: 'person',
    what: '나이스에서 처리할 화면과 처리 안내. 처리는 사람이 나이스에서 직접 한다.',
    agentTools: ['search_neis_guide', 'get_neis_guide'],
    notifies: '없음.',
    completion: '처리한 뒤 담당자가 «내 할 일»에서 완료한다.',
    notes: ['이 연결은 나이스를 조작하지 않는다 — 화면 경로·절차·주의(선행 업무)를 찾아 안내만 한다.'],
  },
  'external.screen': {
    label: '외부 시스템에서 처리', level: 'person',
    what: 'K-에듀파인·리로스쿨·업무포털처럼 나이스 밖 시스템에서 처리하는 일.',
    agentTools: [], notifies: '없음.', completion: '처리한 뒤 담당자가 «내 할 일»에서 완료한다.',
  },
  'signature.request': {
    label: '전자서명 받기', level: 'person',
    what: '문서를 올리고 서명자·자리를 지정해 서명을 받는다(웹).',
    agentTools: ['list_sign_requests'], notifies: '요청을 만들 때 서명자(웹).', completion: '완료와 관계없다.',
    notes: ['승인·서명은 본인이 직접 한다 — 에이전트는 진행 상황만 본다.'],
  },
  'signature.training': {
    label: '연수 참석 서명 받기', level: 'person',
    what: '연수 일정의 참석자에게 서명을 받는다(웹 일정 상세의 QR·출력).',
    agentTools: [], notifies: '없음.', completion: '완료와 관계없다.',
  },
  // 바로가기(웹 모달) — 에이전트에게 같은 일을 하는 도구가 있으면 confirm
  'link.schedule_add': { label: '일정 추가', level: 'confirm', what: '스케줄에 일정을 넣는다.', agentTools: ['find_staff', 'create_schedule'], notifies: '연수·업무 일정은 교사 참석자에게 알림.', completion: '완료와 관계없다.' },
  'link.timetable_change': { label: '수업 교체', level: 'confirm', what: '수업 교체·대체를 신청한다.', agentTools: ['find_swap_candidates', 'request_class_swap', 'request_substitute'], notifies: '상대 교사에게 알림.', completion: '완료와 관계없다.' },
  'link.notice_write': { label: '공지사항 작성', level: 'confirm', what: '부서 공지를 쓴다.', agentTools: ['create_notice'], notifies: '없음(공지 알림은 웹에도 없다) — 대상이 없으면 모든 교직원이 본다.', completion: '완료와 관계없다.' },
  'link.gajeong_issue': { label: '가정통신문 발급', level: 'confirm', what: '가정통신문 발급번호를 받는다(되돌릴 수 없다).', agentTools: ['create_gajeong_issue'], notifies: '없음.', completion: '완료와 관계없다.' },
  'link.volunteer_issue': { label: '봉사활동 발급', level: 'confirm', what: '봉사활동 확인서 발급번호를 받는다(되돌릴 수 없다).', agentTools: ['create_volunteer_personal', 'create_volunteer_group', 'create_volunteer_club'], notifies: '없음.', completion: '완료와 관계없다.' },
  'link.work_create': { label: '할 일 생성', level: 'confirm', what: '업무·할 일을 만든다.', agentTools: ['create_work', 'create_task'], notifies: '없음(담당자 지정도 알림 없음).', completion: '완료와 관계없다.' },
  'link.document_upload': { label: '문서 업로드', level: 'person', what: '서류함에 파일을 올린다(파일 올리기는 웹).', agentTools: ['list_documents', 'update_document'], notifies: '없음.', completion: '완료와 관계없다.' },
  'link.training_certificate': { label: '연수 이수증 등록', level: 'person', what: '연수 이수증 파일을 등록한다(웹).', agentTools: [], notifies: '없음.', completion: '완료와 관계없다.' },
};

/** 접두어 묶음 — 관리·데이터 적재 화면으로 가는 바로가기(웹에서 사람이) */
const PREFIX_GUIDES: Array<[string, ActionGuide]> = [
  ['link.', { label: '바로가기(웹 화면)', level: 'person', what: '웹의 관리·데이터 적재 화면을 연다.', agentTools: [], notifies: '없음.', completion: '처리한 뒤 담당자가 «내 할 일»에서 완료한다.' }],
  ['evalearn.', { label: '모의고사 자료 적재(웹)', level: 'person', what: '모의고사·성적 자료를 웹에서 올린다.', agentTools: [], notifies: '없음.', completion: '처리한 뒤 담당자가 «내 할 일»에서 완료한다.' }],
];

export function actionGuide(type: string): (ActionGuide & { type: string }) | null {
  const exact = ACTION_GUIDES[type];
  if (exact) return { type, ...exact };
  const pre = PREFIX_GUIDES.find(([p]) => type.startsWith(p));
  return pre ? { type, ...pre[1] } : null;
}

export const AUTOMATION_LABEL: Record<AutomationLevel, string> = {
  auto: '에이전트가 바로(초안·읽기 — 남에게 알림 없음)',
  confirm: '미리보기 → 사용자 확인 → 실행(남에게 알림이 가거나 되돌리기 어려움)',
  person: '사람이 직접(웹·나이스·외부 시스템) — 에이전트는 안내만',
};

// ── ① 기능 지식 ─────────────────────────────────────────────────────────────────

const TOPICS: Record<string, { title: string; body: string[] }> = {
  overview: {
    title: '업무 시스템 한눈에',
    body: [
      '세 층: 업무(work) > 할 일(task) > 작업(action). 업무는 책임자(managers)가 관리하고, 할 일에는 담당자(assignees)가 있고, 작업은 할 일에 붙은 도구(입력 받기·제출 받기·메시지·문서 생성·나이스 화면 …)다.',
      '할 일 종류: procedural(절차 단계 — step 순서) · one_time(일회성). 흐름(캔버스)에 없는 업무도 정상이다.',
      '완료 방식(mode): single(마감 하나) · rounds(여러 회차 — 회차마다 완료, 모든 회차 완료 = 완료) · units(과제 단위 — 맡은 단위마다 완료).',
      '담당자 완료는 본인(또는 책임자)이 «내 할 일»에서. 책임자가 할 일 자체를 완료로 바꾸면 담당자 개인 상태와 상관없이 끝난 일이다.',
      '보이는 날(visible_from): 그날 전에는 담당자의 «내 할 일»·홈에 안 나온다(저절로 나타난다).',
      '작업은 완료의 필요 조건이 아니다 — 예외는 제출 받기(열린 제출 요청을 다 내야 담당자가 완료).',
      '화면 이름: «책임자»(manager) · «작업»(action) · «업무 흐름»(캔버스). «관리자»는 시스템 관리자만 뜻한다.',
    ],
  },
  run: {
    title: '에이전트로 업무 진행하기',
    body: [
      '시작은 언제나 담당자의 지시다(타이머·무인 실행 없음). 지시를 받으면 get_work_progress 로 어디까지 됐는지 보고, 다음 단계부터 이어서 한다.',
      '작업마다 자동화 수준이 있다 — auto: 바로 한다 · confirm: check_only:true 로 미리보기 → 사용자에게 받는 사람·내용을 보여 주고 확인 → fingerprint 를 넣어 실행 · person: 사람이 할 일을 안내하고 기다린다.',
      'fingerprint 는 받는 사람·설정에서 서버가 계산한다. 미리본 뒤 무엇이 바뀌면 실행이 거부된다 — 다시 미리보고 다시 확인받는다.',
      '실행에는 instruction(담당자 지시 한 줄 요약)을 함께 넘긴다 — 기록에 남아 나중에 «무엇을 원했는가»를 돌아볼 수 있다.',
      '«어디까지 됐어?» 같은 물음에는 get_work_progress(+ get_action_results)로 답하고, 다음에 할 수 있는 일을 제안한다(예: 안 낸 사람에게 다시 알림).',
      '업무가 끝나거나(진행 상황의 review_due) 담당자가 물으면 review_work 로 기록·지표(지난해 같은 업무가 있으면 나란히)를 보고 더 나은 방법을 찾아 save_work_insight 로 남긴다. 다음 진행 상황(올해·내년 업무)에 «지난번 인사이트»로 보인다.',
      '인사이트를 따랐는지는 decide_work_insight(applied · dismissed) — 무엇이 실제로 도움이 되는지 쌓인다.',
      '업무 수행 지식은 DB(work_knowledge)에 있고 «지난 업무 가져오기» 계보를 따라 여러 해 전 것까지 읽힌다 — 진행 전에 list_work_knowledge 로 절차·요령·주의를 읽는다. ' +
        '담당자가 알려 준 요령은 save_work_knowledge 로 남기고(다음 해 담당자의 에이전트가 읽는다), 맞지 않게 된 옛 지식은 update_work_knowledge 로 이유와 함께 보관한다.',
      '흐름을 고치는 일(단계 추가·순서·작업 바꾸기)도 담당자 지시로 한다 — create_task · update_task · add_action · place_work · connect_nodes.',
    ],
  },
  patterns: {
    title: '자주 쓰는 업무 모양',
    body: [
      '안내 → 받기 → 독촉 → 검토: message.send(안내) → collect.input 또는 submit.*(받기) → remind_pending(마감 2~3일 전, 안 낸 사람만) → get_action_results 로 검토.',
      '받기 → 문서: collect.input 으로 값을 모은 뒤 document.spec_fill 의 생성 방식으로 보고서·계획서를 쓴다(get_action_results 의 표를 칸에 옮긴다).',
      '해마다 하는 업무: 웹 «지난 업무 가져오기»로 작년 업무를 가져오면 할 일·작업 설정이 함께 오고, 진행 상황이 작년 인사이트를 보여 준다.',
      '나이스 처리가 낀 업무: neis.screen 작업 — get_neis_guide 의 선행·후행(before·after)을 보고 순서를 안내한다.',
    ],
  },
  human_only: {
    title: '사람만 하는 일',
    body: [
      '나이스·K-에듀파인·리로스쿨 등 외부 시스템 처리(에이전트는 화면·절차 안내).',
      '결재 승인·전자서명(서명은 본인이 그린다).',
      '파일 제출·실물 [받음] 체크·파일 올리기(서류함·제출).',
      '남의 할 일 상태를 대신 바꾸는 일(에이전트는 내 상태만 — set_my_task_status).',
      '보낸 요청의 명단 다시 계산·요청 마감(웹 작업 화면).',
    ],
  },
};

export function workGuide(topic?: string | null) {
  const t = (topic ?? '').trim();
  if (!t) {
    return {
      topics: Object.entries(TOPICS).map(([key, v]) => ({ key, title: v.title })),
      actions: [...Object.keys(ACTION_GUIDES), ...PREFIX_GUIDES.map(([p]) => `${p}*`)],
      automation_levels: AUTOMATION_LABEL,
      hint: 'topic 에 overview · run · patterns · human_only 또는 작업 종류(예: collect.input)를 넣는다.',
    };
  }
  if (TOPICS[t]) return { topic: t, ...TOPICS[t] };
  const g = actionGuide(t);
  if (g) return { topic: t, ...g, level_meaning: AUTOMATION_LABEL[g.level] };
  return { error: `모르는 주제입니다: ${t}`, topics: Object.keys(TOPICS) };
}

// ── ② 진행 상황 정리 ────────────────────────────────────────────────────────────

interface ActionFact {
  action_id: string; type: string; title: string;
  request_kind?: string; config_error?: string;
  request?: { status: string; started_at?: string; closed_at?: string; due_date?: string; people?: number; pending?: number; pending_names?: string[]; last_reminded_at?: string };
  messages_sent?: number; last_sent_at?: string; documents?: number; runs?: number;
}
interface TaskFact {
  task_id: string; title: string; type: string; step?: number; status: string; due_dates?: string[]; visible_from?: string;
  mode?: string; assignees?: number; assignees_done?: number; assignees_pending?: string[]; actions?: ActionFact[];
}
export interface ProgressFacts {
  today: string; work: Record<string, unknown>; tasks: TaskFact[]; knowledge?: unknown[];
  /** 돌아보기 재료(wr_review_facts) — 판정 뒤 응답에서 지운다 */
  history?: ReviewFacts | null; previous_history?: ReviewFacts | null;
  /** 이 업무에 남긴(보관 안 된) 지식 수·마지막 시각 */
  reflection?: { notes?: number; last_note_at?: string | null } | null;
}

/** 작업 하나의 다음 할 일 — null 이면 할 일 없음 */
export function nextStepOf(a: ActionFact): { do: string; tool?: string; level: AutomationLevel } | null {
  const g = actionGuide(a.type);
  const level: AutomationLevel = g?.level ?? 'person';
  if (a.request_kind) {
    if (!a.request) {
      return a.config_error
        ? { do: `설정이 덜 됐다 — ${a.config_error}`, tool: 'update_action', level: 'confirm' }
        : { do: '요청을 보낸다(미리보기 → 사용자 확인 → 보내기)', tool: 'send_request', level: 'confirm' };
    }
    if (a.request.status === 'open' && (a.request.pending ?? 0) > 0) {
      return { do: `${a.request.pending}명이 아직 안 냈다 — 다시 알리거나 결과를 본다`, tool: 'remind_pending', level: 'confirm' };
    }
    return { do: a.request.status === 'open' ? '모두 냈다 — 결과를 검토한다' : '마감됨 — 결과를 본다', tool: 'get_action_results', level: 'auto' };
  }
  if (a.type === 'message.send') {
    if (a.config_error) return { do: `설정이 덜 됐다 — ${a.config_error}`, tool: 'update_action', level: 'confirm' };
    if (!a.messages_sent) return { do: '메시지를 보낸다(미리보기 → 사용자 확인 → 보내기)', tool: 'send_message', level: 'confirm' };
    return null;
  }
  if (a.type === 'document.spec_fill') {
    return a.documents ? null : { do: '생성 방식으로 문서를 쓴다', tool: 'get_document_generation', level: 'auto' };
  }
  if (level === 'person') {
    return { do: g?.agentTools.length ? `사람이 처리 — ${g.agentTools.join('·')} 로 안내` : '사람이 웹·외부 시스템에서 처리', tool: g?.agentTools[0], level };
  }
  return g?.agentTools.length ? { do: `${g.label} — ${g.agentTools.join('·')}`, tool: g.agentTools[0], level } : null;
}

const isOpenTask = (t: TaskFact) => t.status !== 'completed' && t.status !== 'cancelled';

interface KnowledgeRef {
  knowledge_id: number; kind: string; title: string; from?: string;
  task_now?: { task_id: string }; action_now?: { action_id: string };
}
const knowledgeRef = (k: KnowledgeRef) => ({ knowledge_id: k.knowledge_id, kind: k.kind, title: k.title, from: k.from });

export function enrichProgress(facts: ProgressFacts) {
  // 지식을 그 작업·그 할 일에 붙여 보여 준다 — 작업 지식은 같은 종류라도 «그 작업»에만(할 일마다 설정이 다르다)
  const knowledge = (facts.knowledge ?? []) as KnowledgeRef[];
  const tasks = (facts.tasks ?? []).map((t) => {
    const taskKnowledge = knowledge.filter((k) => k.task_now?.task_id === t.task_id && !k.action_now);
    return {
      ...t,
      ...(taskKnowledge.length ? { knowledge: taskKnowledge.map(knowledgeRef) } : {}),
      actions: (t.actions ?? []).map((a) => {
        const g = actionGuide(a.type);
        const actionKnowledge = knowledge.filter((k) => k.action_now?.action_id === a.action_id);
        return {
          ...a, automation: g?.level ?? 'person', kind_label: g?.label ?? a.type, next: isOpenTask(t) ? nextStepOf(a) : null,
          ...(actionKnowledge.length ? { knowledge: actionKnowledge.map(knowledgeRef) } : {}),
        };
      }),
    };
  });
  const next_steps: Array<{ task: string; action?: string; action_id?: string; do: string; tool?: string; level: AutomationLevel }> = [];
  for (const t of tasks) {
    if (!isOpenTask(t)) continue;
    for (const a of t.actions) {
      if (a.next) next_steps.push({ task: t.title, action: a.title, action_id: a.action_id, ...a.next });
    }
    if ((t.assignees ?? 0) > 0 && (t.assignees_pending?.length ?? 0) > 0 && t.actions.every((a) => !a.next || a.next.level === 'person')) {
      next_steps.push({ task: t.title, do: `담당자 ${t.assignees_pending!.length}명이 완료 전(담당자가 «내 할 일»에서 완료한다)`, level: 'person' });
    }
    if (next_steps.length >= 12) break;
  }
  const summary = {
    tasks: tasks.length,
    open_tasks: tasks.filter(isOpenTask).length,
    actions_by_level: tasks.flatMap((t) => t.actions).reduce<Record<string, number>>((m, a) => ({ ...m, [a.automation]: (m[a.automation] ?? 0) + 1 }), {}),
  };
  const review_due = reviewDue(facts);
  if (review_due) next_steps.push({ task: '(업무 전체)', do: review_due.do, tool: 'review_work', level: 'confirm' });
  const knowledge_candidates = knowledgeCandidates(facts, knowledge);
  const { history: _h, previous_history: _p, reflection: _r, ...rest } = facts;
  return { ...rest, tasks, summary, next_steps, automation_levels: AUTOMATION_LABEL,
    ...(review_due ? { review_due } : {}),
    ...(knowledge_candidates.length ? { knowledge_candidates } : {}),
    guide: '작업 종류·규칙은 get_work_guide(topic). 알림이 가는 실행은 check_only 미리보기 → 사용자 확인 → fingerprint. ' +
      '할 일·작업에 붙은 knowledge 가 있으면 실행 전에 읽는다(전문 = list_work_knowledge, action_id 로 그 작업만). ' +
      'review_due 가 있으면 담당자에게 돌아보기를 권하고(하자고 하면 review_work), knowledge_candidates 는 담당자에게 «요령을 남겨 둘까요?»라고 물을 자리다 — 저절로 저장하지 않는다.' };
}

// ── ②-1 돌아보기 권하기 · 지식 후보 ─────────────────────────────────────────────
// 판정은 여기 한 곳. 신호일 뿐이다 — 에이전트가 담당자에게 권하고, 담당자가 정한다(무인 저장 없음).
// 사람 단위로 세지 않는다 — 할 일·작업·시기로만 말한다(사용자 결정).

/** 할 일이 모두 끝났고, 마지막 완료 뒤로 이 업무에 남긴 지식이 없으면 돌아보기를 권한다 */
export function reviewDue(facts: ProgressFacts): { done_at: string; do: string } | null {
  const tasks = facts.tasks ?? [];
  if (!tasks.length || tasks.some(isOpenTask)) return null;
  const doneTimes = (facts.history?.tasks ?? []).map((t) => t.completed_at).filter((x): x is string => !!x);
  if (!doneTimes.length) return null; // 모두 취소된 업무는 권하지 않는다
  const done_at = doneTimes.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
  const last = facts.reflection?.last_note_at;
  if (last && Date.parse(last) >= Date.parse(done_at)) return null;
  return {
    done_at,
    do: '할 일이 모두 끝났다 — 담당자에게 돌아보기를 권한다(하자고 하면 review_work → 함께 정리 → save_work_insight·save_work_knowledge). 내년 담당자의 에이전트가 읽는다',
  };
}

export interface KnowledgeCandidate {
  task: string; task_id: string; action?: string; action_id?: string;
  reasons: string[]; again?: boolean; ask: string;
}

/** 실행 기록에서 «요령을 남겨 둘 만한» 할 일·작업 — 이미 올해 지식을 남긴 곳은 뺀다 */
export function knowledgeCandidates(facts: ProgressFacts, knowledge: KnowledgeRef[] = []): KnowledgeCandidate[] {
  const cur = reviewMetrics(facts.history);
  if (!cur) return [];
  const prev = reviewMetrics(facts.previous_history);
  const noted = new Set(knowledge.filter((k) => k.from === 'this_work')
    .flatMap((k) => [k.action_now?.action_id, k.task_now?.task_id]).filter(Boolean) as string[]);
  const prevTask = new Map((prev?.tasks ?? []).map((t) => [t.task_id, t]));
  const taskTitle = new Map(cur.tasks.map((t) => [t.task_id, t.title]));
  const out: KnowledgeCandidate[] = [];

  for (const t of cur.tasks) {
    if (noted.has(t.task_id)) continue;
    const reasons: string[] = [];
    if ((t.late_days ?? 0) >= 1) reasons.push(`마감보다 ${t.late_days}일 늦게 끝났다`);
    if (t.deadline_changes > 0) reasons.push(`마감을 ${t.deadline_changes}번 바꿨다${t.extension_days ? `(모두 ${t.extension_days}일 연장)` : ''}`);
    if (t.assignee_changes >= 2) reasons.push(`담당자 구성을 ${t.assignee_changes}번 바꿨다`);
    if (t.step_changes >= 2) reasons.push(`단계 순서를 ${t.step_changes}번 바꿨다`);
    if (!reasons.length) continue;
    const p = t.from_task_id ? prevTask.get(t.from_task_id) : undefined;
    const again = !!p && ((p.late_days ?? 0) >= 1 || p.deadline_changes > 0);
    out.push({ task: t.title, task_id: t.task_id, reasons, ...(again ? { again } : {}),
      ask: '이 할 일에서 다음엔 무엇을 다르게 하면 좋을지(시기·순서·미리 할 일) 담당자에게 묻는다' });
  }

  for (const a of cur.actions) {
    if (noted.has(a.action_id)) continue;
    const reasons: string[] = [];
    if (a.reminders >= 2) reasons.push(`다시 알림을 ${a.reminders}번 보냈다`);
    const r = a.request;
    if (r && r.days_open !== null && r.response_rate !== null && r.response_rate < 90) reasons.push(`마감 때 응답률 ${r.response_rate}%`);
    if (r && r.days_to_90 !== null && r.days_to_90 >= 7) reasons.push(`90%가 내기까지 ${r.days_to_90}일 걸렸다`);
    if (a.config_edits >= 2) reasons.push(`설정을 ${a.config_edits}번 고쳤다`);
    if (!reasons.length) continue;
    // 지난해 같은 할 일의 같은 종류 작업도 다시 알림이 잦았으면 «또»
    const t = cur.tasks.find((x) => x.task_id === a.task_id);
    const pt = t?.from_task_id ? prevTask.get(t.from_task_id) : undefined;
    const pa = pt ? prev!.actions.find((x) => x.task_id === pt.task_id && x.type === a.type) : undefined;
    const again = !!pa && (pa.reminders >= 2 || (pa.request?.response_rate ?? 100) < 90);
    out.push({ task: taskTitle.get(a.task_id) ?? '', task_id: a.task_id, action: a.title, action_id: a.action_id, reasons,
      ...(again ? { again } : {}),
      ask: a.reminders >= 2 || r
        ? '언제 알리면 잘 냈는지·안내 문구·칸 구성 중 다음에 바꿀 것을 담당자에게 묻는다'
        : '설정을 처음부터 어떻게 두면 되는지 담당자에게 묻는다' });
  }
  return out.sort((x, y) => Number(!!y.again) - Number(!!x.again)).slice(0, 8);
}

// ── ③ 결과 정리 ─────────────────────────────────────────────────────────────────

interface Board {
  kind?: string; config?: { fields?: Array<{ key: string; label: string; type: string }>; dimensions?: Array<{ key: string; label: string }> };
  action?: { title?: string; task_title?: string; work_title?: string };
  request?: { status?: string; started_at?: string; closed_at?: string; visibility?: string } | null;
  viewer?: { can_manage?: boolean };
  targets?: Array<{ unit_key: string; unit_label?: string; name?: string; removed?: boolean }>;
  responses?: Array<{ unit_key: string; dimension_key: string; responder_name?: string; values?: Record<string, unknown>; updated_at?: string }>;
  submissions?: Array<{ name?: string; unit_key?: string; kind?: string; file_name?: string; document_title?: string; received_at?: string; created_at?: string }>;
}

export function shapeActionResults(raw: { type: string; board?: Board; pending_names?: string[] | null; sends?: unknown[] }) {
  if (raw.sends) return { type: raw.type, sends: raw.sends };
  const b = raw.board ?? {};
  const fields = b.config?.fields ?? [];
  const dims = new Map((b.config?.dimensions ?? []).map((d) => [d.key, d.label]));
  const units = new Map((b.targets ?? []).map((t) => [t.unit_key, t.unit_label || '']));
  const rows = (b.responses ?? []).slice(0, 500).map((r) => ({
    who: r.responder_name ?? null,
    unit: units.get(r.unit_key) || null,
    dimension: dims.get(r.dimension_key) || null,
    values: Object.fromEntries(fields.map((f) => [f.label, r.values?.[f.key] ?? null])),
    at: r.updated_at,
  }));
  const totals = fields.filter((f) => f.type === 'number').map((f) => {
    const nums = (b.responses ?? []).map((r) => Number(r.values?.[f.key])).filter((n) => Number.isFinite(n));
    const sum = nums.reduce((s, n) => s + n, 0);
    return { field: f.label, count: nums.length, sum, average: nums.length ? Math.round((sum / nums.length) * 100) / 100 : null };
  });
  const yesno = fields.filter((f) => f.type === 'yesno' || f.type === 'select').map((f) => {
    const counts: Record<string, number> = {};
    for (const r of b.responses ?? []) {
      const v = r.values?.[f.key];
      if (v !== undefined && v !== null && v !== '') counts[String(v)] = (counts[String(v)] ?? 0) + 1;
    }
    return { field: f.label, counts };
  });
  return {
    type: raw.type, kind: b.kind, title: b.action?.title, task_title: b.action?.task_title, work_title: b.action?.work_title,
    request: b.request ? { status: b.request.status, started_at: b.request.started_at, closed_at: b.request.closed_at, visibility: b.request.visibility } : null,
    targets: (b.targets ?? []).filter((t) => !t.removed).length,
    fields: fields.map((f) => ({ label: f.label, type: f.type })),
    responses: rows,
    totals: totals.length ? totals : undefined,
    counts: yesno.length ? yesno : undefined,
    submissions: (b.submissions ?? []).map((s) => ({
      who: s.name ?? null, unit: (s.unit_key && units.get(s.unit_key)) || null, kind: s.kind,
      file: s.file_name ?? s.document_title ?? null, received: s.kind === 'physical' ? !!s.received_at : undefined, at: s.created_at,
    })),
    pending: raw.pending_names ?? undefined,
    note: b.viewer?.can_manage ? undefined : '책임자가 아니어서 내 응답(또는 공개된 표)만 보인다.',
  };
}

// ── ④ 돌아보기 지표 ─────────────────────────────────────────────────────────────

interface ReviewFacts {
  work: { work_id: string; name: string; status: string; created_at?: string; rolled_over_from?: string };
  tasks: Array<{ task_id: string; title: string; type: string; step?: number; status: string; created_at: string; due_dates?: string[]; from_task_id?: string; assignees?: number; assignees_done?: number; completed_at?: string }>;
  actions: Array<{ action_id: string; task_id: string; type: string; title: string; created_at: string;
    request?: { kind: string; started_at: string; closed_at?: string; people: number; first_responses: string[] } | null;
    reminders?: string[]; messages?: string[]; documents?: string[] }>;
  events: Array<{ at: string; kind: string; task_id?: string; action_id?: string; role: string; via: string; detail?: Record<string, unknown> }>;
}

const DAY = 86_400_000;
const days = (a: string | undefined, b: string | undefined) => (a && b ? Math.round(((Date.parse(b) - Date.parse(a)) / DAY) * 10) / 10 : null);
/** n명째 응답까지 걸린 날 — 응답 시각은 오름차순 */
const daysToShare = (start: string, times: string[], people: number, share: number) => {
  const need = Math.ceil(people * share);
  return need > 0 && times.length >= need ? days(start, times[need - 1]) : null;
};

export function reviewMetrics(f: ReviewFacts | null | undefined) {
  if (!f) return null;
  const evOf = (kind: string, pred: (e: ReviewFacts['events'][number]) => boolean = () => true) => f.events.filter((e) => e.kind === kind && pred(e));
  const tasks = f.tasks.map((t) => {
    const lastDue = t.due_dates?.length ? `${t.due_dates[t.due_dates.length - 1]}T23:59:59+09:00` : undefined;
    const deadlineChanges = evOf('task.deadline_changed', (e) => e.task_id === t.task_id);
    const extensionDays = deadlineChanges.reduce((s, e) => {
      const from = (e.detail?.from as string[] | undefined)?.at(-1); const to = (e.detail?.to as string[] | undefined)?.at(-1);
      const d = days(from && `${from}T00:00:00+09:00`, to && `${to}T00:00:00+09:00`);
      return s + (d && d > 0 ? d : 0);
    }, 0);
    return {
      task_id: t.task_id, title: t.title, type: t.type, step: t.step, status: t.status, from_task_id: t.from_task_id,
      days_to_complete: days(t.created_at, t.completed_at),
      late_days: t.completed_at && lastDue ? Math.max(0, days(lastDue, t.completed_at) ?? 0) : null,
      deadline_changes: deadlineChanges.length,
      extension_days: extensionDays,
      assignee_changes: evOf('task.assignees_changed', (e) => e.task_id === t.task_id).length,
      step_changes: evOf('task.step_changed', (e) => e.task_id === t.task_id).length,
      assignees_done: t.assignees ? `${t.assignees_done ?? 0}/${t.assignees}` : null,
    };
  });
  const actions = f.actions.map((a) => {
    const g = actionGuide(a.type);
    const r = a.request;
    const times = r?.first_responses ?? [];
    // 다시 알림 뒤 48시간 안에 들어온 첫 응답 수
    const afterReminder = (a.reminders ?? []).map((at) => ({
      at, responses_within_48h: times.filter((x) => Date.parse(x) >= Date.parse(at) && Date.parse(x) - Date.parse(at) <= 2 * DAY).length,
    }));
    return {
      action_id: a.action_id, task_id: a.task_id, title: a.title, type: a.type, automation: g?.level ?? 'person',
      request: r ? {
        people: r.people, responded: times.length,
        response_rate: r.people ? Math.round((times.length / r.people) * 100) : null,
        days_to_50: daysToShare(r.started_at, times, r.people, 0.5),
        days_to_90: daysToShare(r.started_at, times, r.people, 0.9),
        days_open: days(r.started_at, r.closed_at),
        sent_via_agent: evOf('agent.sent', (e) => e.action_id === a.action_id && e.detail?.tool === 'send_request').length > 0,
      } : null,
      reminders: (a.reminders ?? []).length,
      after_reminders: afterReminder.length ? afterReminder : undefined,
      messages_sent: (a.messages ?? []).length,
      documents: (a.documents ?? []).length,
      config_edits: evOf('action.config_changed', (e) => e.action_id === a.action_id).reduce((s, e) => s + Number(e.detail?.times ?? 1), 0),
    };
  });
  const previews = evOf('agent.preview').length;
  const sends = evOf('agent.sent').length;
  const byLevel = actions.reduce<Record<string, number>>((m, a) => ({ ...m, [a.automation]: (m[a.automation] ?? 0) + 1 }), {});
  return {
    work: f.work,
    tasks, actions,
    work_summary: {
      tasks: tasks.length, completed: tasks.filter((t) => t.status === 'completed').length,
      deadline_changes: tasks.reduce((s, t) => s + t.deadline_changes, 0),
      actions_by_level: byLevel,
      person_share: actions.length ? Math.round(((byLevel.person ?? 0) / actions.length) * 100) : null,
      agent: { previews, sends, previews_without_send: Math.max(0, previews - sends) },
      edits_by_via: f.events.reduce<Record<string, number>>((m, e) => (e.kind.startsWith('agent.') ? m : { ...m, [e.via]: (m[e.via] ?? 0) + 1 }), {}),
      edits_by_role: f.events.reduce<Record<string, number>>((m, e) => (e.kind.startsWith('agent.') ? m : { ...m, [e.role]: (m[e.role] ?? 0) + 1 }), {}),
    },
  };
}

/** 지난해 같은 할 일·작업과 나란히 — 할 일은 rolledOverFrom.taskId, 없으면 제목으로 짝짓는다 */
export function compareWithPrevious(cur: ReturnType<typeof reviewMetrics>, prev: ReturnType<typeof reviewMetrics>) {
  if (!cur || !prev) return null;
  const prevById = new Map(prev.tasks.map((t) => [t.task_id, t]));
  const prevByTitle = new Map(prev.tasks.map((t) => [t.title, t]));
  return cur.tasks.map((t) => {
    const p = (t.from_task_id && prevById.get(t.from_task_id)) || prevByTitle.get(t.title);
    if (!p) return { title: t.title, previous: null };
    const curActs = cur.actions.filter((a) => a.task_id === t.task_id);
    const prevActs = prev.actions.filter((a) => a.task_id === p.task_id);
    return {
      title: t.title,
      days_to_complete: { now: t.days_to_complete, before: p.days_to_complete },
      deadline_changes: { now: t.deadline_changes, before: p.deadline_changes },
      requests: curActs.filter((a) => a.request).map((a) => {
        const pa = prevActs.find((x) => x.type === a.type && x.request);
        return { title: a.title, days_to_90: { now: a.request!.days_to_90, before: pa?.request?.days_to_90 ?? null },
          response_rate: { now: a.request!.response_rate, before: pa?.request?.response_rate ?? null },
          reminders: { now: a.reminders, before: pa?.reminders ?? null } };
      }),
    };
  });
}

export function reviewReport(raw: { today?: string; current?: ReviewFacts | null; previous?: ReviewFacts | null }) {
  const current = reviewMetrics(raw.current);
  const previous = reviewMetrics(raw.previous);
  return {
    today: raw.today,
    current,
    previous: previous ? { work: previous.work, work_summary: previous.work_summary } : null,
    compared_with_previous: compareWithPrevious(current, previous),
    timeline: (raw.current?.events ?? []).slice(-120),
    notes: [
      '숫자는 기록에서 코드로 계산했다 — 해석·제안은 에이전트가 하고 save_work_insight 로 남긴다.',
      '사람별로 세지 않는다(누가 늦었는지가 아니라 어느 단계·작업이 걸렸는지를 본다).',
      '실행 기록은 2026-10-24 부터 쌓인다 — 그 전의 변경(마감 연장·담당자 변경)은 없다.',
    ],
  };
}
