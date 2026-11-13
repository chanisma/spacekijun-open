import { supabase } from '@/integrations/supabase/client';

export interface SubmissionRequirement {
  id: string;
  title: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  upload_status: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

class DocumentSubmissionService {
  /**
   * Get basic meeting information for document submission
   */
  async getMeetingInfo(meetingId: string): Promise<{
    title: string;
    description?: string;
    deadline: string;
    required_files: SubmissionRequirement[];
    related_links: string[];
  } | null> {
    try {
      const { data: meeting, error } = await supabase
        .from('meeting')
        .select('meta, ends_at')
        .eq('id', meetingId)
        .eq('kind', 'document_submission')
        .single();

      if (error || !meeting) {
        console.error('Error fetching meeting info:', error);
        return null;
      }

      const meta = meeting.meta as {
        title?: string;
        description?: string;
        required_files?: SubmissionRequirement[];
        related_links?: string[];
      };
      return {
        title: meta?.title || 'Document Submission',
        description: meta?.description,
        deadline: meeting.ends_at,
        required_files: meta?.required_files || [],
        related_links: meta?.related_links || []
      };

    } catch (error) {
      console.error('Error fetching meeting info:', error);
      return null;
    }
  }

  /**
   * Get participant count for a meeting (for display purposes)
   * Uses meeting.meta.assignee object keys count
   */
  async getParticipantCount(meetingId: string): Promise<number> {
    try {
      const { data: meeting, error } = await supabase
        .from('meeting')
        .select('meta')
        .eq('id', meetingId)
        .single();

      if (error) {
        console.error('Error fetching meeting:', error);
        return 0;
      }

      const assignee = (meeting?.meta as any)?.assignee || {};
      return typeof assignee === 'object' ? Object.keys(assignee).length : 0;

    } catch (error) {
      console.error('Error fetching participant count:', error);
      return 0;
    }
  }

  /**
   * Download template file from storage
   */
  async downloadTemplateFile(storagePath: string, fileName: string): Promise<void> {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(storagePath);

      if (error) {
        throw error;
      }

      // Create download link
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading template file:', error);
      throw error;
    }
  }
}

export const documentSubmissionService = new DocumentSubmissionService();