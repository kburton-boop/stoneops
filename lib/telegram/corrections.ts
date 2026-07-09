import { findAccountByName } from "@/lib/router/matchAccount";
import type { CaptureClassification } from "@/lib/router/classifyCapture";
import type { RouteResult } from "@/lib/router/routeCapture";
import type { InlineKeyboardMarkup } from "./types";

export const ACCOUNT_CODES: { code: string; name: string; label: string }[] = [
  { code: "CCM", name: "Cleveland-Cliffs Middletown", label: "Middletown" },
  { code: "NTPG", name: "NTP-G Shear", label: "NTP-G Shear" },
  { code: "TSK", name: "Thai Summit / TSK", label: "Thai Summit" },
  { code: "KTH", name: "KTH Parts", label: "KTH Parts" },
  { code: "DKPI", name: "DKPI", label: "DKPI" },
  { code: "RAD", name: "Radius", label: "Radius" },
  { code: "CWA", name: "Commonwealth Aluminum", label: "Commonwealth Al." },
  { code: "COHEN", name: "Cohen Lexington", label: "Cohen Lexington" },
  { code: "NBRAND", name: "Nucor Brandenburg", label: "Nucor Brandenburg" },
  { code: "NGHENT", name: "Nucor Ghent", label: "Nucor Ghent" },
  { code: "MAT", name: "Matalco", label: "Matalco" },
  { code: "RMR", name: "RMR", label: "RMR" },
  { code: "DJJ", name: "DJJ", label: "DJJ" },
  { code: "FPT", name: "FPT", label: "FPT" },
  { code: "AIMR", name: "AIM Recycling", label: "AIM Recycling" },
];

export async function resolveAccountCode(code: string, userId: string) {
  const entry = ACCOUNT_CODES.find((account) => account.code === code);
  if (!entry) return null;
  const account = await findAccountByName(entry.name, userId);
  return account?.id ?? null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

export function buildCorrectionKeyboard(
  captureId: string,
  classification: CaptureClassification,
  routedTo: RouteResult["routedTo"],
): InlineKeyboardMarkup {
  const accountRows = chunk(ACCOUNT_CODES, 3).map((row) =>
    row.map((account) => ({
      text: account.label,
      callback_data: `a:${captureId}:${account.code}`,
    })),
  );
  accountRows.push([{ text: "No account", callback_data: `n:${captureId}` }]);

  const rows = [...accountRows];

  if (routedTo === "corrective_actions") {
    rows.push(
      (["hot", "warm", "resolved"] as const).map((value) => ({
        text: value === "hot" ? "🔴 Hot" : value === "warm" ? "🟡 Warm" : "✅ Resolved",
        callback_data: `s:${captureId}:${value}`,
      })),
    );
  }

  if (routedTo === "tasks") {
    rows.push(
      (["today", "this_week", "this_month", "someday"] as const).map((value) => ({
        text: value.replace("_", " "),
        callback_data: `u:${captureId}:${value}`,
      })),
    );
  }

  return { inline_keyboard: rows };
}

export function buildDraftConfirmationKeyboard(captureId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "Confirm", callback_data: `cc:${captureId}` }],
      [{ text: "Not a new customer — let me pick", callback_data: `rc:${captureId}` }],
    ],
  };
}

export function buildConfirmationText(
  classification: CaptureClassification,
  accountName: string | null,
  route: RouteResult,
): string {
  const lines = [
    `${classification.kind.replace("_", " ")} · ${classification.summary}`,
    `Account: ${accountName ?? "unmatched — tap to fix"}`,
  ];

  if (route.routedTo === "corrective_actions") {
    lines.push(`Severity: ${classification.severity}`);
  }
  if (route.routedTo === "tasks") {
    lines.push(`Urgency: ${classification.urgency.replace("_", " ")}`);
  }
  if (route.routedTo === "customer_topics") {
    lines.push("Filed as a customer topic");
  }
  if (route.routedTo === "rate_calculations") {
    lines.push("Filed as a rate calculation");
  }
  if (classification.tags.length > 0) {
    lines.push(`Tags: ${classification.tags.join(", ")}`);
  }
  if (!route.routedTo) {
    lines.push("(saved as a raw capture — no structured row for this type yet)");
  }

  return lines.join("\n");
}
