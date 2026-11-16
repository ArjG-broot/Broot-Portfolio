alter table public.knowledge_chunks
  add column if not exists section_path text,
  add column if not exists chunk_type text,
  add column if not exists project_name text;

create or replace function public.match_knowledge_chunks(
  query_embedding vector(768),
  match_count integer default 6,
  filter_source_id text default null,
  filter_chunk_type text default null,
  match_threshold double precision default 0.5
)
returns table (
  id text,
  source_id text,
  document_id text,
  chunk_index integer,
  section text,
  section_path text,
  chunk_type text,
  project_name text,
  content text,
  embedding_model text,
  similarity double precision
)
language sql
stable
as $$
  select
    kc.id,
    kc.source_id,
    kc.document_id,
    kc.chunk_index,
    kc.section,
    kc.section_path,
    kc.chunk_type,
    kc.project_name,
    kc.content,
    kc.embedding_model,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where (filter_source_id is null or kc.source_id = filter_source_id)
    and (filter_chunk_type is null or kc.chunk_type = filter_chunk_type)
    and 1 - (kc.embedding <=> query_embedding) >= match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;
