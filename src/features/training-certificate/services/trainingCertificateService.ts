import { supabase } from '@/integrations/supabase/client';
import type {
  TrainingType,
  TrainingCertificate,
  TrainingCertificateWithType,
  TrainingProgress,
} from '../types';

// These tables exist in the database via migration but are not yet regenerated
// in supabase/types.ts — follow project convention of casting the table name.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any;
const TRAINING_TYPES_TABLE = 'training_types' as AnyTable;
const TRAINING_CERTS_TABLE = 'training_certificates' as AnyTable;
const TRAINING_PROGRESS_VIEW = 'training_progress_view' as AnyTable;
const BUCKET = 'training-certificates';

export const trainingCertificateService = {
  async listTrainingTypes(): Promise<TrainingType[]> {
    const { data, error } = await supabase
      .from(TRAINING_TYPES_TABLE)
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as TrainingType[];
  },

  async listMyCertificates(resourceId: string): Promise<TrainingCertificateWithType[]> {
    const { data, error } = await supabase
      .from(TRAINING_CERTS_TABLE)
      .select(`
        *,
        training_type:training_types(id, code, name, category, category_label)
      `)
      .eq('resource_id', resourceId)
      .order('completed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as TrainingCertificateWithType[];
  },

  async listAllCertificates(): Promise<TrainingCertificateWithType[]> {
    const { data, error } = await supabase
      .from(TRAINING_CERTS_TABLE)
      .select(`
        *,
        training_type:training_types(id, code, name, category, category_label),
        teacher:resource!training_certificates_resource_id_fkey(id, name)
      `)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as TrainingCertificateWithType[];
  },

  async getMyProgress(resourceId: string): Promise<TrainingProgress[]> {
    const { data, error } = await supabase
      .from(TRAINING_PROGRESS_VIEW)
      .select('*')
      .eq('resource_id', resourceId);
    if (error) throw error;
    return (data ?? []) as TrainingProgress[];
  },

  async getAllProgress(): Promise<TrainingProgress[]> {
    const { data, error } = await supabase
      .from(TRAINING_PROGRESS_VIEW)
      .select('*');
    if (error) throw error;
    return (data ?? []) as TrainingProgress[];
  },

  async uploadFile(resourceId: string, file: File): Promise<{ path: string; size: number; mime: string }> {
    const ext = file.name.split('.').pop() || 'bin';
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `${resourceId}/${safeName}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;
    return { path, size: file.size, mime: file.type };
  },

  async getFileSignedUrl(path: string, expiresIn = 300): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
    if (error) throw error;
    return data.signedUrl;
  },

  async removeFile(path: string): Promise<void> {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  },

  async createCertificate(payload: Omit<TrainingCertificate,
    'id' | 'submitted_at' | 'created_at' | 'updated_at'>): Promise<TrainingCertificate> {
    const { data, error } = await supabase
      .from(TRAINING_CERTS_TABLE)
      .insert(payload as AnyTable)
      .select('*')
      .single();
    if (error) throw error;
    return data as TrainingCertificate;
  },

  async deleteCertificate(id: string, filePath?: string | null) {
    if (filePath) {
      try { await this.removeFile(filePath); } catch { /* ignore */ }
    }
    const { error } = await supabase
      .from(TRAINING_CERTS_TABLE)
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ---------- Training type management (admin) ----------
  async createTrainingType(input: {
    code: string;
    name: string;
    category: 'annual' | 'multi' | 'special';
    category_label: string;
    required_hours: number;
    unit?: string;
    description?: string | null;
    cycle?: string | null;
    year?: number | null;
    display_order?: number;
  }): Promise<TrainingType> {
    const { data, error } = await supabase
      .from(TRAINING_TYPES_TABLE)
      .insert({
        code: input.code,
        name: input.name,
        category: input.category,
        category_label: input.category_label,
        required_hours: input.required_hours,
        unit: input.unit ?? '시간',
        description: input.description ?? null,
        cycle: input.cycle ?? null,
        year: input.year ?? null,
        display_order: input.display_order ?? 0,
        is_active: true,
      } as AnyTable)
      .select('*')
      .single();
    if (error) throw error;
    return data as TrainingType;
  },

  async updateTrainingType(id: string, patch: Partial<Omit<TrainingType, 'id' | 'created_at' | 'updated_at'>>) {
    // .select() 로 영향받은 행을 받아 0행(권한 부족·잘못된 id)을 silent failure 로
    // 두지 않고 명시적으로 에러 처리한다. RLS 가 UPDATE 를 막으면 에러 없이 0행이
    // 반환되므로, 이 검사가 없으면 "수정됨" 토스트가 떠도 DB 는 안 바뀐다.
    const { data, error } = await supabase
      .from(TRAINING_TYPES_TABLE)
      .update(patch as AnyTable)
      .eq('id', id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('수정 권한이 없거나 대상 연수를 찾을 수 없습니다.');
    }
  },

  async deactivateTrainingType(id: string) {
    const { error } = await supabase
      .from(TRAINING_TYPES_TABLE)
      .update({ is_active: false } as AnyTable)
      .eq('id', id);
    if (error) throw error;
  },

  async deleteTrainingType(id: string) {
    const { error } = await supabase
      .from(TRAINING_TYPES_TABLE)
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};
