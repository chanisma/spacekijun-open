import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TaskAssignee } from '@/types/tasks';

export function useEnrichedAssignees(assignees: TaskAssignee[]) {
  const [enrichedAssignees, setEnrichedAssignees] = useState<TaskAssignee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const enrichAssigneesWithNames = async () => {
      if (!assignees || assignees.length === 0) {
        setEnrichedAssignees([]);
        setLoading(false);
        return;
      }

      // Filter out assignees with invalid data
      const validAssignees = assignees.filter(assignee =>
        assignee && typeof assignee === 'object' && assignee.id
      );

      if (validAssignees.length === 0) {
        setEnrichedAssignees([]);
        setLoading(false);
        return;
      }

      try {
        // Get assignee details from resource table
        const assigneeIds = validAssignees.map(a => a.id);
        const { data: resources, error } = await supabase
          .from('resource')
          .select('id, name, type')
          .in('id', assigneeIds);

        if (error) {
          console.error('Error fetching resource names:', error);
          // Use fallback names
          const fallbackAssignees = validAssignees.map(assignee => ({
            ...assignee,
            name: assignee.name || `User-${assignee.id.slice(0, 8)}`
          }));
          setEnrichedAssignees(fallbackAssignees);
        } else {
          // Merge assignee status with resource details
          const enriched = validAssignees.map(assignee => {
            const resource = resources?.find(r => r.id === assignee.id);
            return {
              ...assignee,
              name: resource?.name || assignee.name || `User-${assignee.id.slice(0, 8)}`,
              type: resource?.type || assignee.type || 'unknown'
            } as TaskAssignee;
          });
          setEnrichedAssignees(enriched);
        }
      } catch (error) {
        console.error('Error enriching assignees:', error);
        // Use fallback names
        const fallbackAssignees = validAssignees.map(assignee => ({
          ...assignee,
          name: assignee.name || `User-${assignee.id.slice(0, 8)}`
        }));
        setEnrichedAssignees(fallbackAssignees);
      } finally {
        setLoading(false);
      }
    };

    enrichAssigneesWithNames();
  }, [assignees]);

  return { enrichedAssignees, loading };
}