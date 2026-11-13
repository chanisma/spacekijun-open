// ========================================
// 생성 방식 삭제 확인 (2026-09-08 신설)
//
// "정말 삭제할까요?"만 묻는 확인은 아무것도 알려 주지 않는다. 이 삭제는 카드 하나를
// 넘어서기 때문에 **무엇이 사라지는지 숫자로** 말한다(전자서명 요청 삭제와 같은 규약):
//
//   · 행이 **하드 삭제**되므로 연결된 업무의 WORK 목록에서도 사라진다 (사용자 요구사항)
//   · 그 업무의 **값 제출 양식**이면 담당자가 제출할 수 없게 된다
//   · 실행 이력은 CASCADE 로 사라진다. 남이 실행한 건의 **결과 파일**은 남는다
//     (`delete_task_action_run` 이 내 RUN 만 지우고, 남의 Storage 파일은 애초에 못 지운다)
//   · 완성 문서는 **지워지지 않는다** — `task_action_document.action_id` 가 SET NULL 이라
//     남지만 `action_id` 로 찾는 [완성 문서] 목록에서 영영 사라진다. 이게 가장 놓치기 쉽다.
//
// 숫자의 정확도가 서로 다르다(서비스 `DocGenActionImpact` 주석 참조) — 완성 문서는 RLS 상
// **내 것만** 셀 수 있으므로 문구도 "내가 저장한" 이라고 적는다. 셀 수 없는 것을 센 척하지 않는다.
// ========================================

import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
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
import type { TaskAction } from '@/features/task-workflow/types';
import { useDocGenActionImpact } from '../hooks/useDocGenActions';

export function DocGenDeleteDialog({
  action,
  label,
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: {
  action: TaskAction | null;
  /** 카드에 보이는 이름 — 확인 문구가 카드와 같은 말을 해야 한다 */
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}) {
  const { data: impact, isLoading } = useDocGenActionImpact(open ? action : null);

  if (!action) return null;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !isDeleting && onOpenChange(o)}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <Trash2 className="h-4 w-4" />
            </span>
            생성 방식 삭제
          </AlertDialogTitle>
          <AlertDialogDescription className="pt-1 text-xs leading-relaxed text-slate-500">
            <span className="font-medium text-slate-700">{label}</span> 을(를) 삭제합니다.
            되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs leading-relaxed text-slate-600">
          {isLoading || !impact ? (
            <span className="flex items-center gap-2 text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              무엇이 사라지는지 확인하는 중
            </span>
          ) : (
            <>
              {/* 이 화면 밖으로 번지는 것부터 — 사용자가 예상하지 못하는 순서로 적는다 */}
              {impact.isSubmissionForm && (
                <p className="flex gap-1.5 rounded border border-rose-200 bg-rose-50 p-2 text-rose-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    이 방식은{' '}
                    <b className="font-semibold">
                      「{impact.taskTitle ?? '연결된 업무'}」의 제출 양식
                    </b>
                    입니다. 삭제하면 담당자가 제출할 수 없습니다 — 업무 편집에서 제출 양식을
                    다시 저장하면 새로 만들어집니다.
                  </span>
                </p>
              )}
              {action.task_id && !impact.isSubmissionForm && (
                <p>
                  <b className="font-semibold text-violet-700">
                    「{impact.taskTitle ?? '연결된 업무'}」
                  </b>{' '}
                  업무의 WORK 목록에서도 사라집니다.
                </p>
              )}
              <p>
                실행 이력 <b className="font-semibold text-slate-800">{impact.runs}건</b>이
                함께 삭제됩니다
                {impact.otherRuns > 0 && (
                  <>
                    {' '}
                    (그중 다른 교사가 실행한 {impact.otherRuns}건의 결과 파일은 남습니다)
                  </>
                )}
                .
              </p>
              <p>
                내가 저장한 완성 문서 <b className="font-semibold text-slate-800">{impact.myDocuments}건</b>은
                지워지지 않지만, <b className="font-semibold">[완성 문서] 목록에서 찾을 수 없게</b> 됩니다.
              </p>
            </>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            className="bg-rose-600 text-white hover:bg-rose-700"
            onClick={(e) => {
              // 기본 동작은 즉시 닫기다 — 막지 않으면 실패해도 모달이 사라져 원인을 알 수 없다
              e.preventDefault();
              void onConfirm();
            }}
          >
            {isDeleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default DocGenDeleteDialog;
