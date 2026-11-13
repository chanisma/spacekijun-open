import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, Check, Copy, ExternalLink, Feather, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { fetchNewsInquiry, fetchWorldArticle, fetchWorldNewsNeighbors, saveNewsInquiry } from '../services/worldNewsService';
import { articleKeywords, buildStory, comicImageUrl, comicPanels, EMPTY_INQUIRY, FIELD_LIMITS, hasArticleInquiry, inquiryProgress, inquiryPrompts, inquiryToText, newsDate, safeNewsUrl, sourceName } from '../utils/story';
import type { InquiryDraft, NewsArticle, NewsInquiry } from '../types';
import { supabase } from '@/integrations/supabase/client';
import styles from '../world-today.module.css';
import { coinValue, useCoinEconomy } from '@/lib/coinEconomy';

const COMIC_BUCKET = 'world-today-comics';

export function WorldStoryDialog({ id, userId, readOnly, onClose, onNavigate, designPath = '/inquiry-design' }: {
  id: number;
  userId: string;
  readOnly: boolean;
  onClose: () => void;
  onNavigate: (id: number) => void;
  designPath?: '/inquiry-design' | '/academy/observatory';
}) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const article = useQuery({ queryKey: ['world-today', 'article', userId, id], queryFn: ({ signal }) => fetchWorldArticle(id, signal) });
  const neighbors = useQuery({
    queryKey: ['world-today', 'neighbors', userId, id, article.data?.published_at],
    queryFn: ({ signal }) => fetchWorldNewsNeighbors(article.data!, signal),
    enabled: !!article.data,
    staleTime: 60_000,
  });
  const notebook = useQuery({ queryKey: ['world-today', 'inquiry', userId, id], queryFn: () => fetchNewsInquiry(userId, id), enabled: !readOnly });
  const notebookRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const close = () => {
    if (saving) return;
    if (!dirty || window.confirm('아직 저장하지 않은 관측 일지가 있습니다. 닫을까요?')) onClose();
  };
  const news = article.data;
  const url = news && safeNewsUrl(news.url);
  // 만화는 기사 행 자체가 갖는다(comic_path/comic_panels). 원문 URL 로 다시 맞추지 않으므로
  // 다른 기사의 그림이 붙을 여지가 구조적으로 없다.
  const comic = useMemo(() => {
    if (!news) return undefined;
    const image = comicImageUrl(news, path => supabase.storage.from(COMIC_BUCKET).getPublicUrl(path).data.publicUrl);
    const panels = comicPanels(news);
    return image && panels.length === 4 ? { image, panels } : undefined;
  }, [news]);
  const keywords = useMemo(() => (news ? articleKeywords(news) : []), [news]);
  const [imageFailed, setImageFailed] = useState(false);
  const navigate = (direction: 'previous' | 'next') => {
    const nextId = neighbors.data?.[direction];
    if (!nextId || saving || neighbors.isFetching) return;
    if (dirty && !window.confirm('아직 저장하지 않은 관측 일지가 있습니다. 저장하지 않고 다른 기사로 이동할까요?')) return;
    onNavigate(nextId);
  };
  return (
    <Dialog open onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className={cn(styles.reader, 'max-w-5xl p-0')} onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat || event.nativeEvent.isComposing) return;
        if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          navigate(event.key === 'ArrowLeft' ? 'previous' : 'next');
        }
      }}>
        <header className="border-b border-[#e7dfd4] px-5 pb-5 pt-7 sm:px-8">
          <p className={styles.eyebrow}>세상 관측 일지 · 관측 #{id.toString().padStart(3, '0')}</p>
          <DialogTitle className="mt-2 pr-6 text-xl font-bold leading-snug tracking-tight text-[#302941] sm:text-2xl">{news?.title || '관측 이야기'}</DialogTitle>
          <DialogDescription className="mt-3 text-xs leading-6 text-[#736c7b]">
            {news ? `${sourceName(news.source)} · ${newsDate(news.published_at)} 발행` : '소식의 원문과 함께 나만의 질문을 찾아보세요.'}
          </DialogDescription>
          <nav aria-label="기사 이동" className="mt-4 flex items-center justify-between gap-2 text-xs text-[#80718c]">
            <button type="button" className={cn(styles.pageButton, 'flex items-center gap-1')} disabled={!neighbors.data?.previous || neighbors.isFetching || saving} onClick={() => navigate('previous')}><ArrowLeft size={14} /> 이전 기사</button>
            <span className="text-center text-[10px] leading-5"><span className="block whitespace-nowrap">전체 소식</span><span className="block">최신순</span><span className="hidden whitespace-nowrap sm:block">← → 키로 이동</span></span>
            <button type="button" className={cn(styles.pageButton, 'flex items-center gap-1')} disabled={!neighbors.data?.next || neighbors.isFetching || saving} onClick={() => navigate('next')}>다음 기사 <ArrowRight size={14} /></button>
          </nav>
          {neighbors.isError && <p role="alert" className="mt-2 text-xs">다른 기사 정보를 불러오지 못했습니다. <button className="underline" onClick={() => void neighbors.refetch()}>기사 이동 다시 시도</button></p>}
        </header>
        {article.isPending ? <p role="status" className="p-8 text-sm">새로운 이야기를 펼치고 있어요…</p> : article.isError ? (
          <div role="alert" className="p-8 text-sm">소식을 불러오지 못했습니다. <button className="underline" onClick={() => void article.refetch()}>다시 시도</button></div>
        ) : !news ? <p className="p-8 text-sm">지금 열람할 수 없는 소식입니다. 목록에서 다른 이야기를 골라 주세요.</p> : (
          <div className="space-y-8 px-5 pb-8 sm:px-8">
            <div className="space-y-3 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-xs text-[#675078]">{news.subjects.map(subject => <span key={subject} className="rounded-full bg-[#efe8f3] px-3 py-1.5">{subject}</span>)}</div>
                <button className={styles.textButton} onClick={() => { notebookRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' }); notebookRef.current?.focus({ preventScroll: true }); }}><Feather size={14} /> 질문 남기기</button>
              </div>
              {/* 교과와 같은 칩으로 그리지 않는다 — 칠한 칩은 이 화면에서 "목록을 거를 수 있는 교과"
                  하나만 뜻하고, 열린 어휘인 핵심어까지 같은 옷을 입으면 그 약속이 사라진다.
                  구분은 재질(채움 vs 테두리)로 주고 글자 대비는 양쪽 다 지킨다. */}
              {keywords.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px]">
                  <span className="text-[#6e6478]">핵심어</span>
                  {keywords.map(keyword => <span key={keyword} className="rounded-full border border-[#e2d8d1] bg-white px-2.5 py-1 leading-5 text-[#5f5668]">{keyword}</span>)}
                </div>
              )}
            </div>
            <section aria-label="리아와 루온의 네 컷 관측" className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h2 className="text-base font-bold text-[#40354f]">리아와 루온의 네 컷 관측</h2>
                <span className="text-[11px] text-[#80778a]">{comic && !imageFailed ? '기사 맞춤 AI 만화 · 마지막 컷에서 시작하는 탐구' : '기사 핵심에서 나의 질문으로'}</span>
              </div>
              {comic && !imageFailed ? <>
              <figure className="overflow-hidden rounded-2xl border border-[#e7dfd4] bg-white">
                <a href={comic.image} target="_blank" rel="noopener noreferrer" aria-label="4컷 만화 원본 크게 보기 (새 탭)">
                  <img src={comic.image} width={1254} height={1254} alt={`${news.title} — 리아와 루온의 4컷 만화. 대사는 아래에서 글로 읽을 수 있습니다.`} className="block h-auto w-full" decoding="async" onError={() => setImageFailed(true)} />
                </a>
                <figcaption className="space-y-3 p-4 text-xs leading-6 text-[#746a7b]">
                  <p>그림을 누르면 말풍선을 크게 읽을 수 있어요. 1–3컷은 기사 내용, 4컷은 함께 탐구할 질문이에요.</p>
                  <details><summary className="cursor-pointer">만화 대사 글로 읽기</summary><ol className="mt-3 space-y-3">{comic.panels.map((panel, index) => <li key={panel.title}><h3 className="font-semibold">{index + 1}. {panel.title}</h3>{panel.dialogue.map(line => <p key={line}>{line}</p>)}</li>)}</ol></details>
                </figcaption>
              </figure>
              {/* 만화가 있으면 아래 4단계가 통째로 감춰지는데, 1·2단계(수집된 핵심·해설)는
                  화면 어디에도 다시 나오지 않는다 — 만화가 붙은 기사일수록 읽을 것이 줄던 자리라
                  서랍으로 남긴다. 기본은 닫힘: 이 화면의 주인공은 그림이다. */}
              <details className="rounded-2xl border border-[#e7dfd4] bg-[#f6f2eb] p-4 sm:p-5">
                <summary className="cursor-pointer text-sm font-bold text-[#4b4157]">기사 핵심 4단계로 짚어 보기</summary>
                <p className="mt-2 text-xs leading-6 text-[#80778a]">만화는 장면으로, 이 4단계는 글로 같은 소식을 짚어요.</p>
                <StoryPanels article={news} className="mt-4" />
              </details>
              </> : <>
              <p className="text-xs leading-6 text-[#80778a]">{imageFailed ? '만화를 불러오지 못했어요. 아래 기사 내용으로 이어서 읽어 보세요.' : '이 소식의 만화는 아직 준비 중이에요. 먼저 기사 내용에서 질문을 찾아보세요.'}</p>
              <StoryPanels article={news} />
              </>}
            </section>
            <section className="rounded-2xl border border-[#e7dfd4] bg-[#f6f2eb] p-5" aria-label="기사 원문 확인">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-bold text-[#4b4157]"><BookOpen size={16} /> 이야기의 근거를 펼쳐 보자</h2>
                {url && <a className={styles.textButton} href={url} target="_blank" rel="noopener noreferrer">원문 읽기 <ExternalLink size={13} /><span className="sr-only">새 탭</span></a>}
              </div>
              <details className="mt-3 text-xs leading-7 text-[#746a7b]">
                <summary className="cursor-pointer">수집된 기사 발췌 보기</summary>
                <p className="mt-2 whitespace-pre-line break-words">{news.summary || '수집된 발췌가 없습니다. 원문 링크에서 내용을 확인해 주세요.'}</p>
              </details>
              <p className="mt-3 text-[11px] leading-6 text-[#807587]">요약과 해설은 자동 수집·분류된 내용입니다. 숫자와 연구 조건, 전망은 원문에서 확인해 주세요. 삽화는 실제 사건을 촬영한 이미지가 아닙니다.</p>
            </section>
            <section ref={notebookRef} tabIndex={-1} className="scroll-mt-5 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#806395]" aria-label="나의 관측 일지">
              {readOnly ? <p className="rounded-xl bg-[#efe8f3] p-5 text-sm">학생 미리보기에서는 개인 일지를 읽거나 저장하지 않습니다. 미리보기를 종료한 뒤 내 일지를 작성해 주세요.</p> : notebook.isPending ? (
                <p role="status" className="p-5 text-sm">내 관측 일지를 불러오는 중…</p>
              ) : notebook.isError ? (
                <p role="alert" className="p-5 text-sm">일지를 불러오지 못했습니다. <button className="underline" onClick={() => void notebook.refetch()}>다시 시도</button></p>
              ) : <InquiryNotebook article={news} initial={notebook.data ?? null} userId={userId} onDirty={setDirty} onSaving={setSaving} designPath={designPath} />}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * 기사 핵심 4단계. 만화가 없으면 본문으로, 있으면 서랍 안으로 들어간다.
 *
 * 두 자리가 같은 컴포넌트를 써야 한다 — 마크업을 복붙해 두면 한쪽만 고쳐지는 날이 오고,
 * "만화가 있는 기사와 없는 기사의 설명이 다르다"는 어긋남은 오류를 내지 않는다.
 */
function StoryPanels({ article, className }: { article: NewsArticle; className?: string }) {
  return (
    <ol className={cn('grid gap-4 sm:grid-cols-2', className)}>
      {buildStory(article).map((panel, index) => (
        <li key={panel.step} className="overflow-hidden rounded-2xl border border-[#e7dfd4] bg-white">
          <div className="space-y-2 p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#473655]">{index + 1}. {panel.title}</h3>
            <p className="break-words text-[13px] leading-7 text-[#554e5d]">{panel.text}</p>
            <p className="text-[10px] text-[#8a8091]">{panel.kind}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function InquiryNotebook({ article, initial, userId, onDirty, onSaving, designPath }: {
  article: NewsArticle;
  initial: NewsInquiry | null;
  designPath: '/inquiry-design' | '/academy/observatory';
  userId: string;
  onDirty: (value: boolean) => void;
  onSaving: (value: boolean) => void;
}) {
  const original = initial ? { question: initial.question, prediction: initial.prediction, plan: initial.plan, reflection: initial.reflection } : EMPTY_INQUIRY;
  const [draft, setDraft] = useState<InquiryDraft>(original);
  const [baseline, setBaseline] = useState(original);
  const [message, setMessage] = useState('');
  const queryClient = useQueryClient();
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  const save = useMutation({
    mutationFn: () => saveNewsInquiry(userId, article.id, draft),
    onMutate: () => { onSaving(true); setMessage(''); },
    onSuccess: data => {
      setBaseline({ question: data.question, prediction: data.prediction, plan: data.plan, reflection: data.reflection });
      setMessage('관측 일지를 저장했어요. 내 관측 일지에서 이어 쓸 수 있어요.');
      void queryClient.invalidateQueries({ queryKey: ['world-today', 'feed'] });
      queryClient.setQueryData(['world-today', 'inquiry', userId, article.id], data);
    },
    onError: () => setMessage('저장하지 못했어요. 입력 내용은 남아 있으니 다시 시도해 주세요.'),
    onSettled: () => onSaving(false),
  });
  const progress = inquiryProgress(draft);
  // 코인(2026-10-21) — 서버 트리거가 기사마다 한 번 준다. 값은 관리자 «코인 경제» 설정
  const coins = useCoinEconomy();
  const coin = (k: string, d: number) => (coins ? coinValue(coins, k, d) : d);
  const fields: { key: keyof InquiryDraft; label: string; hint: string }[] = [
    { key: 'question', label: '나의 질문', hint: '이 소식에서 가장 궁금한 것은 무엇인가요?' },
    { key: 'prediction', label: '예상과 이유', hint: '지금은 어떻게 생각하나요? 그렇게 생각한 이유도 적어 보세요.' },
    { key: 'plan', label: '확인할 방법', hint: '비교할 자료, 바꿔 볼 조건, 관찰하거나 실험할 방법을 적어 보세요.' },
    { key: 'reflection', label: '발견과 새 질문', hint: '무엇을 알게 되었나요? 내 예상과 달랐던 점이나 다음 질문을 남겨 보세요.' },
  ];
  return (
    <div className="rounded-2xl border border-[#dfd2e6] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className={styles.eyebrow}>다음 장의 주인공은 너</p><h2 className="mt-2 text-xl font-bold text-[#3f304e]">나의 관측 일지</h2></div>
        <span className="text-xs font-medium text-[#80658b]">{progress}/4칸 작성</span>
      </div>
      <p className="mt-3 text-xs leading-6 text-[#7d7385]">정답보다 좋은 질문 하나. 한 칸만 적어도 괜찮아요. 저장한 일지는 나만 볼 수 있어요.</p>
      <p className="mt-1 text-xs leading-6 text-[#9a6f2c]" data-world-coin>✦ 질문을 열 글자 넘게 쓰면 {coin('world.inquiry_reward', 2)}코인(하루 {coin('world.inquiry_cap', 2)}번), 발견과 새 질문을 스무 글자 넘게 쓰면 {coin('world.reflection_reward', 3)}코인(하루 {coin('world.reflection_cap', 1)}번) — 기사마다 한 번이에요.</p>
      <div className="my-5 flex gap-1.5" aria-hidden>{fields.map((field, index) => <span key={field.key} className={cn('h-1.5 flex-1 rounded-full', index < progress ? 'bg-[#9675a7]' : 'bg-[#eee7f1]')} />)}</div>
      <p className="mb-2 text-xs font-semibold text-[#665172]">
        {hasArticleInquiry(article) ? '이 기사에서 뽑은 질문 · 눌러서 이어 써도 좋아' : '리아의 질문 씨앗 · 눌러서 이어 써도 좋아'}
      </p>
      <div className="mb-6 flex flex-col gap-2">
        {inquiryPrompts(article).map(prompt => <button key={prompt} type="button" disabled={save.isPending}
          className="rounded-xl border border-[#ece4ef] bg-[#faf7fc] px-3 py-2.5 text-left text-xs leading-6 text-[#725c80] hover:border-[#b29abf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#806395]"
          onClick={() => {
            if (draft.question.trim() && draft.question !== prompt && !window.confirm('작성 중인 질문을 이 질문으로 바꿀까요?')) return;
            setDraft(current => ({ ...current, question: prompt })); questionRef.current?.focus();
          }}>{prompt}</button>)}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((field, index) => <label key={field.key} className="block min-w-0 text-sm font-semibold text-[#50405d]">
          <span className="mr-2 text-xs text-[#a38bae]">0{index + 1}</span>{field.label}
          <textarea ref={field.key === 'question' ? questionRef : undefined} value={draft[field.key]} disabled={save.isPending}
            onChange={event => { setDraft(current => ({ ...current, [field.key]: event.target.value })); setMessage(''); }}
            maxLength={FIELD_LIMITS[field.key]} rows={4} placeholder={field.hint}
            className="mt-2 block w-full resize-y rounded-xl border border-[#e8dfed] bg-[#fdfbfd] p-3 text-[13px] font-normal leading-7 text-[#4e4458] outline-none placeholder:text-[#96899d] focus:border-[#9272a4] focus:ring-2 focus:ring-[#e8dcee] disabled:opacity-60" />
          <span className="mt-1 block text-right text-[10px] font-normal text-[#94869e]">{draft[field.key].length}/{FIELD_LIMITS[field.key]}</span>
        </label>)}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#eee6f1] pt-5">
        <button type="button" className={styles.textButton} onClick={async () => {
          try { await navigator.clipboard.writeText(inquiryToText(article, draft)); setMessage('출처와 관측 일지를 함께 복사했어요. 탐구 설계나 보고서에 붙여 넣어 보세요.'); }
          catch { setMessage('복사하지 못했어요. 입력한 내용을 직접 선택해 복사해 주세요.'); }
        }}><Copy size={14} /> 출처와 함께 복사</button>
        <button type="button" className={styles.primaryButton} disabled={save.isPending || (!!initial && !dirty)} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{save.isPending ? '저장 중…' : progress ? '관측 일지 저장' : '일지에 담아 두기'}
        </button>
      </div>
      {message && <p role={save.isError ? 'alert' : 'status'} className="mt-3 text-xs leading-6 text-[#725382]">{message}</p>}
      {initial && !dirty && draft.question.trim() && <Link to={`${designPath}?worldNews=${article.id}`} className={cn(styles.textButton, 'mt-3')}><Feather size={14} /> 이 질문을 탐구 설계로 이어가기</Link>}
    </div>
  );
}
