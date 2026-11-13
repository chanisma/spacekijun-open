export type TrainingCategory = 'annual' | 'multi' | 'special';

export interface TrainingType {
  id: string;
  code: string;
  name: string;
  category: TrainingCategory;
  category_label: string;
  required_hours: number;
  unit: string;
  description: string | null;
  cycle: string | null;
  year: number | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface TrainingCertificate {
  id: string;
  resource_id: string;
  training_type_id: string;
  title: string;
  organization: string;
  hours: number;
  completed_at: string;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  file_mime: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export interface TrainingCertificateWithType extends TrainingCertificate {
  training_type: Pick<TrainingType, 'id' | 'code' | 'name' | 'category' | 'category_label'>;
  teacher?: { id: string; name: string };
}

export interface TrainingProgress {
  resource_id: string;
  teacher_name: string;
  training_type_id: string;
  training_code: string;
  training_name: string;
  category: TrainingCategory;
  required_hours: number;
  completed_hours: number;
  entries: number;
}
