/**
 * 구매 신청 사용 방법 — 안내 모달.
 *
 * 시연이 "어디를 누르는지" 를 맡으므로 글은 **왜 그렇게 되어 있는지와 오해하기 쉬운 것**을
 * 맡는다. 이 기능에서 가장 자주 오해되는 것은 **품목마다 상태가 따로 간다**는 점이다.
 */
import React from 'react';
import { WalkthroughDialog, type WalkthroughStep } from '@/components/walkthrough/WalkthroughDialog';
import { SceneManager, SceneRequest, SceneStatus } from './scenes';

const B: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <strong className="font-semibold text-slate-800">{children}</strong>
);

const STEPS: WalkthroughStep[] = [
  {
    id: 'request',
    label: '신청하기',
    title: '신청 페이지를 열고 품목을 적습니다',
    scene: <SceneRequest />,
    body: (
      <>
        구매 신청은 <B>담당자가 연 신청 페이지</B> 안에서 이루어집니다. 페이지마다 신청 기간과
        입력 항목(열)이 다르므로, 먼저 내가 신청할 페이지를 고릅니다.
      </>
    ),
    points: [
      <>한 신청에 <B>여러 품목</B>을 줄로 넣을 수 있습니다. 품목마다 따로 신청할 필요가 없습니다.</>,
      <>신청 기간 안에는 품목 줄의 <B>✎</B>로 그 품목만 고치거나 지울 수 있습니다. 이미 처리된 품목을 고쳐도 처리 상태는 그대로입니다.</>,
      <>구매처·링크를 적어 두면 담당자가 같은 물건을 찾는 시간이 줄어 처리가 빨라집니다.</>,
    ],
  },
  {
    id: 'status',
    label: '처리 상태',
    title: '상태는 품목마다 따로 갑니다',
    scene: <SceneStatus />,
    body: (
      <>
        가장 자주 오해하는 부분입니다. 처리 상태는 신청 1건에 하나가 아니라
        <B> 품목마다 따로</B> 붙습니다. 3개를 신청해 2개만 승인되는 일이 실제로 흔하기 때문입니다.
        신청 전체 상태는 <B>품목 상태에서 자동으로 계산</B>됩니다.
      </>
    ),
    points: [
      <>흐름은 <B>제출됨 → 검토중 → 승인 → 완료</B>이고, 중간에 <B>불가</B>가 될 수 있습니다.</>,
      <>불가에는 <B>사유</B>가 함께 붙습니다. 품목마다 사유가 다를 수 있습니다.</>,
      <>승인됐지만 아직 구매하지 않은 품목이 남아 있으면 신청은 <B>&lsquo;완료&rsquo;가 되지 않습니다</B> — 승인은 &ldquo;사도 된다&rdquo;, 완료는 &ldquo;샀다&rdquo;입니다.</>,
    ],
  },
  {
    id: 'manager',
    label: '담당자',
    title: '담당자는 품목만 골라 처리합니다',
    scene: <SceneManager />,
    body: (
      <>
        담당자(페이지 작성자와 공동 작업자)는 <B>① 신청 검토</B>에서 필요한 품목만 골라 한 번에
        상태를 바꿉니다. 처음 열면 <B>처리 대기</B> 품목만 보이고, 탭의 숫자가 남은 일의 수입니다.
      </>
    ),
    points: [
      <>상태를 바꿀 때 <B>사유</B>를 함께 적으면 신청자 화면에 그대로 보입니다.</>,
      <>평소 흐름은 승인 → <B>품의 차수에 올리기</B> → <B>② 품의·구매</B>에서 단가·수량을 정리하고 공문을 만드는 것입니다. 품의 없이 바로 공문이 필요하면 선택 바의 <B>⋯</B>에 있습니다.</>,
      <>공문에는 <B>구매 목적·근거·붙임</B>만 넣습니다. 제목·수신·결재란·예산 과목은 문서관리시스템 양식이 채우므로 여기서 받지 않습니다.</>,
      <>품목 표는 본문이 아니라 <B>붙임</B>으로 나갑니다.</>,
      <>새 신청이 들어오면 담당자에게 <B>알림</B>이 갑니다.</>,
    ],
  },
];

export const PurchaseGuideDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => (
  <WalkthroughDialog
    open={open}
    onOpenChange={onOpenChange}
    title="구매 신청 사용 방법"
    description="품목을 신청하고, 처리 상태를 확인하고, 담당자가 승인하기까지 3단계"
    steps={STEPS}
  />
);

export default PurchaseGuideDialog;
