import React, { useState } from 'react';
import { Student } from '../../types';
import { extractRealContent } from '../../utils/textUtils';
import { Search, Quote, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface TextSearchProps {
    student: Student;
}

interface SearchResult {
    section: string;
    grade?: number;
    semester?: string;
    context: string;
}

const TextSearch: React.FC<TextSearchProps> = ({ student }) => {
    const [searchText, setSearchText] = useState('');
    const [highlightText, setHighlightText] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearch = () => {
        if (!searchText.trim()) return;

        const query = searchText.trim();
        const newResults: SearchResult[] = [];
        const textsToAnalyze: { text: string, section: string, grade?: number, semester?: string }[] = [];

        // Extract from Creative Activities (Section 5)
        if (student.section5_creative_activities) {
            student.section5_creative_activities.forEach((activity: any) => {
                if (['자율활동', '동아리활동', '진로활동'].includes(activity.type)) {
                    const content = extractRealContent(activity.content);
                    if (content) {
                        textsToAnalyze.push({
                            text: content,
                            section: activity.type,
                            grade: typeof activity.grade === 'number' ? activity.grade : parseInt(activity.grade)
                        });
                    }
                }
            });
        }

        // Extract from SeTeuk (Section 6)
        if (student.section6_academic_development) {
            student.section6_academic_development.forEach((subject: any) => {
                const content = extractRealContent(subject.content || subject.remarks);
                if (content) {
                    textsToAnalyze.push({
                        text: content,
                        section: `세특(${subject.subject})`,
                        grade: subject.grade,
                        semester: typeof subject.semester === 'string' ? subject.semester : `${subject.grade}-${subject.semester}`
                    });
                }
            });
        }

        // Extract from Behavior Characteristics (Section 8)
        if (student.section8_behavior_characteristics) {
            student.section8_behavior_characteristics.forEach((record: any) => {
                const content = extractRealContent(record.content);
                if (content) {
                    textsToAnalyze.push({
                        text: content,
                        section: '행동특성',
                        grade: typeof record.grade === 'number' ? record.grade : parseInt(record.grade)
                    });
                }
            });
        }

        // Perform search
        textsToAnalyze.forEach(({ text, section, grade, semester }) => {
            if (text.includes(query)) {
                newResults.push({
                    section,
                    grade,
                    semester: semester ? String(semester) : undefined,
                    context: text
                });
            }
        });

        setResults(newResults);
        setHighlightText(query);
        setHasSearched(true);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50/50 rounded-xl space-y-4">
            {/* Search Bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <Input
                        className="pl-10 h-11 bg-slate-50 border-slate-200 focus:bg-white transition-colors text-base"
                        placeholder="학생부에서 검색할 단어나 문장을 입력하세요..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                </div>
                <Button
                    onClick={handleSearch}
                    className="h-11 px-6 bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-sm"
                >
                    검색
                </Button>
            </div>

            {/* Results Area */}
            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                {!hasSearched ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 space-y-4">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                            <Search size={32} className="opacity-50" />
                        </div>
                        <p className="text-center">상단 입력창에 검색어를 입력하여<br />학생부 전체 내용을 검색해보세요.</p>
                    </div>
                ) : results.length > 0 ? (
                    <>
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                검색 결과
                                <Badge variant="secondary" className="bg-brand-50 text-brand-600 border-brand-100">
                                    {results.length}건
                                </Badge>
                            </h3>
                        </div>
                        <ScrollArea className="flex-1 p-0">
                            <div className="divide-y divide-slate-100">
                                {results.map((result, idx) => (
                                    <div key={idx} className="p-5 hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Badge variant="outline" className="bg-white text-slate-600 border-slate-200 shadow-sm">
                                                {result.grade ? `${result.grade}학년` : '학년 없음'}
                                            </Badge>
                                            <Badge variant="outline" className="bg-white text-slate-600 border-slate-200 shadow-sm">
                                                {result.section}
                                            </Badge>
                                            {result.semester && (
                                                <span className="text-xs text-slate-500 font-medium">
                                                    {result.semester.includes('-') ? result.semester : `${result.semester}학기`}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex gap-4">
                                            <Quote size={20} className="text-slate-300 flex-shrink-0 mt-1" />
                                            <p className="text-base text-slate-700 leading-relaxed">
                                                {result.context.split(highlightText).map((part, i, arr) => (
                                                    <React.Fragment key={i}>
                                                        {part}
                                                        {i < arr.length - 1 && (
                                                            <span className="font-bold text-brand-700 bg-brand-100 px-1 rounded-sm mx-0.5 box-decoration-clone">
                                                                {highlightText}
                                                            </span>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 space-y-4">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                            <FileText size={32} className="opacity-50" />
                        </div>
                        <p>검색 결과가 없습니다.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TextSearch;
