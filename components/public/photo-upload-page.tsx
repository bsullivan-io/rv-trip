"use client";

import { useActionState, useRef, useState } from "react";
import type { BatchUploadResult } from "@/app/trips/[slug]/actions";

type Props = {
  tripId: string;
  slug: string;
  tripTitle: string;
  uploadAction: (prevState: unknown, formData: FormData) => Promise<BatchUploadResult>;
};

export function PhotoUploadPageClient({ tripId, slug, tripTitle, uploadAction }: Props) {
  const [state, dispatch, pending] = useActionState(uploadAction, null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasResults = state?.results && state.results.length > 0;

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
        <form action={dispatch} className="upload-form">
          <input type="hidden" name="tripId" value={tripId} />
          <input type="hidden" name="slug" value={slug} />
          <input
            ref={inputRef}
            type="file"
            name="photos"
            accept="image/*"
            multiple
            className="upload-file-input-hidden"
            onChange={(e) => setSelectedFiles(Array.from(e.target.files ?? []))}
          />

          <button
            type="button"
            className="upload-browse-btn"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
          >
            {pending
              ? "Uploading…"
              : selectedFiles.length > 0
                ? `${selectedFiles.length} photo${selectedFiles.length !== 1 ? "s" : ""} selected`
                : "Browse Photos"}
          </button>

          {selectedFiles.length > 0 && (
            <button type="submit" className="button-primary upload-submit-btn" disabled={pending}>
              {pending
                ? `Uploading ${selectedFiles.length} photo${selectedFiles.length !== 1 ? "s" : ""}…`
                : `Upload ${selectedFiles.length} photo${selectedFiles.length !== 1 ? "s" : ""}`}
            </button>
          )}
        </form>
      )}

      {hasResults && (
        <div className="upload-results">
          <div className="upload-results-summary">
            {state.results.filter((r) => !r.error).length} of {state.results.length} photos uploaded successfully.
          </div>
          {state.results.map((r, i) => (
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
