import { ArrowRight, Settings2, Sparkles } from 'lucide-react';
import type { NewsArticle } from '../types';
import { matchedFields, type WorldField } from '../utils/fields';
import { newsDate, sourceName } from '../utils/story';
import { useWorldNewsForMe } from '../hooks/useWorldInterests';
import styles from '../world-today.module.css';

export const FOR_ME_LIMIT = 6;

/**
 * 「나를 위한 관측」 — 관심 분야에 걸린 최신 소식. 카드마다 «왜 이 소식인가»(걸린 분야)를 칩으로 말한다.
 * 저장 전이면 고르기를 권하고, 골랐는데 걸린 소식이 없으면 그 사실을 말한다(빈 줄을 그냥 숨기지 않는다 —
 * 숨기면 «기능이 없다»로 보인다).
 */
export function ForMeSection({ userId, saved, fields, onEdit, onOpen }: {
  userId: string;
  saved: boolean;
  fields: WorldField[];
  onEdit: () => void;
  onOpen: (article: NewsArticle, trigger: HTMLButtonElement) => void;
}) {
  const picks = useWorldNewsForMe(userId, fields, FOR_ME_LIMIT, fields.length > 0);

  if (fields.length === 0) {
    return (
      <section aria-label="나를 위한 관측" className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e8dcc6] bg-[#fff8ea] p-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-[#9a7d50]"><Sparkles size={14} aria-hidden /> 나를 위한 관측</p>
          <p className="mt-2 text-sm font-semibold text-[#4b3a57]">{saved ? '고른 관심 분야가 없어요.' : '관심 분야를 고르면, 그 분야의 새 소식을 먼저 보여 줄게요.'}</p>
          <p className="mt-1 text-xs leading-6 text-[#857a8c]">의학에 관심 있다면 의학·보건 소식을, 환경에 관심 있다면 지구·환경 소식을 골라 보여 드려요. 희망 학과와 생기부 기록으로 추천도 해 드려요.</p>
        </div>
        <button type="button" className={styles.primaryButton} onClick={onEdit}>관심 분야 고르기 <ArrowRight size={15} aria-hidden /></button>
      </section>
    );
  }

  const articles = picks.data ?? [];
  return (
    <section aria-label="나를 위한 관측" className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-bold text-[#4b3a57]"><Sparkles size={17} className="text-[#b08a4a]" aria-hidden /> 나를 위한 관측</h2>
          <p className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-[#7a6a86]">
            {fields.map(field => <span key={field} className="rounded-full border border-[#e2d6e7] bg-white px-2 py-0.5">{field}</span>)}
          </p>
        </div>
        <button type="button" className={styles.textButton} onClick={onEdit}><Settings2 size={13} aria-hidden /> 관심 분야 바꾸기</button>
      </div>
      {picks.isPending ? <div role="status" className={styles.empty}>관심 분야의 소식을 찾고 있어요.</div>
        : picks.isError ? <div role="alert" className={styles.empty}>맞춤 소식을 불러오지 못했어요.<button className="ml-2 underline" onClick={() => void picks.refetch()}>다시 시도</button></div>
        : articles.length === 0 ? <div className={styles.empty}>아직 고른 분야의 소식이 없어요. 소식은 매일 아침 도착하고 분야는 그날 안에 정리돼요.</div>
        : (
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
            {articles.map(article => {
              const reasons = matchedFields(article, fields);
              return (
                <article key={article.id} className="flex w-[17rem] min-w-0 shrink-0 snap-start flex-col rounded-2xl border border-[#e8dcc6] bg-[#fffdf8] p-4">
                  <p className="flex flex-wrap gap-1.5">
                    {reasons.map(field => <span key={field} className="rounded-full bg-[#f6ecd8] px-2 py-0.5 text-[10px] font-semibold text-[#7a5a22]">{field} 관심</span>)}
                  </p>
                  <h3 className="mt-3 line-clamp-3 text-sm font-bold leading-6 text-[#483652]">{article.classroom_hook || article.title}</h3>
                  <p className="mt-2 text-[10px] text-[#8d8193]">{sourceName(article.source)} · {newsDate(article.published_at)}</p>
                  <button type="button" className={`${styles.textButton} mt-auto self-end pt-3`} aria-label={`${article.title} 이야기 펼치기`} onClick={event => onOpen(article, event.currentTarget)}>
                    이야기 펼치기 <ArrowRight size={14} aria-hidden />
                  </button>
                </article>
              );
            })}
          </div>
        )}
    </section>
  );
}
