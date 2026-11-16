import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getSupabaseKnowledgeClient } from "../src/server/knowledge/supabase-client";

function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();

  const sourceId =
    process.env.PORTFOLIO_KNOWLEDGE_SOURCE_ID?.trim() ?? "portfolio_knowledge";
  const supabase = getSupabaseKnowledgeClient();

  const { data: rows, error } = await supabase
    .from("knowledge_chunks")
    .select(
      "id, source_id, chunk_type, project_name, section_path, updated_at",
    )
    .eq("source_id", sourceId);

  if (error) {
    console.error(`Query failed: ${error.message}`);
    process.exit(1);
  }

  const list = rows ?? [];
  const withType = list.filter((row) => row.chunk_type).length;
  const withProject = list.filter((row) => row.project_name).length;
  const withPath = list.filter((row) => row.section_path).length;
  const stalePortfolioKnowledgeIds = list.filter(
    (row) => !row.id.startsWith(`${sourceId}:doc:`),
  );

  const { data: allSources, error: countError } = await supabase
    .from("knowledge_chunks")
    .select("source_id");

  if (countError) {
    console.error(`Source count failed: ${countError.message}`);
    process.exit(1);
  }

  const otherSources = new Set(
    (allSources ?? [])
      .map((row) => row.source_id)
      .filter((id) => id !== sourceId),
  );

  console.log(
    JSON.stringify(
      {
        sourceId,
        totalChunks: list.length,
        withChunkType: withType,
        withProjectName: withProject,
        withSectionPath: withPath,
        idsNotMatchingCurrentPattern: stalePortfolioKnowledgeIds.length,
        otherSourceIdsPreserved: [...otherSources],
        sampleProjectChunks: list
          .filter((row) => row.project_name)
          .slice(0, 8)
          .map((row) => ({
            section: row.id,
            project_name: row.project_name,
            chunk_type: row.chunk_type,
          })),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Verification failed.";
  console.error(message);
  process.exit(1);
});