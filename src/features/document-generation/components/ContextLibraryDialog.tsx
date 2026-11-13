// 맥락 라이브러리 다이얼로그 — 목록 ↔ 편집을 **한 다이얼로그 안에서** 전환한다.
//
// **왜 편집을 또 다른 Dialog로 열지 않는가**: 이 다이얼로그는 스펙 검수에서 열릴 때
// 이미 `TaskActionRunnerDialog` 안이라 **2중**이다. 편집까지 Dialog로 열면 3중이 되고,
// Radix의 레이어 스택·포커스 트랩·`hideOthers()`가 겹칠수록 깨질 확률만 올라간다
// (`ui/dialog.tsx`의 `DialogContainerContext` 주석이 그 사례를 기록하고 있다).
// 모드 전환은 레이어를 늘리지 않으면서 같은 일을 한다.
//
// 중첩 시 실제로 손봐야 하는 것들:
//   · ESC — Radix가 최상위 레이어만 닫지만, **편집 중(dirty)이면 가로채** 확인을 받는다.
//   · 바깥 클릭 — 편집 중에는 막는다(작성하던 글이 조용히 사라지는 사고 방지).
//   · 닫힘 — 목록 모드로 되돌려 다음에 열 때 편집 화면이 남아 있지 않게 한다.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeft, Check, Eye, EyeOff, FileUp, Link2, Loader2, Pencil, Plus, Save, Search, Trash2,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { DialogFooter, Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  CONTEXT_BODY_MAX, CONTEXT_CATEGORY_MAX, CONTEXT_TITLE_MAX, type DocGenContext,
} from '../services/contextService';
import {
  useCreateDocGenContext, useDeleteDocGenContext, useDocGenContexts,
  useLinkContextToSpec, useSpecContextIds, useUpdateDocGenContext,
} from '../hooks/useDocGenContexts';

/** 첨부로 받는 형식 — AI가 읽기 좋고 가벼운 텍스트만 */
const ACCEPT = '.md,.txt,.markdown,text/markdown,text/plain';

export interface ContextLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * 양식(스펙) 연결 모드 — 주면 목록에 "이 양식에 연결" 토글이 붙는다.
   * 연결은 **내 맥락을 내가 고칠 수 있는 양식에만** 걸 수 있다(서버 RLS가 정본).
   */
  templateId?: string | null;
  /** 양식을 고칠 권한이 있는가 — 없으면 연결 토글을 감춘다(눌러도 RLS가 막는다) */
  canEditTemplate?: boolean;
  /**
   * **이번 생성 선택 모드**(계획 검토에서 연다). 주면 행마다 "이번 생성에 사용" 체크가
   * 붙는다. 양식 연결(`templateId`)과는 **다른 축**이다 — 연결은 저장되는 기본값이고
   * 이 선택은 이번 실행에만 쓰이고 사라진다. 둘을 한 체크박스로 합치면 "다음에도 쓰려고
   * 연결한 것"과 "이번만 쓰려고 고른 것"을 구분할 수 없다.
   */
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  /**
   * 페이지 안에 펼쳐 둔다(2026-11-06 — 맥락이 «맥락 관리» 메뉴로 나왔다, `/contexts`). Dialog 를 쓰지 않으므로
   * open·onOpenChange 는 무시하고 ESC·바깥 클릭 가로채기도 없다(편집 중 페이지를 떠나는 것은 라우터가 막지 않는다).
   */
  inline?: boolean;
}

