import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDropdownDialog } from '@/hooks/useDropdownDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import { toast } from '@/lib/toast';
import {
  GraduationCap,
  Search,
  MoreHorizontal,
  UserPlus,
  Upload,
  Image,
  Calendar,
  Filter,
  Download,
  Trash2,
  FileSpreadsheet,
  Info,
  FileUp,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseCSVFile, ParsedStudent } from '@/utils/csvStudentParser';
import { parseBirthdayCSV, ParsedBirthday } from '@/utils/csvBirthdayParser';
import {
  parseStudentTimetableExcel,
  matchStudentsAndBuild,
  saveStudentTimetables,
} from '@/utils/studentTimetableParser';
import type { ParseResult } from '@/utils/studentTimetableParser';
import { PhotoRegistrationTab } from '@/features/evalog/components/admin/PhotoRegistrationTab';
import { StudentPictureDialog } from './StudentPictureDialog';
import { withoutPersonalPhone } from '@/utils/resourceMetaPrivacy';

type StudentStatus = 'active' | 'graduated' | 'transferred' | 'withdrawn';

const STATUS_LABEL: Record<StudentStatus, string> = {
  active: '재학',
  graduated: '졸업',
  transferred: '전출',
  withdrawn: '자퇴',
};

interface StudentResource {
  id: string;
  name: string;
  status: StudentStatus;
  meta: {
    id?: string;
    displayName?: string;
    grade?: number;
    class?: number;
    number?: number;
    snum1?: string;
    snum2?: string;
    snum3?: string;
    career?: string;
    major?: string;
    birthday?: string;
    picture?: string;
  };
}

interface PromotionRow {
  name: string;
  oldGrade: number;
  oldClass: number;
  oldNumber: number;
  newGrade: number;
  newClass: number;
  newNumber: number;
  matched: boolean;
  studentId?: string;
  existingMeta?: any;
}

import {
  buildGraduationMappingCsv,
  verifyGraduationMappingCsv,
  type GraduationMappingEntry,
} from '@/lib/graduationMapping';

interface GraduationPreviewRow {
  student: StudentResource;
  sequence: number;
  anonymousName: string;
}

// ── Timetable Upload Dialog ──

interface TimetableUploadDialogProps {
  phase: 'select' | 'parsing' | 'preview' | 'saving' | 'done';
  parseResult: ParseResult | null;
  includeMismatch: boolean;
  saveProgress: { current: number; total: number };
  saveResult: { saved: number; skipped: number; errors: string[] } | null;
  onFileSelect: (file: File) => void;
  onToggleMismatch: (v: boolean) => void;
  onSave: () => void;
  onClose: () => void;
}

