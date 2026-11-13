import { useMemo } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Star, Target, Maximize2,
  AlertCircle, AlertTriangle, ArrowUp, ArrowDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  FIT_COLORS, FIT_LABELS, MAX_APPLY_SLOTS, MAX_TOTAL_SLOTS,
  TRACK_SHORT_LABELS, type WishlistItem, type WishlistTier,
} from '../types';
import { CSAT_COLORS, CSAT_LABELS } from '../utils/csat';
import { computeItemInsight, type StudentContext } from '../utils/itemInsight';
import { applyOverflow, isTotalFull, remainingSlots } from '../utils/tierRules';

interface Props {
  applyItems: WishlistItem[];
  interestItems: WishlistItem[];
  ctx: StudentContext;
  canEdit: boolean;
  busy?: boolean;
  /** 총합(지원희망+관심대학)이 가득 찼는지 — 추가만 막고 이동은 막지 않는다 */
  totalFull?: boolean;
  onAdd: (tier: WishlistTier) => void;
  onOpen: (item: WishlistItem) => void;
  onDelete: (item: WishlistItem) => void;
  onMoveTier: (item: WishlistItem, tier: WishlistTier) => void;
  onReorder: (orderedIds: string[]) => void;
}

/**
 * 지원 목록 — **지원희망과 관심대학을 한 표에 합친 리스트**.
 *
 * 카드 그리드에서 리스트로, 두 영역에서 한 영역으로 옮긴 이유(2026-09-01 사용자 결정):
 * 두 묶음을 각각 카드로 그리면 화면이 둘로 갈라져 "지금 몇 곳을 보고 있는지"가 흐려진다.
 * 한 줄 한 항목으로 세로로 이으면 전체가 한눈에 들어오고, **지원희망을 위에 두고
 * 배경색으로 구분**하면 두 층이 섞이지도 않는다.
 *
 * 지원희망은 빈 자리까지 그린다 — 수시 6회 제한이 곧 전략이라 "몇 자리 남았나"가
 * 목록에서 가장 먼저 읽혀야 한다.
 */
