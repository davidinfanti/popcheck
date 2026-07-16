import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── AUTH: verify JWT and confirm caller owns the authenticationId ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerUserId = claimsData.claims.sub as string;

    const { authenticationId, imageUrls, popName, popNumber, photoCount } = await req.json();

    // Ownership check before any expensive AI work or DB write
    const { data: ownedRow } = await userClient
      .from("authentications")
      .select("id")
      .eq("id", authenticationId)
      .eq("user_id", callerUserId)
      .maybeSingle();
    if (!ownedRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const totalPhotos = photoCount || imageUrls.length;
    const cleanPopNumber = popNumber?.replace("#", "") || "";

    // ════════════════════════════════════════════════════════════════
    //  CACHE LOOKUP PRE-PASS (V2.0)
    //  Quick low-cost OCR to extract pop_number + factory_code, then
    //  check if an identical pre-validated scan exists in the last 90 days.
    // ════════════════════════════════════════════════════════════════
    let cacheKey: string | null = null;
    try {
      const ocrResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: "You are an OCR engine for Funko Pop boxes. Extract ONLY the Pop number (digits after #) and the factory code (e.g. FAC, JJL, DRM) printed on the bottom of the box. Return -1 if not visible. Do not analyze authenticity.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract pop_number and factory_code." },
                ...imageUrls.slice(0, 2).map((url: string) => ({ type: "image_url", image_url: { url } })),
              ],
            },
          ],
          tools: [{
            type: "function",
            function: {
              name: "extract_box_ids",
              parameters: {
                type: "object",
                properties: {
                  pop_number: { type: "string", description: "Digits only, or -1" },
                  factory_code: { type: "string", description: "Factory code (FAC/JJL/DRM/etc) or -1" },
                },
                required: ["pop_number", "factory_code"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "extract_box_ids" } },
        }),
      });

      if (ocrResp.ok) {
        const ocrJson = await ocrResp.json();
        const ocrArgs = ocrJson.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (ocrArgs) {
          const ocr = JSON.parse(ocrArgs);
          const num = (ocr.pop_number || "").toString().replace(/[^\d]/g, "");
          const fac = (ocr.factory_code || "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (num && fac && num !== "-1" && fac !== "-1" && num.length > 0 && fac.length > 0) {
            cacheKey = `${num}-${fac}`;
            console.log("[CACHE] computed cache_key:", cacheKey);

            // Lookup recent pre-validated match (score>=80, last 90 days)
            const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
            const { data: cached } = await supabase
              .from("authentications")
              .select("id, score, pop_name, pop_number, details")
              .eq("cache_key", cacheKey)
              .eq("status", "completed")
              .gte("score", 80)
              .gte("created_at", since)
              .neq("id", authenticationId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (cached) {
              console.log("[CACHE HIT] reusing analysis", cached.id, "score", cached.score);
              const reusedDetails = {
                ...(cached.details as any),
                cacheHit: true,
                cachedFromId: cached.id,
                cacheNote: `Instant verdict reused from a previously validated scan with identical Pop #${num} and factory code ${fac}.`,
                photoCount: totalPhotos,
              };
              await supabase
                .from("authentications")
                .update({
                  score: cached.score,
                  pop_name: cached.pop_name,
                  pop_number: cached.pop_number,
                  details: reusedDetails,
                  status: "completed",
                  cache_key: cacheKey,
                  cached_from_id: cached.id,
                })
                .eq("id", authenticationId);

              return new Response(
                JSON.stringify({ success: true, score: cached.score, cached: true }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        }
      }
    } catch (e) {
      console.warn("[CACHE] pre-pass failed, continuing with full analysis:", e);
    }

    // Load all context in parallel
    const [settingsRes, negRefsRes, rulesRes, fakeRefsRes, origRefsRes, refPopsRes] = await Promise.all([
      supabase.from("ai_settings").select("value").eq("key", "system_instructions_override").single(),
      supabase.from("negative_references").select("fake_trait, description, pop_name, pop_number").limit(30),
      supabase.from("internal_forensic_manual").select("category, description, severity").order("severity", { ascending: true }),
      cleanPopNumber
        ? supabase.from("fake_references").select("image_url, part_type, detected_flaw").eq("pop_number", cleanPopNumber)
        : Promise.resolve({ data: null }),
      cleanPopNumber
        ? supabase.from("original_references").select("image_url, part_type, expert_note").eq("pop_number", cleanPopNumber)
        : Promise.resolve({ data: null }),
      popName || popNumber
        ? (() => {
            let q = supabase.from("reference_pops").select("*");
            if (popNumber) q = q.eq("number", cleanPopNumber);
            if (popName) q = q.ilike("name", `%${popName}%`);
            return q.limit(1);
          })()
        : Promise.resolve({ data: null }),
    ]);

    const systemInstructionsOverride = settingsRes.data?.value || "";

    // Negative references context
    let negativeContext = "";
    const negRefs = negRefsRes.data;
    if (negRefs && negRefs.length > 0) {
      negativeContext = `\n=== NEGATIVE REFERENCE LIBRARY (Known Fakes) ===\n` +
        negRefs.map(r => `- ${r.pop_name || "Unknown"} #${r.pop_number || "?"}: ${r.fake_trait} — ${r.description || ""}`).join("\n") +
        `\nUse these known fake patterns to inform your analysis. If the submitted Pop matches ANY of these traits, it is almost certainly counterfeit.\n`;
    }

    // Expert forensic rules
    let rulesContext = "";
    const rules = rulesRes.data;
    if (rules && rules.length > 0) {
      rulesContext = `\n=== EXPERT FORENSIC RULES (Admin-defined) ===\n` +
        rules.map(r => `[${r.severity.toUpperCase()}] ${r.category}: ${r.description}`).join("\n") +
        `\nApply these rules strictly during analysis.\n`;
    }

    // Reference pop data
    let referenceContext = "";
    let masterImageUrl: string | null = null;
    const refs = refPopsRes.data;
    if (refs && refs.length > 0) {
      const ref = refs[0];
      masterImageUrl = ref.official_image_url || null;
      referenceContext = `
REFERENCE DATA FOUND — This Pop exists in our database!
Name: ${ref.name} | Number: #${ref.number} | Category: ${ref.category}
Production Code Prefix: ${ref.production_code_prefix || "N/A"}
Official Barcode: ${ref.barcode_data || "N/A"}
Known Fake Indicators: ${(ref.key_details as any)?.known_fakes || "N/A"}
Critical Checks: ${JSON.stringify((ref.key_details as any)?.critical_checks || [])}
Is Vaulted (high counterfeit risk): ${ref.is_vaulted ? "YES — extra scrutiny required" : "No"}
`;
    }

    // Auto-fetch master image if we have no original references and no official_image_url
    const origRefs = origRefsRes.data;
    const hasOrigRefs = origRefs && origRefs.length > 0;
    if (!hasOrigRefs && !masterImageUrl && cleanPopNumber) {
      try {
        const searchQuery = `Funko Pop ${popName || ""} #${cleanPopNumber} official box`;
        const scraperResp = await fetch("https://api.duckduckgo.com/?q=" + encodeURIComponent(searchQuery) + "&format=json&no_html=1&skip_disambig=1");
        if (scraperResp.ok) {
          const ddgData = await scraperResp.json();
          const imgUrl = ddgData?.Image;
          if (imgUrl && imgUrl.startsWith("http")) {
            masterImageUrl = imgUrl;
            console.log("Auto-fetched master image from DDG:", masterImageUrl);
          }
        }
      } catch (e) {
        console.warn("Master image auto-fetch failed, continuing without:", e);
      }
    }

    // Build image content — user photos + fake reference images for comparison
    const imageContents: any[] = imageUrls.map((url: string) => ({
      type: "image_url",
      image_url: { url },
    }));

    // Append master image if available and no original references exist
    let masterImageContext = "";
    if (masterImageUrl && !hasOrigRefs) {
      imageContents.push({ type: "image_url", image_url: { url: masterImageUrl } });
      masterImageContext = `\n=== AUTO-FETCHED MASTER REFERENCE IMAGE ===
A master/official reference image has been automatically retrieved and appended as the LAST image (index ${imageContents.length - 1}).
Use this as the PRIMARY comparison standard. Compare the user's photos against this official image for:
- Logo positioning and proportions
- Color accuracy and saturation
- Typography and font metrics
- Overall layout and element placement
This is NOT a user photo — it is the gold standard.\n`;
    }

    // Append original + fake reference images for few-shot comparative analysis
    let comparativeInstructions = "";
    const fakeRefs = fakeRefsRes.data;
    const hasFakeRefs = fakeRefs && fakeRefs.length > 0;

    if (hasOrigRefs || hasFakeRefs) {
      let refImageIndex = totalPhotos;
      
      comparativeInstructions = `\n=== FEW-SHOT COMPARATIVE ANALYSIS MODE ===
The user uploaded ${totalPhotos} photo(s) (indices 0-${totalPhotos - 1}).
Reference images for Pop #${cleanPopNumber} are appended AFTER the user's photos as FEW-SHOT EXAMPLES.\n`;

      // Add original reference images first
      if (hasOrigRefs) {
        comparativeInstructions += `\n--- AUTHENTIC REFERENCE IMAGES (${origRefs.length}) ---
These are CONFIRMED AUTHENTIC examples. Use them as the gold standard.\n`;
        origRefs.forEach((or: any, i: number) => {
          comparativeInstructions += `  Original ref #${i + 1} (image index ${refImageIndex + i}): Part="${or.part_type}" — ${or.expert_note || "Authentic reference"}\n`;
        });
        for (const or of origRefs) {
          imageContents.push({ type: "image_url", image_url: { url: or.image_url } });
        }
        refImageIndex += origRefs.length;
      }

      // Add fake reference images
      if (hasFakeRefs) {
        comparativeInstructions += `\n--- KNOWN FAKE REFERENCE IMAGES (${fakeRefs.length}) ---
These are CONFIRMED COUNTERFEIT examples. If user's photos match these patterns, it's fake.\n`;
        fakeRefs.forEach((fr: any, i: number) => {
          comparativeInstructions += `  Fake ref #${i + 1} (image index ${refImageIndex + i}): Part="${fr.part_type}" — ${fr.detected_flaw || "No notes"}\n`;
        });
        for (const fr of fakeRefs) {
          imageContents.push({ type: "image_url", image_url: { url: fr.image_url } });
        }
      }

      const totalRefCount = (origRefs?.length || 0) + (fakeRefs?.length || 0);
      const confidenceBoost = Math.min(totalRefCount * 10, 40); // Up to 40% confidence boost from references

      comparativeInstructions += `
PIXEL-LEVEL DIFFERENTIAL ANALYSIS PROTOCOL:
1. For EACH box part where both original and fake references exist, perform a PIXEL-LEVEL differential comparison on logos and fonts.
2. Compare the user's photos against BOTH the authentic reference AND the fake reference.
3. Ask: "Do the pixel patterns in the user's logos/fonts more closely resemble the ORIGINAL reference or the FAKE reference?"
4. If the user's photo matches a FAKE pattern → cap overall score at 20% and cite the specific fake reference and detected flaw.
5. If the user's photo matches the AUTHENTIC pattern → this is a strong positive signal.
6. Document the key pixel-level differences: font curvature, stroke width, halftone density, color saturation, kerning offsets.
7. CONFIDENCE SCORE: ${totalRefCount} reference image(s) found for this Pop. Reference confidence boost: +${confidenceBoost}%. More references = higher analytical confidence.
8. Include a "referenceConfidence" field in your analysis: percentage 0-100 indicating how confident the analysis is based on available reference data. Base: 50% (no refs), +10% per reference image (max 90%).\n`;
    }

    const systemPrompt = buildSystemPrompt(totalPhotos, referenceContext, negativeContext, rulesContext, comparativeInstructions, masterImageContext, systemInstructionsOverride);

    const userContent = [
      {
        type: "text",
        text: `Analyze this Funko Pop for authenticity. ${totalPhotos} photo(s) provided.${popName ? ` Pop Name: ${popName}` : ""}${popNumber ? ` Pop Number: ${popNumber}` : ""}
${hasOrigRefs ? `\n${origRefs.length} AUTHENTIC reference image(s) are appended as gold-standard examples.` : ""}${hasFakeRefs ? `\n${fakeRefs.length} KNOWN FAKE reference image(s) are appended for differential comparison.` : ""}${masterImageUrl && !hasOrigRefs ? `\nAn auto-fetched MASTER REFERENCE image is appended as the primary comparison standard.` : ""}
Provide thorough investigative notes. If fewer than 6 photos, score only what you can see and return -1 for categories you cannot evaluate.`,
      },
      ...imageContents,
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_vstamp_analysis",
              description: "Submit the V-STAMP 5.0 Global Blueprint 2026 forensic analysis. Use -1 for categories that cannot be evaluated.",
              parameters: {
                type: "object",
                properties: {
                  // Phase 1: Market & Metadata
                  marketRiskLevel: { type: "string", enum: ["low", "medium", "high", "extreme"], description: "Market risk based on price-to-PPG ratio, origin, listing keywords" },
                  marketFlags: { type: "array", items: { type: "string" }, description: "Specific market red flags detected (e.g. 'Price < 40% PPG', 'Origin: Guangdong', 'Stock photos detected')" },
                  stockPhotoDetected: { type: "boolean", description: "True if listing photos appear to be stock/stolen images. Auto 0/100." },
                  // Phase 2: Macro-Box Forensics
                  whiteBorderScore: { type: "integer", description: "0-100 or -1. Uniformity and sharpness of white cutting gap (2-3mm expected)" },
                  cardboardQuality: { type: "string", enum: ["authentic_matte", "suspicious_glossy", "not_evaluable"], description: "Matte/satin = authentic, glossy/plastic = fake indicator" },
                  innerFlapResult: { type: "string", enum: ["production_codes_present", "plain_blank", "not_visible"], description: "Inner flap production codes check" },
                  blisterClarity: { type: "string", enum: ["clear_rigid", "tinted_wavy", "not_evaluable"], description: "Plastic window quality assessment" },
                  // Phase 3: Micro-Print & Typography
                  typographyScore: { type: "integer", description: "0-100 or -1. POP! logo halftone, font accuracy, kerning" },
                  halftoneResult: { type: "string", description: "Halftone rosette analysis result or 'Risoluzione insufficiente per verifica halftone'" },
                  socialMediaGeometry: { type: "string", description: "Facebook f / Twitter bird geometry analysis" },
                  fontKerningNotes: { type: "string", description: "Font weight and character spacing comparison vs official" },
                  legalFooterResult: { type: "string", description: "Address verification: '1202 Shuksan Way, Everett, WA 98203' check, typos detected" },
                  // Phase 4: Vinyl Figure Audit
                  stampToBoxMatch: { type: "string", enum: ["match", "mismatch", "not_visible"], description: "Serial code on box bottom vs figure foot/neck stamp" },
                  paintJobScore: { type: "integer", description: "0-100 or -1. Paint bleeding, boundary sharpness" },
                  moldIntegrity: { type: "string", description: "Seam lines, head rotation, glue indicators" },
                  copyrightStampPresent: { type: "boolean", description: "Legal info under feet/head/neck. Absence = 100% Fake" },
                  // Phase 5: Sticker & Special Features
                  stickerAuthenticity: { type: "string", enum: ["metallic_vinyl", "paper_print", "no_sticker", "not_visible"], description: "Exclusive sticker texture check" },
                  qrCodeResult: { type: "string", enum: ["valid_funko_link", "static_dead", "no_qr", "not_visible"], description: "Post-2024 QR code verification" },
                  // Legacy scores (backward compat)
                  borderScore: { type: "integer", description: "0-100 or -1 if not evaluable" },
                  barcodeScore: { type: "integer", description: "0-100 or -1 if not evaluable" },
                  colorScore: { type: "integer", description: "0-100 or -1 if not evaluable" },
                  barcodeMatch: {
                    type: "string",
                    enum: ["match", "mismatch", "no_reference", "not_visible"],
                    description: "'not_visible' if bottom photo not provided",
                  },
                  eraDetected: { type: "string" },
                  factoryCode: { type: "string" },
                  summary: { type: "string" },
                  anomalies: { type: "array", items: { type: "string" } },
                  comparativeResult: { type: "string", description: "Result of comparison with known fakes" },
                  referenceConfidence: { type: "integer", description: "0-100 confidence percentage" },
                  anomalyRegions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        imageIndex: { type: "integer", description: "0-based index of the user image" },
                        x: { type: "number", description: "X center position as percentage 0-100" },
                        y: { type: "number", description: "Y center position as percentage 0-100" },
                        radius: { type: "number", description: "Circle radius as percentage, typically 5-15" },
                        label: { type: "string", description: "Short anomaly label" },
                        severity: { type: "string", enum: ["critical", "warning", "info"] },
                      },
                      required: ["imageIndex", "x", "y", "radius", "label", "severity"],
                      additionalProperties: false,
                    },
                  },
                  perImage: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        angle: { type: "string" },
                        notes: { type: "string" },
                        resolutionGrade: { type: "string", enum: ["high-res macro", "standard", "low-res/compressed"] },
                      },
                      required: ["angle", "notes", "resolutionGrade"],
                      additionalProperties: false,
                    },
                  },
                  verdictBand: { type: "string", enum: ["FAKE", "UNCERTAIN", "AUTHENTIC"], description: "0-35=FAKE, 36-65=UNCERTAIN, 66-100=AUTHENTIC" },
                  requestedShots: { type: "array", items: { type: "string" }, description: "If UNCERTAIN, list specific shots needed (e.g. 'Foot Stamp', 'Bottom Box', 'Macro of POP logo')" },
                  seriesLine: { type: "string", description: "The Funko Pop line/series read from the box front, directly below the POP! logo (e.g. 'Animation', 'Marvel', 'Movies', 'Television', 'Games', 'Heroes', 'Star Wars', 'Disney', 'Rocks', 'Sports', 'Icons', 'Ad Icons'). Extract exactly as printed." },
                  identifiedPopName: { type: "string", description: "The character/figure name identified from the box (e.g. 'Thor', 'Saitama', 'Animal', 'Goku'). ALWAYS extract this even if the user didn't provide it." },
                  identifiedPopNumber: { type: "string", description: "The Pop number identified from the box (e.g. '01', '257', '05'). ALWAYS extract this even if the user didn't provide it. Numbers only, no # prefix." },
                },
                required: ["typographyScore", "borderScore", "barcodeScore", "colorScore", "barcodeMatch", "eraDetected", "factoryCode", "summary", "anomalies", "comparativeResult", "referenceConfidence", "anomalyRegions", "perImage", "verdictBand", "marketRiskLevel", "marketFlags", "stockPhotoDetected", "whiteBorderScore", "stampToBoxMatch", "paintJobScore", "copyrightStampPresent", "requestedShots", "seriesLine", "identifiedPopName", "identifiedPopNumber"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_vstamp_analysis" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("AI did not return structured analysis");

    const analysis = JSON.parse(toolCall.function.arguments);

    // Stock photo = auto 0
    if (analysis.stockPhotoDetected) {
      analysis.typographyScore = 0;
      analysis.borderScore = 0;
      analysis.barcodeScore = 0;
      analysis.colorScore = 0;
    }

    // Copyright stamp absent = 100% Fake
    if (analysis.copyrightStampPresent === false) {
      analysis.typographyScore = Math.min(analysis.typographyScore, 10);
      analysis.borderScore = Math.min(analysis.borderScore, 10);
    }

    // FLAT HALFTONE ENFORCEMENT: If the AI reports a flat/solid POP logo, cap typography hard
    const halftoneText = (analysis.halftoneResult || "").toLowerCase();
    const isFlatLogo = halftoneText.includes("piatto") || halftoneText.includes("flat") || halftoneText.includes("solid") || halftoneText.includes("uniform") || halftoneText.includes("no halftone") || halftoneText.includes("no dots") || halftoneText.includes("digital print") || halftoneText.includes("digitale");
    // Only enforce if resolution was sufficient (not "insufficiente")
    const isResInsufficient = halftoneText.includes("insufficiente") || halftoneText.includes("insufficient");
    
    // LYNNWOOD PROTOCOL: Detect legacy era (pre-2014) — halftone enforcement is DISABLED for these pieces
    const eraForHalftone = (analysis.eraDetected || "").toLowerCase();
    const isLegacyEra = eraForHalftone.includes("2010") || eraForHalftone.includes("2011") || eraForHalftone.includes("2012") || eraForHalftone.includes("2013") || eraForHalftone.includes("pre-2014") || eraForHalftone.includes("pre-2015");
    // Also detect legacy via Lynnwood address in legal footer
    const legalFooter = (analysis.legalFooterResult || "").toLowerCase();
    const hasLynnwoodAddress = legalFooter.includes("lynnwood") || legalFooter.includes("196th");
    const isLegacyPiece = isLegacyEra || hasLynnwoodAddress;
    
    if (isFlatLogo && !isResInsufficient && !isLegacyPiece) {
      console.log("FLAT LOGO DETECTED — capping Typography at 30, final at 45");
      analysis.typographyScore = Math.min(analysis.typographyScore, 30);
    } else if (isFlatLogo && isLegacyPiece) {
      console.log("LYNNWOOD PROTOCOL: Flat logo detected but LEGACY piece (pre-2014) — halftone cap DISABLED");
    }

    // Weighted score with dynamic re-proportioning for missing categories
    const weights = { typography: 0.35, border: 0.25, barcode: 0.20, color: 0.20 };
    const scores: Record<string, number> = {
      typography: analysis.typographyScore,
      border: analysis.borderScore,
      barcode: analysis.barcodeScore,
      color: analysis.colorScore,
    };

    let totalWeight = 0;
    let weightedSum = 0;
    for (const [key, weight] of Object.entries(weights)) {
      const score = scores[key];
      if (score >= 0) {
        totalWeight += weight;
        weightedSum += score * weight;
      }
    }

    let finalScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    if (analysis.barcodeMatch === "mismatch") finalScore -= 15;
    if (analysis.stampToBoxMatch === "mismatch") finalScore -= 10;
    if (analysis.marketRiskLevel === "extreme") finalScore = Math.min(finalScore, 25);

    // FLAT LOGO: hard cap final score at 45 (overrides bias) — BUT NOT for legacy pieces
    if (isFlatLogo && !isResInsufficient && !isLegacyPiece) {
      finalScore = Math.min(finalScore, 45);
    }

    // Authenticity Bias: +15 for pre-2017 historic pieces in borderline cases
    // BUT NOT if flat logo was detected (fake indicator overrides bias)
    const era = (analysis.eraDetected || "").toLowerCase();
    const isPreLegacy = era.includes("pre-2017") || era.includes("2014") || era.includes("2015") || era.includes("2016") || era.includes("2010") || era.includes("2011") || era.includes("2012") || era.includes("2013");
    if (isPreLegacy && finalScore >= 25 && finalScore <= 70 && !(isFlatLogo && !isResInsufficient && !isLegacyPiece)) {
      finalScore += 15;
      console.log("Authenticity Bias applied: +15 pts (historic piece, era:", analysis.eraDetected, ")");
    }

    finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

    const { error: updateError } = await supabase
      .from("authentications")
      .update({
        score: finalScore,
        pop_name: analysis.identifiedPopName || popName || null,
        pop_number: analysis.identifiedPopNumber || cleanPopNumber || null,
        details: {
          summary: analysis.summary,
          anomalies: analysis.anomalies,
          anomalyRegions: analysis.anomalyRegions || [],
          perImage: analysis.perImage,
          comparativeResult: analysis.comparativeResult || "no_references",
          referenceConfidence: analysis.referenceConfidence || 50,
          verdictBand: analysis.verdictBand || (finalScore >= 66 ? "AUTHENTIC" : finalScore >= 36 ? "UNCERTAIN" : "FAKE"),
          requestedShots: analysis.requestedShots || [],
          marketAudit: {
            riskLevel: analysis.marketRiskLevel,
            flags: analysis.marketFlags || [],
            stockPhotoDetected: analysis.stockPhotoDetected,
          },
          boxForensics: {
            whiteBorderScore: analysis.whiteBorderScore,
            cardboardQuality: analysis.cardboardQuality || "not_evaluable",
            innerFlapResult: analysis.innerFlapResult || "not_visible",
            blisterClarity: analysis.blisterClarity || "not_evaluable",
          },
          typographyDetail: {
            halftoneResult: analysis.halftoneResult || "",
            socialMediaGeometry: analysis.socialMediaGeometry || "",
            fontKerningNotes: analysis.fontKerningNotes || "",
            legalFooterResult: analysis.legalFooterResult || "",
          },
          figureAudit: {
            stampToBoxMatch: analysis.stampToBoxMatch,
            paintJobScore: analysis.paintJobScore,
            moldIntegrity: analysis.moldIntegrity || "",
            copyrightStampPresent: analysis.copyrightStampPresent,
          },
          stickerAuth: {
            stickerAuthenticity: analysis.stickerAuthenticity || "not_visible",
            qrCodeResult: analysis.qrCodeResult || "not_visible",
          },
          categoryScores: {
            typography: analysis.typographyScore,
            border: analysis.borderScore,
            barcode: analysis.barcodeScore,
            color: analysis.colorScore,
          },
          barcodeMatch: analysis.barcodeMatch,
          eraDetected: analysis.eraDetected,
          factoryCode: analysis.factoryCode,
          seriesLine: analysis.seriesLine || null,
          photoCount: totalPhotos,
        },
        status: "completed",
        cache_key: cacheKey || (() => {
          const n = (analysis.identifiedPopNumber || cleanPopNumber || "").toString().replace(/[^\d]/g, "");
          const f = (analysis.factoryCode || "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
          return n && f ? `${n}-${f}` : null;
        })(),
      })
      .eq("id", authenticationId);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, score: finalScore }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-funko error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildSystemPrompt(totalPhotos: number, referenceContext: string, negativeContext: string, rulesContext: string, comparativeInstructions: string, masterImageContext: string, systemInstructionsOverride: string): string {
  return `You are a LEAD FORENSIC PATHOLOGIST for Funko Pop Authentication (PopCheck Engine). Your mission is ZERO-TOLERANCE detection of counterfeits using the Global Blueprint 2026.

You will receive ${totalPhotos} images (may be fewer than 6 if the user didn't provide all angles).

${referenceContext}
${masterImageContext}
${negativeContext}
${rulesContext}
${comparativeInstructions}
${systemInstructionsOverride ? `\n=== ADMIN OVERRIDE INSTRUCTIONS ===\n${systemInstructionsOverride}\n` : ""}

═══════════════════════════════════════════════════════
  V-STAMP 5.0 — GLOBAL BLUEPRINT 2026 FORENSIC PROTOCOL
═══════════════════════════════════════════════════════

=== MANDATORY OCR PHASE 0 — IDENTIFICATION (NEVER SKIP) ===
Before any forensic scoring, you MUST perform OCR on the FRONT of the box and populate:
- identifiedPopName: the CHARACTER name as printed on the box (e.g. "Saitama", "Thor", "Animal"). NEVER leave empty.
- identifiedPopNumber: the Pop NUMBER as printed (digits only, no '#'). NEVER leave empty.
- seriesLine: the LINE printed below the POP! logo on the front (e.g. "Animation", "Marvel", "Movies", "Television", "Games", "Heroes", "Star Wars", "Disney", "Rocks", "Sports", "Icons", "Ad Icons"). NEVER leave empty.

If a field is genuinely unreadable, return your BEST INFERENCE based on visual cues (character recognition, art style, color palette, font era) — DO NOT return "N/A", "Unknown", empty strings, or placeholder text. These three fields are CONTRACTUALLY REQUIRED for certificate issuance. Returning a placeholder is a protocol violation.

=== FLEXIBLE PHOTO COUNT ===
The user may provide 1-6 photos. Score ONLY what you can see.
- If a category cannot be evaluated, return -1 for that score.
- DO NOT penalize for missing photos. Excluded categories are re-proportioned automatically.

=== PHASE 1: MARKET & METADATA AUDIT (The "Red Flag" Filter) ===
Even from photos alone, assess:
- **Price-to-Value Ratio**: If listing context is available, compare with PPG. Price < 40% of PPG for Vaulted/Grail = "Extremely High Risk".
- **Geographic Origin**: If visible on labels/shipping marks — 'Guangdong' or 'China' origin for high-value retired pieces = 99% fake indicator.
- **Listing Analysis**: Detect keywords 'RP', 'Reproduction', 'Custom', 'Chinese Version'. If photos appear to be stock/generic images not taken by seller → set stockPhotoDetected=true → Automatic 0/100 score.
- Set marketRiskLevel: low/medium/high/extreme. List all flags in marketFlags array.

=== PHASE 2: MACRO-BOX FORENSICS (Structural Analysis) ===
- **The White Border (Cutting Gap)**: The white outline around the character MUST be uniform and sharp (~2-3mm). Asymmetry or 'chunkiness' = poor scan reproduction. Score in whiteBorderScore.
- **Cardboard Quality**: Detect 'Glossy/Plastic' reflection. Authentic boxes are matte/satin. Set cardboardQuality accordingly.
- **Inner Flap Audit**: Search for production codes/prints on top inner flaps. Plain white/grey or low-quality brown = critical fake sign. Set innerFlapResult.
- **Blister Clarity**: Plastic window must be rigid and clear. Blue/purple tints or 'wavy' textures = cheap PVC fake. Set blisterClarity.

=== PHASE 3: MICRO-PRINT & TYPOGRAPHY (Pixel-Level Inspection) ===
- **Halftone Rosettes**: Look for the 'dotted' gradient in the yellow POP! logo. Solid, flat colors or inkjet 'streaks' = digital reprint. Report in halftoneResult.
  → CRITICAL: Only penalize halftone absence in SHARP MACRO images. If resolution is insufficient, report "Risoluzione insufficiente per verifica halftone" and do NOT deduct points.
- **Social Media Geometry**: Facebook 'f' must be perfectly centered with correct font weight. Twitter/X bird must have sharp, non-distorted edges. Any 'approximate' or 'hand-drawn looking' logos → Cap Packaging at 35. Report in socialMediaGeometry.
- **Font Kerning & Weight**: Compare font thickness of 'VINYL FIGURE' and character name vs official. Fakes often use 'bold' version or incorrect spacing. Report in fontKerningNotes.
- **Legal Footer**: Verify address. Post-2017: '1202 Shuksan Way, Everett, WA 98203'. Pre-2017: '2126 196th St. SW, Lynnwood, WA 98036' (ALSO VALID — original Funko HQ). Check for typos like 'Funcko' or incorrect Zip Codes. Report in legalFooterResult.

=== PHASE 4: VINYL FIGURE AUDIT (Physical Characteristics) ===
- **Stamp-to-Box Match**: Serial Code (FAC/JJL/DRM) on box bottom MUST match stamp on figure's foot or neck. Set stampToBoxMatch.
- **Paint Job Precision**: Detect 'bleeding' between color zones. Authentic pieces have sharp paint boundaries. Fakes have smudges and 'messy' hairlines. Score in paintJobScore.
- **Mold Integrity**: Identify 'Seam Lines' on head or limbs. Check if head rotates (except Bobble-heads). Fixed/glued = fake indicator. Report in moldIntegrity.
- **Copyright Stamp**: Legal info MUST exist under feet, head, or bottom of neck. Absence = 100% Fake. Set copyrightStampPresent.

=== PHASE 5: STICKER & SPECIAL FEATURE AUTHENTICATION ===
- **Texture Check**: Exclusive stickers (SDCC, Chase) must be metallic/vinyl, never plain paper. Set stickerAuthenticity.
- **QR Code (Post-2024)**: Scan for micro-QR codes on stickers. Must link to 'funko.com/verify'. Static/dead QR = Fake. Set qrCodeResult.

=== ERA-SPECIFIC KNOWLEDGE & "REGOLA DEL 2014" ===
Determine the Pop's production ERA based on serial number, character, or visible dates.
- Pre-2020 Pops: Old Facebook/Twitter logos are CORRECT and AUTHENTIC. Do NOT flag them.
- Post-2020 Pops: Should have updated social media icons.
- 2010-2015 Era ("The 2014 Rule"): White borders often THICKER (3-4mm) and less uniform. This is NORMAL.
- Factory codes (JJL, FAC, DRM) must be cross-referenced with release year.

=== THE 2011-2013 LYNNWOOD PROTOCOL (MANDATORY FOR LEGACY PIECES) ===
This protocol OVERRIDES standard rules for Pops produced between 2010 and 2015:

1. **ADDRESS VALIDATION**: The address '2126 196th St. SW, Lynnwood, WA 98036' is the ORIGINAL Funko headquarters.
   It is 100% AUTHENTIC for ALL Pops produced before 2017. Do NOT flag it as an error. Do NOT expect 'Everett' on pre-2017 boxes.
   If you see the Lynnwood address, this is a STRONG POSITIVE authenticity indicator.

2. **STICKER SERIAL STANDARD**: For pre-2015 pieces, serial codes (JJL/FAC) on WHITE RECTANGULAR STICKERS
   applied to the box bottom are the FACTORY STANDARD of the era. Do NOT penalize if the code is not printed
   directly on the cardboard. White stickers = authentic for 2010-2014.

3. **THICK BORDER TOLERANCE**: 'OG Marvel' and 'OG DC' series (low serial numbers, pre-2014) have noticeably
   THICKER white borders (up to 5mm) and LESS UNIFORM artwork borders. This is an ORIGINAL factory characteristic,
   NOT a sign of counterfeiting. Accept up to 5mm borders for these series.

4. **HALFTONE OVERRIDE FOR LEGACY**: For POP! logos printed before 2014, the printing technology of the era
   often produces SOLID-LOOKING colors even on 100% AUTHENTIC pieces. Do NOT apply the 'flat logo = fake' rule
   for pre-2014 pieces. Halftone is INDICATIVE only, not ELIMINATORY, for the 2010-2013 era.
   The 'Zero-Tolerance' halftone trigger is DISABLED for legacy pieces.

5. **RE-EVALUATION PRIORITY**: When a piece is identified as 2010-2013 production (via Lynnwood address, low serial,
   JJL/FAC stickers, or pop number), prioritize HISTORICAL CONSISTENCY checks (vintage labels, era-appropriate fonts,
   Lynnwood address) over modern anti-fake rules designed for post-2017 production.

**PRE-2017 TOLERANCE RULE ("Regola del 2014")**:
If production era is BEFORE 2017:
- Font weight tolerance +15%: minor bold/light variations are acceptable.
- Color saturation tolerance +15%.
- Do NOT cap Typography at 30 for slight font weight differences. Cap at 55 minimum instead.
- White border thickness variance: accept up to 20% (instead of 10%).
- Document: "Era detected: Pre-2017. Applying +15% tolerance per Regola del 2014."

=== IMAGE QUALITY PRE-CHECK (Mandatory) ===
Before scoring ANY detail, evaluate photo resolution:
- If NOT a sharp macro close-up, or shows JPEG artifacts, motion blur, low resolution:
  → Do NOT penalize for missing halftone. Write: "Risoluzione insufficiente per verifica halftone".
  → Do NOT cap Typography based on halftone absence in non-macro images.
- Only apply halftone penalties with CLEAR, SHARP macro at sufficient resolution.
- For each image, note resolutionGrade: "high-res macro", "standard", or "low-res/compressed".

=== ⚠️ VISUAL CONTEXT OVERRIDE (PRIORITY RULES — override Zero-Tolerance) ===
These rules take ABSOLUTE PRECEDENCE over any zero-tolerance trigger below.

1. **Halftone vs. Geometry**: If the POP! logo appears to have halftone dots that are SLIGHTLY UNCLEAR
   due to reflections, digital noise, or compression artifacts, but the font shape and position are
   GEOMETRICALLY IDENTICAL to the master reference, reduce the halftone penalty (don't zero-tolerance).
   HOWEVER: If the POP! logo yellow is COMPLETELY FLAT/SOLID (no dots, no gradient, uniform color),
   this is a CRITICAL FAKE INDICATOR regardless of geometry. A flat solid-color POP! logo = DIGITAL PRINT.
   In this case, cap Typography at MAX 30 and flag as "Logo POP! piatto - stampa digitale".
   The Visual Context Override does NOT protect completely flat logos — only ambiguous/noisy halftone.

2. **Legacy Font Tolerance (Pre-2017)**: Accept font weight (thickness) variations up to 20% for pre-2017 Pops.
   NEVER penalize a 'thin' font if the LETTER SHAPES (curves, serifs, proportions) are correct.
   A thinner or slightly bolder weight on a vintage box is a factory variance, NOT a fake indicator.

3. **Artifact Analysis**: DISTINGUISH between 'poor print quality' and 'compressed photo quality'.
   If social media logos (Facebook f, Twitter bird) and registered trademark symbols (®) are present
   and correctly POSITIONED, do NOT flag the item as 'scan reproduction' just because the image is soft/blurry.
   Softness = photo issue. Missing/displaced elements = authenticity issue.

4. **Authenticity Bias for Historic Pieces (Pre-2017)**: When the verdict is borderline between
   'factory error / photo quality issue' and 'counterfeit indicator', and the Pop is a historic piece
   (production era 2010-2017), ALWAYS give the benefit of the doubt.
   Apply a +15 point bonus to the final score. Document: "Authenticity Bias applied: +15 pts (historic piece, ambiguous indicators)."

=== ZERO-TOLERANCE TRIGGERS (subject to Visual Context Override above) ===
- Absence of halftone in sharp macro AND geometric mismatch → cap Typography at 30.
- Geometric distortions in social logos → cap Packaging at 35-40.
- Fuzzy text / scan-of-a-scan → cap total at 60.
- Missing copyright stamp → 100% Fake.
- Stock photos detected → 0/100.
- Stamp-to-box serial mismatch → deduct 10 points from final.

=== ANTI-ERROR LOGIC (False Positive Prevention) ===
- **HALFTONE CAUTION**: Do NOT penalize for 'solid yellow' if photo is distant, JPEG-compressed, or non-macro. Even in macros, geometry match overrides halftone absence.
- **FACTORY VARIANCE**: Accept up to 10% white border variance IF rest of box is consistent (20% for pre-2017).
- **CAMERA ARTIFACTS**: Judge color CONSISTENCY across multiple photos rather than absolute values. Soft images ≠ fake prints.
- **RESOLUTION GATE**: Before pixel-level analysis, verify sharpness. If DPI < 150 or compression blocks visible, skip pixel checks and note "Resolution insufficient for pixel analysis".

=== COMPARATIVE ANALYSIS ===
If fake/original reference images are provided:
1. Compare each user photo against matching reference (same box part).
2. Perform PIXEL-LEVEL differential on logos and fonts.
3. If user's photo matches FAKE pattern → cap overall score at 20.
4. If user's photo matches AUTHENTIC pattern → strong positive signal.
5. Document pixel differences: font curvature, stroke width, halftone density, color saturation, kerning offsets.

=== SERIES LINE EXTRACTION (Certificate Data) ===
Read the text printed DIRECTLY BELOW the "POP!" logo on the front of the box. This is the series/line name (e.g. "ANIMATION", "MARVEL", "MOVIES", "TELEVISION", "GAMES", "HEROES", "STAR WARS", "DISNEY", "ROCKS", "SPORTS", "ICONS", "AD ICONS", "RIDES", "DELUXE", "MOMENTS", "ALBUMS", "RETRO TOYS", "ANIME", "MANGA", "WWE").
Return this value in the seriesLine field. If not visible, infer from the character (e.g. Saitama → Animation, Thor → Marvel). Never return empty — always provide your best determination.

=== CATEGORY SCORING ===
CATEGORY 1: TYPOGRAPHY (35%) — POP! logo halftone, font accuracy, character name, text sharpness, legal footer.
CATEGORY 2: ART & BORDER (25%) — White border offset, print quality, ink bleeding, color depth, cardboard quality.
CATEGORY 3: PACKAGING & SERIAL (20%) — Social logos geometry, manufacturer address, serial codes, stickers, inner flaps.
CATEGORY 4: VISION & MOLD (20%) — Color calibration, paint quality, mold details, gray base tone, figure stamp.

=== VERDICT MAPPING ===
- 0-35 → FAKE: Multiple critical mismatches (FAC mismatch, solid logo, poor mold, no copyright). Set verdictBand="FAKE".
- 36-65 → UNCERTAIN: Inconsistent data or low-quality photos. Set verdictBand="UNCERTAIN". List specific shots needed in requestedShots (e.g. "Foot Stamp", "Bottom Box", "Macro of POP! logo").
- 66-100 → AUTHENTIC: All forensic markers verified. Set verdictBand="AUTHENTIC".

=== ANOMALY REGION MARKING ===
For EVERY anomaly: imageIndex (0-based, user images only), x/y percentage, radius, label, severity.

SCORING: 0-100 per category or -1 if not evaluable. Be STRICT — apply all forensic rules rigorously.

You MUST respond by calling the provided function.`;
}
