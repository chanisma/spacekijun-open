/**
 * 학생 데이터 편집 컴포넌트
 * 추출된 데이터를 수정할 수 있는 폼
 */

import React, { useState } from 'react';
import { Student } from '../../types';

interface StudentDataEditorProps {
  initialData: Partial<Student>;
  onSave: (data: Partial<Student>) => void;
  onCancel: () => void;
}

const StudentDataEditor: React.FC<StudentDataEditorProps> = ({
  initialData,
  onSave,
  onCancel
}) => {
  const [formData, setFormData] = useState<Partial<Student>>(initialData);

  const handleInputChange = (field: keyof Student, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 헤더 */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">학생 데이터 편집</h2>
          <p className="text-sm text-gray-500">
            추출된 데이터를 확인하고 필요시 수정하세요.
          </p>
        </div>

        {/* 기본 정보 편집 */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">기본 정보</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                수험번호 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.studentNo || ''}
                onChange={(e) => handleInputChange('studentNo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                성명 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>

            {/* Deprecated fields removed: schoolName, department, ipsiType, ipsiUnit */}
          </div>
        </div>

        {/* 데이터 요약 */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">추출된 데이터 요약</h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-600 font-medium">교과 성적</p>
              <p className="text-2xl font-bold text-blue-900">
                {formData.section6_academic_development?.length || 0}
              </p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-600 font-medium">창의적 체험</p>
              <p className="text-2xl font-bold text-green-900">
                {formData.section5_creative_activities?.length || 0}
              </p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-purple-600 font-medium">봉사활동</p>
              <p className="text-2xl font-bold text-purple-900">
                {formData.volunteer_activities?.length || 0}
              </p>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <p className="text-sm text-orange-600 font-medium">행동특성</p>
              <p className="text-2xl font-bold text-orange-900">
                {formData.section8_behavior_characteristics?.length || 0}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-4 text-center">
            상세 데이터는 저장 후 학생 관리 화면에서 확인하실 수 있습니다.
          </p>
        </div>

        {/* 액션 버튼 */}
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            저장
          </button>
        </div>
      </form>
    </div>
  );
};

export default StudentDataEditor;
