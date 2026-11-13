import { ChevronDown, Info } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { phoneGuide } from '@/data/extensionDirectory';

/** 원본 문서 우측의 "전화기 사용 방법" 안내 — 기본은 접힌 상태 */
export const PhoneGuideCard = () => {
  const [open, setOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <div className="rounded-xl bg-sky-50 p-2">
          <Info className="h-4 w-4 text-sky-600" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold tracking-tight text-slate-900">전화기 사용 방법</h2>
          <p className="truncate text-xs text-slate-500">
            내선 연결 · 단축번호 설정 · 착신 전환
          </p>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="grid gap-4 border-t border-slate-100 px-4 py-4 sm:grid-cols-3">
          {phoneGuide.map((section) => (
            <div key={section.title}>
              <h3 className="mb-1.5 text-xs font-bold text-slate-800">{section.title}</h3>
              <ul className="space-y-1">
                {section.steps.map((step) => (
                  <li key={step} className="flex gap-1.5 text-xs leading-relaxed text-slate-600">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
