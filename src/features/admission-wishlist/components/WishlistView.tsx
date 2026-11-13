import { useMemo, useState } from 'react';
import { GraduationCap, Inbox, Plus, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WishlistGuideDialog } from './guide/WishlistGuideDialog';
import { toast } from '@/lib/toast';
import {
  useWishlist, useDeleteWishlistItem, useReorderWishlist, useSetWishlistTier, useCsatRules,
} from '../hooks/useWishlist';
import {
  useStudentNaesin, useStudentSubjects, useStudentMock, useStudentMockRounds,
} from '../hooks/useStudentNaesin';
import { resolveIsFiveTier } from '../utils/naesinScale';
import type { StudentContext } from '../utils/itemInsight';
import type { WishlistItem, WishlistTier } from '../types';
import { addRejectReason, isTotalFull, splitByTier } from '../utils/tierRules';
import { WishlistList } from './WishlistList';
import { ComparisonTable } from './ComparisonTable';
import { ItemDetailDialog } from './ItemDetailDialog';
import { AddProgramDialog } from './AddProgramDialog';

interface Props {
  studentCode: string;
  /** 학생 본인 화면이면 편집 가능, 교사 열람이면 readOnly */
  readOnly: boolean;
  /**
   * [사용 방법] 버튼을 이 안에 그릴지.
   *
   * 교사/admin 뷰는 위에 글래스 `Header` 가 있고 거기 액션 묶음 맨 왼쪽에 같은 버튼이
   * 있으므로 여기서는 그리지 않는다(같은 버튼이 두 개 보이면 어느 쪽이 정본인지 헷갈린다).
   * **학생 뷰는 그 Header 가 없으므로 반드시 켜야 한다** — 끄면 학생은 안내로 가는 길이
   * 아예 사라진다.
   */
  showGuideButton?: boolean;
  /** admin 이 학생을 대신해 편집하는 중인지 (안내 배너 표시용) */
  proxyEditing?: boolean;
  /** 헤더에 표시할 학생 이름 (교사 뷰) */
  studentLabel?: string | null;
}

/** 오류 메시지 추출 — `catch (e: any)` 대신 (any 는 이 저장소 lint 에서 error) */
function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * 수시 지원 관리 화면.
 *
 * 구성이 여러 층인 이유: 지원 결정은 "학교 하나를 자세히 보는 일"이 아니라
 * **여러 학교를 나란히 놓고 고르는 일**이다.
 *   1) 목록   — 지원희망(1~6지망) + 관심대학을 **한 리스트**에 (배경색으로 두 층 구분)
 *   2) 비교표 — 같은 항목을 가로로 맞춘 표 (상담·비교의 실제 도구, 인쇄·엑셀 가능)
 *   3) 상세   — 카드를 모달로 (반영 내신 근거·수능최저 원문·면접 기출)
 *
 * 목록을 하나로 합친 이유(2026-09-01 사용자 결정): 두 묶음을 각각 그리면 화면이 둘로
 * 갈라져 "지금 몇 곳을 보고 있는지"가 흐려진다. 세로로 이으면 전체가 한눈에 들어오고,
 * 지원희망을 위에 두고 배경색으로 나누면 두 층이 섞이지도 않는다.
 * 모든 층이 `utils/itemInsight.ts` 의 같은 계산을 읽으므로 숫자가 갈라지지 않는다.
 *
 * 학생 성적(내신 교과군 요약·모의고사 회차)은 이 화면이 아니라 **우측 성적 패널**
 * (`layout/RightPanel`)이 담당한다 — 지원 목록과 성적은 함께 보되 섞이지 않아야 한다.
 */
