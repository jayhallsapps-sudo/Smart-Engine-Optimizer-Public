import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";

interface EditableSectionProps {
  editKey: string;
  value: string;
  edits: Record<string, string>;
  onEdit: (key: string, value: string) => void;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
  as?: "p" | "span" | "h1" | "h2" | "h3" | "td" | "div";
}

export function EditableSection({
  editKey,
  value,
  edits,
  onEdit,
  className = "",
  style,
  multiline = false,
  as: Tag = "div",
}: EditableSectionProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  const current = edits[editKey] ?? value;

  function startEdit() {
    setDraft(current);
    setEditing(true);
  }

  function commit() {
    onEdit(editKey, draft);
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
  }

  useEffect(() => {
    if (editing && ref.current) ref.current.focus();
  }, [editing]);

  if (editing) {
    return (
      <span className="relative inline-block w-full">
        {multiline ? (
          <textarea
            ref={ref as React.RefObject<HTMLTextAreaElement>}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="w-full border-2 border-border rounded px-2 py-1 text-sm font-inherit bg-background resize-y min-h-[60px] outline-none focus:border-primary"
            data-testid={`input-edit-${editKey}`}
          />
        ) : (
          <input
            ref={ref as React.RefObject<HTMLInputElement>}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="w-full border-2 border-border rounded px-2 py-1 text-sm font-inherit bg-background outline-none focus:border-primary"
            data-testid={`input-edit-${editKey}`}
          />
        )}
        <span className="flex gap-1 mt-1">
          <button
            onClick={commit}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
            data-testid={`button-commit-${editKey}`}
          >
            <Check className="w-3 h-3" /> Save
          </button>
          <button
            onClick={cancel}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-400 text-white rounded hover:bg-gray-500"
            data-testid={`button-cancel-${editKey}`}
          >
            <X className="w-3 h-3" /> Cancel
          </button>
        </span>
      </span>
    );
  }

  return (
    <Tag
      className={`group relative cursor-pointer hover:outline hover:outline-1 hover:outline-border rounded transition-all ${className}`}
      style={style}
      onClick={startEdit}
      title="Click to edit"
      data-testid={`editable-${editKey}`}
    >
      {current}
      <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 absolute top-0.5 right-0.5 pointer-events-none" />
    </Tag>
  );
}
