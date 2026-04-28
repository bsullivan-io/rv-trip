"use client";

import { useRef, useState } from "react";

type UploadResult = {
  filename: string;
  dayNumber: number | null;
  error: string | null;
};

type Props = {
  tripId: string;
  slug: string;
  tripTitle: string;
};

export function PhotoUploadPageClient({ tripId, slug, tripTitle }: Props) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [results, setResults] = useState<UploadResult[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const total = selectedFiles.length;
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFiles.length || uploading) return;

    setUploading(true);
    setCompleted(0);
    setResults(null);

    const uploadResults: UploadResult[] = [];

    for (const file of selectedFiles) {
      const fd = new FormData();
      fd.append("tripId", tripId);
      fd.append("slug", slug);
      fd.append("photo", file);

      try {
        const res = await fetch("/api/upload-photo", { method: "POST", body: fd });
        const data = (await res.json()) as { dayNumber?: number; error?: string };
        uploadResults.push({
          filename: file.name,
          dayNumber: data.dayNumber ?? null,
          error: data.error ?? null
        });
      } catch {
        uploadResults.push({ filename: file.name, dayNumber: null, error: "Network error" });
      }

      setCompleted((c) => c + 1);
    }

    setResults(uploadResults);
    setUploading(false);
  }

  const hasResults = results && results.length > 0;
  const successCount = results?.filter((r) => !r.error).length ?? 0;

  return (
    <div className="photo-upload-page">
      <header className="upload-page-header">
        <a href={`/trips/${slug}/details`} className="back-link">← {tripTitle}</a>
        <h1 className="trip-heading">Upload Photos</h1>
        <p className="upload-page-hint">
          Photos will be automatically matched to the correct day using their timestamp and location.
        </p>
      </header>

      {!hasResults && (
        <form onSubmit={handleSubmit} className="upload-form">
          <input
            ref={inputRef}
            type="file"
            name="photos"
            accept="image/*"
            multiple
            className="upload-file-input-hidden"
            onChange={(e) => {
              setSelectedFiles(Array.from(e.target.files ?? []));
              setResults(null);
              setCompleted(0);
            }}
          />

          <button
            type="button"
            className="upload-browse-btn"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {selectedFiles.length > 0
              ? `${selectedFiles.length} photo${selectedFiles.length !== 1 ? "s" : ""} selected`
              : "Browse Photos"}
          </button>

          {uploading && (
            <div className="upload-progress">
              <div className="upload-progress-label">
                Uploading {completed} of {total}…
              </div>
              <div className="upload-progress-track">
                <div className="upload-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          {selectedFiles.length > 0 && !uploading && (
            <button type="submit" className="button-primary upload-submit-btn">
              Upload {selectedFiles.length} photo{selectedFiles.length !== 1 ? "s" : ""}
            </button>
          )}
        </form>
      )}

      {hasResults && (
        <div className="upload-results">
          <div className="upload-results-summary">
            {successCount} of {results.length} photos uploaded successfully.
          </div>
          {results.map((r, i) => (
            <div
              key={i}
              className={`upload-result-item ${r.error ? "upload-result-error" : "upload-result-ok"}`}
            >
              <span className="upload-result-name">{r.filename}</span>
              {r.error
                ? <span className="upload-result-status">Error: {r.error}</span>
                : <span className="upload-result-status">Day {r.dayNumber}</span>
              }
            </div>
          ))}
          <a href={`/trips/${slug}/details`} className="button-secondary upload-done-btn">
            Done
          </a>
        </div>
      )}
    </div>
  );
}
