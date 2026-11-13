/**
 * 마크다운 읽기 보기 — Claude 스킬(SKILL.md + references/*.md)과 README 를 **렌더해서** 읽는다.
 * 왼쪽 문서 목록, 오른쪽 본문. 문서 사이 상대 링크는 같은 보기 안에서 열리고,
 * 상대 이미지는 묶음 파일(텍스트 svg 는 바로, 이진은 버킷에서 받아)로 푼다.
 * 머리말(frontmatter)은 본문 위에 칩으로 보여 주고 본문에서는 뗀다.
 */
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, ChevronRight, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  findSkillManifest,
  isExternalRef,
  listMarkdownPaths,
  mimeOf,
  parseFrontmatter,
  resolveMarkdownLink,
  resolveRelativePath,
} from '@/lib/codeShare';
import { blobToDataUrl, downloadBinary, type CodeProjectFile } from '../services/codeShareService';

interface MarkdownReaderProps {
  files: CodeProjectFile[];
  isSkill: boolean;
  onDownloadZip?: () => void;
}

export function MarkdownReader({ files, isSkill, onDownloadZip }: MarkdownReaderProps) {
  const paths = useMemo(() => files.map((f) => f.path), [files]);
  const docs = useMemo(() => listMarkdownPaths(paths), [paths]);
  const [active, setActive] = useState<string>(docs[0] ?? '');
  useEffect(() => { if (!docs.includes(active)) setActive(docs[0] ?? ''); }, [docs, active]);

  const file = files.find((f) => f.path === active);
  const parsed = useMemo(() => parseFrontmatter(file?.content ?? ''), [file?.content]);
  const manifest = findSkillManifest(paths);
  const skillMeta = useMemo(() => {
    const m = files.find((f) => f.path === manifest);
    return m?.content ? parseFrontmatter(m.content).data : {};
  }, [files, manifest]);

  // 상대 이미지 → data: URL (이진은 비동기로 받는다)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const needed = new Set<string>();
    for (const m of parsed.body.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
      const t = resolveRelativePath(active, m[1]);
      if (t && !isExternalRef(m[1]) && paths.includes(t) && !imageUrls[t]) needed.add(t);
    }
    if (needed.size === 0) return;
    (async () => {
      const next: Record<string, string> = {};
      for (const p of needed) {
        const f = files.find((x) => x.path === p);
        if (!f) continue;
        try {
          next[p] = f.is_binary && f.storage_path
            ? await blobToDataUrl(await downloadBinary(f.storage_path))
            : `data:${mimeOf(p)};charset=utf-8,${encodeURIComponent(f.content ?? '')}`;
        } catch { /* 못 받은 이미지는 깨진 채 둔다 */ }
      }
      if (!cancelled) setImageUrls((prev) => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [parsed.body, active, paths, files, imageUrls]);

  if (docs.length === 0) {
    return <div className="rounded-2xl border bg-card p-6 text-center text-sm text-slate-500">읽을 마크다운 문서가 없습니다.</div>;
  }

  const metaEntries = Object.entries(parsed.data);

  return (
    <div className="space-y-3">
      {isSkill && (
        <div className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-800">
              <BookOpen className="h-3.5 w-3.5" /> Claude 스킬{skillMeta.name ? ` · ${skillMeta.name}` : ''}
            </p>
            {skillMeta.description && <p className="mt-0.5 text-[11px] leading-snug text-violet-900/80">{skillMeta.description}</p>}
            <p className="mt-1 text-[11px] text-violet-700/70">
              zip 을 받아 <code className="rounded bg-white/70 px-1">.claude/skills/{skillMeta.name || '<이름>'}/</code> 에 풀면 Claude Code 가 <code className="rounded bg-white/70 px-1">/{skillMeta.name || '<이름>'}</code> 으로 부릅니다.
            </p>
          </div>
          {onDownloadZip && (
            <button type="button" onClick={onDownloadZip} className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-violet-600 px-2.5 text-xs font-medium text-white hover:bg-violet-700">
              <Download className="h-3.5 w-3.5" /> zip 받기
            </button>
          )}
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="rounded-2xl border bg-card p-2 shadow-sm lg:max-h-[72vh] lg:overflow-y-auto">
          <ul className="space-y-0.5">
            {docs.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => setActive(p)}
                  className={cn(
                    'flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left font-mono text-[11px] transition-colors',
                    p === active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50',
                  )}
                  title={p}
                >
                  <ChevronRight className={cn('h-3 w-3 shrink-0', p === active ? 'text-blue-500' : 'text-slate-300')} />
                  <span className="min-w-0 truncate">{p}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <article className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm sm:p-6 lg:max-h-[72vh] lg:overflow-y-auto">
          {metaEntries.length > 0 && (
            <dl className="mb-4 flex flex-wrap gap-1.5 border-b pb-3">
              {metaEntries.map(([k, v]) => (
                <div key={k} className="flex max-w-full items-baseline gap-1 rounded-lg bg-slate-50 px-2 py-1 text-[11px]">
                  <dt className="shrink-0 font-semibold text-slate-500">{k}</dt>
                  <dd className="min-w-0 break-words text-slate-700">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {/* ⚠️ `prose-code:*` 는 <pre> 안의 <code> 에도 걸린다 — 인라인 코드 배경을 거기 주면 코드 블록이 줄마다 흰 상자가 된다
              (2026-10-02 실제 증상). 인라인은 `:not(pre)>code` 로 한정하고 블록 안 code 는 투명하게 되돌린다 */}
          <div className={cn(
            'prose prose-sm prose-slate max-w-none prose-headings:scroll-mt-4 prose-table:text-[12px]',
            // 코드 블록 = 밝은 서식지(안내문 틀 같은 문서가 많다)
            'prose-pre:rounded-xl prose-pre:border prose-pre:border-slate-200 prose-pre:bg-slate-50 prose-pre:text-[12px] prose-pre:leading-relaxed prose-pre:text-slate-800',
            '[&_pre>code]:bg-transparent [&_pre>code]:p-0 [&_pre>code]:text-inherit [&_pre>code]:before:content-none [&_pre>code]:after:content-none',
            // 인라인 코드만 회색 알약
            '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-slate-100 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-[12px] [&_:not(pre)>code]:font-normal [&_:not(pre)>code]:before:content-none [&_:not(pre)>code]:after:content-none',
          )}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children, ...rest }) => {
                  const target = href ? resolveMarkdownLink(active, href, paths) : null;
                  if (target) {
                    return <a href={`#${target}`} onClick={(e) => { e.preventDefault(); setActive(target); }} {...rest}>{children}</a>;
                  }
                  return <a href={href} target="_blank" rel="noreferrer" {...rest}>{children}</a>;
                },
                img: ({ src, alt, ...rest }) => {
                  const t = src && !isExternalRef(src) ? resolveRelativePath(active, src) : null;
                  const resolved = t && imageUrls[t] ? imageUrls[t] : src;
                  return <img src={resolved} alt={alt ?? ''} loading="lazy" {...rest} />;
                },
              }}
            >
              {parsed.body}
            </ReactMarkdown>
          </div>
        </article>
      </div>
    </div>
  );
}
