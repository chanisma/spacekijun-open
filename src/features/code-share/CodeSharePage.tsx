/**
 * 코드 공유 — 목록 (`/code-share`). 학생·교직원 모두.
 * 머리글은 기능명 없이 필터(전체/내 코드)·검색·[올리기]만 (2026-09-22 규약).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Code2, FolderGit2, GitFork, Globe, Link2, Loader2, Lock, Plus, Search, User } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatBytes, KIND_LABELS, type CodeProjectKind, type CodeProjectVisibility } from '@/lib/codeShare';
import { useCodeProjects } from './hooks/useCodeProjects';
import { CodeUploadDialog } from './components/CodeUploadDialog';
import type { CodeProject } from './services/codeShareService';

type Scope = 'all' | 'mine';

const KIND_TONE: Record<CodeProjectKind, string> = {
  html: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  static: 'bg-blue-50 text-blue-700 ring-blue-100',
  node: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  skill: 'bg-violet-50 text-violet-700 ring-violet-100',
  other: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const VISIBILITY_ICON: Record<CodeProjectVisibility, typeof Globe> = { school: Globe, link: Link2, private: Lock };

export function KindBadge({ kind }: { kind: CodeProjectKind }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1', KIND_TONE[kind])}>
      {KIND_LABELS[kind]}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d <= 0) return '오늘';
  if (d < 30) return `${d}일 전`;
  if (d < 365) return `${Math.floor(d / 30)}개월 전`;
  return `${Math.floor(d / 365)}년 전`;
}

function ProjectCard({ p }: { p: CodeProject }) {
  const VisIcon = VISIBILITY_ICON[p.visibility] ?? Globe;
  return (
    <Link
      to={`/code-share/${p.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-400" />
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold text-slate-800 group-hover:text-blue-700" title={p.title}>{p.title}</h3>
        <KindBadge kind={p.kind} />
      </div>
      <p className="mt-1 line-clamp-2 min-h-[2.25rem] text-xs leading-snug text-slate-500">{p.description || '설명이 없습니다.'}</p>
      {p.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {p.tags.slice(0, 4).map((t) => <span key={t} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">#{t}</span>)}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="flex min-w-0 items-center gap-1 truncate">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{p.owner?.name ?? '—'}</span>
          {p.forked_from && <GitFork className="h-3 w-3 shrink-0 text-slate-400" aria-label="가져온 사본" />}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span>{p.file_count}개 · {formatBytes(p.total_bytes)}</span>
          <span>{relativeTime(p.updated_at)}</span>
          {p.visibility !== 'school' && <VisIcon className="h-3 w-3 text-slate-400" aria-label={p.visibility} />}
        </span>
      </div>
    </Link>
  );
}

export default function CodeSharePage() {
  const [scope, setScope] = useState<Scope>('all');
  const [q, setQ] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const { data: projects = [], isLoading, error } = useCodeProjects(scope);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((p) =>
      p.title.toLowerCase().includes(needle)
      || (p.description ?? '').toLowerCase().includes(needle)
      || p.tags.some((t) => t.toLowerCase().includes(needle))
      || (p.owner?.name ?? '').toLowerCase().includes(needle));
  }, [projects, q]);

  return (
    <Layout>
      <PageContainer>
        <div className="rounded-xl border bg-card p-2.5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Code2 className="h-4 w-4" /></div>
              <div className="flex rounded-lg border border-slate-100 bg-slate-100/50 p-1">
                {([['all', '전체'], ['mine', '내 코드']] as Array<[Scope, string]>).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setScope(v)}
                    className={cn('h-6 rounded-md px-2.5 text-xs font-medium transition-colors', scope === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative min-w-[160px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·설명·태그·올린 사람" className="h-8 pl-8 text-xs md:text-xs" />
            </div>
            <Button size="sm" className="h-8 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700" onClick={() => setUploadOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> 코드 올리기
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">목록을 불러오지 못했습니다: {error instanceof Error ? error.message : String(error)}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100"><FolderGit2 className="h-8 w-8 text-blue-500" /></div>
            <h3 className="text-base font-semibold text-slate-700">
              {q ? '조건에 맞는 코드가 없습니다' : scope === 'mine' ? '아직 올린 코드가 없습니다' : '아직 공유된 코드가 없습니다'}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {q ? '검색어를 지우면 전체 목록을 볼 수 있습니다.' : 'AI 와 함께 만든 사이트·코드를 올려 두면 다른 사람이 실행해 보고 가져가 응용할 수 있습니다.'}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              {q && <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setQ('')}>검색어 지우기</Button>}
              <Button size="sm" className="h-8 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700" onClick={() => setUploadOpen(true)}><Plus className="h-3.5 w-3.5" /> 코드 올리기</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => <ProjectCard key={p.id} p={p} />)}
          </div>
        )}

        <CodeUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      </PageContainer>
    </Layout>
  );
}
