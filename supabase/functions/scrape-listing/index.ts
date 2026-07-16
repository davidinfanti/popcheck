import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseApprovedEbayUrl } from "../_shared/ebay-url.ts";

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
    // ── AUTH: only authenticated users can use this scraping proxy ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Server-side eBay-only enforcement (client UI already restricts this)
    const parsedUrl = parseApprovedEbayUrl(url);
    if (!parsedUrl) {
      return new Response(JSON.stringify({ error: "Only approved HTTPS eBay URLs without credentials are supported" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const approvedUrl = parsedUrl.toString();
    console.log("Scraping listing:", approvedUrl);

    // Helper: fetch a URL via Jina proxy (mobile eBay works, desktop is blocked by Akamai)
    const fetchViaJina = async (targetUrl: string): Promise<string> => {
      // Force mobile subdomain — desktop pages are blocked by Akamai
      const mobileUrl = targetUrl
        .replace(/^https?:\/\/www\.ebay\./, "https://m.ebay.")
        .replace(/^https?:\/\/ebay\./, "https://m.ebay.");
      const proxied = `https://r.jina.ai/${mobileUrl}`;
      const resp = await fetch(proxied, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
          "x-respond-with": "html",
        },
      });
      if (!resp.ok) throw new Error(`jina ${resp.status} for ${mobileUrl}`);
      const text = await resp.text();
      if (text.includes("Access Denied") || text.includes("403: Forbidden")) {
        throw new Error(`access denied for ${mobileUrl}`);
      }
      return text;
    };

    const fetchViaFirecrawl = async (targetUrl: string): Promise<string> => {
      const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
      if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not configured");

      const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: targetUrl,
          formats: ["rawHtml", "html"],
          onlyMainContent: false,
          waitFor: 3000,
          location: { country: "IT", languages: ["it", "en"] },
        }),
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(data?.error || `firecrawl ${resp.status}`);

      const text = data?.rawHtml || data?.html || data?.data?.rawHtml || data?.data?.html || "";
      if (!text || text.length < 1000) throw new Error("firecrawl returned empty html");
      return text;
    };

    let html = "";
    let resolvedUrl = approvedUrl;
    let fetchStrategy = "";
    const strategies = Deno.env.get("FIRECRAWL_API_KEY")
      ? [
          { name: "Firecrawl browser", fetcher: () => fetchViaFirecrawl(approvedUrl) },
          { name: "Jina mobile", fetcher: () => fetchViaJina(approvedUrl) },
        ]
      : [{ name: "Jina mobile", fetcher: () => fetchViaJina(approvedUrl) }];

    for (const strategy of strategies) {
      try {
        html = await strategy.fetcher();
        fetchStrategy = strategy.name;
        console.log(`Fetched ${html.length} bytes via ${strategy.name}`);
        break;
      } catch (err) {
        console.warn(`${strategy.name} fetch failed:`, err instanceof Error ? err.message : err);
      }
    }

    if (!html) {
      return new Response(
        JSON.stringify({
          error: "LISTING_UNREACHABLE",
          message: "Could not access the listing. The marketplace may be blocking automated requests. Please upload the photos manually.",
          fallback: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If this is an eBay product page (/p/) or aggregator, the page lists multiple sellers.
    // Find the first individual /itm/ listing (different from current) and fetch it instead,
    // because product pages don't expose the seller's full gallery.
    const itmMatches = Array.from(html.matchAll(/\/itm\/(\d{10,})/g)).map((m) => m[1]);
    const currentItmMatch = approvedUrl.match(/\/itm\/(\d{10,})/);
    const currentItm = currentItmMatch ? currentItmMatch[1] : null;
    const otherItm = itmMatches.find((id) => id !== currentItm);
    const isProductPageRequest = /\/p\/\d+/i.test(approvedUrl) || !currentItm;

    // Only product/aggregator URLs may be resolved to a seller /itm/.
    // For a direct /itm/ URL, never jump to another item: that caused unrelated photos
    // from recommended/current seller listings to be analyzed for sold/redirected pages.
    const hasGalleryPattern = /\/00\/s\/[A-Za-z0-9]+\/z\/[A-Za-z0-9~_-]+\/\$_1\.JPG/i.test(html);
    if (isProductPageRequest && !hasGalleryPattern && otherItm) {
      const altUrl = `https://m.ebay.it/itm/${otherItm}`;
      console.log(`Product page request without gallery, following to ${altUrl}`);
      try {
        const altHtml = await fetchViaJina(altUrl);
        if (altHtml.length > 1000) {
          html = altHtml;
          resolvedUrl = altUrl;
          console.log(`Switched to listing ${otherItm} (${html.length} bytes)`);
        }
      } catch (err) {
        console.warn("Could not fetch linked listing:", err instanceof Error ? err.message : err);
      }
    } else if (!isProductPageRequest && otherItm) {
      console.log(`Direct item ${currentItm}: ignoring linked item ${otherItm}`);
    }

    // Extract image URLs with multiple strategies for eBay and other marketplaces
    const images: string[] = [];
    const seen = new Set<string>();

    const addImage = (imgUrl: string) => {
      // Upgrade eBay images to s-l1600 BEFORE dedup so thumbnail variants merge correctly
      let clean = imgUrl
        .replace(/&amp;/g, "&")
        .replace(/\\u002F/g, "/")
        .replace(/[)\],.]+$/g, "");
      if (clean.includes("ebayimg.com")) {
        clean = clean.replace(/\/s-l\d+\./i, "/s-l1600.");
      }
      if (
        !seen.has(clean) &&
        clean.length < 500 &&
        !clean.includes("favicon") &&
        !clean.includes("logo") &&
        !clean.includes("icon") &&
        (clean.includes(".jpg") || clean.includes(".jpeg") || clean.includes(".png") || clean.includes(".webp") || clean.includes("ebayimg.com"))
      ) {
        seen.add(clean);
        images.push(clean);
      }
    };

    let match;
    const isEbayUrl = true;
    const xPhotosMatch = html.match(
      /<div[^>]+class="[^"]*\bx-photos\b[^"]*"[\s\S]*?(?=<div[^>]+class="[^"]*\b(?:x-prp-main-container_col-right|x-item-title|x-sellercard|x-item-condition)\b|<\/main>)/i,
    );
    const xPhotosHtml = xPhotosMatch?.[0] || "";
    let ebayScopedGallerySource = "";

    if (isEbayUrl && xPhotosHtml) {
      ebayScopedGallerySource = xPhotosHtml;
      const beforeScoped = images.length;
      const imgTagPattern = /<img\b[^>]*>/gi;
      let imgTagMatch;
      while ((imgTagMatch = imgTagPattern.exec(xPhotosHtml)) !== null) {
        const tag = imgTagMatch[0];
        if (/Foto di catalogo|stock-photo|catalog photo/i.test(tag)) continue;

        const attrPattern = /(?:src|data-src|data-zoom-src)="(https?:\/\/i\.ebayimg\.com\/images\/g\/[^"]+)"/gi;
        let attrMatch;
        while ((attrMatch = attrPattern.exec(tag)) !== null) addImage(attrMatch[1]);

        const srcsetPattern = /(?:srcset|data-srcset)="([^"]+)"/gi;
        let srcsetMatch;
        while ((srcsetMatch = srcsetPattern.exec(tag)) !== null) {
          const urls = srcsetMatch[1].match(/https?:\/\/i\.ebayimg\.com\/images\/g\/[^\s,]+/g) || [];
          for (const u of urls) addImage(u);
        }
      }
      console.log(`Scoped eBay gallery extraction found ${images.length - beforeScoped} item photos`);
    }

    // Jina frequently returns eBay as markdown instead of raw HTML. In that form, the
    // listing gallery appears before "Oggetti simili"; anything after that is related
    // inventory and must never be analyzed for the requested URL.
    if (isEbayUrl && !ebayScopedGallerySource) {
      const startMarkers = ["(0) Detail(s)", "## Foto", "## 1 foto", "## Galleria"];
      const endMarkers = ["\nNe hai uno da vendere?", "\n## Oggetti simili", "\n# "];
      const startIndexes = startMarkers.map((marker) => html.indexOf(marker)).filter((idx) => idx >= 0);
      const start = startIndexes.length ? Math.min(...startIndexes) : -1;
      if (start >= 0) {
        const relativeEnds = endMarkers
          .map((marker) => html.indexOf(marker, start + 1))
          .filter((idx) => idx > start);
        const end = relativeEnds.length ? Math.min(...relativeEnds) : Math.min(html.length, start + 12000);
        const markdownGallery = html.slice(start, end);
        const beforeScoped = images.length;
        const markdownImagePattern = /!\[[^\]]*(?:Foto|Photo|Image)[^\]]*\]\((https?:\/\/i\.ebayimg\.com\/images\/g\/[^\s)]+)\)/gi;
        let markdownImageMatch;
        while ((markdownImageMatch = markdownImagePattern.exec(markdownGallery)) !== null) {
          const fullMatch = markdownImageMatch[0];
          if (/Foto di catalogo|stock-photo|catalog photo/i.test(fullMatch)) continue;
          addImage(markdownImageMatch[1]);
        }
        if (images.length > beforeScoped) {
          ebayScopedGallerySource = markdownGallery;
        }
        console.log(`Scoped eBay markdown gallery extraction found ${images.length - beforeScoped} item photos`);
      }
    }

    const hasScopedEbayGallery = isEbayUrl && images.length > 0;

    if (!hasScopedEbayGallery) {
      // Strategy 1: eBay JSON data in <script> tags — most reliable for full gallery
      // eBay embeds image arrays in JSON within script tags
      const jsonImageArrayPattern = /"imageUrl"\s*:\s*"(https?:\/\/i\.ebayimg\.com\/images\/g\/[^"]+)"/gi;
      while ((match = jsonImageArrayPattern.exec(html)) !== null) {
        addImage(match[1]);
      }

      // Strategy 2: eBay maxImageUrl / originalImg patterns in JSON
      const maxImagePattern = /"(?:maxImageUrl|originalImg|zoom(?:Img)?Url)"\s*:\s*"(https?:\/\/[^"]+)"/gi;
      while ((match = maxImagePattern.exec(html)) !== null) {
        addImage(match[1]);
      }

      // Strategy 3: eBay filmstrip / gallery container images
      // Look for img tags within ux-image-filmstrip or similar containers
      const filmstripPattern = /class="[^"]*(?:ux-image-filmstrip|pip|filmstrip)[^"]*"[^>]*>[\s\S]*?<img[^>]+src="(https?:\/\/[^"]+)"/gi;
      while ((match = filmstripPattern.exec(html)) !== null) {
        addImage(match[1]);
      }

      // Strategy 4: All img tags with ebayimg.com src
      const ebayImgPattern = /(?:src|data-src|data-zoom-src)="(https?:\/\/i\.ebayimg\.com\/images\/g\/[^"]+)"/gi;
      while ((match = ebayImgPattern.exec(html)) !== null) {
        addImage(match[1]);
      }

      // Strategy 5: eBay image array in JavaScript (often contains ALL gallery images)
      const jsArrayPattern = /\["(https?:\/\/i\.ebayimg\.com\/images\/g\/[^"]+)"(?:\s*,\s*"(https?:\/\/i\.ebayimg\.com\/images\/g\/[^"]+)")*\]/gi;
      while ((match = jsArrayPattern.exec(html)) !== null) {
        // Extract all URLs from the array match
        const arrayStr = match[0];
        const urlsInArray = arrayStr.match(/https?:\/\/i\.ebayimg\.com\/images\/g\/[^"]+/g);
        if (urlsInArray) {
          for (const u of urlsInArray) addImage(u);
        }
      }

      // Strategy 6: Generic high-res image patterns for Vinted/Mercari
      const genericPatterns = [
        /https?:\/\/[^"'\s]*vinted[^"'\s]*\.(?:jpg|jpeg|png|webp)[^"'\s]*/gi,
        /https?:\/\/[^"'\s]*mercari[^"'\s]*\.(?:jpg|jpeg|png|webp)[^"'\s]*/gi,
        /content="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi,
      ];

      for (const pattern of genericPatterns) {
        while ((match = pattern.exec(html)) !== null) {
          addImage(match[1] || match[0]);
        }
      }

      // If we still haven't found many, try all src= img tags as fallback
      if (images.length < 3) {
        const fallbackPattern = /src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;
        while ((match = fallbackPattern.exec(html)) !== null) {
          addImage(match[1]);
        }
      }
    } else {
      console.log("Using scoped eBay item gallery only; skipping global/recommended image extraction");
    }

    // Images already upgraded to s-l1600 and deduplicated in addImage()
    // === eBay $_N.JPG gallery enumeration ===
    // Many listings use predictable gallery URLs: $_1.JPG, $_2.JPG, ... up to ~12.
    // Find the base pattern and probe sequentially.
    const shouldEnumerateLegacyGallery = isEbayUrl ? !hasScopedEbayGallery : true;
    const galleryMatch = shouldEnumerateLegacyGallery
      ? html.match(/(https?:\/\/i\.ebayimg\.com\/\d+\/s\/[A-Za-z0-9]+\/z\/[A-Za-z0-9~_-]+\/)\$_1\.JPG(\?[^"'\s)]*)?/i)
      : null;
    if (galleryMatch) {
      const base = galleryMatch[1];
      const query = galleryMatch[2] || "";
      console.log(`Found gallery base: ${base}, probing $_1..$_12`);
      const probes = await Promise.all(
        Array.from({ length: 12 }, (_, i) => i + 1).map(async (n) => {
          // Encode $ as %24 for safer downstream handling (Gemini, JSON)
          const probeUrl = `${base}%24_${n}.JPG${query}`;
          try {
            const head = await fetch(probeUrl, { method: "HEAD" });
            return head.ok ? probeUrl : null;
          } catch {
            return null;
          }
        }),
      );
      // Insert gallery images at the FRONT (highest priority) and stop at first gap
      const galleryImages: string[] = [];
      for (const p of probes) {
        if (p) galleryImages.push(p);
        else break;
      }
      console.log(`Gallery enumeration found ${galleryImages.length} sequential images`);
      // Prepend gallery images, then add others (avoiding duplicates is fine — different URL pattern)
      const merged = [...galleryImages, ...images.filter((i) => !galleryImages.includes(i))];
      images.length = 0;
      for (const i of merged) images.push(i);
    } else if (isEbayUrl && hasScopedEbayGallery) {
      console.log("Skipping legacy $_N.JPG enumeration because scoped eBay listing gallery was found");
    }

    const candidateImages = images.slice(0, 12);
    console.log(`Found ${images.length} unique images, using ${candidateImages.length} candidates (resolved: ${resolvedUrl})`);

    // Use Gemini to classify images into angles
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (candidateImages.length >= 2 && LOVABLE_API_KEY) {
      try {
        console.log("Using Gemini to classify", candidateImages.length, "images");

        const imageContents = candidateImages.map((imgUrl) => ({
          type: "image_url" as const,
          image_url: { url: imgUrl },
        }));

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `You are a Funko Pop listing image classifier. You receive up to 12 images from an eBay listing — they are almost ALL photos of the same Funko Pop box from different angles.

Classify images into these 6 categories: front, left, right, back, bottom, macro.
- front: Front of the box showing the figure through the clear window (POP! logo + character visible)
- left: Left side panel of the box (narrow side, usually with character name vertically)
- right: Right side panel (narrow side, often with barcode or character name)
- back: Back panel showing the character lineup / series collection
- bottom: Bottom of the box (barcode, serial number, manufacturing info)
- macro: Close-up detail shot (exclusive sticker, POP! logo, condition detail, defect)

CRITICAL RULES:
- ASSUME every image is a valid Funko Pop photo unless it's obviously a logo/shipping label/text-only graphic.
- You MUST fill as many of the 6 slots as possible. Aim for 5-6 mappings minimum when given 6+ images.
- Each category can only be assigned ONCE — pick the BEST image for each angle.
- If unsure between two angles, make your best guess rather than skipping.
- If you have multiple "front-looking" images, the clearest/most centered one is "front", others can be "macro" or another angle.
- You MUST call the provided function with your classification.`,
              },
              {
                role: "user",
                content: [
                  { type: "text", text: `Classify these ${candidateImages.length} Funko Pop listing images (indexed 0 to ${candidateImages.length - 1}) into the 6 angles. Fill as many slots as you can — at minimum front, back, and 1-2 sides should be assigned.` },
                  ...imageContents,
                ],
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "classify_images",
                  description: "Map marketplace images to Funko Pop photo angles. Each angle can appear at most once.",
                  parameters: {
                    type: "object",
                    properties: {
                      mappings: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            imageIndex: { type: "integer", description: "Index of the image (0-based)" },
                            angle: { type: "string", enum: ["front", "left", "right", "back", "bottom", "macro"] },
                          },
                          required: ["imageIndex", "angle"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["mappings"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "classify_images" } },
          }),
        });

        if (aiResponse.ok) {
          const aiResult = await aiResponse.json();
          const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            const { mappings } = JSON.parse(toolCall.function.arguments);
            const classified: Record<string, string> = {};
            for (const m of mappings) {
              if (m.imageIndex >= 0 && m.imageIndex < candidateImages.length && !classified[m.angle]) {
                classified[m.angle] = candidateImages[m.imageIndex];
              }
            }
            console.log("Gemini classified:", Object.keys(classified));

            // Fallback: if Gemini under-classified, fill missing slots sequentially.
            // eBay convention: $_1=front, $_2=back, $_3=left, $_4=right, $_5=bottom, $_6=macro
            const order: Array<keyof typeof slotMap | string> = ["front", "back", "left", "right", "bottom", "macro"];
            const slotMap: Record<string, number> = { front: 0, back: 1, left: 2, right: 3, bottom: 4, macro: 5 };
            if (Object.keys(classified).length < 3) {
              console.log("Under-classified — applying sequential fallback");
              const usedUrls = new Set(Object.values(classified));
              for (const angle of order) {
                if (classified[angle as string]) continue;
                const preferredIdx = slotMap[angle as string];
                // Try preferred index first, then any unused image
                const tryIdx = preferredIdx < candidateImages.length && !usedUrls.has(candidateImages[preferredIdx])
                  ? preferredIdx
                  : candidateImages.findIndex((u) => !usedUrls.has(u));
                if (tryIdx >= 0 && tryIdx < candidateImages.length) {
                  classified[angle as string] = candidateImages[tryIdx];
                  usedUrls.add(candidateImages[tryIdx]);
                }
              }
              console.log("After fallback:", Object.keys(classified));
            }

            return new Response(JSON.stringify({ images: candidateImages, classified }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else {
          const errText = await aiResponse.text();
          console.error("Gemini classification failed:", aiResponse.status, errText);
        }
      } catch (aiErr) {
        console.error("Gemini classification error, falling back:", aiErr);
      }
    }

    console.log(`Returning ${candidateImages.length} images (no AI classification)`);
    return new Response(JSON.stringify({ images: candidateImages }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scrape-listing error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Scraping failed",
        fallback: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
