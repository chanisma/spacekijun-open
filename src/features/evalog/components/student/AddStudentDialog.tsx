
import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Student } from '../../types';
import { Search, Loader2, User, Users, FileDown, Upload, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
    fetchStudents,
    fetchSubjectsByGrade,
    fetchStudentsBySubject,
    convertBasicInfoToStudent,
    type SubjectOption,
} from '../../services/adminService';
import * as XLSX from 'xlsx';

interface AddStudentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAddStudent: (student: Student) => void;
    onBatchAddStudents: (students: Student[]) => void;
    onExcelImport: (file: File) => void;
}

/** 분반 선택 Select의 "전체 분반" 옵션 값 (Radix Select.Item은 빈 문자열 value를 허용하지 않음) */
const ALL_CLASSROOMS = '__ALL__';

export const AddStudentDialog: React.FC<AddStudentDialogProps> = ({
    open,
    onOpenChange,
    onAddStudent,
    onBatchAddStudents,
    onExcelImport
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<Student[]>([]);
    const [loading, setLoading] = useState(false);

    // Classroom state
    const [selectedGrade, setSelectedGrade] = useState<string>('3');
    const [selectedClass, setSelectedClass] = useState<string>('1');
    const [isClassLoading, setIsClassLoading] = useState(false);

    // Subject (선택과목별 추가) state
    const [subjectGrade, setSubjectGrade] = useState<string>('3');
    const [subjectOptions, setSubjectOptions] = useState<SubjectOption[]>([]);
    const [selectedSubject, setSelectedSubject] = useState<string>('');
    const [selectedClassroom, setSelectedClassroom] = useState<string>(ALL_CLASSROOMS);
    const [isSubjectListLoading, setIsSubjectListLoading] = useState(false);
    const [isSubjectLoading, setIsSubjectLoading] = useState(false);

    // 현재 선택된 과목의 분반 목록. 2개 이상이면 분반 선택 UI를 노출한다.
    const selectedSubjectOption = subjectOptions.find((s) => s.subjectName === selectedSubject) ?? null;
    const hasMultipleClassrooms = (selectedSubjectOption?.classrooms.length ?? 0) > 1;

    const subjectItems = subjectOptions.map((s) => ({ value: s.subjectName, label: s.subjectName }));

    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 과목이 바뀌면 이전 분반 선택은 더 이상 유효하지 않으므로 "전체 분반"으로 초기화
    useEffect(() => {
        setSelectedClassroom(ALL_CLASSROOMS);
    }, [selectedSubject]);

    // 학년이 바뀌면 해당 학년의 최신 학기 수강 과목 목록을 다시 불러온다.
    useEffect(() => {
        let cancelled = false;
        setSelectedSubject('');
        setSubjectOptions([]);
        setIsSubjectListLoading(true);

        fetchSubjectsByGrade(parseInt(subjectGrade))
            .then((subjects) => {
                if (!cancelled) setSubjectOptions(subjects);
            })
            .catch((error) => {
                console.error('Error loading subjects:', error);
                if (!cancelled) {
                    toast({
                        title: '과목 목록 로드 실패',
                        description: '수강 과목 목록을 불러오는데 실패했습니다.',
                        variant: 'destructive',
                    });
                }
            })
            .finally(() => {
                if (!cancelled) setIsSubjectListLoading(false);
            });

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subjectGrade]);

    const handleDownloadSample = (type: 'basic' | 'subject' | 'homeroom') => {
        let data: any[] = [];
        let fileName = '';

        if (type === 'basic') {
            fileName = '기초명렬표_예시.xlsx';
            data = [
                { '학번': '30101', '이름': '홍길동', '평가상태': '미평가' },
                { '학번': '30102', '이름': '김철수', '평가상태': '평가중' }
            ];
        } else if (type === 'subject') {
            fileName = '교과기초자료_예시.xlsx';
            data = [
                { '학번': '30101', '이름': '홍길동', '교과세특': '수업 태도가 바르며...', '성적': 'A' }
            ];
        } else if (type === 'homeroom') {
            fileName = '담임기초자료_예시.xlsx';
            data = [
                {
                    '학번': '30101',
                    '이름': '홍길동',
                    '자율활동': '학급 회장으로서...',
                    '동아리활동': '과학 탐구 동아리...',
                    '진로활동': 'SW 개발자 특강...',
                    '행동특성': '책임감이 강하고...'
                }
            ];
        }

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        XLSX.writeFile(wb, fileName);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processFile(file);
        }
        e.target.value = '';
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    const processFile = (file: File) => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'xlsx' || ext === 'xls') {
            onExcelImport(file);
            onOpenChange(false);
        } else {
            toast({
                title: '지원하지 않는 파일 형식',
                description: 'Excel(.xlsx, .xls) 파일만 업로드 가능합니다.',
                variant: 'destructive',
            });
        }
    };

    // Debounced search effect
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!searchTerm.trim()) {
                setSearchResults([]);
                return;
            }

            setLoading(true);
            try {
                // Split by comma and filter empty strings
                const terms = searchTerm.split(',').map(s => s.trim()).filter(s => s.length > 0);

                if (terms.length === 0) {
                    setSearchResults([]);
                    setLoading(false);
                    return;
                }

                // Construct OR query for multiple terms
                // Format: name.ilike.%term1%,student_no.ilike.%term1%,name.ilike.%term2%...
                const conditions = terms.map(term => `name.ilike.%${term}%,student_no.ilike.%${term}%`).join(',');

                const { data, error } = await supabase
                    .from('student_basic_info' as any)
                    .select('*, student_detailed_activities(*)')
                    .or(conditions)
                    .limit(100);

                if (error) throw error;

                const mapped = (data || []).map(convertBasicInfoToStudent);
                setSearchResults(mapped);
            } catch (error) {
                console.error('Error searching students:', error);
            } finally {
                setLoading(false);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [searchTerm]);

    const handleSelectStudent = (student: Student) => {
        onAddStudent(student);
        onOpenChange(false);
        setSearchTerm('');
    };

    const handleBatchAddSearchResults = () => {
        if (searchResults.length === 0) return;
        if (onBatchAddStudents) {
            onBatchAddStudents(searchResults);
            toast({
                title: '학생 추가 완료',
                description: `${searchResults.length}명의 학생을 추가했습니다.`,
            });
            onOpenChange(false);
            setSearchTerm('');
        }
    };

    const handleClassroomLoad = async () => {
        setIsClassLoading(true);
        try {
            const grade = parseInt(selectedGrade);
            const classNum = parseInt(selectedClass);

            const data = await fetchStudents(grade, classNum); // Now includes detailed_activities

            if (!data || data.length === 0) {
                toast({
                    title: '검색 결과 없음',
                    description: '해당 학급의 학생을 찾을 수 없습니다.',
                    variant: 'destructive',
                });
                return;
            }

            const matchedStudents = data.map(convertBasicInfoToStudent);

            if (onBatchAddStudents) {
                onBatchAddStudents(matchedStudents);
                toast({
                    title: '학생 로드 완료',
                    description: `${matchedStudents.length}명의 학생을 추가했습니다.`,
                });
                onOpenChange(false);
            }

        } catch (error) {
            console.error('Error loading classroom students:', error);
            toast({
                title: '로드 실패',
                description: '학생 데이터를 불러오는데 실패했습니다.',
                variant: 'destructive',
            });
        } finally {
            setIsClassLoading(false);
        }
    };

    const handleSubjectLoad = async () => {
        if (!selectedSubject) return;
        setIsSubjectLoading(true);
        try {
            const grade = parseInt(subjectGrade);
            const classroomFilter = selectedClassroom === ALL_CLASSROOMS ? undefined : selectedClassroom;
            const data = await fetchStudentsBySubject(grade, selectedSubject, classroomFilter);

            if (!data || data.length === 0) {
                toast({
                    title: '검색 결과 없음',
                    description: '해당 과목을 수강하는 학생을 찾을 수 없습니다.',
                    variant: 'destructive',
                });
                return;
            }

            const matchedStudents = data.map(convertBasicInfoToStudent);

            if (onBatchAddStudents) {
                onBatchAddStudents(matchedStudents);
                toast({
                    title: '학생 로드 완료',
                    description: `${matchedStudents.length}명의 학생을 추가했습니다.`,
                });
                onOpenChange(false);
            }
        } catch (error) {
            console.error('Error loading subject students:', error);
            toast({
                title: '로드 실패',
                description: '학생 데이터를 불러오는데 실패했습니다.',
                variant: 'destructive',
            });
        } finally {
            setIsSubjectLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* overflow-hidden 제거: 드롭다운(학년/반/과목/분반 Select)이 dialog-scoped portal로
                DialogContent의 직계 자식에 렌더되므로, 이 div에 overflow-hidden이 있으면
                드롭다운 목록이 다이얼로그 경계에서 잘려 보인다 (Select가 body로 포탈되면
                Radix Select/Dialog가 각자 aria-hidden hideOthers()를 걸어 서로 충돌해
                클릭이 씹히므로 body 포탈은 쓸 수 없음 — dialog-scoped portal 유지가 정답). */}
            <DialogContent className="sm:max-w-[550px] p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b bg-muted/20">
                    <DialogTitle>학생 추가</DialogTitle>
                </DialogHeader>

                <Tabs defaultValue="search" className="w-full">
                    <div className="px-6 pt-4">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="search">학생 검색</TabsTrigger>
                            <TabsTrigger value="classroom">학급별 추가</TabsTrigger>
                            <TabsTrigger value="subject">선택과목별 추가</TabsTrigger>
                            <TabsTrigger value="file_guide">파일로 추가</TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-[400px]">
                        <TabsContent value="search" className="mt-0 h-full border-t data-[state=inactive]:hidden">
                            <div className="p-4 space-y-4">
                                <div className="space-y-2">
                                    <div className="relative">
                                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <input
                                            placeholder="이름 또는 학번 (쉼표로 구분하여 여러 명 검색 가능)"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring pl-8"
                                        />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground pl-1">
                                        예시: 홍길동, 김철수, 30105
                                    </p>
                                </div>

                                <div className="space-y-1">
                                    {loading ? (
                                        <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            검색중...
                                        </div>
                                    ) : searchResults.length > 0 ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between pb-2 border-b">
                                                <span className="text-xs font-medium text-muted-foreground">
                                                    검색 결과 {searchResults.length}명
                                                </span>
                                                {searchResults.length > 0 && (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        className="h-7 text-xs"
                                                        onClick={handleBatchAddSearchResults}
                                                    >
                                                        <Users className="mr-1.5 h-3 w-3" />
                                                        모두 추가하기
                                                    </Button>
                                                )}
                                            </div>
                                            <div className="grid gap-2">
                                                {searchResults.map((student) => (
                                                    <div
                                                        key={student.id}
                                                        className="flex items-center justify-between p-3 rounded-lg border bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                                                        onClick={() => handleSelectStudent(student)}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                                <User className="h-4 w-4 text-primary" />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-medium leading-none">{student.name}</p>
                                                                <p className="text-xs text-muted-foreground mt-1">{student.studentNo}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : searchTerm ? (
                                        <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                                            <p className="text-sm">검색 결과가 없습니다</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center p-8 text-muted-foreground opacity-50">
                                            <User className="h-8 w-8 mb-2" />
                                            <p className="text-sm">학생 이름 또는 학번을 입력하세요</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="classroom" className="mt-0 h-full border-t data-[state=inactive]:hidden">
                            <div className="p-6 h-full flex flex-col items-center justify-center space-y-6">
                                <div className="space-y-2 text-center">
                                    <div className="flex justify-center mb-2">
                                        <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
                                            <Users className="h-6 w-6 text-blue-500" />
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-semibold text-slate-900">학급 전체 불러오기</h3>
                                    <p className="text-sm text-slate-500 max-w-[280px] mx-auto">
                                        선택한 학급의 모든 학생 정보를 한 번에 불러옵니다.
                                        <br />
                                        <span className="text-xs text-slate-400">
                                            (기존 학생 목록에 없는 학생만 추가됩니다)
                                        </span>
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3 w-full max-w-[280px]">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-slate-500">학년</Label>
                                        <Select value={selectedGrade} onValueChange={setSelectedGrade}>
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
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-slate-500">반</Label>
                                        <Select value={selectedClass} onValueChange={setSelectedClass}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="반" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {[...Array(9)].map((_, i) => (
                                                    <SelectItem key={i + 1} value={String(i + 1)}>
                                                        {i + 1}반
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <Button
                                    className="w-full max-w-[280px]"
                                    onClick={handleClassroomLoad}
                                    disabled={isClassLoading}
                                >
                                    {isClassLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            불러오는 중...
                                        </>
                                    ) : (
                                        '전체 불러오기'
                                    )}
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="subject" className="mt-0 h-full border-t data-[state=inactive]:hidden">
                            <div className="p-6 h-full flex flex-col items-center justify-center space-y-6">
                                <div className="space-y-2 text-center">
                                    <div className="flex justify-center mb-2">
                                        <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center">
                                            <Users className="h-6 w-6 text-emerald-500" />
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-semibold text-slate-900">선택과목 수강생 불러오기</h3>
                                    <p className="text-sm text-slate-500 max-w-[280px] mx-auto">
                                        해당 학년이 수강 중인 과목을 선택하면 수강생 전체를 불러옵니다.
                                        <br />
                                        <span className="text-xs text-slate-400">
                                            (기존 학생 목록에 없는 학생만 추가됩니다)
                                        </span>
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3 w-full max-w-[280px]">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-slate-500">학년</Label>
                                        <Select value={subjectGrade} onValueChange={setSubjectGrade}>
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
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-slate-500">과목</Label>
                                        <SearchableSelect
                                            items={subjectItems}
                                            selectedValue={selectedSubject || undefined}
                                            onValueChange={(value) => setSelectedSubject(value ?? '')}
                                            placeholder={isSubjectListLoading ? '불러오는 중...' : '과목 검색...'}
                                            searchPlaceholder="과목명 검색..."
                                            emptyText="일치하는 과목이 없습니다."
                                            disabled={isSubjectListLoading || subjectOptions.length === 0}
                                           
                                        />
                                    </div>
                                </div>

                                {hasMultipleClassrooms && (
                                    <div className="space-y-1.5 w-full max-w-[280px]">
                                        <Label className="text-xs text-slate-500">분반</Label>
                                        <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="분반 선택" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={ALL_CLASSROOMS}>전체 분반</SelectItem>
                                                {selectedSubjectOption?.classrooms.map((c) => (
                                                    <SelectItem key={c.classroom} value={c.classroom}>
                                                        {c.classroom}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                {!isSubjectListLoading && subjectOptions.length === 0 && (
                                    <p className="text-xs text-slate-400">
                                        해당 학년의 수강 명단(student_enrollment) 데이터가 없습니다.
                                    </p>
                                )}

                                <Button
                                    className="w-full max-w-[280px]"
                                    onClick={handleSubjectLoad}
                                    disabled={isSubjectLoading || !selectedSubject}
                                >
                                    {isSubjectLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            불러오는 중...
                                        </>
                                    ) : (
                                        '전체 불러오기'
                                    )}
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="file_guide" className="mt-0 h-full border-t data-[state=inactive]:hidden overflow-y-auto">
                            <div className="p-6 space-y-8">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="p-4 rounded-lg border bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition-all group">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="p-2 bg-white rounded-md border shadow-sm">
                                                <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 group-hover:text-blue-600" onClick={() => handleDownloadSample('basic')}>
                                                <FileDown className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <h4 className="font-semibold text-sm text-slate-800 mb-1">기초 명렬표</h4>
                                        <p className="text-xs text-slate-500 leading-snug">
                                            학번, 이름, 평가상태만 포함된 기본 양식입니다.
                                        </p>
                                    </div>

                                    <div className="p-4 rounded-lg border bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition-all group">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="p-2 bg-white rounded-md border shadow-sm">
                                                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 group-hover:text-emerald-600" onClick={() => handleDownloadSample('subject')}>
                                                <FileDown className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <h4 className="font-semibold text-sm text-slate-800 mb-1">교과 기초 자료</h4>
                                        <p className="text-xs text-slate-500 leading-snug">
                                            교과세특 및 성적 데이터가 포함된 양식입니다.
                                        </p>
                                    </div>

                                    <div className="p-4 rounded-lg border bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition-all group">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="p-2 bg-white rounded-md border shadow-sm">
                                                <FileSpreadsheet className="h-5 w-5 text-amber-600" />
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 group-hover:text-amber-600" onClick={() => handleDownloadSample('homeroom')}>
                                                <FileDown className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <h4 className="font-semibold text-sm text-slate-800 mb-1">담임 기초 자료</h4>
                                        <p className="text-xs text-slate-500 leading-snug">
                                            자율, 동아리, 진로, 행동특성 데이터 포함.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-slate-50 text-[10px] font-bold">1</span>
                                        <h4 className="text-sm font-semibold text-slate-800">사용 방법</h4>
                                    </div>
                                    <ul className="space-y-2">
                                        <li className="flex items-start gap-2.5 text-sm text-slate-600">
                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 flex-shrink-0" />
                                            <span>위의 샘플 파일 중 필요한 양식을 다운로드합니다.</span>
                                        </li>
                                        <li className="flex items-start gap-2.5 text-sm text-slate-600">
                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 flex-shrink-0" />
                                            <span>다운로드 받은 파일에 학생 데이터를 입력하고 저장합니다.</span>
                                        </li>
                                        <li className="flex items-start gap-2.5 text-sm text-slate-600">
                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 flex-shrink-0" />
                                            <span>아래 업로드 영역을 클릭하거나 파일을 드래그하여 업로드합니다.</span>
                                        </li>
                                    </ul>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-slate-50 text-[10px] font-bold">2</span>
                                        <h4 className="text-sm font-semibold text-slate-800">파일 업로드</h4>
                                    </div>

                                    <div
                                        className="border-2 border-dashed border-slate-200 rounded-lg h-32 flex flex-col items-center justify-center bg-slate-50/50 transition-colors hover:bg-slate-50 cursor-pointer group"
                                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                        onDrop={handleDrop}
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept=".xlsx, .xls"
                                            onChange={handleFileChange}
                                        />
                                        <div className="flex items-center gap-2 text-slate-500 mb-2 group-hover:text-slate-700 transition-colors">
                                            <Upload className="h-5 w-5" />
                                            <span className="font-medium text-sm">파일 선택 또는 드래그</span>
                                        </div>
                                        <p className="text-xs text-slate-400">.xlsx, .xls 파일 허용</p>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};
