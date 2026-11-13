import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { KgJson } from '@/services/studentKgService';
import { kgJsonToGraphData } from '../utils/kgJsonToGraphData';

export interface KnowledgeGraphIframeProps {
  /** The KG JSON data (skill output format) */
  data: KgJson;
  /** Student display name */
  studentName?: string;
  /** Student info string e.g. "3-3-21" */
  studentInfo?: string;
  /** Container height (default: 700px) */
  height?: number | string;
  /** Optional CSS class */
  className?: string;
}

/**
 * KG 시각화 — HTML 템플릿을 iframe srcdoc으로 렌더링.
 *
 * visual.html 템플릿의 모든 기능(필터, 상세패널, 다중 레이아웃,
 * 하이라이트/페이드, 관계별 색상/스타일 등)을 그대로 활용합니다.
 */
export function KnowledgeGraphIframe({
  data,
  studentName,
  studentInfo,
  height = 700,
  className,
}: KnowledgeGraphIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function buildHtml() {
      try {
        // 1. Fetch the HTML template from public/
        const res = await fetch('/kg-template.html');
        if (!res.ok) throw new Error(`Template fetch failed: ${res.status}`);
        let template = await res.text();

        // 2. Transform KgJson → Cytoscape graph data
        const graphData = kgJsonToGraphData(data, studentName, studentInfo);

        // 3. Replace placeholders
        template = template.replace(/__GRAPH_DATA__/g, JSON.stringify(graphData));
        template = template.replace(/__STUDENT_NAME__/g, studentName || data.student_code || '');
        template = template.replace(/__STUDENT_INFO__/g, studentInfo || '');

        if (!cancelled) {
          setHtmlContent(template);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setHtmlContent(null);
        }
      }
    }

    buildHtml();
    return () => { cancelled = true; };
  }, [data, studentName, studentInfo]);

  if (error) {
    return (
      <div
        className={cn('flex items-center justify-center rounded-lg border bg-destructive/5 text-sm text-destructive', className)}
        style={{ height }}
      >
        템플릿 로드 실패: {error}
      </div>
    );
  }

  if (!htmlContent) {
    return (
      <div
        className={cn('flex items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground', className)}
        style={{ height }}
      >
        그래프 준비 중...
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={htmlContent}
      className={cn('w-full rounded-lg border-0', className)}
      style={{ height }}
      sandbox="allow-scripts"
      title="Knowledge Graph Viewer"
    />
  );
}

export default KnowledgeGraphIframe;
