// 입력 받기 화면 브라우저 검증 — 2026-09-23
//
// 실제 컴포넌트(CollectInputRunner · CollectRespondDialog)를 그대로 띄우고, supabase 는
// RPC 이름별로 fixture 를 돌려주는 스텁으로 바꾼다. 데스크톱(1280)·휴대폰(390) 두 폭에서
// 찍고 ①런타임 오류 ②핵심 문구 ③페이지 가로 넘침(표는 자기 컨테이너에서만 스크롤)을 본다.
// 서버 권한·가시성은 SQL 드라이런이 맡는다(docs/features/collect-input.md).
//
// 실행 (개발 서버를 먼저 켠다):
//   $env:PLAYWRIGHT_MODULE = "C:\...\node_modules\playwright\index.mjs"
//   node scripts/collect-input-test/run-browser.mjs
// 결과 png = .tmp/collect-shots/ (gitignore)
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);

const OUT = join(process.cwd(), '.tmp', 'collect-shots');
mkdirSync(OUT, { recursive: true });
const BASE = `${process.env.MODAL_TEST_URL || 'http://localhost:8080'}/scripts/mobile-modal-test/index.html`;
const { browserHash } = JSON.parse(readFileSync(new URL('../../node_modules/.vite/deps/_metadata.json', import.meta.url), 'utf8'));
const react = '/node_modules/.vite/deps/react.js';

// ── fixture ─────────────────────────────────────────────────────────────────
const CONFIG = {
  title: '정기시험 문항 점검 확인',
  audience: { include: [{ type: 'teaching', grades: [1], subjectGroups: ['수학'] }], exclude: [] },
  axis: 'subject', answerMode: 'each', mode: 'private',
  dimensions: [{ key: 'e1', label: '1차 정기시험' }, { key: 'e2', label: '2차 정기시험' }],
  fields: [
    { key: 'ok', label: '점검 완료', type: 'yesno', required: true },
    { key: 'memo', label: '비고', type: 'text' },
  ],
  guide: '출제 원안과 문항 정보표를 대조한 뒤 점검 여부를 표시해 주세요.',
  dueDate: '2026-10-02',
};
const ACTION = { id: 'act1', title: CONFIG.title, task_id: 't1', created_by: 'me', archived_at: null, task_title: '1차 정기시험 문항 점검', task_status: 'pending', work_title: '2026 2학기 정기시험 운영' };
const TARGETS = ['윤하준', '한도윤', '장재윤'].map((name, i) => ({ id: `t${i}`, unit_key: '1|공통수학2', unit_label: '1학년 공통수학2', resource_id: `r${i}`, name, reasons: ['1학년 공통수학2 수업'], removed: false }));
const RESPONSES = [
  { unit_key: '1|공통수학2', dimension_key: 'e1', owner_key: 'r0', responder_resource_id: 'r0', responder_name: '윤하준', values: { ok: 'yes', memo: '이상 없음' }, updated_at: '' },
  { unit_key: '1|공통수학2', dimension_key: 'e2', owner_key: 'r0', responder_resource_id: 'r0', responder_name: '윤하준', values: { ok: 'no' }, updated_at: '' },
  { unit_key: '1|공통수학2', dimension_key: 'e1', owner_key: 'r1', responder_resource_id: 'r1', responder_name: '한도윤', values: { ok: 'yes' }, updated_at: '' },
];
const REQUEST = { action_id: 'act1', task_id: 't1', status: 'open', academic_year: 2026, semester: 2, axis: 'subject', answer_mode: 'each', visibility: 'private', started_at: '', closed_at: null, closed_reason: null };
const RESOLUTION = {
  academic_year: 2026, semester: 2, ref_date: '2026-09-23', axis: 'subject',
  rows: [
    ...TARGETS.map((t) => ({ resource_id: t.resource_id, name: t.name, unit_key: t.unit_key, unit_label: t.unit_label, grade: 1, subject: '공통수학2', class_label: null, reasons: t.reasons })),
    { resource_id: 'r9', name: '황로아', unit_key: null, unit_label: '', grade: null, subject: null, class_label: null, reasons: ['교감'] },
  ],
};
const CATALOG = [
  { subject_name: '공통수학2', subject_group: '수학', subject_cluster: '수학', cluster_override: null, source: 'auto', taught_grades: [1], teacher_count: 3, curriculum_labels: ['수학'] },
  { subject_name: '통합과학2', subject_group: '과학', subject_cluster: '과학', cluster_override: null, source: 'auto', taught_grades: [1], teacher_count: 5, curriculum_labels: ['과학'] },
];

