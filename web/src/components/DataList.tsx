import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
  /** On phones: "primary" leads the card, "hidden" is dropped, others become label/value rows. */
  mobile?: "primary" | "hidden";
}

/** A table on wide screens and a stack of cards on phones. */
export function DataList<T>({
  rows,
  columns,
  rowKey,
  rowClassName,
  onRowClick,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  caption?: string;
}) {
  const primary = columns.find((c) => c.mobile === "primary") ?? columns[0];
  const rest = columns.filter((c) => c !== primary && c.mobile !== "hidden");
  return (
    <>
      <div className="hidden md:block">
        <Table>
          {caption && <caption className="sr-only">{caption}</caption>}
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(c.align === "right" && "text-right", c.className)}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={rowKey(r)}
                className={cn(onRowClick && "cursor-pointer", rowClassName?.(r))}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn(c.align === "right" && "text-right tabular", c.className)}>
                    {c.cell(r)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="divide-y md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li
            key={rowKey(r)}
            className={cn("space-y-2 py-3", onRowClick && "cursor-pointer", rowClassName?.(r))}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
          >
            <div className="min-w-0">{primary.cell(r)}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {rest.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-muted-foreground">{c.header}</dt>
                  <dd className={cn("min-w-0 text-right tabular", c.className)}>{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
