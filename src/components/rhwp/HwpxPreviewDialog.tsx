// HWPX 미리보기 다이얼로그(공용): rhwp 엔진 렌더(SpecOverlayView, 하이라이트 없음)로
// 다운로드 없이 문서를 페이지 단위 확인. 러너 결과·실행 이력 ARTIFACT가 공유한다.
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { SpecOverlayView } from './SpecOverlayView';

export interface HwpxPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** 문서 바이트 공급자 — 참조가 바뀌면 재로드되므로 호출부에서 useCallback으로 고정 */
  loadSource: () => Promise<Blob | ArrayBuffer | Uint8Array>;
}

export function HwpxPreviewDialog({ open, onOpenChange, title, loadSource }: HwpxPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] max-w-[80vw] overflow-hidden p-4">
        <DialogTitle className="truncate text-sm">문서 미리보기 — {title}</DialogTitle>
        <SpecOverlayView
          className="h-[calc(92vh-70px)] rounded-xl border border-slate-300"
          loadSource={loadSource}
          spec={null}
        />
      </DialogContent>
    </Dialog>
  );
}
