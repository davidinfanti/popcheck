import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ANALYSIS_MODEL,
  dispatchIndependentAnalysis,
} from "../../supabase/functions/_shared/independent-analysis";

const projectFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("verdict-cache regression", () => {
  it("dispatches two independent model requests for identical Pop/factory metadata", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    const payload = {
      model: ANALYSIS_MODEL,
      submission: { popNumber: "123", factoryCode: "FAC" },
    };

    await dispatchIndependentAnalysis(fetcher, "test-key", payload);
    await dispatchIndependentAnalysis(fetcher, "test-key", payload);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]).not.toBe(fetcher.mock.calls[1]);
  });

  it("contains no previous-assessment lookup or details-copy branch", () => {
    const source = projectFile("supabase/functions/analyze-funko/index.ts");

    expect(source).not.toContain('.eq("cache_key"');
    expect(source).not.toContain("reusedDetails");
    expect(source).not.toContain("cached.details");
    expect(source).not.toContain("CACHE HIT");
    expect(source).toContain("dispatchIndependentAnalysis");
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
    expect(source).toContain("details: { failure }");
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