export function WishlistList({
  applyItems, interestItems, ctx, canEdit, busy, totalFull,
  onAdd, onOpen, onDelete, onMoveTier, onReorder,
}: Props) {
  const counts = { apply: applyItems.length, interest: interestItems.length };
  const full = totalFull ?? isTotalFull(counts);
  const left = remainingSlots(counts);
  const applyIds = useMemo(() => applyItems.map((i) => i.id), [applyItems]);
  const move = (index: number, delta: number) => {
    const next = [...applyIds];
    const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    onReorder(next);
  };

  const emptySlots = Math.max(0, MAX_APPLY_SLOTS - applyItems.length);
  const over = applyOverflow(applyItems.length);

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      {/* ── 지원희망 ── */}
      <GroupHeader
        icon={<Target className="h-4 w-4 text-brand-500" />}
        title="지원희망 대학"
        count={applyItems.length}
        max={MAX_APPLY_SLOTS}
        hint="수시 6회 지원 제한"
        warn={over > 0}
        action={
          canEdit ? (
            <Button
              size="sm"
              className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700"
              onClick={() => onAdd('apply')}
              disabled={full}
              title={full ? `지원희망·관심대학을 합쳐 최대 ${MAX_TOTAL_SLOTS}곳입니다` : undefined}
            >
              <Plus className="h-3.5 w-3.5 mr-0.5" /> 대학 추가
            </Button>
          ) : null
        }
      />

      {over > 0 && (
        <div className="flex items-start gap-1.5 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>
            수시는 최대 <b>{MAX_APPLY_SLOTS}회</b>까지 지원할 수 있습니다. 지금 <b>{over}곳</b>이 초과되어 있으니
            원서 접수 전에 순서를 조정해 정리하세요.
          </span>
        </div>
      )}

      {/* 배경색이 두 층을 가른다 — 지원희망은 옅은 브랜드 톤 */}
      <ul className="divide-y divide-slate-100 bg-brand-50/40">
        {applyItems.map((item, i) => (
          <Row
            key={item.id}
            item={item}
            ctx={ctx}
            rank={i + 1}
            tier="apply"
            overLimit={i >= MAX_APPLY_SLOTS}
            canEdit={canEdit}
            busy={busy}
            canMoveUp={i > 0}
            canMoveDown={i < applyItems.length - 1}
            onOpen={() => onOpen(item)}
            onDelete={() => onDelete(item)}
            onMoveTier={() => onMoveTier(item, 'interest')}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
          />
        ))}
        {Array.from({ length: emptySlots }, (_, i) => (
          <EmptyRow
            key={`empty-${i}`}
            rank={applyItems.length + i + 1}
            canEdit={canEdit}
            onAdd={() => onAdd('apply')}
          />
        ))}
      </ul>

      {/* ── 관심대학 ── */}
      <GroupHeader
        icon={<Star className="h-4 w-4 text-violet-500" />}
        title="관심대학"
        count={interestItems.length}
        max={null}
        hint={`결정 전에 담아 두는 후보 · 전체 ${counts.apply + counts.interest}/${MAX_TOTAL_SLOTS}`}
        warn={full}
        action={
          canEdit ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => onAdd('interest')}
              disabled={full}
              title={full ? `지원희망·관심대학을 합쳐 최대 ${MAX_TOTAL_SLOTS}곳입니다` : `관심대학 담기 (${left}곳 남음)`}
            >
              <Plus className="h-3.5 w-3.5 mr-0.5" /> 담기
            </Button>
          ) : null
        }
      />
      {interestItems.length === 0 ? (
        <p className="px-3 py-3 text-[11.5px] text-slate-400 text-center">
          아직 담아둔 관심대학이 없습니다. 지원을 결정하기 전 후보를 담아 두고 비교해 보세요.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {interestItems.map((item) => (
            <Row
              key={item.id}
              item={item}
              ctx={ctx}
              rank={null}
              tier="interest"
              overLimit={false}
              canEdit={canEdit}
              busy={busy}
              canMoveUp={false}
              canMoveDown={false}
              onOpen={() => onOpen(item)}
              onDelete={() => onDelete(item)}
              onMoveTier={() => onMoveTier(item, 'apply')}
              onMoveUp={() => {}}
              onMoveDown={() => {}}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ───────────────────────── 부품 ───────────────────────── */

function GroupHeader({
  icon, title, count, max, hint, warn, action,
}: {
  icon: React.ReactNode; title: string; count: number;
  /** 칸 자체의 상한. `null` 이면 개수만 적는다(관심대학은 총합으로만 제한된다) */
  max: number | null;
  hint: string; warn: boolean; action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <h2 className="text-sm font-bold text-slate-800 shrink-0">{title}</h2>
        <span
          className={`text-[11px] font-medium rounded-full px-2 py-0.5 tabular-nums shrink-0 ${
            warn ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-500 border border-slate-200'
          }`}
        >
          {max == null ? count : `${count}/${max}`}
        </span>
        <span className="text-[11px] text-slate-400 truncate hidden sm:inline">{hint}</span>
      </div>
      <span className="print:hidden">{action}</span>
    </div>
  );
}

function EmptyRow({ rank, canEdit, onAdd }: { rank: number; canEdit: boolean; onAdd: () => void }) {
  return (
    <li className="print:hidden">
      <button
        type="button"
        onClick={canEdit ? onAdd : undefined}
        disabled={!canEdit}
        className="flex w-full items-center gap-2 px-3 py-2 text-slate-300 transition-colors enabled:hover:bg-blue-50/50 enabled:hover:text-blue-500 disabled:cursor-default"
      >
        <span className="w-[1.6rem] shrink-0 text-[11px] font-semibold text-slate-400 text-center">{rank}</span>
        <span className="flex items-center gap-1 text-[11.5px]">
          {canEdit && <Plus className="h-3.5 w-3.5" />} 비어 있음
        </span>
      </button>
    </li>
  );
}

function Row({
  item, ctx, rank, tier, overLimit, canEdit, busy, canMoveUp, canMoveDown,
  onOpen, onDelete, onMoveTier, onMoveUp, onMoveDown,
}: {
  item: WishlistItem;
  ctx: StudentContext;
  rank: number | null;
  tier: WishlistTier;
  overLimit: boolean;
  canEdit: boolean;
  busy?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onMoveTier: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const insight = useMemo(() => computeItemInsight(item, ctx), [item, ctx]);
  const cut70 = item.adiga?.grade70 ?? null;
  const mine = insight.comparableGrade;
  const csatVerdict = insight.csatHeadline.verdict;

  return (
    <li className="group flex items-center gap-2 px-3 py-2 hover:bg-white/70 transition-colors">
      {/* 지망 번호 / 관심 표시 */}
      <span
        className={`w-[1.6rem] shrink-0 inline-flex h-5 items-center justify-center rounded text-[11px] font-bold ${
          overLimit ? 'bg-amber-100 text-amber-700'
            : tier === 'apply' ? 'bg-brand-100 text-brand-700'
            : 'bg-violet-100 text-violet-700'
        }`}
        title={overLimit ? '수시 6회 제한 초과' : tier === 'apply' ? `${rank}지망` : '관심대학'}
      >
        {rank ?? <Star className="h-3 w-3" />}
      </span>

      {/* 적합도 */}
      <span className={`shrink-0 w-[3.2rem] text-center text-[10px] font-bold px-1 py-0.5 rounded border ${FIT_COLORS[insight.fit]}`}>
        {FIT_LABELS[insight.fit]}
      </span>

      {/* 대학 · 학과 · 전형 — 좁아지면 여기만 줄어야 하므로 min-w-0 */}
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 text-left"
        title={[item.university, item.department, item.admissionName].filter(Boolean).join(' · ')}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-[12.5px] font-semibold text-slate-800 truncate">{item.university}</span>
          <span className="shrink-0 text-[9.5px] font-medium text-slate-500 border border-slate-200 rounded px-1 py-px bg-white">
            {TRACK_SHORT_LABELS[item.track]}
          </span>
          {insight.naesinWithheld && (
            <span className="shrink-0 flex items-center gap-0.5 text-[9px] text-amber-600" title="전형 반영 내신 계산 보류">
              <AlertCircle className="h-2.5 w-2.5" />
            </span>
          )}
        </span>
        <span className="block text-[11px] text-slate-500 truncate">
          {item.department ?? '학과 미지정'}
          {item.admissionName && <span className="text-slate-400"> · {item.admissionName}</span>}
        </span>
      </button>

      {/* 수치 — 폭 고정. 좁은 화면에서는 감춰 대학명이 잘리지 않게 한다 */}
      <span className="hidden sm:flex shrink-0 items-center gap-3 text-[11px] tabular-nums">
        <span className="w-[5.5rem] text-right" title="내 내신 vs 70%컷">
          <span className={mine != null && cut70 != null ? (mine <= cut70 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold') : 'text-slate-400'}>
            {mine != null ? mine.toFixed(2) : '–'}
          </span>
          <span className="text-slate-300"> / {cut70 ?? '–'}</span>
        </span>
        <span className="w-[3.2rem] text-right text-slate-500" title="2026 경쟁률">
          {item.adiga?.competition_2026 != null ? `${item.adiga.competition_2026}:1` : '–'}
        </span>
        {csatVerdict ? (
          <span className={`w-[3.4rem] text-center text-[9.5px] font-bold px-1 py-0.5 rounded border ${CSAT_COLORS[csatVerdict]}`}
            title={`수능최저 ${CSAT_LABELS[csatVerdict]}${insight.csatHeadline.isManual ? ' (직접 입력)' : ''}`}>
            최저 {CSAT_LABELS[csatVerdict]}
          </span>
        ) : (
          <span className="w-[3.4rem]" />
        )}
      </span>

      {/* 동작 — 폭 고정으로 세로 정렬. 종이에는 필요 없다 */}
      <span className="shrink-0 flex items-center gap-0.5 print:hidden">
        <IconBtn title="상세" onClick={onOpen}><Maximize2 className="h-3.5 w-3.5" /></IconBtn>
        {canEdit && (
          <>
            {tier === 'apply' && (
              <>
                <IconBtn title="지망 순서 올리기" onClick={onMoveUp} disabled={!canMoveUp || busy}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn title="지망 순서 내리기" onClick={onMoveDown} disabled={!canMoveDown || busy}>
                  <ChevronDown className="h-3.5 w-3.5" />
                </IconBtn>
              </>
            )}
            {/* 칸 이동은 총합이 변하지 않으므로 **정원 때문에 막히지 않는다**.
                (구 구현은 칸별 상한이라 관심대학이 가득 차면 내릴 수 없었다.) */}
            <button
              onClick={onMoveTier}
              disabled={busy}
              title={tier === 'apply' ? '관심대학으로 내리기' : '지원희망으로 올리기'}
              className={`flex items-center gap-0.5 rounded px-1.5 py-1 text-[10.5px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                tier === 'apply'
                  ? 'text-slate-500 hover:bg-violet-50 hover:text-violet-600'
                  : 'text-violet-600 hover:bg-violet-50'
              }`}
            >
              {tier === 'apply'
                ? <><ArrowDown className="h-3 w-3" /> 관심</>
                : <><ArrowUp className="h-3 w-3" /> 지원희망</>}
            </button>
            <IconBtn title="삭제" onClick={onDelete} disabled={busy} destructive>
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </>
        )}
      </span>
    </li>
  );
}

function IconBtn({
  title, onClick, disabled, destructive, children,
}: {
  title: string; onClick: () => void; disabled?: boolean;
  destructive?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded p-1 text-slate-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        destructive ? 'hover:bg-rose-50 hover:text-rose-600' : 'hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}
