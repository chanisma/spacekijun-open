import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3, Loader2, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { drawLineProps } from '@/lib/chartAnimation';
import { useStudentMockResults } from '../hooks/useStudentMockResults';
import {
    ALL_SUBJECTS_SERIES,
    SOURCE_KEY_PREFIX,
    buildMockTrendData,
    collectMockSeries,
    hasMetricData,
    sortMockExams,
    type MockTrendMetric,
} from '../utils/mockExamTrend';

interface MockExamTrendChartProps {
    studentCode: string;
}

const SERIES_COLORS: Record<string, string> = {
    '전과목': '#22c55e',
    '국어': '#3b82f6',
    '수학': '#ef4444',
    '영어': '#f59e0b',
    '한국사': '#8b5cf6',
    '통합사회': '#14b8a6',
    '통합과학': '#ec4899',
};

const FALLBACK_COLORS = [
    '#6366f1', '#a855f7', '#d946ef', '#f43f5e', '#0ea5e9',
    '#10b981', '#eab308', '#78716c', '#64748b', '#dc2626',
];

const seriesColor = (series: string, index: number): string =>
    SERIES_COLORS[series] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];

const METRICS: { key: MockTrendMetric; label: string }[] = [
    { key: 'grade', label: '등급' },
    { key: 'percentile', label: '백분위' },
    { key: 'standard_score', label: '표준점수' },
];

/** recharts가 content 요소에 주입하는 값들 — metric만 우리가 넘긴다 */
interface TrendTooltipProps {
    active?: boolean;
    label?: string | number;
    payload?: Array<{
        dataKey?: string | number;
        value?: number | null;
        color?: string;
        payload?: Record<string, string | number | null>;
    }>;
    metric: MockTrendMetric;
}

/** 계열 통합 라인은 원본 과목명(미적분 등)을 괄호로 함께 보여준다 */
const TrendTooltip: React.FC<TrendTooltipProps> = ({ active, payload, label, metric }) => {
    if (!active || !payload?.length) return null;
    const entries = payload.filter(p => !String(p.dataKey ?? '').startsWith(SOURCE_KEY_PREFIX));
    const suffix = metric === 'grade' ? '등급' : metric === 'percentile' ? '' : '점';

    return (
        <div className="rounded-xl border border-border bg-background/95 px-3 py-2 text-xs shadow-lg">
            <div className="mb-1 font-medium text-muted-foreground">{label}</div>
            {entries.map(entry => {
                const src = entry.payload?.[`${SOURCE_KEY_PREFIX}${entry.dataKey}`];
                const value = entry.value;
                return (
                    <div key={entry.dataKey} className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-foreground">
                            {entry.dataKey} {value === null || value === undefined
                                ? '-'
                                : `${typeof value === 'number' ? value.toFixed(metric === 'grade' ? 2 : 0) : value}${suffix}`}
                        </span>
                        {src && <span className="text-muted-foreground">({src})</span>}
                    </div>
                );
            })}
        </div>
    );
};

const ChartShell: React.FC<{ children: React.ReactNode; actions?: React.ReactNode }> = ({ children, actions }) => (
    <div className="bg-white/60 p-6 rounded-xl border border-border/50 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-6 pb-2 border-b border-border/50">
            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <TrendingUp size={18} />
                </div>
                <h3 className="font-semibold text-foreground">모의고사 추이도</h3>
            </div>
            {actions}
        </div>
        {children}
    </div>
);

