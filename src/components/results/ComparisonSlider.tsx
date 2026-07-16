import { ReactCompareSlider, ReactCompareSliderImage } from "react-compare-slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers } from "lucide-react";

interface ComparisonSliderProps {
  userImageUrl: string;
  referenceImageUrl: string;
  popName?: string;
}

export default function ComparisonSlider({ userImageUrl, referenceImageUrl, popName }: ComparisonSliderProps) {
  return (
    <Card className="border-border/50 overflow-hidden">
      <CardHeader>
        <CardTitle className="font-display text-lg tracking-tight flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          Comparison View
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Slide to compare your photo (left) with the official reference (right)
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative aspect-square max-h-[500px] overflow-hidden">
          <ReactCompareSlider
            itemOne={
              <ReactCompareSliderImage
                src={userImageUrl}
                alt="Your photo"
                style={{ objectFit: "contain", width: "100%", height: "100%", background: "hsl(222 47% 6%)" }}
              />
            }
            itemTwo={
              <ReactCompareSliderImage
                src={referenceImageUrl}
                alt={`Official reference${popName ? ` — ${popName}` : ""}`}
                style={{ objectFit: "contain", width: "100%", height: "100%", background: "hsl(222 47% 6%)" }}
              />
            }
            position={50}
            style={{ height: "100%" }}
          />
          <div className="absolute bottom-3 left-3 bg-card/80 backdrop-blur px-2 py-1 rounded text-[10px] font-mono text-muted-foreground">
            YOUR PHOTO
          </div>
          <div className="absolute bottom-3 right-3 bg-card/80 backdrop-blur px-2 py-1 rounded text-[10px] font-mono text-primary">
            OFFICIAL REF
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
