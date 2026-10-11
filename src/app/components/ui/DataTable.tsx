import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

function alignClass(align: Column<unknown>["align"]): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** Screen-reader description of the table. */
  caption?: string;
  empty?: ReactNode;
}

export function DataTable<T>({ columns, rows, rowKey, caption, empty }: DataTableProps<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="bg-[#f8f9fa] border-b border-[#dee2e6]">
            {columns.map((column, index) => (
              <th
                key={column.key}
                scope="col"
                className={`py-2.5 text-[11px] font-semibold text-[#6c757d] uppercase tracking-wider ${alignClass(
                  column.align,
                )} ${index === 0 ? "px-5" : "px-4"} ${column.headerClassName ?? ""}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f0f2f5]">
          {rows.map((row, rowIndex) => (
            <tr
              key={rowKey(row, rowIndex)}
              className={`hover:bg-[#f8f9fa] transition-colors ${
                rowIndex % 2 === 0 ? "bg-white" : "bg-[#fafbfc]"
              }`}
            >
              {columns.map((column, index) => (
                <td
                  key={column.key}
                  className={`py-3 ${alignClass(column.align)} ${
                    index === 0 ? "px-5" : "px-4"
                  } ${column.className ?? ""}`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
