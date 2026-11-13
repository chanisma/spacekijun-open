import { useMemo, useState } from 'react';
import {
  Trash2, ChevronDown, ChevronUp, Users, MessageSquareQuote,
  BookOpen, ClipboardList, AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TRACK_LABELS, FIT_LABELS, FIT_COLORS, type WishlistItem, type InterviewFactor, type InterviewBlock } from '../types';
import { NAESIN_CONVERT_RESIDUAL_SD } from '../utils/fit';
import { NAESIN_UNCERTAINTY_LABELS, type SubjectRecord } from '../utils/naesinRule';
import {
  splitCsatBlocks, mockByArea,
  CSAT_LABELS, CSAT_COLORS, CSAT_WITHHOLD_REASON,
  type MockSubject, type CsatJudgeResult,
} from '../utils/csat';
import { computeItemInsight } from '../utils/itemInsight';

interface Props {
  item: WishlistItem;
  readOnly: boolean;
  naesin: { avgGrade: number | null; isFiveTier: boolean; subjectCount?: number | null } | null;
  /** 전형 맞춤 내신 계산용 학생 과목 기록 (없으면 전과목 평균 naesin 사용) */
  subjects?: SubjectRecord[] | null;
  /** 수능최저 판정용 학생 모의고사 (영역별 등급) */
  mock?: { academicYear: number | null; examMonth: number | null; subjects: MockSubject[] } | null;
  onDelete?: (id: string) => void;
  deleting?: boolean;
}

function fmtNum(n: number | null | undefined, suffix = ''): string {
  if (n == null || !Number.isFinite(Number(n))) return '–';
  return `${Number(n)}${suffix}`;
}

