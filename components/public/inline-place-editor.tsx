"use client";

import { useEffect, useRef, useState } from "react";

type PlaceSuggestion = {
  placeId: string;
  text: string;
  secondaryText: string | null;
};

type Props = {
  label: string;
  currentName: string;
  field: string;
  action: (formData: FormData) => Promise<void>;
  hiddenFields: Record<string, string | number>;
};

export function InlinePlaceEditor({ label, currentName, field, action, hiddenFields }: Props) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [selected, setSelected] = useState<PlaceSuggestion | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!query || selected) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/place-search?q=${encodeURIComponent(query.trim())}`);
        const data = (await res.json()) as { suggestions?: PlaceSuggestion[] };
        setResults(data.suggestions ?? []);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, selected]);

  function handleSelect(suggestion: PlaceSuggestion) {
    setSelected(suggestion);
    setQuery(suggestion.text);
    setResults([]);
  }

  function handleCancel() {
    setEditing(false);
    setQuery("");
    setResults([]);
    setSelected(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const fd = new FormData(formRef.current!);
    await action(fd);
  }

  if (!editing) {
    return (
      <span className="inline-place-display">
        {currentName}
        <button type="button" className="inline-place-edit-btn" onClick={() => { setEditing(true); setQuery(currentName); }}>
          Edit
        </button>
      </span>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="tracker-inline-form inline-place-form">
      {Object.entries(hiddenFields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="placeId" value={selected?.placeId ?? ""} />

      <div className="inline-place-search-wrap">
        <input
          className="tracker-inline-input"
          type="text"
          placeholder={`Search ${label}…`}
          value={query}
          autoFocus
          onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
        />
        {results.length > 0 && (
          <div className="search-suggestions">
            {results.map((s) => (
              <button key={s.placeId} type="button" className="search-suggestion" onClick={() => handleSelect(s)}>
                <strong>{s.text}</strong>
                {s.secondaryText ? <span>{s.secondaryText}</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>

      <button type="submit" className="button-secondary tracker-inline-save" disabled={!selected}>
        Save
      </button>
      <button type="button" className="button-secondary" onClick={handleCancel}>
        Cancel
      </button>
    </form>
  );
}
