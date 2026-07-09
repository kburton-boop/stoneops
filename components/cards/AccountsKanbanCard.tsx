import { Panel } from "@/components/shell/Panel";

const COLUMNS: { label: string; accent: string; accounts: string[] }[] = [
  {
    label: "Active Issue",
    accent: "text-hot",
    accounts: ["DKPI", "NTP-G Shear"],
  },
  {
    label: "This Week",
    accent: "text-warm",
    accounts: ["Nucor Ghent", "Thai Summit / TSK"],
  },
  {
    label: "Monitoring",
    accent: "text-cool",
    accounts: ["Cohen Lexington"],
  },
  {
    label: "Stable",
    accent: "text-stable",
    accounts: [
      "Cleveland-Cliffs Middletown",
      "KTH Parts",
      "Radius",
      "Commonwealth Aluminum",
      "Nucor Brandenburg",
      "Matalco",
    ],
  },
];

export function AccountsKanbanCard() {
  return (
    <Panel title="Accounts">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {COLUMNS.map((column) => (
          <div key={column.label}>
            <p className={`mb-2 text-xs font-medium uppercase tracking-wide ${column.accent}`}>
              {column.label}
            </p>
            <ul className="space-y-1">
              {column.accounts.map((name) => (
                <li
                  key={name}
                  className="rounded border border-ink-2 px-2 py-1 text-sm text-ink-4"
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}
