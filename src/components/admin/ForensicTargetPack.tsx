import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileUp, FlaskConical, ShieldCheck, ShieldX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Product = { id: string; canonical_name: string; pop_number: string; franchise: string; status: string; version: number };
type Variant = { id: string; product_id: string; release_label: string | null; region: string | null; sticker_variant: string | null; status: string; version: number };
type Reference = {
  id: string; product_id: string; variant_id: string; classification: "original" | "counterfeit";
  image_view: string; visible_region: string; factual_observation: string; provenance_type: string;
  provenance_description: string; source_owner: string; validator_identity: string | null;
  validation_date: string | null; reliability_tier: string; status: string; file_hash: string | null;
  file_mime_type: string | null; file_size_bytes: number | null; storage_path: string; version: number;
};

const VIEWS = ["front", "rear", "left", "right", "top", "bottom", "macro"] as const;
const CLASSIFICATIONS = ["original", "counterfeit"] as const;
const MAX_REFERENCE_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_REFERENCE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  return crypto.subtle.digest("SHA-256", buffer).then((digest) =>
    Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join(""),
  );
}

function eligibility(reference: Reference): boolean {
  return reference.status === "verified" &&
    reference.reliability_tier === "verified" &&
    Boolean(reference.provenance_type && reference.provenance_description && reference.source_owner) &&
    Boolean(reference.validator_identity && reference.validation_date && reference.file_hash && reference.file_mime_type && reference.file_size_bytes);
}

