import { Panel } from "@/components/shell/Panel";

export function FleetPulseCard() {
  return (
    <Panel title="Fleet Pulse">
      <dl className="space-y-3">
        <div className="flex items-center justify-between">
          <dt className="text-sm text-ink-3">Active loads today</dt>
          <dd className="font-mono text-lg text-ink-4">18</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-sm text-ink-3">Open breakdowns</dt>
          <dd className="font-mono text-lg text-hot">2</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-sm text-ink-3">On-time %</dt>
          <dd className="font-mono text-lg text-stable">94%</dd>
        </div>
      </dl>
    </Panel>
  );
}
