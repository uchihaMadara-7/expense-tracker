# Constraints
```sql
ALTER TABLE "Transactions"
ADD CONSTRAINT unique_transaction
UNIQUE (merchant, date, amount, ref_id);
```

# Trigger before Transactions insert:
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

# Trigger after Transactions insert:
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
