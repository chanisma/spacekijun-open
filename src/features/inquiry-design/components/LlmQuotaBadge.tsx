import { Badge } from '@/components/ui/badge';
import type { InquiryQuota, InquiryTokenUsage } from '../types';

interface LlmQuotaBadgeProps {
  quota?: InquiryQuota | null;
  tokenUsage?: InquiryTokenUsage | null;
}

export function LlmQuotaBadge({ quota, tokenUsage }: LlmQuotaBadgeProps) {
  if (!quota && !tokenUsage) {
    return <Badge variant="outline">분석 대기</Badge>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {quota && (
        <Badge variant={quota.remaining > 0 ? 'outline' : 'destructive'}>
          오늘 {quota.used}/{quota.limit}
        </Badge>
      )}
      {tokenUsage && (
        <Badge variant="secondary">
          {tokenUsage.cached ? '캐시' : '신규'} · {tokenUsage.total_tokens.toLocaleString()} tokens
        </Badge>
      )}
    </div>
  );
}
