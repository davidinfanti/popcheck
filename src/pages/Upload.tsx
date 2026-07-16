import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ScanLine, Loader2, Rocket, AlertTriangle, Check } from "lucide-react";
import UrlImportBar from "@/components/upload/UrlImportBar";
import DropZone from "@/components/upload/DropZone";

const SLOTS = [
  { key: "front", label: "Front", emoji: "📷", tip: "Full front of box with figure visible", required: true },
  { key: "left", label: "Left Side", emoji: "⬅️", tip: "Left side panel artwork", required: false },
  { key: "right", label: "Right Side", emoji: "➡️", tip: "Right side panel artwork", required: false },
  { key: "back", label: "Back", emoji: "🔄", tip: "Back panel with character lineup", required: false },
  { key: "bottom", label: "Bottom", emoji: "📊", tip: "Barcode, serial number, manufacturer info", required: false },
  { key: "macro", label: "Macro", emoji: "🔬", tip: "Close-up of POP! logo and stickers", required: false },
] as const;

const FORENSIC_PHASES = [
  "Phase 0 · OCR identification of Name, Number, Line...",
  "Phase 1 · Market & metadata audit (PPG, origin flags)...",
  "Phase 2 · Macro-box forensics (white border, cardboard)...",
  "Phase 3 · Micro-print & typography (halftone, kerning)...",
  "Phase 4 · Vinyl figure audit (stamp match, paint job)...",
  "Phase 5 · Sticker & QR special features...",
  "Cross-referencing Lynnwood Protocol & reference library...",
  "Compiling V-STAMP verdict band...",
];

