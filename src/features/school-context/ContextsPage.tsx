// 맥락 관리 (2026-11-06 사용자 «맥락 관련 내용을 문서 생성 안에 두는 게 아니라 아예 기능으로 빼야 함») — `/contexts`
//
// 두 보기:
//   · 학교 맥락 — 학교 지식이 어디에 어떤 구조로 있는지의 목록(school_context) + 새 맥락(note). 에이전트도 같은 목록을 본다(MCP knowledge.context)
//   · 문서 맥락 — 문서를 만들 때 AI 에게 함께 넘길 배경 글(docgen_context, 성취기준 포함). 문서 생성의 «이번 생성에 사용»·«양식에 연결»은
//                 문서 생성 화면 안에서 고르고(같은 다이얼로그), 만들고 고치는 일은 여기서 한다
// 고른 보기는 주소(?tab=)에 남긴다 — 문서 생성의 «맥락 관리» 단추가 ?tab=library 로 연다.
import { useSearchParams } from 'react-router-dom';
import { BookText, Library } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { cn } from '@/lib/utils';
import { ContextLibraryDialog } from '@/features/document-generation/components/ContextLibraryDialog';
import { SchoolContextPanel } from './components/SchoolContextPanel';

const TABS = [
  { key: 'school', label: '학교 맥락', icon: Library, hint: '학교 지식이 어디에 어떤 구조로 있는지 · 새로 알게 된 학교의 규칙·관행' },
  { key: 'library', label: '문서 맥락', icon: BookText, hint: '문서를 만들 때 AI 에게 함께 넘길 배경 글(성취기준 등)' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function ContextsPage() {
  const [params, setParams] = useSearchParams();
  const tab: TabKey = params.get('tab') === 'library' ? 'library' : 'school';
  const current = TABS.find((t) => t.key === tab)!;
  return (
    <Layout>
      <PageContainer width="narrow">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-800">맥락 관리</h1>
            <p className="text-xs text-slate-500">{current.hint}</p>
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setParams(t.key === 'school' ? {} : { tab: t.key })}
                className={cn('flex items-center gap-1 rounded-md px-3 py-1.5',
                  tab === t.key ? 'bg-slate-800 font-semibold text-white' : 'text-slate-500 hover:bg-slate-50')}
              >
                <t.icon className="h-3.5 w-3.5" />{t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex h-[calc(100vh-11rem)] min-h-[28rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
          {tab === 'school' ? <SchoolContextPanel /> : <ContextLibraryDialog open={false} onOpenChange={() => {}} inline />}
        </div>
      </PageContainer>
    </Layout>
  );
}
