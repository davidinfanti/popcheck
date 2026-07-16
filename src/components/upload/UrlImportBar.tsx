import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { Link2, Loader2, Rocket, AlertTriangle, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";
import { isApprovedEbayUrl } from "../../../supabase/functions/_shared/ebay-url";

interface UrlImportBarProps {
  onImagesScraped: (images: Record<string, string>) => void;
  onAutoAnalyze: (images: Record<string, string>) => void;
}

type Phase = "idle" | "fetching" | "classifying" | "done" | "partial";

const PHASE_LABELS: Record<Phase, string> = {
  idle: "",
  fetching: "Fetching images from listing...",
  classifying: "AI classification in progress...",
  done: "Starting forensic analysis...",
  partial: "",
};

export default function UrlImportBar({ onImagesScraped, onAutoAnalyze }: UrlImportBarProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [partialImages, setPartialImages] = useState<Record<string, string>>({});
  const [missingKeys, setMissingKeys] = useState<string[]>([]);

  const progressValue = phase === "fetching" ? 33 : phase === "classifying" ? 66 : phase === "done" ? 100 : 0;

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    // Only allow eBay URLs
    if (!isApprovedEbayUrl(trimmed)) {
      toast.error("Only eBay links are supported at this time.");
      return;
    }

    setLoading(true);
    setPhase("fetching");
    try {
      setPhase("classifying");
      const { data, error } = await supabase.functions.invoke("scrape-listing", {
        body: { url: url.trim() },
      });
      if (error) throw error;

      if (data?.fallback || data?.error) {
        toast.warning(data?.message || "Listing unreachable. Please upload photos manually.");
        setPhase("idle");
        return;
      }

      let classified: Record<string, string> = {};

      if (data?.classified && Object.keys(data.classified).length > 0) {
        classified = data.classified;
      } else if (data?.images && data.images.length > 0) {
        const stepKeys = ["front", "left", "right", "back", "bottom", "macro"];
        data.images.slice(0, 6).forEach((imgUrl: string, i: number) => {
          if (stepKeys[i]) classified[stepKeys[i]] = imgUrl;
        });
      }

      if (Object.keys(classified).length === 0) {
        toast.warning("No images found. Please upload manually.");
        setPhase("idle");
        return;
      }

      const count = Object.keys(classified).length;
      const hasFront = !!classified["front"];
      const hasBack = !!classified["back"];
      const hasAnySide = !!classified["left"] || !!classified["right"];

      // Auto-start threshold: front + back + 1 other = 3 key photos
      if (hasFront && hasBack && hasAnySide && count >= 3) {
        setPhase("done");
        toast.success(`${count} photos classified! Starting automatic analysis...`);
        onAutoAnalyze(classified);
      } else {
        const missing = ["front", "left", "right", "back", "bottom", "macro"].filter((k) => !classified[k]);
        setPartialImages(classified);
        setMissingKeys(missing);
        setPhase("partial");
        onImagesScraped(classified);
        toast.info(`Found ${count} of 6 photos. You can complete or start the analysis.`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Unable to import images. Please upload them manually.");
      setPhase("idle");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Import from Marketplace</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Paste an eBay link — AI will classify the photos and start the analysis.
      </p>
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.ebay.com/itm/..."
          className="bg-secondary border-border text-sm"
          disabled={loading}
          onKeyDown={(e) => e.key === "Enter" && handleImport()}
        />
        <Button onClick={handleImport} disabled={loading || !url.trim()} size="sm">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import"}
        </Button>
      </div>

      <AnimatePresence>
        {phase !== "idle" && phase !== "partial" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-2"
          >
            <Progress value={progressValue} className="h-1.5" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {phase === "done" ? (
                <Check className="w-3 h-3 text-primary" />
              ) : (
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
              )}
              <span>{PHASE_LABELS[phase]}</span>
            </div>
          </motion.div>
        )}

        {phase === "partial" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-foreground font-medium mb-1">
                  Found {Object.keys(partialImages).length} of 6 photos
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  Missing: {missingKeys.map((k) => k.charAt(0).toUpperCase() + k.slice(1)).join(", ")}.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                  onClick={() => onAutoAnalyze(partialImages)}
                >
                  <Rocket className="w-3 h-3 mr-1" />
                  Analyze with available photos
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
