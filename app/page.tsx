"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { isSupabaseConfigured, supabase, type TransactionRow } from "@/lib/supabase";

type Period = "Monthly" | "Quarterly" | "Yearly";

type Transaction = {
  id: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
};

type PendingCategoryChange = {
  transactionId: string;
  merchant: string;
  currentCategory: string;
  nextCategory: string;
};

const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const quarterOptions = [
  { label: "Q1", months: [0, 1, 2] },
  { label: "Q2", months: [3, 4, 5] },
  { label: "Q3", months: [6, 7, 8] },
  { label: "Q4", months: [9, 10, 11] },
];
const defaultCategories = ["Uncategorized", "Housing", "Food", "Travel", "Bills", "Shopping", "Health", "Education"];
const annualIncome = {
  2024: [292000, 296000, 301000, 304000, 309000, 315000, 318000, 322000, 328000, 331000, 336000, 342000],
  2025: [348000, 352000, 356000, 361000, 365000, 371000, 376000, 382000, 388000, 392000, 398000, 405000],
  2026: [412000, 418000, 424000, 430000, 436000, 442000, 448000, 455000, 461000, 468000, 474000, 482000],
};
const annualSpend = {
  2024: [184000, 176000, 193000, 189000, 204000, 212000, 198000, 219000, 214000, 226000, 221000, 238000],
  2025: [229000, 224000, 236000, 241000, 248000, 257000, 251000, 263000, 269000, 276000, 271000, 284000],
  2026: [288000, 281000, 296000, 302000, 311000, 319000, 314000, 327000, 334000, 341000, 337000, 352000],
};
const categoryMix = [
  { name: "Housing", ratio: 0.34, color: "#116466" },
  { name: "Food", ratio: 0.22, color: "#d97706" },
  { name: "Travel", ratio: 0.16, color: "#2563eb" },
  { name: "Bills", ratio: 0.14, color: "#7c3aed" },
  { name: "Shopping", ratio: 0.14, color: "#dc2626" },
];
const subscribeToClient = () => () => {};

function useIsClient() {
  return useSyncExternalStore(subscribeToClient, () => true, () => false);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function formatChartValue(value: unknown) {
  return typeof value === "number" ? formatCurrency(value) : String(value ?? "");
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: String(row.id),
    date: row.date,
    merchant: row.merchant,
    category: row.category?.trim() || "Uncategorized",
    amount: Number(row.amount) || 0,
  };
}

function dateParts(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    day: date.getDate(),
    month: date.getMonth(),
    year: date.getFullYear(),
  };
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function getPeriodMonths(period: Period, month: number, quarter: number) {
  if (period === "Monthly") {
    return [month];
  }

  if (period === "Quarterly") {
    return quarterOptions[quarter].months;
  }

  return monthLabels.map((_, index) => index);
}

function getPreviousPeriod(period: Period, month: number, quarter: number, year: number) {
  if (period === "Monthly") {
    return month === 0 ? { year: year - 1, months: [11] } : { year, months: [month - 1] };
  }

  if (period === "Quarterly") {
    return quarter === 0
      ? { year: year - 1, months: quarterOptions[3].months }
      : { year, months: quarterOptions[quarter - 1].months };
  }

  return { year: year - 1, months: getPeriodMonths(period, month, quarter) };
}

function getSampleTotals(year: number, months: number[]) {
  const incomeForYear = annualIncome[year as keyof typeof annualIncome];
  const spendForYear = annualSpend[year as keyof typeof annualSpend];

  if (!incomeForYear || !spendForYear) {
    return { income: 0, spent: 0 };
  }

  return {
    income: months.reduce((sum, month) => sum + incomeForYear[month], 0),
    spent: months.reduce((sum, month) => sum + spendForYear[month], 0),
  };
}

function formatDelta(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? "0.0%" : "New";
  }

  const delta = ((current - previous) / previous) * 100;
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-44 items-center justify-center rounded-lg bg-slate-50 text-sm font-semibold text-slate-500">
      {label}
    </div>
  );
}

function CategoryChart({ data }: { data: Array<{ name: string; amount: number; color: string }> }) {
  const mounted = useIsClient();
  const total = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[180px_1fr]">
      <div className="relative h-44 min-h-44 w-44 min-w-44">
        {mounted && total > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="amount" innerRadius={58} outerRadius={78} paddingAngle={3} stroke="none">
                {data.map((item) => (
                  <Cell key={item.name} fill={item.color} />
                ))}
              </Pie>
              <Tooltip formatter={formatChartValue} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full rounded-full border-[18px] border-slate-200" />
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-slate-950">{formatCurrency(total)}</span>
          <span className="text-xs font-semibold text-slate-500">total spend</span>
        </div>
      </div>

      <div className="space-y-3">
        {data.length > 0 ? (
          data.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-4 text-sm">
              <span className="flex items-center gap-2 font-medium text-slate-700">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.name}
              </span>
              <span className="font-semibold text-slate-950">{formatCurrency(item.amount)}</span>
            </div>
          ))
        ) : (
          <p className="text-sm font-semibold text-slate-500">No categorized transactions found.</p>
        )}
      </div>
    </div>
  );
}

