"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { DownloadIcon } from 'lucide-react'
import { toast } from "sonner";

import type { ColumnDef } from "@tanstack/react-table";
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
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip as TextTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseTransactionsFromExcelFile, type Transaction } from "@/lib/import-excel-transactions";
import { isSupabaseConfigured, supabase, type TransactionRow } from "@/lib/supabase";

type Period = "Monthly" | "Quarterly" | "Yearly";

type CategoryMapRow = {
  merchant: string;
  category: string | null;
};

type ComboboxOption = {
  label: string;
  value: string;
};

type MappingRow = {
  merchant: string;
  category: string;
};

type TransactionInsert = Pick<Transaction, "date" | "merchant" | "category" | "amount"> & {
  ref_id?: string;
};

const chartColors = ["#009ca4", "#f74800", "#d97706", "#2563eb", "#7c3aed"]
const merchantPreviewLength = 30;
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const excelFileTypes = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const quarterOptions = [
  { label: "Q1", months: [0, 1, 2] },
  { label: "Q2", months: [3, 4, 5] },
  { label: "Q3", months: [6, 7, 8] },
  { label: "Q4", months: [9, 10, 11] },
];
const budgetTemplate = [
  { label: "Food", ratio: 0.24, limitRatio: 0.27, tone: "bg-amber-500" },
  { label: "Travel", ratio: 0.16, limitRatio: 0.2, tone: "bg-blue-600" },
  { label: "Shopping", ratio: 0.14, limitRatio: 0.18, tone: "bg-red-600" },
  { label: "Bills", ratio: 0.14, limitRatio: 0.17, tone: "bg-violet-600" },
];
const subscribeToClient = () => () => {};

function useIsClient() {
  return useSyncExternalStore(subscribeToClient, () => true, () => false);
}

function formatCurrency(value: number) {
  const absoluteValue = Math.abs(value)
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(absoluteValue);
}

function formatChartValue(value: unknown) {
  return typeof value === "number" ? formatCurrency(value) : String(value ?? "");
}

