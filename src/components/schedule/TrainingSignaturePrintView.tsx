import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SignatureStrokesView } from '@/components/signature/SignatureStrokesView';
import { parseTrainingAssignees, sortAssigneesByName } from '@/lib/trainingSignature';

interface TrainingSignaturePrintViewProps {
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  meetingTime: string;
}

interface AssigneeRow {
  name: string;
  /** 직접 받은 서명(획 좌표). 없으면 legacyImage를 본다. */
  strokes: unknown | null;
  /** 구 방식으로 서명 완료 처리된 사람의 프로필 등록 이미지 */
  legacyImage: string | null;
}

/**
 * 연수 참석 서명 명단 인쇄 뷰.
 *
 * 서명은 `training_signature`의 획 좌표를 SVG로 그린다(벡터라 인쇄 해상도에서 선명).
 * 2026-08-14 이전에 `meta.assignee[이름].signature=1`로만 기록된 서명은 실제 그림이 없어
 * 프로필 등록 이미지(`profiles.signature`)로 폴백한다 — 그 시절 데이터를 살리기 위한 경로이며
 * 새 서명은 이 경로를 타지 않는다.
 */
export const TrainingSignaturePrintView: React.FC<TrainingSignaturePrintViewProps> = ({
  meetingId,
  meetingTitle,
  meetingDate,
  meetingTime
}) => {
  const [assignees, setAssignees] = useState<AssigneeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAssignees();
  }, [meetingId]);

  const fetchAssignees = async () => {
    try {
      const [{ data: meeting }, { data: signatureRows }] = await Promise.all([
        supabase.from('meeting').select('meta').eq('id', meetingId).single(),
        supabase
          .from('training_signature')
          .select('signer_name, strokes')
          .eq('meeting_id', meetingId),
      ]);

      const parsed = parseTrainingAssignees(
        (meeting?.meta as Record<string, unknown> | null | undefined)?.assignee,
      );
      if (parsed.length === 0) {
        setAssignees([]);
        return;
      }

      const strokesByName = new Map(
        (signatureRows ?? []).map((row) => [row.signer_name, row.strokes as unknown]),
      );

      // 서명 그림이 없는데 플래그만 서 있는 사람만 프로필 이미지를 찾는다(구 데이터 폴백).
      const legacyNames = parsed
        .filter((a) => a.signature === 1 && !strokesByName.has(a.name))
        .map((a) => a.name);

      const legacyByName = new Map<string, string>();
      if (legacyNames.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('name, signature')
          .in('name', legacyNames);
        for (const row of profileRows ?? []) {
          if (row.name && row.signature) legacyByName.set(row.name, row.signature);
        }
      }

      setAssignees(
        sortAssigneesByName(
          parsed.map((a) => ({
            name: a.name,
            strokes: strokesByName.get(a.name) ?? null,
            legacyImage: legacyByName.get(a.name) ?? null,
          })),
        ),
      );
    } catch (error) {
      console.error('참석자 정보 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">로딩 중...</div>
      </div>
    );
  }

  // 2열 형태로 테이블 데이터 구성 (참석자|서명|참석자|서명)
  const tableRows: { left?: AssigneeRow; right?: AssigneeRow }[] = [];
  for (let i = 0; i < assignees.length; i += 2) {
    tableRows.push({ left: assignees[i], right: assignees[i + 1] });
  }

  const signedCount = assignees.filter((a) => a.strokes || a.legacyImage).length;

  return (
    <>
      {/* 인쇄 버튼 (화면에서만 보임) */}
      <div className="print:hidden mb-6 text-center">
        <button
          onClick={handlePrint}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg shadow-sm transition-colors"
        >
          인쇄하기
        </button>
      </div>

      {/* 인쇄용 페이지 */}
      <div className="bg-white max-w-[210mm] min-h-[297mm] mx-auto p-4 print:p-3 print:m-0 shadow-lg print:shadow-none">
        {/* 헤더 */}
        <div className="text-center mb-4 print:mb-3">
          <h1 className="text-lg print:text-base font-bold mb-2 print:mb-1">{meetingTitle}</h1>
          <div className="text-sm print:text-xs">
            <div><strong>일시:</strong> {meetingDate} {meetingTime}</div>
          </div>
        </div>

        {/* 참석자 서명 테이블 */}
        <div className="mb-4">
          <h2 className="text-sm print:text-xs font-semibold mb-2 print:mb-1">
            참석자 서명 <span className="font-normal text-gray-500">({signedCount}/{assignees.length}명)</span>
          </h2>

          <table className="w-full border-collapse border border-gray-800 text-xs print:text-xs">
            <thead>
              <tr>
                <th className="border border-gray-800 p-1 print:p-0.5 bg-gray-100 print:bg-gray-50 w-1/4 text-center font-semibold print:h-4 h-6">
                  참석자
                </th>
                <th className="border border-gray-800 p-1 print:p-0.5 bg-gray-100 print:bg-gray-50 w-1/4 text-center font-semibold print:h-4 h-6">
                  서명
                </th>
                <th className="border border-gray-800 p-1 print:p-0.5 bg-gray-100 print:bg-gray-50 w-1/4 text-center font-semibold print:h-4 h-6">
                  참석자
                </th>
                <th className="border border-gray-800 p-1 print:p-0.5 bg-gray-100 print:bg-gray-50 w-1/4 text-center font-semibold print:h-4 h-6">
                  서명
                </th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, index) => (
                <tr key={index} className="print:h-8 h-10">
                  <td className="border border-gray-800 p-1 print:p-0.5 text-center text-xs print:text-xs font-medium print:leading-none">
                    {row.left?.name || ''}
                  </td>
                  <SignatureCell row={row.left} />
                  <td className="border border-gray-800 p-1 print:p-0.5 text-center text-xs print:text-xs font-medium print:leading-none">
                    {row.right?.name || ''}
                  </td>
                  <SignatureCell row={row.right} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 푸터 */}
        <div className="mt-4 print:mt-3 text-right text-xs text-gray-600 print:text-gray-800">
          <div>출력일: {new Date().toLocaleDateString('ko-KR')}</div>
        </div>
      </div>
    </>
  );
};

/** 서명 칸 — 벡터 우선, 없으면 구 이미지, 둘 다 없으면 빈 칸(직접 서명용) */
const SignatureCell: React.FC<{ row?: AssigneeRow }> = ({ row }) => (
  <td className="border border-gray-800 p-0.5 print:p-0.5 align-middle print:h-8 h-10">
    {row?.strokes ? (
      <div className="h-9 print:h-7 text-black">
        <SignatureStrokesView value={row.strokes} color="#000000" title={`${row.name} 서명`} />
      </div>
    ) : row?.legacyImage ? (
      <img src={row.legacyImage} alt="서명" className="mx-auto h-9 print:h-7 object-contain" />
    ) : (
      <div className="h-9 print:h-7" />
    )}
  </td>
);
