/**
 * TanStack Query hook for AI card generation (공용 aiChat — srsAiService 참고).
 */

import { useMutation } from '@tanstack/react-query';
import { generateCards, toCreateCardParams } from '../services/srsAiService';
import { useBulkCreateCards } from './useSrsCards';

interface AiGenerateParams {
  subjectId: string;
  subjectName: string;
  topic: string;
  count?: number;
}

/**
 * Hook for AI card generation + bulk insert flow.
 *
 * Usage:
 *   const { mutateAsync: generate } = useSrsAiGenerate();
 *   const cards = await generate({ subjectId, subjectName, topic, count: 10 });
 *
 * Returns the generated cards for preview before saving,
 * or auto-saves if saveImmediately is true.
 */
export function useSrsAiGenerate() {
  return useMutation({
    mutationFn: async (params: AiGenerateParams) => {
      const generated = await generateCards(
        params.subjectName,
        params.topic,
        params.count ?? 10
      );

      return {
        generatedCards: generated,
        createParams: toCreateCardParams(params.subjectId, generated),
      };
    },
  });
}

/**
 * Hook that generates AND saves cards in one step.
 */
export function useSrsAiGenerateAndSave() {
  const bulkCreate = useBulkCreateCards();

  return useMutation({
    mutationFn: async (params: AiGenerateParams) => {
      const generated = await generateCards(
        params.subjectName,
        params.topic,
        params.count ?? 10
      );

      const createParams = toCreateCardParams(params.subjectId, generated);
      const savedCards = await bulkCreate.mutateAsync(createParams);

      return { generated, savedCards };
    },
  });
}
