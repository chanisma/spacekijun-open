/**
 * 업무 관리 사용 방법 — **탭마다 안내가 따로다**(2026-09-04 사용자 지시).
 *
 * [사용 방법]은 **지금 보고 있는 탭의 안내**를 연다. 한 모달에 네 탭을 몰아넣으면
 * 지금 쓰지도 않는 탭의 단계를 넘겨 가며 봐야 하고, 정작 그 탭에서 알아야 할 것은
 * 한 단계로 압축돼 빠진다 — 업무 관리는 탭 하나하나가 사실상 다른 기능이다.
 *
 * 타임라인만 2단계인 것은 **억지로 늘리지 않았기 때문**이다(3~4단계는 상한이지 하한이 아니다).
 */
import React from 'react';
import { WalkthroughDialog, type WalkthroughStep } from '@/components/walkthrough/WalkthroughDialog';
import { SceneFind, SceneProgress } from './myWorksScenes';
import { SceneInbox, SceneKinds, ScenePlanner } from './myTasksScenes';
import type { TaskTabValue } from '@/lib/taskTabs';
import { SceneAssign, SceneCreate, SceneManage } from './workScenes';
import { SceneDraw, SceneRun, SceneWork } from './workflowScenes';
import { SceneDeadlines, SceneGantt } from './timelineScenes';
import { SceneAxes, SceneDrill, SceneEmpty } from './mapScenes';

const B: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <strong className="font-semibold text-slate-800">{children}</strong>
);

/** 업무 관리의 보기 값(`@/lib/taskTabs` TASK_TABS)과 같은 문자열 */
/** 업무 관리의 보기(페이지 + 업무 목록 범위 둘) + 별도 화면인 내 할 일(`/my-tasks`) — 안내는 화면마다 따로다 */
export type TaskGuideTab = TaskTabValue | 'myTasks';

interface Guide {
  title: string;
  description: string;
  steps: WalkthroughStep[];
}

const MY_WORKS: Guide = {
  title: '업무 목록 사용 방법 — 내가 책임자인 업무',
  description: '내가 책임자인 업무의 진행을 살피고 관리합니다',
  steps: [
    {
      id: 'find',
      label: '살피기',
      title: '카드를 펼쳐 업무의 할 일을 봅니다',
      scene: <SceneFind />,
      body: (
        <>
          여기에는 <B>내가 책임자인 업무</B>만 보입니다. 할 일은 업무(묶음) 안에 들어 있고,
          카드는 <B>접힌 상태가 기본</B>이라 펼쳐야 세부 할 일이 나옵니다.
        </>
      ),
      points: [
        <>담당자로 배정만 된 업무는 여기 없습니다 — 그 일은 <B>내 할 일</B> 메뉴에서 수행합니다.</>,
        <>목록 맨 위 바에 <B>업무 N개 · 할 일 M개</B>와 <B>[모두 펼치기]</B>가 있습니다. 펼친 상태는 <B>다음에 와도 그대로</B>예요.</>,
        <>필터는 <B>업무의 상태</B>를 거릅니다(기본 <B>진행 중</B>). 업무를 펼치면 그 업무의 할 일이 <B>전부</B> 나옵니다.</>,
        <>카드 헤더의 <B>[진행 중] [완료]</B>로 업무 상태를 바꿉니다. 아직 담당자에게 보일 필요가 없는 할 일은 할 일 편집 창의 <B>담당자에게 보이는 날</B>을 정해 두면 그날 저절로 나타납니다.</>,
        <>할 일 표 맨 앞 <B>순서</B> 칸은 순서가 있는 할 일(절차형)의 차례입니다 — 순서가 없으면 점으로 표시돼요.</>,
      ],
    },
    {
      id: 'progress',
      label: '진행 확인',
      title: '담당자 칩으로 누가 끝냈는지 봅니다',
      scene: <SceneProgress />,
      body: (
        <>
          할 일 표의 <B>담당자 칩</B>을 누르면 전체 명단이 열립니다. 책임자는
          <B> 누구의 상태든</B> 완료·대기로 바꿀 수 있습니다 — 구두로 끝났다고 들은 일을 대신 정리할 때 씁니다.
        </>
      ),
      points: [
        <>할 일 이름 왼쪽 <B>동그라미는 표시</B>입니다(누르는 것이 아닙니다). 담당자 <B>전원이 끝나야</B> 초록 체크가 됩니다.</>,
        <><B>제출 받는 할 일</B>은 렌치(연결된 작업)의 <B>제출 받기</B>를 열면 누가 냈는지 봅니다.</>,
        <><B>다중 마감</B>은 회차별로, <B>과제 단위</B>는 단위별로 누가 맡아 끝냈는지 보입니다.</>,
        <>할 일을 <B>완료로 닫으면</B> 아직 내지 않은 담당자의 목록에서도 끝난 것으로 빠집니다 — 끝난 일이 기한 초과로 남지 않도록.</>,
        <>할 일 <B>제목을 누르면 상세</B>가, <B>연필 아이콘</B>은 편집 창이 바로 열립니다. 완료·제출은 <B>내 할 일</B> 메뉴에서 합니다.</>,
      ],
    },
  ],
};

