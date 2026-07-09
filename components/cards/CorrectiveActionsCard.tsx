import { Panel } from "@/components/shell/Panel";

const SEVERITY_STYLES: Record<"hot" | "warm", string> = {
  hot: "bg-hot/20 text-hot",
  warm: "bg-warm/20 text-warm",
};

const PLACEHOLDER_ITEMS: { id: string; title: string; account: string; severity: "hot" | "warm" }[] = [
  { id: "1", title: "Roll-off failure", account: "DKPI", severity: "hot" },
  { id: "2", title: "Late gate check-in", account: "Nucor Ghent", severity: "warm" },
  { id: "3", title: "Driver complaint", account: "Thai Summit / TSK", severity: "warm" },
];

export function CorrectiveActionsCard() {
  return (
    <Panel title={`Open Corrective Actions · ${PLACEHOLDER_ITEMS.length}`}>
      <ul className="space-y-2">
        {PLACEHOLDER_ITEMS.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <div>
              <p className="text-ink-4">{item.title}</p>
              <p className="text-ink-3">{item.account}</p>
            </div>
            <span
              className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs uppercase ${SEVERITY_STYLES[item.severity]}`}
            >
              {item.severity}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
