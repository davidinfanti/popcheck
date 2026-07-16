import { Check } from "lucide-react";

interface Step {
  key: string;
  label: string;
}

interface StepIndicatorsProps {
  steps: readonly Step[];
  currentStep: number;
  images: Record<string, File | null>;
  onStepClick: (index: number) => void;
}

export default function StepIndicators({ steps, currentStep, images, onStepClick }: StepIndicatorsProps) {
  return (
    <div className="flex justify-between mt-3">
      {steps.map((s, i) => (
        <button
          key={s.key}
          onClick={() => onStepClick(i)}
          className={`flex flex-col items-center gap-1 transition-all ${i === currentStep ? "scale-110" : ""}`}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono border transition-all ${
            images[s.key]
              ? "bg-primary text-primary-foreground border-primary"
              : i === currentStep
                ? "border-primary text-primary"
                : "border-border text-muted-foreground"
          }`}>
            {images[s.key] ? <Check className="w-3.5 h-3.5" /> : i + 1}
          </div>
          <span className={`text-[10px] font-mono hidden md:block ${
            i === currentStep ? "text-foreground" : "text-muted-foreground"
          }`}>{s.label}</span>
        </button>
      ))}
    </div>
  );
}