const MY_TASKS: Guide = {
  title: '내 할 일 사용 방법',
  description: '내게 배정된 할 일을 확인하고 바로 수행합니다',
  steps: [
    {
      id: 'inbox',
      label: '확인·완료',
      title: '마감순으로 보고, 행의 버튼으로 끝냅니다',
      scene: <SceneInbox />,
      body: (
        <>
          업무를 펼칠 필요 없이 <B>내가 담당인 할 일만</B> 나옵니다. 마감이 지난 것, 오늘까지인 것,
          다가오는 것 순서이고 <B>행 오른쪽 버튼 하나가 곧 수행</B>입니다 — 완료·제출은 이 화면에서만 합니다.
        </>
      ),
      points: [
        <>필터 <B>할 일</B>은 지금 해야 하는 것, <B>완료</B>는 끝낸 것입니다. 취소된 일은 <B>전체</B>에서 보입니다. 책임자가 <B>보이는 날</B>을 정해 둔 할 일은 그날이 되어야 나타납니다.</>,
        <><B>완료하기</B>로 바뀌는 것은 <B>내 상태뿐</B>입니다. 다른 담당자와 할 일 전체 상태는 그대로예요. 잘못 눌렀으면 <B>완료 취소</B>.</>,
        <>행에는 제목과 마감만 있습니다. <B>제목을 누르면</B> 설명·첨부·담당 현황이 열립니다.</>,
        <><B>내 일이 아닌 것 같으면</B> 상세의 <B>제 담당 할 일이 아닙니다</B>로 사유를 남기세요. 그 할 일은 <B>홈 대시보드에서 사라지고</B> 여기에는 <B>담당자 아님 표시함</B>과 함께 남습니다 — 책임자가 담당자를 고치면 빠집니다.</>,
        <>책임자가 할 일을 <B>완료로 닫으면</B> 내가 아직 하지 않았어도 끝난 것으로 봅니다 — 끝난 일이 기한 초과로 남지 않도록.</>,
      ],
    },
    {
      id: 'kinds',
      label: '제출·회차',
      title: '할 일에 따라 버튼이 달라집니다',
      scene: <SceneKinds />,
      body: (
        <>
          모든 할 일이 <B>완료하기</B> 한 번으로 끝나지는 않습니다. <B>제출을 받는 할 일</B>,
          <B> 마감이 여러 번인 할 일</B>, <B>과제 단위로 나눈 할 일</B>은 행의 버튼이 바뀝니다.
        </>
      ),
      points: [
        <><B>제출하기</B> — 제출을 받는 할 일은 완료하기 대신 이 버튼이 나옵니다. 내야 할 것을 <B>다 내면 저절로 완료</B>됩니다. 실물로 내는 것은 <B>제출 안내 보기</B>에서 방법을 보고, 책임자가 받았다고 체크하면 완료됩니다.</>,
        <><B>회차별 완료</B> — 회차마다 따로 끝내고 <B>전부 끝나야</B> 내가 완료됩니다. 회차가 추가되면 완료였던 사람도 다시 미완료가 됩니다.</>,
        <><B>과제 선택·완료</B> — 사람이 아니라 &ldquo;과목별 계획서&rdquo; 같은 항목에 배분됩니다. 아직 아무도 안 맡은 단위를 <B>직접 골라</B> 수행합니다.</>,
        <>남이 맡은 단위는 <B>개수만</B> 보입니다. 담당자 이름은 책임자에게만 보여요.</>,
      ],
    },
    {
      id: 'planner',
      label: '계획표',
      title: '계획표로 한 주의 마감을 봅니다',
      scene: <ScenePlanner />,
      body: (
        <>
          헤더의 <B>계획표 열기</B>로 옆에 주간 표를 엽니다. 목록이 &ldquo;무엇을 먼저&rdquo;라면
          계획표는 <B>&ldquo;이번 주가 얼마나 빡빡한가&rdquo;</B>를 보는 자리입니다.
        </>
      ),
      points: [
        <>계획표에는 <B>내가 책임자인 업무의 할 일도</B> 함께 나옵니다(<B>관리 ·</B> 표시). 목록에는 없고 계획표에만 있어요.</>,
        <>관리 할 일은 <B>다른 담당자가 미완료면</B> 내가 끝냈어도 남고, 회차가 여러 번이면 <B>남은 회차마다</B> 표시됩니다.</>,
        <>화살표로 주를 옮기고 <B>오늘</B>로 돌아옵니다. 마감일이 없는 할 일은 표 아래 <B>마감일 미정</B>에 모입니다.</>,
        <>열고 닫은 상태는 <B>다음에 와도 그대로</B>입니다. 업무 전체 현황과 담당자 관리는 <B>업무 관리 → 업무 목록</B>에서 합니다.</>,
      ],
    },
  ],
};

