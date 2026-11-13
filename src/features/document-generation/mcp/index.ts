/**
 * 에이전트(MCP) 문서 생성 로직의 묶음 입구 — scripts/mcp-docgen/build-bundle.mts 가 이 파일을 묶어
 * supabase/functions/_shared/docgenAgentSpec.bundle.js 를 만든다(엣지 함수 mcp · mcp-docgen 이 쓴다).
 */
export { AGENT_SPEC_GUIDE, MAX_AGENT_TARGETS, buildAgentSpec, checkAgentSpec, describeTemplate } from './agentSpec';
export { describeForFill, fillAgentPlan, prepareAgentPlan, runChecksOf } from './agentFill';
