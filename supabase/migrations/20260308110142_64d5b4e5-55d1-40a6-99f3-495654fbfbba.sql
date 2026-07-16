
-- Rename columns in original_references
ALTER TABLE public.original_references RENAME COLUMN box_part TO part_type;
ALTER TABLE public.original_references RENAME COLUMN note TO expert_note;
ALTER TABLE public.original_references DROP COLUMN IF EXISTS created_by;

-- Rename columns in fake_references
ALTER TABLE public.fake_references RENAME COLUMN box_part TO part_type;
ALTER TABLE public.fake_references RENAME COLUMN note TO detected_flaw;
ALTER TABLE public.fake_references DROP COLUMN IF EXISTS created_by;
