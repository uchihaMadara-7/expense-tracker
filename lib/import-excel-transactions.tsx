import * as XLSX from "xlsx";

export type Transaction = {
  id?: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
};

type SpreadsheetCell = string | number | boolean | Date | null | undefined;

const importColumns = {
  date: 0,
  merchant: 1,
  reference: 2,
  withdraw: 4,
  deposit: 5,
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toImportedDateValue(day: number, month: number, year: number) {
  const fullYear = year < 100 ? 2000 + year : year;
  const date = new Date(Date.UTC(fullYear, month - 1, day));

  if (date.getUTCFullYear() !== fullYear || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  return toDateInputValue(date);
}

function parseImportedDate(value: SpreadsheetCell) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDateInputValue(value);
  }

  if (typeof value === "number") {
    const parsedDate = XLSX.SSF.parse_date_code(value);

    if (parsedDate) {
      return toImportedDateValue(parsedDate.d, parsedDate.m, parsedDate.y);
    }
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return null;
    }

    const dayFirstDate = trimmedValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);

    if (dayFirstDate) {
      return toImportedDateValue(Number(dayFirstDate[1]), Number(dayFirstDate[2]), Number(dayFirstDate[3]));
    }

    const date = new Date(trimmedValue);
    return Number.isNaN(date.getTime()) ? null : toDateInputValue(date);
  }

  return null;
}

function parseImportedAmount(value: SpreadsheetCell) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const normalizedValue = trimmedValue
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/[,\s₹$]/g, "");
  const amount = Number(normalizedValue);

  return Number.isFinite(amount) ? amount : null;
}

function parseImportedReference(value: SpreadsheetCell) {
  if (value === null || value === undefined) {
    return undefined;
  }

  const reference = String(value).trim();
  return reference ? reference : undefined;
}

export function parseImportedTransactions(workbook: XLSX.WorkBook): Transaction[] {
  const [sheetName] = workbook.SheetNames;

  if (!sheetName) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json<SpreadsheetCell[]>(workbook.Sheets[sheetName], {
    blankrows: false,
    defval: null,
    header: 1,
    raw: true,
  });

  return rows.reduce<Transaction[]>((importedTransactions, row) => {
    const date = parseImportedDate(row[importColumns.date]);
    const merchant = String(row[importColumns.merchant] ?? "").trim();
    const id = parseImportedReference(row[importColumns.reference]);
    const withdraw = parseImportedAmount(row[importColumns.withdraw]) ?? 0;
    const deposit = parseImportedAmount(row[importColumns.deposit]) ?? 0;
    const amount = deposit - withdraw;

    if (!date || !merchant || amount === 0) {
      return importedTransactions;
    }

    importedTransactions.push({
      id,
      date,
      merchant,
      category: "Others",
      amount,
    });

    return importedTransactions;
  }, []);
}

export async function parseTransactionsFromExcelFile(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  return parseImportedTransactions(workbook);
}
