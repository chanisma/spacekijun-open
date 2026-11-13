import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCw, Home } from 'lucide-react';

// 앱 전역 렌더 오류 차단막 (2026-09-04).
//
// 이 저장소에는 **ErrorBoundary 가 한 개도 없었다** — CLAUDE.md 의 Error Handling 절이
// "Error boundaries for crashes" 라고 적어 두었는데도 실재하지 않았다. React 18 은 처리되지
// 않은 렌더 예외를 만나면 트리 전체를 언마운트하므로, 어느 화면의 사소한 예외 하나(널 필드,
// 예상 밖 응답 모양, 잘못된 날짜)가 **설명 없는 백색 화면**으로 끝났다. 사용자에게는 오류
// 메시지도, 재시도 버튼도, 빠져나갈 링크도 없었다.
//
// 여기서 하는 일은 "고치기"가 아니라 **말해 주기**다: 무슨 일이 일어났는지, 무엇을 누르면
// 되는지. 복구 수단을 두 가지로 나눈 이유 —
//   · 다시 시도: 일시적 오류(네트워크·경합)면 리로드 없이 트리만 다시 그린다
//   · 홈으로:   특정 화면이 계속 죽으면 앱을 떠나지 않고도 벗어날 수 있어야 한다
interface Props {
  children: ReactNode;
  /** 경계 이름 — 로그에서 어느 구획이 죽었는지 구분한다 */
  label?: string;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 콘솔이 유일한 진단 경로다(원격 수집기 없음). 스택과 컴포넌트 트리를 함께 남긴다.
    console.error(
      `[AppErrorBoundary${this.props.label ? `:${this.props.label}` : ''}] 렌더 오류`,
      error,
      info.componentStack,
    );
  }

  private handleRetry = () => this.setState({ error: null });

  private handleGoHome = () => {
    // 라우터 컨텍스트 밖에서도 동작해야 하므로 location 을 직접 쓴다.
    window.location.assign('/');
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold">화면을 표시하지 못했습니다</h2>
              <p className="text-sm text-muted-foreground">
                이 화면을 그리는 중 오류가 났습니다. 작업하던 내용은 저장되지 않았을 수 있습니다.
              </p>
            </div>
          </div>

          {/* 원인을 감추면 담당자에게 전달할 것이 없어진다. 기본은 접어 두되 열 수 있게 한다. */}
          <details className="rounded border bg-muted/40 p-2">
            <summary className="cursor-pointer text-xs font-medium">오류 내용 보기</summary>
            <p className="mt-1 break-words font-mono text-xs text-muted-foreground">
              {error.message || String(error)}
            </p>
          </details>

          <div className="flex flex-wrap gap-2">
            <Button onClick={this.handleRetry} size="sm">
              <RotateCw className="mr-2 h-4 w-4" />
              다시 시도
            </Button>
            <Button onClick={this.handleGoHome} variant="outline" size="sm">
              <Home className="mr-2 h-4 w-4" />
              홈으로
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
