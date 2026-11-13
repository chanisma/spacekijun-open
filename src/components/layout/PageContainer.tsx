// ========================================
// 페이지 콘텐츠 컨테이너 — 화면 가로 폭 규약의 단일 출처 (2026-08-28)
//
// 이전에는 페이지마다 폭을 새로 발명했다. 실측 결과 중앙 정렬 화면 7개가
// **서로 다른 폭 5종**(max-w-4xl · 5xl · 6xl · 7xl · 1600px)을 쓰고 있었고,
// 그중 5개는 `Layout`이 이미 주는 패딩 위에 **자기 패딩을 또 얹어**
// 다른 화면보다 안쪽으로 밀려 있었다.
//
// 새 화면은 이 부품을 쓴다. 폭을 직접 적지 말 것.
// ========================================

import { cn } from '@/lib/utils';

/**
 * 화면 가로 폭.
 *
 * 고르는 기준은 하나다 — **이 화면은 넓을수록 좋은가?**
 *
 * - `full`   넓을수록 좋다. 표·목록·카드 그리드·캘린더처럼 가로를 쓸수록 정보가
 *            더 들어오는 화면. (구매 신청·업무 관리·스케줄·서류함 …) **기본값**
 * - `narrow` 넓어도 득이 없다. 폼·설정·검색 결과처럼 한 줄이 길어지면 오히려
 *            읽기 나빠지는 화면. 넓은 화면에서는 가운데로 모인다.
 *            (문서 생성·도구 모음·통합 검색 …)
 *
 * 앱처럼 화면을 통째로 쓰는 경우(생기부 분석·모의고사 분석 등)는 이 부품이 아니라
 * `<Layout fullWidth>`를 쓴다 — 그쪽은 Layout의 패딩 자체를 없앤다.
 */
export type PageWidth = 'full' | 'narrow';

/**
 * 중앙 정렬 화면의 **표준 폭**.
 *
 * 종전에 4xl~1600px로 흩어져 있던 것을 하나로 모았다. 값 자체보다
 * "한 곳에서 정한다"가 중요하다 — 바꿔야 하면 여기만 고친다.
 */
const NARROW_MAX_WIDTH = 'max-w-6xl';

interface PageContainerProps {
  children: React.ReactNode;
  width?: PageWidth;
  /**
   * 추가 클래스. **패딩(p-*)과 max-w-*는 넣지 말 것** —
   * 패딩은 `Layout`의 `<main>`이 이미 주고(이중 패딩이 된다),
   * 폭은 `width`가 정한다.
   */
  className?: string;
}

export function PageContainer({ children, width = 'full', className }: PageContainerProps) {
  return (
    <div
      className={cn(
        // 세로 리듬도 여기서 통일한다 — 페이지마다 space-y-4 / space-y-6가 섞여 있었다
        'space-y-4 sm:space-y-6',
        width === 'narrow' && cn('mx-auto w-full', NARROW_MAX_WIDTH),
        className
      )}
    >
      {children}
    </div>
  );
}
