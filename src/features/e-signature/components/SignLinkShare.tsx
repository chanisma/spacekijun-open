/**
 * 서명 링크 보내기 — 요청자 전용.
 *
 * 서명자가 앱에 로그인하지 않아도 되게, **사람마다 하나씩** 링크를 준다.
 * (카카오톡·문자로 보내면 그 사람이 폰에서 바로 서명한다.)
 *
 * ── 이 링크의 성질을 화면이 말해야 한다 ─────────────────────────────────────
 * 링크는 **자격증명**이다 — 가진 사람이 그 서명자로 서명한다. 그래서
 *   ① "본인에게만 보내세요"를 명시하고
 *   ② 링크를 **접어 둔다**(펼쳐야 보인다 — 화면 공유·어깨너머 노출을 줄인다)
 *   ③ 이미 서명한 사람의 링크는 죽었으므로 복사 버튼을 내린다
 */
import React, { useState } from 'react';
import { Check, ChevronDown, Copy, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { publicSignPath, type SignLink } from '../services/signatureTokenService';

interface Props {
  links: SignLink[];
}

export const SignLinkShare: React.FC<Props> = ({ links }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const pending = links.filter((l) => l.status === 'pending');
  if (pending.length === 0) return null;

  const copy = async (link: SignLink) => {
    const url = `${window.location.origin}${publicSignPath(link.token)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(link.signerId);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('복사하지 못했습니다. 주소를 길게 눌러 직접 복사해 주세요.');
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
          <Link2 className="h-3.5 w-3.5 text-slate-400" />
          서명 링크 보내기
          <span className="text-[10px] font-normal text-slate-400">({pending.length}명)</span>
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-1.5 border-t border-slate-100 px-3 py-2">
          <p className="text-[10px] leading-relaxed text-amber-700">
            이 링크를 가진 사람이 <strong>그 사람 이름으로 서명</strong>합니다.
            반드시 <strong>본인에게만</strong> 보내세요. 한 번 서명하면 링크는 사용할 수 없게 됩니다.
          </p>
          {pending.map((link) => (
            <div key={link.signerId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700" title={link.signerName}>
                {link.signerName}
              </span>
              <span className="shrink-0 text-[10px] text-slate-400">
                {new Date(link.expiresAt).toLocaleDateString('ko-KR')}까지
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 px-1.5 text-[10px]"
                onClick={() => copy(link)}
              >
                {copied === link.signerId
                  ? <><Check className="mr-0.5 h-3 w-3 text-emerald-600" />복사됨</>
                  : <><Copy className="mr-0.5 h-3 w-3" />링크 복사</>}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SignLinkShare;
