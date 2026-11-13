import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { Loader2, Upload, Trash2, FileText, RefreshCw, Wand2 } from 'lucide-react';
import {
  listGradeAnalyses,
  uploadGradeAnalysis,
  deleteGradeAnalysis,
  repairGradeAnalysisEncoding,
  type GradeAnalysisRecord,
} from '../../services/gradeAnalysisService';

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => currentYear - 3 + i);
const MONTH_OPTIONS = [3, 4, 5, 6, 7, 9, 10, 11];

// 파일명에서 "2024년 1학년 09월" 같은 패턴 자동 추출
const extractMeta = (
  fileName: string
): { year: number; grade: number; month: number } | null => {
  const m = fileName.match(/(\d{4})\D*(\d)학년\D*(\d{1,2})월/);
  if (m) return { year: +m[1], grade: +m[2], month: +m[3] };
  return null;
};

interface GradeAnalysisImportTabProps {
  /** 업로드 성공 시(워크플로 WORK 완료 기록용) */
  onUploaded?: (summary: { year: number; grade: number; month: number }) => void;
}

export const GradeAnalysisImportTab: React.FC<GradeAnalysisImportTabProps> = ({ onUploaded } = {}) => {
  const [records, setRecords] = useState<GradeAnalysisRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [grade, setGrade] = useState<number>(1);
  const [year, setYear] = useState<number>(currentYear);
  const [month, setMonth] = useState<number>(9);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listGradeAnalyses();
      setRecords(data);
    } catch (err) {
      console.error('[GradeAnalysis] list error:', err);
      toast.error('목록 조회 실패: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    if (picked) {
      const meta = extractMeta(picked.name);
      if (meta) {
        setYear(meta.year);
        setGrade(meta.grade);
        setMonth(meta.month);
        toast.info(`파일명에서 자동 감지: ${meta.year}년 ${meta.grade}학년 ${meta.month}월`);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('HTML 파일을 선택하세요.');
      return;
    }
    setUploading(true);
    try {
      await uploadGradeAnalysis({ grade, year, month, title, file });
      toast.success(`${year}년 ${grade}학년 ${month}월 분석 리포트 업로드 완료`);
      onUploaded?.({ year: Number(year), grade: Number(grade), month: Number(month) });
      setFile(null);
      setTitle('');
      const fileInput = document.getElementById('grade-analysis-file') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
      await loadRecords();
    } catch (err) {
      console.error('[GradeAnalysis] upload error:', err);
      toast.error('업로드 실패: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (rec: GradeAnalysisRecord) => {
    if (!confirm(`${rec.exam_year}년 ${rec.grade}학년 ${rec.exam_month}월 분석 리포트를 삭제하시겠습니까?`)) {
      return;
    }
    try {
      await deleteGradeAnalysis(rec);
      await loadRecords();
    } catch (err) {
      console.error('[GradeAnalysis] delete error:', err);
      toast.error('삭제 실패: ' + (err instanceof Error ? err.message : ''));
    }
  };

  const [repairingId, setRepairingId] = useState<string | null>(null);
  const handleRepair = async (rec: GradeAnalysisRecord) => {
    setRepairingId(rec.id);
    try {
      const result = await repairGradeAnalysisEncoding(rec);
      toast.success(
        `인코딩 복구 완료: ${result.detectedCharset} → utf-8 (${result.originalBytes} → ${result.newBytes} bytes)`
      );
      await loadRecords();
    } catch (err) {
      console.error('[GradeAnalysis] repair error:', err);
      toast.error('복구 실패: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setRepairingId(null);
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* 업로드 영역 */}
      <div className="border rounded-lg p-4 space-y-3 shrink-0">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-blue-500" />
          <h3 className="font-semibold text-sm">분석 리포트 업로드</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">학년</Label>
            <Select value={String(grade)} onValueChange={(v) => setGrade(+v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1학년</SelectItem>
                <SelectItem value="2">2학년</SelectItem>
                <SelectItem value="3">3학년</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-slate-500">연도</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(+v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-slate-500">월</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(+v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>{m}월</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-slate-500">제목 (선택)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 영역별 취약점 분석"
              className="h-9"
            />
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-slate-500">HTML 파일</Label>
            <Input
              id="grade-analysis-file"
              type="file"
              accept=".html,.htm,text/html"
              onChange={handleFileChange}
              className="h-9"
            />
          </div>
          <Button onClick={handleUpload} disabled={uploading || !file} className="h-9">
            {uploading ? (
              <><Loader2 className="animate-spin mr-2 h-4 w-4" />업로드 중</>
            ) : (
              <><Upload className="mr-2 h-4 w-4" />업로드</>
            )}
          </Button>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          동일한 <strong>학년/연도/월</strong> 조합으로 재업로드하면 기존 파일이 덮어쓰기됩니다.
          파일명에 <code>"2024년 1학년 09월"</code> 형태가 포함되면 메타정보를 자동 감지합니다.
        </p>
      </div>

      {/* 업로드된 리포트 목록 */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            등록된 리포트 ({records.length})
          </h3>
          <Button variant="ghost" size="sm" onClick={loadRecords} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="flex-1 overflow-auto border rounded-md">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="animate-spin text-slate-400" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center text-slate-400 text-sm p-8">
              업로드된 분석 리포트가 없습니다
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-left">
                  <th className="p-2 border-b font-medium w-16">학년</th>
                  <th className="p-2 border-b font-medium w-24">연도</th>
                  <th className="p-2 border-b font-medium w-16">월</th>
                  <th className="p-2 border-b font-medium">제목</th>
                  <th className="p-2 border-b font-medium w-36">업데이트</th>
                  <th className="p-2 border-b w-20"></th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50 border-b">
                    <td className="p-2">{rec.grade}학년</td>
                    <td className="p-2">{rec.exam_year}년</td>
                    <td className="p-2">{rec.exam_month}월</td>
                    <td className="p-2 text-slate-600">{rec.title || <span className="text-slate-300">—</span>}</td>
                    <td className="p-2 text-xs text-slate-500">
                      {new Date(rec.updated_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-brand-600"
                          onClick={() => handleRepair(rec)}
                          disabled={repairingId === rec.id}
                          title="인코딩 복구 (한글 깨짐 수정)"
                        >
                          {repairingId === rec.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Wand2 className="w-3.5 h-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                          onClick={() => handleDelete(rec)}
                          title="삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