export function ForensicTargetPack({ userId }: { userId: string }) {
  const db = supabase as any;
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [references, setReferences] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [productForm, setProductForm] = useState({ name: "Saul Goodman", popNumber: "163", franchise: "Breaking Bad" });
  const [variantForm, setVariantForm] = useState({ releaseLabel: "", region: "", stickerVariant: "", barcodes: "", factoryVariations: "", yearFrom: "", yearTo: "" });
  const [referenceForm, setReferenceForm] = useState({
    classification: "original" as "original" | "counterfeit", imageView: "front", visibleRegion: "",
    factualObservation: "", severity: "informational", provenanceType: "", provenanceDescription: "", sourceOwner: "",
    captureDate: "", reliabilityTier: "limited", validatorIdentity: "", validationDate: "",
  });

  const selectedProduct = products.find((product) => product.id === productId) || null;
  const selectedVariant = variants.find((variant) => variant.id === variantId) || null;
  const visibleVariants = useMemo(() => variants.filter((variant) => variant.product_id === productId), [variants, productId]);
  const selectedReferences = useMemo(() => references.filter((reference) => reference.variant_id === variantId), [references, variantId]);

  const refresh = async () => {
    setLoading(true);
    const [productResult, variantResult, referenceResult] = await Promise.all([
      db.from("forensic_products").select("id, canonical_name, pop_number, franchise, status, version").order("created_at", { ascending: false }),
      db.from("forensic_product_variants").select("id, product_id, release_label, region, sticker_variant, status, version").order("created_at", { ascending: false }),
      db.from("verified_reference_images").select("id, product_id, variant_id, classification, image_view, visible_region, factual_observation, provenance_type, provenance_description, source_owner, validator_identity, validation_date, reliability_tier, status, file_hash, file_mime_type, file_size_bytes, storage_path, version").order("created_at", { ascending: false }),
    ]);
    if (productResult.error || variantResult.error || referenceResult.error) toast.error("Unable to load private forensic curation records.");
    const nextProducts = (productResult.data || []) as Product[];
    const nextVariants = (variantResult.data || []) as Variant[];
    setProducts(nextProducts); setVariants(nextVariants); setReferences((referenceResult.data || []) as Reference[]);
    setProductId((current) => current || nextProducts[0]?.id || "");
    setVariantId((current) => current || nextVariants.find((variant) => variant.product_id === (productId || nextProducts[0]?.id))?.id || "");
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (variantId && visibleVariants.some((variant) => variant.id === variantId)) return;
    setVariantId(visibleVariants[0]?.id || "");
  }, [productId, visibleVariants, variantId]);

  const createProduct = async () => {
    if (!productForm.name.trim() || !productForm.popNumber.trim() || !productForm.franchise.trim()) return toast.error("Product name, Pop number, and franchise are required.");
    setBusy(true);
    const { data, error } = await db.from("forensic_products").insert({
      canonical_name: productForm.name.trim(), pop_number: productForm.popNumber.replace("#", "").trim(), franchise: productForm.franchise.trim(), created_by: userId,
    }).select("id").single();
    setBusy(false);
    if (error) return toast.error(error.message || "Target product was not created.");
    await refresh(); setProductId(data.id); toast.success("Draft Saul target product created. Add the exact release variant next.");
  };

  const createVariant = async () => {
    if (!productId) return toast.error("Create or select the Saul Goodman target product first.");
    setBusy(true);
    const { data, error } = await db.from("forensic_product_variants").insert({
      product_id: productId, release_label: variantForm.releaseLabel || null, region: variantForm.region || null,
      sticker_variant: variantForm.stickerVariant || null,
      legitimate_barcodes: variantForm.barcodes.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean),
      production_factory_variations: variantForm.factoryVariations.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
      release_year_from: variantForm.yearFrom ? Number(variantForm.yearFrom) : null,
      release_year_to: variantForm.yearTo ? Number(variantForm.yearTo) : null,
      created_by: userId,
    }).select("id").single();
    setBusy(false);
    if (error) return toast.error(error.message || "Exact release variant was not created.");
    await refresh(); setVariantId(data.id); toast.success("Draft exact variant created. It is not analysis-eligible.");
  };

  const uploadReference = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !productId || !variantId) return toast.error("Select the exact target variant and a reference file.");
    if (!ALLOWED_REFERENCE_MIME_TYPES.includes(file.type) || file.size < 1 || file.size > MAX_REFERENCE_FILE_BYTES) {
      return toast.error("Reference files must be JPEG, PNG, or WebP and no more than 10 MB.");
    }
    if (!referenceForm.visibleRegion.trim() || !referenceForm.factualObservation.trim() || !referenceForm.provenanceType.trim() || !referenceForm.provenanceDescription.trim() || !referenceForm.sourceOwner.trim()) {
      return toast.error("Visible region, factual observation, and complete provenance are required before upload.");
    }
    setBusy(true);
    const { data: draft, error: draftError } = await db.rpc("create_forensic_reference_draft", {
      p_product_id: productId, p_variant_id: variantId, p_classification: referenceForm.classification,
      p_image_view: referenceForm.imageView, p_visible_region: referenceForm.visibleRegion.trim(),
      p_factual_observation: referenceForm.factualObservation.trim(), p_severity: referenceForm.severity,
      p_provenance_type: referenceForm.provenanceType.trim(), p_provenance_description: referenceForm.provenanceDescription.trim(),
      p_source_owner: referenceForm.sourceOwner.trim(), p_capture_date: referenceForm.captureDate || null,
      p_reliability_tier: referenceForm.reliabilityTier,
    });
    const reference = Array.isArray(draft) ? draft[0] : draft;
    if (draftError || !reference?.id || !reference?.storage_path) {
      setBusy(false); return toast.error(draftError?.message || "Draft reference record was not created.");
    }
    const { error: storageError } = await supabase.storage.from("forensic-reference-files").upload(reference.storage_path, file, { upsert: false, contentType: file.type });
    if (storageError) { setBusy(false); return toast.error("Private reference upload failed; the record remains a non-eligible draft."); }
    const hash = await sha256Hex(await file.arrayBuffer());
    const { error: finalizeError } = await db.rpc("finalize_forensic_reference_upload", { p_reference_id: reference.id, p_file_hash: hash });
    setBusy(false);
    if (finalizeError) return toast.error("Upload metadata validation failed; the reference remains a draft.");
    await refresh(); toast.success("Private reference uploaded as draft. A named validator must verify it before use.");
  };

  const changeReferenceStatus = async (reference: Reference, status: "verified" | "retired") => {
    if (status === "verified" && (!referenceForm.validatorIdentity.trim() || !referenceForm.validationDate)) {
      return toast.error("A named validator and validation date are required before verification.");
    }
    setBusy(true);
    if (status === "verified") {
      const { error: tierError } = await db.from("verified_reference_images").update({ reliability_tier: "verified" }).eq("id", reference.id);
      if (tierError) { setBusy(false); return toast.error("Unable to set the verified reliability tier."); }
    }
    const { error } = await db.rpc("set_forensic_reference_status", {
      p_reference_id: reference.id, p_status: status,
      p_validator_identity: status === "verified" ? referenceForm.validatorIdentity.trim() : null,
      p_validation_date: status === "verified" ? referenceForm.validationDate : null,
    });
    setBusy(false);
    if (error) return toast.error(error.message || "Reference status was not updated.");
    await refresh(); toast.success(status === "verified" ? "Reference verified and eligible only for its exact variant/view." : "Reference retired; it is no longer eligible.");
  };

  return <div className="space-y-6">
    <div>
      <h2 className="font-display text-xl font-bold flex items-center gap-2"><FlaskConical className="w-5 h-5 text-primary" /> Saul Goodman #163 forensic target pack</h2>
      <p className="text-sm text-muted-foreground mt-1">Private, versioned research curation. No draft, legacy, retired, or unmatched reference can influence analysis.</p>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">1. Target product</CardTitle></CardHeader><CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2"><Input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder="Product name" /><Input value={productForm.popNumber} onChange={(e) => setProductForm({ ...productForm, popNumber: e.target.value })} placeholder="Pop number" /></div>
        <Input value={productForm.franchise} onChange={(e) => setProductForm({ ...productForm, franchise: e.target.value })} placeholder="Franchise / series" />
        <Button size="sm" disabled={busy} onClick={createProduct}>Create draft target</Button>
        <Select value={productId} onValueChange={setProductId}><SelectTrigger><SelectValue placeholder="Select target product" /></SelectTrigger><SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.canonical_name} #{product.pop_number} · {product.status} v{product.version}</SelectItem>)}</SelectContent></Select>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">2. Exact release variant</CardTitle></CardHeader><CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2"><Input value={variantForm.releaseLabel} onChange={(e) => setVariantForm({ ...variantForm, releaseLabel: e.target.value })} placeholder="Release / variant label" /><Input value={variantForm.region} onChange={(e) => setVariantForm({ ...variantForm, region: e.target.value })} placeholder="Region" /></div>
        <div className="grid grid-cols-2 gap-2"><Input value={variantForm.stickerVariant} onChange={(e) => setVariantForm({ ...variantForm, stickerVariant: e.target.value })} placeholder="Sticker variant" /><Input value={variantForm.barcodes} onChange={(e) => setVariantForm({ ...variantForm, barcodes: e.target.value })} placeholder="Legitimate barcode(s)" /></div>
        <Textarea value={variantForm.factoryVariations} onChange={(e) => setVariantForm({ ...variantForm, factoryVariations: e.target.value })} placeholder="Known production/factory variations, one per line" />
        <div className="grid grid-cols-2 gap-2"><Input type="number" value={variantForm.yearFrom} onChange={(e) => setVariantForm({ ...variantForm, yearFrom: e.target.value })} placeholder="Release year from" /><Input type="number" value={variantForm.yearTo} onChange={(e) => setVariantForm({ ...variantForm, yearTo: e.target.value })} placeholder="Release year to" /></div>
        <Button size="sm" disabled={busy || !productId} onClick={createVariant}>Create draft variant</Button>
        <Select value={variantId} onValueChange={setVariantId}><SelectTrigger><SelectValue placeholder="Select exact variant" /></SelectTrigger><SelectContent>{visibleVariants.map((variant) => <SelectItem key={variant.id} value={variant.id}>{variant.release_label || "Unlabelled release"} · {variant.region || "region unrecorded"} · {variant.status} v{variant.version}</SelectItem>)}</SelectContent></Select>
      </CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle className="text-base">3. Private original / counterfeit reference</CardTitle></CardHeader><CardContent className="space-y-3">
      <div className="grid md:grid-cols-3 gap-2"><Select value={referenceForm.classification} onValueChange={(value) => setReferenceForm({ ...referenceForm, classification: value as "original" | "counterfeit" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CLASSIFICATIONS.map((value) => <SelectItem key={value} value={value}>{value === "original" ? "Verified original" : "Known counterfeit"}</SelectItem>)}</SelectContent></Select><Select value={referenceForm.imageView} onValueChange={(value) => setReferenceForm({ ...referenceForm, imageView: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{VIEWS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Input value={referenceForm.visibleRegion} onChange={(e) => setReferenceForm({ ...referenceForm, visibleRegion: e.target.value })} placeholder="Visible region" /></div>
      <Textarea value={referenceForm.factualObservation} onChange={(e) => setReferenceForm({ ...referenceForm, factualObservation: e.target.value })} placeholder="Factual, visible observation only — no verdict or score" />
      <div className="grid md:grid-cols-3 gap-2"><Input value={referenceForm.provenanceType} onChange={(e) => setReferenceForm({ ...referenceForm, provenanceType: e.target.value })} placeholder="Provenance type" /><Input value={referenceForm.sourceOwner} onChange={(e) => setReferenceForm({ ...referenceForm, sourceOwner: e.target.value })} placeholder="Source owner / contributor" /><Input type="date" value={referenceForm.captureDate} onChange={(e) => setReferenceForm({ ...referenceForm, captureDate: e.target.value })} /></div>
      <Textarea value={referenceForm.provenanceDescription} onChange={(e) => setReferenceForm({ ...referenceForm, provenanceDescription: e.target.value })} placeholder="Provenance description and chain of custody" />
      <div className="grid md:grid-cols-3 gap-2"><Select value={referenceForm.reliabilityTier} onValueChange={(value) => setReferenceForm({ ...referenceForm, reliabilityTier: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="limited">limited (draft)</SelectItem><SelectItem value="verified">verified (still needs validator)</SelectItem></SelectContent></Select><Input value={referenceForm.validatorIdentity} onChange={(e) => setReferenceForm({ ...referenceForm, validatorIdentity: e.target.value })} placeholder="Named validator" /><Input type="date" value={referenceForm.validationDate} onChange={(e) => setReferenceForm({ ...referenceForm, validationDate: e.target.value })} /></div>
      <Label className="block border border-dashed border-border rounded-lg p-4 text-sm cursor-pointer hover:bg-secondary/40"><span className="flex items-center gap-2"><FileUp className="w-4 h-4" /> Upload private JPEG, PNG, or WebP (max 10 MB)</span><Input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !selectedProduct || !selectedVariant} onChange={uploadReference} /></Label>
      <p className="text-xs text-muted-foreground">Files use an opaque private path. The browser never receives a public URL or storage credential. Uploading creates only a draft.</p>
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base">4. Curation status {loading ? "" : `(${selectedReferences.length})`}</CardTitle></CardHeader><CardContent className="space-y-3">
      {!variantId ? <p className="text-sm text-muted-foreground">Select an exact draft variant to view its private references.</p> : selectedReferences.length === 0 ? <p className="text-sm text-muted-foreground">No references yet. No analysis retrieval is possible.</p> : selectedReferences.map((reference) => <div className="rounded-lg border border-border/70 p-3 space-y-2" key={reference.id}><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{reference.classification}</Badge><Badge variant="outline">{reference.image_view}</Badge><Badge className={eligibility(reference) ? "bg-success text-success-foreground" : "bg-secondary text-secondary-foreground"}>{eligibility(reference) ? "eligible" : reference.status}</Badge><span className="text-xs text-muted-foreground font-mono">v{reference.version} · private file hash {reference.file_hash ? "recorded" : "pending"}</span></div><p className="text-sm">{reference.factual_observation}</p><p className="text-xs text-muted-foreground">{reference.visible_region} · {reference.provenance_type} · {reference.source_owner}</p><div className="flex gap-2">{reference.status === "draft" && <Button size="sm" disabled={busy} onClick={() => changeReferenceStatus(reference, "verified")}><CheckCircle2 className="w-4 h-4 mr-1" /> Verify</Button>}{reference.status !== "retired" && <Button size="sm" variant="outline" disabled={busy} onClick={() => changeReferenceStatus(reference, "retired")}><ShieldX className="w-4 h-4 mr-1" /> Retire</Button>}</div></div>)}
    </CardContent></Card>
    <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="w-4 h-4 text-primary" /> Decision-v2 remains authoritative. Reference presence never creates a verdict or score.</div>
  </div>;
}
