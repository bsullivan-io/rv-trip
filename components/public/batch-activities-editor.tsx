"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { initialBatchActivitiesState, type BatchActivitiesState } from "@/lib/batch-activities";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button" type="submit" disabled={pending}>
      {pending ? "Adding..." : "Add Activities"}
    </button>
  );
}

export function BatchActivitiesEditor({
  tripId,
  slug,
  action
}: {
  tripId: string;
  slug: string;
  action: (state: BatchActivitiesState, formData: FormData) => Promise<BatchActivitiesState>;
}) {
  const [state, formAction] = useActionState(action, initialBatchActivitiesState);

  return (
    <div className="stack">
      <form action={formAction} className="stack">
        <input type="hidden" name="tripId" value={tripId} />
        <input type="hidden" name="slug" value={slug} />

        <div className="field">
          <label htmlFor="batch-activities">Activities</label>
          <textarea
            id="batch-activities"
            name="activities"
            rows={14}
            placeholder={"One activity per line\nKFC\nDaniel Boone National Forest\nPensacola Beach"}
          />
        </div>

        <p className="muted">Each line is resolved through Google Places and auto-assigned to the nearest day.</p>
        <div className="inline-actions">
          <SubmitButton />
        </div>
      </form>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      {state.submitted ? (
        <section className="batch-results">
          <div className="chip-row">
            <span className="chip">{state.summary.added} added</span>
            <span className="chip">{state.summary.duplicate} duplicates</span>
            <span className="chip">{state.summary.failed} failed</span>
          </div>

          <ul className="batch-results-list">
            {state.results.map((result, index) => (
              <li key={`${result.line}-${index}`} className={`batch-result ${result.status}`}>
                <strong>{result.line}</strong>
                <span>
                  {result.status === "added"
                    ? `Added to Day ${result.dayNumber}${result.placeName ? ` near ${result.placeName}` : ""}.`
                    : result.status === "duplicate"
                      ? `Skipped duplicate on Day ${result.dayNumber}${result.placeName ? ` near ${result.placeName}` : ""}.`
                      : result.message}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
