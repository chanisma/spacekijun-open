import React, { useState, useEffect } from 'react';
import { getCacheStats, clearAllSimilarityCaches, clearOldCaches } from '../../utils/similarityCache';

/**
 * 유사도 캐시 관리 컴포넌트
 * 개발자 도구 또는 설정 페이지에서 사용
 */
const SimilarityCacheManager: React.FC = () => {
  const [stats, setStats] = useState(getCacheStats());
  const [showDetails, setShowDetails] = useState(false);

  const refreshStats = () => {
    setStats(getCacheStats());
  };

  useEffect(() => {
    refreshStats();
  }, []);

  const handleClearAll = () => {
    if (window.confirm('모든 유사도 캐시를 삭제하시겠습니까?\n다음 조회 시 재계산됩니다.')) {
      clearAllSimilarityCaches();
      refreshStats();
    }
  };

  const handleClearOld = () => {
    clearOldCaches();
    refreshStats();
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('ko-KR');
  };

  return (
    <div className="bg-white border rounded p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">유사도 캐시 관리</h3>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {showDetails ? '간단히 보기' : '상세 보기'}
        </button>
      </div>

      <div className="space-y-3">
        {/* 기본 정보 */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-gray-600 mb-1">캐시 항목 수</div>
            <div className="text-2xl font-bold text-purple-600">{stats.totalCaches}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-gray-600 mb-1">총 용량</div>
            <div className="text-2xl font-bold text-purple-600">{formatBytes(stats.totalSize)}</div>
          </div>
        </div>

        {/* 상세 정보 */}
        {showDetails && (
          <div className="border-t pt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">가장 오래된 캐시</span>
              <span className="font-mono text-xs">{formatDate(stats.oldestCache)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">가장 최근 캐시</span>
              <span className="font-mono text-xs">{formatDate(stats.newestCache)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">캐시 유효 기간</span>
              <span className="font-mono text-xs">24시간</span>
            </div>
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex gap-2 pt-3 border-t">
          <button
            onClick={handleClearOld}
            className="flex-1 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
          >
            오래된 캐시 정리
          </button>
          <button
            onClick={handleClearAll}
            className="flex-1 px-3 py-2 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded transition-colors"
          >
            전체 삭제
          </button>
          <button
            onClick={refreshStats}
            className="px-3 py-2 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition-colors"
          >
            🔄
          </button>
        </div>

        {/* 안내 메시지 */}
        <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded">
          💡 캐시는 학생부 데이터 변경 시 자동으로 무효화됩니다.
          24시간 후에는 자동으로 만료됩니다.
        </div>
      </div>
    </div>
  );
};

export default SimilarityCacheManager;
