/**
 * 「이 설계가 어느 성취기준에 닿는가」 (2026-09-18, 사용자 요청).
 *
 * **설계가 끝난 뒤 눌러서 짚는다.** 설계 단계 프롬프트는 건드리지 않았으므로
 * (이유는 `services/achievementLinkService.ts` 머리글) 성취기준 맥락을 끄고 만든
 * 설계와 이미 쌓인 과거 이력에도 그대로 붙는다.
 *
 * **보여 주는 문장은 AI 가 쓴 글이 아니다** — 모델은 코드만 고르고, 문장은
 * 성취기준 본문에서 파싱한 사전이 채운다. 그래서 여기 뜨는 글은 원문 그대로다.
 *
 * 화면이 **다섯 상태를 각각 다르게** 말한다. 같은 영역에서 2026-09-14 에
 * 로딩·조회 실패·진짜 미등록이 한 문구로 뭉개져 장애가 숨은 적이 있다 —
 * 그때 얻은 규칙을 여기에도 적용한다.
 */
import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestAchievementLinks } from '../services/achievementLinkService';
import { fetchAchievementContextBody } from '../services/achievementContextService';
import type { AchievementLinkRecord } from '../utils/achievementStandards';
import type { InquiryAnalysisResult } from '../types';

interface AchievementLinkCardProps {
  design: InquiryAnalysisResult;
  /** 이 설계의 과목에 맞는 성취기준 문서(목차 항목). 없고 저장된 결과도 없으면 그리지 않는다. */
  context: { id: string; title: string } | null;
  /**
   * 짚은 결과를 어딘가에 남긴다. 주지 않으면 **이번 화면에서만** 보인다
   * (다음에 열면 다시 눌러야 한다). 실패해도 화면은 이미 결과를 보여 주고 있다.
   */
  onPersist?: (record: AchievementLinkRecord) => void | Promise<void>;
}

export function AchievementLinkCard({ design, context, onPersist }: AchievementLinkCardProps) {
  const stored = design.achievement_links ?? null;
  const [fresh, setFresh] = useState<AchievementLinkRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 다른 설계를 열면 이번 화면에서만 들고 있던 결과는 버린다.
  useEffect(() => {
    setFresh(null);
    setError(null);
  }, [stored, design.title]);

  const record = fresh ?? stored;
  if (!context && !record) return null;

  const run = async () => {
    if (!context) return;
    setLoading(true);
    setError(null);
    try {
      // 본문은 **쓸 때만** 받는다(목차는 제목만 갖고 있다).
      const body = await fetchAchievementContextBody(context.id);
      if (!body?.body?.trim()) {
        throw new Error('성취기준 본문을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      }
      const result = await requestAchievementLinks({ design, context: body });
      setFresh(result);
      // 남기기 실패는 표시를 막지 않는다 — 다음에 열 때 다시 짚어야 할 뿐이다.
      try {
        await onPersist?.(result);
      } catch (persistError) {
        console.warn('성취기준 연결을 설계에 남기지 못했습니다(표시는 정상):', persistError);
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : '성취기준 연결에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Target className="h-3.5 w-3.5 shrink-0 text-brand-600" />
          <span className="truncate">성취기준 연결</span>
        </div>
        <span className="shrink-0 truncate text-[10px] text-slate-400" title={record?.context_title ?? context?.title ?? ''}>
          {record?.context_title ?? context?.title ?? ''}
        </span>
      </div>

      {!record && !loading && !error && (
        <>
          <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
            이 설계가 교육과정의 어느 성취기준에 닿는지 확인할 수 있어요.
          </p>
          <div className="mt-2 flex justify-end">
            <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void run()}>
              성취기준 연결 보기
            </Button>
          </div>
        </>
      )}

      {loading && (
        <p role="status" className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          닿는 성취기준을 찾고 있어요…
        </p>
      )}

      {error && !loading && (
        <div className="mt-2">
          <p className="flex items-start gap-1.5 text-[11px] leading-5 text-rose-700">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </p>
          <div className="mt-2 flex justify-end">
            <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void run()}>
              다시 시도
            </Button>
          </div>
        </div>
      )}

      {record && !loading && (
        <>
          {record.links.length === 0 ? (
            /* **"찾지 못했다" 는 고장이 아니다.** 목록에 없는 코드만 돌아온 경우는
               서비스가 오류로 던지므로 여기까지 오지 않는다 — 여기 오는 것은
               "모델이 보고도 고르지 않았다" 뿐이다. 그 사실을 그대로 말한다. */
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              이 설계와 직접 닿는 성취기준을 찾지 못했어요. 교육과정 밖으로 뻗은 탐구일 수 있고, 그것 자체는 문제가 아니에요.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {record.links.map((link) => (
                <li key={link.code} className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-700">
                      {link.code}
                    </span>
                    {link.area && <span className="truncate text-[10px] text-slate-400">{link.area}</span>}
                  </div>
                  <p className="mt-1 break-words text-[11px] leading-5 text-slate-700">{link.text}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400">참고일 뿐이며 탐구 범위를 제한하지 않아요.</span>
            {context && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-1.5 text-[10px] text-slate-500"
                onClick={() => void run()}
              >
                <RefreshCw className="h-3 w-3" />
                다시 짚기
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