const board = (viewer, extra = {}) => ({ action: ACTION, config: CONFIG, request: REQUEST, viewer, targets: TARGETS, responses: RESPONSES, ...extra });

function supabaseStub(rpcFixtures) {
  return `
  const FIX = ${JSON.stringify(rpcFixtures)};
  const result = { data: [], error: null, count: 0 };
  const make = () => new Proxy(() => {}, {
    get(_t, key) {
      if (key === 'then') return (res, rej) => Promise.resolve(result).then(res, rej);
      if (key === 'catch') return (fn) => Promise.resolve(result).catch(fn);
      if (key === 'finally') return (fn) => Promise.resolve(result).finally(fn);
      return make();
    },
    apply() { return make(); },
  });
  const rpc = (name) => Promise.resolve({ data: FIX[name] ?? null, error: null });
  export const supabase = new Proxy({}, { get: (_t, key) => key === 'rpc' ? rpc : make() });
  export default supabase;`;
}

const COMMON = {
  '**/src/components/auth/AuthProvider.tsx*':
    `export const useAuth=()=>({profile:{id:'me',name:'김교사',role:'teacher'},user:{id:'me',email:'t@myschool.hs.kr'},isAdmin:false,isStudent:false,isStudentView:false,effectiveRole:'teacher',loading:false});export const useOptionalAuth=()=>useAuth();export const AuthProvider=({children})=>children;`,
  '**/src/hooks/useAcademicTerm.ts*': `export const useAcademicTerm=()=>({data:{year:2026,semester:2},isLoading:false});`,
  '**/src/hooks/useDepartments.ts*': `export const useDepartments=()=>({departments:['정보화부'],departmentObjects:[{id:'d1',name:'교무운영부'},{id:'d2',name:'정보화부'}],isLoading:false});`,
  '**/src/hooks/useResourceTags.ts*': `export const useResourceTags=()=>({data:[{id:'g1',name:'부장'},{id:'g2',name:'고사운영교사'},{id:'g3',name:'1학년 1반'}]});`,
  '**/src/hooks/useDutySeats.ts*': `export const useDutySeats=()=>({data:[{id:'s1',name:'고사·성적처리'},{id:'s2',name:'정보화부장'}]});`,
  '**/src/hooks/useResourceSelect.ts*': `
    const people=Array.from({length:12},(_,i)=>({value:'p'+i,label:'교사'+(i+1),description:'선생님',resourceType:'teacher'}));
    export const useResourceSelect=()=>({items:people,groupItems:[],isLoading:false,staffResources:people,studentResources:[],tagOptions:[]});
    export const filterItems=(items,q)=>!q?items:items.filter(i=>i.label.includes(q));
    export const isGroupValue=()=>false; export const matchesGroupSearch=()=>false; export const expandGroupSelection=(v)=>v;
    export const getAllSelectionHelpers=(items=[])=>({individualItems:items,allStaffValues:items.map(i=>i.value),teacherValues:[],isAllStaffSelected:false,isAllTeachersSelected:false,tagOptions:[],groupOptions:[],tagSelectionStatus:new Map()});`,
};