export default function UploadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [images, setImages] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    if (!uploading) {
      setPhaseIndex(0);
      return;
    }
    const id = setInterval(() => {
      setPhaseIndex((p) => Math.min(p + 1, FORENSIC_PHASES.length - 1));
    }, 2200);
    return () => clearInterval(id);
  }, [uploading]);

  const completedCount = SLOTS.filter((s) => !!images[s.key]).length;
  const hasFront = !!images["front"];

  const handleImage = useCallback((key: string, file: File) => {
    setImages((prev) => ({ ...prev, [key]: file }));
    const url = URL.createObjectURL(file);
    setPreviews((prev) => {
      if (prev[key]) URL.revokeObjectURL(prev[key]);
      return { ...prev, [key]: url };
    });
  }, []);

  const removeImage = useCallback((key: string) => {
    setImages((prev) => ({ ...prev, [key]: null }));
    setPreviews((prev) => {
      const next = { ...prev };
      if (next[key]) URL.revokeObjectURL(next[key]);
      delete next[key];
      return next;
    });
  }, []);

  const handleUrlImport = useCallback(async (scrapedUrls: Record<string, string>) => {
    for (const [key, imgUrl] of Object.entries(scrapedUrls)) {
      try {
        const resp = await fetch(imgUrl);
        const blob = await resp.blob();
        const file = new File([blob], `${key}.jpg`, { type: blob.type || "image/jpeg" });
        handleImage(key, file);
      } catch {
        setPreviews((prev) => ({ ...prev, [key]: imgUrl }));
      }
    }
  }, [handleImage]);

  // Store external URLs for direct pass-through to edge function
  const [externalUrls, setExternalUrls] = useState<Record<string, string>>({});

  const handleAutoAnalyze = useCallback(async (scrapedUrls: Record<string, string>) => {
    if (!user) {
      toast.error("You must log in to start the analysis.");
      return;
    }
    setExternalUrls(scrapedUrls);
    await runAnalysis(scrapedUrls);
  }, [user]);

  const runAnalysis = async (directUrls?: Record<string, string>) => {
    if (!user) return;
    setUploading(true);
    try {
      const imageUrls: string[] = [];
      const slotKeys = SLOTS.map(s => s.key);
      const urls = directUrls || externalUrls;

      for (const key of slotKeys) {
        const file: File | null = images[key] || null;

        // If we have a local file, upload it to storage
        if (file) {
          const ext = file.name.split(".").pop();
          const path = `${user.id}/${Date.now()}-${key}.${ext}`;
          const { error } = await supabase.storage.from("funko-images").upload(path, file);
          if (error) throw error;
          const { data: urlData } = supabase.storage.from("funko-images").getPublicUrl(path);
          imageUrls.push(urlData.publicUrl);
        } else if (urls?.[key]) {
          // Pass external URLs directly — the edge function / Gemini can fetch them server-side
          imageUrls.push(urls[key]);
        }
      }

      if (imageUrls.length === 0) {
        toast.error("Please upload at least the front photo.");
        setUploading(false);
        return;
      }

      const { data: authRecord, error: insertError } = await supabase
        .from("authentications")
        .insert({
          user_id: user.id,
          image_urls: imageUrls,
          status: "analyzing",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const { error: fnError } = await supabase.functions.invoke("analyze-funko", {
        body: { authenticationId: authRecord.id, imageUrls, photoCount: imageUrls.length },
      });

      if (fnError) throw fnError;
      toast.success("Analysis complete!");
      navigate(`/results/${authRecord.id}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Analysis failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // Full-screen analyzing overlay
  if (uploading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6 max-w-md mx-auto px-6"
        >
          <div className="relative mx-auto w-20 h-20">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="absolute inset-0 rounded-full border-2 border-primary/30 border-t-primary"
            />
            <ScanLine className="absolute inset-0 m-auto w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-foreground mb-2">V-STAMP Analysis in progress...</h2>
            <p className="text-sm text-muted-foreground">
              Uploading and running forensic analysis on {completedCount} photos. This takes a few seconds.
            </p>
          </div>

          {/* Real-time forensic phase ticker */}
          <div className="text-left rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
            {FORENSIC_PHASES.map((label, i) => {
              const done = i < phaseIndex;
              const active = i === phaseIndex;
              return (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="mt-0.5 shrink-0">
                    {done ? (
                      <Check className="w-3.5 h-3.5 text-success" />
                    ) : active ? (
                      <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-border" />
                    )}
                  </div>
                  <span
                    className={`text-[11px] font-mono leading-tight ${
                      active ? "text-foreground" : done ? "text-muted-foreground line-through" : "text-muted-foreground/50"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center gap-4 px-6 py-4 max-w-4xl mx-auto">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg font-bold tracking-tight">Upload Photos</h2>
          </div>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{completedCount}/6 photos</span>
      </nav>

      <main className="max-w-4xl mx-auto px-6 pb-20 space-y-6">
        {/* URL Import */}
        <UrlImportBar onImagesScraped={handleUrlImport} onAutoAnalyze={handleAutoAnalyze} />

        {/* Accuracy warning */}
        {completedCount > 0 && completedCount < 6 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30"
          >
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-xs text-foreground">
              Partial analysis ({completedCount}/6 photos). Upload more angles for 100% accuracy.
            </p>
          </motion.div>
        )}

        {/* Photo Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {SLOTS.map((slot) => (
            <div key={slot.key} className="space-y-1">
              <div className="flex items-center gap-1.5 px-1">
                <span className="text-base">{slot.emoji}</span>
                <span className="text-xs font-semibold text-foreground">{slot.label}</span>
                {slot.required && <span className="text-[10px] text-destructive font-mono">*</span>}
              </div>
              <DropZone
                stepKey={slot.key}
                label={slot.label}
                tip={slot.tip}
                preview={previews[slot.key] || null}
                onFile={(file) => handleImage(slot.key, file)}
                onRemove={() => removeImage(slot.key)}
              />
            </div>
          ))}
        </div>

        {/* Analyze button — always visible */}
        <div className="sticky bottom-6 z-10">
          <Button
            className="w-full h-12 text-base font-bold shadow-lg"
            disabled={!hasFront || uploading}
            onClick={() => runAnalysis()}
          >
            <Rocket className="w-5 h-5 mr-2" />
            {hasFront
              ? `Analyze now (${completedCount}/6 photos)`
              : "Upload at least the front photo"}
          </Button>
        </div>
      </main>
    </div>
  );
}
