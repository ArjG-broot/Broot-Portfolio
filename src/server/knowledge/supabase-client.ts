import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseKnowledgeClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("The Supabase knowledge client can only run on the server.");
  }

  if (!client) {
    const url = requireEnv("SUPABASE_URL");
    const key = requireEnv("SUPABASE_SECRET_KEY");

    client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return client;
}
