import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(JSON.stringify({ ok: false, message: "Missing Supabase environment variables." }, null, 2));
  process.exit(1);
}

const supabase = createClient(url, anonKey);
const { data, error, count } = await supabase
  .from("Transactions")
  .select("id,date,merchant,category,amount", { count: "exact" })
  .limit(1);

if (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, count, firstRow: data?.[0] ?? null }, null, 2));