function truncateText(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function MerchantCell({ merchant }: { merchant: string }) {
  const preview = truncateText(merchant, merchantPreviewLength);

  return (
    <TextTooltip>
      <TooltipTrigger
        className="block max-w-[25ch] truncate text-left font-bold text-slate-900"
      >
        <div className="font-bold">{preview}</div>
      </TooltipTrigger>
      <TooltipContent>
        <span className="break-words">{merchant}</span>
      </TooltipContent>
    </TextTooltip>
  );
}

function isExcelFile(file: File) {
  const fileName = file.name.toLowerCase();
  return excelFileTypes.has(file.type) || fileName.endsWith(".xls") || fileName.endsWith(".xlsx");
}

function toTransaction(row: TransactionRow, categoryMap: Record<string, string> = {}): Transaction {
  return {
    id: String(row.id),
    date: row.date,
    merchant: row.merchant,
    category: row.category?.trim() || categoryMap[row.merchant] || "Others",
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

function buildAnnualSeries(transactions: Transaction[]) {
  return transactions.reduce(
    (series, transaction) => {
      const parts = dateParts(transaction.date);

      if (!parts || transaction.amount === 0) {
        return series;
      }

      series.income[parts.year] ??= Array(12).fill(0);
      series.spend[parts.year] ??= Array(12).fill(0);

      if (transaction.amount > 0) {
        series.income[parts.year][parts.month] += transaction.amount;
      } else {
        series.spend[parts.year][parts.month] += Math.abs(transaction.amount);
      }

      return series;
    },
    {
      income: {} as Record<number, number[]>,
      spend: {} as Record<number, number[]>,
    },
  );
}

function getTransactionTotals(year: number, months: number[], annualIncome: Record<number, number[]>, annualSpend: Record<number, number[]>) {
  const incomeForYear = annualIncome[year];
  const spendForYear = annualSpend[year];

  return {
    income: months.reduce((sum, month) => sum + (incomeForYear?.[month] ?? 0), 0),
    spent: months.reduce((sum, month) => sum + (spendForYear?.[month] ?? 0), 0),
  };
}

function getCategoryTotals(transactions: Transaction[], year: number, months: number[]) {
  const activeMonths = new Set(months);
  const totals = transactions.reduce<Record<string, number>>((categoryTotals, transaction) => {
    const parts = dateParts(transaction.date);

    if (!parts || parts.year !== year || !activeMonths.has(parts.month) || transaction.amount >= 0) {
      return categoryTotals;
    }

    const category = transaction.category || "Others";
    categoryTotals[category] = (categoryTotals[category] ?? 0) + Math.abs(transaction.amount);
    return categoryTotals;
  }, {});

  return Object.entries(totals)
    .sort(([, leftAmount], [, rightAmount]) => rightAmount - leftAmount)
    .map(([name, amount], index) => ({
      name,
      amount,
      color: chartColors[index % chartColors.length],
    }));
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

function OptionCombobox({
  className,
  emptyText = "No option found.",
  onValueChange,
  options,
  placeholder,
  value,
}: {
  className?: string;
  emptyText?: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder: string;
  value: string;
}) {
  const selectedOption = options.find((option) => option.value === value) ?? null;

  return (
    <Combobox
      items={options}
      value={selectedOption}
      onValueChange={(option) => {
        if (option) {
          onValueChange(option.value);
        }
      }}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      isItemEqualToValue={(item, selected) => item.value === selected.value}
    >
      <ComboboxInput className={className} placeholder={placeholder} />
      <ComboboxContent>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {options.map((option) => (
            <ComboboxItem key={option.value} value={option}>
              {option.label}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
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
              <span className="font-semibold text-slate-600">{formatCurrency(item.amount)}</span>
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
            <Line type="monotone" dataKey="income" stroke={chartColors[0]} strokeWidth={4} dot={false} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="spend" stroke={chartColors[1]}  strokeWidth={4} dot={false} activeDot={{ r: 5 }} />
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
            <Bar dataKey="income" fill={chartColors[0]} radius={[8, 8, 0, 0]} />
            <Bar dataKey="spend" fill={chartColors[1]} radius={[8, 8, 0, 0]} />
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
  const [pendingImportTransactions, setPendingImportTransactions] = useState<Transaction[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [categoryMappings, setCategoryMappings] = useState<MappingRow[]>([]);
  const [selectedMapping, setSelectedMapping] = useState<MappingRow | null>(null);
  const [editedCategory, setEditedCategory] = useState("");
  const [isSavingMapping, setIsSavingMapping] = useState(false);

  function handleMappingDialogChange(open: boolean) {
    if (!open) {
      setSelectedMapping(null);
      setEditedCategory("");
    }
  }

  function handleMappingRowClick(mapping: MappingRow) {
    setSelectedMapping(mapping);
    setEditedCategory(mapping.category);
  }

  async function handleCategoryMappingSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedMapping) {
      return;
    }

    if (!supabase) {
      setTransactionError("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
      return;
    }

    const nextCategory = editedCategory.trim();

    if (!nextCategory) {
      setTransactionError("Category cannot be empty.");
      return;
    }

    setIsSavingMapping(true);
    setTransactionError(null);

    const savePromise = (async () => {
      const { error } = await supabase
        .from("CategoryMap")
        .update({ category: nextCategory })
        .eq("merchant", selectedMapping.merchant);

      if (error) {
        throw new Error(error.message);
      }

      await loadTransactions();
      setSelectedMapping(null);
      setEditedCategory("");
      return selectedMapping.merchant;
    })();

    toast.promise(savePromise, {
      loading: "Saving category...",
      success: (merchant) => `Updated category for ${merchant}.`,
      error: (error) => error instanceof Error ? error.message : "Failed to save category.",
    });

    try {
      await savePromise;
    } catch (error) {
      setTransactionError(error instanceof Error ? error.message : "Failed to save category.");
    } finally {
      setIsSavingMapping(false);
    }
  }

  async function handleImportFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFileName(file?.name ?? "No file selected");
    setPendingImportTransactions([]);
    setImportError(null);

    if (!file) {
      return;
    }

    if (!isExcelFile(file)) {
      setFileName("No file selected");
      setImportError("Please choose a valid Excel file with .xls or .xlsx extension.");
      event.target.value = "";
      return;
    }

    try {
      const importedTransactions = await parseTransactionsFromExcelFile(file);

      if (importedTransactions.length === 0) {
        setImportError("No valid transactions found in the imported file.");
        return;
      }

      setPendingImportTransactions(importedTransactions);
    } catch (error) {
      console.error("Failed to import transactions", error);
      setImportError(error instanceof Error ? error.message : "Failed to import transactions.");
    }
  }

  async function handleSubmitImport() {
    if (pendingImportTransactions.length === 0) {
      setImportError("Choose a valid Excel file before submitting.");
      return;
    }

    if (!supabase) {
      setTransactionError("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
      return;
    }

    try {
      setIsLoadingTransactions(true);
      setTransactionError(null);
      setImportError(null);

      const rowsToInsert: TransactionInsert[] = pendingImportTransactions.map(({ amount, category, date, id, merchant }) => ({
        amount,
        category,
        date,
        merchant,
        ...(id ? { ref_id: id } : {}),
      }));
      const submitPromise = (async () => {
        const { error } = await supabase
          .from("Transactions")
          .upsert(rowsToInsert, { onConflict: 'merchant,date,amount,ref_id', ignoreDuplicates: true });

        if (error) {
          throw new Error(error.message);
        }

        await loadTransactions();
        setPendingImportTransactions([]);
        setFileName("No file selected");

        return rowsToInsert.length;
      })();

      toast.promise(submitPromise, {
        loading: "Importing transactions...",
        success: (count) => `${count} transactions imported.`,
        error: (error) => error instanceof Error ? error.message : "Failed to import transactions.",
      });

      await submitPromise;
    } catch (error) {
      console.error("Failed to import transactions", error);
      setImportError(error instanceof Error ? error.message : "Failed to import transactions.");
      setIsLoadingTransactions(false);
    }
  }

  async function loadTransactions() {
    if (!supabase) {
      setTransactionError("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
      setTransactions([]);
      setCategoryMappings([]);
      return;
    }

    setIsLoadingTransactions(true);
    setTransactionError(null);

    const [transactionsResult, mappingsResult] = await Promise.all([
      supabase.from("Transactions").select("id,date,merchant,category,amount").order("date", { ascending: false }),
      supabase.from("CategoryMap").select("merchant,category").order("merchant", { ascending: true }),
    ]);

    if (transactionsResult.error) {
      setTransactions([]);
      setCategoryMappings([]);
      setTransactionError(transactionsResult.error.message);
      setIsLoadingTransactions(false);
      return;
    }

    if (mappingsResult.error) {
      setTransactions([]);
      setCategoryMappings([]);
      setTransactionError(mappingsResult.error.message);
      setIsLoadingTransactions(false);
      return;
    }

    const nextMappings = ((mappingsResult.data ?? []) as CategoryMapRow[])
      .filter((mapping) => mapping.merchant && mapping.category?.trim())
      .map((mapping) => ({
        merchant: mapping.merchant,
        category: mapping.category?.trim() ?? "",
      }));
    const nextMap = Object.fromEntries(
      nextMappings.map((mapping) => [mapping.merchant, mapping.category]),
    );
    const nextTransactions = (transactionsResult.data ?? []).map((row) => toTransaction(row as TransactionRow, nextMap));
    setTransactions(nextTransactions);
    setCategoryMappings(nextMappings);
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
  const { income: annualIncome, spend: annualSpend } = useMemo(() => buildAnnualSeries(transactions), [transactions]);

  const transactionColumns = useMemo<ColumnDef<Transaction>[]>(
    () => [
      {
        accessorKey: "merchant",
        header: "Merchant",
        cell: ({ row }) => <MerchantCell merchant={row.original.merchant} />,
      },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => <span className="text-slate-600">{row.original.category}</span>,
      },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }) => <span className="text-slate-600">{formatDate(row.original.date)}</span>,
      },
      {
        accessorKey: "amount",
        header: () => <span className="block text-right">Amount</span>,
        cell: ({ row }) =>  {
            const amount = row.original.amount
            const color = amount < 0 ? chartColors[1] : chartColors[0]
            return (<span className="block text-right font-bold" style={{color}}>{formatCurrency(amount)}</span>)
        }
      },
    ],
    [],
  );
  const mappingColumns = useMemo<ColumnDef<MappingRow>[]>(
    () => [
      {
        accessorKey: "merchant",
        header: "Merchant",
        cell: ({ row }) => <MerchantCell merchant={row.original.merchant} />,
      },
      {
        accessorKey: "category",
        header: () => <span className="block text-right">Category</span>,
        cell: ({ row }) => <span className="block text-right text-slate-600">{row.original.category}</span>,
      },
    ],
    [],
  );

  const periodData = useMemo(() => {
    const activeMonths = getPeriodMonths(period, selectedMonth, selectedQuarter);
    const previousPeriod = getPreviousPeriod(period, selectedMonth, selectedQuarter, selectedYear);
    const { income, spent } = getTransactionTotals(selectedYear, activeMonths, annualIncome, annualSpend);
    const previousTotals = getTransactionTotals(previousPeriod.year, previousPeriod.months, annualIncome, annualSpend);
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
    const categories = getCategoryTotals(transactions, selectedYear, activeMonths);
    const budgetRows = budgetTemplate.map((item) => ({
      label: item.label,
      spent: Math.round(spent * item.ratio),
      limit: Math.round(spent * item.limitRatio),
      tone: item.tone,
    }));

    return {
      budgetRows,
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
  }, [annualIncome, annualSpend, period, selectedMonth, selectedQuarter, selectedYear, transactions]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Supabase workspace</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Expense tracker</h1>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex rounded-lg border border-slate-300 bg-white p-1 shadow-sm">
              {(["Monthly", "Quarterly", "Yearly"] as Period[]).map((item) => (
                <Button
                  key={item}
                  variant={period === item ? "default" : "ghost"}
                  className="rounded-md px-4 py-2 text-sm font-semibold"
                  onClick={() => setPeriod(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <OptionCombobox
                className="w-28 bg-white font-bold text-slate-700"
                options={yearOptions.map((year) => ({ label: String(year), value: String(year) }))}
                value={String(selectedYear)}
                placeholder="Year"
                onValueChange={(value) => setSelectedYear(Number(value))}
              />
              {period === "Monthly" ? (
                <OptionCombobox
                  className="w-28 bg-white font-bold text-slate-700"
                  options={monthLabels.map((month, index) => ({ label: month, value: String(index) }))}
                  value={String(selectedMonth)}
                  placeholder="Month"
                  onValueChange={(value) => setSelectedMonth(Number(value))}
                />
              ) : null}
              {period === "Quarterly" ? (
                <OptionCombobox
                  className="w-28 bg-white font-bold text-slate-700"
                  options={quarterOptions.map((quarter, index) => ({ label: quarter.label, value: String(index) }))}
                  value={String(selectedQuarter)}
                  placeholder="Quarter"
                  onValueChange={(value) => setSelectedQuarter(Number(value))}
                />
              ) : null}
            </div>
          </div>
        </header>

        {transactionError ? (
            <Card className="rounded-lg border-slate-200 bg-white px-1 shadow-sm">
              <CardContent>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold">{isSupabaseConfigured ? "Supabase configured" : "Supabase keys missing"}</p>
                      <p className="mt-1 text-sm text-slate-500">Reading from Transactions and CategoryMap</p>
                    </div>
                    <Badge variant="secondary" className="w-fit">
                      {isLoadingTransactions ? "Loading" : `${transactions.length} rows`}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-red-700">{transactionError}</p>
              </CardContent>
            </Card>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Income", periodData.income, formatDelta(periodData.income, periodData.previousIncome)],
            ["Spending", periodData.spent, formatDelta(periodData.spent, periodData.previousSpent)],
            ["Saved", periodData.saved, `${periodData.savingsRate}% rate`],
            ["Needs review", Math.round(periodData.spent * 0.012), "2 imports"],
          ].map(([label, value, delta]) => (
            <Card key={label} className="rounded-lg border-slate-200 bg-white p-1 shadow-sm">
              <CardContent>
              <div className="flex items-center justify-between gap-3 p-2">
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <Badge variant="secondary">{delta}</Badge>
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight">{formatCurrency(Number(value))}</p>
              <p className="mt-2 text-sm text-slate-500 pb-1">{period} data view</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Card className="rounded-lg border-slate-200 bg-white p-1 shadow-sm">
            <CardHeader className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl font-bold">Income vs spending</CardTitle>
                <CardDescription>Analytics for {periodData.label}</CardDescription>
              </div>
              <div className="flex gap-3 text-sm font-semibold">
                <span className="flex items-center gap-2 text-teal-800"><i className="h-2.5 w-2.5 rounded-full bg-teal-700" />Income</span>
                <span className="flex items-center gap-2 text-amber-700"><i className="h-2.5 w-2.5 rounded-full bg-amber-500" />Spend</span>
              </div>
            </CardHeader>
            <CardContent>
              <TrendChart data={periodData.chartData} />
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 bg-white p-1 shadow-sm">
            <CardHeader className="p-3">
              <CardTitle className="text-xl font-bold">Category split</CardTitle>
              <CardDescription>Category split for {periodData.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <CategoryChart data={periodData.categories} />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr_1fr]">
          <Card className="rounded-lg border-slate-200 bg-white p-1 shadow-sm">
            <CardContent>
            <div className="flex items-start justify-between gap-4 p-3">
              <div>
                <CardTitle className="text-xl font-bold">Excel import</CardTitle>
                <p className="mt-1 text-sm text-slate-500">Upload .xlsx, .xls, or .csv files for review</p>
              </div>
              <Badge className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">Ready</Badge>
            </div>
            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition hover:border-teal-700 hover:bg-teal-50">
              <span className="text-sm font-bold">Choose Excel sheet</span>
              <span className="mt-1 text-sm text-slate-500">{fileName}</span>
              <Input
                className="sr-only"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportFileChange}
              />
            </label>
            {importError ? (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Import failed</AlertTitle>
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            ) : null}
            <Button
              type="button"
              className="mt-4 w-full font-bold"
              disabled={pendingImportTransactions.length === 0 || isLoadingTransactions}
              onClick={handleSubmitImport}
            >
              Submit
            </Button>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 bg-white p-1 shadow-sm">
            <CardHeader className="p-3">
              <CardTitle className="text-xl font-bold">Cash flow</CardTitle>
              <CardDescription>Income and spend bars for {periodData.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <CashFlowBars data={periodData.chartData} />
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 bg-white p-1 shadow-sm">
            <CardHeader className="p-3">
              <CardTitle className="text-xl font-bold">Budget health</CardTitle>
              <CardDescription>Limits can be stored per user in Supabase</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {periodData.budgetRows.map((row) => {
                const percent = Math.round((row.spent / row.limit) * 100);

                return (
                  <div key={row.label}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-bold text-slate-800">{row.label}</span>
                      <span className="font-semibold text-slate-500">{percent}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${row.tone}`} style={{ width: `${percent}%` }} />
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {formatCurrency(row.spent)} of {formatCurrency(row.limit)}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <Card className="overflow-hidden rounded-lg border-slate-200 bg-white p-0 shadow-sm">
            <CardContent>
            <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-xl font-bold">Transactions</CardTitle>
                <p className="mt-1 text-sm text-slate-500">Fetched directly from Supabase</p>
              </div>
              <Button variant="outline" className="font-bold text-slate-700">
                <DownloadIcon className='mr-2' />
                Export
              </Button>
            </div>
            <DataTable
              columns={transactionColumns}
              data={transactions}
            />
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-lg border-slate-200 bg-white p-0 shadow-sm">
            <CardContent>
            <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-xl font-bold">Learned category</CardTitle>
                <p className="mt-1 text-sm text-slate-500">Merchant-category pairs</p>
              </div>
            </div>
            <DataTable
              columns={mappingColumns}
              data={categoryMappings}
              onRowClick={handleMappingRowClick}
            />
            </CardContent>
          </Card>
        </section>
      </div>

      <Dialog open={Boolean(selectedMapping)} onOpenChange={handleMappingDialogChange}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={handleCategoryMappingSubmit}>
            <DialogHeader>
              <DialogTitle>Edit category</DialogTitle>
              <DialogDescription>
                Update the category mapped to this merchant.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="mt-4">
              <Field>
                <Label htmlFor="mapping-merchant">Merchant</Label>
                <Input
                  id="mapping-merchant"
                  name="merchant"
                  value={selectedMapping?.merchant ?? ""}
                  readOnly
                />
              </Field>
              <Field>
                <Label htmlFor="mapping-category">Category</Label>
                <Input
                  id="mapping-category"
                  name="category"
                  value={editedCategory}
                  onChange={(event) => setEditedCategory(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <DialogFooter className="mt-4">
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={isSavingMapping}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </main>
  );
}