const EVENTS: Guide = {
  title: '업무 목록 사용 방법 — 전체 업무',
  description: '할 일 묶음을 만들고, 담당자를 붙이고, 진행을 보기까지 3단계',
  steps: [
    {
      id: 'create',
      label: '만들기',
      title: '할 일을 담을 묶음을 만듭니다',
      scene: <SceneCreate />,
      body: (
        <>
          <B>업무</B>는 할 일을 담는 묶음입니다(예: &ldquo;2학기 평가계획 제출&rdquo;).
          여기서 만든 업무 안에 세부 할 일을 넣고 담당자를 지정하면, 그 사람들의
          <B> 내 할 일</B> 메뉴에 나타납니다.
        </>
      ),
      points: [
        <>만든 사람이 <B>책임자</B>가 됩니다 — 모든 담당자의 상태를 바꿀 수 있고, 담당자 명단도 책임자에게만 보입니다.</>,
        <><B>부서</B>를 지정하면 그 부서 사람들이 목록·타임라인에서 함께 봅니다.</>,
        <>기간은 나중에 바꿀 수 있습니다. 세부 할 일마다 <B>따로 마감</B>을 둘 수도 있습니다.</>,
      ],
    },
    {
      id: 'assign',
      label: '담당자',
      title: '세부 할 일을 넣고 사람을 붙입니다',
      scene: <SceneAssign />,
      body: (
        <>
          담당자를 <B>한 명씩 찾지 않아도 됩니다</B>. 태그·학년·반으로 묶어서 넣거나,
          엑셀·시트에서 복사한 명단을 그대로 붙여 넣을 수 있습니다.
        </>
      ),
      points: [
        <><B>태그·학년·반</B>을 고르면 그 구성원이 한 번에 들어갑니다. 누가 들어가는지 이름이 미리 보입니다.</>,
        <><B>Ctrl+V 붙여넣기</B> — 학번+이름이나 이름만 있는 목록을 그대로 붙입니다. 이름이 안 맞는 줄은 따로 표시돼 고칠 수 있습니다.</>,
        <>마감이 여러 번이면 <B>날짜를 여러 개</B> 넣습니다 — 담당자는 회차마다 따로 완료합니다.</>,
        <>서류를 나눠 맡는 일은 <B>과제 단위</B>로 배분합니다(과목별·학급별 프리셋 있음).</>,
      ],
    },
    {
      id: 'manage',
      label: '진행 보기',
      title: '부서·상태로 좁혀 진행을 봅니다',
      scene: <SceneManage />,
      body: (
        <>
          업무가 <B>한 줄에 하나씩</B> 늘어섭니다(내가 책임자인 업무와 같은 모양). 부서·상태·담당자로 좁히고,
          펼쳐서 세부 할 일 표를 봅니다. <B>업무·할 일 이름을 누르면</B> 상세가 열립니다.
        </>
      ),
      points: [
        <>남의 업무도 보이는 곳이라 담당자는 <B>명단이 아니라 인원 수</B>만 나옵니다. 내가 책임자인 업무는 <B>마감일·순서·수정</B>을 여기서도 바로 고칠 수 있고, 담당자 상태는 <B>내가 책임자인 업무</B>에서 바꿉니다.</>,
        <>진행률은 <B>세부 할 일의 완료 비율</B>입니다.</>,
        <>검색은 <B>업무명·할 일·담당자·키워드</B>를 함께 훑습니다.</>,
      ],
    },
  ],
};

