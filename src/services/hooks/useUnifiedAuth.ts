/**
 * React hooks for unified authentication
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { unifiedAuth, AuthenticatedUser, ResourceId } from '../unifiedAuth';

/**
 * Hook to get current authenticated user with resource information
 */
export const useUnifiedAuth = () => {
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['unifiedAuth', 'currentUser'],
    queryFn: () => unifiedAuth.getCurrentUser(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: (previousData) => previousData, // Prevent null flash during refetch
  });

  // Listen to auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          unifiedAuth.clearCache();
          queryClient.setQueryData(['unifiedAuth', 'currentUser'], null);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          refetch();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [queryClient, refetch]);

  // Handle visibility change: refetch user data when returning to tab
  // NOTE: Do NOT call unifiedAuth.clearCache() here — it sets currentUser=null
  // synchronously, causing a race condition where resourceId becomes null during
  // the async refetch, which disables permission queries and hides edit/delete buttons.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ Tab visible - refetching user (preserving cache during refetch)');
        refetch();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refetch]);

  return {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
    refetch
  };
};

/**
 * Hook to get current user's primary resource ID
 * Use this instead of user.id for business data operations
 */
export const useCurrentResourceId = (): {
  resourceId: ResourceId | null;
  isLoading: boolean;
  error: Error | null;
} => {
  const { user, isLoading, error } = useUnifiedAuth();

  return {
    resourceId: user?.primaryResource.id || null,
    isLoading,
    error
  };
};

/**
 * Hook to check if current user can act as a specific resource
 */
export const useCanActAsResource = (resourceId: ResourceId | null) => {
  const { user } = useUnifiedAuth();

  return useQuery({
    queryKey: ['unifiedAuth', 'canActAsResource', resourceId],
    queryFn: async () => {
      if (!resourceId) return false;
      return await unifiedAuth.canActAsResource(resourceId);
    },
    enabled: !!resourceId && !!user,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

/**
 * Hook for resource-based operations
 * Provides consistent interface for all business operations
 */
export const useResourceOperations = () => {
  const { user } = useUnifiedAuth();
  const { resourceId } = useCurrentResourceId();

  const createWithCurrentResource = async <T extends Record<string, any>>(
    table: string,
    data: Omit<T, 'created_by'>
  ): Promise<T | null> => {
    if (!resourceId) {
      throw new Error('No resource ID available for current user');
    }

    // All tables now use resource ID for created_by field
    const createdBy = resourceId;

    if (!createdBy) {
      throw new Error(`No resource ID available for current user`);
    }


    const { data: result, error } = await (supabase as any)
      .from(table)
      .insert([{
        ...data,
        created_by: createdBy,
        creator: createdBy  // Backward compatibility for new schema
      }])
      .select()
      .single();

    if (error) {
      console.error(`Failed to create ${table}:`, error);
      console.error('Insert data:', { ...data, created_by: createdBy });
      
      throw error;
    }

    return result as T;
  };

  const updateOwnedByResource = async <T extends Record<string, any>>(
    table: string,
    id: string,
    data: Partial<T>
  ): Promise<T | null> => {
    if (!resourceId) {
      throw new Error('No resource ID available for current user');
    }

    // All tables now use resource ID for created_by field
    const ownerId = resourceId;
    
    if (!ownerId) {
      throw new Error(`No resource ID available for current user`);
    }

    const { data: result, error } = await (supabase as any)
      .from(table)
      .update(data)
      .eq('id', id)
      .or(`created_by.eq.${ownerId},creator.eq.${ownerId}`)
      .select()
      .single();

    if (error) {
      console.error(`Failed to update ${table}:`, error);
      throw error;
    }

    return result as T;
  };

  const deleteOwnedByResource = async (
    table: string,
    id: string
  ): Promise<boolean> => {
    if (!resourceId) {
      throw new Error('No resource ID available for current user');
    }

    // All tables now use resource ID for created_by field
    const ownerId = resourceId;
    
    if (!ownerId) {
      throw new Error(`No resource ID available for current user`);
    }

    const { error, count } = await (supabase as any)
      .from(table)
      .delete()
      .eq('id', id)
      .or(`created_by.eq.${ownerId},creator.eq.${ownerId}`)
      .select();

    if (error) {
      console.error(`Failed to delete from ${table}:`, error);
      throw error;
    }

    if (count === 0) {
      throw new Error(`No records found to delete in ${table} for ID ${id}`);
    }

    return true;
  };

  const canModify = async (
    table: string,
    id: string
  ): Promise<boolean> => {
    if (!resourceId) return false;

    try {
      const { data, error } = await (supabase as any)
        .from(table)
        .select('created_by, creator')
        .eq('id', id)
        .single();

      // If error or no data, user cannot modify (record doesn't exist or no access)
      if (error || !data) return false;
      
      // Check both created_by and creator fields for backward compatibility
      return (data as any)?.created_by === resourceId || (data as any)?.creator === resourceId;
    } catch (error) {
      // Catch any unexpected errors and return false
      console.warn(`canModify check failed for ${table}:${id}:`, error);
      return false;
    }
  };

  return {
    resourceId,
    user,
    createWithCurrentResource,
    updateOwnedByResource,
    deleteOwnedByResource,
    canModify,
    isReady: !!resourceId
  };
};

/**
 * Development helper hook to detect mixed ID usage
 */
export const useIdConsistencyCheck = (enable = false) => {
  const { user } = useUnifiedAuth();

  useEffect(() => {
    if (!enable || !user) return;

    // Override console.warn to detect mixed ID usage
    const originalWarn = console.warn;
    console.warn = (...args) => {
      const message = args.join(' ');
      if (message.includes('user.id') && message.includes('resource')) {
        console.error('🚨 MIXED ID USAGE DETECTED:', ...args);
        console.trace('Call stack:');
      }
      originalWarn(...args);
    };

    return () => {
      console.warn = originalWarn;
    };
  }, [enable, user]);
};