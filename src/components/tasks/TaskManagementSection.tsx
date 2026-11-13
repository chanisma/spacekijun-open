// ========================================
// Task Management Section Component
// Main management interface for tasks and works
// ========================================

import { useState } from 'react';
import { WorkList } from './WorkList';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkCreateDialog } from './WorkCreateDialog';
import { Plus, Settings, Calendar, BarChart3 } from 'lucide-react';

export function TaskManagementSection() {
  const [createWorkOpen, setCreateWorkOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('works');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">업무 관리</h2>
          <p className="text-muted-foreground">
            업무와 세부 할 일을 생성하고 관리하세요
          </p>
        </div>
        <Button onClick={() => setCreateWorkOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          새 업무 생성
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="works" className="flex items-center space-x-2">
            <Calendar className="h-4 w-4" />
            <span>업무 관리</span>
          </TabsTrigger>
          <TabsTrigger value="tasks" className="flex items-center space-x-2">
            <Settings className="h-4 w-4" />
            <span>업무 관리</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center space-x-2">
            <BarChart3 className="h-4 w-4" />
            <span>보고서</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="works" className="space-y-4">
          <WorkList {...({ showFilters: true } as any)} />
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>개별 업무 관리</CardTitle>
              <CardDescription>
                각 업무의 세부 할 일을 관리할 수 있습니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                업무를 선택하여 세부 할 일을 관리하세요. 업무 관리 탭에서 업무를 클릭하면 
                세부 할 일을 추가하고 수정할 수 있습니다.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>할 일 보고서</CardTitle>
              <CardDescription>
                할 일 진행 상황과 통계를 확인할 수 있습니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                보고서 기능은 분석 탭에서 더 자세히 확인할 수 있습니다. 
                키워드별 분석, 완료율 추이 등을 제공합니다.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <WorkCreateDialog
        open={createWorkOpen}
        onOpenChange={setCreateWorkOpen}
      />
    </div>
  );
}