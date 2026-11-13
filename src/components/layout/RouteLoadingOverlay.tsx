import { Loader2 } from 'lucide-react';

/**
 * 라우트 lazy 청크를 내려받는 동안 메인 패널 안에 머무는 로딩 표시.
 *
 * 이 저장소는 페이지 컴포넌트가 저마다 자기 <Layout>을 들고 있어서, Suspense
 * fallback 시점에는 사이드바·헤더가 아직 존재하지 않는다. 그래서 fallback을 그냥
 * 두면 글자 한 줄이 빈 화면 전체를 차지한다. fallback을 <Layout>으로 감싸 뼈대를
 * 먼저 세우고, 이 컴포넌트가 main 영역만 덮는다.
 *
 * relative 래퍼를 자기가 들고 있는 이유: Layout의 <main>은 position:static이라
 * 바깥에서 absolute 기준을 잡을 수 없는데, main에 relative를 주면 전 페이지에
 * stacking context가 새로 생긴다. 기준 상자를 여기서 닫으면 Layout은 그대로 둔다.
 *
 * 색은 기능색이 아니라 중립(slate)이다 — 아직 어느 페이지인지 그려지기 전이라
 * 특정 기능의 팔레트를 입히면 잘못된 화면을 예고하게 된다.
 */
export const RouteLoadingOverlay = ({ label }: { label: string }) => (
  <div className="relative min-h-[60vh]">
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 grid place-items-center bg-white/40 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" aria-hidden />
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
    </div>
  </div>
);
