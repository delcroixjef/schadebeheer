ALTER TABLE public.referentieprijzen ADD COLUMN IF NOT EXISTS maximale_basisprijs numeric NULL;
ALTER TABLE public.referentieprijzen ADD COLUMN IF NOT EXISTS categorie_text text NULL;