export function WishlistView({ studentCode, readOnly, proxyEditing = false, studentLabel, showGuideButton = false }: Props) {
  // 열려 있는 추가 모달이 어느 칸에 담을지 — null 이면 닫힘
  const [addTier, setAddTier] = useState<WishlistTier | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const listQ = useWishlist(studentCode);
  const naesinQ = useStudentNaesin(studentCode);
  const subjectsQ = useStudentSubjects(studentCode);     // 전형 맞춤 계산용 (1회 fetch, 전 화면 공유)
  const mockQ = useStudentMock(studentCode);             // 수능최저 판정용 최신 회차
  const mockRoundsQ = useStudentMockRounds(studentCode); // 6월·9월 회차별 판정용
  const delMut = useDeleteWishlistItem(studentCode);
  const reorderMut = useReorderWishlist(studentCode);
  const tierMut = useSetWishlistTier(studentCode);
  // 수능최저 구조화 규칙 — 학과 분기가 모호해 보류하던 전형을 판정 가능하게 한다
  const csatRulesQ = useCsatRules(
    useMemo(() => (listQ.data ?? []).map((i) => i.gyogwa?.id).filter(Boolean) as string[], [listQ.data]),
  );

  // useMemo 로 감싸는 이유: 아래 ctx/보드/표가 이 배열을 의존성으로 쓰는데,
  // `?? []` 가 매 렌더 새 배열을 만들면 비교표의 초안 동기화 effect가 매 렌더 돈다.
  const items = useMemo(() => listQ.data ?? [], [listQ.data]);

  // 등급 척도 확정 보정 — useStudentNaesin 은 학번 접두사만 보므로 전입생을 오판할 수
  // 있다. 과목 기록이 도착하면 rank≥6(5등급제에서 불가능) 유무로 확정한다.
  const naesin = useMemo(() => {
    const base = naesinQ.data ?? null;
    if (!base) return null;
    const isFiveTier = resolveIsFiveTier(studentCode, subjectsQ.data ?? null);
    return isFiveTier === base.isFiveTier ? base : { ...base, isFiveTier };
  }, [naesinQ.data, subjectsQ.data, studentCode]);

  // 모든 하위 화면이 공유하는 성적 컨텍스트 (학생당 1회 fetch)
  const ctx: StudentContext = useMemo(
    () => ({
      naesin,
      subjects: subjectsQ.data ?? null,
      mock: mockQ.data ?? null,
      mockRounds: mockRoundsQ.data ?? null,
      csatRules: csatRulesQ.data ?? null,
    }),
    [naesin, subjectsQ.data, mockQ.data, mockRoundsQ.data, csatRulesQ.data],
  );

  // 두 칸으로 가른다 (tier 없는 레거시 행은 지원희망으로 본다)
  const { apply: applyItems, interest: interestItems } = useMemo(
    () => splitByTier(items),
    [items],
  );

  const detailItem = useMemo(() => items.find((i) => i.id === detailId) ?? null, [items, detailId]);
  const busy = delMut.isPending || reorderMut.isPending || tierMut.isPending;
  const canEdit = !readOnly;
  const counts = { apply: applyItems.length, interest: interestItems.length };
  const totalFull = isTotalFull(counts);

  const handleDelete = async (item: WishlistItem) => {
    try {
      await delMut.mutateAsync(item.id);
      if (detailId === item.id) setDetailId(null);
      toast.success('삭제했습니다');
    } catch (e) {
      toast.error(`삭제 실패: ${errText(e)}`);
    }
  };

  const handleReorder = async (orderedIds: string[]) => {
    try {
      await reorderMut.mutateAsync(orderedIds);
    } catch (e) {
      toast.error(`순서 변경 실패: ${errText(e)}`);
    }
  };

  /**
   * 칸 이동. 정원 검사는 `utils/tierRules.ts` 한 곳에서 한다 —
   * 지원희망(6)은 넘겨도 경고만, 관심대학(15)은 실제로 막는다.
   */
  /**
   * 칸 이동. **정원 검사가 없다** — 이동은 총합을 바꾸지 않으므로 막힐 이유가 없다.
   * (구 구현은 칸별 상한이라 관심대학이 가득 차면 지원희망을 내릴 수 없었다.)
   */
  const handleMoveTier = async (item: WishlistItem, tier: WishlistTier) => {
    try {
      await tierMut.mutateAsync({ id: item.id, tier });
      toast.success(tier === 'apply' ? '지원희망으로 옮겼습니다' : '관심대학으로 옮겼습니다');
    } catch (e) {
      toast.error(`이동 실패: ${errText(e)}`);
    }
  };

  /** 담기 — 총합이 찼으면 모달을 열지 않고 이유를 알린다 (칸과 무관하게 총합만 본다) */
  const openAdd = (tier: WishlistTier) => {
    const reason = addRejectReason(counts);
    if (reason) {
      toast.error(reason);
      return;
    }
    setAddTier(tier);
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <GraduationCap className="h-5 w-5 text-brand-500 shrink-0" />
          <h1 className="text-lg font-bold text-slate-800 truncate">
            수시 지원 관리
            {studentLabel && (
              <span className="text-slate-400 font-normal text-base ml-2">· {studentLabel}</span>
            )}
          </h1>
        </div>

        {/* 사용 방법 — 위에 글래스 Header 가 없는 화면(학생 뷰)에서만 그린다.
            교사/admin 뷰는 Header 의 액션 묶음 맨 왼쪽에 같은 버튼이 있다.
            `print:hidden` 은 남겨 둔다 — 인쇄 대상은 비교표(`comparison-print-area`)뿐이라
            지금은 무영향이지만, 인쇄 범위를 다시 넓힐 때 이 버튼이 종이에 새는 것을 막는다. */}
        {showGuideButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setGuideOpen(true)}
            title="사용 방법"
            className="h-8 shrink-0 gap-1.5 px-2 text-xs text-slate-500 hover:text-slate-700 print:hidden"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">사용 방법</span>
          </Button>
        )}
      </div>

      {proxyEditing && canEdit && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 print:hidden">
          관리자 권한으로 <b>{studentLabel ?? '이 학생'}</b>의 지원 목록을 대신 편집하고 있습니다. 추가·수정·삭제가 즉시 저장됩니다.
        </div>
      )}

      {listQ.isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">불러오는 중...</div>
      ) : listQ.isError ? (
        <div className="text-center py-16 text-red-400 text-sm">불러올 수 없습니다.</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Inbox className="h-10 w-10 text-slate-300 mx-auto" />
          <p className="text-sm text-slate-400">
            {readOnly ? '저장된 수시 지원 학교가 없습니다.' : '아직 저장한 수시 지원 학교가 없습니다.'}
          </p>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => openAdd('apply')}>
              <Plus className="h-4 w-4 mr-1" /> 첫 대학 추가하기
            </Button>
          )}
        </div>
      ) : (
        <>
          <WishlistList
            applyItems={applyItems}
            interestItems={interestItems}
            ctx={ctx}
            canEdit={canEdit}
            busy={busy}
            totalFull={totalFull}
            onAdd={openAdd}
            onOpen={(item) => setDetailId(item.id)}
            onDelete={handleDelete}
            onMoveTier={handleMoveTier}
            onReorder={handleReorder}
          />

          {/* 비교표는 지망만 — 관심대학은 아직 '후보를 담아 두는' 단계다 */}
          <ComparisonTable
            studentCode={studentCode}
            items={applyItems}
            ctx={ctx}
            canEdit={canEdit}
            studentLabel={studentLabel}
          />
        </>
      )}

      {canEdit && (
        <AddProgramDialog
          open={addTier !== null}
          onOpenChange={(o) => { if (!o) setAddTier(null); }}
          studentCode={studentCode}
          tier={addTier ?? 'apply'}
        />
      )}

      <ItemDetailDialog
        item={detailItem}
        ctx={ctx}
        readOnly={readOnly}
        onOpenChange={(o) => { if (!o) setDetailId(null); }}
        onDelete={(id) => {
          const target = items.find((i) => i.id === id);
          if (target) void handleDelete(target);
        }}
        deleting={delMut.isPending}
      />
      <WishlistGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  );
}
