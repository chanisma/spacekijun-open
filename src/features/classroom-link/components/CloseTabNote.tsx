import { Button } from '@/components/ui/button';

/** 끝난 화면 아래 한 줄 — 닫는 중이면 안내, 브라우저가 막았으면 «닫아도 됩니다» + [창 닫기] */
export function CloseTabNote({ closing, failed, onClose, text = '할 일이 끝났습니다. 이 창은 닫아도 됩니다.' }: {
  closing: boolean; failed: boolean; onClose: () => void; text?: string;
}) {
  if (!closing && !failed) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
      {failed ? (
        <>
          <span>{text}</span>
          <Button variant="outline" size="sm" className="h-8" onClick={onClose}>창 닫기</Button>
        </>
      ) : (
        <span>잠시 뒤 이 창을 닫습니다.</span>
      )}
    </div>
  );
}