const WORKFLOW: Guide = {
  title: '업무 흐름 사용 방법',
  description: '순서를 그리고, 도구를 붙이고, 실행해 이력을 남기기까지 3단계',
  steps: [
    {
      id: 'draw',
      label: '흐름 그리기',
      title: '단계를 노드와 화살표로 그립니다',
      scene: <SceneDraw />,
      body: (
        <>
          여러 단계를 거치는 일(계획 → 작성 → 검토 → 결재)을 캔버스에 그려 둡니다.
          매번 &ldquo;다음에 뭘 해야 하지&rdquo;를 기억하지 않아도 되고, <B>처음 맡는 사람도 순서를 봅니다</B>.
        </>
      ),
      points: [
        <>흐름은 <B>부서 단위</B>로 관리됩니다. 위쪽 부서 선택으로 바꿔 봅니다.</>,
        <><B>캔버스 변경은 자동 저장되지 않습니다</B> — 저장하지 않고 다른 페이지로 가거나 부서를 옮기면 확인을 묻습니다.</>,
        <>업무·할 일과 달리 흐름은 <B>&ldquo;이렇게 하는 것&rdquo;을 적어 두는 틀</B>입니다. 실제 담당자 배정은 업무에서 합니다.</>,
      ],
    },
    {
      id: 'work',
      label: '도구 붙이기',
      title: '노드에 작업을 붙입니다',
      scene: <SceneWork />,
      body: (
        <>
          노드에 <B>작업</B>을 붙이면 문서 생성·HWPX 작성 같은 도구를
          <B> 흐름 안에서 바로 실행</B>합니다. 다른 메뉴로 찾아가지 않아도 됩니다.
        </>
      ),
      points: [
        <>쓸 수 있는 도구는 <B>미리 정해져 있습니다</B> — 아무 기능이나 붙일 수는 없습니다.</>,
        <>문서 생성 방식을 붙이면 <B>담당자가 각자 자기 문서</B>를 만듭니다(남의 문서를 보는 것이 아닙니다).</>,
        <>비공개인 생성 방식을 붙이면 <B>담당자에게 보이지 않습니다</B> — 공유가 목적이면 공개로 바꾸세요.</>,
      ],
    },
    {
      id: 'run',
      label: '실행·이력',
      title: '실행하면 결과가 이력으로 남습니다',
      scene: <SceneRun />,
      body: (
        <>
          노드에서 <B>[실행]</B>을 누르면 그 도구가 열리고, 만든 결과가
          <B> 실행·검수 이력</B>에 쌓입니다. 누가 언제 무엇을 만들었는지 추적됩니다.
        </>
      ),
      points: [
        <>실행은 곧바로 완료가 아니라 <B>&lsquo;검수 대기&rsquo;</B>로 기록됩니다 — 만든 것과 확인한 것을 갈라 두기 위해서입니다.</>,
        <>이력에서 <B>이어서 진행</B>하면 그때 값 그대로 다시 만들 수 있습니다.</>,
        <>이력에는 <B>내가 실행한 것만</B> 보입니다.</>,
      ],
    },
  ],
};

