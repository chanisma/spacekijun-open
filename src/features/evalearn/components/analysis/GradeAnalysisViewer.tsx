import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { Loader2, FileText, ExternalLink, AlertCircle } from 'lucide-react';
import {
  listGradeAnalysesForCohort,
  getGradeAnalysisBlobUrl,
  type GradeAnalysisRecord,
} from '../../services/gradeAnalysisService';

interface GradeAnalysisViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The grade button the user clicked: 1, 2, or 3 */
  grade: number | null;
  /** The reference academic year the user is currently in (defaults to current Korean academic year) */
  referenceYear?: number;
}

/**
 * Current Korean academic year. The school year runs March → February,
 * so Jan/Feb still belong to the previous calendar year's 학년도.
 */
const getCurrentAcademicYear = (now: Date = new Date()): number =>
  now.getMonth() + 1 < 3 ? now.getFullYear() - 1 : now.getFullYear();

/**
 * Map clicked-grade → cohort entry year.
 *
 * "3학년 분석" in 2026학년도 = the 3rd-year students right now = entered 2024
 * "1학년 분석" in 2026학년도 = the 1st-year students right now = entered 2026
 */
const cohortEntryYearFor = (grade: number, referenceYear: number): number =>
  referenceYear - grade + 1;

const GradeAnalysisViewer: React.FC<GradeAnalysisViewerProps> = ({
  open,
  onOpenChange,
  grade,
  referenceYear = getCurrentAcademicYear(),
}) => {
  const [records, setRecords] = useState<GradeAnalysisRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const entryYear = grade != null ? cohortEntryYearFor(grade, referenceYear) : null;

  useEffect(() => {
    if (!open || entryYear == null) return;
    let cancelled = false;
    setLoading(true);
    setRecords([]);

    (async () => {
      try {
        const data = await listGradeAnalysesForCohort(entryYear);
        if (!cancelled) setRecords(data);
      } catch (err) {
        console.error('[GradeAnalysisViewer] list error:', err);
        if (!cancelled) toast.error('분석 목록을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, entryYear]);

  const handleOpen = async (rec: GradeAnalysisRecord) => {
    setOpeningId(rec.id);
    try {
      const url = await getGradeAnalysisBlobUrl(rec.storage_path);
      // NOTE: do NOT use `noopener` here — we need the new tab to finish
      // loading from our blob URL before we can safely revoke it. With
      // `noopener` the browser aggressively disowns the blob, and some
      // browsers then cancel the navigation.
      const win = window.open(url, '_blank');
      if (!win) {
        URL.revokeObjectURL(url);
        toast.error('팝업이 차단되었습니다. 브라우저 팝업 허용을 확인하세요.');
        return;
      }
      // Revoke after the new tab has loaded the content (60s is generous
      // even for 500 KB reports with external CDN chart libs).
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error('[GradeAnalysisViewer] open error:', err);
      toast.error('리포트를 여는 데 실패했습니다.');
    } finally {
      setOpeningId(null);
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setRecords([]);
      setOpeningId(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl w-[92vw] max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b shrink-0">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand-500" />
            {grade}학년 분석 리포트
            {entryYear != null && (
              <span className="text-xs font-normal text-slate-500 ml-1">
                · {entryYear}학번 코호트 (1학년 {entryYear} / 2학년 {entryYear + 1} / 3학년 {entryYear + 2})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="h-40 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : records.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-3">
              <AlertCircle className="w-10 h-10 text-slate-300" />
              <p className="text-sm">이 코호트에 등록된 분석 리포트가 없습니다</p>
              <p className="text-xs text-slate-400">
                관리자가 Admin → 학년 분석 탭에서 HTML 리포트를 업로드할 수 있습니다
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {records.map((rec) => {
                const isOpening = openingId === rec.id;
                return (
                  <li key={rec.id}>
                    <button
                      onClick={() => handleOpen(rec)}
                      disabled={isOpening}
                      className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-slate-50 transition-colors disabled:opacity-60"
                    >
                      <div className="shrink-0 w-14 text-center">
                        <div className="text-xs text-slate-400">{rec.grade}학년</div>
                        <div className="font-bold text-sm text-brand-600">{rec.exam_month}월</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800">
                          {rec.exam_year}년 {rec.exam_month}월 모의고사
                          {rec.title && <span className="text-slate-500 font-normal"> — {rec.title}</span>}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          업데이트 {new Date(rec.updated_at).toLocaleDateString('ko-KR')}
                        </div>
                      </div>
                      <div className="shrink-0 text-slate-400">
                        {isOpening ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ExternalLink className="w-4 h-4" />
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t text-xs text-slate-400 shrink-0 flex items-center justify-between">
          <span>
            {records.length > 0
              ? `${records.length}개 리포트 · 클릭하면 새 창에서 열립니다`
              : ''}
          </span>
          <Button variant="ghost" size="sm" onClick={() => handleClose(false)}>닫기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GradeAnalysisViewer;
