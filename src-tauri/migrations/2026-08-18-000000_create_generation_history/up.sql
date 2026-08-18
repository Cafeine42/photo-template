CREATE TABLE generation_history (
  id INTEGER PRIMARY KEY NOT NULL,
  template_name TEXT NOT NULL,
  archive_path TEXT NOT NULL,
  image_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
