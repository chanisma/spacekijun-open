import { useMemo } from 'react';
import { useNavSections } from '@/hooks/useNavSections';
import { orderFeaturesByMenu, type McpFeature } from '@/lib/mcpTools';

/** 에이전트(MCP) 관리 화면의 기능 순서 — 보고 있는 사람의 왼쪽 메뉴 순서(판정 `orderFeaturesByMenu`) */
export function useMcpFeatureOrder(): McpFeature[] {
  const { flatItems } = useNavSections();
  return useMemo(() => orderFeaturesByMenu(flatItems.map((item) => item.href)), [flatItems]);
}
