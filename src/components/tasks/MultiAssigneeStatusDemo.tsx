// ========================================
// Multi-Assignee Status Display Demo
// 다양한 상태 표시 방식을 테스트하기 위한 데모 페이지
// ========================================

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MultiAssigneeStatus } from './MultiAssigneeStatus';
import { TaskAssignee } from '@/types/tasks';

export function MultiAssigneeStatusDemo() {
  const [currentVariant, setCurrentVariant] = useState<'compact' | 'detailed' | 'progress' | 'kanban' | 'dots'>('compact');

  // 테스트용 샘플 데이터
  const sampleAssignees: TaskAssignee[] = [
    { id: '1', name: '이선생', type: 'teacher', status: 'completed' },
    { id: '2', name: '박학생', type: 'student', status: 'pending' },
    { id: '3', name: '김학생', type: 'student', status: 'pending' },
    { id: '4', name: '최학생', type: 'student', status: 'pending' }
  ];

  const variants = [
    { key: 'compact', label: '간결 표시', description: '공간 효율적, 빠른 파악' },
    { key: 'detailed', label: '상세 그룹화', description: '상태별 명확한 구분' },
    { key: 'progress', label: '프로그레스 바', description: '진행률 시각화' },
    { key: 'kanban', label: '칸반 스타일', description: '워크플로우 중심' },
    { key: 'dots', label: '도트 표시', description: '최소 공간 사용' }
  ] as const;

  const handleStatusChange = (assigneeId: string, newStatus: 'pending' | 'completed') => {
    // 실제로는 API 호출하여 상태 변경
    console.log(`Changing ${assigneeId} status to ${newStatus}`);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">다중 담당자 상태 표시 데모</h1>
        <p className="text-gray-600">다양한 방식으로 다중 담당자의 할 일 상태를 표시해보세요</p>
      </div>

      {/* 변형 선택 */}
      <Card>
        <CardHeader>
          <CardTitle>표시 방식 선택</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {variants.map(variant => (
              <Button
                key={variant.key}
                variant={currentVariant === variant.key ? "default" : "outline"}
                onClick={() => setCurrentVariant(variant.key)}
                className="flex flex-col items-center p-4 h-auto"
              >
                <span className="font-medium">{variant.label}</span>
                <span className="text-xs text-gray-500 mt-1">{variant.description}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 현재 선택된 변형 표시 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            현재 표시 방식:
            <Badge variant="secondary">{variants.find(v => v.key === currentVariant)?.label}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 border rounded-lg bg-gray-50">
              <h3 className="font-medium mb-3">공시 자료 등록 (테스트 할 일)</h3>
              <MultiAssigneeStatus
                assignees={sampleAssignees}
                variant={currentVariant}
                showNames={true}
                maxVisible={3}
              />
            </div>

            {/* 시나리오별 테스트 */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h4 className="font-medium">시나리오 1: 모두 완료</h4>
                <div className="p-3 border rounded bg-green-50">
                  <MultiAssigneeStatus
                    assignees={sampleAssignees.map(a => ({ ...a, status: 'completed' as const }))}
                    variant={currentVariant}
                    maxVisible={3}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">시나리오 2: 혼재 상황</h4>
                <div className="p-3 border rounded bg-yellow-50">
                  <MultiAssigneeStatus
                    assignees={[
                      { id: '1', name: '이선생', type: 'teacher', status: 'completed' },
                      { id: '2', name: '박학생', type: 'student', status: 'completed' },
                      { id: '3', name: '김학생', type: 'student', status: 'pending' },
                      { id: '4', name: '최학생', type: 'student', status: 'pending' },
                      { id: '5', name: '정학생', type: 'student', status: 'pending' }
                    ]}
                    variant={currentVariant}
                    maxVisible={3}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">시나리오 3: 단일 담당자</h4>
                <div className="p-3 border rounded bg-blue-50">
                  <MultiAssigneeStatus
                    assignees={[{ id: '1', name: '이선생', type: 'teacher', status: 'pending' }]}
                    variant={currentVariant}
                    maxVisible={3}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">시나리오 4: 많은 담당자</h4>
                <div className="p-3 border rounded bg-purple-50">
                  <MultiAssigneeStatus
                    assignees={[
                      { id: '1', name: '이선생', type: 'teacher', status: 'completed' },
                      { id: '2', name: '박학생', type: 'student', status: 'completed' },
                      { id: '3', name: '김학생', type: 'student', status: 'pending' },
                      { id: '4', name: '최학생', type: 'student', status: 'pending' },
                      { id: '5', name: '정학생', type: 'student', status: 'pending' },
                      { id: '6', name: '한학생', type: 'student', status: 'pending' },
                      { id: '7', name: '임학생', type: 'student', status: 'completed' }
                    ]}
                    variant={currentVariant}
                    maxVisible={3}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 사용 가이드 */}
      <Card>
        <CardHeader>
          <CardTitle>각 표시 방식의 특징</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {variants.map(variant => (
                <div key={variant.key} className="p-3 border rounded">
                  <h4 className="font-medium text-sm">{variant.label}</h4>
                  <p className="text-xs text-gray-600 mt-1">{variant.description}</p>
                  <div className="mt-2 text-xs">
                    {variant.key === 'compact' && '• 아바타 + 숫자\n• 토글팁으로 상세 정보'}
                    {variant.key === 'detailed' && '• 상태별 그룹화\n• 명확한 구분'}
                    {variant.key === 'progress' && '• 진행률 바\n• 시각적 진행도'}
                    {variant.key === 'kanban' && '• 칸반 보드 스타일\n• 워크플로우 표현'}
                    {variant.key === 'dots' && '• 색상 도트\n• 최소 공간'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 권장 사항 */}
      <Card>
        <CardHeader>
          <CardTitle>사용 권장 사항</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="text-xs">Compact</Badge>
              <span>일반적인 할 일 목록, 대시보드에서 기본 사용</span>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="text-xs">Progress</Badge>
              <span>중요한 프로젝트, 진행률이 중요한 할 일</span>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="text-xs">Detailed</Badge>
              <span>할 일 상세 페이지, 관리자 뷰에서 사용</span>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="text-xs">Kanban</Badge>
              <span>프로젝트 관리, 팀 협업 페이지에서 사용</span>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="text-xs">Dots</Badge>
              <span>공간이 제한된 모바일 뷰, 사이드바</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}