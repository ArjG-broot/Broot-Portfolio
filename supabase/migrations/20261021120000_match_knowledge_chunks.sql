-- Vector similarity search for knowledge_chunks (cosine distance).
create or replace function public.match_knowledge_chunks(
  query_embedding vector(768),
  match_count integer default 5,
  filter_source_id text default null
)
returns table (
  id text,
  source_id text,
  document_id text,
  chunk_index integer,
  section text,
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
    kc.content,
    kc.embedding_model,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where filter_source_id is null or kc.source_id = filter_source_id
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;
