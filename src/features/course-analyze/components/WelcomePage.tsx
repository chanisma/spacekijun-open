/**
 * Welcome Page Component - 시작 페이지
 * 데이터 업로드 전 표시되는 안내 페이지
 */

import React, { useState } from 'react';
import { FileJson, Upload, BarChart3, Search, Users, Settings } from 'lucide-react';
import { useCourseAnalyzeData, useAdmin } from '../context';

// Section Card Component with hover effects
function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={className}
      style={{
        backgroundColor: '#f7fafc',
        borderRadius: '12px',
        padding: '24px',
        border: '1px solid #e2e8f0',
        transition: 'all 0.3s ease',
        transform: isHovered ? 'translateY(-2px)' : 'none',
        boxShadow: isHovered ? '0 8px 25px rgba(0, 0, 0, 0.1)' : 'none',
        borderColor: isHovered ? '#cbd5e0' : '#e2e8f0',
      }}
    >
      {children}
    </div>
  );
}

// Sample Data Button with gradient styling
function SampleDataButton({ onClick, isLoading }: { onClick: () => void; isLoading: boolean }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: '100%',
        padding: '10px 16px',
        background: isHovered
          ? 'linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)'
          : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: isLoading ? 'not-allowed' : 'pointer',
        transition: 'all 0.3s ease',
        transform: isHovered && !isLoading ? 'translateY(-1px)' : 'none',
        boxShadow: isHovered && !isLoading ? '0 4px 8px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.1)',
        opacity: isLoading ? 0.5 : 1,
      }}
    >
      {isLoading ? '로딩 중...' : '📊 DB에서 신청 데이터 불러오기'}
    </button>
  );
}

export function WelcomePage() {
  const { loadFromDatabase, isLoading } = useCourseAnalyzeData();
  const { openDashboard } = useAdmin();

  const handleLoadSample = async () => {
    // DB의 신청 이력 로드
    await loadFromDatabase();
  };

  return (
    <div className="h-full overflow-y-auto bg-card">
      <div className="max-w-4xl mx-auto p-8">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-4 mb-3">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              학생 과목 선택 분석 시스템
            </h1>
            <button
              onClick={openDashboard}
              className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
              title="관리자 대시보드"
            >
              <Settings className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
          <p className="text-muted-foreground">
            학생들의 선택과목 데이터를 분석하여 다양한 인사이트를 제공합니다
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Getting Started */}
          <SectionCard>
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              시작하기
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              왼쪽 업로드 구역에 JSON 또는 Excel 파일을 드래그 앤 드롭하거나 클릭하여 업로드하세요.
            </p>
            <SampleDataButton onClick={handleLoadSample} isLoading={isLoading} />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              DB에 저장된 학년도/차수별 학생 신청 이력 (1236건 × 6 라운드)
            </p>
          </SectionCard>

          {/* Features */}
          <SectionCard>
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <FileJson className="h-5 w-5 text-primary" />
              지원 파일 형식
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                통합 JSON 파일 (권장)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                Excel 파일 (.xlsx, .xls)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                리로스쿨 알림신청 자료
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                교육청 수강신청 자동분반 자료
              </li>
            </ul>
          </SectionCard>

          {/* Analysis Features */}
          <SectionCard>
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              분석 기능
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                <strong className="text-foreground">과목별 선택 학생 수</strong>: 각 과목의 선택 현황
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                <strong className="text-foreground">과목 조합 검색</strong>: 특정 과목 조합 분석
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                <strong className="text-foreground">심화 분석</strong>: 상세한 통계 정보
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                <strong className="text-foreground">학급별 보기</strong>: 학급별 선택 현황
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
                <strong className="text-foreground">예상 등급</strong>: 과목별 등급 예측
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                <strong className="text-foreground">차수별 비교</strong>: 시기별 변화 추이
              </li>
            </ul>
          </SectionCard>

          {/* Search Features */}
          <SectionCard>
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              검색 및 필터링
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                학생 이름/학번으로 검색
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                학년별 데이터 분리 조회
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                학급별 조회
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                과목 선택 조합별 조회
              </li>
            </ul>
          </SectionCard>
        </div>

        {/* Privacy Note */}
        <div className="bg-green-50 dark:bg-green-950/30 rounded-xl p-4 border border-green-200 dark:border-green-900">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-full bg-green-100 dark:bg-green-900">
              <Users className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h4 className="font-medium text-green-800 dark:text-green-200 text-sm">개인정보 보호</h4>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                모든 데이터는 브라우저에서만 처리되며, 서버로 전송되지 않습니다.
                안심하고 학생 데이터를 분석하세요.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