const CASES = [
  {
    id: '01-manager-setup',
    rpc: {
      get_collect_board: board({ can_manage: true, is_target: false, resource_ids: ['me'] }, { request: null, targets: [], responses: [] }),
      resolve_audience: RESOLUTION,
      subject_group_catalog: CATALOG,
    },
    mount: `import {CollectInputRunner} from '/src/features/task-workflow/components/collect/CollectInputRunner.tsx';
      export const Case=()=>React.createElement('div',{style:{padding:16}},React.createElement(CollectInputRunner,{action:{id:'act1',config:{collect:${JSON.stringify(CONFIG)}}}}));`,
    expect: ['누구에게', '과목으로 더 좁히기', '어문학과', '예체능', '요청 보내기', '수업 없음', '1학년 공통수학2'],
  },
  {
    id: '02-manager-status',
    rpc: { get_collect_board: board({ can_manage: true, is_target: false, resource_ids: ['me'] }) },
    mount: `import {CollectInputRunner} from '/src/features/task-workflow/components/collect/CollectInputRunner.tsx';
      export const Case=()=>React.createElement('div',{style:{padding:16}},React.createElement(CollectInputRunner,{action:{id:'act1',config:{}}}));`,
    expect: ['완료 1/3줄', '1차 정기시험', '2차 정기시험', '다시 알림', '미완료 2명', '아니오'],
  },
  {
    id: '03-respond-private',
    rpc: { get_collect_board: board({ can_manage: false, is_target: true, resource_ids: ['r1'] }, { targets: [TARGETS[1]], responses: [RESPONSES[2]] }) },
    mount: `import {CollectRespondDialog} from '/src/features/task-workflow/components/collect/CollectRespondDialog.tsx';
      export const Case=()=>React.createElement(CollectRespondDialog,{actionId:'act1',open:true,onOpenChange:()=>{}});`,
    dialog: true,
    expect: ['입력 1/2칸', '출제 원안', '1차 정기시험'],
  },
  {
    id: '04-respond-shared-table',
    rpc: { get_collect_board: board({ can_manage: false, is_target: true, resource_ids: ['r2'] }, { config: { ...CONFIG, mode: 'shared' }, request: { ...REQUEST, visibility: 'shared' } }) },
    mount: `import {CollectRespondDialog} from '/src/features/task-workflow/components/collect/CollectRespondDialog.tsx';
      export const Case=()=>React.createElement(CollectRespondDialog,{actionId:'act1',open:true,onOpenChange:()=>{}});`,
    dialog: true,
    expect: ['대상자 모두가 이 표를 봅니다', '윤하준', '한도윤', '장재윤'],
  },
];

// 완료한 할 일 — 업무 4개에 흩어진 7건(최근 완료가 든 업무가 위로 와야 한다)
const done = (id, work, workName, at) => ({
  id, title: `${workName} 할 일 ${id}`, event_id: work, event_name: workName, type: 'one_time', order_index: 0,
  status: 'pending', due_date: '2026-09-01', updated_at: at, keywords: [],
  meta: { assignees: [{ id: 'me', name: '김교사', status: 'completed', completed_at: at }] },
});
const DONE_TASKS = [
  done('1', 'w1', '2026 정보공시', '2026-09-02T02:00:00Z'),
  done('2', 'w2', '2학기 정기시험 운영', '2026-09-22T02:00:00Z'),
  done('3', 'w1', '2026 정보공시', '2026-09-15T02:00:00Z'),
  done('4', 'w3', '교원 연수', '2026-08-20T02:00:00Z'),
  done('5', 'w2', '2학기 정기시험 운영', '2026-09-10T02:00:00Z'),
  done('6', 'w4', '학교 축제', '2026-07-01T02:00:00Z'),
  done('7', 'w4', '학교 축제', '2026-07-03T02:00:00Z'),
];
const WORKS = [['w1', '2026 정보공시'], ['w2', '2학기 정기시험 운영'], ['w3', '교원 연수'], ['w4', '학교 축제']]
  .map(([id, name]) => ({ id, name, status: 'active', tasks: [] }));

