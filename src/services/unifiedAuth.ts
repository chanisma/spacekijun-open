/**
 * Unified Authentication Service
 * Provides consistent resource-based identity management
 */

import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

// Type-safe ID system
export type ResourceId = string & { readonly __brand: 'ResourceId' };
export type ProfileId = string & { readonly __brand: 'ProfileId' };

export interface Resource {
  id: ResourceId;
  type: 'teacher' | 'student' | 'room' | 'device' | 'group';
  name: string;
  status: 'active' | 'graduated' | 'transferred' | 'withdrawn';
  meta: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface UserResourceMapping {
  user_id: ProfileId;
  resource_id: ResourceId;
  created_at: string;
}

export interface AuthenticatedUser {
  profile: User;
  primaryResource: Resource;
  allResources: Resource[];
}

class UnifiedAuthService {
  private currentUser: AuthenticatedUser | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5분 TTL

  /**
   * Get current authenticated user with their primary resource
   */
  async getCurrentUser(): Promise<AuthenticatedUser | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const now = Date.now();

      // 캐시 유효성 체크: 사용자 ID + TTL 확인
      const isCacheValid =
        this.currentUser?.profile.id === user.id &&
        this.cacheTimestamp > 0 &&
        (now - this.cacheTimestamp) < this.CACHE_TTL;

      if (isCacheValid) {
        console.log('✅ Using valid cached user data');
        return this.currentUser;
      }

      if (this.currentUser?.profile.id === user.id) {
        console.log('🔄 Cache expired, refreshing user data');
      }

      const userResources = await this.getUserResources(user.id as ProfileId, user.email);
      if (userResources.length === 0) {
        console.warn(`No resource mapping found for user ${user.id}`);
        return null;
      }

      this.currentUser = {
        profile: user,
        primaryResource: userResources[0], // First resource as primary
        allResources: userResources
      };
      this.cacheTimestamp = now; // 캐시 타임스탬프 갱신

