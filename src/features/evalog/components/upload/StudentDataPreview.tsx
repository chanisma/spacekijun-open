/**
 * 추출된 학생 데이터 미리보기 컴포넌트
 * PDF에서 추출한 데이터를 표시하고 검증 결과를 보여줌
 */

import React from 'react';
import { Student } from '../../types';
import { PDFParseResult } from '../../types/pdf';
import { calculateCompleteness } from '../../utils/pdf/validator';

interface StudentDataPreviewProps {
  parseResult: PDFParseResult;
  onEdit?: () => void;
  onConfirm?: (student: Partial<Student>) => void;
  onCancel?: () => void;
}

const StudentDataPreview: React.FC<StudentDataPreviewProps> = ({
  parseResult,
  onEdit,
  onConfirm,
  onCancel
}) => {
  const { student, errors, success } = parseResult;

  if (!student) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700">학생 데이터를 추출할 수 없습니다.</p>
      </div>
    );
  }

  const completeness = calculateCompleteness(student);
  const errorCount = errors.filter(e => e.severity === 'error').length;
  const warningCount = errors.filter(e => e.severity === 'warning').length;

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6">
      {/* 헤더 및 상태 */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">추출된 학생 데이터</h2>
          <div className="flex items-center space-x-3">
            {success ? (
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                추출 성공
              </span>
            ) : (
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                일부 오류
              </span>
            )}
          </div>
        </div>

        {/* 완성도 및 오류 요약 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-blue-600 font-medium">데이터 완성도</p>
            <p className="text-2xl font-bold text-blue-900">{completeness}%</p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <p className="text-sm text-red-600 font-medium">오류</p>
            <p className="text-2xl font-bold text-red-900">{errorCount}</p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg">
            <p className="text-sm text-yellow-600 font-medium">경고</p>
            <p className="text-2xl font-bold text-yellow-900">{warningCount}</p>
          </div>
        </div>
      </div>

      {/* 오류 및 경고 목록 */}
      {(errorCount > 0 || warningCount > 0) && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">검증 결과</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {errors.map((error, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg ${error.severity === 'error'
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-yellow-50 border border-yellow-200'
                  }`}
              >
                <div className="flex items-start space-x-2">
                  {error.severity === 'error' ? (
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${error.severity === 'error' ? 'text-red-800' : 'text-yellow-800'
                      }`}>
                      {error.field}
                    </p>
                    <p className={`text-sm ${error.severity === 'error' ? 'text-red-600' : 'text-yellow-600'
                      }`}>
                      {error.message}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 기본 정보 */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">기본 정보</h3>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">수험번호</dt>
            <dd className="mt-1 text-sm text-gray-900">{student.studentNo || '-'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">성명</dt>
            <dd className="mt-1 text-sm text-gray-900">{student.name || '-'}</dd>
          </div>
          {/* Removed removed fields display */}
        </dl>
      </div>

      {/* 교과 성적 */}
      {student.section6_academic_development && student.section6_academic_development.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            교과 성적 ({student.section6_academic_development.length}개 과목)
          </h3>
          <div className="max-h-60 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">과목</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">학기</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">성적</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">단위</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {student.section6_academic_development.slice(0, 10).map((grade, index) => (
                  <tr key={index}>
                    <td className="px-3 py-2 text-sm text-gray-900">{grade.subject}</td>
                    <td className="px-3 py-2 text-sm text-gray-500">{grade.semester}</td>
                    <td className="px-3 py-2 text-sm text-gray-900">{typeof grade.score === 'number' ? grade.score : (grade.achievement || '-')}</td>
                    <td className="px-3 py-2 text-sm text-gray-500">{grade.units || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {student.section6_academic_development.length > 10 && (
              <p className="text-sm text-gray-500 text-center py-2">
                외 {student.section6_academic_development.length - 10}개 과목...
              </p>
            )}
          </div>
        </div>
      )}

      {/* 비교과 활동 요약 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-sm text-gray-500">창의적 체험활동</p>
          <p className="text-2xl font-bold text-gray-900">
            {student.section5_creative_activities?.length || 0}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-sm text-gray-500">봉사활동</p>
          <p className="text-2xl font-bold text-gray-900">
            {student.volunteer_activities?.length || 0}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-sm text-gray-500">행동특성</p>
          <p className="text-2xl font-bold text-gray-900">
            {student.section8_behavior_characteristics?.length || 0}
          </p>
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="flex justify-end space-x-3">
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
        )}
        {onEdit && (
          <button
            onClick={onEdit}
            className="px-6 py-2 border border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors"
          >
            수정
          </button>
        )}
        {onConfirm && (
          <button
            onClick={() => onConfirm(student)}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            disabled={!success}
          >
            확인
          </button>
        )}
      </div>
    </div>
  );
};

export default StudentDataPreview;
