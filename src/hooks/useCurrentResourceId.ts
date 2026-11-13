import { useCurrentResourceId as useUnifiedCurrentResourceId } from '@/services/hooks/useUnifiedAuth';

/**
 * Get the current user's resource_id
 *
 * @deprecated Use useCurrentResourceId from '@/services/hooks/useUnifiedAuth' directly
 * This hook is maintained for backward compatibility with existing components
 * that expect { data, isLoading } format instead of { resourceId, isLoading }
 */
export function useCurrentResourceId() {
  const { resourceId, isLoading, error } = useUnifiedCurrentResourceId();

  // Return in TanStack Query-like format for backward compatibility
  return {
    data: resourceId,
    isLoading,
    error,
    isError: !!error,
    isSuccess: !isLoading && !error && resourceId !== null,
  };
}
