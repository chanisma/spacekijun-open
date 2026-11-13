import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { Loader2, Upload, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronRight, FileText, Trash2, Pencil, Check, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { readFile } from '../../utils/excelParsers/utils';
import {
    parseMockMarkingCSV,
    detectMarkingFileType,
    mergeMarkingData,
    extractMarkingSubjectList,
    extractMarkingMetaFromFileName,
    type ParsedMarkingStudent,
} from '../../utils/excelParsers/mockMarking';
import {
    previewMockMarkingMatching,
    uploadMockMarkingData,
    type MockMarkingMatchResult,
} from '../../services/adminService';

/** 학년+월 기준으로 그룹화된 파일 데이터 */
interface ParsedMarkingGroup {
    academicYear: number;
    examGrade: number;
    examMonth: number;
    data: ParsedMarkingStudent[];
    subjectList: string[];
    sourceFiles: string[];
}

interface GroupMatchResult {
    groupIndex: number;
    academicYear: number;
    examGrade: number;
    examMonth: number;
    results: MockMarkingMatchResult[];
}

export interface MockMarkingUploadResult {
    matched: number;
    unmatched: number;
    inserted: number;
    updated: number;
    skipped: number;
    perGroup: { label: string; matched: number; unmatched: number; inserted: number; updated: number; skipped: number }[];
}

export interface MockMarkingExecutionInput {
    groups: Array<{
        academicYear: number;
        examGrade: number;
        examMonth: number;
        rowCount: number;
        subjectCount: number;
        sourceFiles: string[];
    }>;
}

interface MockMarkingImportTabProps {
    onExecutionStart?: (input: MockMarkingExecutionInput) => Promise<void> | void;
    onExecutionComplete?: (result: MockMarkingUploadResult) => Promise<void> | void;
    onExecutionError?: (
        error: Error,
        partialResult: MockMarkingUploadResult
    ) => Promise<void> | void;
}

type Step = 'select' | 'preview' | 'matching' | 'uploading' | 'done';

/** CSV를 ArrayBuffer에서 적절한 인코딩으로 읽기 */
const readCSVWithEncoding = (data: ArrayBuffer): string => {
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
        if (/[가-힣]/.test(text)) return text;
    } catch {
        // UTF-8 디코딩 실패 → EUC-KR
    }
    return new TextDecoder('euc-kr').decode(data);
};

