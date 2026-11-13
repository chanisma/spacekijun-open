// 업무 진행 모달 — 실제 모달 스크린샷 + 불변식 (2026-09-27, 같은 날 페이지 → 모달)
//
// 실제 모달(src/components/tasks/pipeline/WorkPipelineDialog.tsx)과 그 부품을 **그대로** 띄우고, 데이터 훅·
// 인증·작업 패널만 메모리 스텁으로 바꾼다(로그인이 Google OAuth 라 실제 세션으로는 닿을 수 없다).
// 휴대폰 390×844 와 데스크톱 1280×900 에서 찍고 본다:
//   · 휴대폰에서 전체화면으로 뜨는가(max-w 에서 유도 — dialog-layout.ts)
//   · 페이지도 모달 viewport 도 가로로 밀리지 않는가(표·단계 줄은 자기 컨테이너에서만 스크롤)
//   · 휴대폰 입력 글자가 16px 아래로 내려가지 않는가(iOS 확대)
//   · 렌더 오류가 없는가
//
// 실행 (개발 서버를 먼저 켠다 — 모바일 모달 도구와 같은 fixture html 을 쓴다):
//   $env:PLAYWRIGHT_MODULE = "C:\...\node_modules\playwright\index.mjs"   # 필요할 때만
//   $env:PIPELINE_TEST_URL = "http://localhost:8093"                    # 기본 8080
//   node scripts/work-pipeline-test/run-screenshots.mjs
// 결과 png = .tmp/pipeline-shots/ (gitignore)
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);

const OUT = join(process.cwd(), '.tmp', 'pipeline-shots');
mkdirSync(OUT, { recursive: true });
const BASE = `${process.env.PIPELINE_TEST_URL || 'http://localhost:8080'}/scripts/mobile-modal-test/index.html`;
const { browserHash } = JSON.parse(readFileSync(new URL('../../node_modules/.vite/deps/_metadata.json', import.meta.url), 'utf8'));
const react = '/node_modules/.vite/deps/react.js';
const query = '/node_modules/.vite/deps/@tanstack_react-query.js';
const router = '/node_modules/.vite/deps/react-router-dom.js';

const SUPABASE_STUB = `
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
  export const supabase = new Proxy({}, { get: () => make() });
  export default supabase;
`;

