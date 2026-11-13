// Action Spec 엔진 공개 표면.
// 일반화 원칙: 이 디렉터리의 코드에는 특정 양식의 라벨·더미 이름·행 수 등
// 문서 고유 지식을 두지 않는다. 그런 정보는 전부 스펙 인스턴스(JSON)에 있다.
export * from './types';
export { parseHwpxSection, applyEdits, decodeEntities, escapeXml, rawSectionText } from './hwpxIndex';
export { resolveLocator, resolvedRegionText } from './locator';
export { evaluateFormula, makeResolver, toNum } from './formula';
export { collectRegionExamples, collectRowProseColumns, type RowProseColumn, fillDocument, type FillInput, type FillOutput, type ProseGenerator } from './engine';
export { verifyDocument, retryableTargets, type VerifyInput } from './verify';
export { buildSpecBundle, type SpecBundle, type SpecBundleMeta, type SpecBundleTarget } from './bundle';
export { blankPlanRow, derivePlanSchema, describeMissingInput, isEmptyPlanValue, missingPlanInputs, mergePlanWithUserValues, normalizePlan, normalizeSpecPlanKeys, planSchemaPrompt, rowAddCapacity, validatePlan, type PlanFieldSchema } from './planSchema';
export { detectSpecDraft, deriveChoiceOptions, DEFAULT_CONVENTIONS, type DetectConventions, type DetectResult } from './detect';
export { generatePlan, generatePlanChunked, generateRowProseColumn, makeLlmProseGenerator, classifyBlocks, logSpecFillIssue, splitSeedRows, suggestContextExample, suggestTargetMeta, parseJsonResponse, type ChatFn, type TargetMetaSuggestion } from './llm';
export { resolveKnowledge, type DbFetch, type KnowledgeAdapters, type KnowledgeResult } from './knowledge';
export {
  DEFAULT_SPEC_FILL_MODE, fabricationRule, fabricationRuleProse, outputContract, resolvePrompt,
  type PromptDialect, type PromptText, type SpecFillMode,
} from './promptMode';
export {
  DEFAULT_SPEC_FILL_OPTIONS, DEFAULT_USE_REGION_EXAMPLES, resolveSpecFillOptions,
  type SpecFillOptions,
} from './specFillOptions';
