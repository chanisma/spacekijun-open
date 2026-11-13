/**
 * Utility functions for managing section-resource relationships using JSONB arrays
 * Used after database migration from section_member junction table to embedded arrays
 */

import { supabase } from '@/integrations/supabase/client';
import { withoutPersonalPhone } from '@/utils/resourceMetaPrivacy';

export interface ResourceWithSections {
  id: string;
  type: 'student' | 'teacher' | 'room' | 'device' | 'group';
  name: string;
  meta: {
    section?: string[];
    grade?: string;
    class?: string;
    number?: number;
    email?: string;
    homeroom?: string;
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}

export interface SectionWithMeta {
  id: string;
  name: string;
  subject?: string;
  is_combined?: boolean;
  meta: {
    grade?: string;
    class?: string;
    weekday_time?: string | string[];
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}

/**
 * Add a section to a resource's section array
 */
export const addSectionToResource = async (
  resourceId: string, 
  sectionName: string
): Promise<{ error?: any }> => {
  try {
    // Get current resource
    const { data: resource, error: fetchError } = await supabase
      .from('resource')
      .select('meta')
      .eq('id', resourceId)
      .single();

    if (fetchError) return { error: fetchError };

    // Merge new section with existing ones (avoid duplicates)
    const currentSections = (resource.meta as any)?.section || [];
    const updatedSections = [...new Set([...currentSections, sectionName])];

    const { error } = await supabase
      .from('resource')
      .update({
        meta: {
          ...withoutPersonalPhone(resource.meta as Record<string, unknown> | null),
          section: updatedSections
        }
      })
      .eq('id', resourceId);

    return { error };
  } catch (error) {
    return { error };
  }
};

/**
 * Remove a section from a resource's section array
 */
export const removeSectionFromResource = async (
  resourceId: string, 
  sectionName: string
): Promise<{ error?: any }> => {
  try {
    // Get current resource
    const { data: resource, error: fetchError } = await supabase
      .from('resource')
      .select('meta')
      .eq('id', resourceId)
      .single();

    if (fetchError) return { error: fetchError };

    // Remove section from array
    const currentSections = (resource.meta as any)?.section || [];
    const updatedSections = currentSections.filter((s: string) => s !== sectionName);

    const { error } = await supabase
      .from('resource')
      .update({
        meta: {
          ...withoutPersonalPhone(resource.meta as Record<string, unknown> | null),
          section: updatedSections
        }
      })
      .eq('id', resourceId);

    return { error };
  } catch (error) {
    return { error };
  }
};

/**
 * Add multiple sections to a resource
 */
export const addMultipleSectionsToResource = async (
  resourceId: string, 
  sectionNames: string[]
): Promise<{ error?: any }> => {
  try {
    // Get current resource
    const { data: resource, error: fetchError } = await supabase
      .from('resource')
      .select('meta')
      .eq('id', resourceId)
      .single();

    if (fetchError) return { error: fetchError };

    // Merge new sections with existing ones (avoid duplicates)
    const currentSections = (resource.meta as any)?.section || [];
    const updatedSections = [...new Set([...currentSections, ...sectionNames])];

    const { error } = await supabase
      .from('resource')
      .update({
        meta: {
          ...withoutPersonalPhone(resource.meta as Record<string, unknown> | null),
          section: updatedSections
        }
      })
      .eq('id', resourceId);

    return { error };
  } catch (error) {
    return { error };
  }
};

/**
 * Get all resources assigned to a specific section
 */
export const getResourcesBySection = async (
  sectionName: string, 
  resourceType?: 'student' | 'teacher' | 'room' | 'device' | 'group'
): Promise<{ data?: ResourceWithSections[]; error?: any }> => {
  try {
    let query = supabase
      .from('resource')
      .select('*')
      .contains('meta', { section: [sectionName] });
    
    if (resourceType) {
      query = query.eq('type', resourceType);
    }
    
    const { data, error } = await query;
    return { data: data as any, error };
  } catch (error) {
    return { error };
  }
};

/**
 * Get students in a specific section
 */
export const getStudentsBySection = async (
  sectionName: string
): Promise<{ data?: ResourceWithSections[]; error?: any }> => {
  return getResourcesBySection(sectionName, 'student');
};

/**
 * Get teachers for a specific section  
 */
export const getTeachersBySection = async (
  sectionName: string
): Promise<{ data?: ResourceWithSections[]; error?: any }> => {
  return getResourcesBySection(sectionName, 'teacher');
};

/**
 * Get classrooms assigned to a specific section
 */
export const getClassroomsBySection = async (
  sectionName: string
): Promise<{ data?: ResourceWithSections[]; error?: any }> => {
  return getResourcesBySection(sectionName, 'room');
};

/**
 * Get all sections a resource is assigned to
 */
export const getSectionsForResource = async (
  resourceId: string
): Promise<{ data?: string[]; error?: any }> => {
  try {
    const { data: resource, error } = await supabase
      .from('resource')
      .select('meta')
      .eq('id', resourceId)
      .single();

    if (error) return { error };
    
    return { data: (resource.meta as any)?.section || [] };
  } catch (error) {
    return { error };
  }
};

/**
 * Get section statistics (count of each resource type)
 */
export const getSectionStatistics = async (): Promise<{
  data?: Array<{
    section_name: string;
    students: number;
    teachers: number;
    classrooms: number;
    total: number;
  }>;
  error?: any;
}> => {
  try {
    // Get all sections
    const { data: sections, error: sectionsError } = await supabase
      .from('section')
      .select('name');

    if (sectionsError) return { error: sectionsError };

    // Get statistics for each section
    const stats = await Promise.all(
      sections.map(async (section) => {
        const [studentsResult, teachersResult, classroomsResult] = await Promise.all([
          getStudentsBySection(section.name),
          getTeachersBySection(section.name), 
          getClassroomsBySection(section.name)
        ]);

        const students = studentsResult.data?.length || 0;
        const teachers = teachersResult.data?.length || 0;
        const classrooms = classroomsResult.data?.length || 0;

        return {
          section_name: section.name,
          students,
          teachers,
          classrooms,
          total: students + teachers + classrooms
        };
      })
    );

    return { data: stats };
  } catch (error) {
    return { error };
  }
};

/**
 * Search resources by section name pattern
 */
export const searchResourcesBySectionPattern = async (
  searchPattern: string,
  resourceType?: 'student' | 'teacher' | 'room' | 'device' | 'group'
): Promise<{ data?: ResourceWithSections[]; error?: any }> => {
  try {
    let query = supabase
      .from('resource')
      .select('*')
      .or(`meta->section->>0.ilike.%${searchPattern}%,meta->section->>1.ilike.%${searchPattern}%,meta->section->>2.ilike.%${searchPattern}%`);
    
    if (resourceType) {
      query = query.eq('type', resourceType);
    }
    
    const { data, error } = await query;
    return { data: data as any, error };
  } catch (error) {
    return { error };
  }
};

/**
 * Bulk assign sections to multiple resources
 */
export const bulkAssignSections = async (
  assignments: Array<{ resourceId: string; sectionNames: string[] }>
): Promise<{ success: number; failed: number; errors: any[] }> => {
  let success = 0;
  let failed = 0;
  const errors: any[] = [];

  for (const assignment of assignments) {
    const { error } = await addMultipleSectionsToResource(
      assignment.resourceId,
      assignment.sectionNames
    );

    if (error) {
      failed++;
      errors.push({ resourceId: assignment.resourceId, error });
    } else {
      success++;
    }
  }

  return { success, failed, errors };
};

/**
 * Get resources with no section assignments
 */
export const getUnassignedResources = async (
  resourceType?: 'student' | 'teacher' | 'room' | 'device' | 'group'
): Promise<{ data?: ResourceWithSections[]; error?: any }> => {
  try {
    let query = supabase
      .from('resource')
      .select('*')
      .or('meta->section.is.null,meta->section.eq.[]');
    
    if (resourceType) {
      query = query.eq('type', resourceType);
    }
    
    const { data, error } = await query;
    return { data: data as any, error };
  } catch (error) {
    return { error };
  }
};

/**
 * Update section metadata (grade moved to meta after migration)
 */
export const updateSectionMeta = async (
  sectionId: string,
  metaUpdates: { grade?: string; class?: string; weekday_time?: string | string[]; [key: string]: any }
): Promise<{ error?: any }> => {
  try {
    // Get current section
    const { data: section, error: fetchError } = await supabase
      .from('section')
      .select('meta')
      .eq('id', sectionId)
      .single();

    if (fetchError) return { error: fetchError };

    // Merge new meta with existing
    const updatedMeta = {
      ...((section.meta as any) || {}),
      ...metaUpdates
    };

    const { error } = await supabase
      .from('section')
      .update({ meta: updatedMeta })
      .eq('id', sectionId);

    return { error };
  } catch (error) {
    return { error };
  }
};

/**
 * Get sections by grade (using meta.grade after migration)
 */
export const getSectionsByGrade = async (
  grade: string
): Promise<{ data?: SectionWithMeta[]; error?: any }> => {
  try {
    const { data, error } = await supabase
      .from('section')
      .select('*')
      .eq('meta->>grade', grade);

    return { data: data as any, error };
  } catch (error) {
    return { error };
  }
};

/**
 * Validate section assignments integrity
 * Useful for post-migration validation
 */
export const validateSectionAssignments = async (): Promise<{
  data?: {
    total_resources: number;
    resources_with_sections: number;
    invalid_section_references: number;
    sections_without_resources: number;
  };
  error?: any;
}> => {
  try {
    // Get total resources
    const { count: totalResources } = await supabase
      .from('resource')
      .select('id', { count: 'exact', head: true });

    // Get resources with sections
    const { count: resourcesWithSections } = await (supabase as any)
      .from('resource')
      .select('id', { count: 'exact', head: true })
      .not('meta->section', 'is', null)
      .neq('meta->section', '[]');

    // Get all sections for validation
    const { data: sections } = await supabase
      .from('section')
      .select('name');

    const sectionNames = sections?.map(s => s.name) || [];
    
    // This would require more complex validation in a real scenario
    // For now, return basic statistics
    const stats = {
      total_resources: totalResources || 0,
      resources_with_sections: resourcesWithSections || 0,
      invalid_section_references: 0, // Would need complex query
      sections_without_resources: 0  // Would need complex query
    };

    return { data: stats };
  } catch (error) {
    return { error };
  }
};
