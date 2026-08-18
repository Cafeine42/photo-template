export interface GenerationEntryPreview {
  key: string;
  file_name: string;
  extracted_number: string;
}

export interface GenerationPreparation {
  entries: GenerationEntryPreview[];
  skipped_subfolder_image_count: number;
}

export interface GenerationHistoryEntry {
  id: number;
  template_name: string;
  archive_path: string;
  image_count: number;
  created_at: string;
}
