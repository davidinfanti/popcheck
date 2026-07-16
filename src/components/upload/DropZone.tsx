import { useState, useCallback, useRef } from "react";
import { Camera, X, Check, Upload } from "lucide-react";

interface DropZoneProps {
  stepKey: string;
  label: string;
  tip: string;
  preview: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
}

export default function DropZone({ stepKey, label, tip, preview, onFile, onRemove }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items?.length) setDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) onFile(file);
  }, [onFile]);

  return (
    <div
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => !preview && inputRef.current?.click()}
      className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed cursor-pointer transition-all overflow-hidden aspect-[4/3] ${
        preview
          ? "border-primary bg-primary/5"
          : dragging
            ? "border-primary bg-primary/10 scale-[1.02]"
            : "border-muted-foreground/30 hover:border-primary hover:bg-primary/5"
      }`}
    >
      {preview ? (
        <>
          <img src={preview} alt={label} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="scan-line absolute inset-0" />
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="absolute top-3 right-3 bg-destructive text-destructive-foreground rounded-full p-1.5 z-10 hover:scale-110 transition-transform"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="absolute bottom-3 left-3 bg-primary/90 text-primary-foreground px-3 py-1 rounded-full text-xs font-mono z-10 flex items-center gap-1">
            <Check className="w-3 h-3" /> CAPTURED
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 p-8 pointer-events-none">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${
            dragging ? "bg-primary/20" : "bg-secondary"
          }`}>
            {dragging ? (
              <Upload className="w-8 h-8 text-primary" />
            ) : (
              <Camera className="w-8 h-8 text-muted-foreground" />
            )}
          </div>
          <span className="text-sm font-semibold text-muted-foreground">
            {dragging ? "Drop image here" : "Drag & drop or tap to upload"}
          </span>
          <span className="text-xs text-muted-foreground/60 max-w-xs text-center">💡 {tip}</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