const TIMELINE: Guide = {
  title: '타임라인 사용 방법',
  description: '마감이 언제 몰리는지 보고, 회차별 마감을 읽기까지 2단계',
  steps: [
    {
      id: 'gantt',
      label: '겹치는 때',
      title: '언제 일이 몰리는지 봅니다',
      scene: <SceneGantt />,
      body: (
        <>
          업무를 가로 막대로 늘어놓아 <B>겹치는 구간</B>을 봅니다. 새 할 일의 마감을
          정하거나, 이미 몰려 있는 주를 피할 때 쓰는 화면입니다.
        </>
      ),
      points: [
        <><B>학기 범위만 보기</B>를 켜면 학년도 전체 대신 학기 기간만 확대합니다(학사력에 기간이 설정돼 있을 때).</>,
        <>현재 학기가 아닌 구간은 <B>어둡게</B> 깔립니다.</>,
        <>막대를 누르면 그 <B>업무 상세</B>로 갑니다.</>,
        <>부서를 바꾸면 그 부서의 업무만 남습니다.</>,
      ],
    },
    {
      id: 'deadlines',
      label: '회차 마감',
      title: '마감이 여러 번인 할 일은 점으로 놓입니다',
      scene: <SceneDeadlines />,
      body: (
        <>
          시험 출제처럼 <B>같은 일을 여러 번</B> 하는 할 일은 한 덩어리로 두면
          언제 내야 하는지가 사라집니다. 그래서 <B>회차마다 점</B>으로 따로 놓습니다.
        </>
      ),
      points: [
        <>회차는 <B>각각 따로 완료</B>하고, <B>전부 끝나야</B> 그 사람이 완료됩니다.</>,
        <><B>이미 끝낸 회차는 빠집니다</B> — 남아 있으면 앞으로 할 일처럼 보이기 때문입니다.</>,
        <>회차가 추가되면 <B>완료였던 사람도 다시 미완료</B>가 됩니다.</>,
      ],
    },
  ],
};

/**
 * 세 단계 중 한 단계를 통째로 **빈 칸의 뜻**에 쓴다 — 이 화면에서 가장 비싼 오해가
 * "숫자를 업무량으로 읽는 것"이기 때문이다(사용자: "이 자료를 가지고 업무의 양을
 * 파악하는건 불가능함").
 */