function TrendChart({ data }: { data: Array<{ label: string; income: number; spend: number }> }) {
  const mounted = useIsClient();
  const hasData = data.some((item) => item.spend > 0);

  return (
    <div className="h-64 min-h-64 min-w-0">
      {mounted && hasData ? (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 24, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
            <YAxis hide domain={["dataMin - 400", "dataMax + 400"]} />
            <Tooltip formatter={formatChartValue} />
            <Line type="monotone" dataKey="income" stroke="#116466" strokeWidth={4} dot={false} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="spend" stroke="#d97706" strokeWidth={4} dot={false} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <EmptyChart label="No spending data for this period" />
      )}
    </div>
  );
}

function CashFlowBars({ data }: { data: Array<{ label: string; income: number; spend: number }> }) {
  const mounted = useIsClient();
  const hasData = data.some((item) => item.spend > 0 || item.income > 0);

  return (
    <div className="h-56 min-h-56 min-w-0 pt-5">
      {mounted && hasData ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
            <YAxis hide />
            <Tooltip formatter={formatChartValue} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
            <Bar dataKey="income" fill="#116466" radius={[8, 8, 0, 0]} />
            <Bar dataKey="spend" fill="#d97706" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <EmptyChart label="No cash-flow data for this period" />
      )}
    </div>
  );
}

