import React from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw } from 'lucide-react';
import { BrowserNotificationToggle } from './BrowserNotificationToggle';

interface NotificationHeaderProps {
  onCreateClick: () => void;
  onRefresh?: () => void;
  loading?: boolean;
}

export const NotificationHeader = ({
  onCreateClick,
  onRefresh,
  loading = false
}: NotificationHeaderProps) => {
  return (
    <div className="mb-4">
      <ImprovedCard className="shadow-sm border border-gray-200">
        <CardHeader className="pb-3 pt-3 px-3 sm:px-4 md:px-6">
          <div className="flex items-center justify-between">
            <div></div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* 브라우저(OS) 알림 켜기/끄기. 이 페이지가 알림 설정을 찾는 자리라
                  진입점을 여기 둔다 — 별도 설정 화면을 새로 만들면 아무도 못 찾는다. */}
              <BrowserNotificationToggle />

              <Button
                variant="default"
                size="sm"
                onClick={onCreateClick}
                className="bg-blue-600 hover:bg-blue-700 text-white h-7 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm"
              >
                <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">알림 생성</span>
              </Button>
              {onRefresh && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  disabled={loading}
                  className="bg-white hover:bg-gray-50 h-7 px-2 sm:px-3 flex items-center gap-1.5 text-xs sm:text-sm"
                >
                  <RefreshCw className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">새로고침</span>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </ImprovedCard>
    </div>
  );
};