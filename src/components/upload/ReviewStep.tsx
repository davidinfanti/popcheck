import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ScanLine, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface Step {
  key: string;
  label: string;
}

interface ReviewStepProps {
  steps: readonly Step[];
  previews: Record<string, string>;
  popName: string;
  popNumber: string;
  onPopNameChange: (v: string) => void;
  onPopNumberChange: (v: string) => void;
  allUploaded: boolean;
  uploading: boolean;
  onSubmit: () => void;
  onEditStep: (i: number) => void;
  onRestart: () => void;
}

export default function ReviewStep({
  steps, previews, popName, popNumber,
  onPopNameChange, onPopNumberChange,
  allUploaded, uploading, onSubmit, onEditStep, onRestart,
}: ReviewStepProps) {
  return (
    <motion.div
      key="review"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.25 }}
    >
      <h3 className="font-display text-2xl font-black mb-2">Review & Submit</h3>
      <p className="text-muted-foreground mb-6">
        All 6 photos captured. Add Pop details (optional) and start forensic analysis.
      </p>

      <div className="grid grid-cols-3 gap-2 mb-6">
        {steps.map((s, i) => (
          <div key={s.key} className="relative aspect-square rounded-lg overflow-hidden border border-border">
            {previews[s.key] ? (
              <img src={previews[s.key]} alt={s.label} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground text-xs">Missing</div>
            )}
            <span className="absolute bottom-1 left-1 bg-background/80 text-[10px] font-mono px-1.5 py-0.5 rounded">{s.label}</span>
            <button
              onClick={() => onEditStep(i)}
              className="absolute top-1 right-1 bg-background/80 text-[10px] font-mono px-1.5 py-0.5 rounded hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              Edit
            </button>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <div className="space-y-2">
          <Label htmlFor="popName" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Pop Name (optional)</Label>
          <Input id="popName" value={popName} onChange={(e) => onPopNameChange(e.target.value)} placeholder="e.g. Saul Goodman" className="bg-secondary border-border" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="popNumber" className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Pop Number (optional)</Label>
          <Input id="popNumber" value={popNumber} onChange={(e) => onPopNumberChange(e.target.value)} placeholder="e.g. #314" className="bg-secondary border-border" />
        </div>
      </div>

      <Button size="lg" className="w-full font-bold text-lg py-6 rounded-2xl animate-pulse-glow" disabled={!allUploaded || uploading} onClick={onSubmit}>
        {uploading ? (
          <span className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Recording structured observations...</span>
        ) : (
          <span className="flex items-center gap-2"><ScanLine className="w-5 h-5" /> Start AI-assisted assessment</span>
        )}
      </Button>

      <Button variant="outline" className="w-full mt-3" onClick={onRestart}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Re-capture Photos
      </Button>
    </motion.div>
  );
}