const MAP: Guide = {
  title: '학교 전체 사용 방법',
  description: '업무분장 자리로 학교의 업무를 조망합니다 — 축을 고르고, 빈 칸을 읽고, 칸을 여는 3단계',
  steps: [
    {
      id: 'axes',
      label: '축 고르기',
      title: '행·열·값을 골라 각도를 바꿉니다',
      scene: <SceneAxes />,
      body: (
        <>
          같은 자료를 <B>행(무엇을 기준으로)</B> · <B>열(어떻게 나눠서)</B> ·
          <B> 값(무엇을 세서)</B> 세 가지로 조합해 봅니다. 기본은
          <B> 업무분장 × 월 × 올라온 할 일</B>입니다.
        </>
      ),
      points: [
        <>행이 <B>사람이 아니라 자리</B>인 것은 일부러입니다 — 개인별 업무량 비교표가 되지 않도록, 그리고 담당자가 바뀌어도 같은 행에서 비교되도록.</>,
        <>한 사람이 자리를 둘 맡고 있으면 <B>업무의 부서와 같은 자리</B>로 갑니다. <B>반씩 나눠 세지 않습니다</B> — 나누면 합계가 실제보다 커집니다.</>,
        <>값을 <B>기한 초과</B>로 바꾸면 같은 격자가 <B>밀린 일이 쌓인 자리</B>를 붉게 보여 줍니다. <B>완료율</B>도 같은 방식입니다.</>,
        <>월 축의 <B>「기한 없음」 열은 항상 있습니다</B> — 마감 없는 할 일이 어느 칸에도 안 들어가면 합계가 조용히 안 맞습니다.</>,
        <><B>[진행 중만]</B>을 끄면 끝난 업무까지 셉니다. 지난 학년도를 돌아볼 때 씁니다.</>,
      ],
    },
    {
      id: 'empty',
      label: '빈 칸 읽기',
      title: '빈 칸은 「아직 올라오지 않았다」입니다',
      scene: <SceneEmpty />,
      body: (
        <>
          <B>이 화면은 업무량을 재지 않습니다.</B> 학교의 모든 일이 이 시스템에 올라와 있지
          않기 때문에, 여기 숫자는 «학교가 하는 일»이 아니라 <B>«시스템에 올라온 일»</B>입니다.
        </>
      ),
      points: [
        <>그래서 값 이름이 <B>「올라온 할 일」</B>이고, 머리글이 그 사실을 늘 적어 둡니다.</>,
        <>업무가 하나도 없는 자리도 <B>행으로 남겨 둡니다</B> — 빈 줄을 지우면 "전부 올라와 있다"로 보입니다.</>,
        <>맨 오른쪽 <B>「후보」</B>가 그 빈 줄이 무엇으로 비었는지 말해 줍니다 — <B>공문 분석</B>(3~9월 접수·생산 공문)이 그 자리의 일이라고 본 것입니다.</>,
        <>후보는 <B>업무가 아닙니다</B> — 합계에 들어가지 않습니다. 숫자를 누르면 목록이 열리고 거기서 <B>고치거나 지웁니다</B>.</>,
        <>머리글의 <B>「분장 자리 N개 중 M개」</B>가 이 지도가 답할 수 있는 <B>유일한 «전체» 이야기</B>입니다.</>,
        <>그러니 <B>칸이 적다고 일을 적게 한다는 뜻이 아닙니다.</B> 자리 사이의 숫자를 견주는 용도로 쓰지 마세요.</>,
      ],
    },
    {
      id: 'drill',
      label: '칸 열기',
      title: '칸을 누르면 그 칸의 업무가 열립니다',
      scene: <SceneDrill />,
      body: (
        <>
          숫자만 보고 끝나면 <B>무엇이 몰려 있는지</B>를 알 수 없습니다. 칸을 누르면
          그 칸에 든 업무와 할 일이 <B>창으로</B> 열립니다 — 표를 스크롤하지 않아도 됩니다.
        </>
      ),
      points: [
        <>빈 칸(<B>·</B>)은 눌리지 않습니다.</>,
        <><B>그 칸에 든 할 일만</B> 나옵니다 — 9월 칸을 눌렀는데 11월 할 일이 섞이면 격자의 숫자를 믿을 수 없게 되니까요.</>,
        <>업무 수와 할 일 수가 함께 나옵니다 — <B>업무 하나에 할 일이 여럿</B>이라 두 숫자는 다릅니다.</>,
        <>고칠 것이 있으면 <B>업무 목록</B>으로, 내가 수행할 일이면 <B>내 할 일</B> 메뉴로 갑니다. 여기는 <B>보는 화면</B>입니다.</>,
      ],
    },
  ],
};

