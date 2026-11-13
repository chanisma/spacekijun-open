import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { NeisMealService } from '@/services/neisMealService';
import { DashboardCardShell } from '@/features/teacher-dashboard/components/DashboardCardShell';
import { UtensilsCrossed } from 'lucide-react';
import { kstDateKey } from '@/lib/schoolDay';

export const MealCard: React.FC = () => {
  // 한국 날짜 — toISOString 은 UTC 라 자정~오전 9시에 어제 급식이었다
  const today = kstDateKey(Date.now());
  const { data: mealData, isLoading } = useQuery({
    queryKey: ['meal', today],
    queryFn: () => NeisMealService.getMealData(today),
    staleTime: 30 * 60 * 1000, // 30분
  });

  return (
    <DashboardCardShell title="오늘의 급식" icon={UtensilsCrossed} accent="orange"
      description="오늘 준비된 중식과 석식 메뉴예요.">
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 bg-gray-200 rounded w-3/4"></div>
            ))}
          </div>
        ) : (!mealData?.lunch && !mealData?.dinner) ? (
          <div className="text-center py-8 text-muted-foreground">
            <UtensilsCrossed className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>오늘의 급식 정보가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {mealData.lunch && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-amber-700">중식</span>
                  {mealData.lunch.calories && (
                    <span className="text-xs text-gray-500">{mealData.lunch.calories}</span>
                  )}
                </div>
                <div className="space-y-1">
                  {mealData.lunch.menu.map((item, index) => (
                    <div
                      key={index}
                      className="text-sm leading-6 text-slate-700 pl-3 border-l-2 border-amber-200"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {mealData.dinner && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-amber-700">석식</span>
                  {mealData.dinner.calories && (
                    <span className="text-xs text-gray-500">{mealData.dinner.calories}</span>
                  )}
                </div>
                <div className="space-y-1">
                  {mealData.dinner.menu.map((item, index) => (
                    <div
                      key={index}
                      className="text-sm leading-6 text-slate-700 pl-3 border-l-2 border-amber-200"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
    </DashboardCardShell>
  );
};
