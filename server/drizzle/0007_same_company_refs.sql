-- Row-level security doesn't apply to foreign-key checks, so a client could point a
-- row at another company's record by id (e.g. a quote on someone else's customer).
-- For every foreign key between company tables, add a twin that also requires the
-- same organization_id on both sides. Generated from the catalog so none is missed.
DO $$
DECLARE
  tenant text[] := array['customers','categories','products','price_list_items','product_variants','discount_tiers',
    'category_discount_ceilings','warehouses','stock','subscription_plans','product_pairings','app_settings',
    'quotations','quote_lines','approvals','audit_log','fulfillment_allocations','invoices','billing_schedules',
    'payments','credit_notes','negotiation_requests'];
  fk record;
BEGIN
  FOR fk IN
    SELECT c.conname, src.relname AS child, dst.relname AS parent, a.attname AS col, b.attname AS refcol
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_class dst ON dst.oid = c.confrelid
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    JOIN pg_attribute b ON b.attrelid = c.confrelid AND b.attnum = c.confkey[1]
    WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
      AND src.relname = ANY (tenant) AND dst.relname = ANY (tenant)
      AND a.attname <> 'organization_id'
  LOOP
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (organization_id, %I)',
                   fk.parent || '_org_' || fk.refcol || '_uq', fk.parent, fk.refcol);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (organization_id, %I) REFERENCES %I (organization_id, %I)',
                   fk.child, left(fk.conname, 50) || '_same_org', fk.col, fk.parent, fk.refcol);
  END LOOP;
END $$;
