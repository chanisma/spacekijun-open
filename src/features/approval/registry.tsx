import React from 'react';
import { parseSwapDocumentPayload } from '@/lib/swapDocumentPayload';
import { approvedSignatures, type ApprovalRequest } from './types';

/**
 * 결재 대상 타입 allowlist.
 *
 * DB의 `approval_request.subject_type`은 자유 문자열이지만, **여기 등록된 타입만** 화면이
 * 다룬다. `task_action`의 `actionRegistry.ts`와 같은 원칙 — DB에 들어간 값이 곧 실행 경로가
 * 되지 않도록 코드가 관문을 쥔다.
 *
 * 새 기능에 결재를 붙이려면 여기에 한 항목만 추가하면 된다.
 */

export interface ApprovalSubjectDefinition {
  type: string;
  /** 목록·알림에 쓰는 이름 */
  label: string;
  /** 결재란 칸 기본 구성. HWPX 결재란이 있는 문서라면 그 칸 이름과 같아야 한다. */
  defaultRoles: string[];
  /** 결재 화면에서 보여줄 내용 미리보기(신청 시 저장한 payload 기반) */
  Preview?: React.ComponentType<{ payload: Record<string, unknown> }>;
  /**
   * 결재 문서를 파일로 만들어 내려받는다. 없으면 결재 화면에 버튼이 나오지 않는다.
   *
   * **저장된 payload로 만든다** — 결재자들이 보고 서명한 내용이 그것이므로, 그 사이 원본이
   * 바뀌었어도 결재된 문서는 변하면 안 된다. 실패는 던져서 호출부가 토스트로 알린다.
   */
  download?: (request: ApprovalRequest) => Promise<void>;
}

/** 결강시 보강 계획서 — HWPX 결재란이 `계·부장·교감·교장` 4칸이다. */
const SwapDocumentPreview: React.FC<{ payload: Record<string, unknown> }> = ({ payload }) => {
  const teacher = typeof payload.teacherName === 'string' ? payload.teacherName : '';
  const subject = typeof payload.subject === 'string' ? payload.subject : '';
  const reasons = Array.isArray(payload.reasonLabels) ? (payload.reasonLabels as string[]) : [];
  const rows = Array.isArray(payload.rows) ? (payload.rows as Record<string, string>[]) : [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Field label="교사" value={teacher} />
        <Field label="과목" value={subject} />
        <Field label="결강 사유" value={reasons.join(', ') || '—'} className="col-span-2" />
      </div>

      {/* 문서에 들어가는 항목을 빠짐없이 보여준다 — 결재자가 여기서 내용을 확인하고 서명한다 */}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">결강</th>
                <th className="px-2 py-1.5 text-left font-medium">학급</th>
                <th className="px-2 py-1.5 text-left font-medium">과목</th>
                <th className="px-2 py-1.5 text-left font-medium">구분</th>
                <th className="px-2 py-1.5 text-left font-medium">보강 교사</th>
                <th className="px-2 py-1.5 text-left font-medium">보강 과목</th>
                <th className="px-2 py-1.5 text-left font-medium">보강</th>
                <th className="px-2 py-1.5 text-left font-medium">장소</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {row.absenceDate} {row.absenceDay && `(${row.absenceDay})`} {row.absencePeriod}교시
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{row.grade}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{row.absenceSubject}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{row.swapType}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{row.makeupTeacher}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{row.makeupSubject}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {row.makeupDate} {row.makeupDay && `(${row.makeupDay})`} {row.makeupPeriod}교시
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{row.makeupLocation || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; className?: string }> = ({
  label,
  value,
  className,
}) => (
  <div className={className}>
    <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
    <div className="text-slate-800">{value || '—'}</div>
  </div>
);

export const APPROVAL_SUBJECTS: Record<string, ApprovalSubjectDefinition> = {
  'timetable.swap_document': {
    type: 'timetable.swap_document',
    label: '결강시 보강 계획서',
    // 템플릿(lesson-exchange-template.hwpx)의 결재란 칸과 같은 이름·순서
    defaultRoles: ['계', '부장', '교감', '교장'],
    Preview: SwapDocumentPreview,
    download: downloadSwapDocument,
  },
};

/**
 * 보강 계획서 HWPX 생성 + 결재란 날인.
 *
 * 무거운 의존(JSZip·양식 템플릿)은 **동적 import**로 미룬다 — 이 레지스트리는 결재 버튼이
 * 있는 화면마다 로드되므로, 정적으로 물리면 문서를 만들 일이 없는 화면까지 번들이 무거워진다.
 * 날인 자체는 zip+XML이라 WASM을 쓰지 않는다(`approvalCells.ts` 주석 참고).
 */
async function downloadSwapDocument(request: ApprovalRequest): Promise<void> {
  const input = parseSwapDocumentPayload(request.payload);
  if (!input) {
    throw new Error('문서 정보를 읽을 수 없습니다. 교체 관리에서 문서를 다시 만들어 주세요.');
  }

  const [{ generateLessonExchangeHwpx }, { triggerDownload }] = await Promise.all([
    import('@/components/toolbox/hwpx/generateLessonExchangeHwpx'),
    import('@/features/issue-register/hwpx/generateVolunteerHwpx'),
  ]);

  const blob = await generateLessonExchangeHwpx(input);
  const who = input.teacherName ? `_${input.teacherName}` : '';
  const stamps = approvedSignatures(request);

  if (stamps.length === 0) {
    triggerDownload(blob, `결강시 보강 계획서${who}.hwpx`);
    return;
  }

  const { stampApprovalSignatures } = await import('@/lib/rhwp/approvalStamp');
  triggerDownload(await stampApprovalSignatures(blob, stamps), `결강시 보강 계획서${who}(결재).hwpx`);
}

export function approvalSubject(type: string): ApprovalSubjectDefinition | null {
  return APPROVAL_SUBJECTS[type] ?? null;
}

/** 등록되지 않은 타입이면 화면이 다루지 않는다(라벨만 폴백). */
export function approvalSubjectLabel(type: string): string {
  return APPROVAL_SUBJECTS[type]?.label ?? type;
}
