import React, { useState, useMemo } from 'react';
import { Student } from '../../types';
import { KEYWORDS } from '../../data/keywords';
import { extractRealContent } from '../../utils/textUtils';
import { cn } from '@/lib/utils';
import {
    BookOpen,
    Brain,
    Lightbulb,
    Heart,
    Users,
    Globe,
    ChevronDown,
    ChevronUp,
    Search,
    Quote
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface KeywordAnalysisProps {
    student: Student;
}

interface KeywordMatch {
    keyword: string;
    category: string;
    count: number;
    sources: {
        section: string;
        grade?: number;
        semester?: string;
        context: string;
    }[];
}

const CATEGORY_CONFIG: Record<string, { icon: any, color: string }> = {
    "자기관리": {
        icon: Brain,
        color: "text-rose-600",
    },
    "지식정보처리": {
        icon: BookOpen,
        color: "text-blue-600",
    },
    "창의적사고": {
        icon: Lightbulb,
        color: "text-amber-600",
    },
    "심미적감성": {
        icon: Heart,
        color: "text-pink-600",
    },
    "협력적소통": {
        icon: Users,
        color: "text-emerald-600",
    },
    "공동체": {
        icon: Globe,
        color: "text-indigo-600",
    }
};

const KeywordAnalysis: React.FC<KeywordAnalysisProps> = ({ student }) => {
    const [selectedKeyword, setSelectedKeyword] = useState<KeywordMatch | null>(null);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

    // 1. Data Extraction & Analysis
    const analysisResult = useMemo(() => {
        const matches: Record<string, KeywordMatch> = {};
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

        // Analyze texts against keywords
        // 같은 과목(section) 내에서 같은 키워드가 여러 번 나와도 한 번만 카운트
        Object.entries(KEYWORDS).forEach(([category, keywords]) => {
            keywords.forEach(keyword => {
                // 키워드별로 이미 카운트한 과목(section)을 추적
                const countedSections = new Set<string>();

                textsToAnalyze.forEach(({ text, section, grade, semester }) => {
                    if (text.includes(keyword)) {
                        // 고유 식별자: section + grade + semester 조합
                        const uniqueKey = `${section}-${grade}-${semester}`;

                        if (!matches[keyword]) {
                            matches[keyword] = {
                                keyword,
                                category,
                                count: 0,
                                sources: []
                            };
                        }

                        // 해당 과목에서 이미 카운트했으면 count는 증가시키지 않음
                        if (!countedSections.has(uniqueKey)) {
                            matches[keyword].count++;
                            countedSections.add(uniqueKey);
                        }

                        // Find context (surrounding text)
                        const index = text.indexOf(keyword);
                        const start = Math.max(0, index - 300); // 300 char context window
                        const end = Math.min(text.length, index + keyword.length + 300); // 300 char context window
                        const contextPrefix = start > 0 ? '...' : '';
                        const contextSuffix = end < text.length ? '...' : '';
                        const context = contextPrefix + text.substring(start, end) + contextSuffix;

                        matches[keyword].sources.push({
                            section,
                            grade,
                            semester: semester ? String(semester) : undefined,
                            context
                        });
                    }
                });
            });
        });

        return matches;
    }, [student]);

    // Group matches by category
    const matchesByCategory = useMemo(() => {
        const grouped: Record<string, KeywordMatch[]> = {};
        Object.keys(KEYWORDS).forEach(cat => grouped[cat] = []);

        Object.values(analysisResult).forEach(match => {
            if (grouped[match.category]) {
                grouped[match.category].push(match);
            }
        });

        // Sort by count desc
        Object.keys(grouped).forEach(cat => {
            grouped[cat].sort((a, b) => b.count - a.count);
        });

        return grouped;
    }, [analysisResult]);

    const toggleCategoryExpand = (category: string) => {
        const newSet = new Set(expandedCategories);
        if (newSet.has(category)) {
            newSet.delete(category);
        } else {
            newSet.add(category);
        }
        setExpandedCategories(newSet);
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Object.entries(KEYWORDS).map(([category, allKeywords]) => {
                    const matchedKeywords = matchesByCategory[category] || [];
                    const matchedSet = new Set(matchedKeywords.map(m => m.keyword));
                    const config = CATEGORY_CONFIG[category] || { icon: Brain, color: 'text-slate-600' };
                    const Icon = config.icon;
                    const isExpanded = expandedCategories.has(category);

                    return (
                        <Card key={category} className={cn("bg-white border border-slate-200 shadow-sm transition-all duration-200 hover:shadow-md", selectedKeyword?.category === category ? "ring-2 ring-slate-400 ring-offset-2" : "")}>
                            <CardHeader className="pb-3 pt-4 px-4 border-b border-slate-50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("p-1.5 rounded-lg bg-slate-50", config.color)}>
                                            <Icon size={18} />
                                        </div>
                                        <CardTitle className="text-base text-slate-800">{category}</CardTitle>
                                        <Badge variant="secondary" className="bg-slate-100 text-slate-500 font-normal ml-1">
                                            {matchedKeywords.length}
                                        </Badge>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                                        onClick={() => toggleCategoryExpand(category)}
                                    >
                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-4 px-4">
                                <div className="flex flex-wrap gap-2">
                                    {matchedKeywords.length > 0 ? (
                                        matchedKeywords.map(match => (
                                            <Badge
                                                key={match.keyword}
                                                variant={selectedKeyword?.keyword === match.keyword ? "default" : "outline"}
                                                className={cn(
                                                    "cursor-pointer transition-all px-2.5 py-1 text-sm font-medium border",
                                                    selectedKeyword?.keyword === match.keyword
                                                        ? "bg-slate-800 hover:bg-slate-700 text-white shadow-md transform scale-105 border-transparent"
                                                        : "bg-white text-slate-600 hover:bg-slate-50 border-slate-200 hover:border-slate-300"
                                                )}
                                                onClick={() => setSelectedKeyword(match)}
                                            >
                                                {match.keyword}
                                                <span className={cn("ml-1.5 text-[10px]", selectedKeyword?.keyword === match.keyword ? "text-slate-300" : "text-slate-400")}>
                                                    {match.count}
                                                </span>
                                            </Badge>
                                        ))
                                    ) : (
                                        <div className="w-full py-4 text-center">
                                            <p className="text-sm text-slate-400">발견된 키워드가 없습니다.</p>
                                        </div>
                                    )}
                                </div>

                                {isExpanded && (
                                    <div className="mt-4 pt-4 border-t border-slate-100">
                                        <p className="text-xs text-slate-400 mb-2 font-medium">사용 가능한 다른 키워드:</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {allKeywords.filter(k => !matchedSet.has(k)).map(keyword => (
                                                <span
                                                    key={keyword}
                                                    className="px-2 py-1 rounded-md bg-slate-50 text-slate-400 text-xs border border-transparent hover:border-slate-200 transition-colors cursor-help"
                                                    title="미발견 키워드"
                                                >
                                                    {keyword}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Context View */}
            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[300px]">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                    <Search className="text-slate-400" size={20} />
                    {selectedKeyword ? (
                        <div>
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                '{selectedKeyword.keyword}'
                                <span className="text-sm font-normal text-slate-500">검색 결과</span>
                            </h3>
                        </div>
                    ) : (
                        <h3 className="text-slate-500 font-medium">키워드를 선택하여 문맥을 확인하세요</h3>
                    )}
                </div>

                <ScrollArea className="flex-1 p-0">
                    {selectedKeyword ? (
                        <div className="divide-y divide-slate-100">
                            {selectedKeyword.sources.map((source, idx) => (
                                <div key={idx} className="p-4 hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Badge variant="outline" className="bg-white text-slate-600 border-slate-200">
                                            {source.grade ? `${source.grade}학년` : '학년 없음'}
                                        </Badge>
                                        <Badge variant="outline" className="bg-white text-slate-600 border-slate-200">
                                            {source.section}
                                        </Badge>
                                        {source.semester && (
                                            <span className="text-xs text-slate-400">({source.semester.includes('-') ? source.semester : `${source.semester}학기`})</span>
                                        )}
                                    </div>
                                    <div className="flex gap-3">
                                        <Quote size={16} className="text-slate-300 flex-shrink-0 mt-0.5" />
                                        <p className="text-sm text-slate-600 leading-relaxed">
                                            {source.context.split(selectedKeyword.keyword).map((part, i, arr) => (
                                                <React.Fragment key={i}>
                                                    {part}
                                                    {i < arr.length - 1 && (
                                                        <span className="font-bold text-slate-900 bg-slate-100 px-1 rounded-sm mx-0.5">
                                                            {selectedKeyword.keyword}
                                                        </span>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                <Search size={32} className="opacity-50" />
                            </div>
                            <p>위의 카드에서 키워드를 클릭하면</p>
                            <p>해당 표현이 사용된 구체적인 내용을 이곳에서 확인할 수 있습니다.</p>
                        </div>
                    )}
                </ScrollArea>
            </div>
        </div>
    );
};

export default KeywordAnalysis;