export const MockMarkingImportTab: React.FC<MockMarkingImportTabProps> = ({
    onExecutionStart,
    onExecutionComplete,
    onExecutionError,
}) => {
    const [step, setStep] = useState<Step>('select');
    const [parsing, setParsing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadingLabel, setUploadingLabel] = useState('');

    // Multi-group data
    const [groups, setGroups] = useState<ParsedMarkingGroup[]>([]);
    const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

    // Matching
    const [groupMatchResults, setGroupMatchResults] = useState<GroupMatchResult[]>([]);
    const [matchLoading, setMatchLoading] = useState(false);

    // Upload result
    const [uploadResult, setUploadResult] = useState<MockMarkingUploadResult | null>(null);

    // Manual match: key = "groupIdx:classNum-number"
    const [manualMatches, setManualMatches] = useState<Map<string, string>>(new Map());
    const [editingMatchKey, setEditingMatchKey] = useState<string | null>(null);
    const [editMatchValue, setEditMatchValue] = useState('');

    // Year input
    const [inputYear, setInputYear] = useState(new Date().getFullYear());

    const handleManualMatch = (groupIdx: number, rowIdx: number, result: MockMarkingMatchResult) => {
        const newId = editMatchValue.trim();
        setEditingMatchKey(null);
        if (!newId) return;

        const key = `${groupIdx}:${result.student.classNum}-${result.student.number}`;
        setManualMatches(prev => {
            const next = new Map(prev);
            next.set(key, newId);
            return next;
        });

        setGroupMatchResults(prev => prev.map((gr, gi) => {
            if (gi !== groupIdx) return gr;
            return {
                ...gr,
                results: gr.results.map((r, ri) => {
                    if (ri !== rowIdx) return r;
                    return { ...r, matched: { id: newId, name: r.student.name }, matchMethod: 'name' };
                }),
            };
        }));
        toast.info(`수동 매칭: ${result.student.name} → ${newId}`);
    };

    const toggleGroupExpand = useCallback((index: number) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    }, []);

    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        const files = Array.from(e.target.files);
        setParsing(true);

        try {
            // 파일별로 파싱하고 학년+월 기준으로 그룹핑
            // 같은 학년+월의 답안/정오 파일은 자동 병합
            const tempGroups = new Map<string, {
                examGrade: number;
                examMonth: number;
                answers: ParsedMarkingStudent[];
                correct: ParsedMarkingStudent[];
                sourceFiles: string[];
            }>();

            for (const file of files) {
                const meta = extractMarkingMetaFromFileName(file.name);
                const examGrade = meta?.examGrade ?? 1;
                const examMonth = meta?.examMonth ?? 9;
                const groupKey = `${examGrade}-${examMonth}`;

                const fileData = await readFile(file);
                if (!fileData) {
                    toast.error(`${file.name}: 파일을 읽을 수 없습니다.`);
                    continue;
                }

                // CSV 인코딩 처리
                let workbook: XLSX.WorkBook;
                const isCSV = file.name.toLowerCase().endsWith('.csv');
                if (isCSV && fileData instanceof ArrayBuffer) {
                    const text = readCSVWithEncoding(fileData);
                    workbook = XLSX.read(text, { type: 'string' });
                } else {
                    workbook = XLSX.read(fileData, { type: 'binary' });
                }

                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][];

                const fileType = detectMarkingFileType(json);
                const parsed = parseMockMarkingCSV(json, fileType);

                if (parsed.length === 0) {
                    toast.error(`${file.name}: 파싱된 데이터가 없습니다.`);
                    continue;
                }

                if (!tempGroups.has(groupKey)) {
                    tempGroups.set(groupKey, { examGrade, examMonth, answers: [], correct: [], sourceFiles: [] });
                }
                const group = tempGroups.get(groupKey)!;
                group.sourceFiles.push(file.name);

                if (fileType === 'answers') {
                    group.answers = parsed;
                } else {
                    group.correct = parsed;
                }
            }

            // 그룹별로 병합
            const newGroups: ParsedMarkingGroup[] = [];
            for (const [, group] of tempGroups) {
                let merged: ParsedMarkingStudent[];
                if (group.answers.length > 0 && group.correct.length > 0) {
                    merged = mergeMarkingData(group.answers, group.correct);
                } else if (group.answers.length > 0) {
                    merged = group.answers;
                } else if (group.correct.length > 0) {
                    merged = group.correct;
                } else {
                    continue;
                }

                newGroups.push({
                    academicYear: inputYear,
                    examGrade: group.examGrade,
                    examMonth: group.examMonth,
                    data: merged,
                    subjectList: extractMarkingSubjectList(merged),
                    sourceFiles: group.sourceFiles,
                });
            }

            if (newGroups.length === 0) {
                toast.error('유효한 데이터가 없습니다.');
                return;
            }

            // 기존 그룹에 추가 (중복 감지)
            setGroups(prev => {
                const existingKeys = new Set(prev.map(g => `${g.examGrade}-${g.examMonth}`));
                const filtered = newGroups.filter(g => {
                    const key = `${g.examGrade}-${g.examMonth}`;
                    if (existingKeys.has(key)) {
                        toast.warning(`${g.examGrade}학년 ${g.examMonth}월: 이미 추가된 데이터입니다. 건너뜁니다.`);
                        return false;
                    }
                    return true;
                });
                const startIdx = prev.length;
                setExpandedGroups(new Set(filtered.map((_, i) => startIdx + i)));
                return [...prev, ...filtered];
            });
            setStep('preview');

            const totalStudents = newGroups.reduce((sum, g) => sum + g.data.length, 0);
            toast.success(`${newGroups.length}개 그룹, 총 ${totalStudents}명 파싱 완료`);
        } catch (error) {
            console.error('[MockMarking] Parse error:', error);
            toast.error('파일 파싱 실패: ' + (error instanceof Error ? error.message : '알 수 없는 오류'));
        } finally {
            setParsing(false);
            e.target.value = '';
        }
    }, [inputYear]);

    const handleRemoveGroup = useCallback((index: number) => {
        setGroups(prev => prev.filter((_, i) => i !== index));
    }, []);

    const handleUpdateGroupMeta = useCallback((index: number, field: 'academicYear' | 'examGrade' | 'examMonth', value: number) => {
        setGroups(prev => prev.map((g, i) => i === index ? { ...g, [field]: value } : g));
    }, []);

    const handlePreviewMatching = useCallback(async () => {
        setMatchLoading(true);
        try {
            const allResults: GroupMatchResult[] = [];

            for (let i = 0; i < groups.length; i++) {
                const group = groups[i];
                const results = await previewMockMarkingMatching(group.data, group.academicYear, group.examGrade);
                allResults.push({
                    groupIndex: i,
                    academicYear: group.academicYear,
                    examGrade: group.examGrade,
                    examMonth: group.examMonth,
                    results,
                });
            }

            setGroupMatchResults(allResults);
            setStep('matching');

            const totalMatched = allResults.reduce((sum, g) => sum + g.results.filter(r => r.matched).length, 0);
            const totalUnmatched = allResults.reduce((sum, g) => sum + g.results.filter(r => !r.matched).length, 0);
            toast.info(`전체 매칭 결과: ${totalMatched}명 성공, ${totalUnmatched}명 실패`);
        } catch (error) {
            console.error('[MockMarking] Matching error:', error);
            toast.error('학생 매칭 실패: ' + (error instanceof Error ? error.message : ''));
        } finally {
            setMatchLoading(false);
        }
    }, [groups]);

    const handleUpload = useCallback(async () => {
        setUploading(true);
        setUploadProgress(0);
        setStep('uploading');

        const aggregated: MockMarkingUploadResult = {
            matched: 0, unmatched: 0, inserted: 0, updated: 0, skipped: 0, perGroup: [],
        };
        let executionStarted = false;

        try {
            await onExecutionStart?.({
                groups: groups.map(group => ({
                    academicYear: group.academicYear,
                    examGrade: group.examGrade,
                    examMonth: group.examMonth,
                    rowCount: group.data.length,
                    subjectCount: group.subjectList.length,
                    sourceFiles: group.sourceFiles,
                })),
            });
            executionStarted = Boolean(onExecutionStart);

            for (let i = 0; i < groups.length; i++) {
                const group = groups[i];
                const label = `${group.examGrade}학년 ${group.examMonth}월`;
                setUploadingLabel(label);

                // 해당 그룹의 수동 매칭 맵
                const groupManualMap = new Map<string, string>();
                manualMatches.forEach((studentId, key) => {
                    const [gIdxStr, classNumKey] = key.split(':');
                    if (parseInt(gIdxStr) === i && classNumKey) {
                        groupManualMap.set(classNumKey, studentId);
                    }
                });

                const result = await uploadMockMarkingData(
                    group.data,
                    group.academicYear,
                    group.examGrade,
                    group.examMonth,
                    (progress) => {
                        const groupProgress = (i / groups.length) * 100 + (progress / groups.length);
                        setUploadProgress(Math.round(groupProgress));
                    },
                    groupManualMap.size > 0 ? groupManualMap : undefined
                );

                aggregated.matched += result.matched;
                aggregated.unmatched += result.unmatched;
                aggregated.inserted += result.inserted;
                aggregated.updated += result.updated;
                aggregated.skipped += result.skipped;
                aggregated.perGroup.push({ label, ...result });
            }

            await onExecutionComplete?.(aggregated);
            setUploadResult(aggregated);
            setStep('done');
            toast.success(`업로드 완료: ${aggregated.inserted}건 추가, ${aggregated.updated}건 갱신`);
        } catch (error) {
            console.error('[MockMarking] Upload error:', error);
            const normalizedError = error instanceof Error ? error : new Error(String(error));
            if (executionStarted) {
                try {
                    await onExecutionError?.(normalizedError, aggregated);
                } catch (trackingError) {
                    console.error('[MockMarking] Failed to persist WORK error:', trackingError);
                }
            }
            toast.error('업로드 실패: ' + normalizedError.message);
            setStep('matching');
        } finally {
            setUploading(false);
            setUploadingLabel('');
        }
    }, [
        groups,
        manualMatches,
        onExecutionComplete,
        onExecutionError,
        onExecutionStart,
    ]);

    const handleReset = useCallback(() => {
        setStep('select');
        setGroups([]);
        setExpandedGroups(new Set());
        setGroupMatchResults([]);
        setUploadResult(null);
        setUploadProgress(0);
        setUploadingLabel('');
        setManualMatches(new Map());
        setEditingMatchKey(null);
    }, []);

    const totalStudents = groups.reduce((sum, g) => sum + g.data.length, 0);
    const totalMatchedCount = groupMatchResults.reduce((sum, g) => sum + g.results.filter(r => r.matched).length, 0);
    const totalUnmatchedCount = groupMatchResults.reduce((sum, g) => sum + g.results.filter(r => !r.matched).length, 0);

    return (
        <div className="space-y-4 h-full flex flex-col">
            {/* Step: File Selection */}
            {step === 'select' && (
                <>
                    <div className="p-8 border-2 border-dashed rounded-lg text-center space-y-4 flex-1 flex flex-col items-center justify-center">
                        <Upload className="w-12 h-12 text-slate-400" />
                        <h3 className="text-lg font-semibold">모의고사 마킹 데이터 업로드</h3>
                        <p className="text-sm text-slate-500">
                            마킹현황 CSV 파일을 선택하세요.<br />
                            <strong>여러 학년의 파일</strong>을 함께 선택할 수 있으며, 학년+월 기준으로 자동 그룹핑됩니다.<br />
                            같은 학년의 <strong>답안(1)</strong>과 <strong>정오(s)</strong> 파일은 자동 병합됩니다.
                        </p>

                        <div className="flex items-center gap-2 mb-2">
                            <label className="text-sm text-slate-600 font-medium">학년도:</label>
                            <Input
                                type="number"
                                value={inputYear}
                                onChange={e => setInputYear(parseInt(e.target.value) || new Date().getFullYear())}
                                className="w-24 h-9 text-center"
                            />
                            <span className="text-xs text-slate-400">년</span>
                        </div>

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
                        <h4 className="font-bold mb-2">안내</h4>
                        <ul className="list-disc list-inside space-y-1">
                            <li>CSV 헤더: 계열, 학년, 반, 번호, 이름, 과목, 1번~60번</li>
                            <li><strong>답안 파일 (1)</strong>: 학생이 선택한 답 (1~5, 주관식은 숫자)</li>
                            <li><strong>정오 파일 (s)</strong>: O(정답) / X(오답)</li>
                            <li>파일명에서 학년, 월을 자동 감지합니다. 학년도는 직접 입력하세요.</li>
                            <li>여러 학년 파일을 한 번에 선택하면 학년별로 자동 분류됩니다.</li>
                        </ul>
                    </div>
                </>
            )}

            {/* Step: Parse Preview (multi-group) */}
            {step === 'preview' && (
                <>
                    <div className="bg-blue-50 p-4 rounded-md border border-blue-100 flex justify-between items-center shrink-0">
                        <div>
                            <h3 className="font-bold text-lg text-blue-800">파싱 결과 미리보기</h3>
                            <p className="text-sm text-blue-600">
                                {groups.length}개 그룹 | 총 {totalStudents}명
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
                        {groups.map((group, gIdx) => (
                            <div key={gIdx} className="border rounded-md">
                                {/* Group header */}
                                <div className="bg-slate-50 p-3 flex items-center gap-3">
                                    <button
                                        onClick={() => toggleGroupExpand(gIdx)}
                                        className="text-slate-500 hover:text-slate-700"
                                    >
                                        {expandedGroups.has(gIdx)
                                            ? <ChevronDown className="w-4 h-4" />
                                            : <ChevronRight className="w-4 h-4" />}
                                    </button>
                                    <FileText className="w-4 h-4 text-blue-500" />
                                    <span className="font-medium text-sm flex-1">
                                        {group.examGrade}학년 {group.examMonth}월
                                        <span className="text-xs text-slate-400 ml-2">
                                            ({group.sourceFiles.join(', ')})
                                        </span>
                                    </span>
                                    <span className="text-xs text-slate-500">{group.data.length}명 | {group.subjectList.length}과목</span>

                                    {/* Editable meta */}
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            value={group.academicYear}
                                            onChange={e => handleUpdateGroupMeta(gIdx, 'academicYear', parseInt(e.target.value) || 2025)}
                                            className="w-20 h-8 text-xs"
                                            title="학년도"
                                        />
                                        <span className="text-xs text-slate-400">년</span>
                                        <Select
                                            value={String(group.examGrade)}
                                            onValueChange={v => handleUpdateGroupMeta(gIdx, 'examGrade', parseInt(v))}
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
                                            value={String(group.examMonth)}
                                            onValueChange={v => handleUpdateGroupMeta(gIdx, 'examMonth', parseInt(v))}
                                        >
                                            <SelectTrigger className="w-16 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                    <SelectItem key={m} value={String(m)}>{m}월</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <span className="text-xs text-slate-400 ml-1">
                                            입학: {group.academicYear - group.examGrade + 1}
                                        </span>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"
                                        onClick={() => handleRemoveGroup(gIdx)}
                                        title="그룹 제거"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>

                                {/* Expandable data table */}
                                {expandedGroups.has(gIdx) && (
                                    <div className="max-h-64 overflow-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-100 sticky top-0 z-10">
                                                <tr>
                                                    <th className="p-2 border-b w-12">#</th>
                                                    <th className="p-2 border-b w-10">반</th>
                                                    <th className="p-2 border-b w-10">번호</th>
                                                    <th className="p-2 border-b w-20">이름</th>
                                                    {group.subjectList.map(subj => (
                                                        <th key={subj} className="p-2 border-b text-center text-xs">{subj}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.data.map((student, idx) => (
                                                    <tr key={idx} className="border-b hover:bg-slate-50">
                                                        <td className="p-1.5 text-slate-400 text-xs">{idx + 1}</td>
                                                        <td className="p-1.5 text-center text-xs">{student.classNum}</td>
                                                        <td className="p-1.5 text-center text-xs">{student.number}</td>
                                                        <td className="p-1.5 font-medium text-xs">{student.name}</td>
                                                        {group.subjectList.map(subj => {
                                                            const data = student.subjects[subj];
                                                            if (!data) return <td key={subj} className="p-1.5 text-center text-xs text-slate-300">-</td>;
                                                            const hasAnswers = data.answers.length > 0;
                                                            const hasCorrect = data.correct.length > 0;
                                                            const correctCount = data.correct.filter(c => c === true).length;
                                                            return (
                                                                <td key={subj} className="p-1.5 text-center text-xs" title={`문항: ${data.item_count}`}>
                                                                    <span className={hasAnswers && hasCorrect ? 'text-green-700' : hasAnswers ? 'text-blue-600' : 'text-orange-600'}>
                                                                        {data.item_count}문항
                                                                        {hasCorrect && <span className="text-slate-400 ml-0.5">({correctCount})</span>}
                                                                    </span>
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
                        <Button onClick={handlePreviewMatching} disabled={matchLoading || groups.length === 0}>
                            {matchLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                            학생 매칭 확인
                        </Button>
                    </div>
                </>
            )}

            {/* Step: Matching Preview (multi-group) */}
            {step === 'matching' && (
                <>
                    <div className="bg-green-50 p-4 rounded-md border border-green-100 shrink-0">
                        <h3 className="font-bold text-lg text-green-800">학생 매칭 결과</h3>
                        <div className="flex gap-6 mt-2 text-sm">
                            <span className="text-slate-600">{groupMatchResults.length}개 그룹</span>
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
                        {groupMatchResults.map((gr, gIdx) => {
                            const matched = gr.results.filter(r => r.matched).length;
                            const unmatched = gr.results.filter(r => !r.matched).length;

                            return (
                                <div key={gIdx} className="border rounded-md">
                                    <div
                                        className="bg-slate-50 p-3 flex items-center gap-3 cursor-pointer"
                                        onClick={() => toggleGroupExpand(gIdx)}
                                    >
                                        {expandedGroups.has(gIdx)
                                            ? <ChevronDown className="w-4 h-4 text-slate-500" />
                                            : <ChevronRight className="w-4 h-4 text-slate-500" />}
                                        <FileText className="w-4 h-4 text-blue-500" />
                                        <span className="font-medium text-sm flex-1">
                                            {gr.examGrade}학년 {gr.examMonth}월
                                            <span className="text-xs text-slate-400 ml-2">
                                                ({gr.academicYear}년)
                                            </span>
                                        </span>
                                        <span className="text-xs text-green-600 font-medium">{matched}명 매칭</span>
                                        {unmatched > 0 && (
                                            <span className="text-xs text-red-500 font-medium">{unmatched}명 실패</span>
                                        )}
                                    </div>

                                    {expandedGroups.has(gIdx) && (
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
                                                    {gr.results.map((result, idx) => (
                                                        <tr
                                                            key={idx}
                                                            className={`border-b ${result.matched ? 'hover:bg-slate-50' : 'bg-red-50 hover:bg-red-100'}`}
                                                        >
                                                            <td className="p-1.5">
                                                                {result.matched
                                                                    ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                                                                    : <XCircle className="w-4 h-4 text-red-500" />}
                                                            </td>
                                                            <td className="p-1.5 text-center text-xs">{result.student.classNum}</td>
                                                            <td className="p-1.5 text-center text-xs">{result.student.number}</td>
                                                            <td className="p-1.5 font-medium text-xs">{result.student.name}</td>
                                                            <td className="p-1.5 font-mono text-xs">
                                                                {(() => {
                                                                    const matchKey = `${gIdx}:${result.student.classNum}-${result.student.number}`;
                                                                    if (editingMatchKey === matchKey) {
                                                                        return (
                                                                            <div className="flex items-center gap-1">
                                                                                <Input
                                                                                    value={editMatchValue}
                                                                                    onChange={e => setEditMatchValue(e.target.value)}
                                                                                    onKeyDown={e => {
                                                                                        if (e.key === 'Enter') handleManualMatch(gIdx, idx, result);
                                                                                        if (e.key === 'Escape') setEditingMatchKey(null);
                                                                                    }}
                                                                                    className="h-6 w-24 text-xs font-mono px-1"
                                                                                    autoFocus
                                                                                    placeholder="학생 ID"
                                                                                />
                                                                                <button onClick={() => handleManualMatch(gIdx, idx, result)} className="text-emerald-600 hover:text-emerald-800">
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
                                                                            <span className={result.matched ? 'text-blue-600' : 'text-red-400'}>
                                                                                {result.matched?.id || '-'}
                                                                            </span>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setEditingMatchKey(matchKey);
                                                                                    setEditMatchValue(result.matched?.id || '');
                                                                                }}
                                                                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-600 transition-opacity"
                                                                            >
                                                                                <Pencil className="h-3 w-3" />
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </td>
                                                            <td className="p-1.5 text-xs">{result.matched?.name || '-'}</td>
                                                            <td className="p-1.5 text-xs text-slate-500">
                                                                {result.matchMethod === 'grade_info' ? '반+번호'
                                                                    : result.matchMethod === 'name' ? '이름'
                                                                    : '-'}
                                                            </td>
                                                            <td className="p-1.5 text-center text-xs">
                                                                {groups[gIdx] ? Object.keys(groups[gIdx].data.find(
                                                                    s => s.classNum === result.student.classNum && s.number === result.student.number
                                                                )?.subjects || {}).length : '-'}
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
                        <Button variant="outline" onClick={() => { setStep('preview'); setExpandedGroups(new Set()); }}>이전</Button>
                        <Button
                            onClick={handleUpload}
                            disabled={uploading || totalMatchedCount === 0}
                        >
                            {totalMatchedCount}명 데이터 업로드 ({groups.length}개 그룹)
                        </Button>
                    </div>
                </>
            )}

            {/* Step: Uploading */}
            {step === 'uploading' && (
                <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
                    <h3 className="text-lg font-semibold">업로드 중...</h3>
                    {uploadingLabel && (
                        <p className="text-sm text-slate-500">{uploadingLabel}</p>
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

                    {/* Per-group breakdown */}
                    {uploadResult.perGroup.length > 1 && (
                        <div className="w-full max-w-lg">
                            <h4 className="text-sm font-semibold text-slate-600 mb-2">그룹별 결과</h4>
                            <div className="space-y-1">
                                {uploadResult.perGroup.map((pg, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs bg-white border rounded px-3 py-2">
                                        <span className="truncate flex-1 mr-4">{pg.label}</span>
                                        <div className="flex gap-3 shrink-0">
                                            <span className="text-green-600">+{pg.inserted}</span>
                                            <span className="text-blue-600">~{pg.updated}</span>
                                            <span className="text-slate-400">={pg.skipped}</span>
                                            {pg.unmatched > 0 && <span className="text-red-500">x{pg.unmatched}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {uploadResult.unmatched > 0 && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 rounded-md text-sm text-amber-800 max-w-md">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{uploadResult.unmatched}명의 학생이 매칭되지 않았습니다.</span>
                        </div>
                    )}

                    <Button onClick={handleReset}>다른 파일 업로드</Button>
                </div>
            )}
        </div>
    );
};