// 공문 판단함 1단계 (2026-10-30) — 읽기만. 결정 남기기는 2단계에서 안내를 늘린다
const SceneDocs: React.FC = () => (
  <div className="space-y-2 p-4 text-xs">
    {[
      ['처리 필요', 'bg-blue-50 text-blue-700', '[긴급] 자료 제출 요청', 'D-5'],
      ['판단 대기', 'bg-slate-100 text-slate-600', '연수 참가 안내', ''],
    ].map(([state, tone, title, due]) => (
      <div key={title} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
        <span className={`rounded px-1.5 py-0.5 font-medium ${tone}`}>{state}</span>
        {due && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">{due}</span>}
        <span className="truncate text-slate-800">{title}</span>
      </div>
    ))}
    <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-amber-900">이 공문은 정보부 일인가요, 교무부 일인가요?</div>
  </div>
);

const DOCS: Guide = {
  title: '공문 판단함 사용 방법',
  description: '새로 접수된 공문을 AI 가 먼저 읽고, 판단에 필요한 근거와 질문을 보여 줍니다',
  steps: [
    {
      id: 'read',
      label: '판정 읽기',
      title: 'AI 판정은 «초안»입니다',
      scene: <SceneDocs />,
      body: (
        <>
          학교 서버 PC 가 매일 아침 에듀파인 문서등록대장의 새 접수 공문을 모아 <B>1차 판정</B>을 붙여 올립니다.
          틀리는 이유는 대개 공문을 못 읽어서가 아니라 <B>분장·용어가 모호해서</B>입니다 — 그래서 판정마다 <B>불확실한 점과 물을 질문</B>을 함께 적습니다.
        </>
      ),
      points: [
        <>행을 누르면 업무 후보·담당 후보·기한·본문이 펼쳐집니다.</>,
        <>개인정보가 의심되는 공문은 <B>본문을 저장하지 않습니다</B>(제목만).</>,
        <>지금은 <B>관리자만</B> 봅니다. 결정 남기기와 업무 연결은 다음 단계입니다.</>,
      ],
    },
  ],
};

// 예산 (2026-11-10) — 카드 올리기 · 계획 · 추경. 시연 숫자는 2026 추경 실례를 줄인 것
const SceneBudgetBar: React.FC = () => (
  <div className="space-y-2 p-4 text-xs">
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <span className="rounded border border-violet-200 bg-violet-50 px-1 text-[10px] text-violet-700">목적</span>
        <span className="font-medium text-slate-800">AI 중점학교 운영비</span>
        <span className="ml-auto tabular-nums text-slate-700">50,000,000</span>
      </div>
      <div className="relative mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="w-[64%] bg-blue-600" /><div className="w-[29%] bg-blue-300" /><div className="w-[7%] bg-slate-200" />
      </div>
      <div className="mt-1.5 flex gap-2 text-[10px] text-slate-500">
        <span>원인행위 64%</span><span className="text-blue-700">남은 계획 29%</span><span>미배정 7%</span>
        <span className="ml-auto rounded-full bg-amber-50 px-1.5 text-amber-800">110일 뒤 반납</span>
      </div>
    </div>
  </div>
);

const SceneBudgetPlan: React.FC = () => (
  <div className="space-y-1.5 p-4 text-xs">
    <div className="flex items-center rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <span className="font-medium text-slate-800">AI/SW 융합 동아리</span>
      <span className="ml-auto tabular-nums text-slate-500">미배정 636,940</span>
    </div>
    {[
      ['12월', '동아리 재료 구입', '1,120,000', '품의 중', 'bg-blue-50 text-blue-700'],
      ['1월', '성과 발표회 간식', '880,000', '계획', 'bg-slate-100 text-slate-600'],
    ].map(([m, t, a, s, tone]) => (
      <div key={t} className="ml-4 flex items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1">
        <span className="w-8 text-slate-500">{m}</span><span className="truncate text-slate-700">{t}</span>
        <span className="ml-auto tabular-nums">{a}</span><span className={`rounded px-1 ${tone}`}>{s}</span>
      </div>
    ))}
  </div>
);

const SceneBudgetRevision: React.FC = () => (
  <div className="space-y-1.5 p-4 text-xs">
    {[
      ['IT기업 탐방', '6,000,000', '4,000,000', '−2,000,000', 'text-rose-600'],
      ['협의회비 (마감)', '1,500,000', '149,200', '−1,350,800', 'text-rose-600'],
      ['피지컬 컴퓨팅 (신설)', '—', '2,023,180', '+2,023,180', 'text-blue-700'],
    ].map(([n, b, a, d, tone]) => (
      <div key={n} className="grid grid-cols-[1fr_auto_auto] gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 tabular-nums">
        <span className="truncate text-slate-800">{n}</span><span className="text-slate-500">{b} → {a}</span><span className={tone}>{d}</span>
      </div>
    ))}
    <div className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-800">✓ 사업 총액 일치 — 확정하면 차수가 잠깁니다</div>
  </div>
);

const BUDGET: Guide = {
  title: '예산 사용 방법',
  description: '에듀파인이 «이미 쓴 돈»을 기록한다면, 여기는 «앞으로 쓸 돈»을 계획합니다',
  steps: [
    {
      id: 'card',
      label: '카드 올리기',
      title: '숫자는 사업관리카드에서 옵니다',
      scene: <SceneBudgetBar />,
      body: (
        <>
          에듀파인 «사업관리카드(예산)»를 엑셀로 받아 올리면 사업·산출내역과 <B>예산현액·품의·원인행위</B>가 들어옵니다.
          다시 올리면 바뀐 숫자만 고쳐지고, 계획은 그대로 남습니다.
        </>
      ),
      points: [
        <>«쓴 돈»은 <B>원인행위</B> 기준입니다. 품의만 된 돈은 «결재 대기»로 따로 보입니다.</>,
        <>막대의 세로 눈금은 오늘의 회계연도 진도입니다 — 집행이 눈금보다 한참 뒤면 늦은 것입니다.</>,
      ],
    },
    {
      id: 'plan',
      label: '계획 적기',
      title: '남은 돈마다 «무엇에·언제·얼마»',
      scene: <SceneBudgetPlan />,
      body: (
        <>
          산출내역을 펼쳐 계획 항목을 적습니다. 계획에 넣지 않은 돈은 <B>미배정</B>으로 남아, 목적사업이면 2월 말에 반납될 돈으로 보입니다.
        </>
      ),
      points: [
        <>더 쓸 계획이 없는 줄은 <B>마감</B>하세요 — 추경 때 원인행위만 남기고 줄이는 후보가 됩니다.</>,
        <>지난 달인데 아직 «계획»인 항목, 회계연도 밖 계획은 일정 탭에서 경고합니다.</>,
      ],
    },
    {
      id: 'revision',
      label: '추경',
      title: '초안에서 맞춰 보고 확정',
      scene: <SceneBudgetRevision />,
      body: (
        <>
          추경 초안의 <B>[제안대로 채우기]</B>는 줄마다 «원인행위 + 남은 계획»을 넣고, 남는 돈을 고른 줄에 더합니다. 목적사업은 사업 총액이 같은지 검사합니다.
        </>
      ),
      points: [
        <>원인행위보다 작게는 줄일 수 없고, 품의액보다 작아지면 경고합니다.</>,
        <>확정은 되돌릴 수 없습니다. 에듀파인 입력은 따로 해야 하고, 다음 카드를 올리면 서로 맞는지 보입니다.</>,
      ],
    },
  ],
};

const GUIDES: Record<TaskGuideTab, Guide> = {
  budget: BUDGET,
  docs: DOCS,
  map: MAP,
  myTasks: MY_TASKS,
  myWorks: MY_WORKS,
  works: EVENTS,
  workflow: WORKFLOW,
  timeline: TIMELINE,
};

export const TaskGuideDialog: React.FC<{
  /** 지금 보고 있는 화면(보기) — 그 화면의 안내를 연다 */
  tab: TaskGuideTab;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ tab, open, onOpenChange }) => {
  const guide = GUIDES[tab] ?? MY_TASKS;
  return (
    <WalkthroughDialog
      // 탭이 바뀌면 다른 안내다 — 단계 색인이 남아 있으면 안 된다
      key={tab}
      open={open}
      onOpenChange={onOpenChange}
      title={guide.title}
      description={guide.description}
      steps={guide.steps}
    />
  );
};

export default TaskGuideDialog;
