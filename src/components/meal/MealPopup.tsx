import React, { useState, useEffect } from 'react';
import { UtensilsCrossed, Clock, Calendar, ChefHat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import NeisMealService, { MealData } from '@/services/neisMealService';

export const MealPopup = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mealData, setMealData] = useState<MealData | null>(null);
  const [loading, setLoading] = useState(false);

  // 초기 날짜를 평일로 설정
  const getInitialWeekday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();

    // 토요일(6)이면 월요일로 (2일 후)
    if (dayOfWeek === 6) {
      today.setDate(today.getDate() + 2);
    }
    // 일요일(0)이면 월요일로 (1일 후)
    else if (dayOfWeek === 0) {
      today.setDate(today.getDate() + 1);
    }

    return today.toISOString().split('T')[0];
  };

  const [selectedDate, setSelectedDate] = useState(getInitialWeekday());

  useEffect(() => {
    if (isOpen) {
      fetchMealData();
    }
  }, [isOpen, selectedDate]);

  const fetchMealData = async () => {
    try {
      setLoading(true);
      const data = await NeisMealService.getMealData(selectedDate);
      setMealData(data);
    } catch (error) {
      console.error('급식 정보 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    };
    return date.toLocaleDateString('ko-KR', options);
  };

  const renderMealSection = (title: string, meal: { menu: string[]; calories?: string } | undefined, icon: React.ReactNode) => {
    if (!meal || meal.menu.length === 0) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {icon}
            <h4 className="font-medium text-sm md:text-base">{title}</h4>
          </div>
          <p className="text-sm text-muted-foreground">급식 정보가 없습니다</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {icon}
          <h4 className="font-medium text-sm md:text-base">{title}</h4>
          {meal.calories && (
            <Badge variant="secondary" className="text-xs md:text-sm">
              {meal.calories}
            </Badge>
          )}
        </div>
        <div className="space-y-1">
          {meal.menu.map((item, index) => (
            <div key={index} className="text-sm md:text-base text-muted-foreground leading-relaxed">
              • {item}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const goToPreviousDay = () => {
    const date = new Date(selectedDate);
    const dayOfWeek = date.getDay();

    // 월요일(1)이면 금요일로 (3일 전)
    if (dayOfWeek === 1) {
      date.setDate(date.getDate() - 3);
    }
    // 일요일(0)이면 금요일로 (2일 전)
    else if (dayOfWeek === 0) {
      date.setDate(date.getDate() - 2);
    }
    // 평일이면 1일 전
    else {
      date.setDate(date.getDate() - 1);
    }

    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const goToNextDay = () => {
    const date = new Date(selectedDate);
    const dayOfWeek = date.getDay();

    // 금요일(5)이면 월요일로 (3일 후)
    if (dayOfWeek === 5) {
      date.setDate(date.getDate() + 3);
    }
    // 토요일(6)이면 월요일로 (2일 후)
    else if (dayOfWeek === 6) {
      date.setDate(date.getDate() + 2);
    }
    // 평일이면 1일 후
    else {
      date.setDate(date.getDate() + 1);
    }

    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setSelectedDate(getInitialWeekday());
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <UtensilsCrossed className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 md:w-80 sm:w-72 p-0" align="end">
        <Card className="border-0 shadow-none">
          <CardHeader className="border-b pb-3 px-3 md:px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm md:text-base flex items-center gap-2">
                <ChefHat className="h-4 w-4" />
                오늘의 급식
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={goToToday}
                className="text-xs h-auto p-1 px-2"
              >
                오늘
              </Button>
            </div>

            {/* 날짜 네비게이션 */}
            <div className="flex items-center justify-between mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={goToPreviousDay}
                className="h-8 w-8 p-0 text-lg"
              >
                ←
              </Button>

              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span className="text-sm md:text-base font-medium text-center">
                  {formatDate(selectedDate)}
                </span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={goToNextDay}
                className="h-8 w-8 p-0 text-lg"
              >
                →
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <ScrollArea className="h-80 md:h-80 sm:h-72">
              {loading ? (
                <div className="p-3 md:p-4 text-center text-muted-foreground text-sm">
                  급식 정보를 불러오는 중...
                </div>
              ) : !mealData ? (
                <div className="p-3 md:p-4 text-center text-muted-foreground text-sm">
                  급식 정보가 없습니다
                </div>
              ) : (
                <div className="p-3 md:p-4 space-y-4">
                  {/* 중식 */}
                  {renderMealSection(
                    '중식',
                    mealData.lunch,
                    <Clock className="h-3 w-3 text-orange-500" />
                  )}

                  {mealData.lunch && mealData.dinner && (
                    <Separator className="my-3" />
                  )}

                  {/* 석식 */}
                  {renderMealSection(
                    '석식',
                    mealData.dinner,
                    <Clock className="h-3 w-3 text-purple-500" />
                  )}

                  {/* 정보가 없는 경우 */}
                  {!mealData.lunch && !mealData.dinner && (
                    <div className="text-center text-muted-foreground text-sm py-6 md:py-8">
                      해당 날짜의 급식 정보가 없습니다
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
};