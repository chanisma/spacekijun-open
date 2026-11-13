/**
 * localStorage-based caching for similarity analysis results
 * Stores similarity calculations to avoid redundant computations
 */

import { Student } from '../types';

interface CachedSimilarityResult {
  autonomousAnalysis: any[];
  clubAnalysis: any[];
  careerAnalysis: any[];
  remarksAnalysis: any[];
  intraAnalysis?: any[]; // Cached result for Intra-Student Analysis
  timestamp: number;
  studentId: string;
  studentHash: string; // Hash of student data to detect changes
  allStudentsHash: string; // Hash of all students to detect data changes
}

const CACHE_KEY_PREFIX = 'similarity_cache_';
const CACHE_VERSION = 'v1';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a simple hash from object data
 */
function generateHash(data: any): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Get cache key for a student
 */
function getCacheKey(studentId: string): string {
  return `${CACHE_KEY_PREFIX}${CACHE_VERSION}_${studentId}`;
}

/**
 * Check if cached data is still valid
 */
function isCacheValid(cached: CachedSimilarityResult, currentStudentHash: string, currentAllStudentsHash: string): boolean {
  const now = Date.now();
  const age = now - cached.timestamp;

  // Check expiry
  if (age > CACHE_EXPIRY_MS) {
    return false;
  }

  // Check if student data changed
  if (cached.studentHash !== currentStudentHash) {
    return false;
  }

  // Check if other students' data changed
  if (cached.allStudentsHash !== currentAllStudentsHash) {
    return false;
  }

  return true;
}

/**
 * Save similarity results to localStorage
 */
export function saveSimilarityCache(
  studentId: string,
  student: Student,
  allStudents: Student[],
  results: {
    autonomousAnalysis: any[];
    clubAnalysis: any[];
    careerAnalysis: any[];
    remarksAnalysis: any[];
    intraAnalysis?: any[];
  }
): void {
  try {
    const studentHash = generateHash({
      id: student.id,
      sections5: student.section5_creative_activities,
      section6: student.section6_academic_development,
      section8: student.section8_behavior_characteristics
    });

    const allStudentsHash = generateHash(
      allStudents.map(s => ({
        id: s.id,
        sections5: s.section5_creative_activities,
        section6: s.section6_academic_development,
        section8: s.section8_behavior_characteristics
      }))
    );

    const cacheData: CachedSimilarityResult = {
      ...results,
      timestamp: Date.now(),
      studentId,
      studentHash,
      allStudentsHash
    };

    const cacheKey = getCacheKey(studentId);
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));

    // Log cache save for debugging
    console.log(`[Similarity Cache] Saved cache for student ${studentId}`);
  } catch (error) {
    // Handle localStorage quota exceeded or other errors
    console.warn('[Similarity Cache] Failed to save cache:', error);
    // Try to clear old caches
    clearOldCaches();
  }
}

/**
 * Load similarity results from localStorage
 */
export function loadSimilarityCache(
  studentId: string,
  student: Student,
  allStudents: Student[]
): {
  autonomousAnalysis: any[];
  clubAnalysis: any[];
  careerAnalysis: any[];
  remarksAnalysis: any[];
  intraAnalysis?: any[];
} | null {
  try {
    const cacheKey = getCacheKey(studentId);
    const cachedStr = localStorage.getItem(cacheKey);

    if (!cachedStr) {
      console.log(`[Similarity Cache] No cache found for student ${studentId}`);
      return null;
    }

    const cached: CachedSimilarityResult = JSON.parse(cachedStr);

    const studentHash = generateHash({
      id: student.id,
      sections5: student.section5_creative_activities,
      section6: student.section6_academic_development,
      section8: student.section8_behavior_characteristics
    });

    const allStudentsHash = generateHash(
      allStudents.map(s => ({
        id: s.id,
        sections5: s.section5_creative_activities,
        section6: s.section6_academic_development,
        section8: s.section8_behavior_characteristics
      }))
    );

    if (!isCacheValid(cached, studentHash, allStudentsHash)) {
      console.log(`[Similarity Cache] Cache invalid for student ${studentId} (data changed or expired)`);
      // Remove invalid cache
      localStorage.removeItem(cacheKey);
      return null;
    }

    const age = Date.now() - cached.timestamp;
    console.log(`[Similarity Cache] Cache hit for student ${studentId} (age: ${Math.round(age / 1000 / 60)}min)`);

    return {
      autonomousAnalysis: cached.autonomousAnalysis,
      clubAnalysis: cached.clubAnalysis,
      careerAnalysis: cached.careerAnalysis,
      remarksAnalysis: cached.remarksAnalysis,
      intraAnalysis: cached.intraAnalysis
    };
  } catch (error) {
    console.warn('[Similarity Cache] Failed to load cache:', error);
    return null;
  }
}

/**
 * Clear cache for a specific student
 */
export function clearSimilarityCache(studentId: string): void {
  const cacheKey = getCacheKey(studentId);
  localStorage.removeItem(cacheKey);
  console.log(`[Similarity Cache] Cleared cache for student ${studentId}`);
}

/**
 * Clear all similarity caches
 */
export function clearAllSimilarityCaches(): void {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith(CACHE_KEY_PREFIX)) {
      localStorage.removeItem(key);
    }
  });
  console.log('[Similarity Cache] Cleared all caches');
}

/**
 * Clear old/expired caches to free up space
 */
export function clearOldCaches(): void {
  const keys = Object.keys(localStorage);
  const now = Date.now();
  let clearedCount = 0;

  keys.forEach(key => {
    if (key.startsWith(CACHE_KEY_PREFIX)) {
      try {
        const cachedStr = localStorage.getItem(key);
        if (cachedStr) {
          const cached: CachedSimilarityResult = JSON.parse(cachedStr);
          const age = now - cached.timestamp;

          if (age > CACHE_EXPIRY_MS) {
            localStorage.removeItem(key);
            clearedCount++;
          }
        }
      } catch (error) {
        // Remove corrupted cache entries
        localStorage.removeItem(key);
        clearedCount++;
      }
    }
  });

  if (clearedCount > 0) {
    console.log(`[Similarity Cache] Cleared ${clearedCount} old/invalid cache entries`);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  totalCaches: number;
  totalSize: number;
  oldestCache: number | null;
  newestCache: number | null;
} {
  const keys = Object.keys(localStorage);
  let totalCaches = 0;
  let totalSize = 0;
  let oldestTimestamp: number | null = null;
  let newestTimestamp: number | null = null;

  keys.forEach(key => {
    if (key.startsWith(CACHE_KEY_PREFIX)) {
      totalCaches++;
      const value = localStorage.getItem(key);
      if (value) {
        totalSize += value.length;

        try {
          const cached: CachedSimilarityResult = JSON.parse(value);
          if (!oldestTimestamp || cached.timestamp < oldestTimestamp) {
            oldestTimestamp = cached.timestamp;
          }
          if (!newestTimestamp || cached.timestamp > newestTimestamp) {
            newestTimestamp = cached.timestamp;
          }
        } catch (error) {
          // Ignore parse errors
        }
      }
    }
  });

  return {
    totalCaches,
    totalSize,
    oldestCache: oldestTimestamp,
    newestCache: newestTimestamp
  };
}
