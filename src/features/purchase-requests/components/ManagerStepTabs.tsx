import { useMemo } from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserRound } from 'lucide-react';
import { PurchaseRequestPageWithRelations } from '../types';
import { usePurchaseRequests } from '../hooks/usePurchaseRequests';
import { usePurchaseOrderData } from '../hooks/usePurchaseOrders';
import { liveLinks } from '../utils/purchaseOrder';
import { managerStepCounts } from '../utils/managerSteps';

export type ManagerTab = 'manage' | 'order' | 'mine';

/**
 * 매니저 단계 탭 (2026-10-13 화면 개편).
 *
 * 종전 `[신청 관리 | 품의 정리 | 내 신청]` 은 세 화면이 같은 무게로 나란히 있어 무엇을 먼저 하는지가
 * 드러나지 않았다. 실제 일은 순서가 있다 — 신청을 보고 결정하고(①), 승인한 것을 품의로 묶어 산다(②).
 * 그래서 번호를 붙이고 각 단계에 **남은 일 수**를 단다. 남은 일이 없으면 숫자를 감춘다(0 배지는
 * "확인할 게 있다"처럼 보인다).
 *
 * 탭 값(`manage`·`order`·`mine`)은 그대로다 — 딥링크 `?tab=order`·`?tab=mine` 가 이 값을 쓴다.
 * 데이터는 두 탭 본문과 **같은 쿼리 키**라 추가 요청이 생기지 않는다.
 */
export function ManagerStepTabs({
  page,
  showMine,
}: {
  page: PurchaseRequestPageWithRelations;
  showMine: boolean;
}) {
  const { data: requests = [] } = usePurchaseRequests(page.id);
  const { data: orderData } = usePurchaseOrderData(page.id);
  const counts = useMemo(
    () => managerStepCounts(requests, page.columns, liveLinks(orderData?.links ?? [], requests)),
    [requests, page.columns, orderData?.links],
  );

  return (
    <TabsList className="h-auto w-full justify-start gap-1 bg-slate-100/80 p-1 sm:w-auto">
      <StepTrigger value="manage" step={1} label="신청 검토" count={counts.reviewOpen} countLabel="처리 대기" />
      <StepTrigger
        value="order"
        step={2}
        label="품의·구매"
        count={counts.orderUnlinked}
        countLabel="품의에 안 담긴 품목"
      />
      {showMine && (
        <TabsTrigger value="mine" className="ml-auto gap-1.5 sm:ml-2">
          <UserRound className="h-3.5 w-3.5" /> 내 신청
        </TabsTrigger>
      )}
    </TabsList>
  );
}

function StepTrigger({
  value,
  step,
  label,
  count,
  countLabel,
}: {
  value: ManagerTab;
  step: number;
  label: string;
  count: number;
  countLabel: string;
}) {
  return (
    <TabsTrigger value={value} className="group gap-1.5 px-2.5 sm:px-3">
      <span
        aria-hidden
        className="grid h-4 w-4 place-items-center rounded-full bg-slate-300 text-[10px] font-semibold text-white group-data-[state=active]:bg-blue-600"
      >
        {step}
      </span>
      {label}
      {count > 0 && (
        <span
          className="ml-0.5 rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold leading-4 text-amber-800"
          title={`${countLabel} ${count}개`}
          aria-label={`${countLabel} ${count}개`}
        >
          {count}
        </span>
      )}
    </TabsTrigger>
  );
}
