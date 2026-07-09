import { Panel } from "@/components/shell/Panel";

export function OperatorCard() {
  return (
    <Panel title="Operator">
      <div className="space-y-1">
        <p className="text-lg font-medium text-ink-4">Kody Burton</p>
        <p className="text-sm text-ink-3">Logistics Operations Manager / Fleet Coordinator</p>
        <p className="mt-3 text-sm text-ink-4">
          Today&apos;s focus:{" "}
          <span className="text-ink-3">Chase NTP-G FSC gap before Friday review.</span>
        </p>
      </div>
    </Panel>
  );
}
