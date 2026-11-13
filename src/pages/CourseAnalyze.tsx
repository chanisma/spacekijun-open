import { Layout } from '@/components/layout/Layout';
import { CourseAnalyzePage } from '@/features/course-analyze';

/**
 * CourseAnalyze 페이지
 * React 컴포넌트로 마이그레이션 (기존 iframe 방식에서 변경)
 * - 번들된 xlsx 라이브러리 사용
 * - 별도 리소스 로딩 오버헤드 제거
 * - Lovable 플랫폼 호환
 */
const CourseAnalyze = () => {
  return (
    <Layout>
      <CourseAnalyzePage />
    </Layout>
  );
};

export default CourseAnalyze;
