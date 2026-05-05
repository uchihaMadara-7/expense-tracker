# Constraints
```sql
ALTER TABLE "Transactions"
ADD CONSTRAINT unique_transaction
UNIQUE (merchant, date, amount, ref_id);
```

# Trigger before Transactions insert
## Trigger action function
```sql
CREATE OR REPLACE FUNCTION set_transaction_category()
RETURNS trigger AS $$
BEGIN
  NEW.category := COALESCE(
    (
      SELECT cm.category
      FROM "CategoryMap" cm
      WHERE cm.merchant = NEW.merchant
    ),
    'Others'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Trigger creation
```sql
CREATE TRIGGER trg_set_transaction_category
BEFORE INSERT OR UPDATE
ON "Transactions"
FOR EACH ROW
EXECUTE FUNCTION set_transaction_category();
```

# Trigger after Transactions insert
## Trigger action function
```sql
CREATE OR REPLACE FUNCTION add_missing_category_map()
RETURNS trigger AS $$
BEGIN
  INSERT INTO "CategoryMap" (merchant, category)
  VALUES (NEW.merchant, NEW.category)
  ON CONFLICT (merchant) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Trigger creation
```sql
CREATE TRIGGER trg_add_missing_category_map
AFTER INSERT
ON "Transactions"
FOR EACH ROW
EXECUTE FUNCTION add_missing_category_map();
```

# Trigger after Category update
## Trigger action function
```sql
CREATE OR REPLACE FUNCTION sync_transaction_category_from_category_map()
RETURNS trigger AS $$
BEGIN
  UPDATE "Transactions"
  SET category = NEW.category
  WHERE merchant = NEW.merchant;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Trigger creation
```sql
CREATE TRIGGER trg_sync_transaction_category
AFTER UPDATE OF category
ON "CategoryMap"
FOR EACH ROW
EXECUTE FUNCTION sync_transaction_category_from_category_map();
```

# Trigger after Category insert
## Trigger action function
```sql
CREATE OR REPLACE FUNCTION set_category_map_category_from_rules()
RETURNS trigger AS $$
BEGIN
  NEW.category := COALESCE(
    (
      SELECT r.category
      FROM "Rules" r
      WHERE trim(regexp_replace(NEW.merchant, '\s+', ' ', 'g'))
        ILIKE '%' || trim(regexp_replace(r.rule, '\s+', ' ', 'g')) || '%'
      ORDER BY length(r.rule) DESC
      LIMIT 1
    ),
    NEW.category,
    'Others'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;```

## Trigger creation
```sql
CREATE TRIGGER trg_set_category_map_category_from_rules
BEFORE INSERT
ON "CategoryMap"
FOR EACH ROW
EXECUTE FUNCTION set_category_map_category_from_rules();
```
