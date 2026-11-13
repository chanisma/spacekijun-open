/**
 * 문서 생성 페이지의 **실행·검수 이력 서랍** (우측, 기본 열림).
 *
 * ── 왜 페이지로 옮겼나 ─────────────────────────────────────────────────────
 * 문서 생성 메뉴는 러너를 **계획 검토부터** 연다(양식 단계를 건너뛴다). 그런데 종전에는
 * 실행 이력이 러너 안 서랍에만 있어서, 러너를 열어야만 "내가 뭘 만들었는지" 를 볼 수 있었다.
 * 지금은 페이지에 두고 러너 쪽 서랍은 감춘다(`hideHistory`) — 같은 이력이 두 곳에 생기면
 * 어느 것이 최신인지 알 수 없다.
 *
 * ── 범위: 전체 + 자체 필터 (2026-09-04 사용자 결정) ────────────────────────
 * 서랍이 **기본으로 열려 있으므로** 기본 화면은 내 전체 이력이다. 좁혀 보고 싶을 때는
 * **서랍 안의 선택기**로 생성 방식을 고른다 — 필터를 카드 쪽 버튼으로 두지 않는 이유는,
 * 카드는 "이 방식으로 문서를 만든다"는 자리이지 이력을 조작하는 자리가 아니기 때문이다.
 * 필터는 **받아 온 뒤 화면에서** 건다(선택마다 다시 받으면 목록이 깜빡인다).
 *
 * ── 삭제 (2026-09-23 사용자 요구) ──────────────────────────────────────────
 * 줄마다 휴지통. 서버는 **내 RUN 만** 지우고(`delete_task_action_run`, `created_by` 기준)
 * 상태 가드는 없다 — 라이브 DB 실측으로 확인했다(마이그레이션 파일에는 가드가 남아 있는데
 * DB 에는 `-- 상태 가드 없음(2026-08-14)` 로 바뀌어 있다. **파일만 보면 "실행 중은 못
 * 지운다"는 틀린 UI 를 만든다**). 그래서 진행 중 RUN 도 지울 수 있고, 다만 확인창이
 * 그 경우를 따로 경고한다.
 *
 * **무엇이 사라지는지 말한다**(`DocGenDeleteDialog` 와 같은 규약) — cascade 대상은 실측상
 * `artifact`·`check`·`review`·`run_log` 넷이고 **완성 문서(`task_action_document`)는 RUN 에
 * 매달려 있지 않아 남는다**. "정말 삭제할까요?"만 묻는 확인은 아무것도 알려 주지 않는다.
 */
import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardCheck, Loader2, Play, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/toast';
import { useDeleteDocGenRun } from '../hooks/useDocGenActions';
import type { TaskAction, TaskActionRunWithDetails } from '@/features/task-workflow/types';

export const DOCGEN_HISTORY_W = 300;

