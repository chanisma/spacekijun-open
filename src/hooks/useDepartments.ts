// ========================================
// Department Management Hook
// Centralized hook for fetching and managing departments
// ========================================

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ----------------------------------------
// Types
// ----------------------------------------

export type DepartmentSource = 'database' | 'events' | 'default' | 'both';

export interface Department {
  id: string;
  name: string;
  description: string | null;
  category: 'school' | 'simple' | 'custom';
  is_active: boolean;
  display_order: number;
}

export interface UseDepartmentsOptions {
  /** Where to fetch departments from */
  source?: DepartmentSource;
  /** Category filter (only for database source) */
  category?: 'school' | 'simple' | 'custom' | 'all';
  /** Additional custom departments to include */
  additionalDepartments?: string[];
  /** Whether to fetch immediately */
  enabled?: boolean;
  /** Only include active departments */
  activeOnly?: boolean;
}

export interface UseDepartmentsResult {
  /** List of available department names */
  departments: string[];
  /** Full department objects (only available when source is 'database') */
  departmentObjects: Department[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch departments */
  refetch: () => Promise<void>;
}

// ----------------------------------------
// Default Departments (Fallback)
// ----------------------------------------

/**
 * Default school departments list
 * Used as fallback when database is unavailable
 */
export const DEFAULT_DEPARTMENTS = [
  '교무운영부',
  '교육과정부',
  '교육연구부',
  '인성인권부',
  '생활선교부',
  '진로상담부',
  '정보화부',
  '신학년부',
  '1학년부',
  '2학년부',
  '3학년부',
  '어문학부',
  '수리과학부',
  '예능사회부',
  '행정실',
  '국어과',
  '영어과',
  '수학과',
  '과학과',
  '사회과',
  '제2외국어과',
  '체육과',
  '음악과',
  '미술과',
  '정보과',
  '기술가정과',
] as const;

/**
 * Simple department categories for admin use
 */
export const SIMPLE_DEPARTMENTS = [
  '교무',
  '행정',
  '기획',
  '학생',
  '교육과정',
  '연구',
  '기타',
] as const;

// ----------------------------------------
// Hook
// ----------------------------------------

/**
 * Hook for fetching and managing departments
 *
 * @example
 * // Fetch from database (recommended)
 * const { departments } = useDepartments({ source: 'database' });
 *
 * @example
 * // Fetch school departments only
 * const { departments } = useDepartments({ source: 'database', category: 'school' });
 *
 * @example
 * // Use fallback defaults (no async)
 * const { departments } = useDepartments({ source: 'default' });
 */
export function useDepartments(options: UseDepartmentsOptions = {}): UseDepartmentsResult {
  const {
    source = 'database',
    category = 'school',
    additionalDepartments = [],
    enabled = true,
    activeOnly = true,
  } = options;

  const [departmentObjects, setDepartmentObjects] = useState<Department[]>([]);
  const [dynamicDepartments, setDynamicDepartments] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchFromDatabase = async () => {
    try {
      let query = supabase
        .from('department')
        .select('*')
        .order('category', { ascending: true })
        .order('display_order', { ascending: true });

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      if (category !== 'all') {
        query = query.eq('category', category);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      setDepartmentObjects(data || []);
      return data?.map((d) => d.name) || [];
    } catch (err) {
      console.error('부서 목록 로드 실패 (DB):', err);
      // Fallback to default departments on error
      return [...DEFAULT_DEPARTMENTS];
    }
  };

  const fetchFromEvents = async () => {
    try {
      const { data: eventsData, error: fetchError } = await supabase
        .from('work' as any)
        .select('meta')
        .not('meta->department', 'is', null) as any;

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      if (eventsData) {
        const uniqueDepartments = Array.from(
          new Set(
            eventsData
              .map((event: any) => event.meta?.department)
              .filter((dept: any) => dept && typeof dept === 'string')
          )
        ) as string[];
        return uniqueDepartments;
      }
      return [];
    } catch (err) {
      console.error('부서 목록 로드 실패 (Events):', err);
      return [];
    }
  };

  const fetchDepartments = async () => {
    if (source === 'default') {
      // No need to fetch, just use defaults
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let dbDepartments: string[] = [];
      let eventDepartments: string[] = [];

      if (source === 'database' || source === 'both') {
        dbDepartments = await fetchFromDatabase();
      }

      if (source === 'events' || source === 'both') {
        eventDepartments = await fetchFromEvents();
      }

      // Combine if 'both'
      if (source === 'both') {
        setDynamicDepartments(Array.from(new Set([...dbDepartments, ...eventDepartments])));
      } else if (source === 'database') {
        setDynamicDepartments(dbDepartments);
      } else if (source === 'events') {
        setDynamicDepartments(eventDepartments);
      }
    } catch (err) {
      console.error('부서 목록 로드 실패:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (enabled && source !== 'default') {
      fetchDepartments();
    }
  }, [enabled, source, category, activeOnly]);

  const departments = useMemo(() => {
    let result: string[] = [];

    switch (source) {
      case 'database':
      case 'events':
      case 'both':
        result = [...dynamicDepartments];
        break;
      case 'default':
      default:
        result = [...DEFAULT_DEPARTMENTS];
        break;
    }

    // Add any additional departments
    if (additionalDepartments.length > 0) {
      result = Array.from(new Set([...result, ...additionalDepartments]));
    }

    // Sort by display order if we have objects, otherwise alphabetically
    if (source === 'database' && departmentObjects.length > 0) {
      // Use the order from database
      return result;
    }

    // Sort alphabetically (Korean sorting)
    return result.sort((a, b) => a.localeCompare(b, 'ko'));
  }, [source, dynamicDepartments, additionalDepartments, departmentObjects]);

  return {
    departments,
    departmentObjects,
    isLoading,
    error,
    refetch: fetchDepartments,
  };
}

/**
 * Simple hook that returns only default departments (no async)
 */
export function useDefaultDepartments(): string[] {
  return [...DEFAULT_DEPARTMENTS];
}

/**
 * Simple hook that returns only simple department categories
 */
export function useSimpleDepartments(): string[] {
  return [...SIMPLE_DEPARTMENTS];
}

/**
 * Hook for fetching school departments from database
 */
export function useSchoolDepartments() {
  return useDepartments({ source: 'database', category: 'school' });
}

/**
 * Hook for fetching simple department categories from database
 */
export function useSimpleDepartmentCategories() {
  return useDepartments({ source: 'database', category: 'simple' });
}
