import { User } from '@supabase/supabase-js';

/**
 * Type guard that asserts user is authenticated.
 * Throws an error if user is null/undefined.
 * After calling this, TypeScript knows user is non-null.
 *
 * @example
 * const { user } = useAuth();
 * requireUser(user); // throws if not authenticated
 * // TypeScript now knows user is User, not User | null
 */
export function requireUser(user: User | null | undefined): asserts user is User {
  if (!user) {
    throw new Error('User not authenticated');
  }
}
