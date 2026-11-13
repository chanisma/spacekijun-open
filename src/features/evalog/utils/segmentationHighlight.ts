import type { ActivitySegmentation } from '../types/segmentation';

/**
 * 분절 문장을 **원문 위의 범위**로 되돌린다.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────────
 * S0의 문장 분리기는 `content`를 먼저 정규화(`\s+` → ' ')한 뒤 자른다. 그래서
 * `segmentation.sentences`를 그대로 이어 붙이면 **원문의 줄바꿈·연속공백이 사라진다**.
 * 실측(두 학생 60건): 53건은 정규화 결과가 원문과 같지만 **7건은 다르다**.
 *
 * 모달은 문장을 새로 그려도 되지만, 일반 화면은 기존에 원문을 `whitespace-pre-wrap`으로
 * 보여주던 자리다. 서식을 바꾸면 하이라이트를 켰다는 이유로 본문이 달라 보인다.
 * 그래서 **원문은 그대로 두고 범위만 계산**한다.
 *
 * ── 방법 ────────────────────────────────────────────────────────────────────
 * 문장은 원문에서 연속한 구간의 정규화형이므로, 공백을 무시하고 문자를 순서대로
 * 맞춰 나가면 원문에서의 시작·끝을 찾을 수 있다. 정규화가 지운 것은 공백뿐이라
 * 비공백 문자열은 원문과 문장이 정확히 일치한다.
 */

export interface SentenceRange {
  /** `segmentation.sentences`의 인덱스 */
  index: number;
  start: number;
  end: number;
}

const isWs = (ch: string) => /\s/.test(ch);

/**
 * 원문에서 각 문장의 [start, end) 범위를 찾는다.
 * 맞추지 못한 문장은 결과에서 빠진다(부분 실패를 전체 실패로 만들지 않는다).
 */
export function mapSentencesToRanges(original: string, sentences: string[]): SentenceRange[] {
  const out: SentenceRange[] = [];
  let cursor = 0;

  for (let i = 0; i < sentences.length; i += 1) {
    const target = sentences[i];
    // 문장의 비공백 문자만 순서대로 소비한다.
    let ti = 0;
    // 앞쪽 공백은 건너뛰고 시작점을 잡는다.
    while (cursor < original.length && isWs(original[cursor])) cursor += 1;
    const start = cursor;
    let pos = cursor;

    while (pos < original.length && ti < target.length) {
      if (isWs(target[ti])) { ti += 1; continue; }
      if (isWs(original[pos])) { pos += 1; continue; }
      if (original[pos] !== target[ti]) break;   // 어긋남 — 이 문장은 포기
      pos += 1; ti += 1;
    }
    // 남은 것이 공백뿐이면 소비 완료로 본다.
    while (ti < target.length && isWs(target[ti])) ti += 1;

    if (ti === target.length && pos > start) {
      out.push({ index: i, start, end: pos });
      cursor = pos;
    } else {
      // 못 맞춘 문장은 건너뛰되 커서는 되돌리지 않는다 — 뒤 문장이 계속 맞을 수 있다.
      cursor = start;
    }
  }
  return out;
}

export interface HighlightSpan {
  text: string;
  /** 소속 활동 인덱스. null이면 활동에 귀속되지 않은 부분(총평·태도·맥락 등) */
  activityIndex: number | null;
}

/**
 * 원문을 활동별 조각으로 나눈다. 조각을 이어 붙이면 **원문과 정확히 같다** —
 * 하이라이트를 켜고 꺼도 본문이 달라지지 않는다는 뜻이고, 이 함수의 계약이다.
 */
export function buildHighlightSpans(
  original: string,
  seg: ActivitySegmentation | null | undefined,
): HighlightSpan[] {
  if (!seg?.sentences?.length) return [{ text: original, activityIndex: null }];

  const owner = new Map<number, number>();
  seg.activities.forEach((a, ai) => a.sentence_ids.forEach((s) => owner.set(s, ai)));

  const ranges = mapSentencesToRanges(original, seg.sentences)
    .filter((r) => owner.has(r.index))
    .sort((a, b) => a.start - b.start);

  const spans: HighlightSpan[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.start < at) continue;                 // 겹침 방어 — 앞 범위를 우선한다
    const gap = original.slice(at, r.start);
    const ai = owner.get(r.index)!;
    const last = spans[spans.length - 1];

    // 같은 활동의 이어지는 문장은 **한 덩어리로 합친다.** 문장마다 span을 두면
    // 화면에서 한 활동이 여러 조각으로 보이고 호버·클릭도 조각 단위로 걸린다.
    // 사이가 공백뿐일 때만 합치므로 원문은 그대로 보존된다.
    if (last && last.activityIndex === ai && !gap.trim()) {
      last.text += gap + original.slice(r.start, r.end);
    } else {
      if (gap) spans.push({ text: gap, activityIndex: null });
      spans.push({ text: original.slice(r.start, r.end), activityIndex: ai });
    }
    at = r.end;
  }
  if (at < original.length) spans.push({ text: original.slice(at), activityIndex: null });
  return spans;
}
