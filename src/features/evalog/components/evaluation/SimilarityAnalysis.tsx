import React, { useMemo } from 'react';
import { Student } from '../../types';
import { findExactSentenceMatches } from '../../utils/similarity';
import { loadSimilarityCache } from '../../utils/similarityCache';
import SimilarityDetailDialog from './SimilarityDetailDialog';
import BlurredContent from '../ui/BlurredContent';
import { AlertTriangle, Users, BookOpen, Info, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { extractRealContent } from '../../utils/textUtils';
import {
    useSimilarityCandidates, REMARKS_CATEGORY,
    type ComparisonCandidate,
} from '../../hooks/useSimilarityCandidates';
import type { EvalogGranularPermissions } from '../../types/permissions';

interface SimilarityAnalysisProps {
    student: Student;
    permissions: EvalogGranularPermissions;
}

/**
 * 유사도 분석 — **같은 학년 학생의 기록만** 대조한다 (2026-09-12 사용자 결정).
 *
 * 후보 조회·학년 판정은 `hooks/useSimilarityCandidates` 와 `utils/similarityCohort` 가
 * 갖는다. 종전엔 이 파일 안에서 `student_no` 앞 4자리를 입학연도로 착각해 비교하고
 * 행 상한도 처리하지 않아, 실측으로 **후보 870명 중 6명**과만 대조하고 있었다
 * (게다가 받아 온 기록마저 83~87% 잘려 있었다). 자세한 근거는 그 두 파일의 머리글.
 */
const SimilarityAnalysis: React.FC<SimilarityAnalysisProps> = ({ student, permissions }) => {
    // 다이얼로그 상태
    const [dialogState, setDialogState] = React.useState<{
        isOpen: boolean;
        clickedText: string;
        similarStudents: Array<{
            student: Student;
            category: string;
            grade?: number;
            subject?: string;
            semester?: string;
            fullText: string;
            similarity: number;
            matchedText: string;
        }>;
    }>({
        isOpen: false,
        clickedText: '',
        similarStudents: []
    });

    const { data: pool, isLoading: loading, error: poolError } = useSimilarityCandidates(student);
    const dbCandidates: ComparisonCandidate[] = pool?.candidates ?? [];

    // 캐시 로드 (유지)
    const cachedData = useMemo(() => {
        return loadSimilarityCache(student.id, student, []);
    }, [student.id, student]);

    // --- 공통 분석 헬퍼 함수 ---
    const analyzeCategory = (content: string, category: string, grade?: number, subject?: string) => {
        if (!content) return null;

        // 후보군 필터링 (카테고리, 학년, 과목 일치)
        // NOTE: student_no 필터링은 fetch 단계에서 이미 수행됨
        const matches = dbCandidates.filter(c => {
            if (c.category !== category) return false;
            if (grade && c.grade !== grade) return false; // 학년 검사
            if (subject && c.subject !== subject) return false; // 과목 검사 (세특)
            return true;
        });

        const candidateTexts = matches.map(c => ({ id: c.id, text: c.text }));

        // 정확한 문장 일치 검사
        const { matches: exactMatches, score } = findExactSentenceMatches(content, candidateTexts);

        // 렌더링용 하이라이트 객체로 변환
        const highlights = exactMatches.map(m => {
            // 빈도에 따른 색상 결정 (짙게 표시)
            // 1명: 연한 노랑, 2~3명: 중간, 4명이상: 진한 빨강
            let color = '#fef3c7'; // default yellow-100
            if (m.frequency >= 4) color = '#fca5a5'; // red-300
            else if (m.frequency >= 2) color = '#fed7aa'; // orange-200

            // 매칭된 학생 이름 정보 구성 (툴팁용)
            const matchedStudents = m.matchedStudentIds.map(id => {
                const found = matches.find(c => c.id === id);
                return found?.name;
            }).filter(Boolean);

            const candidateName = matchedStudents.length > 0
                ? matchedStudents.length > 1
                    ? `${matchedStudents[0]} 외 ${matchedStudents.length - 1}명`
                    : matchedStudents[0]
                : '알 수 없음';

            return {
                startOffset: m.startOffset,
                endOffset: m.endOffset,
                color,
                studentName: candidateName, // 툴팁 표시 이름
                studentId: m.matchedStudentIds[0], // 대표 ID (다이얼로그 로직 호환용)
                matchedIds: m.matchedStudentIds, // 전체 매칭 ID
                similarity: 100, // Exact match implies 100% sentence similarity
                frequency: m.frequency
            };
        });

        return {
            grade,
            content,
            highlights,
            category,
            similarities: [], // Legacy field, empty for exact match mode or adapted if needed
            score // Overall similarity score (coverage %)
        };
    };

    // 자율활동 유사도 분석
    const autonomousAnalysis = useMemo(() => {
        if (loading) return [];
        return [1, 2, 3].map(grade => {
            const activity = student.section5_creative_activities?.find(
                (a: any) => a.type === '자율활동' && a.grade === grade
            );
            if (!activity) return null;

            const content = extractRealContent(activity.content);
            const result = analyzeCategory(content, '자율활동', grade);
            return result;
        }).filter(Boolean);
    }, [student, dbCandidates, loading]);

    // 동아리활동 유사도 분석
    const clubAnalysis = useMemo(() => {
        if (loading) return [];
        return [1, 2, 3].map(grade => {
            const activity = student.section5_creative_activities?.find(
                (a: any) => a.type === '동아리활동' && a.grade === grade
            );
            if (!activity) return null;

            const content = extractRealContent(activity.content);
            const result = analyzeCategory(content, '동아리활동', grade);
            return result;
        }).filter(Boolean);
    }, [student, dbCandidates, loading]);

    // 진로활동 유사도 분석
    const careerAnalysis = useMemo(() => {
        if (loading) return [];
        return [1, 2, 3].map(grade => {
            const activity = student.section5_creative_activities?.find(
                (a: any) => a.type === '진로활동' && a.grade === grade
            );
            if (!activity) return null;

            const content = extractRealContent(activity.content);
            const result = analyzeCategory(content, '진로활동', grade);
            return result;
        }).filter(Boolean);
    }, [student, dbCandidates, loading]);

    // 세부능력 및 특기사항 유사도 분석
    const remarksAnalysis = useMemo(() => {
        if (loading) return [];

        const subjects = student.section6_academic_development || [];
        const groupedByGrade: Record<string, any[]> = {};

        subjects.forEach((subject: any) => {
            const sem = subject.grade && subject.semester ? `${subject.grade}-${subject.semester}` : subject.semester;
            const [grade] = sem.split('-');
            if (!groupedByGrade[grade]) groupedByGrade[grade] = [];
            groupedByGrade[grade].push(subject);
        });

        return ['1', '2', '3'].map(grade => {
            const gradeSubjectsRaw = groupedByGrade[grade];
            if (!gradeSubjectsRaw || gradeSubjectsRaw.length === 0) return null;

            // 과목명 중복 제거 로직 (내용이 있는 것 우선)
            const groupedByName: Record<string, any[]> = {};
            gradeSubjectsRaw.forEach((s: any) => {
                if (!groupedByName[s.subject]) groupedByName[s.subject] = [];
                groupedByName[s.subject].push(s);
            });

            const gradeSubjects = Object.values(groupedByName).flatMap(group => {
                if (group.length === 1) return group;
                const withContent = group.filter((s: any) => (s.content || s.remarks || '').trim().length > 0);
                return withContent.length > 0 ? withContent : [group[0]];
            });

            const subjectsWithSimilarity = gradeSubjects.map((subject: any) => {
                const rawRemarks = subject.content || subject.remarks || '';
                const currentRemarks = extractRealContent(rawRemarks);
                const currentSem = subject.grade && subject.semester ? `${subject.grade}-${subject.semester}` : subject.semester;

                const analysis = analyzeCategory(currentRemarks, REMARKS_CATEGORY, undefined, subject.subject);
                if (!analysis) return { ...subject, remarks: currentRemarks, highlights: [], similarites: [] };

                return {
                    ...subject,
                    semester: currentSem,
                    remarks: currentRemarks,
                    highlights: analysis.highlights,
                    similarities: [], // Legacy
                    score: analysis.score
                };
            });

            return {
                grade,
                subjects: subjectsWithSimilarity
            };
        }).filter(Boolean);
    }, [student, dbCandidates, loading]);


    // 하이라이트 클릭 핸들러
    const handleHighlightClick = (
        clickedText: string,
        analysisData: any, // Contains highlights with matchedIds
        category: string,
        grade?: number,
        subject?: string
    ) => {
        // 클릭된 텍스트에 해당하는 매칭 정보 찾기
        // analysisData.highlights에서 clickedText를 포함하는 highlight를 찾아야 함
        // 또는 render function에서 넘겨준 highlight 객체를 바로 사용하면 좋음.
        // 여기서는 renderHighlightedText 내부 onClick에서 호출되므로, 
        // 로직을 간소화하기 위해 clickedText가 속한 highlight를 찾습니다.

        const targetHighlight = analysisData.highlights?.find((h: any) => {
            // 정확한 텍스트 매칭 (offset은 다를 수 있음, 텍스트가 중요)
            // 하지만 여기서는 exact text match이므로 clickedText와 동일할 것임 (부분 매칭 아님)
            // 다만 render 함수가 substring을 넘길 수 있으므로 주의.
            // renderHighlightedText는 full matched sentence를 넘기는게 아니라 highlight span의 텍스트를 넘김.
            // exact match logic에서는 문장 단위 하이라이트이므로 clickedText == matchedSentence
            return true; // Clicked span text is passed, need to find the match context
        });

        // 이 방식보다는, render 함수에서 highlight 객체 자체를 넘기는 게 낫지만
        // 일단 dbCandidates에서 검색하여 dialog state 구성

        // 1. 해당 텍스트(문장)를 포함하고 있는 모든 candidate 찾기 (이미 highlight.matchedIds에 있음)
        // 하지만 handler signature가 string만 받으므로...
        // 개선: renderHighlightedText에서 highlight 객체를 전달받도록 수정하거나
        // 여기서 다시 검색.
        // exact match이므로 다시 검색해도 됨.

        const similarStudents = dbCandidates.filter(c => {
            // 조건 일치 확인
            if (category !== c.category) return false;
            if (grade && c.grade !== grade) return false;
            if (subject && c.subject !== subject) return false;

            // 텍스트 포함 여부 (띄어쓰기 정규화 등 고려)
            const normalizedCand = c.text.replace(/\s+/g, ' ').trim();
            const normalizedClick = clickedText.replace(/\s+/g, ' ').trim();
            return normalizedCand.includes(normalizedClick);
        }).map(c => ({
            student: { id: c.id, name: c.name, studentId: c.id } as Student, // Mock
            category,
            grade: c.grade,
            subject: c.subject,
            fullText: c.text,
            similarity: 100,
            matchedText: clickedText
        }));

        setDialogState({
            isOpen: true,
            clickedText,
            similarStudents
        });
    };

    // 렌더링 함수
    const renderHighlightedText = (
        text: string,
        highlights: any[],
        analysisData?: any,
        category?: string,
        grade?: number,
        subject?: string,
    ) => {
        if (!text) return null;
        if (!highlights || highlights.length === 0) {
            return <span className="text-xs text-gray-800 leading-relaxed">{text}</span>;
        }

        const uniqueHighlights = [...highlights].sort((a, b) => a.startOffset - b.startOffset);
        const elements: React.ReactNode[] = [];
        let lastOffset = 0;

        uniqueHighlights.forEach((highlight, index) => {
            if (lastOffset < highlight.startOffset) {
                elements.push(
                    <span key={`text-${lastOffset}`}>
                        {text.substring(lastOffset, highlight.startOffset)}
                    </span>
                );
            }

            const highlightedText = text.substring(highlight.startOffset, highlight.endOffset);
            elements.push(
                <span
                    key={`highlight-${index}`}
                    className="relative inline-block px-1 rounded cursor-pointer hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: highlight.color }}
                    title={`${highlight.studentName} - 클릭하여 유사 학생 보기`}
                    onClick={() => {
                        handleHighlightClick(
                            highlightedText,
                            analysisData,
                            category!,
                            grade,
                            subject
                        );
                    }}
                >
                    {highlightedText}
                </span>
            );

            lastOffset = highlight.endOffset;
        });

        if (lastOffset < text.length) {
            elements.push(
                <span key={`text-${lastOffset}`}>
                    {text.substring(lastOffset)}
                </span>
            );
        }

        return <span className="text-xs text-gray-800 leading-relaxed">{elements}</span>;
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
                <Loader2 className="animate-spin" size={32} />
                <p className="text-sm">같은 학년 학생의 활동 기록을 불러오는 중...</p>
            </div>
        );
    }

    if (poolError) {
        return (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center">
                <AlertTriangle className="mx-auto mb-2 text-rose-500" size={24} />
                <p className="text-sm font-medium text-rose-800">대조 대상을 불러오지 못했습니다</p>
                <p className="mt-1 text-xs text-rose-700">
                    {poolError instanceof Error ? poolError.message : '알 수 없는 오류'}
                </p>
            </div>
        );
    }

    /*
     * 대조 범위를 **항상 눈에 보이게** 둔다.
     *
     * 종전 사고의 본질은 "대조 대상이 6명뿐"이라는 사실이 화면 어디에도 없었다는 것이다.
     * 유사도 0건은 "깨끗하다"로도 "아무것도 안 봤다"로도 읽히는데, 이 줄이 없으면 둘을
     * 구분할 수 없다. 그래서 학년·인원·기록 수를 머리글에 고정으로 적는다.
     */
    const scopeBanner = (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
            <Info size={14} className="flex-shrink-0 text-slate-400" />
            {pool?.grade == null ? (
                <span className="text-xs text-amber-700">
                    이 학생의 학년을 판정할 수 없어 대조를 수행하지 않았습니다
                    (학년 또는 학번이 비어 있습니다).
                </span>
            ) : (
                <>
                    <span className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">{pool.grade}학년</span> 재학생
                        <span className="font-semibold text-slate-800"> {pool.peerCount}명</span>의
                        기록 <span className="font-semibold text-slate-800">{pool.recordCount.toLocaleString()}건</span>과 대조했습니다
                    </span>
                    <span className="text-[11px] text-slate-400">
                        · 같은 학년만 대조합니다(다른 학년·졸업생 제외)
                    </span>
                </>
            )}
            {pool?.incomplete && (
                <span className="ml-auto flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">
                    <AlertTriangle size={12} /> 기록을 일부만 받았습니다 — 결과가 불완전합니다
                </span>
            )}
        </div>
    );

    return (
        <>
            <SimilarityDetailDialog
                isOpen={dialogState.isOpen}
                onClose={() => setDialogState({ ...dialogState, isOpen: false })}
                clickedText={dialogState.clickedText}
                currentStudent={student}
                similarStudents={dialogState.similarStudents}
            />

            <div className="space-y-6">
                {scopeBanner}

                <div className="space-y-6">

                    {/* 자율활동 */}
                    {autonomousAnalysis.length > 0 && (
                        <div className="glass-panel p-6">
                            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100/50">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
                                        <Users size={18} />
                                    </div>
                                    <h3 className="font-semibold text-slate-800">자율활동 유사도</h3>
                                </div>
                            </div>
                            {permissions.autonomy ? (
                            <div className="space-y-4">
                                {autonomousAnalysis.map((analysis, idx) => {
                                    if (!analysis) return null;
                                    return (
                                        <div key={idx} className="relative pl-4 border-l-2 border-slate-100">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{analysis.grade}학년</span>
                                                {analysis.score > 0 && (
                                                    <span className="text-xs font-bold text-red-500">{analysis.score}% 일치</span>
                                                )}
                                            </div>
                                            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100/50 text-sm leading-relaxed text-slate-700">
                                                {renderHighlightedText(analysis.content, analysis.highlights, analysis, '자율활동', analysis.grade)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            ) : (
                                <BlurredContent message="자율활동 유사도를 볼 수 있는 권한이 없습니다" />
                            )}
                        </div>
                    )}

                    {/* 동아리활동 */}
                    {clubAnalysis.length > 0 && (
                        <div className="glass-panel p-6">
                            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100/50">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
                                        <Users size={18} />
                                    </div>
                                    <h3 className="font-semibold text-slate-800">동아리활동 유사도</h3>
                                </div>
                            </div>
                            {permissions.club ? (
                            <div className="space-y-4">
                                {clubAnalysis.map((analysis, idx) => {
                                    if (!analysis) return null;
                                    return (
                                        <div key={idx} className="relative pl-4 border-l-2 border-slate-100">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{analysis.grade}학년</span>
                                                {analysis.score > 0 && (
                                                    <span className="text-xs font-bold text-red-500">{analysis.score}% 일치</span>
                                                )}
                                            </div>
                                            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100/50 text-sm leading-relaxed text-slate-700">
                                                {renderHighlightedText(analysis.content, analysis.highlights, analysis, '동아리활동', analysis.grade)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            ) : (
                                <BlurredContent message="동아리활동 유사도를 볼 수 있는 권한이 없습니다" />
                            )}
                        </div>
                    )}

                    {/* 진로활동 */}
                    {careerAnalysis.length > 0 && (
                        <div className="glass-panel p-6">
                            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100/50">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
                                        <Users size={18} />
                                    </div>
                                    <h3 className="font-semibold text-slate-800">진로활동 유사도</h3>
                                </div>
                            </div>
                            {permissions.career_activity ? (
                            <div className="space-y-4">
                                {careerAnalysis.map((analysis, idx) => {
                                    if (!analysis) return null;
                                    return (
                                        <div key={idx} className="relative pl-4 border-l-2 border-slate-100">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{analysis.grade}학년</span>
                                                {analysis.score > 0 && (
                                                    <span className="text-xs font-bold text-red-500">{analysis.score}% 일치</span>
                                                )}
                                            </div>
                                            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100/50 text-sm leading-relaxed text-slate-700">
                                                {renderHighlightedText(analysis.content, analysis.highlights, analysis, '진로활동', analysis.grade)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            ) : (
                                <BlurredContent message="진로활동 유사도를 볼 수 있는 권한이 없습니다" />
                            )}
                        </div>
                    )}

                    {/* 세부능력 및 특기사항 */}
                    {remarksAnalysis.length > 0 && (
                        <div className="glass-panel p-6">
                            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100/50">
                                <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
                                    <BookOpen size={18} />
                                </div>
                                <h3 className="font-semibold text-slate-800">세부능력 및 특기사항 유사도</h3>
                            </div>
                            <div className="overflow-hidden rounded-xl border border-gray-100/60 shadow-sm">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-slate-50/80 border-b border-gray-100 text-slate-500">
                                            <th className="py-3 px-2 text-center w-16 font-medium">학년</th>
                                            <th className="py-3 px-2 text-center w-24 font-medium">과목군</th>
                                            <th className="py-3 px-2 text-center w-32 font-medium">과목</th>
                                            <th className="py-3 px-4 text-left font-medium">내용</th>
                                            <th className="py-3 px-2 text-center w-16 font-medium">일치율</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {remarksAnalysis.map((gradeData, gradeIdx) => {
                                            if (!gradeData) return null;
                                            return (
                                                <React.Fragment key={gradeIdx}>
                                                    {gradeData.subjects.map((subject: any, subjectIdx: number) => {
                                                        return (
                                                            <tr
                                                                key={`${gradeIdx}-${subjectIdx}`}
                                                                className="bg-white hover:bg-slate-50/50 transition-colors"
                                                            >
                                                                {subjectIdx === 0 && (
                                                                    <td
                                                                        className="py-3 px-2 text-center font-bold text-slate-400 bg-slate-50/30 border-r border-gray-50"
                                                                        rowSpan={gradeData.subjects.length}
                                                                    >
                                                                        {gradeData.grade}학년
                                                                    </td>
                                                                )}
                                                                <td className="py-3 px-2 text-center text-slate-500 bg-slate-50/10">{subject.subject_group || subject.category}</td>
                                                                <td className="py-3 px-2 text-center font-medium text-slate-700 bg-slate-50/10">
                                                                    <div>{subject.subject}</div>
                                                                </td>
                                                                <td className="py-3 px-4">
                                                                    {permissions.canViewSeteuk(subject.subject_group || subject.category || '') ? (
                                                                    <div className="leading-relaxed whitespace-pre-wrap text-slate-600">
                                                                        {renderHighlightedText(
                                                                            subject.remarks,
                                                                            subject.highlights,
                                                                            subject,
                                                                            REMARKS_CATEGORY,
                                                                            undefined,
                                                                            subject.subject,
                                                                        )}
                                                                    </div>
                                                                    ) : (
                                                                    <BlurredContent message="열람 권한 없음" className="py-3" />
                                                                    )}
                                                                </td>
                                                                <td className="py-3 px-2 text-center text-red-500 font-bold">
                                                                    {permissions.canViewSeteuk(subject.subject_group || subject.category || '')
                                                                        ? (subject.score > 0 ? `${subject.score}%` : '-')
                                                                        : '-'}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default SimilarityAnalysis;
