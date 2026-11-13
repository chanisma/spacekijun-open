import { useQuery } from '@tanstack/react-query';
import { listTagDefinitions } from '../services/rescueTag';

export function useTagDefinitions() {
  return useQuery({
    queryKey: ['rescue-note', 'tag-definitions'],
    queryFn: listTagDefinitions,
    staleTime: 10 * 60 * 1000,
  });
}
