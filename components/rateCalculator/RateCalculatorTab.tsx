"use client";

import { useEffect, useState } from "react";
import { calculateTypeA, calculateTypeB } from "@/lib/rateCalculator/calculate";
import type { Database } from "@/lib/supabase/types";

type RateDefaultsRow = Database["public"]["Tables"]["rate_defaults"]["Row"];

type FormulaType = "percentage_fsc" | "per_mile_fsc";

const COMMON_FIELDS = [
  { key: "target_per_hour", label: "Target $/hour" },
  { key: "one_way_miles", label: "One-way miles" },
  { key: "time_add_hours", label: "Add'l time (hours)" },
  { key: "avg_speed_mph", label: "Avg speed (mph)" },
  { key: "mpg", label: "MPG" },
  { key: "ppg", label: "Fuel price ($/gal)" },
  { key: "net_tonnage", label: "Net tonnage" },
] as const;

type FieldKey = (typeof COMMON_FIELDS)[number]["key"] | "fsc_percent" | "baseline_price";

const ALL_FIELD_KEYS: FieldKey[] = [
  "target_per_hour",
  "one_way_miles",
  "time_add_hours",
  "avg_speed_mph",
  "mpg",
  "ppg",
  "net_tonnage",
  "fsc_percent",
  "baseline_price",
];

const DEFAULT_VALUES: Record<FieldKey, string> = {
  target_per_hour: "",
  one_way_miles: "",
  time_add_hours: "",
  avg_speed_mph: "",
  mpg: "",
  ppg: "",
  net_tonnage: "",
  fsc_percent: "",
  baseline_price: "",
};

const OUTPUT_LABELS: Record<string, string> = {
  time_hours: "Time (hours)",
  linehaul: "Linehaul",
  fuel: "Fuel",
  all_in: "All-in",
  flat_rate: "Flat rate",
  fsc_dollar_amount: "FSC $",
  gross_tonnage: "Gross tonnage",
  rate_per_net_ton: "Rate / net ton",
  rate_per_gross_ton: "Rate / gross ton",
  rounded_one_way_miles: "Rounded miles (MROUND)",
  gallons_used: "Gallons used",
};

const CURRENCY_KEYS = new Set(["linehaul", "fuel", "all_in", "flat_rate", "fsc_dollar_amount", "rate_per_net_ton", "rate_per_gross_ton"]);

function toNumbers(values: Record<FieldKey, string>): Record<FieldKey, number | null> {
  const result = {} as Record<FieldKey, number | null>;
  for (const key of ALL_FIELD_KEYS) {
    const raw = values[key].trim();
    const parsed = raw === "" ? NaN : Number(raw);
    result[key] = Number.isFinite(parsed) ? parsed : null;
  }
  return result;
}

function formatOutput(key: string, value: number): string {
  if (CURRENCY_KEYS.has(key)) return `$${value.toFixed(2)}`;
  if (key === "time_hours") return value.toFixed(4);
  return String(Math.round(value * 100) / 100);
}

function stringifyCalculationInputs(inputs: Record<string, unknown>): Partial<Record<FieldKey, string>> {
  const result: Partial<Record<FieldKey, string>> = {};
  for (const key of ALL_FIELD_KEYS) {
    const value = inputs[key];
    // Tolerate numeric-looking strings too — a calculation saved before the
    // rate_defaults numeric-string fix (or any other jsonb round-trip) can
    // have "90" instead of 90, and this field shouldn't render blank for it.
    if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = String(value);
    } else if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      result[key] = value.trim();
    }
  }
  return result;
}

