/**
 * 휴대폰으로 서명하기 — 작은 QR (공용).
 *
 * 마우스로 서명하면 획이 각져서 실제 사인과 다르게 나온다. 손가락·펜으로 쓰라고
 * 서명 화면 **안에** 작게 붙이는 것이라 별도 모달을 열지 않는다 — "받는 사람이 여럿"인
 * 연수 QR과 달리 "지금 서명하는 나 한 명"이라 모달을 열 이유가 없다.
 *
 * **다만 누르면 크게 볼 수 있다.** 패널에 끼워 넣는 크기(60px)는 자리를 아끼려는
 * 타협이라 카메라가 잘 못 잡는다 — 특히 화면이 어둡거나 손이 흔들리면 실패한다.
 * 확대는 **모달 속 모달**이 되는데, 그 함정은 아래 주석과 `docs/nested-modal-pitfalls.md` 참고.
 *
 * **QR은 그냥 링크다 — 토큰·유효기간이 없다.** 라우트를 public 화이트리스트에 넣지 않아
 * 로그인이 필수이고, 서버 RPC가 "지금 차례인 본인"인지 다시 검증하므로 링크가 새어 나가도
 * 남의 칸에 서명되지 않는다(연수·결재 서명과 같은 결정).
 * (전자서명은 예외적으로 **토큰 링크**를 넣어 로그인 없이 서명하게 한다 — 그때는
 *  링크 자체가 자격증명이므로 "본인에게만" 문구를 확대 모달에도 함께 띄운다.)
 *
 * 결재(`/approval-sign/:id`)와 전자서명(`/signature-sign/:id`)이 함께 쓴다.
 */
import React from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Maximize2, ShieldAlert, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface SignQrCodeProps {
  /** 서명 페이지 경로(예: `/signature-sign/<id>`). origin 은 여기서 붙인다 */
  path: string;
  className?: string;
  /** QR 한 변(px). 기본은 카드 안에 끼워 넣는 작은 크기 */
  size?: number;
  label?: string;
  /**
   * 주소 복사 버튼. 좁은 패널에서는 끄는 편이 낫다 —
   * 바로 옆에 QR 이 있는데 주소를 복사할 일은 드물고, 세로 높이만 20px 먹는다.
   * (끄더라도 **확대 모달 안에는 항상** 복사 버튼이 있다 — 거기는 자리가 넉넉하다.)
   */
  showCopy?: boolean;
  /** 눌러서 크게 보기. 끌 이유는 거의 없다(이미 큰 QR을 그리는 화면 정도) */
  enlargeable?: boolean;
  /**
   * 이 링크가 **자격증명**인가(토큰 링크). 확대 모달에 "본인에게만" 경고를 띄운다.
   * 로그인이 필요한 일반 링크는 새어 나가도 남의 칸에 서명되지 않으므로 경고하지 않는다.
   */
  isCredentialLink?: boolean;
}