export default function Home() {
  const now = new Date();
  const [period, setPeriod] = useState<Period>("Monthly");
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(now.getMonth() / 3));
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [fileName, setFileName] = useState("No file selected");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [pendingCategoryChange, setPendingCategoryChange] = useState<PendingCategoryChange | null>(null);
  const [merchantCategoryMap, setMerchantCategoryMap] = useState<Record<string, string>>({});

  async function loadTransactions() {
    if (!supabase) {
      setTransactionError("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
      setTransactions([]);
      return;
    }

    setIsLoadingTransactions(true);
    setTransactionError(null);

    const { data, error } = await supabase
      .from("Transactions")
      .select("id,date,merchant,category,amount")
      .order("date", { ascending: false });

    if (error) {
      setTransactions([]);
      setTransactionError(error.message);
      setIsLoadingTransactions(false);
      return;
    }

    const nextTransactions = (data ?? []).map((row) => toTransaction(row as TransactionRow));
    setTransactions(nextTransactions);
    setMerchantCategoryMap(
      Object.fromEntries(
        nextTransactions
          .filter((transaction) => transaction.category !== "Uncategorized")
          .map((transaction) => [transaction.merchant, transaction.category]),
      ),
    );
    setIsLoadingTransactions(false);
  }

  useEffect(() => {
    void Promise.resolve().then(loadTransactions);
  }, []);

  const yearOptions = useMemo(() => {
    const years = new Set([2024, 2025, 2026, selectedYear]);

    transactions.forEach((transaction) => {
      const parts = dateParts(transaction.date);
      if (parts) {
        years.add(parts.year);
      }
    });

    return Array.from(years).sort((a, b) => b - a);
  }, [selectedYear, transactions]);

  const categoryOptions = useMemo(() => {
    const categories = new Set(defaultCategories);
    transactions.forEach((transaction) => categories.add(transaction.category));
    return Array.from(categories).sort((a, b) => (a === "Uncategorized" ? -1 : b === "Uncategorized" ? 1 : a.localeCompare(b)));
  }, [transactions]);

  const periodData = useMemo(() => {
    const activeMonths = getPeriodMonths(period, selectedMonth, selectedQuarter);
    const previousPeriod = getPreviousPeriod(period, selectedMonth, selectedQuarter, selectedYear);
    const { income, spent } = getSampleTotals(selectedYear, activeMonths);
    const previousTotals = getSampleTotals(previousPeriod.year, previousPeriod.months);
    const saved = income - spent;
    const previousSaved = previousTotals.income - previousTotals.spent;
    const label =
      period === "Monthly"
        ? `${monthLabels[selectedMonth]} ${selectedYear}`
        : period === "Quarterly"
          ? `${quarterOptions[selectedQuarter].label} ${selectedYear}`
          : `${selectedYear}`;
    const chartData =
      period === "Monthly"
        ? ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"].map((label, index) => ({
            label,
            income: Math.round(income * [0.18, 0.23, 0.2, 0.26, 0.13][index]),
            spend: Math.round(spent * [0.18, 0.23, 0.2, 0.26, 0.13][index]),
          }))
        : activeMonths.map((month) => ({
            label: monthLabels[month],
            income: annualIncome[selectedYear as keyof typeof annualIncome]?.[month] ?? 0,
            spend: annualSpend[selectedYear as keyof typeof annualSpend]?.[month] ?? 0,
          }));
    const categories = categoryMix.map((category) => ({
      name: category.name,
      amount: Math.round(spent * category.ratio),
      color: category.color,
    }));

    return {
      categories,
      chartData,
      income,
      label,
      previousIncome: previousTotals.income,
      previousSaved,
      previousSpent: previousTotals.spent,
      saved,
      spent,
      savingsRate: income > 0 ? Math.round((saved / income) * 100) : 0,
    };
  }, [period, selectedMonth, selectedQuarter, selectedYear]);

  function requestCategoryChange(transactionId: string, merchant: string, currentCategory: string, nextCategory: string) {
    if (currentCategory === nextCategory) {
      return;
    }

    setPendingCategoryChange({ transactionId, merchant, currentCategory, nextCategory });
  }

  async function confirmCategoryChange() {
    if (!pendingCategoryChange) {
      return;
    }

    const { merchant, nextCategory } = pendingCategoryChange;
    const savedCategory = nextCategory === "Uncategorized" ? null : nextCategory;

    if (supabase) {
      const { error } = await supabase.from("Transactions").update({ category: savedCategory }).eq("merchant", merchant);

      if (error) {
        setTransactionError(error.message);
        setPendingCategoryChange(null);
        return;
      }
    }

    setTransactions((currentTransactions) =>
      currentTransactions.map((transaction) =>
        transaction.merchant === merchant ? { ...transaction, category: nextCategory } : transaction,
      ),
    );
    setMerchantCategoryMap((currentMap) => {
      const nextMap = { ...currentMap };
      if (nextCategory === "Uncategorized") {
        delete nextMap[merchant];
      } else {
        nextMap[merchant] = nextCategory;
      }
      return nextMap;
    });
    setPendingCategoryChange(null);
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-800">Supabase workspace</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Expense tracker</h1>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex rounded-lg border border-slate-300 bg-white p-1 shadow-sm">
              {(["Monthly", "Quarterly", "Yearly"] as Period[]).map((item) => (
                <button
                  key={item}
                  className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                    period === item ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                  onClick={() => setPeriod(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm"
                value={selectedYear}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
                aria-label="Select year"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              {period === "Monthly" ? (
                <select
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm"
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(Number(event.target.value))}
                  aria-label="Select month"
                >
                  {monthLabels.map((month, index) => (
                    <option key={month} value={index}>
                      {month}
                    </option>
                  ))}
                </select>
              ) : null}
              {period === "Quarterly" ? (
                <select
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm"
                  value={selectedQuarter}
                  onChange={(event) => setSelectedQuarter(Number(event.target.value))}
                  aria-label="Select quarter"
                >
                  {quarterOptions.map((quarter, index) => (
                    <option key={quarter.label} value={index}>
                      {quarter.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <button
              className="rounded-lg bg-teal-800 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-900"
              onClick={loadTransactions}
            >
              Sync Supabase
            </button>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold">{isSupabaseConfigured ? "Supabase configured" : "Supabase keys missing"}</p>
              <p className="mt-1 text-sm text-slate-500">Reading from Transactions (id, date, merchant, category, amount)</p>
            </div>
            <span
              className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${
                isSupabaseConfigured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {isLoadingTransactions ? "Loading" : `${transactions.length} rows`}
            </span>
          </div>
          {transactionError ? <p className="mt-3 text-sm font-semibold text-red-700">{transactionError}</p> : null}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Income", formatCurrency(periodData.income), `${formatDelta(periodData.income, periodData.previousIncome)} vs previous`],
            ["Spending", formatCurrency(periodData.spent), `${formatDelta(periodData.spent, periodData.previousSpent)} vs previous`],
            ["Saved", formatCurrency(periodData.saved), `${formatDelta(periodData.saved, periodData.previousSaved)} vs previous`],
            ["Savings rate", `${periodData.savingsRate}%`, periodData.label],
          ].map(([label, value, detail]) => (
            <article key={label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">{label}</p>
              <p className="mt-4 text-3xl font-bold tracking-tight">{value}</p>
              <p className="mt-2 text-sm text-slate-500">{detail}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">Income vs spending</h2>
                <p className="mt-1 text-sm text-slate-500">Sample analytics for {periodData.label}</p>
              </div>
              <div className="flex gap-3 text-sm font-semibold">
                <span className="flex items-center gap-2 text-teal-800"><i className="h-2.5 w-2.5 rounded-full bg-teal-700" />Income</span>
                <span className="flex items-center gap-2 text-amber-700"><i className="h-2.5 w-2.5 rounded-full bg-amber-500" />Spend</span>
              </div>
            </div>
            <TrendChart data={periodData.chartData} />
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">Category split</h2>
            <p className="mt-1 text-sm text-slate-500">Calculated only from fetched Supabase rows</p>
            <div className="mt-6">
              <CategoryChart data={periodData.categories} />
            </div>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr_1fr]">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Excel import</h2>
                <p className="mt-1 text-sm text-slate-500">Upload .xlsx, .xls, or .csv files for review</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Ready</span>
            </div>
            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition hover:border-teal-700 hover:bg-teal-50">
              <span className="text-sm font-bold">Choose Excel sheet</span>
              <span className="mt-1 text-sm text-slate-500">{fileName}</span>
              <input
                className="sr-only"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "No file selected")}
              />
            </label>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">Cash flow</h2>
            <p className="mt-1 text-sm text-slate-500">Income and spend bars for {periodData.label}</p>
            <CashFlowBars data={periodData.chartData} />
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">Budget health</h2>
            <p className="mt-1 text-sm text-slate-500">Category budgets based on sample analytics</p>
            <div className="mt-6 space-y-4">
              {periodData.categories.length > 0 ? (
                periodData.categories.slice(0, 5).map((category) => {
                  const width = periodData.spent > 0 ? Math.round((category.amount / periodData.spent) * 100) : 0;
                  return (
                    <div key={category.name}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-bold text-slate-800">{category.name}</span>
                        <span className="font-semibold text-slate-500">{formatCurrency(category.amount)}</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-teal-700" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm font-semibold text-slate-500">No category totals for this period.</p>
              )}
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">Transactions</h2>
                <p className="mt-1 text-sm text-slate-500">Fetched directly from Supabase</p>
              </div>
              <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                Export
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-bold">Merchant</th>
                    <th className="px-5 py-3 font-bold">Category</th>
                    <th className="px-5 py-3 font-bold">Date</th>
                    <th className="px-5 py-3 text-right font-bold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.length > 0 ? (
                    transactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-bold text-slate-900">{transaction.merchant}</td>
                        <td className="px-5 py-4 text-slate-600">
                          <select
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm"
                            value={transaction.category}
                            onChange={(event) =>
                              requestCategoryChange(transaction.id, transaction.merchant, transaction.category, event.target.value)
                            }
                            aria-label={`Category for ${transaction.merchant}`}
                          >
                            {categoryOptions.map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-4 text-slate-600">{formatDate(transaction.date)}</td>
                        <td className="px-5 py-4 text-right font-bold">{formatCurrency(transaction.amount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-5 py-8 text-center text-sm font-semibold text-slate-500" colSpan={4}>
                        {isLoadingTransactions ? "Loading transactions..." : "No transactions returned from Supabase."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
            <h2 className="text-xl font-bold">Learned mappings</h2>
            <p className="mt-1 text-sm text-slate-300">Merchant-category pairs from fetched rows</p>
            <div className="mt-5 space-y-2 text-sm">
              {Object.entries(merchantCategoryMap).length > 0 ? (
                Object.entries(merchantCategoryMap).map(([merchant, category]) => (
                  <div key={merchant} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
                    <span className="font-semibold">{merchant}</span>
                    <span className="text-teal-200">{category}</span>
                  </div>
                ))
              ) : (
                <p className="text-slate-300">No mappings yet.</p>
              )}
            </div>
          </aside>
        </section>
      </div>

      {pendingCategoryChange ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <section
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-confirm-title"
          >
            <h2 id="category-confirm-title" className="text-xl font-bold">
              Save category update?
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This will change all fetched rows for {pendingCategoryChange.merchant} from{" "}
              <span className="font-bold text-slate-950">{pendingCategoryChange.currentCategory}</span> to{" "}
              <span className="font-bold text-teal-800">{pendingCategoryChange.nextCategory}</span>.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                onClick={() => setPendingCategoryChange(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-teal-800 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-900"
                onClick={confirmCategoryChange}
              >
                Save category
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
