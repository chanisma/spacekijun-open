import { useAuth } from '@/components/auth/AuthProvider';
import React from 'react';
import { Sparkles, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InquiryAiProvider } from '../types';

/**
 * 분석 AI 선택기 — **탐구 설계와 AI 종합 분석이 같은 부품을 쓴다** (2026-09-12 사용자 지시).
 *
 * 종전엔 탐구 설계가 헤더 오른쪽의 아이콘 토글 2개, 종합 분석이 본문 중간의 드롭다운이라
 * 자리도 모양도 달랐다. 같은 것을 고르는 자리는 같게 생겨야 찾을 수 있다.
 *
 * **아이콘만 두는 이유**: 헤더 오른쪽은 폭이 좁고(제목·재분석 버튼과 자리를 다툰다)
 * 고를 것이 둘뿐이라 이름을 늘 펼쳐 둘 필요가 없다. 이름은 `title`·`aria-label` 이 갖는다.
 */
export function AiProviderToggle({
  value,
  onChange,
  disabled,
}: {
  value: InquiryAiProvider;
  onChange: (provider: InquiryAiProvider) => void;
  disabled?: boolean;
}) {
  const { profile } = useAuth();
  if (profile?.role !== 'admin') return null;
  // 구 값 'solar-pro3'로 저장된 이력을 열어도 Solar 쪽이 선택돼 보여야 한다 —
  // 둘은 같은 Solar 경로이고, 선택 안 된 것처럼 보이면 없는 선택지를 찾게 된다.
  const solarActive = value.startsWith('solar-');
  const base =
    'flex h-7 w-7 items-center justify-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-200">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('openai')}
        title="OpenAI · GPT-6 Luna"
        aria-label="OpenAI · GPT-6 Luna"
        aria-pressed={value === 'openai'}
        className={cn(base, value === 'openai' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-slate-50')}
      >
        <Sparkles className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('solar-pro4')}
        title="Solar Pro 4 · solar-pro4"
        aria-label="Solar Pro 4 · solar-pro4"
        aria-pressed={solarActive}
        className={cn(
          base,
          'border-l border-slate-200',
          solarActive ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-slate-50'
        )}
      >
        <Sun className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
