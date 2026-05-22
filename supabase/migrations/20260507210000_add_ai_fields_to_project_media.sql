alter table public.project_media
  add column if not exists ai_extracted_json jsonb,
  add column if not exists ai_tags text[] not null default '{}',
  add column if not exists ai_category text,
  add column if not exists ai_summary text,
  add column if not exists ai_review_status text,
  add column if not exists ai_processed_at timestamptz,
  add column if not exists ai_confidence numeric,
  add column if not exists ai_error text;

create index if not exists project_media_ai_category_idx
  on public.project_media (company_id, ai_category)
  where ai_category is not null;

create index if not exists project_media_ai_processed_idx
  on public.project_media (company_id, ai_processed_at desc)
  where ai_processed_at is not null;

create index if not exists project_media_ai_tags_idx
  on public.project_media using gin (ai_tags);
