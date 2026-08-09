import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatNaira = (amount: number | string | null | undefined): string => {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
};

export const formatPercent = (val: number | string | null | undefined): string => {
  const n = Number(val ?? 0);
  return `${n.toFixed(2)}%`;
};

export const formatUSD = (amount: number | string | null | undefined): string => {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
};

export function calculateBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);
  while (current <= endDate) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export function addBusinessDays(date: Date, businessDays: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < businessDays) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0 && result.getDay() !== 6) added++;
  }
  return result;
}

export const formatCompactSize = (size: number, currency: "NGN" | "USD"): string => {
  if (currency === "USD") {
    if (size >= 1000) return `$${size / 1000}k`;
    return `$${size}`;
  }
  if (size >= 1000000) return `₦${(size / 1000000).toFixed(0)}M`;
  if (size >= 1000) return `₦${(size / 1000).toFixed(0)}k`;
  return formatNaira(size);
};
