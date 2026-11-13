import { useState } from 'react';
import { KeyRound, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  ACCOUNT_KINDS,
  accountEntries,
  accountEntryLabel,
  parseAccounts,
  hasAnyAccount,
} from '@/utils/teacherAccounts';

interface AccountsSectionProps {
  /** `{ accounts }` 모양 — resource_accounts 표의 값(`accountsAsMeta`). 2026-10-13 전엔 resource.meta 였다. */
  resourceMeta?: unknown;
}

/**
 * 교사 본인 프로필에서 등록된 외부 서비스 계정을 열람하는 읽기 전용 섹션.
 * 비밀번호는 기본 마스킹, 계정별 토글로 표시/숨김 + 복사 지원.
 *
 * 한 종류에 계정이 여러 개일 수 있으므로(예: 인공지능용 = 교내 발급 + Claude + GPT)
 * 표시/복사 상태는 종류가 아니라 **계정 단위**(`kind-index`)로 관리한다.
 */
export const AccountsSection = ({ resourceMeta }: AccountsSectionProps) => {
  const { toast } = useToast();
  const accounts = parseAccounts(resourceMeta);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!hasAnyAccount(accounts)) return null;

  const toggleReveal = (entryKey: string) =>
    setRevealed((prev) => ({ ...prev, [entryKey]: !prev[entryKey] }));

  const copyValue = async (copyKey: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(copyKey);
      setTimeout(() => setCopiedKey((k) => (k === copyKey ? null : k)), 1500);
    } catch {
      toast({ title: '복사 실패', description: '클립보드 복사에 실패했습니다.', variant: 'destructive' });
    }
  };

  return (
    <div className="pt-3 border-t">
      <div className="flex items-center gap-2 mb-2">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">내 계정</span>
      </div>
      <div className="space-y-2">
        {ACCOUNT_KINDS.map(({ key, label }) => {
          const entries = accountEntries(accounts, key);
          if (entries.length === 0) return null;

          return entries.map((acc, index) => {
            const entryKey = `${key}-${index}`;
            const subLabel = accountEntryLabel(acc, index, entries.length);
            const isRevealed = !!revealed[entryKey];
            return (
              <div key={entryKey} className="rounded-md border bg-muted/30 px-3 py-2">
                <div className="text-xs font-semibold text-muted-foreground mb-1 break-words">
                  {label}
                  {subLabel && (
                    <span className="ml-1 font-normal text-muted-foreground/80">· {subLabel}</span>
                  )}
                </div>
                <div className="grid gap-1 text-sm">
                  {acc.id && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-14 shrink-0">아이디</span>
                      <span className="font-mono break-all flex-1 min-w-0">{acc.id}</span>
                      <button
                        type="button"
                        onClick={() => copyValue(`${entryKey}-id`, acc.id!)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title="복사"
                      >
                        {copiedKey === `${entryKey}-id` ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                  {acc.password && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-14 shrink-0">비밀번호</span>
                      <span className="font-mono break-all flex-1 min-w-0">
                        {isRevealed ? acc.password : '••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleReveal(entryKey)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title={isRevealed ? '숨기기' : '표시'}
                      >
                        {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyValue(`${entryKey}-pw`, acc.password!)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title="복사"
                      >
                        {copiedKey === `${entryKey}-pw` ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                  {acc.note && (
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground w-14 shrink-0">비고</span>
                      <span className="break-all flex-1 min-w-0 text-muted-foreground">{acc.note}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
};