// 라이브 「2026년 정보화기기 구입 예산 운영」 모양 + 병렬 단계 + 긴 이름(넘침 확인)
const FIXTURE = `
  const tasks = [
    { id:'t1', event_id:'w1', title:'정보화기기 예산 관련 정보 공유', order_index:1, status:'completed', due_date:'2026-03-10', description:'정보화기기 예산 금액, 활용 가능한 영역, 예산 활용 절차 관련 안내 진행', meta:{}, keywords:[], type:'procedural', created_at:'', updated_at:'' },
    { id:'t2', event_id:'w1', title:'정보화기기 구입 예산 활용 접수', order_index:2, status:'completed', due_date:'2026-03-31', description:'', meta:{}, keywords:[], type:'procedural', created_at:'', updated_at:'' },
    { id:'t2b', event_id:'w1', title:'교체 대상 기기 도입년도 확인(행정실 자산 대장 대조)', order_index:2, status:'pending', due_date:null, description:'', meta:{}, keywords:[], type:'procedural', created_at:'', updated_at:'' },
    { id:'t3', event_id:'w1', title:'정보화기기 구입 예산 활용 결정 회의 진행', order_index:3, status:'pending', due_date:'2026-04-07', description:'신청 내용을 바탕으로 최종 활용 방안을 결정합니다. 행마다 승인·보류를 적습니다.', meta:{ output:{ kind:'table', label:'승인된 신청 목록' } }, keywords:[], type:'procedural', created_at:'', updated_at:'' },
    { id:'t4', event_id:'w1', title:'정보화기기 구입 예산 집행', order_index:4, status:'pending', due_date:'2026-04-30', description:'', meta:{}, keywords:[], type:'procedural', created_at:'', updated_at:'' },
    // 일회성 — 단계 사슬이 아니라 «순서 없는 할 일»로 따로(order_index 는 만든 순서일 뿐)
    { id:'o1', event_id:'w1', title:'정보화기기 자산 대장 정리(행정실 협조)', order_index:7, status:'pending', due_date:'2026-12-01', description:'', meta:{}, keywords:[], type:'one_time', created_at:'', updated_at:'' },
    { id:'o2', event_id:'w1', title:'정보화기기 사용 만족도 조사', order_index:8, status:'pending', due_date:null, description:'', meta:{}, keywords:[], type:'one_time', created_at:'', updated_at:'' },
  ];
  const actions = [
    { id:'m1', task_id:'t1', action_type:'message.send', title:'정보화기기 구입 예산 검토 요청', config:{ message:{ title:'검토 요청', body:'교체 시 도입년도를 확인해 주세요.', audience:{ include:[{type:'position',kinds:['head']}], exclude:[] } } } },
    { id:'c1', task_id:'t2', action_type:'collect.input', title:'정보화기기 구입 예산 사용 신청', config:{ collect:{ title:'사용 신청', fields:[{key:'f1',label:'물품명'},{key:'f2',label:'용도'},{key:'f3',label:'금액'}], dueDate:'2026-03-31', audience:{ include:[{type:'position',kinds:['head']}], exclude:[] } } } },
    { id:'m2', task_id:'t3', action_type:'message.send', title:'정보화기기 구입 예산 활용 결정 회의 안내', config:{ message:{ title:'회의 안내', body:'회의 일시 및 장소: 임시로 생성하여 저장하였으며 실제 사용 시 수정', audience:{ include:[], exclude:[] } } } },
  ];
  const depts = ['교무운영부','교육과정부','정보화부','수리과학부','인성인권부','생활선교부','예능사회부','진로진학부','교육연구부','1학년부','2학년부','3학년부'];
  const items = ['노트북','랩탑','노트북 컴퓨터','태블릿','태블릿PC','27인치 모니터','모니터','빔프로젝터','실물화상기','무선 마우스·키보드 세트(교실 수업용)','프린터','노트북'];
  const collectTable = {
    kind:'table',
    columns:[{key:'_who',label:'대상'},{key:'f1',label:'물품명'},{key:'f2',label:'용도'},{key:'f3',label:'금액'}],
    rows: depts.map((d,i)=>({ key:'r'+i, cells:{ _who:d+' 부장 '+['김','이','박','최'][i%4]+'교사', f1:items[i], f2:'수업·업무용 '+(i%2?'교체':'신규'), f3:String((i+3)*150000).replace(/\\B(?=(\\d{3})+(?!\\d))/g,',') }, people:[{ resourceId: i===5?null:'p'+i, name: d+' 부장' }] })),
  };
  const resolvedFor = {
    t2: [{ taskId:'t2', sourceType:'collect', sourceKey:'collect:c1', restricted:true, sourceLabel:'입력 받기 · 정보화기기 구입 예산 사용 신청', body: collectTable, updatedAt:'2026-03-30T10:00:00Z' }],
    t2b: [{ taskId:'t2b', sourceType:'manual', sourceKey:'manual', sourceLabel:'직접 남긴 것', body:{ kind:'value', text:'교체 대상 5건 중 2건은 도입 4년차(내용연수 미달) — 행정실 확인' }, updatedAt:'2026-04-01T10:00:00Z', updatedByName:'김교사' }],
    t3: [],
  };
`;

