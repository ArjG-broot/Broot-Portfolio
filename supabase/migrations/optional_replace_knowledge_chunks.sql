-- Optional: atomic replace for one source_id (run manually if you want all-or-nothing writes).
-- The ingestion script uses upsert + delete-stale, which is not a single transaction.

create or replace function public.replace_knowledge_chunks(
  p_source_id text,
  p_rows jsonb
)
returns void
language plpgsql
as $$
begin
  delete from public.knowledge_chunks
  where source_id = p_source_id;

  insert into public.knowledge_chunks (
    id,
    source_id,
    document_id,
    chunk_index,
    section,
    content,
    embedding,
    embedding_model,
    updated_at
  )
  select
    row.id,
    row.source_id,
    row.document_id,
    row.chunk_index,
    row.section,
    row.content,
    row.embedding::vector(768),
    row.embedding_model,
    row.updated_at
  from jsonb_to_recordset(p_rows) as row(
    id text,
    source_id text,
    document_id text,
    chunk_index integer,
    section text,
    content text,
    embedding jsonb,
    embedding_model text,
    updated_at timestamptz
  );
end;
$$;