const TimetableUploadDialog: React.FC<TimetableUploadDialogProps> = ({
  phase, parseResult, includeMismatch, saveProgress, saveResult,
  onFileSelect, onToggleMismatch, onSave, onClose,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const matchedCount = parseResult?.matched ?? 0;
  const mismatchCount = parseResult?.nameMismatch ?? 0;
  const notFoundCount = parseResult?.notFound ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h3 className="font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            학생 시간표 업로드
          </h3>
          <button onClick={onClose} disabled={phase === 'parsing' || phase === 'saving'} className="text-slate-400 hover:text-slate-600">
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-auto flex-1">
          {/* Phase: File Select */}
          {phase === 'select' && (
            <>
              <p className="text-sm text-slate-600">
                학년, 반, 번호, 성명, 요일, 교시, 과목, 교사 열이 포함된 엑셀 파일을 선택하세요.
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs text-slate-600">
                <p className="font-medium mb-1">엑셀 열 구성:</p>
                <code className="text-[11px] bg-white px-2 py-1 rounded border inline-block">
                  학년 | 반 | 번호 | 성명 | 요일 | 교시 | 과목 | 교사
                </code>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFileSelect(f);
                }}
                className="hidden"
              />
              <Button onClick={() => fileRef.current?.click()} className="w-full gap-2">
                <Upload className="h-4 w-4" />
                엑셀 파일 선택
              </Button>
            </>
          )}

          {/* Phase: Parsing */}
          {phase === 'parsing' && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              파일 분석 중...
            </div>
          )}

          {/* Phase: Preview */}
          {phase === 'preview' && parseResult && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-green-50 border border-green-200 rounded-md p-2">
                  <div className="text-lg font-bold text-green-700">{matchedCount}</div>
                  <div className="text-[10px] text-green-600">매칭 완료</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-md p-2">
                  <div className="text-lg font-bold text-amber-700">{mismatchCount}</div>
                  <div className="text-[10px] text-amber-600">이름 불일치</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-md p-2">
                  <div className="text-lg font-bold text-red-700">{notFoundCount}</div>
                  <div className="text-[10px] text-red-600">미등록</div>
                </div>
              </div>

              <div className="text-xs text-slate-500">
                전체 {parseResult.totalRows}행 → {parseResult.students.length}명의 학생
                (시간표 항목 평균 {parseResult.students.length > 0 ? Math.round(parseResult.totalRows / parseResult.students.length) : 0}개)
              </div>

              <div className="border rounded-md overflow-auto max-h-[240px]">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="p-1.5 text-left">학년반번</th>
                      <th className="p-1.5 text-left">엑셀 이름</th>
                      <th className="p-1.5 text-left">DB 이름</th>
                      <th className="p-1.5 text-center">항목수</th>
                      <th className="p-1.5 text-center">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.students.map((s, i) => (
                      <tr key={i} className={
                        s.status === 'not_found' ? 'border-t bg-red-50/50' :
                        s.status === 'name_mismatch' ? 'border-t bg-amber-50/50' : 'border-t'
                      }>
                        <td className="p-1.5 font-mono">{s.grade}-{s.classNum}-{s.number}</td>
                        <td className="p-1.5">{s.name}</td>
                        <td className="p-1.5 text-slate-500">{s.resourceName || '-'}</td>
                        <td className="p-1.5 text-center">{s.entries.length}</td>
                        <td className="p-1.5 text-center">
                          {s.status === 'matched' && <span className="text-green-600 font-medium">✓</span>}
                          {s.status === 'name_mismatch' && <span className="text-amber-600 font-medium">이름불일치</span>}
                          {s.status === 'not_found' && <span className="text-red-500 font-medium">미등록</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {mismatchCount > 0 && (
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeMismatch}
                    onChange={(e) => onToggleMismatch(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  이름 불일치 학생도 저장 ({mismatchCount}명)
                </label>
              )}

              {parseResult.errors.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-2 text-xs text-amber-700 max-h-20 overflow-auto">
                  <div className="font-medium mb-1">파싱 경고 ({parseResult.errors.length}건):</div>
                  {parseResult.errors.slice(0, 5).map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                  {parseResult.errors.length > 5 && <div>...외 {parseResult.errors.length - 5}건</div>}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
                <Button
                  size="sm"
                  onClick={onSave}
                  disabled={matchedCount === 0 && (!includeMismatch || mismatchCount === 0)}
                >
                  {matchedCount + (includeMismatch ? mismatchCount : 0)}명 저장
                </Button>
              </div>
            </>
          )}

          {/* Phase: Saving */}
          {phase === 'saving' && (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                시간표 저장 중...
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${saveProgress.total > 0 ? (saveProgress.current / saveProgress.total) * 100 : 0}%` }}
                />
              </div>
              <div className="text-xs text-slate-400 text-right">
                {saveProgress.current} / {saveProgress.total}
              </div>
            </div>
          )}

          {/* Phase: Done */}
          {phase === 'done' && saveResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                저장 완료
              </div>
              <div className="bg-slate-50 rounded-md p-3 text-xs space-y-1">
                <div>저장 완료: <span className="font-semibold text-blue-600">{saveResult.saved}명</span></div>
                <div>건너뜀: <span className="text-slate-500">{saveResult.skipped}명</span></div>
              </div>
              {saveResult.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700 max-h-32 overflow-auto">
                  <div className="font-medium mb-1">오류 ({saveResult.errors.length}건):</div>
                  {saveResult.errors.slice(0, 10).map((err, i) => (
                    <div key={i} className="truncate">{err}</div>
                  ))}
                  {saveResult.errors.length > 10 && <div className="mt-1 text-red-500">...외 {saveResult.errors.length - 10}건</div>}
                </div>
              )}
              <div className="flex justify-end">
                <Button size="sm" onClick={onClose}>확인</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const StudentManagement = () => {
  const [students, setStudents] = useState<StudentResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // 빈 문자열 = 미선택. Select placeholder("학년")가 그대로 노출되며,
  // 학년 미선택 시 학생 리스트는 표시되지 않음(아래 gradeMatch 참고).
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  // 상태 필터 — 기본값 'active'(재학)로 비활성 학생은 화면 진입 시 자동으로 숨겨짐
  const [selectedStatus, setSelectedStatus] = useState<StudentStatus | 'all'>('active');
  const [sortBy, setSortBy] = useState<'name' | 'class'>('class');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 30;
  const [editingStudent, setEditingStudent] = useState<StudentResource | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [statusDialogStudent, setStatusDialogStudent] = useState<StudentResource | null>(null);
  const [newStatus, setNewStatus] = useState<StudentStatus>('active');
  const { triggerDialog, dropdownContentProps } = useDropdownDialog();
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    grade: '',
    class: '',
    number: '',
    snum1: '',
    snum2: '',
    snum3: '',
    career: '',
    major: '',
    birthday: '',
  });
  const [uploading, setUploading] = useState(false);
  const [selectedPicture, setSelectedPicture] = useState<{ url: string; name: string } | null>(null);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [uploadDialogType, setUploadDialogType] = useState<'student' | 'birthday' | 'photo' | 'promotion' | null>(null);
  const [promotionPreview, setPromotionPreview] = useState<PromotionRow[]>([]);
  const [showPromotionPreview, setShowPromotionPreview] = useState(false);
  const [showGraduationDialog, setShowGraduationDialog] = useState(false);
  const [graduationYear, setGraduationYear] = useState('');
  const [graduationPreview, setGraduationPreview] = useState<StudentResource[]>([]);
  // 매핑 CSV 2단계 게이트: 내려받았는가 → 그 파일을 다시 읽어 대상과 일치함을 확인했는가.
  // 익명화는 되돌릴 수 없고 이 CSV 가 실명의 유일한 사본이라, 확인 전에는 실행을 막는다.
  const [graduationCsvDownloaded, setGraduationCsvDownloaded] = useState(false);
  const [graduationCsvVerified, setGraduationCsvVerified] = useState(false);
  const [graduationCsvError, setGraduationCsvError] = useState<string | null>(null);
  const [graduationSequenceOffset, setGraduationSequenceOffset] = useState(0);
  const [showTimetableDialog, setShowTimetableDialog] = useState(false);
  const [timetablePhase, setTimetablePhase] = useState<'select' | 'parsing' | 'preview' | 'saving' | 'done'>('select');
  const [timetableParseResult, setTimetableParseResult] = useState<ParseResult | null>(null);
  const [timetableIncludeMismatch, setTimetableIncludeMismatch] = useState(false);
  const [timetableSaveProgress, setTimetableSaveProgress] = useState({ current: 0, total: 0 });
  const [timetableSaveResult, setTimetableSaveResult] = useState<{ saved: number; skipped: number; errors: string[] } | null>(null);

  // 학년별 카운트(통계 카드용) — 학생 명단 fetch와 별개로, 항상 정확한 학생 수 표시
  const [gradeCounts, setGradeCounts] = useState<{ all: number; g1: number; g2: number; g3: number }>(
    { all: 0, g1: 0, g2: 0, g3: 0 }
  );

  const graduationMappingPreview = useMemo<GraduationPreviewRow[]>(() => {
    const year = graduationYear.trim();
    if (!/^\d{2}$/.test(year)) return [];

    const admissionYear = 2000 + Number(year);
    return [...graduationPreview]
      .sort((left, right) => {
        if (left.name < right.name) return -1;
        if (left.name > right.name) return 1;

        const leftCode = left.meta.id || '';
        const rightCode = right.meta.id || '';
        if (leftCode < rightCode) return -1;
        if (leftCode > rightCode) return 1;
        return 0;
      })
      .map((student, index) => {
        const sequence = graduationSequenceOffset + index + 1;
        return {
          student,
          sequence,
          anonymousName: `${admissionYear}입학${String(sequence).padStart(3, '0')}`,
        };
      });
  }, [graduationPreview, graduationSequenceOffset, graduationYear]);

  const fetchGradeCounts = useCallback(async () => {
    try {
      // 통계 카드는 상태 필터와 무관하게 항상 재학생만 집계
      const [c1, c2, c3] = await Promise.all(
        [1, 2, 3].map((g) =>
          supabase
            .from('resource')
            .select('*', { count: 'exact', head: true })
            .eq('type', 'student')
            .eq('status', 'active')
            .eq('meta->>grade', g.toString())
        )
      );
      const g1 = c1.count || 0;
      const g2 = c2.count || 0;
      const g3 = c3.count || 0;
      setGradeCounts({ all: g1 + g2 + g3, g1, g2, g3 });
    } catch (error) {
      console.error('Error fetching grade counts:', error);
    }
  }, []);

  // 데이터 fetch 정책 키 — (학년, 검색 활성여부, 상태) 조합을 한 문자열로 환원하여
  // useCallback deps 안정화 + 키스트로크당 무의미한 re-fetch 방지.
  // 'none'   = 학년 미선택 + 검색어 없음 → 데이터 안 가져옴
  // 'all'    = 학년='all' OR (학년 미선택 + 검색어 있음) → 전체 학생 fetch
  // 'grade:N'= 특정 학년 → 그 학년만 server-side eq 필터
  const dataKey = useMemo<string>(() => {
    const hasSearch = searchTerm.trim() !== '';
    if (selectedGrade === '' && !hasSearch) return 'none';
    if (selectedGrade === '' || selectedGrade === 'all') return 'all';
    return `grade:${selectedGrade}`;
  }, [selectedGrade, searchTerm]);

  const fetchStudents = useCallback(async () => {
    if (dataKey === 'none') {
      setStudents([]);
      setLoading(false);
      // 첫 마운트(none)에서도 통계 카드는 정확하게 — counts만 채움
      fetchGradeCounts();
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from('resource')
        .select('*')
        .eq('type', 'student')
        .order('name');

      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      if (dataKey.startsWith('grade:')) {
        query = query.eq('meta->>grade', dataKey.substring(6));
      }
      // dataKey === 'all' → 학년 필터 없음 (전체 학생)

      const { data, error } = await query;
      if (error) throw error;
      setStudents((data as StudentResource[]) || []);
      // CRUD 직후 fetchStudents() 재호출 시 통계 카드도 동기화
      fetchGradeCounts();
    } catch (error) {
      console.error('Error fetching students:', error);
      toast.error('학생 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [dataKey, selectedStatus, fetchGradeCounts]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const filteredStudents = students
    .filter(student => {
      const searchLower = searchTerm.toLowerCase();

      // 학년 필터 — 미선택('')이면 어떤 학생도 매칭하지 않음(빈 리스트 → 안내 문구 표시)
      const gradeMatch =
        selectedGrade !== '' &&
        (selectedGrade === 'all' || student.meta.grade?.toString() === selectedGrade);

      // 검색 필터
      const searchMatch = !searchTerm || (
        student.name.toLowerCase().includes(searchLower) ||
        student.meta.id?.toLowerCase().includes(searchLower) ||
        student.meta.grade?.toString().includes(searchTerm) ||
        student.meta.class?.toString().includes(searchTerm) ||
        student.meta.number?.toString().includes(searchTerm) ||
        student.meta.snum1?.includes(searchTerm) ||
        student.meta.snum2?.includes(searchTerm) ||
        student.meta.snum3?.includes(searchTerm) ||
        student.meta.career?.toLowerCase().includes(searchLower) ||
        student.meta.major?.toLowerCase().includes(searchLower)
      );

      return gradeMatch && searchMatch;
    })
    .sort((a, b) => {
      if (sortBy === 'name') {
        // 가나다 배열 (이름 기준)
        return a.name.localeCompare(b.name, 'ko');
      } else {
        // 반번호 배열 (학년 → 반 → 번호 순)
        if (a.meta.grade !== b.meta.grade) {
          return (a.meta.grade || 0) - (b.meta.grade || 0);
        }
        if (a.meta.class !== b.meta.class) {
          return (a.meta.class || 0) - (b.meta.class || 0);
        }
        return (a.meta.number || 0) - (b.meta.number || 0);
      }
    });

  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentStudents = filteredStudents.slice(indexOfFirstItem, indexOfLastItem);

  // Reset page when search, grade, or status filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedGrade, selectedStatus]);

  const getGradeBadge = (grade?: number) => {
    if (!grade) return <Badge variant="secondary">미정</Badge>;
    const colors = {
      1: { bg: 'bg-blue-500/10', text: 'text-blue-700' },
      2: { bg: 'bg-green-500/10', text: 'text-green-700' },
      3: { bg: 'bg-purple-500/10', text: 'text-purple-700' }
    };
    const color = colors[grade as keyof typeof colors] || colors[1];
    return <Badge variant="outline" className={`${color.bg} ${color.text} border-0`}>{grade}학년</Badge>;
  };

  const getStatusBadge = (status: StudentStatus) => {
    if (status === 'active') {
      return <Badge variant="outline" className="bg-slate-500/10 text-slate-600 border-0">재학</Badge>;
    }
    const colors: Record<Exclude<StudentStatus, 'active'>, { bg: string; text: string }> = {
      graduated: { bg: 'bg-rose-500/10', text: 'text-rose-700' },
      transferred: { bg: 'bg-amber-500/10', text: 'text-amber-700' },
      withdrawn: { bg: 'bg-red-500/10', text: 'text-red-700' },
    };
    const color = colors[status];
    return <Badge variant="outline" className={`${color.bg} ${color.text} border-0`}>{STATUS_LABEL[status]}</Badge>;
  };

  const handleEdit = (student: StudentResource) => {
    setEditingStudent(student);
    setFormData({
      id: student.meta.id || '',
      name: student.name,
      grade: student.meta.grade?.toString() || '',
      class: student.meta.class?.toString() || '',
      number: student.meta.number?.toString() || '',
      snum1: student.meta.snum1 || '',
      snum2: student.meta.snum2 || '',
      snum3: student.meta.snum3 || '',
      career: student.meta.career || '',
      major: student.meta.major || '',
      birthday: student.meta.birthday || '',
    });
    setShowEditDialog(true);
  };

  const handleSave = async () => {
    try {
      const meta = {
        id: formData.id.trim() || undefined,
        grade: formData.grade ? parseInt(formData.grade) : undefined,
        class: formData.class ? parseInt(formData.class) : undefined,
        number: formData.number ? parseInt(formData.number) : undefined,
        snum1: formData.snum1 || undefined,
        snum2: formData.snum2 || undefined,
        snum3: formData.snum3 || undefined,
        career: formData.career || undefined,
        major: formData.major || undefined,
        birthday: formData.birthday || undefined,
      };

      if (editingStudent) {
        const { error } = await supabase
          .from('resource')
          .update({
            name: formData.name,
            meta,
          })
          .eq('id', editingStudent.id);

        if (error) throw error;
        toast.success('학생 정보가 수정되었습니다.');
      } else {
        const { error } = await supabase
          .from('resource')
          .insert({
            name: formData.name,
            type: 'student',
            meta,
          });

        if (error) throw error;
      }

      setShowEditDialog(false);
      setEditingStudent(null);
      fetchStudents();
    } catch (error) {
      console.error('Error saving student:', error);
      toast.error('저장 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (student: StudentResource) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('resource')
        .delete()
        .eq('id', student.id);

      if (error) throw error;
      fetchStudents();
    } catch (error) {
      console.error('Error deleting student:', error);
      toast.error('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleOpenStatusDialog = (student: StudentResource) => {
    setStatusDialogStudent(student);
    setNewStatus(student.status);
  };

  const handleChangeStatus = async () => {
    if (!statusDialogStudent) return;

    if (newStatus === 'graduated' && statusDialogStudent.status !== 'graduated') {
      toast.error('졸업 처리는 입학연도별 일괄 졸업 처리 메뉴를 사용해주세요.');
      return;
    }

    if (statusDialogStudent.status === 'graduated' && newStatus !== 'graduated') {
      toast.error('익명화된 졸업생의 상태 복원은 이름 매핑 CSV를 확인한 뒤 별도로 처리해야 합니다.');
      return;
    }

    try {
      const { error } = await supabase
        .from('resource')
        .update({ status: newStatus })
        .eq('id', statusDialogStudent.id);

      if (error) throw error;
      setStatusDialogStudent(null);
      fetchStudents();
    } catch (error) {
      console.error('Error changing student status:', error);
      toast.error('상태 변경 중 오류가 발생했습니다.');
    }
  };

  const resetForm = () => {
    setFormData({
      id: '',
      name: '',
      grade: '',
      class: '',
      number: '',
      snum1: '',
      snum2: '',
      snum3: '',
      career: '',
      major: '',
      birthday: '',
    });
    setEditingStudent(null);
  };

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const parsedStudents = await parseCSVFile(file);

      // 전체 학생 목록 한 번에 조회 (성능 개선)
      const { data: rawStudents, error: fetchError } = await supabase
        .from('resource')
        .select('id, name, meta')
        .eq('type', 'student');

      if (fetchError) throw fetchError;

      // Type assertion for the fetched data
      const allStudents = rawStudents as unknown as StudentResource[];

      let successCount = 0;
      let errorCount = 0;

      for (const student of parsedStudents) {
        try {
          // meta.id로 기존 학생 찾기
          const existing = allStudents?.find(s => s.meta?.id === student.id);

          const meta = {
            id: student.id, // 아이디를 meta.id에 저장
            grade: student.grade,
            class: student.class,
            number: student.number,
            snum1: student.snum1 || undefined,
            snum2: student.snum2 || undefined,
            snum3: student.snum3 || undefined,
            career: student.career || undefined,
            major: student.major || undefined,
            // picture 는 넣지 않는다 (2026-10-02 — csvStudentParser 주석). 기존 meta 병합 경로에서도 되살아나지 않는다
          };

          if (existing) {
            // 기존 학생 업데이트 - 기존 meta와 병합
            await supabase
              .from('resource')
              .update({
                name: student.name, // 성명을 name에 저장
                meta: {
                  ...withoutPersonalPhone(existing.meta), // 기존 필드 유지 (birthday 등)
                  ...meta, // 새 데이터로 덮어쓰기
                }
              })
              .eq('id', existing.id);
          } else {
            // 새 학생 추가
            await supabase
              .from('resource')
              .insert({
                name: student.name, // 성명을 name에 저장
                type: 'student',
                meta, // meta.id에 아이디 저장
              });
          }

          successCount++;
        } catch (error) {
          console.error('Error importing student:', student, error);
          errorCount++;
        }
      }

      toast.success(`CSV 업로드 완료: 성공 ${successCount}건, 실패 ${errorCount}건`);
      fetchStudents();
    } catch (error) {
      console.error('CSV upload error:', error);
      toast.error('CSV 파일 처리 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handleBirthdayCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const parsedBirthdays = await parseBirthdayCSV(file);

      // 전체 학생 목록 한 번에 조회
      const { data: rawStudents, error: fetchError } = await supabase
        .from('resource')
        .select('id, meta')
        .eq('type', 'student');

      if (fetchError) throw fetchError;

      const allStudents = rawStudents as unknown as StudentResource[];

      let successCount = 0;
      let errorCount = 0;

      for (const birthdayData of parsedBirthdays) {
        try {
          // meta에서 학년, 반, 번호로 매칭
          const matchedStudent = allStudents?.find(s =>
            s.meta?.grade === birthdayData.grade &&
            s.meta?.class === birthdayData.class &&
            s.meta?.number === birthdayData.number
          );

          if (matchedStudent) {
            // 생일 정보 업데이트
            const { error: updateError } = await supabase
              .from('resource')
              .update({
                meta: {
                  ...matchedStudent.meta,
                  birthday: birthdayData.birthday
                }
              })
              .eq('id', matchedStudent.id);

            if (updateError) {
              console.error('Update error:', updateError);
              errorCount++;
            } else {
              successCount++;
              console.log(`생일 업데이트 성공: ${birthdayData.name} (${birthdayData.grade}-${birthdayData.class}-${birthdayData.number}) -> ${birthdayData.birthday}`);
            }
          } else {
            console.log(`매칭 실패: ${birthdayData.name} (${birthdayData.grade}-${birthdayData.class}-${birthdayData.number})`);
            errorCount++;
          }
        } catch (error) {
          console.error('Error updating birthday:', birthdayData, error);
          errorCount++;
        }
      }

      toast.success(`생일 CSV 업로드 완료: 성공 ${successCount}건, 실패 ${errorCount}건`);
      fetchStudents();
    } catch (error) {
      console.error('Birthday CSV upload error:', error);
      toast.error('생일 CSV 파일 처리 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handlePromotionUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Skip header row if it looks like headers
      const startIdx = rows.length > 0 && typeof rows[0][0] === 'string' && isNaN(Number(rows[0][1])) ? 1 : 0;

      // Fetch all students for matching
      const { data: rawStudents, error: fetchError } = await supabase
        .from('resource')
        .select('id, name, meta')
        .eq('type', 'student');

      if (fetchError) throw fetchError;
      const allStudents = rawStudents as unknown as StudentResource[];

      const preview: PromotionRow[] = [];
      for (let i = startIdx; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 7) continue;

        const name = String(row[0] || '').trim();
        const oldGrade = Number(row[1]);
        const oldClass = Number(row[2]);
        const oldNumber = Number(row[3]);
        const newGrade = Number(row[4]);
        const newClass = Number(row[5]);
        const newNumber = Number(row[6]);

        if (!name || isNaN(oldGrade) || isNaN(newGrade)) continue;

        // Match by name + oldGrade + oldClass + oldNumber
        const matched = allStudents?.find(s =>
          s.name === name &&
          s.meta?.grade === oldGrade &&
          s.meta?.class === oldClass &&
          s.meta?.number === oldNumber
        );

        preview.push({
          name,
          oldGrade, oldClass, oldNumber,
          newGrade, newClass, newNumber,
          matched: !!matched,
          studentId: matched?.id,
          existingMeta: matched?.meta,
        });
      }

      setPromotionPreview(preview);
      setUploadDialogType(null);
      setShowPromotionPreview(true);
    } catch (error) {
      console.error('Promotion excel parse error:', error);
      toast.error('진급 엑셀 파일 처리 중 오류가 발생했습니다.');
    } finally {
      event.target.value = '';
    }
  };

  const handleApplyPromotion = async () => {
    const matchedRows = promotionPreview.filter(r => r.matched && r.studentId);
    if (matchedRows.length === 0) {
      toast.error('매칭된 학생이 없습니다.');
      return;
    }

    setUploading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const row of matchedRows) {
      try {
        const snumKey = `snum${row.newGrade}` as 'snum1' | 'snum2' | 'snum3';
        const snumValue = `${row.newGrade}${String(row.newClass).padStart(2, '0')}${String(row.newNumber).padStart(2, '0')}`;

        const updatedMeta = {
          ...row.existingMeta,
          grade: row.newGrade,
          class: row.newClass,
          number: row.newNumber,
          [snumKey]: snumValue,
        };

        const { error } = await supabase
          .from('resource')
          .update({ meta: updatedMeta })
          .eq('id', row.studentId!);

        if (error) throw error;
        successCount++;
      } catch (error) {
        console.error('Promotion update error:', row.name, error);
        errorCount++;
      }
    }

    toast.success(`진급 처리 완료: 성공 ${successCount}건, 실패 ${errorCount}건`);
    setShowPromotionPreview(false);
    setPromotionPreview([]);
    setUploading(false);
    fetchStudents();
  };

  const handleExportExcel = () => {
    const data = filteredStudents.map(s => ({
      '이름': s.name,
      '학년': s.meta.grade || '',
      '반': s.meta.class || '',
      '번호': s.meta.number || '',
      '아이디': s.meta.id || '',
      '이메일': s.meta.id ? `${s.meta.id}@myschool.hs.kr` : '',
      '1학년 학번': s.meta.snum1 || '',
      '2학년 학번': s.meta.snum2 || '',
      '3학년 학번': s.meta.snum3 || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    // 열 너비 설정
    ws['!cols'] = [
      { wch: 8 },  // 이름
      { wch: 5 },  // 학년
      { wch: 4 },  // 반
      { wch: 5 },  // 번호
      { wch: 12 }, // 아이디
      { wch: 26 }, // 이메일
      { wch: 10 }, // 1학년 학번
      { wch: 10 }, // 2학년 학번
      { wch: 10 }, // 3학년 학번
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '학생정보');
    XLSX.writeFile(wb, `학생정보_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${data.length}명의 학생 정보를 내보냈습니다.`);
  };

  const handleGraduationSearch = async () => {
    const year = graduationYear.trim();
    if (!/^\d{2}$/.test(year)) {
      toast.error('입학 연도를 두 자리 숫자로 입력해주세요. 예: 24');
      return;
    }

    // 화면의 학년/상태 필터와 무관하게, 해당 연도 입학 + 아직 재학 중인 학생 전체를 대상으로 조회
    const prefix = `${year}-`;
    const admissionYear = 2000 + Number(year);

    try {
      const [candidateResult, graduatedResult] = await Promise.all([
        supabase
          .from('resource')
          .select('*')
          .eq('type', 'student')
          .eq('status', 'active')
          .like('meta->>id', `${prefix}%`),
        supabase
          .from('resource')
          .select('name')
          .eq('type', 'student')
          .eq('status', 'graduated')
          .like('meta->>id', `${prefix}%`),
      ]);

      if (candidateResult.error) throw candidateResult.error;
      if (graduatedResult.error) throw graduatedResult.error;

      const aliasPattern = new RegExp(`^${admissionYear}입학(\\d{3})$`);
      const usedSequence = (graduatedResult.data || []).reduce((maximum, student) => {
        const match = student.name.match(aliasPattern);
        return match ? Math.max(maximum, Number(match[1])) : maximum;
      }, 0);

      const candidates = (candidateResult.data as StudentResource[]) || [];
      if (usedSequence + candidates.length > 999) {
        toast.error('해당 입학연도의 익명 번호가 999를 초과합니다.');
        setGraduationPreview([]);
        setGraduationSequenceOffset(0);
        return;
      }

      setGraduationSequenceOffset(usedSequence);
      setGraduationPreview(candidates);
    } catch (error) {
      console.error('Error searching graduation candidates:', error);
      toast.error('졸업 대상 학생 조회 중 오류가 발생했습니다.');
    }
  };

  /** 미리보기 행 → 매핑 항목. CSV 생성과 검증이 같은 형태를 보게 하는 어댑터. */
  const graduationMappingEntries = useMemo<GraduationMappingEntry[]>(
    () =>
      graduationMappingPreview.map(({ student, sequence, anonymousName }) => ({
        resourceId: student.id,
        studentCode: student.meta.id || '',
        realName: student.name,
        anonymousName,
        sequence,
      })),
    [graduationMappingPreview],
  );

  const downloadGraduationMappingCsv = () => {
    const admissionYear = 2000 + Number(graduationYear.trim());
    const csv = buildGraduationMappingCsv(admissionYear, graduationMappingEntries);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download =
      `졸업생_실명_익명명_매핑_${admissionYear}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // 즉시 revoke 하면 브라우저가 다운로드 스트림을 열기 전에 blob 이 사라질 수 있다.
    // 이 파일이 실명을 되찾을 유일한 사본이라 여기서 인색할 이유가 없다.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setGraduationCsvDownloaded(true);
    setGraduationCsvVerified(false);
    setGraduationCsvError(null);
  };

  /**
   * 내려받은 CSV 를 다시 읽어 대상과 일치하는지 확인한다.
   * 브라우저가 "파일이 디스크에 저장됐다"를 알려줄 방법은 없다 — 그 파일을 다시 읽는 것이
   * 유일한 증거다. 익명화는 되돌릴 수 없고 이 CSV 가 실명의 유일한 사본이라, 이 확인을
   * 통과해야만 실행 버튼이 열린다.
   */
  const handleGraduationCsvVerify = async (file: File) => {
    try {
      const text = await file.text();
      const result = verifyGraduationMappingCsv(text, graduationMappingEntries);
      setGraduationCsvVerified(result.ok);
      setGraduationCsvError(result.ok ? null : result.reason ?? '확인할 수 없는 파일입니다.');
      if (result.ok) toast.success(`매핑 CSV 확인 완료 — ${result.parsedCount}명`);
    } catch (error) {
      setGraduationCsvVerified(false);
      setGraduationCsvError(
        error instanceof Error ? `파일을 읽지 못했습니다: ${error.message}` : '파일을 읽지 못했습니다.',
      );
    }
  };

  const handleApplyGraduation = async () => {
    if (graduationMappingPreview.length === 0) {
      toast.error('졸업 처리할 학생이 없습니다.');
      return;
    }

    // 복구 키(매핑 CSV)가 **실제로 저장된 것을 확인한 뒤에만** 익명화한다.
    // 종전엔 다운로드를 시작만 하고 결과를 보지 않은 채 RPC 를 실행해, 파일이 안 떨어지면
    // 되돌릴 방법 없이 실명이 사라졌다(매핑은 RPC 안의 ON COMMIT DROP 임시 테이블뿐).
    if (!graduationCsvVerified) {
      toast.error('내려받은 매핑 CSV를 다시 선택해 확인을 마쳐야 졸업 처리를 할 수 있습니다.');
      return;
    }

    const admissionYear = 2000 + Number(graduationYear.trim());
    setUploading(true);

    try {
      const { data, error } = await supabase.rpc('process_graduated_student_cohort', {
        p_admission_year: admissionYear,
        p_expected_mapping: graduationMappingPreview.map(({ student, anonymousName }) => ({
          resource_id: student.id,
          anonymous_name: anonymousName,
        })),
      });

      if (error) throw error;

      const result = data as {
        processed_students?: number;
        blocked_accounts?: number;
      } | null;
      const processedStudents = result?.processed_students ?? graduationMappingPreview.length;
      const blockedAccounts = result?.blocked_accounts ?? 0;

      toast.success(
        `졸업 처리 완료: ${processedStudents}명 익명화, 계정 ${blockedAccounts}개 차단`
      );
      setShowGraduationDialog(false);
      setGraduationYear('');
      setGraduationPreview([]);
      setGraduationSequenceOffset(0);
      setGraduationCsvDownloaded(false);
      setGraduationCsvVerified(false);
      setGraduationCsvError(null);
      await fetchStudents();
    } catch (error) {
      console.error('Graduation processing error:', error);
      toast.error('졸업 처리가 완료되지 않았습니다. 확인한 매핑 CSV는 그대로 보관하고, 다시 검색한 뒤 시도해주세요.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/3" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[400px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Stats — students는 학년 필터로 일부만 들어 있을 수 있으므로 별도 gradeCounts 사용
  const stats = [
    { label: '전체 학생', value: gradeCounts.all, icon: GraduationCap },
    { label: '1학년', value: gradeCounts.g1, icon: GraduationCap },
    { label: '2학년', value: gradeCounts.g2, icon: GraduationCap },
    { label: '3학년', value: gradeCounts.g3, icon: GraduationCap },
  ];

  if (showPhotoUpload) {
    return <PhotoRegistrationTab onBack={() => setShowPhotoUpload(false)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">학생 리소스</h2>
          <p className="text-muted-foreground">
            학생 데이터베이스를 관리하고 사진/정보를 업로드합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                데이터 업로드
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" {...dropdownContentProps}>
              <DropdownMenuLabel>데이터 가져오기</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => triggerDialog(() => setUploadDialogType('student'))}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                학생 명단 CSV
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => triggerDialog(() => setUploadDialogType('birthday'))}>
                <Calendar className="h-4 w-4 mr-2" />
                생일 정보 CSV
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => triggerDialog(() => setUploadDialogType('promotion'))}>
                <TrendingUp className="h-4 w-4 mr-2" />
                진급 처리 엑셀
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => triggerDialog(() => { setGraduationYear(''); setGraduationPreview([]); setShowGraduationDialog(true); })}>
                <GraduationCap className="h-4 w-4 mr-2" />
                졸업 처리
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => triggerDialog(() => setShowTimetableDialog(true))}>
                <FileUp className="h-4 w-4 mr-2" />
                시간표 업로드
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => triggerDialog(() => setUploadDialogType('photo'))}>
                <Image className="h-4 w-4 mr-2" />
                사진 일괄 등록
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={handleExportExcel} disabled={students.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            엑셀 다운로드
          </Button>
          <input
            id="csv-upload"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { handleCSVUpload(e); setUploadDialogType(null); }}
          />
          <input
            id="birthday-csv-upload"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { handleBirthdayCSVUpload(e); setUploadDialogType(null); }}
          />
          <input
            id="promotion-excel-upload"
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handlePromotionUpload}
          />

          <Button onClick={() => {
            resetForm();
            setShowEditDialog(true);
          }}>
            <UserPlus className="h-4 w-4 mr-2" />
            학생 추가
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>학생 명단</CardTitle>
          <CardDescription>
            학생 정보를 조회하고 관리합니다. (총 {filteredStudents.length}명)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6 items-end md:items-center justify-between">
            <div className="flex flex-1 gap-2 w-full md:max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="이름, 아이디, 학번 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedGrade} onValueChange={setSelectedGrade}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="학년" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전학년</SelectItem>
                  <SelectItem value="1">1학년</SelectItem>
                  <SelectItem value="2">2학년</SelectItem>
                  <SelectItem value="3">3학년</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedStatus} onValueChange={(value: StudentStatus | 'all') => setSelectedStatus(value)}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="active">재학</SelectItem>
                  <SelectItem value="graduated">졸업</SelectItem>
                  <SelectItem value="transferred">전출</SelectItem>
                  <SelectItem value="withdrawn">자퇴</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={(value: 'name' | 'class') => setSortBy(value)}>
                <SelectTrigger className="w-[130px]">
                  <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="class">반/번호순</SelectItem>
                  <SelectItem value="name">이름순</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[100px]">아이디</TableHead>
                  <TableHead className="w-[120px]">이름</TableHead>
                  <TableHead className="w-20 text-center">학년</TableHead>
                  <TableHead className="w-16 text-center">반</TableHead>
                  <TableHead className="w-16 text-center">번호</TableHead>
                  <TableHead className="w-16 text-center">상태</TableHead>
                  <TableHead className="w-[120px] hidden md:table-cell">생년월일</TableHead>
                  <TableHead className="hidden lg:table-cell text-xs">정보</TableHead>
                  <TableHead className="w-16 text-center">사진</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                      {selectedGrade === '' && !searchTerm.trim()
                        ? '학년을 선택하거나 검색어를 입력하면 학생 명단이 표시됩니다.'
                        : searchTerm
                        ? '검색 결과가 없습니다.'
                        : '등록된 학생이 없습니다.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  currentStudents.map((student) => (
                    <TableRow key={student.id} className="hover:bg-muted/5">
                      <TableCell className="font-mono text-xs">{student.meta.id || '-'}</TableCell>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell className="text-center">
                        {getGradeBadge(student.meta.grade)}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {student.meta.class || '-'}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {student.meta.number || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(student.status)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {student.meta.birthday || '-'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {student.meta.major && <Badge variant="outline" className="mt-1 text-[10px] h-4 px-1">{student.meta.major}</Badge>}
                      </TableCell>
                      <TableCell className="text-center">
                        {student.meta.picture ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setSelectedPicture({
                              url: student.meta.picture!,
                              name: student.name
                            })}
                          >
                            <Image className="h-4 w-4 text-blue-500" />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground/30 text-lg">·</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" {...dropdownContentProps}>
                            <DropdownMenuLabel>관리</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => triggerDialog(() => handleEdit(student))}>
                              정보 수정
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => triggerDialog(() => handleOpenStatusDialog(student))}>
                              상태 변경
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDelete(student)} className="text-red-600">
                              <Trash2 className="h-3 w-3 mr-2" />
                              삭제
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {filteredStudents.length > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-center space-x-2 py-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                {'<<'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                {'<'}
              </Button>
              <span className="text-sm text-muted-foreground min-w-[100px] text-center font-mono">
                {currentPage} / {Math.ceil(filteredStudents.length / ITEMS_PER_PAGE)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredStudents.length / ITEMS_PER_PAGE), prev + 1))}
                disabled={currentPage >= Math.ceil(filteredStudents.length / ITEMS_PER_PAGE)}
              >
                {'>'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.ceil(filteredStudents.length / ITEMS_PER_PAGE))}
                disabled={currentPage >= Math.ceil(filteredStudents.length / ITEMS_PER_PAGE)}
              >
                {'>>'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog - No changes needed to dialog implementation logic, just re-use existing */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {editingStudent ? '학생 정보 수정' : '학생 추가'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="student-meta-id">아이디 (학생코드)</Label>
              <Input
                id="student-meta-id"
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                placeholder="예: 00-00476"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                student_basic_info.id 및 로그인 이메일 prefix와 동일해야 합니다. 변경 시 연결된 데이터의 매칭이 끊길 수 있으니 주의하세요.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">이름</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="grade">학년</Label>
                <Select value={formData.grade} onValueChange={(value) => setFormData({ ...formData, grade: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="학년" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1학년</SelectItem>
                    <SelectItem value="2">2학년</SelectItem>
                    <SelectItem value="3">3학년</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="class">반</Label>
                <Input
                  id="class"
                  type="number"
                  value={formData.class}
                  onChange={(e) => setFormData({ ...formData, class: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="number">번호</Label>
                <Input
                  id="number"
                  type="number"
                  value={formData.number}
                  onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="snum1">1학년 학번</Label>
                <Input
                  id="snum1"
                  value={formData.snum1}
                  onChange={(e) => setFormData({ ...formData, snum1: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="snum2">2학년 학번</Label>
                <Input
                  id="snum2"
                  value={formData.snum2}
                  onChange={(e) => setFormData({ ...formData, snum2: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="snum3">3학년 학번</Label>
                <Input
                  id="snum3"
                  value={formData.snum3}
                  onChange={(e) => setFormData({ ...formData, snum3: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="birthday">생년월일</Label>
              <Input
                id="birthday"
                type="date"
                value={formData.birthday}
                onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="career">진로</Label>
                <Input
                  id="career"
                  value={formData.career}
                  onChange={(e) => setFormData({ ...formData, career: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="major">전공</Label>
                <Input
                  id="major"
                  value={formData.major}
                  onChange={(e) => setFormData({ ...formData, major: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              취소
            </Button>
            <Button onClick={handleSave}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog */}
      <Dialog open={!!statusDialogStudent} onOpenChange={(open) => !open && setStatusDialogStudent(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>학생 상태 변경</DialogTitle>
            <DialogDescription>
              {statusDialogStudent?.name} 학생의 재학 상태를 변경합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="student-status">상태</Label>
            <Select value={newStatus} onValueChange={(value: StudentStatus) => setNewStatus(value)}>
              <SelectTrigger id="student-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">재학</SelectItem>
                <SelectItem
                  value="graduated"
                  disabled={statusDialogStudent?.status !== 'graduated'}
                >
                  졸업 (일괄 처리 메뉴 사용)
                </SelectItem>
                <SelectItem value="transferred">전출</SelectItem>
                <SelectItem value="withdrawn">자퇴</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setStatusDialogStudent(null)}>
              취소
            </Button>
            <Button onClick={handleChangeStatus}>변경</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Picture Dialog */}
      {selectedPicture && (
        <StudentPictureDialog
          open={!!selectedPicture}
          onOpenChange={(open) => !open && setSelectedPicture(null)}
          pictureUrl={selectedPicture.url}
          studentName={selectedPicture.name}
        />
      )}

      {/* CSV Upload Guide Dialog */}
      <Dialog open={uploadDialogType !== null} onOpenChange={(open) => !open && setUploadDialogType(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {uploadDialogType === 'student' ? (
                <><FileSpreadsheet className="h-5 w-5 text-blue-600" /> 학생 명단 CSV 업로드</>
              ) : uploadDialogType === 'birthday' ? (
                <><Calendar className="h-5 w-5 text-green-600" /> 생일 정보 CSV 업로드</>
              ) : uploadDialogType === 'promotion' ? (
                <><TrendingUp className="h-5 w-5 text-orange-600" /> 진급 처리 엑셀 업로드</>
              ) : (
                <><Image className="h-5 w-5 text-purple-600" /> 학생 사진 일괄 등록</>
              )}
            </DialogTitle>
            <DialogDescription>
              {uploadDialogType === 'student'
                ? '리로스쿨에서 내보낸 학생 명단 CSV 파일을 업로드합니다.'
                : uploadDialogType === 'birthday'
                ? '학년, 반, 번호, 성명, 생년월일 형식의 CSV 파일을 업로드합니다.'
                : uploadDialogType === 'promotion'
                ? '학생 진급 정보가 담긴 엑셀 파일을 업로드하여 학년/반/번호를 일괄 변경합니다.'
                : '학생 ID와 사진 URL이 포함된 엑셀/CSV 파일을 업로드합니다.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {uploadDialogType === 'student' ? (
              <>
                <div className="rounded-md border p-3 bg-blue-50/50 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-blue-600" />
                    CSV 파일 형식 안내
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    리로스쿨 &gt; 학적 &gt; 학생명단조회 에서 CSV로 다운로드한 파일을 사용합니다.
                  </p>
                </div>

                <div className="rounded-md border p-3 bg-muted/30 space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">사용되는 컬럼</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 pr-3 font-medium">컬럼</th>
                          <th className="text-left py-1 pr-3 font-medium">위치</th>
                          <th className="text-left py-1 font-medium">예시</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted-foreground">
                        <tr className="border-b border-dashed"><td className="py-1 pr-3">아이디</td><td className="pr-3">1열</td><td><code className="bg-muted px-1 rounded">00-00448</code></td></tr>
                        <tr className="border-b border-dashed"><td className="py-1 pr-3">학번</td><td className="pr-3">2열</td><td><code className="bg-muted px-1 rounded">10101</code></td></tr>
                        <tr className="border-b border-dashed"><td className="py-1 pr-3">성명</td><td className="pr-3">3열</td><td><code className="bg-muted px-1 rounded">홍길동</code></td></tr>
                        <tr className="border-b border-dashed"><td className="py-1 pr-3">학번이력</td><td className="pr-3">15열</td><td><code className="bg-muted px-1 rounded">00-00118,24-20520</code></td></tr>
                        <tr className="border-b border-dashed"><td className="py-1 pr-3">진로</td><td className="pr-3">17열</td><td><code className="bg-muted px-1 rounded">의학</code></td></tr>
                        <tr className="border-b border-dashed"><td className="py-1 pr-3">전공</td><td className="pr-3">18열</td><td><code className="bg-muted px-1 rounded">자연</code></td></tr>
                        <tr><td className="py-1 pr-3">사진</td><td className="pr-3">20열</td><td><code className="bg-muted px-1 rounded">3912X43237.jpg</code></td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-md border p-3 bg-amber-50/50 space-y-1">
                  <h4 className="text-xs font-semibold text-amber-700">참고사항</h4>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>학번 형식: 5자리 숫자 (1자리 학년 + 2자리 반 + 2자리 번호)</li>
                    <li>기존 학생은 아이디(meta.id) 기준으로 자동 업데이트됩니다</li>
                    <li>헤더 행이 있으면 자동으로 건너뜁니다</li>
                    <li>UTF-8 인코딩 CSV 파일만 지원합니다</li>
                  </ul>
                </div>
              </>
            ) : uploadDialogType === 'birthday' ? (
              <>
                <div className="rounded-md border p-3 bg-green-50/50 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-green-600" />
                    CSV 파일 형식 안내
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    학년, 반, 번호, 성명, 생년월일 5개 컬럼으로 구성된 CSV 파일을 사용합니다.
                  </p>
                </div>

                <div className="rounded-md border p-3 bg-muted/30 space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">컬럼 구조</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 pr-3 font-medium">학년</th>
                          <th className="text-left py-1 pr-3 font-medium">반</th>
                          <th className="text-left py-1 pr-3 font-medium">번호</th>
                          <th className="text-left py-1 pr-3 font-medium">성명</th>
                          <th className="text-left py-1 font-medium">생년월일</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted-foreground">
                        <tr className="border-b border-dashed">
                          <td className="py-1 pr-3">1</td>
                          <td className="pr-3">2</td>
                          <td className="pr-3">15</td>
                          <td className="pr-3">홍길동</td>
                          <td><code className="bg-muted px-1 rounded">2007.03.15.</code></td>
                        </tr>
                        <tr>
                          <td className="py-1 pr-3">2</td>
                          <td className="pr-3">5</td>
                          <td className="pr-3">3</td>
                          <td className="pr-3">김철수</td>
                          <td><code className="bg-muted px-1 rounded">2006.11.02.</code></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-md border p-3 bg-amber-50/50 space-y-1">
                  <h4 className="text-xs font-semibold text-amber-700">참고사항</h4>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>생년월일 형식: <code className="bg-muted px-1 rounded">YYYY.MM.DD.</code> (마지막 점 포함 가능)</li>
                    <li>학년+반+번호로 기존 학생을 매칭하여 생일 정보를 업데이트합니다</li>
                    <li>헤더 행이 있으면 자동으로 건너뜁니다</li>
                  </ul>
                </div>
              </>
            ) : uploadDialogType === 'promotion' ? (
              <>
                <div className="rounded-md border p-3 bg-orange-50/50 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-orange-600" />
                    엑셀 파일 형식 안내
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    이름, 전학년, 전반, 전번호, 새학년, 새반, 새번호 7개 컬럼으로 구성된 엑셀 파일을 사용합니다.
                  </p>
                </div>

                <div className="rounded-md border p-3 bg-muted/30 space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">컬럼 구조</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 pr-2 font-medium">이름</th>
                          <th className="text-left py-1 pr-2 font-medium">전학년</th>
                          <th className="text-left py-1 pr-2 font-medium">전반</th>
                          <th className="text-left py-1 pr-2 font-medium">전번호</th>
                          <th className="text-left py-1 pr-2 font-medium">새학년</th>
                          <th className="text-left py-1 pr-2 font-medium">새반</th>
                          <th className="text-left py-1 font-medium">새번호</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted-foreground">
                        <tr className="border-b border-dashed">
                          <td className="py-1 pr-2">홍길동</td>
                          <td className="pr-2">1</td>
                          <td className="pr-2">2</td>
                          <td className="pr-2">15</td>
                          <td className="pr-2">2</td>
                          <td className="pr-2">5</td>
                          <td>20</td>
                        </tr>
                        <tr>
                          <td className="py-1 pr-2">김철수</td>
                          <td className="pr-2">2</td>
                          <td className="pr-2">3</td>
                          <td className="pr-2">8</td>
                          <td className="pr-2">3</td>
                          <td className="pr-2">1</td>
                          <td>12</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-md border p-3 bg-amber-50/50 space-y-1">
                  <h4 className="text-xs font-semibold text-amber-700">참고사항</h4>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>이름 + 전학년 + 전반 + 전번호로 기존 학생을 매칭합니다</li>
                    <li>매칭된 학생의 meta.grade, meta.class, meta.number가 변경됩니다</li>
                    <li>snum(학번)은 새학년 기준으로 자동 생성됩니다 (예: snum2 = "20520")</li>
                    <li>기존 snum 값은 유지되고, 새 학년의 snum만 추가/갱신됩니다</li>
                    <li>.xlsx, .xls 파일을 지원합니다</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-md border p-3 bg-purple-50/50 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-purple-600" />
                    파일 형식 안내
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    학생 ID와 사진 URL이 포함된 엑셀(.xlsx) 또는 CSV 파일을 사용합니다.
                  </p>
                </div>

                <div className="rounded-md border p-3 bg-muted/30 space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">필수 컬럼 (헤더명)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 pr-3 font-medium">Class</th>
                          <th className="text-left py-1 pr-3 font-medium">Name</th>
                          <th className="text-left py-1 pr-3 font-medium">Student ID *</th>
                          <th className="text-left py-1 font-medium">Image URL *</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted-foreground">
                        <tr className="border-b border-dashed">
                          <td className="py-1 pr-3">1-2</td>
                          <td className="pr-3">홍길동</td>
                          <td className="pr-3"><code className="bg-muted px-1 rounded">10215</code></td>
                          <td><code className="bg-muted px-1 rounded text-[10px]">https://example.com/photo.jpg</code></td>
                        </tr>
                        <tr>
                          <td className="py-1 pr-3">2-5</td>
                          <td className="pr-3">김철수</td>
                          <td className="pr-3"><code className="bg-muted px-1 rounded">20503</code></td>
                          <td><code className="bg-muted px-1 rounded text-[10px]">https://example.com/photo2.jpg</code></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-muted-foreground">* 표시 컬럼은 필수입니다. Class, Name은 선택 컬럼입니다.</p>
                </div>

                <div className="rounded-md border p-3 bg-amber-50/50 space-y-1">
                  <h4 className="text-xs font-semibold text-amber-700">참고사항</h4>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>헤더에 <code className="bg-muted px-1 rounded">Student ID</code>와 <code className="bg-muted px-1 rounded">Image URL</code>이 반드시 포함되어야 합니다</li>
                    <li>Student ID는 학생의 최신 학번(snum3 &gt; snum2 &gt; snum1)과 매칭됩니다</li>
                    <li>파일 선택 후 매칭 결과를 먼저 확인한 뒤 업데이트할 수 있습니다</li>
                    <li>.xlsx, .xls, .csv 파일 형식을 지원합니다</li>
                  </ul>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setUploadDialogType(null)}>
              취소
            </Button>
            <Button
              onClick={() => {
                if (uploadDialogType === 'photo') {
                  setUploadDialogType(null);
                  setShowPhotoUpload(true);
                } else if (uploadDialogType === 'promotion') {
                  document.getElementById('promotion-excel-upload')?.click();
                } else {
                  const inputId = uploadDialogType === 'student' ? 'csv-upload' : 'birthday-csv-upload';
                  document.getElementById(inputId)?.click();
                }
              }}
              disabled={uploading}
              className={
                uploadDialogType === 'student' ? 'bg-blue-600 hover:bg-blue-700'
                : uploadDialogType === 'photo' ? 'bg-purple-600 hover:bg-purple-700'
                : uploadDialogType === 'promotion' ? 'bg-orange-600 hover:bg-orange-700'
                : 'bg-green-600 hover:bg-green-700'
              }
            >
              {uploadDialogType === 'photo' ? (
                <>
                  <Image className="h-4 w-4 mr-2" />
                  사진 등록 화면으로 이동
                </>
              ) : uploadDialogType === 'promotion' ? (
                <>
                  <FileUp className="h-4 w-4 mr-2" />
                  {uploading ? '업로드 중...' : '엑셀 파일 선택'}
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4 mr-2" />
                  {uploading ? '업로드 중...' : 'CSV 파일 선택'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Graduation Dialog */}
      <Dialog open={showGraduationDialog} onOpenChange={(open) => {
        if (!open) {
          setShowGraduationDialog(false);
          setGraduationYear('');
          setGraduationPreview([]);
          setGraduationSequenceOffset(0);
        }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-rose-600" />
              졸업 처리
            </DialogTitle>
            <DialogDescription>
              매핑 CSV를 내려받아 저장을 확인한 뒤에만 익명화합니다. 익명화는 되돌릴 수 없고, 이 CSV가 실명을 되찾을 유일한 사본입니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="graduation-year">입학 연도 (2자리)</Label>
                <Input
                  id="graduation-year"
                  placeholder="예: 23"
                  value={graduationYear}
                  onChange={(e) => {
                    setGraduationYear(e.target.value.replace(/\D/g, '').slice(0, 2));
                    setGraduationPreview([]);
                    setGraduationSequenceOffset(0);
                  }}
                  className="font-mono"
                  maxLength={2}
                />
              </div>
              <Button variant="outline" onClick={handleGraduationSearch}>
                <Search className="h-4 w-4 mr-2" />
                검색
              </Button>
            </div>

            {graduationYear.trim() && (
              <div className="rounded-md border p-3 bg-muted/30 text-xs text-muted-foreground">
                <code className="bg-muted px-1 rounded">{graduationYear.trim()}-*</code> 패턴의 meta.id를 가진 학생을 검색합니다.
              </div>
            )}

            {graduationMappingPreview.length > 0 && (
              <>
                <div className="text-sm">
                  대상 학생: <strong>{graduationMappingPreview.length}</strong>명
                  {graduationSequenceOffset > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      기존 익명 번호 {graduationSequenceOffset}번 이후부터 배정
                    </span>
                  )}
                </div>
                <div className="border rounded-md overflow-auto flex-1 max-h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>아이디</TableHead>
                        <TableHead>실명</TableHead>
                        <TableHead>변경될 이름</TableHead>
                        <TableHead className="text-center">학년</TableHead>
                        <TableHead className="text-center">반</TableHead>
                        <TableHead className="text-center">번호</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {graduationMappingPreview.map(({ student, anonymousName }) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-mono text-xs">{student.meta.id}</TableCell>
                          <TableCell className="font-medium">{student.name}</TableCell>
                          <TableCell className="font-mono text-xs">{anonymousName}</TableCell>
                          <TableCell className="text-center">{student.meta.grade}</TableCell>
                          <TableCell className="text-center">{student.meta.class}</TableCell>
                          <TableCell className="text-center">{student.meta.number}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            {/^\d{2}$/.test(graduationYear.trim()) && graduationPreview.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">
                해당 연도의 학생이 없습니다.
              </div>
            )}

            <div className="rounded-md border p-3 bg-amber-50/50 space-y-1">
              <h4 className="text-xs font-semibold text-amber-700">참고사항</h4>
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>입학 연도 기준으로 meta.id가 <code className="bg-muted px-1 rounded">연도-GCCNN</code> 형식인 학생을 검색합니다</li>
                <li>전입생처럼 ID 발급 연도와 실제 입학연도가 달랐던 학생은 처리 전에 ID와 미리보기 포함 여부를 확인해주세요</li>
                <li>처리 버튼을 누르면 실명·익명명 매핑 CSV가 먼저 다운로드됩니다</li>
                <li>이름은 입학연도·가나다순 익명명으로 바뀌고 학년·사진·생년월일 정보가 삭제됩니다</li>
                <li>관련 학생 데이터도 함께 익명화되며 연결된 사용자 계정은 차단되고 로그인 세션이 종료됩니다</li>
                <li>모든 변경은 하나의 트랜잭션으로 실행되어 일부 학생만 처리된 상태가 남지 않습니다</li>
                <li>졸업 처리 후에는 기본 학생 목록(재학 필터)에서 더 이상 표시되지 않습니다 — 상태 필터에서 "졸업"을 선택하면 조회 가능합니다</li>
              </ul>
            </div>
          </div>

          {/* 복구 키 2단계 게이트 — 익명화는 되돌릴 수 없고 이 CSV 가 실명의 유일한 사본이다.
              브라우저는 "파일이 저장됐다"를 알려주지 않으므로, 그 파일을 다시 읽는 것만이 증거다. */}
          {graduationMappingPreview.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-3 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                복구 키 확인 — 두 단계를 마쳐야 졸업 처리를 할 수 있습니다
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={graduationCsvDownloaded ? 'outline' : 'default'}
                  size="sm"
                  onClick={downloadGraduationMappingCsv}
                >
                  <Download className="h-4 w-4 mr-2" />
                  1. 매핑 CSV 내려받기
                </Button>
                <span className="text-xs text-muted-foreground">
                  {graduationCsvDownloaded ? '내려받음' : '아직 내려받지 않음'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm font-medium">2. 내려받은 파일을 다시 선택</label>
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  className="h-9 max-w-xs"
                  disabled={!graduationCsvDownloaded}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleGraduationCsvVerify(f);
                  }}
                />
              </div>
              {graduationCsvVerified && (
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  확인 완료 — 대상 {graduationMappingPreview.length}명과 파일 내용이 일치합니다.
                </p>
              )}
              {graduationCsvError && (
                <p className="text-xs font-medium text-rose-700 dark:text-rose-400">{graduationCsvError}</p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => {
              setShowGraduationDialog(false);
              setGraduationYear('');
              setGraduationPreview([]);
              setGraduationSequenceOffset(0);
              setGraduationCsvDownloaded(false);
              setGraduationCsvVerified(false);
              setGraduationCsvError(null);
            }}>
              취소
            </Button>
            <Button
              onClick={handleApplyGraduation}
              disabled={uploading || graduationMappingPreview.length === 0 || !graduationCsvVerified}
              title={!graduationCsvVerified ? '매핑 CSV 확인을 먼저 마쳐 주세요' : undefined}
              className="bg-rose-600 hover:bg-rose-700"
            >
              <GraduationCap className="h-4 w-4 mr-2" />
              {uploading ? '처리 중...' : `졸업 처리 (${graduationMappingPreview.length}명)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Timetable Upload Dialog */}
      {showTimetableDialog && (
        <TimetableUploadDialog
          phase={timetablePhase}
          parseResult={timetableParseResult}
          includeMismatch={timetableIncludeMismatch}
          saveProgress={timetableSaveProgress}
          saveResult={timetableSaveResult}
          onFileSelect={async (file: File) => {
            setTimetablePhase('parsing');
            try {
              const rows = await parseStudentTimetableExcel(file);
              const result = await matchStudentsAndBuild(rows);
              setTimetableParseResult(result);
              setTimetablePhase('preview');
            } catch (err: any) {
              toast.error(err.message || '파일 파싱 실패');
              setTimetablePhase('select');
            }
          }}
          onToggleMismatch={(v) => setTimetableIncludeMismatch(v)}
          onSave={async () => {
            if (!timetableParseResult) return;
            setTimetablePhase('saving');
            try {
              const result = await saveStudentTimetables(
                timetableParseResult.students,
                timetableIncludeMismatch,
                (current, total) => setTimetableSaveProgress({ current, total })
              );
              setTimetableSaveResult(result);
              setTimetablePhase('done');
              if (result.errors.length === 0) {
                toast.success(`${result.saved}명의 시간표 저장 완료`);
              } else {
                toast.warning(`저장 완료 (오류 ${result.errors.length}건)`);
              }
            } catch (err: any) {
              setTimetableSaveResult({ saved: 0, skipped: 0, errors: [err.message] });
              setTimetablePhase('done');
              toast.error('저장 실패');
            }
          }}
          onClose={() => {
            setShowTimetableDialog(false);
            setTimetablePhase('select');
            setTimetableParseResult(null);
            setTimetableIncludeMismatch(false);
            setTimetableSaveProgress({ current: 0, total: 0 });
            setTimetableSaveResult(null);
          }}
        />
      )}

      {/* Promotion Preview Dialog */}
      <Dialog open={showPromotionPreview} onOpenChange={setShowPromotionPreview}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-600" />
              진급 처리 미리보기
            </DialogTitle>
            <DialogDescription>
              매칭 결과를 확인한 후 진급을 적용합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            {/* Summary */}
            <div className="flex gap-3">
              <div className="flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>매칭: <strong>{promotionPreview.filter(r => r.matched).length}</strong>명</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <XCircle className="h-4 w-4 text-red-500" />
                <span>미매칭: <strong>{promotionPreview.filter(r => !r.matched).length}</strong>명</span>
              </div>
            </div>

            {/* Table */}
            <div className="border rounded-md overflow-auto flex-1">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-20">이름</TableHead>
                    <TableHead className="text-center">변경 전</TableHead>
                    <TableHead className="text-center w-8"></TableHead>
                    <TableHead className="text-center">변경 후</TableHead>
                    <TableHead className="text-center w-16">상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promotionPreview.map((row, idx) => (
                    <TableRow key={idx} className={!row.matched ? 'bg-red-50' : ''}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-center font-mono text-sm">
                        {row.oldGrade}-{row.oldClass}-{row.oldNumber}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">→</TableCell>
                      <TableCell className="text-center font-mono text-sm">
                        {row.newGrade}-{row.newClass}-{row.newNumber}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.matched ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 inline" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 inline" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setShowPromotionPreview(false); setPromotionPreview([]); }}>
              취소
            </Button>
            <Button
              onClick={handleApplyPromotion}
              disabled={uploading || promotionPreview.filter(r => r.matched).length === 0}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              {uploading ? '처리 중...' : `진급 적용 (${promotionPreview.filter(r => r.matched).length}명)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
