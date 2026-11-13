export type MatchRow = {
  id: string;
  chunk_text: string;
  similarity_score: number;
  document_title: string;
  file_name: string;
};

export type DocumentRow = {
  id: string;
  user_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  title: string;
  upload_status: string;
  created_at: string;
  updated_at: string;
};