export function ContextLibraryDialog({
  open, onOpenChange, templateId = null, canEditTemplate = false,
  selectedIds, onSelectedIdsChange, inline = false,
}: ContextLibraryDialogProps) {
  const Title = inline ? 'h2' : DialogTitle;
  const Footer = inline ? 'div' : DialogFooter;
  const picking = !!selectedIds && !!onSelectedIdsChange;
  const { user } = useAuth();
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [editing, setEditing] = useState<DocGenContext | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [hidden, setHidden] = useState(false);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  /** 목록 분류 필터 — null = 전체 */
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { data: contexts = [], isLoading } = useDocGenContexts(open || inline);
  const { data: linkedIds = [] } = useSpecContextIds(open ? templateId : null);
  const createCtx = useCreateDocGenContext();
  const updateCtx = useUpdateDocGenContext();
  const deleteCtx = useDeleteDocGenContext();
  const linkCtx = useLinkContextToSpec();

  const busy = createCtx.isPending || updateCtx.isPending || deleteCtx.isPending || linkCtx.isPending;
  /** 편집 중 미저장 여부 — ESC·바깥 클릭을 가로챌 기준 */
  const dirty = mode === 'edit' && (
    title.trim() !== (editing?.title ?? '')
    || body !== (editing?.body ?? '')
    || category.trim() !== (editing?.category ?? '')
  );

  // 닫히면 목록으로 되돌린다 — 다음에 열 때 남의 편집 화면이 그대로 뜨지 않게
  useEffect(() => {
    if (!open) { setMode('list'); setEditing(null); setSearch(''); }
  }, [open]);

  const startCreate = () => {
    setEditing(null); setTitle(''); setBody(''); setHidden(false);
    // 분류를 걸어 둔 채로 새로 만들면 그 분류를 이어받는다(연속 등록이 흔한 사용법)
    setCategory(filterCategory ?? ''); setMode('edit');
  };
  const startEdit = (c: DocGenContext) => {
    setEditing(c); setTitle(c.title); setBody(c.body); setHidden(c.hidden);
    setCategory(c.category ?? ''); setMode('edit');
  };
  const backToList = () => {
    if (dirty && !window.confirm('저장하지 않은 변경이 있습니다. 목록으로 돌아갈까요?')) return;
    setMode('list'); setEditing(null);
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > 1_000_000) { toast.error('1MB 이하 텍스트 파일만 첨부할 수 있습니다.'); return; }
    try {
      const text = await file.text();
      // 파일은 **본문을 채워 넣는 보조 수단**이다 — 따로 저장하지 않는다.
      // 첨부 파일을 별도 보관하면 "파일과 본문 중 무엇이 정본인가"가 생기고,
      // 프롬프트에 실리는 것은 결국 텍스트라 둘로 나눌 이유가 없다.
      setBody((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text).slice(0, CONTEXT_BODY_MAX));
      if (!title.trim()) setTitle(file.name.replace(/\.(md|txt|markdown)$/i, '').slice(0, CONTEXT_TITLE_MAX));
      toast.success(`${file.name} 내용을 불러왔습니다.`);
    } catch {
      toast.error('파일을 읽지 못했습니다.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    if (!title.trim()) { toast.error('제목을 입력하세요.'); return; }
    if (!body.trim()) { toast.error('내용을 입력하세요.'); return; }
    try {
      if (editing) {
        await updateCtx.mutateAsync({ id: editing.id, patch: { title, body, hidden, category } });
      } else {
        await createCtx.mutateAsync({ title, body, hidden, category });
      }
      setMode('list'); setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장에 실패했습니다.');
    }
  };

  const remove = async (c: DocGenContext) => {
    if (!window.confirm(`"${c.title}" 맥락을 삭제할까요? 연결된 양식에서도 함께 사라집니다.`)) return;
    try {
      await deleteCtx.mutateAsync(c.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제하지 못했습니다.');
    }
  };

  const toggleLink = async (c: DocGenContext, next: boolean) => {
    if (!templateId) return;
    try {
      await linkCtx.mutateAsync({ contextId: c.id, templateId, linked: next });
      toast.success(next ? '이 양식에 연결했습니다.' : '연결을 해제했습니다.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '연결을 바꾸지 못했습니다.');
    }
  };

  const toggleHidden = async (c: DocGenContext) => {
    try {
      await updateCtx.mutateAsync({ id: c.id, patch: { hidden: !c.hidden } });
    } catch (e) {
      // 서버 트리거가 "스펙에 연결되어 있어 숨길 수 없습니다"를 던진다 — 그대로 보여준다
      toast.error(e instanceof Error ? e.message : '변경하지 못했습니다.');
    }
  };

  /** 이미 쓰인 분류 — 편집 폼의 제안 목록이자 목록 필터. 오타로 분류가 갈리는 것을 막는다 */
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const c of contexts) if (c.category) set.add(c.category);
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [contexts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contexts.filter((c) => {
      if (filterCategory !== null && (c.category ?? '') !== filterCategory) return false;
      if (!q) return true;
      return `${c.title} ${c.body} ${c.category ?? ''}`.toLowerCase().includes(q);
    });
  }, [contexts, search, filterCategory]);

  const content = (
      <>
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          {mode === 'edit' && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={backToList}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <Title className="min-w-0 truncate text-sm font-bold text-slate-700">
            {mode === 'list'
              ? (picking ? `맥락 선택${selectedIds!.length ? ` (${selectedIds!.length})` : ''}` : '맥락 정보')
              : editing ? '맥락 수정' : '새 맥락'}
          </Title>
          {mode === 'list' && (
            <Button size="sm" className="ml-auto h-7 bg-blue-600 px-2.5 text-xs hover:bg-blue-700" onClick={startCreate}>
              <Plus className="mr-1 h-3 w-3" />새 맥락
            </Button>
          )}
        </div>

        {mode === 'list' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-slate-100 px-4 py-2">
              <p className="mb-2 text-[11px] leading-snug text-slate-500">
                문서를 만들 때 AI에게 함께 넘길 <b>배경 설명</b>을 모아 둡니다.
                {picking
                  ? ' 이번 생성에 함께 넘길 것을 고르세요(복수 선택). 고른 내용은 계획 검토에서 이번만 수정할 수 있습니다.'
                  : ' 여기 저장해 두면 계획 검토에서 골라 쓸 수 있습니다.'}
                {templateId && !picking && ' 이 양식에 연결해 두면 매번 고르지 않아도 기본으로 제안됩니다.'}
              </p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-8 pl-7 text-xs" placeholder="제목·내용·분류 검색"
                  value={search} onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {/* 분류 필터 — 분류가 하나도 없으면 줄 자체를 만들지 않는다(빈 껍데기 방지) */}
              {categories.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {[null, ...categories, ''].map((cat) => {
                    const label = cat === null ? '전체' : cat === '' ? '분류 없음' : cat;
                    const n = cat === null
                      ? contexts.length
                      : contexts.filter((c) => (c.category ?? '') === cat).length;
                    if (n === 0 && cat !== null) return null;
                    const on = filterCategory === cat;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setFilterCategory(cat)}
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] transition-colors',
                          on
                            ? 'border-blue-300 bg-blue-50 font-semibold text-blue-700'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                        )}
                      >
                        {label} {n}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {isLoading && <p className="text-xs text-slate-400">불러오는 중…</p>}
              {!isLoading && filtered.length === 0 && (
                <p className="text-xs text-slate-400">
                  {search ? '검색 결과가 없습니다.' : '아직 저장한 맥락이 없습니다. [새 맥락]으로 만들어 보세요.'}
                </p>
              )}
              {filtered.map((c) => {
                const mine = c.user_id === user?.id;
                const linked = linkedIds.includes(c.id);
                return (
                  <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <span className="truncate" title={c.title}>{c.title}</span>
                          {c.hidden && (
                            <span className="flex shrink-0 items-center gap-0.5 rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-500">
                              <EyeOff className="h-2.5 w-2.5" />숨김
                            </span>
                          )}
                          {c.category && (
                            <span className="shrink-0 rounded bg-indigo-50 px-1 py-0.5 text-[9px] text-indigo-600">
                              {c.category}
                            </span>
                          )}
                          {!mine && (
                            <span className="shrink-0 rounded bg-sky-50 px-1 py-0.5 text-[9px] text-sky-600">공유</span>
                          )}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">{c.body}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {mine && (
                          <>
                            <Button
                              size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-slate-700"
                              title={c.hidden ? '숨김 해제 — 다른 교직원도 볼 수 있게' : '숨기기 — 나만 보기'}
                              disabled={busy}
                              onClick={() => void toggleHidden(c)}
                            >
                              {c.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                            <Button
                              size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-blue-600"
                              title="수정" onClick={() => startEdit(c)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-rose-600"
                              title="삭제" disabled={busy} onClick={() => void remove(c)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {/* 두 토글을 **한 줄에** 둔다(2026-09-02 사용자 요청). 축이 다르므로
                        체크박스는 따로지만, 세로로 쌓으면 행마다 3줄이 되어 100개 넘는
                        목록에서 훑기가 어렵다. `linked` 안내는 켜졌을 때만 아래 줄에. */}
                    {(picking || (templateId && canEditTemplate && mine)) && (
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          {picking && (
                            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={selectedIds!.includes(c.id)}
                                onChange={(e) => onSelectedIdsChange!(
                                  e.target.checked
                                    ? [...selectedIds!, c.id]
                                    : selectedIds!.filter((x) => x !== c.id),
                                )}
                              />
                              <Check className="h-3 w-3 text-blue-500" />
                              이번 생성에 사용
                            </label>
                          )}
                          {templateId && canEditTemplate && mine && (
                            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600">
                              <input
                                type="checkbox" checked={linked} disabled={busy}
                                onChange={(e) => void toggleLink(c, e.target.checked)}
                              />
                              <Link2 className="h-3 w-3 text-slate-400" />
                              이 양식에 연결
                            </label>
                          )}
                        </div>
                        {linked && templateId && canEditTemplate && mine && (
                          <p className="mt-0.5 pl-5 text-[10px] text-amber-600">
                            연결된 동안에는 숨길 수 없습니다.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700">제목</Label>
              <Input
                className="h-8 text-xs" maxLength={CONTEXT_TITLE_MAX}
                placeholder="예) 2026학년도 정보 교과 운영 개요"
                value={title} onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-700">
                분류 <span className="font-normal text-slate-400">(선택 — 비워 둬도 됩니다)</span>
              </Label>
              {/* 자유 입력 + 기존 값 제안. 목록에서 고르게만 하면 새 분류를 못 만들고,
                  제안이 없으면 같은 분류가 오타로 갈린다 — datalist 가 둘 다 만족한다 */}
              <Input
                className="h-8 text-xs" maxLength={CONTEXT_CATEGORY_MAX}
                list="docgen-context-categories"
                placeholder="예) 성취기준"
                value={category} onChange={(e) => setCategory(e.target.value)}
              />
              <datalist id="docgen-context-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
              {/* 분류 '성취기준' + 공개는 **학생에게도 보인다** (2026-09-14).
                  탐구 설계의 성취기준 맥락이 이 분류를 읽어 가는데, 분류는 자유 입력이라
                  모르고 적으면 교사용 메모가 학생에게 나간다. 정책이 `NOT hidden` 을 함께
                  요구하므로 '나만 보기'가 최종 판단이고, 그 사실을 여기서 말해 준다. */}
              {category.trim() === '성취기준' && !hidden && (
                <p className="text-[10px] leading-tight text-amber-700">
                  이 분류는 학생의 탐구 설계 화면에서도 열람할 수 있습니다. 교사용 자료라면
                  분류를 바꾸거나 ‘나만 보기’를 켜 주세요.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[11px] font-semibold text-slate-700">내용</Label>
                <div className="flex items-center gap-2">
                  <span className={cn('text-[10px]', body.length > CONTEXT_BODY_MAX * 0.9 ? 'text-amber-600' : 'text-slate-400')}>
                    {body.length.toLocaleString()} / {CONTEXT_BODY_MAX.toLocaleString()}
                  </span>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => fileRef.current?.click()}>
                    <FileUp className="mr-1 h-3 w-3" />파일에서 불러오기
                  </Button>
                  <input
                    ref={fileRef} type="file" accept={ACCEPT} className="hidden"
                    onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <Textarea
                rows={14} maxLength={CONTEXT_BODY_MAX}
                className="resize-y font-mono text-[11px] leading-relaxed"
                placeholder={'문서 작성에 필요한 배경을 자유롭게 적습니다.\n\n예) 우리 학교는 1학년 6학급, 2학년 6학급입니다.\n정보 교과는 1학년 주 2시간 편성이고 실습실은 2실입니다.'}
                value={body} onChange={(e) => setBody(e.target.value)}
              />
              <p className="text-[10px] leading-snug text-slate-500">
                md·txt 파일을 불러오면 내용이 아래에 이어 붙습니다. 파일은 따로 보관되지 않고 <b>이 내용이 정본</b>입니다.
              </p>
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-[11px] text-slate-600">
              <input
                type="checkbox" className="mt-0.5" checked={hidden}
                onChange={(e) => setHidden(e.target.checked)}
                disabled={!!editing && linkedIds.includes(editing.id)}
              />
              <span>
                <b>나만 보기</b> — 끄면 다른 교직원도 이 맥락을 골라 쓸 수 있습니다.
                {!!editing && linkedIds.includes(editing.id) && (
                  <span className="mt-0.5 flex items-center gap-1 text-amber-600">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    이 양식에 연결되어 있어 숨길 수 없습니다. 연결을 먼저 해제하세요.
                  </span>
                )}
              </span>
            </label>
            <Footer className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
              <Button variant="ghost" size="sm" onClick={backToList}>취소</Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={busy} onClick={() => void save()}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                저장
              </Button>
            </Footer>
          </div>
        )}
      </>
  );
  if (inline) return <div className="flex h-full min-h-0 flex-col overflow-hidden">{content}</div>;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && dirty && !window.confirm('저장하지 않은 변경이 있습니다. 닫을까요?')) return; onOpenChange(o); }}>
      <DialogContent
        className="flex h-[80vh] max-w-3xl flex-col overflow-hidden p-0"
        // 편집 중에는 ESC·바깥 클릭으로 닫히지 않게 한다 — 작성하던 글이 조용히
        // 사라지는 것이 이 중첩 구조에서 가장 흔한 사고다.
        onEscapeKeyDown={(e) => { if (dirty) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (dirty) e.preventDefault(); }}
        onInteractOutside={(e) => { if (dirty) e.preventDefault(); }}
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}