const MOCKS = {
  '**/src/integrations/supabase/client.ts*': SUPABASE_STUB,
  '**/src/components/auth/AuthProvider.tsx*':
    `export const useAuth=()=>({profile:{id:'me',name:'김교사',role:'teacher'},user:{id:'me',email:'teacher@myschool.hs.kr'},isAdmin:false,isStudent:false,isStudentView:false,effectiveRole:'teacher',loading:false});`
    + `export const AuthProvider=({children})=>children;`,
  '**/src/components/layout/Layout.tsx*':
    `import React from '${react}'; export const Layout=({children})=>React.createElement('main',{style:{padding:'8px'}},children);`,
  '**/src/hooks/usePermissions.ts*':
    `export const useCurrentUserResourceId=()=>({data:'me'});export const useCanEditTask=()=>({data:true});export const usePermissions=()=>({canEdit:true});`,
  '**/src/hooks/useResourceSelect.ts*': `
    const people=Array.from({length:20},(_,i)=>({value:'p'+i,label:'교사'+String(i+1).padStart(2,'0'),description:'선생님',resourceType:'teacher'}));
    export const useResourceSelect=()=>({items:people,groupItems:[],isLoading:false,staffResources:people,studentResources:[],tagOptions:[]});
    export const filterItems=(items,q)=>!q?items:items.filter(i=>i.label.includes(q));
    export const isGroupValue=()=>false;
    export const matchesGroupSearch=()=>false;
    export const expandGroupSelection=(v)=>v;
    export const getAllSelectionHelpers=(items=[],selected=[])=>({individualItems:items,allStaffValues:items.map(i=>i.value),teacherValues:[],isAllStaffSelected:false,isAllTeachersSelected:false,tagOptions:[],groupOptions:[],tagSelectionStatus:new Map()});`,
  '**/src/hooks/useAcademicTerm.ts*': `export const useAcademicTerm=()=>({data:{year:2026,semester:1},academicTerm:{year:2026,semester:1},isLoading:false});export const parseAcademicTerm=()=>({year:2026,semester:1});export const getTermPeriod=()=>null;export const getTermWeekInfo=()=>null;`,
  // 작업 패널은 그 자체로 또 다른 기능이다 — 여기서는 자리만 차지하게
  '**/src/features/task-workflow/components/TaskActionPanel.tsx*':
    `import React from '${react}'; export const TaskActionPanel=()=>React.createElement('div',{'data-testid':'action-panel',style:{border:'1px dashed #cbd5e1',borderRadius:8,padding:8,fontSize:12,color:'#64748b'}},'연결된 작업 (메시지 보내기 · 입력 받기) — 스텁');export const TaskActionRunnerDialog=()=>null;`,
  '**/src/components/tasks/TaskDetailDialog.tsx*': `export const TaskDetailDialog=()=>null;`,
  '**/src/hooks/useWorkPipeline.ts*': `
    import {useMutation} from '${query}';
    import {buildStages} from '/src/lib/workPipeline.ts';
    ${FIXTURE}
    export const workPipelineKeys={all:['wp']};
    export const useWorkPipeline=()=>({ work:{id:'w1',name:'2026년 정보화기기 구입 예산 운영 — 부서별 교육·업무용 정보화기기 구입 예산 740만원 편성·집행',description:'',status:'active'}, isLoading:false, error:null, tasks, stages:buildStages(tasks), actions, rawActions:actions, outputByTask:new Map() });
    export const useResolvedOutputs=(ts)=>ts.map(t=>({task:t, outputs: resolvedFor[t.id] ?? [], isLoading:false, error:null}));
    export const useCanWriteTaskOutput=()=>({data:true});
    export const useInvalidatePipeline=()=>()=>{};
    const m=()=>useMutation({mutationFn:async()=>{}});
    export const useSaveTaskOutput=m; export const useClearTaskOutput=m; export const useUpdateTaskOutputDecl=m;`,
};