export const SignQrCode: React.FC<SignQrCodeProps> = ({
  path, className, size = 96, label = '휴대폰으로 서명', showCopy = true,
  enlargeable = true, isCredentialLink = false,
}) => {
  const { toast } = useToast();
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [zoomed, setZoomed] = React.useState(false);

  const url = React.useMemo(() => `${window.location.origin}${path}`, [path]);

  React.useEffect(() => {
    let cancelled = false;

    // 화면에는 작게 그리지만 원본은 크게 뽑는다 — 저해상도로 만들어 확대하면
    // 셀 경계가 뭉개져 카메라가 못 읽는다. 확대 모달이 이 원본을 그대로 쓴다.
    QRCode.toDataURL(url, { width: 480, margin: 1, errorCorrectionLevel: 'M' })
      .then((dataUrl) => { if (!cancelled) setQrDataUrl(dataUrl); })
      .catch((error) => {
        console.error('서명 QR 생성 실패:', error);
        if (!cancelled) setQrDataUrl(null);
      });

    return () => { cancelled = true; };
  }, [url]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: '복사 실패',
        description: '주소를 길게 눌러 직접 복사해 주세요.',
        variant: 'destructive',
      });
    }
  };

  const canZoom = enlargeable && !!qrDataUrl;

  const qrBox = (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-md border bg-white',
        canZoom && 'transition-colors group-hover:border-brand-400',
      )}
      style={{ width: size, height: size }}
    >
      {qrDataUrl ? (
        <img src={qrDataUrl} alt={`${label} QR 코드`} className="h-full w-full p-1" />
      ) : (
        <span className="text-[10px] text-slate-400">생성 중</span>
      )}
      {/* 누를 수 있다는 신호 — 평소엔 숨고 hover/focus 에만 뜬다(작은 QR을 가리지 않게) */}
      {canZoom && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/0 opacity-0 transition-all group-hover:bg-slate-900/45 group-hover:opacity-100 group-focus-visible:bg-slate-900/45 group-focus-visible:opacity-100">
          <Maximize2 className="h-4 w-4 text-white drop-shadow" />
        </span>
      )}
    </div>
  );

  return (
    <div className={cn('flex shrink-0 flex-col items-center gap-1', className)}>
      {canZoom ? (
        <button
          type="button"
          onClick={() => setZoomed(true)}
          className="group cursor-zoom-in rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
          title="QR 크게 보기"
          aria-label="QR 코드 크게 보기"
        >
          {qrBox}
        </button>
      ) : qrBox}

      <div className="flex items-center gap-1 text-[10px] font-medium text-slate-500">
        <Smartphone className="h-3 w-3" />
        {label}
      </div>
      {showCopy && (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="h-5 px-1.5 text-[10px] text-slate-400 hover:text-slate-600"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
        <span className="ml-0.5">{copied ? '복사됨' : '주소 복사'}</span>
      </Button>
      )}

      {/*
        ── 확대 모달 (모달 속 모달) ────────────────────────────────────────────
        이 컴포넌트는 대개 **이미 열린 다이얼로그 안**에서 쓰이므로 여기서 여는
        Dialog 는 중첩 모달이다. 지켜야 할 것 셋:

        ① **바깥 모달을 닫지 않는다.** 이건 "겹쳐 띄우기"이지 "바꿔치기"가 아니다.
           닫고 여는 것을 같은 틱에 하면 body 의 pointer-events 복구가 어긋난다.
        ② **DialogContent 는 document.body 로 포털된다**(container 를 넘기지 않는다).
           바깥 DialogContent 안으로 포털하면 그쪽의 `translate-*` 가 fixed 의
           기준 상자가 되어 화면 가운데가 아니라 모달 가운데에 뜬다.
        ③ Esc·바깥 클릭은 **맨 위 레이어만** 닫는다 — Radix 가 레이어 스택으로
           보장하지만, 그건 `@radix-ui/react-dismissable-layer` **사본이 하나일 때만**
           성립한다. 사본이 갈라지면 조용히 깨진다(`scripts/modal-layer-test`).
      */}
      <Dialog open={zoomed} onOpenChange={setZoomed}>
        <DialogContent className="max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-base">
              <Smartphone className="h-4 w-4 text-brand-600" />
              {label}
            </DialogTitle>
            <DialogDescription className="text-xs">
              휴대폰 카메라로 QR을 비추면 서명 화면이 열립니다.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3">
            <div className="w-full max-w-[260px] rounded-xl border bg-white p-3 shadow-sm">
              {qrDataUrl && (
                <img src={qrDataUrl} alt={`${label} QR 코드`} className="h-auto w-full" />
              )}
            </div>

            {isCredentialLink && (
              <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  이 QR은 <strong>본인 전용</strong>입니다. 화면을 다른 사람이 찍으면
                  그 사람이 대신 서명할 수 있으니 공유하지 마세요.
                </span>
              </p>
            )}

            {/* 주소는 접지 않고 그대로 보여 준다 — 확대 모달까지 온 사람은 대개
                QR 인식이 안 돼서 온 것이라, 주소를 직접 옮길 길이 있어야 한다 */}
            <div className="flex w-full items-center gap-1.5 rounded-lg border bg-slate-50 px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-500" title={url}>
                {url}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-6 shrink-0 px-1.5 text-[10px]"
              >
                {copied
                  ? <><Check className="mr-0.5 h-3 w-3 text-emerald-600" />복사됨</>
                  : <><Copy className="mr-0.5 h-3 w-3" />복사</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SignQrCode;
