import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ANALYSIS_MODEL,
  GEMINI_GENERATE_CONTENT_ENDPOINT,
  dispatchGeminiAnalysis,
} from "../../supabase/functions/_shared/gemini-provider";

const projectFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("verdict-cache regression", () => {
  it("dispatches two independent model requests for identical Pop/factory metadata", async () => {
    const imageUrl = "https://example.test/canonical.png";
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      input === imageUrl
        ? new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "image/png" } })
        : new Response("{}", { status: 200 })
    );
    const request = {
      systemInstruction: "Observe only.",
      prompt: "Inspect canonical evidence.",
      imageUrls: [imageUrl],
      responseJsonSchema: { type: "object", properties: {} },
    };

    await dispatchGeminiAnalysis(fetcher, "test-key", request);
    await dispatchGeminiAnalysis(fetcher, "test-key", request);

    const providerCalls = fetcher.mock.calls.filter(([input]) => input === GEMINI_GENERATE_CONTENT_ENDPOINT);
    expect(providerCalls).toHaveLength(2);
    expect(providerCalls[0]).not.toBe(providerCalls[1]);
  });

  it("contains no previous-assessment lookup or details-copy branch", () => {
    const source = projectFile("supabase/functions/analyze-funko/index.ts");

    expect(source).not.toContain('.eq("cache_key"');
    expect(source).not.toContain("reusedDetails");
    expect(source).not.toContain("cached.details");
    expect(source).not.toContain("CACHE HIT");
    expect(source).toContain("dispatchGeminiAnalysis");
    expect(source).not.toContain("LOVABLE_API_KEY");
    expect(source).not.toContain("LOVABLE_ANALYSIS_ENDPOINT");
  });

  it("cannot copy another user's details into a new submission", () => {
    const source = projectFile("supabase/functions/analyze-funko/index.ts");
    const completionBlock = source.slice(source.indexOf('"complete_phase_1b_assessment"'));

    expect(completionBlock).toContain("p_structured_observations: assessment.observations");
    expect(completionBlock).toContain("p_verdict: assessment.decision");
    expect(completionBlock).not.toMatch(/details:\s*(cached|ownedRow|previous)/);
    expect(completionBlock).not.toContain("cached_from_id: cached");
  });
});

describe("Edge Function trust boundaries", () => {
  it("loads canonical URLs from the owned row and ignores request-body URLs", () => {
    const source = projectFile("supabase/functions/analyze-funko/index.ts");

    expect(source).toContain('.select("id, user_id, image_urls, pop_name, pop_number")');
    expect(source).toContain("canonicalUrls: ownedRow.image_urls");
    expect(source).toContain("requestedUrls:");
    expect(source).not.toMatch(/const\s*\{[^}]*imageUrls[^}]*\}\s*=\s*await req\.json/);
  });

  it("persists a controlled evidence-required state before returning validation errors", () => {
    const source = projectFile("supabase/functions/analyze-funko/index.ts");

    expect(source).toContain('status: "evidence_required"');
    expect(source).toContain("details: {");
    expect(source).toContain("failure: {");
    expect(source).toContain("toSafeEvidenceFailure");
  });

  it("retains explicit authentication and ownership checks", () => {
    const analyze = projectFile("supabase/functions/analyze-funko/index.ts");
    const scrape = projectFile("supabase/functions/scrape-listing/index.ts");

    for (const source of [analyze, scrape]) {
      expect(source).toContain("Authorization");
      expect(source).toContain("auth.getClaims");
    }
    expect(analyze).toContain('.eq("user_id", callerUserId)');
  });

  it("enables platform JWT verification for both functions", () => {
    const config = projectFile("supabase/config.toml");
    expect(config.match(/verify_jwt = true/g)).toHaveLength(2);
    expect(config).not.toContain("verify_jwt = false");
  });

  it("keeps the direct Gemini credential server-only and fails closed when absent", () => {
    const analyze = projectFile("supabase/functions/analyze-funko/index.ts");
    const provider = projectFile("supabase/functions/_shared/gemini-provider.ts");

    expect(analyze).toContain('Deno.env.get("GEMINI_API_KEY")');
    expect(analyze).toContain('"PROVIDER_CONFIGURATION"');
    expect(analyze).not.toContain("LOVABLE_API_KEY");
    expect(analyze).not.toContain("LOVABLE_ANALYSIS_ENDPOINT");
    expect(provider).toContain('"x-goog-api-key": apiKey');
    expect(provider).not.toContain("console.");
    expect(projectFile(".env.example")).not.toContain("GEMINI_API_KEY");
  });
});

describe("reference provenance regression", () => {
  it("contains no DuckDuckGo retrieval or internet gold-standard instruction", () => {
    const source = projectFile("supabase/functions/analyze-funko/index.ts");

    expect(source.toLowerCase()).not.toContain("duckduckgo");
    expect(source.toLowerCase()).not.toContain("gold standard");
    expect(source.toLowerCase()).not.toContain("gold-standard");
    expect(source.toLowerCase()).toContain("legacy, unverified");
  });
});

describe("assessment privilege migration", () => {
  const migration = projectFile("supabase/migrations/20260716090000_phase_1a_trust_lockdown.sql");

  it("blocks authenticated UPDATE and forged INSERT assessment values", () => {
    expect(migration).toContain("REVOKE UPDATE ON public.authentications FROM anon, authenticated");
    expect(migration).toContain("NEW.score IS NOT NULL");
    expect(migration).toContain("NEW.status NOT IN ('pending', 'analyzing')");
    expect(migration).toContain("NEW.details IS NOT NULL");
    expect(migration).toContain("NEW.cached_from_id IS NOT NULL");
  });

  it("preserves backend writes and adds minimum audit fields", () => {
    expect(migration).toContain("GRANT SELECT, UPDATE ON public.authentications TO service_role");
    for (const column of [
      "analysis_model",
      "analysis_config_version",
      "analyzed_at",
      "legacy_unverified_references_used",
      "analysis_source",
    ]) {
      expect(migration).toContain(column);
    }
  });
});
