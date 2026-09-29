import { useMemo, useState } from "react";
import { DataTableView, type DataTableColumn } from "gloomberb/components";
import type { Operator } from "./types";
const COLUMNS: DataTableColumn[] = [
  { id: "name", label: "OPERATOR", width: 24, flexGrow: 1, align: "left" },
  { id: "id", label: "VENUE", width: 10, align: "left" },
  { id: "protocol", label: "PROTOCOL", width: 9, align: "left" },
  { id: "deployer", label: "DEPLOYER", width: 44, align: "left" },
];
export function OperatorsView({
  operators,
  query,
  focused,
  onSelect,
}: {
  operators: Operator[];
  query: string;
  focused: boolean;
  onSelect: (operator: Operator) => void;
}) {
  const [sort, setSort] = useState<keyof Operator>("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      operators
        .filter((o) =>
          Object.values(o).some((v) =>
            v.toLowerCase().includes(query.toLowerCase().trim()),
          ),
        )
        .sort(
          (a, b) =>
            a[sort].localeCompare(b[sort]) * (direction === "asc" ? 1 : -1),
        ),
    [operators, query, sort, direction],
  );
  return (
    <DataTableView
      items={rows}
      columns={COLUMNS}
      focused={focused}
      emptyStateTitle="No operators match this search"
      getItemKey={(o) => `${o.protocol}:${o.id}`}
      selection={{
        kind: "id",
        selectedId: selected,
        getId: (o) => `${o.protocol}:${o.id}`,
        onChange: setSelected,
      }}
      sortColumnId={sort}
      sortDirection={direction}
      onHeaderClick={(id) => {
        if (id === sort) setDirection((d) => (d === "asc" ? "desc" : "asc"));
        else {
          setSort(id as keyof Operator);
          setDirection("asc");
        }
      }}
      onActivate={onSelect}
      renderCell={(o, c) => ({ text: o[c.id as keyof Operator] })}
    />
  );
}