/** RUN 상태 → 사람이 읽는 말. `needs_review` 가 기본 종료 상태라 '검수 대기'가 정상이다 */
const STATUS: Record<string, { label: string; cls: string }> = {
  running: { label: '진행 중', cls: 'border-blue-200 bg-blue-50 text-blue-700' },
  needs_review: { label: '검수 대기', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  passed: { label: '완료', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  failed: { label: '실패', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
};

function when(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface Props {
  open: boolean;
  onToggle: () => void;
  runs: TaskActionRunWithDetails[];
  isLoading: boolean;
  /** 목록에 선 생성 방식 — 필터 선택지이자 줄마다 붙일 이름의 출처 */
  actions: TaskAction[];
  /**
   * 카드에 쓰는 이름(action.id → 라벨). 캔버스에서 만들어진 방식은 제목이 유형 이름
   * ('HWPX 스펙 기반 문서 생성')뿐이라, 그대로 적으면 줄마다 같은 말이 선다 —
   * 목록 규칙(`docGenActionLabel`)이 정한 이름을 그대로 쓴다.
   */
  workLabels?: Map<string, string>;
  /** 이 RUN 을 러너에서 이어서 진행 */
  onResume: (actionId: string, run: TaskActionRunWithDetails) => void;
}

export const DocGenHistoryDrawer: React.FC<Props> = ({
  open, onToggle, runs, isLoading, actions, workLabels, onResume,
}) => {
  const [filterId, setFilterId] = useState<string>('');
  /** 삭제 확인 중인 RUN. 되돌릴 수 없는 동작이라 한 번 묻는다. */
  const [pendingDelete, setPendingDelete] = useState<TaskActionRunWithDetails | null>(null);
  const deleteRun = useDeleteDocGenRun();
  const workTitles = useMemo(
    () => new Map(actions.map((w) => [w.id, workLabels?.get(w.id) ?? w.title])),
    [actions, workLabels],
  );
  const visible = useMemo(
    () => (filterId ? runs.filter((r) => r.action_id === filterId) : runs),
    [runs, filterId],
  );

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteRun.mutateAsync(pendingDelete.id);
      setPendingDelete(null);
      // 목록에서 줄이 사라지는 것만으로는 "지워졌다"가 분명하지 않다 — 되돌릴 수 없는
      // 동작이라 한 번 말해 준다(CLAUDE.md 토스트 규약의 "되돌리기 어려운 행위").
      toast.success('실행·검수 이력을 삭제했습니다.');
    } catch (error) {
      // 실패하면 모달을 **닫지 않는다** — 닫으면 사용자는 지워진 줄 안다.
      toast.error(error instanceof Error ? error.message : '실행 이력을 삭제하지 못했습니다.');
    }
  };

  return (
    <>
      {/* 서랍 토글 — 러너 다이얼로그와 같은 반원 버튼(같은 역할은 같은 모양) */}
      <button
        type="button"
        onClick={onToggle}
        className="absolute top-1/2 z-20 hidden h-10 w-5 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-slate-200/80 bg-white text-slate-400 shadow-sm transition-all duration-200 hover:text-blue-600 hover:shadow-md lg:flex"
        style={{ right: open ? DOCGEN_HISTORY_W : 0, opacity: 0.85 }}
        title={open ? '내 실행·검수 이력 숨기기' : '내 실행·검수 이력 보기'}
      >
        {open ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      {/* 접힘은 width 0 — 콘텐츠는 고정폭 래퍼로 찌그러짐을 막는다 */}
      {/* 페이지는 세로로 길게 흐르므로 서랍은 **sticky** 로 화면에 붙여 둔다 —
          목록을 아래로 내려도 이력이 따라온다(러너 안 서랍은 고정 높이라 이 처리가 없었다) */}
      <aside
        className="sticky top-0 hidden h-[calc(100vh-5rem)] shrink-0 border-l border-slate-100 bg-slate-50/70 lg:block"
        style={{ width: open ? DOCGEN_HISTORY_W : 0, overflow: 'hidden' }}
      >
        <div className="h-full overflow-y-auto p-4" style={{ width: DOCGEN_HISTORY_W }}>
          <div className="mb-1 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-700">내 실행·검수 이력</h3>
          </div>

          {/* 생성 방식 필터 — 기본은 전체. 건수를 함께 적어 "이력이 없다"는 오해를 막는다 */}
          <div className="mb-3 space-y-1.5">
            <select
              value={filterId}
              onChange={(e) => setFilterId(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
            >
              <option value="">전체 생성 방식</option>
              {actions.map((w) => (
                <option key={w.id} value={w.id}>{workTitles.get(w.id) ?? w.title}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400">{visible.length}건</p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <p className="py-8 text-center text-xs leading-relaxed text-slate-400">
              {filterId ? '이 생성 방식으로 만든 문서가 아직 없습니다.' : '아직 실행 이력이 없습니다.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {visible.map((run) => {
                const tone = STATUS[run.status] ?? { label: run.status, cls: 'border-slate-200 bg-white text-slate-500' };
                return (
                  <li
                    key={run.id}
                    className="group rounded-lg border border-slate-200 bg-white p-2.5 transition-colors hover:border-blue-200"
                  >
                    {/* 전체 목록에서는 어느 생성 방식의 실행인지가 가장 먼저 필요하다 */}
                    {!filterId && (
                      <p className="mb-1 truncate text-[11px] font-medium text-slate-600"
                         title={workTitles.get(run.action_id)}>
                        {workTitles.get(run.action_id) ?? '(삭제된 생성 방식)'}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium', tone.cls)}>
                        {tone.label}
                      </span>
                      <span className="text-[11px] tabular-nums text-slate-400">{when(run.created_at)}</span>
                      {/* 폭이 300px 뿐이라 동작 둘은 hover 로 드러낸다(줄마다 상시 노출하면
                          시각·날짜가 밀린다). `focus-visible` 도 함께 열어 키보드로도 닿는다 */}
                      <Button
                        variant="ghost" size="sm"
                        className="ml-auto h-6 shrink-0 px-1.5 text-[10px] text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => onResume(run.action_id, run)}
                        title="이 실행의 양식·입력값을 그대로 불러와 이어서 만듭니다"
                      >
                        <Play className="mr-0.5 h-3 w-3" />이어서
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-6 w-6 shrink-0 text-slate-300 opacity-0 transition-opacity hover:text-rose-600 group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => setPendingDelete(run)}
                        title="이 실행·검수 이력 삭제"
                        aria-label={`${when(run.created_at)} 실행 이력 삭제`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* 확인 — 되돌릴 수 없으므로 «무엇이 사라지고 무엇이 남는지» 말한다.
          바깥 서랍은 닫지 않는다(겹쳐 띄우기 — `docs/nested-modal-pitfalls.md`). */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => { if (!o && !deleteRun.isPending) setPendingDelete(null); }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                <Trash2 className="h-4 w-4" />
              </span>
              실행·검수 이력 삭제
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-1 text-xs leading-relaxed text-slate-500">
              {pendingDelete && (
                <>
                  <span className="font-medium text-slate-700">
                    {workTitles.get(pendingDelete.action_id) ?? '(삭제된 생성 방식)'}
                  </span>
                  {' · '}
                  <span className="tabular-nums">{when(pendingDelete.created_at)}</span> 실행을
                  삭제합니다. 되돌릴 수 없습니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs leading-relaxed text-slate-600">
            {/* 진행 중은 예외 상황이라 먼저 말한다 — 대개는 중단돼 갇힌 유령 행이다 */}
            {(pendingDelete?.status === 'running' || pendingDelete?.status === 'created') && (
              <p className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
                아직 끝나지 않은 실행입니다. 삭제하면 진행 중이던 작업은 마무리되지 못합니다.
              </p>
            )}
            <p>
              이 실행의 <b className="font-semibold text-slate-800">검증·결과·타임라인 기록과
              결과 파일</b>이 함께 삭제됩니다.
            </p>
            {/* 가장 걱정되는 것을 먼저 덜어 준다 — 완성 문서는 RUN 에 매달려 있지 않다 */}
            <p className="text-slate-500">
              이미 저장한 <b className="font-semibold text-emerald-700">완성 문서는 남습니다</b> —
              [완성 문서] 목록에서 계속 볼 수 있습니다.
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteRun.isPending} className="h-8 text-xs">취소</AlertDialogCancel>
            <AlertDialogAction
              className="h-8 gap-1.5 bg-rose-600 text-xs text-white hover:bg-rose-700"
              disabled={deleteRun.isPending}
              onClick={(e) => {
                // 기본 동작은 «즉시 닫기» 다 — 먼저 막아야 실패했을 때 모달이 남는다
                // (`docs/nested-modal-pitfalls.md` 규약 ②).
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleteRun.isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />삭제 중</>
                : <><Trash2 className="h-3.5 w-3.5" />삭제</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default DocGenHistoryDrawer;
