import React, { useState } from 'react';
import { DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/lib/toast';
import { parseStudentExcel } from '../../utils/excelParser';
import { ParsedData } from '../../types/excelTypes';
import { uploadStudentData, extractAndSaveBooks } from '../../services/adminService';
import { reconcileStudentIdsWithResource } from '../../services/studentIdReconciler';
import { downloadUploadLogs } from '../../utils/uploadLogger';
import { Loader2, UserPlus, FileJson, BookOpen, Pencil, Check, X } from 'lucide-react';
import { Student } from '../../types';
import { CurriculumExtractionTab } from './CurriculumExtractionTab';
import { StudentManagementTab } from './StudentManagementTab';
import { PermissionSettingsTab } from './PermissionSettingsTab';
import { AIAnalysisTab } from './AIAnalysisTab';


interface AdminDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onBatchAddStudents?: (students: Student[]) => void;
    /** 데이터 업로드(기초 자료·상세 활동) DB 저장 성공 시 — 워크플로 WORK 완료 기록용 */
    onDataUploaded?: (summary: { basicCount: number; activityCount: number }) => void;
}

export const AdminDialog: React.FC<AdminDialogProps> = ({ open, onOpenChange, onBatchAddStudents, onDataUploaded }) => {
    const [uploading, setUploading] = useState(false);
    const [parsedData, setParsedData] = useState<ParsedData | null>(null);
    const [selectedContent, setSelectedContent] = useState<string | null>(null);

    // Extraction State
    const [extractableStudents, setExtractableStudents] = useState<any[]>([]);
    const [selectedExtractIds, setSelectedExtractIds] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState("upload");
    const [uploadProgress, setUploadProgress] = useState(0);

    // StudentID inline edit state (upload preview)
    const [editingPreviewIdx, setEditingPreviewIdx] = useState<number | null>(null);
    const [editPreviewIdValue, setEditPreviewIdValue] = useState('');

    const handlePreviewIdChange = (idx: number) => {
        if (!parsedData) return;
        const newId = editPreviewIdValue.trim();
        const oldId = parsedData.basicInfo[idx].id;
        const oldStudentId = parsedData.basicInfo[idx].studentId;
        setEditingPreviewIdx(null);
        if (!newId || (newId === oldId && newId === oldStudentId)) return;

        const newBasicInfo = [...parsedData.basicInfo];
        newBasicInfo[idx] = { ...newBasicInfo[idx], id: newId, studentId: newId };

        const newActivities = parsedData.detailedActivities.map(a => {
            if (a.id === oldId || a.studentId === oldStudentId) {
                return { ...a, id: newId, studentId: newId };
            }
            return a;
        });

        setParsedData({ ...parsedData, basicInfo: newBasicInfo, detailedActivities: newActivities });
        toast.info(`ID 변경: ${oldId} → ${newId} (상세 활동 ${newActivities.filter(a => a.id === newId).length}건 반영)`);
    };

    // Book extraction state
    const [extractingBooks, setExtractingBooks] = useState(false);
    const [bookExtractionProgress, setBookExtractionProgress] = useState(0);
    const [bookExtractionMessage, setBookExtractionMessage] = useState('');
    const [bookExtractionResult, setBookExtractionResult] = useState<{ totalStudents: number; totalBooks: number; updatedStudents: number } | null>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;

        const files = Array.from(e.target.files);
        setUploading(true);
        try {
            const parsed = await parseStudentExcel(files);
            // 채번된 ID를 resource(신원 anchor)와 교차 검증 — 전입생 ID 충돌 방지
            const { data, report } = await reconcileStudentIdsWithResource(parsed);
            setParsedData(data);

            if (report.changed.length > 0) {
                const detail = report.changed
                    .map(c => `${c.name}: ${c.fileId}→${c.resourceId}`)
                    .join(', ');
                toast.warning(`전입생 등 ${report.changed.length}명의 ID를 resource 기준으로 교정: ${detail}`);
            }
            if (report.conflicts.length > 0) {
                const detail = report.conflicts
                    .map(c => `${c.name}(${c.fileId}=${c.ownerName} 소유)`)
                    .join(', ');
                toast.error(
                    `ID 충돌로 ${report.conflicts.length}명 업로드 제외: ${detail} — resource에 학생 등록 후 다시 업로드하세요.`,
                    { duration: 15000 }
                );
            }
            if (report.unmatched.length > 0) {
                toast.info(`resource 미등록 ${report.unmatched.length}명(파일 ID 유지): ${report.unmatched.join(', ')}`);
            }
            toast.info('데이터 파싱 완료. 내용을 확인해주세요.');
        } catch (error) {
            console.error(error);
            toast.error('파일 파싱 실패');
        } finally {
            setUploading(false);
            e.target.value = ''; // Reset input
        }
    };

    const handleConfirmUpload = async () => {
        if (!parsedData) return;

        setUploading(true);
        setUploadProgress(0);
        try {
            await uploadStudentData(parsedData, (progress) => {
                setUploadProgress(progress);
            });
            toast.success('데이터 업로드 및 데이터베이스 구축 완료');
            onDataUploaded?.({
                basicCount: parsedData.basicInfo.length,
                activityCount: parsedData.detailedActivities.length,
            });

            // CSV 로그 다운로드
            try {
                downloadUploadLogs(parsedData.parserMeta || [], parsedData.detailedActivities);
                toast.info('파싱 로그 CSV 파일이 다운로드됩니다.');
            } catch (logError) {
                console.error('CSV 로그 다운로드 실패:', logError);
            }

            setParsedData(null);
        } catch (error) {
            console.error(error);
            toast.error('데이터 업로드 실패');
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    const handleCancelPreview = () => {
        setParsedData(null);
        setExtractableStudents([]);
    };

    // --- Extraction Logic ---

    const convertToStudents = (data: ParsedData): any[] => {
        return data.basicInfo.map(info => {
            // Format studentNo as GCCNN
            const grade = info.grade || 0;
            const classNum = info.classNum || 0;
            const num = info.student_no || 0;
            const formattedStudentNo = `${grade}${String(classNum).padStart(2, '0')}${String(num).padStart(2, '0')}`;

            // Filter activities for this student
            const studentActivities = data.detailedActivities.filter(a => a.studentId === info.studentId);

            // 1. Creative Activities (Section 5)
            const creativeActivities = studentActivities
                .filter(a => ['자율활동', '동아리활동', '진로활동'].includes(a.category))
                .map(a => ({
                    grade: a.grade,
                    type: a.category,
                    hours: a.data?.시간 ? parseInt(a.data.시간) : null,
                    field: a.data?.희망분야 || null,
                    content: a.content
                }))
                .sort((a, b) => a.grade - b.grade);

            // 2. Behavioral Characteristics (Section 8)
            const behavioral = studentActivities
                .filter(a => a.category.includes('행동특성'))
                .map(a => ({
                    grade: a.grade,
                    content: a.content
                }))
                .sort((a, b) => a.grade - b.grade);

            // 3. Academic Development (Section 6) - Merge SeTeuk
            // 3. Academic Development (Section 6)
            // SeTeuk content is already merged into 'content' field by excelParser.ts
            const academic = info.academic_development || [];

            // 4. Header / Grade Info
            const header = {
                documentTitle: "학교생활세부사항기록부(학교생활기록부II)",
                gradeInfo: info.gradeInfo || []
            };

            const newStudent: any = {
                id: crypto.randomUUID(),
                studentId: info.studentId,
                studentNo: formattedStudentNo,
                name: info.name,
                status: '미평가',
                uploadedAt: new Date().toISOString(),
                totalScore: null,
                majorScore: null,
                attendance: '대기중',

                // Detailed Sections
                header: header,
                section1_personal_info: info.section1_personal_info,
                section2_attendance: info.attendance,
                section5_creative_activities: creativeActivities,
                section6_academic_development: academic,
                section8_behavior_characteristics: behavioral,
                volunteer_activities: info.volunteer,
            };
            return newStudent;
        });
    };

    const handlePrepareExtraction = () => {
        if (!parsedData) return;
        const converted = convertToStudents(parsedData);
        setExtractableStudents(converted);
        setSelectedExtractIds(new Set(converted.map(s => s.id)));
        setActiveTab("extract");
        toast.success(`${converted.length}명의 학생 데이터를 추출했습니다.`);
    };

    const toggleExtractSelection = (id: string) => {
        const newSet = new Set(selectedExtractIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedExtractIds(newSet);
    };

    const toggleExtractAll = () => {
        if (selectedExtractIds.size === extractableStudents.length) {
            setSelectedExtractIds(new Set());
        } else {
            setSelectedExtractIds(new Set(extractableStudents.map(s => s.id)));
        }
    };

    const handleSendToStudentList = () => {
        if (!onBatchAddStudents) {
            toast.error('학생 목록 전송 기능이 연결되지 않았습니다.');
            return;
        }

        const selectedStudents = extractableStudents.filter(s => selectedExtractIds.has(s.id));
        if (selectedStudents.length === 0) {
            toast.warning('선택된 학생이 없습니다.');
            return;
        }

        onBatchAddStudents(selectedStudents);
        toast.success(`${selectedStudents.length}명의 학생을 목록으로 전송했습니다.`);
        onOpenChange(false);
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="!max-w-[95vw] !w-[95vw] !h-[90vh] flex flex-col p-6">
                    <DialogHeader>
                        <DialogTitle>관리자 기능</DialogTitle>
                    </DialogHeader>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                        <TabsList>
                            <TabsTrigger value="upload">데이터 업로드</TabsTrigger>
                            <TabsTrigger value="students">학생 관리</TabsTrigger>
                            {extractableStudents.length > 0 && (
                                <TabsTrigger value="extract">학생 추출 ({extractableStudents.length})</TabsTrigger>
                            )}
                            <TabsTrigger value="book-extract">독서 추출</TabsTrigger>
                            <TabsTrigger value="curriculum">교육과정 추출</TabsTrigger>
                            <TabsTrigger value="permissions">권한 설정</TabsTrigger>
                            <TabsTrigger value="ai-analysis">AI 분석</TabsTrigger>
                        </TabsList>

                        <TabsContent value="upload" className="flex-1 p-4 border rounded-md mt-2 overflow-auto">
                            <div className="space-y-4 h-full flex flex-col">
                                {!parsedData ? (
                                    <>
                                        <div className="p-8 border-2 border-dashed rounded-lg text-center space-y-4">
                                            <h3 className="text-lg font-semibold">엑셀 파일 업로드</h3>
                                            <p className="text-sm text-slate-500">
                                                학적사항, 출결상황, 봉사활동, 창의적체험활동 등<br />
                                                여러 엑셀 파일을 한꺼번에 선택하여 업로드하세요.
                                            </p>
                                            <div className="flex justify-center">
                                                <Button disabled={uploading} asChild>
                                                    <label>
                                                        {uploading ? <Loader2 className="animate-spin mr-2" /> : '파일 선택'}
                                                        <Input
                                                            type="file"
                                                            multiple
                                                            accept=".xlsx,.xls"
                                                            className="hidden"
                                                            onChange={handleFileSelect}
                                                            disabled={uploading}
                                                        />
                                                    </label>
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 p-4 rounded text-sm text-slate-600">
                                            <h4 className="font-bold mb-2">업로드 가이드</h4>
                                            <ul className="list-disc list-inside space-y-1">
                                                <li>파일명에 '학적사항', '출결상황' 등이 포함되어야 자동으로 분류됩니다.</li>
                                                <li>중복된 학생 ID(입학년도-학년반번호)가 존재하면 덮어씁니다.</li>
                                                <li>파일 선택 후 미리보기 화면에서 내용을 확인하고 업로드를 확정하세요.</li>
                                            </ul>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col h-full space-y-4 overflow-hidden">
                                        <div className="bg-blue-50 p-4 rounded-md border border-blue-100 shrink-0 flex justify-between items-center">
                                            <div>
                                                <h3 className="font-bold text-lg text-blue-800 mb-1">업로드 미리보기</h3>
                                                <p className="text-sm text-blue-600">
                                                    다음 데이터가 데이터베이스에 저장됩니다. 내용을 확인해주세요.
                                                </p>
                                            </div>
                                            <Button
                                                variant="secondary"
                                                className="bg-blue-100 text-blue-700 hover:bg-blue-200"
                                                onClick={handlePrepareExtraction}
                                            >
                                                <UserPlus className="w-4 h-4 mr-2" />
                                                학생 목록으로 추출
                                            </Button>
                                        </div>

                                        <Tabs defaultValue="basic" className="flex-1 flex flex-col min-h-0 h-full">
                                            <TabsList>
                                                <TabsTrigger value="basic">기초 자료 ({parsedData.basicInfo.length})</TabsTrigger>
                                                <TabsTrigger value="activities">상세 활동 ({parsedData.detailedActivities.length})</TabsTrigger>
                                            </TabsList>

                                            <TabsContent value="basic" className="flex-1 overflow-auto border rounded-md mt-2 h-full">
                                                <table className="w-full text-sm text-left">
                                                    <thead className="bg-slate-100 sticky top-0 z-10">
                                                        <tr>
                                                            <th className="p-2 border-b w-24">StudentID</th>
                                                            <th className="p-2 border-b w-24">studentNo</th>
                                                            <th className="p-2 border-b w-20">이름</th>
                                                            <th className="p-2 border-b w-16">학년</th>
                                                            <th className="p-2 border-b w-16">반</th>
                                                            <th className="p-2 border-b w-24">출결</th>
                                                            <th className="p-2 border-b w-24">봉사</th>
                                                            <th className="p-2 border-b w-24">학년반이력</th>
                                                            <th className="p-2 border-b w-24">교과학습발달</th>
                                                            <th className="p-2 border-b w-24">독서</th>
                                                            <th className="p-2 border-b w-24">학적사항</th>
                                                            <th className="p-2 border-b w-32">출처 파일</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {parsedData.basicInfo.map((item, idx) => {
                                                            const currentNo = `${item.grade}${String(item.classNum).padStart(2, '0')}${String(item.student_no).padStart(2, '0')}`;
                                                            return (
                                                                <tr key={idx} className="border-b hover:bg-slate-50">
                                                                    <td className="p-2 font-mono text-xs">
                                                                        {editingPreviewIdx === idx ? (
                                                                            <div className="flex items-center gap-1">
                                                                                <Input
                                                                                    value={editPreviewIdValue}
                                                                                    onChange={(e) => setEditPreviewIdValue(e.target.value)}
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === 'Enter') handlePreviewIdChange(idx);
                                                                                        if (e.key === 'Escape') setEditingPreviewIdx(null);
                                                                                    }}
                                                                                    className="h-6 w-24 text-xs font-mono px-1"
                                                                                    autoFocus
                                                                                />
                                                                                <button onClick={() => handlePreviewIdChange(idx)} className="text-emerald-600 hover:text-emerald-800">
                                                                                    <Check className="h-3.5 w-3.5" />
                                                                                </button>
                                                                                <button onClick={() => setEditingPreviewIdx(null)} className="text-slate-400 hover:text-slate-600">
                                                                                    <X className="h-3.5 w-3.5" />
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex items-center gap-1 group">
                                                                                <span className="text-blue-600">{item.studentId || '-'}</span>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setEditingPreviewIdx(idx);
                                                                                        setEditPreviewIdValue(item.studentId || item.id || '');
                                                                                    }}
                                                                                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-600 transition-opacity"
                                                                                >
                                                                                    <Pencil className="h-3 w-3" />
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="p-2 font-mono text-xs">{currentNo}</td>
                                                                    <td className="p-2 font-medium">{item.name}</td>
                                                                    <td className="p-2 text-center">{item.grade}</td>
                                                                    <td className="p-2 text-center">{item.classNum}</td>
                                                                    <td
                                                                        className="p-2 text-xs text-slate-600 cursor-pointer hover:bg-slate-100 hover:text-blue-600 transition-colors"
                                                                        onClick={() => setSelectedContent(JSON.stringify(item.attendance, null, 2))}
                                                                    >
                                                                        <div className="max-w-[200px] truncate" title="클릭하여 전체 보기">
                                                                            {item.attendance && (Array.isArray(item.attendance) ? item.attendance.length > 0 : Object.keys(item.attendance).length > 0)
                                                                                ? JSON.stringify(item.attendance)
                                                                                : '-'}
                                                                        </div>
                                                                    </td>
                                                                    <td
                                                                        className="p-2 text-xs text-slate-600 cursor-pointer hover:bg-slate-100 hover:text-blue-600 transition-colors"
                                                                        onClick={() => setSelectedContent(JSON.stringify(item.volunteer, null, 2))}
                                                                    >
                                                                        <div className="max-w-[200px] truncate" title="클릭하여 전체 보기">
                                                                            {item.volunteer && (Array.isArray(item.volunteer) ? item.volunteer.length > 0 : Object.keys(item.volunteer).length > 0)
                                                                                ? JSON.stringify(item.volunteer)
                                                                                : '-'}
                                                                        </div>
                                                                    </td>
                                                                    <td
                                                                        className="p-2 text-xs text-slate-600 cursor-pointer hover:bg-slate-100 hover:text-blue-600 transition-colors"
                                                                        onClick={() => setSelectedContent(JSON.stringify(item.gradeInfo, null, 2))}
                                                                    >
                                                                        <div className="max-w-[200px] truncate" title="클릭하여 전체 보기">
                                                                            {item.gradeInfo && item.gradeInfo.length > 0
                                                                                ? JSON.stringify(item.gradeInfo)
                                                                                : '-'}
                                                                        </div>
                                                                    </td>
                                                                    <td
                                                                        className="p-2 text-xs text-slate-600 cursor-pointer hover:bg-slate-100 hover:text-blue-600 transition-colors"
                                                                        onClick={() => setSelectedContent(JSON.stringify(item.academic_development, null, 2))}
                                                                    >
                                                                        <div className="max-w-[200px] truncate" title="클릭하여 전체 보기">
                                                                            {item.academic_development && (Array.isArray(item.academic_development) ? item.academic_development.length > 0 : Object.keys(item.academic_development).length > 0)
                                                                                ? JSON.stringify(item.academic_development)
                                                                                : '-'}
                                                                        </div>
                                                                    </td>
                                                                    <td
                                                                        className="p-2 text-xs text-slate-600 cursor-pointer hover:bg-slate-100 hover:text-blue-600 transition-colors"
                                                                        onClick={() => setSelectedContent(JSON.stringify(item.reading, null, 2))}
                                                                    >
                                                                        <div className="max-w-[200px] truncate" title="클릭하여 전체 보기">
                                                                            {item.reading && (Array.isArray(item.reading) ? item.reading.length > 0 : Object.keys(item.reading).length > 0)
                                                                                ? JSON.stringify(item.reading)
                                                                                : '-'}
                                                                        </div>
                                                                    </td>
                                                                    <td
                                                                        className="p-2 text-xs text-slate-600 cursor-pointer hover:bg-slate-100 hover:text-blue-600 transition-colors"
                                                                        onClick={() => setSelectedContent(JSON.stringify(item.section1_personal_info, null, 2))}
                                                                    >
                                                                        <div className="max-w-[200px] truncate" title="클릭하여 전체 보기">
                                                                            {item.section1_personal_info && Object.keys(item.section1_personal_info).length > 0
                                                                                ? JSON.stringify(item.section1_personal_info)
                                                                                : '-'}
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-2 text-slate-500 text-xs truncate max-w-[200px]">{item.source}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                        {parsedData.basicInfo.length > 100 && (
                                                            <tr>
                                                                <td colSpan={6} className="p-4 text-center text-slate-500">
                                                                    ... 외 {parsedData.basicInfo.length - 100}건 생략됨
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </TabsContent>

                                            <TabsContent value="activities" className="flex-1 overflow-auto border rounded-md mt-2 h-full">
                                                <table className="w-full text-sm text-left">
                                                    <thead className="bg-slate-100 sticky top-0 z-10">
                                                        <tr>
                                                            <th className="p-2 border-b w-32">StudentID</th>
                                                            <th className="p-2 border-b w-32">studentNo</th>
                                                            <th className="p-2 border-b w-20">이름</th>
                                                            <th className="p-2 border-b w-16">학년</th>
                                                            <th className="p-2 border-b w-16">이수년도</th>
                                                            <th className="p-2 border-b w-16">학기</th>
                                                            <th className="p-2 border-b w-24">영역</th>
                                                            <th className="p-2 border-b w-24">과목</th>
                                                            <th className="p-2 border-b w-16">시간</th>
                                                            <th className="p-2 border-b">내용</th>
                                                            <th className="p-2 border-b w-32">출처 파일</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {parsedData.detailedActivities.map((item, idx) => {
                                                            // Find current student info from basicInfo to display current studentNo
                                                            const student = parsedData.basicInfo.find(s => s.studentId === item.studentId);
                                                            const currentNo = student
                                                                ? `${student.grade}${String(student.classNum).padStart(2, '0')}${String(student.student_no).padStart(2, '0')}`
                                                                : (item.classNum && item.studentNo
                                                                    ? `${item.grade}${String(item.classNum).padStart(2, '0')}${String(item.studentNo).padStart(2, '0')}`
                                                                    : '-');

                                                            return (
                                                                <tr key={idx} className="border-b hover:bg-slate-50">
                                                                    <td className="p-2 font-mono text-xs text-blue-600">{item.studentId || '-'}</td>
                                                                    <td className="p-2 font-mono text-xs">{currentNo}</td>
                                                                    <td className="p-2 font-medium">{item.name}</td>
                                                                    <td className="p-2 text-xs text-center">
                                                                        {item.data && item.data.학년 ? item.data.학년 : (item.grade ? item.grade : '-')}
                                                                    </td>
                                                                    <td className="p-2 text-xs text-center">{item.year || '-'}</td>
                                                                    <td className="p-2 text-xs text-center">
                                                                        {item.data && item.data.학기 ? item.data.학기 : '-'}
                                                                    </td>
                                                                    <td className="p-2 text-xs font-medium text-slate-600">
                                                                        {item.category}
                                                                    </td>
                                                                    <td className="p-2 text-xs font-semibold text-slate-800">
                                                                        {item.subject_name || '-'}
                                                                    </td>
                                                                    <td className="p-2 text-xs text-center">
                                                                        {item.data && item.data.시간 ? item.data.시간 : '-'}
                                                                    </td>
                                                                    <td
                                                                        className="p-2 text-xs cursor-pointer hover:bg-slate-100 hover:text-blue-600 transition-colors"
                                                                        onClick={() => setSelectedContent(item.content)}
                                                                    >
                                                                        <div className="whitespace-pre-wrap" title="클릭하여 전체 보기">
                                                                            {item.content || '-'}
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-2 text-slate-500 text-xs truncate max-w-[150px]">{item.source}</td>
                                                                </tr>
                                                            );
                                                        })}

                                                    </tbody>
                                                </table>
                                            </TabsContent>
                                        </Tabs>

                                        <DialogFooter className="flex justify-end gap-3 shrink-0 pt-2">
                                            <Button variant="outline" onClick={handleCancelPreview} disabled={uploading}>
                                                취소
                                            </Button>
                                            <Button onClick={handleConfirmUpload} disabled={uploading}>
                                                {uploading ? (
                                                    <>
                                                        <Loader2 className="animate-spin mr-2 h-4 w-4" />
                                                        저장 중 ({uploadProgress}%)
                                                    </>
                                                ) : '데이터베이스에 저장'}
                                            </Button>
                                        </DialogFooter>
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="students" className="flex-1 min-h-0 mt-2 border rounded-md p-4">
                            <StudentManagementTab />
                        </TabsContent>

                        <TabsContent value="extract" className="flex-1 min-h-0 mt-2 border rounded-md p-4">
                            <div className="flex flex-col h-full">
                                <div className="flex justify-between items-center mb-4 shrink-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold">추출된 학생 목록 ({extractableStudents.length}명)</h3>
                                        <span className="text-sm text-slate-500">
                                            ({selectedExtractIds.size}명 선택됨)
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="outline" onClick={() => setActiveTab("upload")}>
                                            뒤로가기
                                        </Button>
                                        <Button onClick={handleSendToStudentList} disabled={selectedExtractIds.size === 0}>
                                            학생 목록으로 전송
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-auto border rounded-md bg-white">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-100 sticky top-0">
                                            <tr>
                                                <th className="p-3 border-b w-12 text-center">
                                                    <Checkbox
                                                        checked={selectedExtractIds.size === extractableStudents.length && extractableStudents.length > 0}
                                                        onCheckedChange={toggleExtractAll}
                                                    />
                                                </th>
                                                <th className="p-3 border-b">이름</th>
                                                <th className="p-3 border-b">학번 (표시용)</th>
                                                <th className="p-3 border-b">관리 ID</th>
                                                <th className="p-3 border-b w-24 text-center">데이터</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {extractableStudents.map(student => (
                                                <tr key={student.id} className="border-b hover:bg-slate-50">
                                                    <td className="p-3 text-center">
                                                        <Checkbox
                                                            checked={selectedExtractIds.has(student.id)}
                                                            onCheckedChange={() => toggleExtractSelection(student.id)}
                                                        />
                                                    </td>
                                                    <td className="p-3 font-medium">{student.name}</td>
                                                    <td className="p-3 font-mono">{student.studentNo}</td>
                                                    <td className="p-3 font-mono text-xs text-slate-400">{student.studentId || '-'}</td>
                                                    <td className="p-3 text-center">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 p-0"
                                                            onClick={() => setSelectedContent(JSON.stringify(student, null, 2))}
                                                            title="JSON 데이터 보기"
                                                        >
                                                            <FileJson className="h-4 w-4 text-slate-500" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="book-extract" className="flex-1 min-h-0 mt-2 border rounded-md p-4 overflow-auto">
                            <div className="space-y-6">
                                <div className="p-6 border-2 border-dashed rounded-lg text-center space-y-4">
                                    <div className="flex justify-center">
                                        <div className="p-3 rounded-xl bg-cyan-50 text-cyan-600">
                                            <BookOpen size={32} />
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-semibold">독서 기록 추출</h3>
                                    <p className="text-sm text-slate-500 max-w-lg mx-auto">
                                        학생의 세부능력및특기사항(student_detailed_activities) 내용에서<br />
                                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">"도서명(저자명)"</code> 또는{' '}
                                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">'도서명(저자명)'</code> 패턴을 찾아<br />
                                        독서 기록(reading)으로 저장합니다.
                                    </p>
                                    <Button
                                        onClick={async () => {
                                            setExtractingBooks(true);
                                            setBookExtractionProgress(0);
                                            setBookExtractionMessage('');
                                            setBookExtractionResult(null);
                                            try {
                                                const result = await extractAndSaveBooks((progress, message) => {
                                                    setBookExtractionProgress(progress);
                                                    setBookExtractionMessage(message);
                                                });
                                                setBookExtractionResult(result);
                                                toast.success(`${result.totalBooks}권의 도서를 ${result.updatedStudents}명에게서 추출했습니다.`);
                                            } catch (error) {
                                                console.error(error);
                                                toast.error('독서 기록 추출 실패');
                                            } finally {
                                                setExtractingBooks(false);
                                            }
                                        }}
                                        disabled={extractingBooks}
                                        className="min-w-[200px]"
                                    >
                                        {extractingBooks ? (
                                            <>
                                                <Loader2 className="animate-spin mr-2 h-4 w-4" />
                                                추출 중 ({bookExtractionProgress}%)
                                            </>
                                        ) : '독서 기록 추출 시작'}
                                    </Button>
                                </div>

                                {/* Progress */}
                                {extractingBooks && bookExtractionMessage && (
                                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                                        <div className="flex items-center gap-3 mb-2">
                                            <Loader2 className="animate-spin h-4 w-4 text-blue-500" />
                                            <span className="text-sm font-medium text-blue-800">{bookExtractionMessage}</span>
                                        </div>
                                        <div className="w-full bg-blue-200 rounded-full h-2">
                                            <div
                                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                                style={{ width: `${bookExtractionProgress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Result */}
                                {bookExtractionResult && (
                                    <div className="bg-green-50 border border-green-100 rounded-lg p-6">
                                        <h4 className="font-semibold text-green-800 mb-3">추출 완료</h4>
                                        <div className="grid grid-cols-3 gap-4 text-center">
                                            <div className="bg-white rounded-lg p-4 border border-green-200">
                                                <p className="text-2xl font-bold text-green-700">{bookExtractionResult.totalStudents}</p>
                                                <p className="text-xs text-slate-500 mt-1">전체 학생</p>
                                            </div>
                                            <div className="bg-white rounded-lg p-4 border border-green-200">
                                                <p className="text-2xl font-bold text-green-700">{bookExtractionResult.updatedStudents}</p>
                                                <p className="text-xs text-slate-500 mt-1">도서 발견 학생</p>
                                            </div>
                                            <div className="bg-white rounded-lg p-4 border border-green-200">
                                                <p className="text-2xl font-bold text-green-700">{bookExtractionResult.totalBooks}</p>
                                                <p className="text-xs text-slate-500 mt-1">추출된 도서</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="bg-slate-50 p-4 rounded text-sm text-slate-600">
                                    <h4 className="font-bold mb-2">추출 가이드</h4>
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>세부능력및특기사항 데이터가 먼저 업로드되어 있어야 합니다.</li>
                                        <li>지원하는 패턴: <code>"제목(저자)"</code>, <code>'제목(저자)'</code>, <code>「제목」(저자)</code>, <code>『제목』(저자)</code></li>
                                        <li>추출된 도서는 <code>source: 'extracted'</code>로 표시되며, 재실행 시 기존 추출 데이터가 갱신됩니다.</li>
                                        <li>수동으로 업로드된 독서활동상황 데이터는 유지됩니다.</li>
                                    </ul>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="curriculum" className="flex-1 min-h-0 mt-2 border rounded-md p-4">
                            <CurriculumExtractionTab />
                        </TabsContent>

                        <TabsContent value="permissions" className="flex-1 min-h-0 mt-2 border rounded-md p-4 overflow-auto">
                            <PermissionSettingsTab />
                        </TabsContent>

                        <TabsContent value="ai-analysis" className="flex-1 min-h-0 mt-2 border rounded-md p-4 overflow-auto">
                            <AIAnalysisTab />
                        </TabsContent>

                    </Tabs>
                </DialogContent >
            </Dialog >

            <Dialog open={!!selectedContent} onOpenChange={(open) => !open && setSelectedContent(null)}>
                <DialogContent className="max-w-[70vw] max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>상세 내용</DialogTitle>
                    </DialogHeader>
                    <div className="bg-slate-50 p-4 rounded-md overflow-auto whitespace-pre-wrap font-mono text-sm max-h-[60vh]">
                        {selectedContent}
                    </div>
                    <DialogFooter className="flex justify-end">
                        <Button onClick={() => setSelectedContent(null)}>닫기</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