CASES.push(
  {
    id: '05-message-runner',
    rpc: { can_manage_task_action: true, resolve_audience: { ...RESOLUTION, axis: 'person', rows: RESOLUTION.rows.map((r) => ({ ...r, unit_key: 'person', unit_label: '' })) } },
    mount: `import {MessageSendRunner} from '/src/features/task-workflow/components/message/MessageSendRunner.tsx';
      export const Case=()=>React.createElement('div',{style:{padding:16}},React.createElement(MessageSendRunner,{action:{id:'m1',task_id:'t1',created_by:'me',config:{message:{title:'정기시험 점검 안내',body:'1차 정기시험 문항 점검을 10월 2일까지 부탁드립니다.',audience:{include:[{type:'teaching',grades:[1],subjectGroups:['수학']}],exclude:[]}}}}}));`,
    expect: ['메시지 만들기 도움', '받는 사람', 'SPACEKIJUN 알림', '쿨메신저로도 보내기', '받는 사람 복사', '알림 보내기'],
  },
  {
    id: '06-inbox-completed',
    rpc: {},
    extraMocks: {
      '**/src/hooks/useTasksJsonb.ts*': `
        const m={mutateAsync:async()=>{},isPending:false,variables:null};
        export const useMyTasksJsonb=()=>({data:{assigned_tasks:${JSON.stringify(DONE_TASKS)},managed_tasks:[]},isLoading:false,isError:false,refetch:()=>{}});
        export const useToggleAssigneeStatusJsonb=()=>m; export const useToggleDeadlineStatusJsonb=()=>m; export const useToggleUnitStatusJsonb=()=>m;`,
      '**/src/hooks/usePermissions.ts*': `export const useCurrentUserResourceId=()=>({data:'me',isLoading:false,isError:false});export const usePermissions=()=>({});`,
    },
    // 앱은 TooltipProvider 를 전역에 둔다(ClampedText 가 Tooltip 을 쓴다) — 하네스도 같은 껍데기로
    mount: `import {MyTaskInbox} from '/src/components/tasks/MyTaskInbox.tsx';
      import {TooltipProvider} from '/src/components/ui/tooltip.tsx';
      export const Case=()=>React.createElement(TooltipProvider,null,React.createElement('div',{style:{padding:16}},React.createElement(MyTaskInbox,{works:${JSON.stringify(WORKS)},filter:'completed',onTaskDetail:()=>{},plannerOpen:false,onPlannerOpenChange:()=>{}})));`,
    expect: ['2학기 정기시험 운영', '2026 정보공시', '교원 연수', '학교 축제', '최근 09.22'],
    order: ['2학기 정기시험 운영', '2026 정보공시', '교원 연수', '학교 축제'],
  },
  {
    // 업무 목록의 «작업 줄» (2026-10-06) — 할 일 아래 연결된 작업이 글자로 늘어서는가, 휴대폰에서 넘치지 않는가
    id: '07-work-action-lines',
    rpc: {},
    mount: `import {WorkTaskTable} from '/src/components/tasks/WorkTaskTable.tsx';
      import {TooltipProvider} from '/src/components/ui/tooltip.tsx';
      import {buildActionLines} from '/src/features/task-workflow/utils/actionOverview.ts';
      const A=(id,task_id,action_type,title,config={})=>({id,task_id,action_type,title,config,created_by:'me',archived_at:null,created_at:'2026-10-0'+id.length+'T00:00:00Z'});
      const actions=[
        A('a1','t1','collect.input','과목별 출제 원안 점검 결과',{collect:{audience:{include:[{type:'teaching',grades:[1],subjectGroups:['수학']}],exclude:[]},axis:'subject'}}),
        A('a2','t1','submit.file','원안 파일'),
        A('a3','t1','neis.screen','NEIS 업무 화면',{neis:{version:1,screens:[{path:['성적','성적처리','고사관리'],label:'고사관리'}]}}),
        A('a44','t3','submit.physical','답안지 원본'),
      ];
      const lines=buildActionLines(actions,new Map(),new Map([['a1',{status:'open',people:12}],['a44',{status:'closed',people:8}]]),()=>true);
      const task=(id,title)=>({id,title,description:null,due_date:'2026-10-02',meta:{},type:'procedural',status:'pending'});
      const row=(id,title,n)=>({task:task(id,title),orderNumber:n,isOneTime:false,displayStatus:'pending',assignees:[],isManager:true,canViewAssignees:true,deadlines:[],dueLabel:'10/02'});
      export const Case=()=>React.createElement(TooltipProvider,null,React.createElement('div',{style:{padding:16,background:'#f8fafc'}},React.createElement(WorkTaskTable,{
        rows:[row('t1','1차 정기시험 문항 점검',1),row('t2','시험 원안 인쇄',2),row('t3','답안지 회수',3)],
        isUpdating:false,onOpenDetail:()=>{},onOpenEdit:()=>{},onOpenPipeline:()=>{},renderAssigneeSummary:()=>null,
        actionLines:lines,onOpenAction:()=>{}})));`,
    expect: ['작업 함께 보기', '입력 받기', '과목별 출제 원안 점검 결과', '보냄 · 12명', '파일 제출 받기', '요청 전', 'NEIS 업무 화면', '실물 제출 받기', '마감'],
  },
);

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const failures = [];
try {
  for (const c of CASES) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/rest/v1/**', (r) => r.abort());
      await page.route('**/auth/v1/**', (r) => r.abort());
      const mocks = {
        ...COMMON,
        ...(c.extraMocks ?? {}),
        '**/src/integrations/supabase/client.ts*': supabaseStub(c.rpc),
        '**/scripts/mobile-modal-test/main.tsx*': `
          import React from '${react}';
          import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
          import {QueryClient,QueryClientProvider} from '/node_modules/.vite/deps/@tanstack_react-query.js';
          import {MemoryRouter} from '/node_modules/.vite/deps/react-router-dom.js';
          import '/src/index.css';
          ${c.mount}
          ReactDOM.createRoot(document.getElementById('root')).render(
            React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},
              React.createElement(MemoryRouter,null,React.createElement(Case))));`,
      };
      for (const [glob, source] of Object.entries(mocks)) {
        const body = source.replace(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)(?=['"])/g, `$1?v=${browserHash}`);
        await page.route(glob, (route) => route.fulfill({ contentType: 'application/javascript', body }));
      }
      const tag = `${c.id}-${vp.name}`;
      try {
        await page.goto(BASE);
        await page.getByText(c.expect[0], { exact: false }).first().waitFor({ state: 'visible' });
        await page.waitForTimeout(600);
        const text = await page.evaluate(() => document.body.innerText);
        const missing = c.expect.filter((e) => !text.includes(e));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        // 순서 검사 — 화면에 나오는 순서가 기대한 순서인가
        const orderOk = !c.order || c.order.every((s, i) => i === 0 || text.indexOf(c.order[i - 1]) < text.indexOf(s));
        await page.screenshot({ path: join(OUT, `${tag}.png`), fullPage: !c.dialog, animations: 'disabled' });
        const problems = [
          ...errors.map((e) => `런타임 오류: ${e}`),
          ...missing.map((m) => `문구 없음: ${m}`),
          ...(overflow > 1 ? [`페이지 가로 넘침 ${overflow}px`] : []),
          ...(orderOk ? [] : ['순서가 기대와 다름']),
        ];
        console.log(`${problems.length ? '✗' : '✓'} ${tag}${problems.length ? ' — ' + problems.join(' / ') : ''}`);
        if (problems.length) failures.push(tag);
      } catch (e) {
        console.log(`✗ ${tag} — ${e.message.split('\n')[0]} ${errors.join(' | ')}`);
        failures.push(tag);
        try { await page.screenshot({ path: join(OUT, `${tag}-FAILED.png`) }); } catch { /* ignore */ }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log(failures.length ? `\n실패 ${failures.length}건` : '\n전부 통과');
process.exit(failures.length ? 1 : 0);
