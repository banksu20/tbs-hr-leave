import { useEffect, useRef, useState } from "react";

export interface EditableCellProps {
  value: string;
  onCommit: (next: string) => void;
  cellId: string;
  gridId: string;
  align?: "left" | "center";
  placeholder?: string;
  displayClassName?: string;
  inputClassName?: string;
  title?: string;
  format?: (value: string) => string;
}

function focusCell(gridId: string, row: number, col: number) {
  const target = document.querySelector<HTMLInputElement>(
    `input[data-grid="${gridId}"][data-row="${row}"][data-col="${col}"]`
  );
  if (target) {
    target.focus();
    target.select();
  }
}

export default function EditableCell({
  value,
  onCommit,
  cellId,
  gridId,
  align = "left",
  placeholder,
  displayClassName = "",
  inputClassName = "",
  title,
  format,
}: EditableCellProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const justCommitted = useRef(false);

  const [, rowRaw, colRaw] = cellId.split(":");
  const row = Number(rowRaw);
  const col = Number(colRaw);

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  const commitAndRelease = () => {
    justCommitted.current = true;
    commit();
    setFocused(false);
  };

  const shown = focused ? draft : format ? format(draft) : draft;

  return (
    <input
      ref={inputRef}
      data-grid={gridId}
      data-row={row}
      data-col={col}
      title={title}
      value={shown}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        setFocused(true);
        window.requestAnimationFrame(() => inputRef.current?.select());
      }}
      onBlur={() => {
        setFocused(false);
        if (justCommitted.current) {
          justCommitted.current = false;
          return;
        }
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitAndRelease();
          focusCell(gridId, row + 1, col);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(value);
          inputRef.current?.blur();
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          commitAndRelease();
          focusCell(gridId, row + (e.key === "ArrowDown" ? 1 : -1), col);
        }
      }}
      className={`w-full h-7 px-2 rounded-sm text-xs bg-transparent border border-transparent truncate transition-colors hover:border-slate-300 hover:bg-white/70 focus:bg-white focus:border-[#00B5E2] focus:ring-2 focus:ring-[#00B5E2]/25 focus:outline-none ${
        align === "center" ? "text-center" : "text-left"
      } ${focused ? inputClassName : displayClassName}`}
    />
  );
}