      return this.currentUser;
    } catch (error) {
      console.error('Failed to get current user:', error);
      return null;
    }
  }

  /**
   * Get primary resource ID for current user
   * This should be used instead of user.id for business data
   */
  async getCurrentResourceId(): Promise<ResourceId | null> {
    const user = await this.getCurrentUser();
    return user?.primaryResource.id || null;
  }

  /**
   * Get all resources associated with a user
   *
   * Students bypass the `user_resource` junction table entirely — bulk roster
   * imports create `resource` rows (type=student) but never a matching
   * `user_resource` link, and there's no student-facing UI to create one
   * (ProfileEditDialog's auto-connect is teacher-only). Instead of requiring
   * that link, students resolve directly via the codebase's existing identity
   * pattern: student_basic_info.id = resource.meta->>'id' = profiles.email prefix.
   */
  async getUserResources(userId: ProfileId, email?: string | null): Promise<Resource[]> {
    const { data, error } = await supabase
      .from('user_resource')
      .select(`
        resource:user_resource_resource_id_fkey (
          id,
          type,
          name,
          status,
          meta,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to fetch user resources:', error);
      return [];
    }

    const resources = ((data as any) || [])
      .map((item: any) => item.resource)
      .filter((resource: any) =>
        resource !== null &&
        (resource.type !== 'student' || resource.status === 'active')
      ) as Resource[];

    if (resources.length > 0) return resources;

    const studentCode = email?.split('@')[0];
    if (!studentCode) return [];

    const { data: studentResource, error: studentError } = await supabase
      .from('resource')
      .select('id, type, name, status, meta, created_at, updated_at')
      .eq('type', 'student')
      .eq('status', 'active')
      .eq('meta->>id', studentCode)
      .maybeSingle();

    if (studentError || !studentResource) return [];

    return [studentResource as Resource];
  }

  /**
   * Check if current user can act as a specific resource
   */
  async canActAsResource(resourceId: ResourceId): Promise<boolean> {
    const user = await this.getCurrentUser();
    if (!user) return false;

    return user.allResources.some(resource => resource.id === resourceId);
  }

  /**
   * Create resource for a user (admin function)
   */
  async createUserResource(
    userId: ProfileId,
    resourceData: Omit<Resource, 'id' | 'created_at' | 'updated_at'>
  ): Promise<Resource | null> {
    try {
      // Create resource
      const { data: resource, error: resourceError } = await supabase
        .from('resource')
        .insert([resourceData])
        .select()
        .single();

      if (resourceError) {
        console.error('Failed to create resource:', resourceError);
        return null;
      }

      // Create user-resource mapping
      const { error: mappingError } = await supabase
        .from('user_resource')
        .insert([{
          user_id: userId,
          resource_id: resource.id
        }]);

      if (mappingError) {
        console.error('Failed to create user-resource mapping:', mappingError);

        // Cleanup: delete created resource
        await supabase
          .from('resource')
          .delete()
          .eq('id', resource.id);

        return null;
      }

      return resource as Resource;
    } catch (error) {
      console.error('Failed to create user resource:', error);
      return null;
    }
  }

  /**
   * Find resource by user email (for migration/admin purposes)
   */
  async findResourceByUserEmail(email: string): Promise<Resource | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        user_resource (
          resource:user_resource_resource_id_fkey (
            id,
            type,
            name,
            status,
            meta,
            created_at,
            updated_at
          )
        )
      `)
      .eq('email', email)
      .single();

    if (error || !data) {
      return null;
    }

    const userResource = (data as any).user_resource?.[0]?.resource;
    return (userResource as any) as Resource || null;
  }

  /**
   * Clear cached user data (call on logout)
   */
  clearCache(): void {
    this.currentUser = null;
    this.cacheTimestamp = 0; // 타임스탬프도 초기화
  }

  /**
   * Migration helper: Get or create resource for current user
   */
  async getOrCreateResourceForCurrentUser(): Promise<Resource | null> {
    const user = await this.getCurrentUser();
    if (user) return user.primaryResource;

    // Try to create resource if user exists but has no resource
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (!profile) return null;

    // Determine resource type based on email pattern
    const emailPrefix = (profile.email || '').split('@')[0];
    const isStudent = /^\d{2}-/.test(emailPrefix);
    const resourceType = isStudent ? 'student' : 'teacher';
    const defaultName = isStudent ? 'Unknown Student' : 'Unknown Teacher';

    return await this.createUserResource(
      authUser.id as ProfileId,
      {
        type: resourceType,
        name: profile.name || profile.email || defaultName,
        status: 'active',
        meta: {
          email: profile.email,
          auto_created: true,
          source: 'migration'
        }
      }
    );
  }
  /**
   * Get full user profile with resource ID and related data
   * Optimized to reduce multiple DB calls
   */
  async getFullUserProfile(userId: string): Promise<{ profile: any, resourceId: ResourceId | null } | null> {
    try {
      // Fetch profile
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') { // PGRST116 is "No rows found"
          console.error('Error fetching full user profile:', error);
        }
        return null;
      }

      // Fetch resource ID (separate query is often cleaner/as fast as complex join if indexed)
      const { data: userResource } = await supabase
        .from('user_resource')
        .select('resource_id')
        .eq('user_id', userId)
        .maybeSingle();

      let resourceId = userResource?.resource_id as ResourceId || null;

      // Students have no user_resource link (see getUserResources) — fall back
      // to the email-prefix identity match.
      if (!resourceId) {
        const studentCode = (profile.email as string | null)?.split('@')[0];
        if (studentCode) {
          const { data: studentResource } = await supabase
            .from('resource')
            .select('id')
            .eq('type', 'student')
            .eq('meta->>id', studentCode)
            .maybeSingle();
          resourceId = (studentResource?.id as ResourceId) || null;
        }
      }

      return {
        profile,
        resourceId
      };
    } catch (error) {
      console.error('Unexpected error in getFullUserProfile:', error);
      return null;
    }
  }

  /**
   * Update user login statistics
   */
  async updateLoginStats(userId: string, currentVisitCount: number): Promise<void> {
    try {
      await supabase
        .from('profiles')
        .update({
          last_login: new Date().toISOString(),
          is_first_login: false,
          visit_count: currentVisitCount + 1
        })
        .eq('id', userId);
    } catch (error) {
      console.warn('Failed to update login stats:', error);
    }
  }

  /**
   * Validate if an email is eligible for login/registration
   * Centralizes the validation logic
   */
  validateLoginEmail(email: string): void {
    const emailPrefix = email.split('@')[0];
    const emailDomain = email.split('@')[1];

    // Student accounts (##- format) are now allowed to login
    // Role is determined by DB trigger based on email pattern

    // Check for kijungpt account pattern
    if (emailPrefix.toLowerCase().startsWith('kijungpt')) {
      throw new Error(`'kijungpt'로 시작하는 아이디(${emailPrefix})는 로그인할 수 없습니다.`);
    }

    // Domain validation - Strictly enforce myschool.hs.kr
    if (emailDomain !== 'myschool.hs.kr') {
      throw new Error(`학교 계정(@myschool.hs.kr)으로만 로그인할 수 있습니다. 현재 계정: ${email}`);
    }
  }
}

// Singleton instance
export const unifiedAuth = new UnifiedAuthService();

// React hooks for convenient usage
export { useUnifiedAuth } from './hooks/useUnifiedAuth';

// Helper functions
export const toResourceId = (id: string): ResourceId => id as ResourceId;
export const toProfileId = (id: string): ProfileId => id as ProfileId;

// Type guards
export const isResourceId = (id: string): id is ResourceId => {
  // Add validation logic if needed
  return typeof id === 'string' && id.length > 0;
};

export const isProfileId = (id: string): id is ProfileId => {
  // Add validation logic if needed
  return typeof id === 'string' && id.length > 0;
};
