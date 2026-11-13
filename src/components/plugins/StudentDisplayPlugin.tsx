import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, Settings } from 'lucide-react';
import { PluginComponentProps, StudentDisplayData } from '@/types/plugin';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const AVAILABLE_FIELDS = [
  { id: 'name', label: '이름' },
  { id: 'picture', label: '사진' },
  { id: 'class', label: '반' },
  { id: 'number', label: '번호' },
  { id: 'email', label: '이메일' },
];

export const StudentDisplayPlugin: React.FC<PluginComponentProps> = ({
  instance,
  readonly = false,
  onUpdate,
}) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [studentData, setStudentData] = useState<StudentDisplayData>({
    students: [],
    displayFields: ['name'],
  });

  useEffect(() => {
    if (instance.data && typeof instance.data === 'object') {
      const data = instance.data as Partial<StudentDisplayData>;
      setStudentData({
        students: data.students || [],
        displayFields: (data.displayFields || ['name']).filter((field) => field !== 'phone'),
      });
    }
  }, [instance.data]);

  // 선택된 학생들의 상세 정보 가져오기
  const { data: students = [] } = useQuery({
    queryKey: ['students-display', studentData.students],
    queryFn: async () => {
      if (studentData.students.length === 0) return [];

      const { data, error } = await supabase
        .from('resource')
        .select('id, name, type, meta')
        .in('id', studentData.students)
        .eq('type', 'student');

      if (error) throw error;
      return data || [];
    },
    enabled: studentData.students.length > 0,
  });

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(studentData);
    }
    setIsEditMode(false);
  };

  const handleFieldToggle = (fieldId: string, checked: boolean) => {
    setStudentData(prev => ({
      ...prev,
      displayFields: checked
        ? [...prev.displayFields, fieldId]
        : prev.displayFields.filter(f => f !== fieldId),
    }));
  };

  // 편집 모드
  if (isEditMode && !readonly) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-2 md:pb-3 px-3 md:px-6 pt-4 md:pt-6">
          <CardTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-base">
            <Users className="w-3.5 h-3.5 md:w-4 md:h-4" />
            학생 표시 설정
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 md:space-y-4 px-3 md:px-6 pb-4 md:pb-6">
          <div>
            <Label>학생 선택</Label>
            <SearchableMultiSelect
              filterByStudent={true}
              selectedValues={studentData.students}
              onSelectionChange={(values) => setStudentData(prev => ({ ...prev, students: values }))}
              placeholder="학생을 선택하세요"
              searchPlaceholder="학생 이름으로 검색..."
              className="mt-2"
            />
          </div>

          <div className="space-y-2">
            <Label>표시할 정보</Label>
            <div className="space-y-2">
              {AVAILABLE_FIELDS.map((field) => (
                <div key={field.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={field.id}
                    checked={studentData.displayFields.includes(field.id)}
                    onCheckedChange={(checked) => handleFieldToggle(field.id, checked as boolean)}
                  />
                  <Label htmlFor={field.id} className="cursor-pointer">
                    {field.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-4">
            <Button
              onClick={handleSave}
              disabled={studentData.students.length === 0 || studentData.displayFields.length === 0}
            >
              저장
            </Button>
            <Button variant="outline" onClick={() => setIsEditMode(false)}>
              취소
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 표시 뷰
  if (studentData.students.length === 0) {
    if (!readonly) {
      return (
        <Card className="w-full">
          <CardContent className="py-6 md:py-8 px-3 md:px-6 text-center">
            <Users className="w-10 h-10 md:w-12 md:h-12 mx-auto text-muted-foreground mb-3 md:mb-4" />
            <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4">아직 선택된 학생이 없습니다</p>
            <Button onClick={() => setIsEditMode(true)} size="sm" className="h-8 text-xs md:h-9 md:text-sm">
              학생 선택하기
            </Button>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 md:pb-3 px-3 md:px-6 pt-4 md:pt-6">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-base flex-1 min-w-0">
            <Users className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
            <span className="truncate">학생 목록 ({students.length}명)</span>
          </CardTitle>
          {!readonly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditMode(true)}
              className="text-[10px] md:text-xs h-6 md:h-7 px-1.5 md:px-2 flex-shrink-0"
            >
              <Settings className="w-3 h-3 md:w-3.5 md:h-3.5 mr-0.5 md:mr-1" />
              편집
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-3 md:px-6 pb-4 md:pb-6">
        <div className="space-y-1.5 md:space-y-2">
          {students.map((student) => {
            const meta = student.meta && typeof student.meta === 'object' ? student.meta as Record<string, any> : {};
            const showPhoto = studentData.displayFields.includes('picture');
            const photoUrl = meta.picture;

            return (
              <div
                key={student.id}
                className="p-2 md:p-2.5 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex gap-2 md:gap-2.5">
                  {/* 사진 표시 영역 */}
                  {showPhoto && (
                    <div className="flex-shrink-0">
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt={student.name}
                          className="w-10 h-10 md:w-14 md:h-14 rounded-full object-cover border border-gray-200 md:border-2"
                        />
                      ) : (
                        <div className="w-10 h-10 md:w-14 md:h-14 rounded-full bg-gray-200 flex items-center justify-center border border-gray-300 md:border-2">
                          <Users className="w-5 h-5 md:w-7 md:h-7 text-gray-400" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* 정보 표시 영역 */}
                  <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                    {studentData.displayFields
                      .filter(fieldId => fieldId !== 'picture')
                      .map((fieldId) => {
                        const field = AVAILABLE_FIELDS.find(f => f.id === fieldId);
                        if (!field) return null;

                        let value = '';
                        if (fieldId === 'name') {
                          value = student.name;
                        } else {
                          value = meta[fieldId] || '-';
                        }

                        return (
                          <div key={fieldId} className="flex items-center gap-1.5 md:gap-2">
                            <span className="text-[10px] md:text-xs text-muted-foreground min-w-[50px] md:min-w-[60px] flex-shrink-0">
                              {field.label}:
                            </span>
                            <span className="text-xs md:text-sm font-medium truncate">{value}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