const VIEWPORTS = [
  { id: 'mobile', width: 390, height: 844 },
  { id: 'desktop', width: 1280, height: 900 },
];

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
const results = [];
try {
  for (const vp of VIEWPORTS) {
    for (const route of ['t3', 't1']) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.id === 'mobile' ? 2 : 1 });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
      await page.route('**/rest/v1/**', (r) => r.abort());
      await page.route('**/auth/v1/**', (r) => r.abort());
      const mocks = {
        ...MOCKS,
        '**/scripts/mobile-modal-test/main.tsx*': `
          import React from '${react}';
          import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
          import {QueryClient,QueryClientProvider} from '${query}';
          import {MemoryRouter} from '${router}';
          import '/src/index.css';
          import {WorkPipelineDialog} from '/src/components/tasks/pipeline/WorkPipelineDialog.tsx';
          ReactDOM.createRoot(document.getElementById('root')).render(
            React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},
              React.createElement(MemoryRouter,null,
                React.createElement(WorkPipelineDialog,{workId:'w1',initialTaskId:'${route}',open:true,onOpenChange:()=>{}}))));`,
      };
      for (const [glob, source] of Object.entries(mocks)) {
        const body = source.replace(/(\/node_modules\/\.vite\/deps\/[@\w-]+\.js)(?=['"])/g, `$1?v=${browserHash}`);
        await page.route(glob, (r) => r.fulfill({ contentType: 'application/javascript', body }));
      }
      const name = `${vp.id}-${route.includes('t3') ? 'meeting' : 'first'}`;
      const row = { name, ok: false };
      try {
        await page.goto(BASE);
        await page.getByText('앞 단계에서 넘어온 것').first().waitFor({ state: 'visible' });
        await page.waitForTimeout(600);
        row.metrics = await page.evaluate(() => {
          const content = document.querySelector('[data-slot="dialog-content"]');
          const viewport = document.querySelector('[data-slot="dialog-viewport"]');
          const rect = content?.getBoundingClientRect();
          return {
          pageOverflowsX: document.documentElement.scrollWidth > innerWidth + 1,
          scrollWidth: document.documentElement.scrollWidth,
          mobilePresentation: content?.getAttribute('data-mobile') ?? null,
          modalRect: rect ? { left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
          viewportOverflowsX: viewport ? viewport.scrollWidth > viewport.clientWidth + 1 : true,
          viewportScrolls: viewport ? viewport.scrollHeight > viewport.clientHeight : false,
          footerVisible: (() => {
            const f = document.querySelector('[data-slot="dialog-footer"]');
            if (!f) return false;
            const r = f.getBoundingClientRect();
            return r.bottom <= innerHeight + 1 && r.top >= 0;
          })(),
          smallInputs: [...document.querySelectorAll('input, textarea')]
            .filter((n) => n.offsetParent !== null && parseFloat(getComputedStyle(n).fontSize) < 16)
            .map((n) => `${n.tagName.toLowerCase()} ${Math.round(parseFloat(getComputedStyle(n).fontSize))}px "${(n.getAttribute('placeholder') || n.getAttribute('aria-label') || '').slice(0, 20)}"`),
          hasStageBar: !!document.querySelector('[aria-current="step"]'),
          text: document.body.innerText.slice(0, 20000),
          };
        });
        // 모달은 자기 viewport 가 스크롤한다 — 위·아래 두 장을 찍는다(fullPage 로는 모달 안이 안 찍힌다)
        await page.screenshot({ path: join(OUT, `${name}.png`) });
        await page.evaluate(() => {
          const v = document.querySelector('[data-slot="dialog-viewport"]');
          if (v) v.scrollTop = v.scrollHeight;
        });
        await page.waitForTimeout(200);
        await page.screenshot({ path: join(OUT, `${name}-bottom.png`) });
        row.errors = errors;
        const m = row.metrics;
        const mobile = vp.id === 'mobile';
        row.checks = {
          '페이지 가로 넘침 없음': !m.pageOverflowsX,
          '모달 viewport 가로 넘침 없음': !m.viewportOverflowsX,
          '휴대폰 = 전체화면 모달 / 데스크톱 = 가운데 넓은 모달': mobile
            ? m.mobilePresentation === 'fullscreen' && m.modalRect?.width >= vp.width - 1
            : m.modalRect?.width > 1000 && m.modalRect?.left > 0,
          '바닥글(닫기)이 화면 안에 붙어 있다': m.footerVisible,
          '본문이 길면 모달 안에서 스크롤': m.viewportScrolls,
          '단계 줄 + 선택 표시': m.hasStageBar,
          '휴대폰 입력 16px 이상': !mobile || m.smallInputs.length === 0,
          '렌더 오류 없음': errors.filter((e) => !/Failed to load resource|net::ERR/.test(e)).length === 0,
        };
        if (route.includes('t3')) {
          row.checks['앞 단계 표 → 받는 사람 버튼'] = /명 → 「정보화기기 구입 예산 활용 결정 회의 안내」 받는 사람/.test(m.text);
          row.checks['표 → 행 고르기 진입'] = m.text.includes('앞 단계 표에서 줄 고르기');
          row.checks['점검: 자리표시 문구'] = m.text.includes('자리표시 문구');
          row.checks['점검: 앞 단계 명단으로 채울 수 있다'] = m.text.includes('앞 단계 명단으로 채울 수 있습니다');
          row.checks['완료 체크 없음(할 일 상세로)'] = m.text.includes('할 일 상세 · 완료');
          row.checks['일회성은 «순서 없는 할 일»로 따로'] = m.text.includes('순서 없는 할 일 · 2개') && !m.text.includes('⑤ 단계');
        } else {
          row.checks['첫 단계 안내'] = m.text.includes('첫 단계입니다');
        }
        row.ok = Object.values(row.checks).every(Boolean);
      } catch (e) {
        row.error = String(e);
        row.errors = errors;
      }
      results.push(row);
      await context.close();
    }
  }
} finally {
  await browser.close();
}

let failed = 0;
for (const r of results) {
  console.log(`\n[${r.ok ? '통과' : '실패'}] ${r.name}`);
  if (r.error) { failed++; console.log('  오류:', r.error.slice(0, 300)); }
  for (const [k, v] of Object.entries(r.checks ?? {})) console.log(`  ${v ? '✓' : '✗'} ${k}`);
  if (r.metrics?.smallInputs?.length) console.log('  작은 입력:', r.metrics.smallInputs.join(' | '));
  if (r.metrics?.pageOverflowsX) console.log('  scrollWidth:', r.metrics.scrollWidth);
  if (r.errors?.length) console.log('  페이지 오류:', r.errors.slice(0, 4).join(' | '));
  if (!r.ok && !r.error) failed++;
}
console.log(`\n${results.length - failed}/${results.length} 통과 — 스크린샷: ${OUT}`);
if (failed) process.exit(1);