export function WishlistItemCard({ item, readOnly, naesin, subjects, mock, onDelete, deleting }: Props) {
  const [showNaesin, setShowNaesin] = useState(false); // 반영 내신 상세
  const [showCsat, setShowCsat] = useState(false);     // 수능최저 상세
  const [showOther, setShowOther] = useState(false);   // 그외 전형 정보

  // 파생 판단값(반영 내신·환산·적합도·수능최저)은 비교표와 **같은 모듈**에서 계산한다.
  // 여기서 다시 계산하면 같은 항목의 숫자가 카드와 표에서 갈라질 수 있다.
  const insight = useMemo(
    () => computeItemInsight(item, { naesin, subjects: subjects ?? null, mock: mock ?? null }),
    [item, naesin, subjects, mock],
  );
  const {
    isFiveTier, parsedRule, ruleNaesin, naesinWithheld,
    effectiveGrade, convertedGrade, fit, csat, csatHeadline,
  } = insight;

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="shrink-0">{TRACK_LABELS[item.track]}</Badge>
            <h3 className="font-semibold text-slate-800 truncate">{item.university}</h3>
            {item.department && <span className="text-brand-700 font-medium text-sm">{item.department}</span>}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {item.admissionName && <span>{item.admissionName}</span>}
          </p>
          {/* 계열·도메인 chips */}
          {(item.adiga?.field || item.adiga?.domain) && (
            <div className="flex gap-1 mt-1.5">
              {item.adiga?.field && <Badge variant="secondary" className="text-[10px]">{item.adiga.field}</Badge>}
              {item.adiga?.domain && <Badge variant="secondary" className="text-[10px]">{item.adiga.domain}계열</Badge>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* 수능최저 충족 배지 (학과 매칭돼 판정 가능할 때만) */}
          {csatHeadline.verdict && (
            <span className={`text-[10px] font-bold px-1.5 py-1 rounded border ${CSAT_COLORS[csatHeadline.verdict]}`}
              title={`수능최저 ${CSAT_LABELS[csatHeadline.verdict]}${csatHeadline.isManual ? ' (직접 입력)' : ' (자동 판정)'}`}>
              최저 {CSAT_LABELS[csatHeadline.verdict]}
              {csatHeadline.isManual && <span className="font-normal opacity-70"> 직접</span>}
            </span>
          )}
          <span className={`text-xs font-bold px-2 py-1 rounded border ${FIT_COLORS[fit]}`}>
            {FIT_LABELS[fit]}
          </span>
          {!readOnly && onDelete && (
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-slate-400 hover:text-red-500"
              onClick={() => onDelete(item.id)}
              disabled={deleting}
              title="삭제"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* 핵심 지표 4개 (커트라인·경쟁률·모집) */}
      <div className="grid grid-cols-4 gap-px bg-slate-100 border-y border-slate-100">
        <Metric label="70% 컷" value={fmtNum(item.adiga?.grade70)} hint="하위 30% 선" />
        <Metric label="50% 컷" value={fmtNum(item.adiga?.grade50)} hint="중위" />
        <Metric
          label="경쟁률"
          value={fmtNum(item.adiga?.competition_2026, ':1')}
          hint={item.adiga?.real_competition_2026 != null ? `실질 ${fmtNum(item.adiga.real_competition_2026, ':1')}` : '2026'}
        />
        <Metric
          label="모집"
          value={fmtNum(item.adiga?.recruit_2026, '명')}
          hint={item.adiga?.waitlist_2026 != null ? `충원 ${fmtNum(item.adiga.waitlist_2026)}` : undefined}
        />
      </div>

      {/* 최근 추이 그래프 — 좌: 70%컷+경쟁률 / 우: 50%컷+경쟁률 (각 이중축) */}
      <TrendGraph adiga={item.adiga} />

      {/* ① 반영 내신: 요약(크게) + 상세 보기(반영교과·진로환산·근거과목) */}
      {effectiveGrade != null && item.adiga?.grade70 != null && (
        <div className="border-b border-slate-100">
          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">
                {isFiveTier
                  ? '내 내신(5등급제) → 9등급 환산'
                  : ruleNaesin && !ruleNaesin.fallback && !naesinWithheld
                    ? '전형 반영 내신'
                    : '내 내신 평균'}
                {' '}vs 70% 컷
              </div>
              <div className="text-lg font-bold text-slate-800 leading-tight">
                {effectiveGrade.toFixed(2)}
                {convertedGrade != null && (
                  <span
                    className="text-brand-700"
                    title={`5등급제 내신을 컷과 같은 9등급 척도로 환산한 값입니다. 5등급제는 상위 10%를 한 등급으로 묶어 세부 순위 정보가 사라지므로 환산에는 약 ±${(1.96 * NAESIN_CONVERT_RESIDUAL_SD).toFixed(2)}등급의 폭이 남습니다.`}
                  >
                    {' → '}{convertedGrade.toFixed(2)}
                  </span>
                )}
                <span className="text-sm text-slate-400 font-medium"> vs {fmtNum(item.adiga.grade70)}등급</span>
              </div>
              {convertedGrade != null && (
                <div className="text-[10px] text-slate-400 mt-0.5">
                  컷은 9등급제 기준이라 환산값으로 비교합니다 (환산 폭 ±{(1.96 * NAESIN_CONVERT_RESIDUAL_SD).toFixed(2)}등급)
                </div>
              )}
            </div>
            <span className={`text-sm font-bold px-3 py-1.5 rounded-lg border shrink-0 ${FIT_COLORS[fit]}`}>
              {FIT_LABELS[fit]}
            </span>
          </div>
          {/* 계산 보류 — 전형 반영방법을 그대로 재현할 수 없을 때.
              근사치를 내지 않고 사유·원문을 보여 모집요강 확인으로 넘긴다. */}
          {naesinWithheld && (
            <div className="px-4 pb-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span className="text-xs font-semibold text-amber-800">전형 반영 내신 계산 보류</span>
                </div>
                <p className="text-[10.5px] leading-relaxed text-amber-900/90">
                  이 전형의 반영방법을 그대로 재현할 수 없어 계산하지 않았습니다.
                  위 숫자는 전형 반영과 무관한 <b>내 전체 내신 평균</b>입니다.
                </p>
                <ul className="space-y-0.5">
                  {ruleNaesin!.uncertainties.map((u) => (
                    <li key={u} className="flex gap-1 text-[10.5px] text-amber-700">
                      <span className="shrink-0">·</span>
                      <span>{NAESIN_UNCERTAINTY_LABELS[u]}</span>
                    </li>
                  ))}
                </ul>
                {parsedRule?.raw && (
                  <div className="rounded border border-amber-100 bg-white/70 px-2 py-1 text-[10.5px] text-slate-600">
                    <span className="text-slate-400">반영방법 원문</span> {parsedRule.raw}
                  </div>
                )}
                <p className="text-[10px] text-amber-700/80">
                  정확한 반영 교과·과목 수는 해당 대학 모집요강을 확인하세요.
                </p>
              </div>
            </div>
          )}
          {ruleNaesin && ruleNaesin.usedSubjects.length > 0 && (
            <>
              <SectionToggle
                open={showNaesin}
                onToggle={() => setShowNaesin((v) => !v)}
                label={`반영 내신 상세 보기 · ${ruleNaesin.usedSubjects.length}과목`}
              />
              {showNaesin && (
                <div className="px-4 pb-3 space-y-2.5">
                  {/* 반영 교과목 + 진로선택 환산기준 (전형 상세에서 이동) */}
                  {item.gyogwa && (
                    <div className="space-y-1.5">
                      {(item.gyogwa.subjects_all ?? []).some((s) => s.subjects) && (
                        <div>
                          {item.gyogwa.subjects_all.filter((s) => s.subjects).slice(0, 3).map((s, i) => (
                            <div key={i} className="flex items-baseline gap-1.5 text-xs">
                              <BookOpen className="h-3 w-3 text-slate-400 shrink-0 translate-y-0.5" />
                              <span className="text-slate-600">반영 교과: <b className="text-slate-800">{s.subjects}</b>
                                {s.ratio && (
                                  <span className="text-slate-400"> (학년비율 {s.ratio}{ruleNaesin?.usedYearWeights ? ' 적용' : ''})</span>
                                )}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {(item.gyogwa.careers ?? []).some((c) => c.criteria || c.method) && (
                        <div className="space-y-0.5">
                          {item.gyogwa.careers.filter((c) => c.criteria || c.method).slice(0, 2).map((c, i) => (
                            <div key={i} className="text-xs text-slate-600">
                              <span className="text-slate-400">진로선택</span> {c.method && <b className="text-slate-700">{c.method}</b>}
                              {c.criteria && <span className="text-slate-500"> — {c.criteria}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* 계산 근거 과목 */}
                  <UsedSubjects result={ruleNaesin} isFiveTier={isFiveTier} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ② 수능최저: 충족 요약(크게) + 상세 보기(원문·근거) */}
      {item.gyogwa?.has_csat && item.gyogwa.csat && (
        <div className="border-b border-slate-100">
          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="text-[10px] text-slate-400">수능최저 충족 여부</div>
            {csatHeadline.verdict ? (
              <span className={`text-sm font-bold px-3 py-1.5 rounded-lg border shrink-0 ${CSAT_COLORS[csatHeadline.verdict]}`}
                title={csatHeadline.isManual ? '비교표에서 직접 저장한 판정입니다' : '모의 성적으로 자동 판정한 값입니다'}>
                {CSAT_LABELS[csatHeadline.verdict]}
                {csatHeadline.isManual && <span className="text-[10px] font-normal opacity-70"> 직접</span>}
              </span>
            ) : (
              <span className="text-xs font-medium text-slate-400 shrink-0">
                {csat && !csat.judge ? '판정 보류' : csat ? '판정불가' : '모의 성적 없음'}
              </span>
            )}
          </div>
          {/* 판정 근거(크게) — 합/평균/각 mode별 표시 */}
          {!csatHeadline.isManual && csat?.judge && csat.judge.verdict !== 'unknown' && (
            <CsatBasis judge={csat.judge} />
          )}
          {csatHeadline.isManual && (
            <p className="px-4 pb-2 text-[10.5px] text-slate-400">
              직접 저장한 판정이라 자동 계산 근거를 표시하지 않습니다. 비교표의 <b>최저 충족여부</b> 행에서 '자동'으로 되돌릴 수 있습니다.
            </p>
          )}
          <SectionToggle
            open={showCsat}
            onToggle={() => setShowCsat((v) => !v)}
            label="수능최저 상세 보기"
          />
          {showCsat && (
            <div className="px-4 pb-3">
              <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-2 text-xs">
                {(item.gyogwa.method_tags?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {item.gyogwa.method_tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                )}
                <CsatText csat={item.gyogwa.csat} appliedText={csat?.appliedText ?? null} />
                {csat?.judge && csat.matchedLabels && csat.matchedLabels.length > 0 && (
                  <p className="text-[10px] text-slate-400 mt-1">적용 기준: {csat.matchedLabels.join(', ')}</p>
                )}
                {csat && !csat.judge && (
                  <div className="mt-1.5">
                    <p className="text-[10px] text-amber-700 mb-1">
                      ※ {CSAT_WITHHOLD_REASON[csat.kind] ?? '자동 판정을 보류했습니다.'} 위 기준과 아래 내 모의 등급으로 직접 확인하세요.
                    </p>
                    {mock && mock.subjects.length > 0 && <MockGradeStrip mock={mock} />}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ②' 종합전형 수능최저 안내 — 구조화 데이터 없음(모집요강 직접 확인). 일부 종합은 수능최저 존재 */}
      {item.track === 'jonghap' && (
        <div className="border-b border-slate-100 px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] text-slate-400">수능최저</div>
            <span className="text-[11px] font-medium text-slate-400 shrink-0">모집요강 확인</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
            종합전형 수능최저는 자동 제공되지 않습니다. 일부 전형(의약학·교대 등)은 수능최저가 있으니
            {' '}<b className="text-slate-600">대학 모집요강</b>에서 직접 확인하세요.
          </p>
        </div>
      )}

      {/* ③ 그외 전형 정보: 종합 평가/면접 + 메모 */}
      {(item.jonghap || item.memo) && (
        <div>
          <SectionToggle
            open={showOther}
            onToggle={() => setShowOther((v) => !v)}
            label="그외 정보 보기"
          />
          {showOther && (
            <div className="px-4 pb-4 space-y-3.5 pt-1">
              {item.jonghap && (
                <Section icon={<Users className="h-4 w-4 text-purple-500" />} title="종합 평가기준·면접">
                  {item.jonghap.has_doc_eval && (item.jonghap.doc_top_factors?.length ?? 0) > 0 && (
                    <div className="mb-2.5">
                      <p className="text-[11px] font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <ClipboardList className="h-3 w-3" /> 서류 평가요소
                      </p>
                      <div className="space-y-1">
                        {item.jonghap.doc_top_factors!.map((f, i) => (
                          <FactorBar key={i} name={f.name} value={f.value} />
                        ))}
                      </div>
                    </div>
                  )}
                  {item.jonghap.has_interview ? (
                    <div>
                      <p className="text-[11px] font-medium text-slate-500 mb-1">
                        면접 · {item.jonghap.interview_status ?? '실시'}
                        {item.jonghap.interview_primary_time && <span className="text-slate-400"> · {item.jonghap.interview_primary_time}</span>}
                        {(item.jonghap.interview_methods?.length ?? 0) > 0 && (
                          <span className="text-slate-400"> · {item.jonghap.interview_methods.join(', ')}</span>
                        )}
                      </p>
                      <InterviewBlocks blocks={item.jonghap.interview_blocks} />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">면접 없음</p>
                  )}
                </Section>
              )}
              {item.memo && (
                <div className="text-xs text-slate-600 bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2">
                  <span className="font-medium text-amber-700">메모</span> · {item.memo}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// 카드 섹션 펼침 토글 — "○○ 상세 보기" / 접기 한 줄 버튼 (반영내신·수능최저·그외 공통)
function SectionToggle({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-center gap-1 py-2 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
    >
      {open ? <>접기 <ChevronUp className="h-3.5 w-3.5" /></> : <>{label} <ChevronDown className="h-3.5 w-3.5" /></>}
    </button>
  );
}

// 최근 추이 그래프 — 좌/우 2개 미니차트를 나란히. 좌=70%컷, 우=50%컷 (각 + 경쟁률 이중축).
function TrendGraph({ adiga }: { adiga: WishlistItem['adiga'] }) {
  const years = adiga?.history?.years;
  if (!adiga || !years) return null;

  // 연도별 (지정 컷, 경쟁률) 수집 — 2026은 현재값, 그 외는 history.years
  const buildPts = (cutKey: 'grade70' | 'grade50') =>
    (['2024', '2025', '2026'] as const).map((y) => {
      if (y === '2026') return { y, cut: adiga[cutKey], comp: adiga.competition_2026 };
      const yr = years[y];
      return { y, cut: yr?.[cutKey] ?? null, comp: yr?.competition ?? null };
    }).filter((p) => p.cut != null || p.comp != null);

  const pts70 = buildPts('grade70');
  const pts50 = buildPts('grade50');
  // 양쪽 모두 그릴 점이 부족하면 영역 자체를 숨김
  if (pts70.length < 2 && pts50.length < 2) return null;

  return (
    <div className="grid grid-cols-2 gap-px bg-slate-100 border-b border-slate-100">
      <TrendMiniChart pts={pts70} cutLabel="70%컷" />
      <TrendMiniChart pts={pts50} cutLabel="50%컷" />
    </div>
  );
}

type TrendPoint = { y: string; cut: number | null; comp: number | null };

// 추이 미니차트 1개 — cut(등급, 낮을수록 위)+경쟁률(높을수록 위) 이중축 SVG.
function TrendMiniChart({ pts, cutLabel }: { pts: TrendPoint[]; cutLabel: string }) {
  if (pts.length < 2) {
    return (
      <div className="bg-white px-3 py-2 flex flex-col min-h-[88px]">
        <span className="text-[10px] text-slate-400">{cutLabel}</span>
        <div className="flex-1 flex items-center justify-center text-[10px] text-slate-300">데이터 부족</div>
      </div>
    );
  }
  const W = 200, H = 60, padX = 22, padY = 12;
  const xs = pts.map((_, i) => padX + (i * (W - 2 * padX)) / (pts.length - 1));
  // 컷: 1~9등급, 낮을수록 좋음 → y축 반전(낮은 등급=위)
  const cuts = pts.map((p) => p.cut).filter((v): v is number => v != null);
  const cutMin = Math.min(...cuts), cutMax = Math.max(...cuts);
  const cutRange = Math.max(0.5, cutMax - cutMin);
  const cutY = (v: number) => padY + ((v - cutMin) / cutRange) * (H - 2 * padY);
  // 경쟁률: 높을수록 위(클수록 인기) → 정방향
  const comps = pts.map((p) => p.comp).filter((v): v is number => v != null);
  const compMax = comps.length ? Math.max(...comps) : 1;
  const compMin = comps.length ? Math.min(...comps) : 0;
  const compRange = Math.max(0.5, compMax - compMin);
  const compY = (v: number) => H - padY - ((v - compMin) / compRange) * (H - 2 * padY);

  const line = (yFn: (v: number) => number, key: 'cut' | 'comp') =>
    pts.map((p, i) => (p[key] != null ? `${xs[i]},${yFn(p[key] as number)}` : null)).filter(Boolean).join(' ');

  return (
    <div className="bg-white px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-slate-400">{cutLabel}</span>
        <span className="text-[9px] text-slate-400 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5"><span className="w-2 h-0.5 bg-blue-400 inline-block" />컷</span>
          <span className="inline-flex items-center gap-0.5"><span className="w-2 h-0.5 bg-rose-400 inline-block" />경쟁률</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" preserveAspectRatio="none">
        {/* 컷 라인 (파랑) */}
        <polyline points={line(cutY, 'cut')} fill="none" stroke="#60a5fa" strokeWidth="1.5" />
        {/* 경쟁률 라인 (장미) */}
        <polyline points={line(compY, 'comp')} fill="none" stroke="#fb7185" strokeWidth="1.5" strokeDasharray="3 2" />
        {pts.map((p, i) => (
          <g key={p.y}>
            {p.cut != null && <circle cx={xs[i]} cy={cutY(p.cut)} r="2.5" fill="#3b82f6" />}
            {p.comp != null && <circle cx={xs[i]} cy={compY(p.comp)} r="2.5" fill="#f43f5e" />}
            <text x={xs[i]} y={H - 1} textAnchor="middle" className="fill-slate-400" fontSize="8">{p.y}</text>
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-[9px] text-slate-400 px-0.5">
        {pts.map((p) => (
          <span key={p.y}>
            {p.cut ?? '–'}·{p.comp != null ? `${p.comp}:1` : '–'}
          </span>
        ))}
      </div>
    </div>
  );
}

// 수능최저 판정 근거 한 줄 — 합/평균/각 mode별로 문구를 달리한다.
//  - sum:  "내 모의 N개 합 X / 기준 K (국 2+수 3)"
//  - avg:  "내 모의 N개 평균 X / 기준 K (국 2, 수 3)"
//  - each: "내 모의 상위 N개 최대 X / 기준 각 K 이하 (국 2, 수 3)"
function CsatBasis({ judge }: { judge: CsatJudgeResult }) {
  const modeWord = judge.mode === 'avg' ? '평균' : judge.mode === 'each' ? '각' : '합';
  const sep = judge.mode === 'sum' ? '+' : ', '; // 합만 더하기(+), 평균/각은 나열
  const basis = judge.used.map((u) => `${u.area} ${u.grade}`).join(sep);
  return (
    <p className="px-4 pb-1 text-xs text-slate-600">
      {judge.mode === 'each' ? `내 모의 상위 ${judge.count}개 최대 ` : `내 모의 ${judge.count}개 ${modeWord} `}
      <b className={judge.verdict === 'meet' ? 'text-emerald-700' : 'text-red-700'}>{judge.value}</b>
      {' '}/ 기준 {judge.mode === 'each' ? `각 ${judge.threshold} 이하` : judge.threshold}
      <span className="text-slate-400"> ({basis})</span>
    </p>
  );
}

// 수능최저 원문 — 학과별 조건을 줄바꿈으로 분리 표시, 판정에 쓴(내 학과) 조건 강조.
// 매칭이 틀렸을 수 있으므로 전체 분기를 항상 노출해 직접 확인 가능하게 한다.
function CsatText({ csat, appliedText }: { csat: string; appliedText: string | null }) {
  const blocks = splitCsatBlocks(csat);
  // 분기 없으면(블록 1개거나 라벨 없음) 원문 그대로
  const labeled = blocks.filter((b) => b.labels.length > 0);
  if (labeled.length === 0) {
    return <p className="text-[11px] text-slate-500 leading-snug">{csat}</p>;
  }
  // 판정에 쓴 조건 식별: appliedText 가 그 블록 text 에 포함되면 강조
  const norm = (s: string) => s.replace(/\s/g, '');
  const appliedNorm = appliedText ? norm(appliedText) : null;
  return (
    <div className="space-y-0.5">
      {blocks.map((b, i) => {
        const isApplied = appliedNorm != null && b.text && norm(b.text).includes(appliedNorm);
        return (
          <div
            key={i}
            className={`text-[11px] leading-snug rounded px-1 -mx-1 ${
              isApplied ? 'bg-amber-100/70 text-slate-700 font-medium' : 'text-slate-500'
            }`}
          >
            {b.labels.length > 0 && (
              <span className="font-semibold text-slate-600">{b.labels.join(', ')}: </span>
            )}
            {b.text}
            {isApplied && <span className="text-amber-600 text-[9px] ml-1">← 내 학과</span>}
          </div>
        );
      })}
    </div>
  );
}

// 수능최저 판정 보류 시 — 학생 영역별 모의 등급을 칩으로 제공 (사람이 직접 대조)
function MockGradeStrip({ mock }: { mock: { academicYear: number | null; examMonth: number | null; subjects: MockSubject[] } }) {
  const byArea = mockByArea(mock.subjects);
  if (byArea.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] text-slate-400 mb-0.5">
        내 모의 영역별 등급
        {mock.academicYear && <span> ({mock.academicYear}.{mock.examMonth})</span>}
      </p>
      <div className="flex flex-wrap gap-1">
        {byArea.map((b) => (
          <span key={`${b.area}-${b.subject}`} className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded border border-slate-200 bg-white/70">
            <span className="font-medium text-slate-600">{b.area}</span>
            {b.area === '탐' && <span className="text-[9px] text-slate-400">{b.subject}</span>}
            <span className="font-bold text-slate-800">{b.grade}등급</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white px-2 py-2.5 text-center">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="text-base font-bold text-slate-800 leading-tight">{value}</div>
      {hint && <div className="text-[9px] text-slate-400 truncate">{hint}</div>}
    </div>
  );
}

// 계산 근거 과목 — 학년·학기별로 묶어 과목명·등급·단위·진로선택 표시.
// isFiveTier(1·2학년): 위험도는 전과목 평균으로 계산하고 여기선 "현재까지 기록"만 표시.
function UsedSubjects({ result, isFiveTier = false }: { result: import('../utils/naesinRule').NaesinResult; isFiveTier?: boolean }) {
  const byTerm = new Map<string, typeof result.usedSubjects>();
  for (const s of result.usedSubjects) {
    const key = `${s.grade}-${s.semester}`;
    if (!byTerm.has(key)) byTerm.set(key, []);
    byTerm.get(key)!.push(s);
  }
  const terms = Array.from(byTerm.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 space-y-1.5">
      {isFiveTier ? (
        <p className="text-[10.5px] text-slate-500 bg-slate-50 rounded px-2 py-1">
          ※ 1·2학년은 위험도를 전과목 평균으로 계산하며, 아래는 현재까지 기록된 과목입니다(전형별 반영방법 미적용).
        </p>
      ) : result.careerOmitted && (
        <p className="text-[10.5px] text-amber-700 bg-amber-50 rounded px-2 py-1">
          ※ 이 전형은 진로선택 반영방법이 명시돼 있지 않아 <b>석차등급 과목만</b> 반영했습니다.
          진로선택 과목은 아래 제외 목록에 성취도와 함께 표시됩니다.
        </p>
      )}
      {terms.map(([term, subs]) => {
        const [g, sem] = term.split('-');
        return (
          <div key={term}>
            <div className="text-[10px] font-semibold text-slate-400 mb-0.5">{g}학년 {sem}학기</div>
            <div className="flex flex-wrap gap-1">
              {subs.map((s, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded border ${
                    s.isCareer ? 'bg-violet-50 border-violet-100 text-violet-700' : 'bg-slate-50 border-slate-100 text-slate-600'
                  }`}
                  title={s.isCareer
                    ? `진로선택 · 성취도 ${s.achievement} → ${s.appliedGrade}등급 환산`
                    : `석차 ${s.rank}등급 · 성취도 ${s.achievement ?? '-'}`}
                >
                  <span className="font-medium">{s.subject}</span>
                  {/* 성취도(A~E) 항상 표시 — 진로선택은 환산 근거가 됨 */}
                  {s.achievement && (
                    <span className="text-[9px] font-semibold opacity-70">{s.achievement}</span>
                  )}
                  {s.isCareer ? (
                    <span className="font-bold">→{s.appliedGrade}등급</span>
                  ) : (
                    <span className="font-bold">{s.appliedGrade}등급</span>
                  )}
                  <span className="text-slate-400">{s.units}단위</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-slate-400 pt-0.5">
        총 {result.usedSubjects.length}과목{isFiveTier ? ' 기록' : ' 반영'}
        {result.usedSubjects.some((s) => s.isCareer) && ' · 보라색=진로선택 성취도 환산'}
      </p>
      {/* 제외 과목 — "전 과목인데 왜 일부만?" 투명하게 (사유별 묶음) */}
      {result.excludedSubjects.length > 0 && (
        <div className="pt-1 border-t border-slate-100">
          <div className="text-[10px] font-semibold text-slate-400 mb-0.5">
            제외 {result.excludedSubjects.length}과목
          </div>
          <div className="flex flex-wrap gap-1">
            {result.excludedSubjects.map((s, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-100 bg-slate-50/50 text-slate-400"
                title={`${s.grade}-${s.semester} · ${s.subjectGroup} · ${s.reason}`}
              >
                <span className="line-through decoration-slate-300">{s.subject}</span>
                {/* 등급·성취도 표시 — 제외가 타당한지 사용자가 검증 */}
                {s.achievement && <span className="text-[9px] font-semibold">{s.achievement}</span>}
                {s.rank != null
                  ? <span className="font-bold">{s.rank}등급</span>
                  : s.appliedGrade != null
                    ? <span className="font-bold">{s.appliedGrade}등급</span>
                    : null}
                {s.units ? <span className="text-[9px]">{s.units}단위</span> : null}
                <span className="text-[9px] text-slate-400">· {s.reason}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-xs font-semibold text-slate-700">{title}</span>
      </div>
      <div className="pl-5.5">{children}</div>
    </div>
  );
}

function FactorBar({ name, value }: { name: string; value: number | null | undefined }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-700 w-28 truncate shrink-0">{name}</span>
      {value != null ? (
        <div className="flex-1 flex items-center gap-1.5">
          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-purple-400" style={{ width: `${Math.min(100, value)}%` }} />
          </div>
          <span className="text-slate-500 w-9 text-right">{value}%</span>
        </div>
      ) : (
        <span className="text-slate-400 text-[11px]">반영</span>
      )}
    </div>
  );
}

// 면접 블록 — 전형별 평가요소 + 기출질문(접이식)
function InterviewBlocks({ blocks }: { blocks: InterviewBlock[] | null }) {
  const list = (blocks ?? []).filter(Boolean);
  if (list.length === 0) return null;
  // 대표 1개 블록만 (가장 평가요소가 많은 것). 여러 전형 면접이 비슷하므로 1개로 충분.
  const block = [...list].sort((a, b) => (b?.factors?.length ?? 0) - (a?.factors?.length ?? 0))[0];
  if (!block?.factors?.length) return null;

  return (
    <div className="space-y-1.5">
      {block.process && <p className="text-[11px] text-slate-400">{block.process}</p>}
      {block.factors.map((f, i) => (
        <InterviewFactorRow key={i} factor={f} />
      ))}
    </div>
  );
}

function InterviewFactorRow({ factor }: { factor: InterviewFactor }) {
  const [open, setOpen] = useState(false);
  const questions = (factor.questions ?? []).filter((q) => q && q.length > 10);
  return (
    <div className="text-xs">
      <div className="flex items-center gap-2">
        <span className="text-slate-700 w-28 truncate shrink-0">{factor.name}</span>
        {factor.value != null && (
          <div className="flex-1 flex items-center gap-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-indigo-400" style={{ width: `${Math.min(100, factor.value)}%` }} />
            </div>
            <span className="text-slate-500 w-9 text-right">{factor.value}%</span>
          </div>
        )}
        {questions.length > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-0.5 text-[10px] text-indigo-500 hover:text-indigo-700 shrink-0"
          >
            <MessageSquareQuote className="h-3 w-3" /> 기출 {questions.length}
          </button>
        )}
      </div>
      {factor.items && <p className="text-[10.5px] text-slate-400 ml-0 mt-0.5">{factor.items}</p>}
      {open && questions.length > 0 && (
        <ul className="mt-1 space-y-1 pl-2 border-l-2 border-indigo-100">
          {questions.map((q, i) => (
            <li key={i} className="text-[11px] text-slate-600 leading-snug">“{q}”</li>
          ))}
        </ul>
      )}
    </div>
  );
}