export function RateCalculatorTab({ accountId }: { accountId: string }) {
  const [formulaType, setFormulaType] = useState<FormulaType>("percentage_fsc");
  const [values, setValues] = useState<Record<FieldKey, string>>(DEFAULT_VALUES);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  // Prefer the account's most recent calculation (formula-level fields AND
  // trip-specific ones like miles/tonnage/lane) so a voice-driven
  // rate_request shows up here exactly as heard in Telegram. Only fall
  // back to the saved defaults — formula-level fields only, trip fields
  // stay blank — when there's no calculation yet to show.
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(`/api/rate-calculations?account_id=${accountId}`).then((res) => (res.ok ? res.json() : null)),
      fetch(`/api/rate-defaults?account_id=${accountId}`).then((res) => (res.ok ? res.json() : null)),
    ])
      .then(
        ([calcData, defaultsData]: [
          { calculation: { formula_type: FormulaType; inputs: Record<string, unknown> } | null } | null,
          { defaults: RateDefaultsRow | null } | null,
        ]) => {
          if (cancelled) return;

          const calculation = calcData?.calculation ?? null;
          const defaults = defaultsData?.defaults ?? null;

          if (calculation) {
            setFormulaType(calculation.formula_type);
            setValues((prev) => ({ ...prev, ...stringifyCalculationInputs(calculation.inputs) }));
            if (typeof calculation.inputs.origin === "string") setOrigin(calculation.inputs.origin);
            if (typeof calculation.inputs.destination === "string") {
              setDestination(calculation.inputs.destination);
            }
          } else if (defaults) {
            setFormulaType(defaults.formula_type);
            setValues((prev) => ({
              ...prev,
              target_per_hour: String(defaults.target_per_hour),
              time_add_hours: String(defaults.time_add_hours),
              avg_speed_mph: String(defaults.avg_speed_mph),
              mpg: String(defaults.mpg),
              ppg: String(defaults.ppg),
              fsc_percent: defaults.fsc_percent != null ? String(defaults.fsc_percent) : prev.fsc_percent,
              baseline_price: defaults.baseline_price != null ? String(defaults.baseline_price) : prev.baseline_price,
            }));
          }
        },
      )
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  function setField(key: FieldKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setDefaultsSaved(false);
  }

  async function handleLookupDistance() {
    if (!origin.trim() || !destination.trim()) return;
    setLookingUp(true);
    setLookupError(null);
    try {
      const res = await fetch(
        `/api/rate-calculator/distance?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`,
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Lookup failed");
      setField("one_way_miles", String(Math.round(body.miles * 10) / 10));
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLookingUp(false);
    }
  }

  const numeric = toNumbers(values);
  const requiredKeys: FieldKey[] = [
    ...COMMON_FIELDS.map((f) => f.key),
    formulaType === "percentage_fsc" ? "fsc_percent" : "baseline_price",
  ];
  const canCalculate = requiredKeys.every((key) => numeric[key] !== null);

  const outputs = canCalculate
    ? formulaType === "percentage_fsc"
      ? calculateTypeA({
          target_per_hour: numeric.target_per_hour!,
          one_way_miles: numeric.one_way_miles!,
          time_add_hours: numeric.time_add_hours!,
          avg_speed_mph: numeric.avg_speed_mph!,
          mpg: numeric.mpg!,
          ppg: numeric.ppg!,
          fsc_percent: numeric.fsc_percent!,
          net_tonnage: numeric.net_tonnage!,
        })
      : calculateTypeB({
          target_per_hour: numeric.target_per_hour!,
          one_way_miles: numeric.one_way_miles!,
          time_add_hours: numeric.time_add_hours!,
          avg_speed_mph: numeric.avg_speed_mph!,
          mpg: numeric.mpg!,
          ppg: numeric.ppg!,
          baseline_price: numeric.baseline_price!,
          net_tonnage: numeric.net_tonnage!,
        })
    : null;

  async function handleSave() {
    if (!outputs) return;
    setSaving(true);
    setSaveError(null);
    try {
      const inputsPayload: Record<string, unknown> = { ...numeric };
      if (origin) inputsPayload.origin = origin;
      if (destination) inputsPayload.destination = destination;

      const res = await fetch("/api/rate-calculations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          formula_type: formulaType,
          inputs: inputsPayload,
          outputs,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
    } catch {
      setSaveError("Couldn't save this calculation.");
    } finally {
      setSaving(false);
    }
  }

  const defaultsRequiredKeys: FieldKey[] = [
    "target_per_hour",
    "time_add_hours",
    "avg_speed_mph",
    "mpg",
    "ppg",
    formulaType === "percentage_fsc" ? "fsc_percent" : "baseline_price",
  ];
  const canSaveDefaults = defaultsRequiredKeys.every((key) => numeric[key] !== null);

  async function handleSaveDefaults() {
    if (!canSaveDefaults) return;
    setSavingDefaults(true);
    setDefaultsError(null);
    try {
      const res = await fetch("/api/rate-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          formula_type: formulaType,
          target_per_hour: numeric.target_per_hour,
          time_add_hours: numeric.time_add_hours,
          avg_speed_mph: numeric.avg_speed_mph,
          mpg: numeric.mpg,
          ppg: numeric.ppg,
          fsc_percent: formulaType === "percentage_fsc" ? numeric.fsc_percent : null,
          baseline_price: formulaType === "per_mile_fsc" ? numeric.baseline_price : null,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setDefaultsSaved(true);
    } catch {
      setDefaultsError("Couldn't save defaults.");
    } finally {
      setSavingDefaults(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-3">
          Formula Type
        </label>
        <select
          value={formulaType}
          onChange={(e) => {
            setFormulaType(e.target.value as FormulaType);
            setSaved(false);
          }}
          className="min-h-11 w-full rounded border border-ink-2 bg-ink-0 px-3 py-2 text-sm text-ink-4 outline-none focus:border-accent"
        >
          <option value="percentage_fsc">Percentage FSC (NTP-G Shear / Nucor Ghent style)</option>
          <option value="per_mile_fsc">Per-mile baseline FSC (RMR style)</option>
        </select>
      </div>

      <div className="rounded border border-ink-2 p-2">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-3">
          Mileage lookup
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="Origin, e.g. Ghent, KY"
            className="min-h-11 min-w-0 flex-1 rounded border border-ink-2 bg-ink-0 px-3 py-1 text-sm text-ink-4 outline-none focus:border-accent"
          />
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Destination, e.g. Middletown, OH"
            className="min-h-11 min-w-0 flex-1 rounded border border-ink-2 bg-ink-0 px-3 py-1 text-sm text-ink-4 outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={handleLookupDistance}
            disabled={lookingUp || !origin.trim() || !destination.trim()}
            className="min-h-11 shrink-0 rounded bg-accent px-3 text-sm font-medium text-ink-0 disabled:opacity-50"
          >
            {lookingUp ? "Looking up…" : "Look up miles"}
          </button>
        </div>
        {lookupError && <p className="mt-1 text-xs text-hot">{lookupError}</p>}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {COMMON_FIELDS.map((field) => (
          <div key={field.key}>
            <label className="mb-1 block text-xs text-ink-3">{field.label}</label>
            <input
              type="number"
              value={values[field.key]}
              onChange={(e) => setField(field.key, e.target.value)}
              className="min-h-11 w-full rounded border border-ink-2 bg-ink-0 px-3 py-1 text-sm text-ink-4 outline-none focus:border-accent"
            />
          </div>
        ))}
        {formulaType === "percentage_fsc" ? (
          <div>
            <label className="mb-1 block text-xs text-ink-3">FSC % (e.g. 0.245)</label>
            <input
              type="number"
              step="0.001"
              value={values.fsc_percent}
              onChange={(e) => setField("fsc_percent", e.target.value)}
              className="min-h-11 w-full rounded border border-ink-2 bg-ink-0 px-3 py-1 text-sm text-ink-4 outline-none focus:border-accent"
            />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-ink-3">Baseline price ($/gal)</label>
            <input
              type="number"
              step="0.001"
              value={values.baseline_price}
              onChange={(e) => setField("baseline_price", e.target.value)}
              className="min-h-11 w-full rounded border border-ink-2 bg-ink-0 px-3 py-1 text-sm text-ink-4 outline-none focus:border-accent"
            />
          </div>
        )}
      </div>

      {outputs ? (
        <div className="rounded border border-ink-2 p-2">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Result</p>
          <dl className="space-y-1">
            {Object.entries(outputs).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <dt className="text-ink-3">{OUTPUT_LABELS[key] ?? key}</dt>
                <dd className="font-mono text-ink-4">{formatOutput(key, value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p className="text-sm text-ink-3">Fill in all fields to see the calculated rate.</p>
      )}

      {saveError && <p className="text-sm text-hot">{saveError}</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={!outputs || saving}
        className="min-h-11 w-full rounded bg-accent px-3 py-2 text-sm font-medium text-ink-0 disabled:opacity-50"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save calculation"}
      </button>

      {defaultsError && <p className="text-sm text-hot">{defaultsError}</p>}
      <button
        type="button"
        onClick={handleSaveDefaults}
        disabled={!canSaveDefaults || savingDefaults}
        className="min-h-11 w-full rounded border border-ink-2 px-3 py-2 text-sm font-medium text-ink-4 disabled:opacity-50"
      >
        {savingDefaults ? "Saving…" : defaultsSaved ? "Defaults saved ✓" : "Save as defaults for this account"}
      </button>
    </div>
  );
}
