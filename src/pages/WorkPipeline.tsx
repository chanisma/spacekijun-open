// ========================================
// /tasks/works/:workId — 업무 진행의 옛 주소 (2026-09-27)
//
// 업무 진행은 같은 날 페이지 → 모달(`WorkPipelineDialog`)로 바뀌었다. 주소로 들어오는 길은
// 남겨 두되 업무 관리 화면으로 보내 거기서 모달을 연다(`?pipeline=<업무>&pipelineTask=<할 일>`).
// 모달의 딥링크 파라미터는 `TaskManagement` 가 한 번 소비하고 지운다 — 남겨 두면 닫자마자 다시 열린다.
// ========================================

import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { workPipelineHref } from '@/lib/workPipelineLink';

export default function WorkPipelineRedirect() {
  const { workId = '' } = useParams();
  const [searchParams] = useSearchParams();
  return <Navigate to={workPipelineHref(workId, searchParams.get('task'))} replace />;
}
