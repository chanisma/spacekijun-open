import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { Loader2, Upload, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronRight, FileText, Trash2, Pencil, Check, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { readFile } from '../../utils/excelParsers/utils';
import { parseMockExamCSV, extractSubjectList, type ParsedMockExamRow } from '../../utils/excelParsers/mockExam';
import {
    previewMockExamMatching,
    uploadMockExamData,
    type MockExamMatchResult,
} from '../../services/adminService';

interface ParsedMockExamFile {
    fileName: string;
    academicYear: number;
    examGrade: number;
    examMonth: number;
    data: ParsedMockExamRow[];
    subjectList: string[];
}

interface FileMatchResult {
    fileIndex: number;
    fileName: string;
    academicYear: number;
    examGrade: number;
    examMonth: number;
    results: MockExamMatchResult[];
}

interface AggregatedUploadResult {
    matched: number;
    unmatched: number;
    inserted: number;
    updated: number;
    skipped: number;
    perFile: { fileName: string; matched: number; unmatched: number; inserted: number; updated: number; skipped: number }[];
}

type Step = 'select' | 'preview' | 'matching' | 'uploading' | 'done';

/**
 * 파일명에서 메타정보 자동 추출: "2024년 1학년 09월 모의고사"
 */
const extractMetaFromFileName = (fileName: string): { academicYear: number; examGrade: number; examMonth: number } | null => {
    const match = fileName.match(/(\d{4})년\s*(\d)학년\s*(\d{1,2})월/);
    if (match) {
        return {
            academicYear: parseInt(match[1]),
            examGrade: parseInt(match[2]),
            examMonth: parseInt(match[3]),
        };
    }
    return null;
};

interface MockExamImportTabProps {
    /** 업로드 성공 시(워크플로 WORK 완료 기록용) */
    onUploaded?: (summary: { inserted: number; updated: number }) => void;
}

export const MockExamImportTab: React.FC<MockExamImportTabProps> = ({ onUploaded } = {}) => {
    const [step, setStep] = useState<Step>('select');
    const [parsing, setParsing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadingFileName, setUploadingFileName] = useState('');

    // Multi-file parsed data
    const [parsedFiles, setParsedFiles] = useState<ParsedMockExamFile[]>([]);
    const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set());

    // Matching
    const [fileMatchResults, setFileMatchResults] = useState<FileMatchResult[]>([]);
    const [matchLoading, setMatchLoading] = useState(false);

    // Upload result
    const [uploadResult, setUploadResult] = useState<AggregatedUploadResult | null>(null);

    // Manual match overrides: key = "fileIdx:classNum-number", value = student_basic_info.id
    const [manualMatches, setManualMatches] = useState<Map<string, string>>(new Map());
    const [editingMatchKey, setEditingMatchKey] = useState<string | null>(null);
    const [editMatchValue, setEditMatchValue] = useState('');

    const handleManualMatch = (fileIdx: number, rowIdx: number, row: ParsedMockExamRow) => {
        const newId = editMatchValue.trim();
        setEditingMatchKey(null);
        if (!newId) return;

        const key = `${fileIdx}:${row.classNum}-${row.number}`;
        setManualMatches(prev => {
            const next = new Map(prev);
            next.set(key, newId);
            return next;
        });

        // 매칭 결과에도 시각적으로 반영
        setFileMatchResults(prev => prev.map((fr, fi) => {
            if (fi !== fileIdx) return fr;
            return {
                ...fr,
                results: fr.results.map((r, ri) => {
                    if (ri !== rowIdx) return r;
                    return { ...r, student: { id: newId, name: r.row.name }, matchMethod: 'manual' as any };
                }),
            };
        }));
        toast.info(`수동 매칭: ${row.name} → ${newId}`);
    };

    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        const files = Array.from(e.target.files);
        setParsing(true);

        try {
            const newParsedFiles: ParsedMockExamFile[] = [];

            for (const file of files) {
                const meta = extractMetaFromFileName(file.name);
                const data = await readFile(file);
                if (!data) {
                    toast.error(`${file.name}: 파일을 읽을 수 없습니다.`);
                    continue;
                }

                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][];

                const parsed = parseMockExamCSV(json);
                if (parsed.length === 0) {
                    toast.error(`${file.name}: 파싱된 데이터가 없습니다.`);
                    continue;
                }

                newParsedFiles.push({
                    fileName: file.name,
                    academicYear: meta?.academicYear ?? new Date().getFullYear(),
                    examGrade: meta?.examGrade ?? 1,
                    examMonth: meta?.examMonth ?? 9,
                    data: parsed,
                    subjectList: extractSubjectList(parsed),
                });
            }

            if (newParsedFiles.length === 0) {
                toast.error('유효한 데이터가 없습니다.');
                return;
            }

            // 중복 파일 감지 (파일명 + 메타정보 기준)
            setParsedFiles(prev => {
                const existingKeys = new Set(
                    prev.map(f => `${f.fileName}|${f.academicYear}|${f.examGrade}|${f.examMonth}`)
                );
                const filtered = newParsedFiles.filter(f => {
                    const key = `${f.fileName}|${f.academicYear}|${f.examGrade}|${f.examMonth}`;
                    if (existingKeys.has(key)) {
                        toast.warning(`${f.fileName}: 이미 추가된 파일입니다. 건너뜁니다.`);
                        return false;
                    }
                    return true;
                });
                const startIdx = prev.length;
                setExpandedFiles(new Set(filtered.map((_, i) => startIdx + i)));
                return [...prev, ...filtered];
            });
            setStep('preview');

            const totalStudents = newParsedFiles.reduce((sum, f) => sum + f.data.length, 0);
            toast.success(`${newParsedFiles.length}개 파일, 총 ${totalStudents}명 파싱 완료`);
        } catch (error) {
            console.error('[MockExam] Parse error:', error);
            toast.error('파일 파싱 실패: ' + (error instanceof Error ? error.message : '알 수 없는 오류'));
        } finally {
            setParsing(false);
            e.target.value = '';
        }
    }, []);

    const handleRemoveFile = useCallback((index: number) => {
        setParsedFiles(prev => prev.filter((_, i) => i !== index));
    }, []);

    const handleUpdateFileMeta = useCallback((index: number, field: keyof Pick<ParsedMockExamFile, 'academicYear' | 'examGrade' | 'examMonth'>, value: number) => {
        setParsedFiles(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
    }, []);

    const toggleFileExpand = useCallback((index: number) => {
        setExpandedFiles(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    }, []);

    const handlePreviewMatching = useCallback(async () => {
        setMatchLoading(true);
        try {
            const allResults: FileMatchResult[] = [];

            for (let i = 0; i < parsedFiles.length; i++) {
                const file = parsedFiles[i];
                const results = await previewMockExamMatching(file.data, file.academicYear, file.examGrade);
                allResults.push({
                    fileIndex: i,
                    fileName: file.fileName,
                    academicYear: file.academicYear,
                    examGrade: file.examGrade,
                    examMonth: file.examMonth,
                    results,
                });
            }

            setFileMatchResults(allResults);
            setStep('matching');

            const totalMatched = allResults.reduce((sum, f) => sum + f.results.filter(r => r.student).length, 0);
            const totalUnmatched = allResults.reduce((sum, f) => sum + f.results.filter(r => !r.student).length, 0);
            toast.info(`전체 매칭 결과: ${totalMatched}명 성공, ${totalUnmatched}명 실패`);
        } catch (error) {
            console.error('[MockExam] Matching error:', error);
            toast.error('학생 매칭 실패: ' + (error instanceof Error ? error.message : ''));
        } finally {
            setMatchLoading(false);
        }
    }, [parsedFiles]);

    const handleUpload = useCallback(async () => {
        setUploading(true);
        setUploadProgress(0);
        setStep('uploading');

        const aggregated: AggregatedUploadResult = {
            matched: 0, unmatched: 0, inserted: 0, updated: 0, skipped: 0,
            perFile: [],
        };

        try {
            for (let i = 0; i < parsedFiles.length; i++) {
                const file = parsedFiles[i];
                setUploadingFileName(file.fileName);

                // 해당 파일의 수동 매칭 맵 구축
                const fileManualMap = new Map<string, string>();
                manualMatches.forEach((studentId, key) => {
                    // key format: "fileIdx:classNum-number"
                    const [fIdxStr, classNumKey] = key.split(':');
                    if (parseInt(fIdxStr) === i && classNumKey) {
                        fileManualMap.set(classNumKey, studentId);
                    }
                });

                const result = await uploadMockExamData(
                    file.data,
                    file.academicYear,
                    file.examGrade,
                    file.examMonth,
                    (progress) => {
                        const fileProgress = (i / parsedFiles.length) * 100 + (progress / parsedFiles.length);
                        setUploadProgress(Math.round(fileProgress));
                    },
                    fileManualMap.size > 0 ? fileManualMap : undefined
                );

                aggregated.matched += result.matched;
                aggregated.unmatched += result.unmatched;
                aggregated.inserted += result.inserted;
                aggregated.updated += result.updated;
                aggregated.skipped += result.skipped;
                aggregated.perFile.push({ fileName: file.fileName, ...result });
            }

            setUploadResult(aggregated);
            setStep('done');
            toast.success(`업로드 완료: ${aggregated.inserted}건 추가, ${aggregated.updated}건 갱신`);
            onUploaded?.({ inserted: aggregated.inserted, updated: aggregated.updated });
        } catch (error) {
            console.error('[MockExam] Upload error:', error);
            toast.error('업로드 실패: ' + (error instanceof Error ? error.message : ''));
            setStep('matching');
        } finally {
            setUploading(false);
            setUploadingFileName('');
        }
    }, [parsedFiles, manualMatches]);

    const handleReset = useCallback(() => {
        setStep('select');
        setParsedFiles([]);
        setExpandedFiles(new Set());
        setFileMatchResults([]);
        setUploadResult(null);
        setUploadProgress(0);
        setUploadingFileName('');
        setManualMatches(new Map());
        setEditingMatchKey(null);
    }, []);

    const totalStudents = parsedFiles.reduce((sum, f) => sum + f.data.length, 0);
    const totalMatchedCount = fileMatchResults.reduce((sum, f) => sum + f.results.filter(r => r.student).length, 0);
    const totalUnmatchedCount = fileMatchResults.reduce((sum, f) => sum + f.results.filter(r => !r.student).length, 0);

    return (
        <div className="space-y-4 h-full flex flex-col">
            {/* Step: File Selection */}
            {step === 'select' && (
                <>
                    <div className="p-8 border-2 border-dashed rounded-lg text-center space-y-4 flex-1 flex flex-col items-center justify-center">
                        <Upload className="w-12 h-12 text-slate-400" />
                        <h3 className="text-lg font-semibold">모의고사 성적 파일 업로드</h3>
                        <p className="text-sm text-slate-500">
                            CSV 또는 XLSX 형식의 모의고사 성적 파일을 선택하세요.<br />
                            <strong>여러 파일을 한 번에 선택</strong>할 수 있으며, 파일명에서 학년도/학년/월을 자동 감지합니다.
                        </p>
                        <Button disabled={parsing} asChild>
                            <label className="cursor-pointer">
                                {parsing ? <Loader2 className="animate-spin mr-2" /> : null}
                                {parsing ? '파싱 중...' : '파일 선택'}
                                <Input
                                    type="file"
                                    multiple
                                    accept=".csv,.xlsx,.xls"
                                    className="hidden"
                                    onChange={handleFileSelect}
                                    disabled={parsing}
                                />
                            </label>
                        </Button>
                    </div>

                    <div className="bg-slate-50 p-4 rounded text-sm text-slate-600">
                        <h4 className="font-bold mb-2">지원 형식</h4>
                        <ul className="list-disc list-inside space-y-1">
                            <li><strong>Format A</strong>: 계열번호 포함 (1학년) - 모든 과목 4개 항목 (원점수/표준점수/백분위/등급)</li>
                            <li><strong>Format B</strong>: 계열번호 없음 (2학년+) - 선택과목에 과목명 컬럼 포함</li>
                            <li>파일명 예시: <code>2024년 1학년 09월 모의고사.csv</code></li>
                            <li>입학년도 = 학년도 - 시험학년 + 1 로 계산하여 학생을 매칭합니다.</li>
                        </ul>
                    </div>
                </>
            )}

            {/* Step: Parse Preview (multi-file) */}
            {step === 'preview' && (
                <>
                    <div className="bg-blue-50 p-4 rounded-md border border-blue-100 flex justify-between items-center shrink-0">
                        <div>
                            <h3 className="font-bold text-lg text-blue-800">파싱 결과 미리보기</h3>
                            <p className="text-sm text-blue-600">
                                {parsedFiles.length}개 파일 | 총 {totalStudents}명
                            </p>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                            <label className="cursor-pointer">
                                {parsing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                                파일 추가
                                <Input
                                    type="file"
                                    multiple
                                    accept=".csv,.xlsx,.xls"
                                    className="hidden"
                                    onChange={handleFileSelect}
                                    disabled={parsing}
                                />
                            </label>
                        </Button>
                    </div>

                    <div className="flex-1 overflow-auto space-y-3">
                        {parsedFiles.map((file, fileIdx) => (
                            <div key={fileIdx} className="border rounded-md">
                                {/* File header */}
                                <div className="bg-slate-50 p-3 flex items-center gap-3">
                                    <button
                                        onClick={() => toggleFileExpand(fileIdx)}
                                        className="text-slate-500 hover:text-slate-700"
                                    >
                                        {expandedFiles.has(fileIdx)
                                            ? <ChevronDown className="w-4 h-4" />
                                            : <ChevronRight className="w-4 h-4" />}
                                    </button>
                                    <FileText className="w-4 h-4 text-blue-500" />
                                    <span className="font-medium text-sm flex-1">{file.fileName}</span>
                                    <span className="text-xs text-slate-500">{file.data.length}명</span>

                                    {/* Editable meta */}
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            value={file.academicYear}
                                            onChange={e => handleUpdateFileMeta(fileIdx, 'academicYear', parseInt(e.target.value) || 2024)}
                                            className="w-20 h-8 text-xs"
                                            title="학년도"
                                        />
                                        <span className="text-xs text-slate-400">년</span>
                                        <Select
                                            value={String(file.examGrade)}
                                            onValueChange={v => handleUpdateFileMeta(fileIdx, 'examGrade', parseInt(v))}
                                        >
                                            <SelectTrigger className="w-16 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">1</SelectItem>
                                                <SelectItem value="2">2</SelectItem>
                                                <SelectItem value="3">3</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <span className="text-xs text-slate-400">학년</span>
                                        <Select
                                            value={String(file.examMonth)}
                                            onValueChange={v => handleUpdateFileMeta(fileIdx, 'examMonth', parseInt(v))}
                                        >
                                            <SelectTrigger className="w-16 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                    <SelectItem key={m} value={String(m)}>{m}월</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <span className="text-xs text-slate-400 ml-1">
                                            입학: {file.academicYear - file.examGrade + 1}
                                        </span>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"
                                        onClick={() => handleRemoveFile(fileIdx)}
                                        title="파일 제거"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>

                                {/* Expandable data table */}
                                {expandedFiles.has(fileIdx) && (
                                    <div className="max-h-64 overflow-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-100 sticky top-0 z-10">
                                                <tr>
                                                    <th className="p-2 border-b w-12">#</th>
                                                    <th className="p-2 border-b w-10">반</th>
                                                    <th className="p-2 border-b w-10">번호</th>
                                                    <th className="p-2 border-b w-20">이름</th>
                                                    {file.subjectList.map(subj => (
                                                        <th key={subj} className="p-2 border-b text-center text-xs">{subj}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {file.data.map((row, idx) => (
                                                    <tr key={idx} className="border-b hover:bg-slate-50">
                                                        <td className="p-1.5 text-slate-400 text-xs">{idx + 1}</td>
                                                        <td className="p-1.5 text-center text-xs">{row.classNum}</td>
                                                        <td className="p-1.5 text-center text-xs">{row.number}</td>
                                                        <td className="p-1.5 font-medium text-xs">{row.name}</td>
                                                        {file.subjectList.map(subj => {
                                                            const score = row.subjects[subj];
                                                            return (
                                                                <td key={subj} className="p-1.5 text-center text-xs">
                                                                    {score
                                                                        ? <span title={`원:${score.raw_score ?? '-'} 표:${score.standard_score ?? '-'} 백:${score.percentile ?? '-'}`}>
                                                                            {score.grade != null ? `${score.grade}등급` : '-'}
                                                                          </span>
                                                                        : <span className="text-slate-300">-</span>
                                                                    }
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end gap-3 shrink-0">
                        <Button variant="outline" onClick={handleReset}>취소</Button>
                        <Button onClick={handlePreviewMatching} disabled={matchLoading || parsedFiles.length === 0}>
                            {matchLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                            학생 매칭 확인
                        </Button>
                    </div>
                </>
            )}

            {/* Step: Matching Preview (multi-file) */}
            {step === 'matching' && (
                <>
                    <div className="bg-green-50 p-4 rounded-md border border-green-100 shrink-0">
                        <h3 className="font-bold text-lg text-green-800">학생 매칭 결과</h3>
                        <div className="flex gap-6 mt-2 text-sm">
                            <span className="text-slate-600">{fileMatchResults.length}개 파일</span>
                            <span className="flex items-center gap-1 text-green-700">
                                <CheckCircle2 className="w-4 h-4" /> 매칭 성공: {totalMatchedCount}명
                            </span>
                            {totalUnmatchedCount > 0 && (
                                <span className="flex items-center gap-1 text-red-600">
                                    <XCircle className="w-4 h-4" /> 매칭 실패: {totalUnmatchedCount}명
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto space-y-3">
                        {fileMatchResults.map((fileResult, fIdx) => {
                            const matched = fileResult.results.filter(r => r.student).length;
                            const unmatched = fileResult.results.filter(r => !r.student).length;

                            return (
                                <div key={fIdx} className="border rounded-md">
                                    <div
                                        className="bg-slate-50 p-3 flex items-center gap-3 cursor-pointer"
                                        onClick={() => toggleFileExpand(fIdx)}
                                    >
                                        {expandedFiles.has(fIdx)
                                            ? <ChevronDown className="w-4 h-4 text-slate-500" />
                                            : <ChevronRight className="w-4 h-4 text-slate-500" />}
                                        <FileText className="w-4 h-4 text-blue-500" />
                                        <span className="font-medium text-sm flex-1">
                                            {fileResult.fileName}
                                            <span className="text-xs text-slate-400 ml-2">
                                                ({fileResult.academicYear}년 {fileResult.examGrade}학년 {fileResult.examMonth}월)
                                            </span>
                                        </span>
                                        <span className="text-xs text-green-600 font-medium">{matched}명 매칭</span>
                                        {unmatched > 0 && (
                                            <span className="text-xs text-red-500 font-medium">{unmatched}명 실패</span>
                                        )}
                                    </div>

                                    {expandedFiles.has(fIdx) && (
                                        <div className="max-h-64 overflow-auto">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-slate-100 sticky top-0 z-10">
                                                    <tr>
                                                        <th className="p-2 border-b w-12">상태</th>
                                                        <th className="p-2 border-b w-10">반</th>
                                                        <th className="p-2 border-b w-10">번호</th>
                                                        <th className="p-2 border-b w-20">CSV 이름</th>
                                                        <th className="p-2 border-b w-28">DB 학생 ID</th>
                                                        <th className="p-2 border-b w-20">DB 이름</th>
                                                        <th className="p-2 border-b w-16">방법</th>
                                                        <th className="p-2 border-b w-12">과목</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {fileResult.results.map((result, idx) => (
                                                        <tr
                                                            key={idx}
                                                            className={`border-b ${result.student ? 'hover:bg-slate-50' : 'bg-red-50 hover:bg-red-100'}`}
                                                        >
                                                            <td className="p-1.5">
                                                                {result.student
                                                                    ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                                                                    : <XCircle className="w-4 h-4 text-red-500" />}
                                                            </td>
                                                            <td className="p-1.5 text-center text-xs">{result.row.classNum}</td>
                                                            <td className="p-1.5 text-center text-xs">{result.row.number}</td>
                                                            <td className="p-1.5 font-medium text-xs">{result.row.name}</td>
                                                            <td className="p-1.5 font-mono text-xs">
                                                                {(() => {
                                                                    const matchKey = `${fIdx}:${result.row.classNum}-${result.row.number}`;
                                                                    if (editingMatchKey === matchKey) {
                                                                        return (
                                                                            <div className="flex items-center gap-1">
                                                                                <Input
                                                                                    value={editMatchValue}
                                                                                    onChange={e => setEditMatchValue(e.target.value)}
                                                                                    onKeyDown={e => {
                                                                                        if (e.key === 'Enter') handleManualMatch(fIdx, idx, result.row);
                                                                                        if (e.key === 'Escape') setEditingMatchKey(null);
                                                                                    }}
                                                                                    className="h-6 w-24 text-xs font-mono px-1"
                                                                                    autoFocus
                                                                                    placeholder="학생 ID"
                                                                                />
                                                                                <button onClick={() => handleManualMatch(fIdx, idx, result.row)} className="text-emerald-600 hover:text-emerald-800">
                                                                                    <Check className="h-3.5 w-3.5" />
                                                                                </button>
                                                                                <button onClick={() => setEditingMatchKey(null)} className="text-slate-400 hover:text-slate-600">
                                                                                    <X className="h-3.5 w-3.5" />
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    }
                                                                    return (
                                                                        <div className="flex items-center gap-1 group">
                                                                            <span className={result.student ? 'text-blue-600' : 'text-red-400'}>
                                                                                {result.student?.id || '-'}
                                                                            </span>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setEditingMatchKey(matchKey);
                                                                                    setEditMatchValue(result.student?.id || '');
                                                                                }}
                                                                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-600 transition-opacity"
                                                                            >
                                                                                <Pencil className="h-3 w-3" />
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </td>
                                                            <td className="p-1.5 text-xs">{result.student?.name || '-'}</td>
                                                            <td className="p-1.5 text-xs text-slate-500">
                                                                {result.matchMethod === 'grade_info' ? '반+번호'
                                                                  : result.matchMethod === 'name' ? '이름'
                                                                  : (result.matchMethod as string) === 'manual' ? '수동'
                                                                  : '-'}
                                                            </td>
                                                            <td className="p-1.5 text-center text-xs">
                                                                {Object.keys(result.row.subjects).length}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex justify-end gap-3 shrink-0">
                        <Button variant="outline" onClick={handleReset}>취소</Button>
                        <Button variant="outline" onClick={() => { setStep('preview'); setExpandedFiles(new Set()); }}>이전</Button>
                        <Button
                            onClick={handleUpload}
                            disabled={uploading || totalMatchedCount === 0}
                        >
                            {totalMatchedCount}명 데이터 업로드 ({parsedFiles.length}개 파일)
                        </Button>
                    </div>
                </>
            )}

            {/* Step: Uploading */}
            {step === 'uploading' && (
                <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
                    <h3 className="text-lg font-semibold">업로드 중...</h3>
                    {uploadingFileName && (
                        <p className="text-sm text-slate-500">{uploadingFileName}</p>
                    )}
                    <div className="w-64">
                        <div className="bg-slate-200 rounded-full h-3">
                            <div
                                className="bg-blue-500 h-3 rounded-full transition-all"
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                        <p className="text-center text-sm text-slate-500 mt-2">{uploadProgress}%</p>
                    </div>
                </div>
            )}

            {/* Step: Done */}
            {step === 'done' && uploadResult && (
                <div className="flex-1 flex flex-col items-center justify-center space-y-6">
                    <CheckCircle2 className="w-16 h-16 text-green-500" />
                    <h3 className="text-xl font-bold text-green-800">업로드 완료</h3>

                    {/* Aggregated stats */}
                    <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-6 rounded-lg">
                        <div className="flex justify-between gap-8">
                            <span className="text-slate-600">매칭 성공</span>
                            <span className="font-bold">{uploadResult.matched}명</span>
                        </div>
                        <div className="flex justify-between gap-8">
                            <span className="text-slate-600">매칭 실패</span>
                            <span className="font-bold text-red-600">{uploadResult.unmatched}명</span>
                        </div>
                        <div className="flex justify-between gap-8">
                            <span className="text-slate-600">신규 추가</span>
                            <span className="font-bold text-green-600">{uploadResult.inserted}건</span>
                        </div>
                        <div className="flex justify-between gap-8">
                            <span className="text-slate-600">갱신</span>
                            <span className="font-bold text-blue-600">{uploadResult.updated}건</span>
                        </div>
                        <div className="flex justify-between gap-8">
                            <span className="text-slate-600">변경없음</span>
                            <span className="font-bold text-slate-400">{uploadResult.skipped}건</span>
                        </div>
                    </div>

                    {/* Per-file breakdown */}
                    {uploadResult.perFile.length > 1 && (
                        <div className="w-full max-w-lg">
                            <h4 className="text-sm font-semibold text-slate-600 mb-2">파일별 결과</h4>
                            <div className="space-y-1">
                                {uploadResult.perFile.map((pf, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs bg-white border rounded px-3 py-2">
                                        <span className="truncate flex-1 mr-4">{pf.fileName}</span>
                                        <div className="flex gap-3 shrink-0">
                                            <span className="text-green-600">+{pf.inserted}</span>
                                            <span className="text-blue-600">~{pf.updated}</span>
                                            <span className="text-slate-400">={pf.skipped}</span>
                                            {pf.unmatched > 0 && <span className="text-red-500">x{pf.unmatched}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {uploadResult.unmatched > 0 && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 rounded-md text-sm text-amber-800 max-w-md">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{uploadResult.unmatched}명의 학생이 매칭되지 않았습니다. grade_info 또는 이름 데이터를 확인해주세요.</span>
                        </div>
                    )}

                    <Button onClick={handleReset}>다른 파일 업로드</Button>
                </div>
            )}
        </div>
    );
};
