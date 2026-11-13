import type { ComprehensiveRecommendation, ImprovementDirection } from '@/features/inquiry-design/types';
import styles from './game.module.css';

/**
 * 카시안의 «별자리 전체 조언» 카드 (2026-10-04 사용자 요청 — 대화에서 보이는 모습과 연구 수첩에서 보이는 모습이 달랐다:
 * 수첩은 «요약 · 설명» 줄글뿐이었다). 대화(별자리 조언 장면)와 연구 수첩이 **같은 카드**를 쓴다.
 *   방향 카드 = 카시안이 짚어 준 «더 자랄 방향»(요약 + 설명 + 이어 볼 수업),
 *   길 카드   = 그 방향으로 만든 «다음 탐구의 길»(수업 · 제목 · 설명 · 왜 이 길인가 + 연구대로 이어가기).
 */
export function AdviceDirectionCards({ directions, picked, subjects, onSeed, readOnly }: { directions: ImprovementDirection[]; picked?: string[]; subjects?: string[];
  /** 이 방향을 담아 새 별 찾기로 — 연구 수첩(2026-10-04 사용자 요청 «보완 방향의 데이터가 적용된 상태로 새 별 찾기로 바로»). */ onSeed?: (direction: ImprovementDirection) => void; readOnly?: boolean }) {
  if (!directions.length) return null;
  return <div className={styles.directionCards}>
    {directions.map(d => {
      const isPicked = picked?.includes(d.id);
      return <article key={d.id} className={styles.adviceDirection} data-picked={isPicked || undefined}>
        {isPicked && <span className={styles.advicePicked}>✦ 내가 고른 방향</span>}
        <strong>{d.summary}</strong>
        <p>{d.detail}</p>
        {!!d.suggested_anchor_subjects?.length && <small className={styles.adviceSubjects}>{d.suggested_anchor_subjects.map(s => <span key={s} data-picked={subjects?.includes(s) || undefined}>{s}</span>)}</small>}
        {onSeed && !readOnly && <button className={styles.mapButton} aria-label={`«${d.summary}» 방향으로 새 별 찾기`} onClick={() => onSeed(d)}>이 방향으로 새 별 찾기</button>}
      </article>;
    })}
  </div>;
}

export function AdviceRecommendationCards({ recommendations, onSeed, seedLabel = '이 길을 연구대에서 탐구로 만들기', readOnly }: {
  recommendations: ComprehensiveRecommendation[]; onSeed: (rec: ComprehensiveRecommendation) => void; seedLabel?: string; readOnly?: boolean;
}) {
  if (!recommendations.length) return null;
  return <div className={styles.directionCards}>
    {recommendations.map(rec => <article key={`${rec.rank}-${rec.title}`}>
      {rec.anchor_subject && <span className={styles.kicker}>{rec.anchor_subject}</span>}
      <h3>{rec.title}</h3>
      <p>{rec.description}</p>
      {rec.rationale && <p className={styles.adviceWhy}>{rec.rationale}</p>}
      {!readOnly && <button className={styles.goldButton} onClick={() => onSeed(rec)}>{seedLabel}</button>}
    </article>)}
  </div>;
}
