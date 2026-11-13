// ========================================
// Task Analytics Component
// Analytics dashboard for task management
// ========================================

import { useKeywordAnalyticsJsonb, useDuplicateAnalysisJsonb, useTaskStatsJsonb } from '@/hooks/useTasksJsonb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskSummaryCard } from './TaskSummaryCard';
import {
  Calendar,
  CheckCircle,
  TrendingUp,
  Tag,
  AlertTriangle,
  BarChart3,
  Users,
  Target
} from 'lucide-react';

export function TaskAnalytics() {
  const { data: keywordAnalytics, isLoading: keywordLoading } = useKeywordAnalyticsJsonb();
  const { data: duplicateAnalysis, isLoading: duplicateLoading } = useDuplicateAnalysisJsonb();
  const { data: stats, isLoading: statsLoading } = useTaskStatsJsonb();

  if (statsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Analytics Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Keyword Analytics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="mr-2 h-5 w-5" />
              키워드별 할 일 분석
            </CardTitle>
            <CardDescription>
              가장 많이 사용되는 키워드와 완료율을 확인하세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            {keywordLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : keywordAnalytics && Array.isArray(keywordAnalytics) && keywordAnalytics.length > 0 ? (
              <div className="space-y-4">
                {(keywordAnalytics as any[]).slice(0, 10).map((item, index) => (
                  <div key={item.keyword} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-6 text-sm text-muted-foreground font-medium">
                          {index + 1}
                        </div>
                        <Badge variant="outline" className="font-medium">
                          <Tag className="mr-1 h-3 w-3" />
                          {item.keyword}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-4 text-sm">
                        <div className="flex items-center space-x-2">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span>{item.event_count}개 업무</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Target className="h-3 w-3 text-muted-foreground" />
                          <span>{item.total_tasks}개 할 일</span>
                        </div>
                        <Badge
                          variant={item.avg_completion_rate >= 80 ? "default" :
                                  item.avg_completion_rate >= 50 ? "secondary" : "destructive"}
                          className="font-medium"
                        >
                          {item.avg_completion_rate}%
                        </Badge>
                      </div>
                    </div>
                    <Progress
                      value={item.avg_completion_rate}
                      className="h-2"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>분석할 데이터가 없습니다</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Duplicate Task Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="mr-2 h-5 w-5" />
              중복 할 일 분석
            </CardTitle>
            <CardDescription>
              같은 키워드를 가진 할 일들을 분석하여 효율성을 개선하세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            {duplicateLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : duplicateAnalysis && Array.isArray(duplicateAnalysis) && duplicateAnalysis.length > 0 ? (
              <div className="space-y-4">
                {(duplicateAnalysis as any[]).slice(0, 8).map(item => (
                  <div key={item.keyword} className="space-y-2 p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="font-medium">
                        <Tag className="mr-1 h-3 w-3" />
                        {item.keyword}
                      </Badge>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-muted-foreground">
                          {item.duplicate_count}개 할 일
                        </span>
                        <Badge variant={
                          item.consolidation_potential.startsWith('High') ? "destructive" :
                          item.consolidation_potential.startsWith('Medium') ? "default" : "secondary"
                        }>
                          {item.consolidation_potential.split(' - ')[0]}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.consolidation_potential.split(' - ')[1]}
                    </p>
                    {/* Show some similar tasks */}
                    {item.similar_tasks && item.similar_tasks.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.similar_tasks.slice(0, 3).map((task: any, index: number) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {task.title?.substring(0, 20)}...
                          </Badge>
                        ))}
                        {item.similar_tasks.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{item.similar_tasks.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>중복 할 일이 없습니다</p>
                <p className="text-sm">효율적으로 할 일이 관리되고 있습니다</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Keyword Utilization Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">키워드 활용</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">총 키워드</span>
              <span className="text-lg font-bold">{(stats as any)?.uniqueKeywords || 0}</span>
            </div>

            <div className="text-sm text-muted-foreground">
              가장 인기있는 키워드:
            </div>

            {keywordAnalytics && Array.isArray(keywordAnalytics) && keywordAnalytics.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {(keywordAnalytics as any[]).slice(0, 5).map(item => (
                  <Badge key={item.keyword} variant="secondary" className="text-xs">
                    {item.keyword}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}