export const MockExamTrendChart: React.FC<MockExamTrendChartProps> = ({ studentCode }) => {
    const { data: mockResults, isLoading } = useStudentMockResults(studentCode);
    const [metric, setMetric] = useState<MockTrendMetric>('grade');
    const [toggledSeries, setToggledSeries] = useState<Set<string>>(new Set());

    const exams = useMemo(() => sortMockExams(mockResults ?? []), [mockResults]);
    const subjectSeries = useMemo(() => collectMockSeries(exams), [exams]);

    // 값이 하나도 없는 지표는 토글에서 감춘다 (표준점수·백분위는 회차에 따라 비어 있는 경우가 많다)
    const availableMetrics = useMemo(
        () => METRICS.filter(m => hasMetricData(exams, m.key)),
        [exams],
    );
    const activeMetric = availableMetrics.some(m => m.key === metric)
        ? metric
        : availableMetrics[0]?.key ?? 'grade';

    // 등급 지표에서만 전과목 평균 라인을 그린다 (백분위·표준점수 평균은 척도가 섞여 오해를 부름)
    const chartSeries = useMemo(
        () => (activeMetric === 'grade' ? [ALL_SUBJECTS_SERIES, ...subjectSeries] : subjectSeries),
        [activeMetric, subjectSeries],
    );

    const trendData = useMemo(
        () => buildMockTrendData(exams, activeMetric, subjectSeries),
        [exams, activeMetric, subjectSeries],
    );

    // 기본 표시: 국·수·영·한국사(없으면 앞 4개) + 전과목. 사용자가 끈 라인만 toggledSeries에 쌓인다.
    const defaultVisible = useMemo(() => {
        const core = subjectSeries.filter(s => ['국어', '수학', '영어', '한국사'].includes(s));
        return new Set([ALL_SUBJECTS_SERIES, ...(core.length > 0 ? core : subjectSeries.slice(0, 4))]);
    }, [subjectSeries]);

    const isVisible = (series: string) => defaultVisible.has(series) !== toggledSeries.has(series);

    const toggleSeries = (series: string) => {
        setToggledSeries(prev => {
            const next = new Set(prev);
            if (next.has(series)) next.delete(series);
            else next.add(series);
            return next;
        });
    };

    if (isLoading) {
        return (
            <ChartShell>
                <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                </div>
            </ChartShell>
        );
    }

    if (exams.length === 0 || subjectSeries.length === 0) {
        return (
            <ChartShell>
                <div className="p-6 text-center text-muted-foreground">
                    <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">모의고사 성적 데이터가 없습니다.</p>
                </div>
            </ChartShell>
        );
    }

    return (
        <ChartShell
            actions={
                availableMetrics.length > 1 ? (
                    <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5">
                        {availableMetrics.map(m => (
                            <button
                                key={m.key}
                                onClick={() => setMetric(m.key)}
                                className={cn(
                                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                    activeMetric === m.key
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                ) : undefined
            }
        >
            <div className="mb-6 flex flex-wrap gap-2 justify-start">
                {chartSeries.map((series, idx) => (
                    <button
                        key={series}
                        onClick={() => toggleSeries(series)}
                        className={cn(
                            'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                            isVisible(series)
                                ? 'bg-white border-border shadow-sm text-foreground'
                                : 'bg-transparent border-transparent text-muted-foreground opacity-60 hover:opacity-100 hover:bg-muted',
                        )}
                    >
                        <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: seriesColor(series, idx) }}
                        />
                        <span>{series}</span>
                    </button>
                ))}
            </div>

            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                            dataKey="label"
                            tick={{ fontSize: 12, fill: '#64748b' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        {/* 모의고사는 학년과 무관하게 항상 9등급제 (내신 5등급제와 다름) */}
                        <YAxis
                            domain={activeMetric === 'grade' ? [1, 9] : activeMetric === 'percentile' ? [0, 100] : ['auto', 'auto']}
                            reversed={activeMetric === 'grade'}
                            ticks={
                                activeMetric === 'grade'
                                    ? [1, 2, 3, 4, 5, 6, 7, 8, 9]
                                    : activeMetric === 'percentile'
                                        ? [0, 20, 40, 60, 80, 100]
                                        : undefined
                            }
                            tick={{ fontSize: 12, fill: '#64748b' }}
                            axisLine={false}
                            tickLine={false}
                            width={activeMetric === 'grade' ? 30 : 40}
                        />
                        <Tooltip content={<TrendTooltip metric={activeMetric} />} />
                        {chartSeries.map((series, idx) => (
                            isVisible(series) && (
                                <Line
                                    key={series}
                                    {...drawLineProps}
                                    type="monotone"
                                    dataKey={series}
                                    stroke={seriesColor(series, idx)}
                                    strokeWidth={series === ALL_SUBJECTS_SERIES ? 3 : 2}
                                    dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                                    activeDot={{ r: 6, strokeWidth: 0 }}
                                    connectNulls
                                />
                            )
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <p className="mt-3 text-[10px] text-muted-foreground">
                * 모의고사는 학년과 무관하게 9등급제입니다. 3학년 선택과목(미적분·언어와매체 등)은 국어·수학 라인으로 통합해 표시합니다.
            </p>
        </ChartShell>
    );
};
