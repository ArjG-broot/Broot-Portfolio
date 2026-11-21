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

  const supabase = getSupabaseKnowledgeClient();
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("id")
    .limit(1);

  if (error) {
    console.error(
      `Supabase connection test failed: ${error.code ?? "unknown"} — ${error.message}`,
    );
    process.exit(1);
  }

  console.log(
    `Supabase connection test succeeded (public.knowledge_chunks reachable; sample returned ${data?.length ?? 0} row(s)).`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  console.error(`Supabase connection test failed: ${message}`);
  process.exit(1);
});
