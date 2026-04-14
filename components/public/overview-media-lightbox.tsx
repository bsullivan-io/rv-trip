"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faShareNodes, faXmark } from "@fortawesome/free-solid-svg-icons";
import { formatShortDate } from "@/lib/dates";

export type OverviewMediaItem = {
  id: string;
  filePath: string;
  originalFilename: string;
  title: string | null;
  caption: string | null;
  mimeType: string | null;
  capturedAt: string | null;
};

export function OverviewMediaLightbox({ allMedia }: { allMedia: OverviewMediaItem[] }) {
  const [selectedMedia, setSelectedMedia] = useState<OverviewMediaItem | null>(null);
  const urlSyncReady = useRef(false);

  // Sync ?media= param with open/closed state (skip on initial render)
  useEffect(() => {
    if (!urlSyncReady.current) return;
    const params = new URLSearchParams(window.location.search);
    if (selectedMedia) {
      params.set("media", selectedMedia.id);
      history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    } else if (params.has("media")) {
      params.delete("media");
      const search = params.toString();
      history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
    }
  }, [selectedMedia]);

  // Auto-open from ?media= on mount
  useEffect(() => {
    urlSyncReady.current = true;
    const mediaId = new URLSearchParams(window.location.search).get("media");
    if (mediaId) {
      const found = allMedia.find((m) => m.id === mediaId);
      if (found) setSelectedMedia(found);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Event delegation: clicks on [data-lightbox-id] open the modal
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = (e.target as Element).closest("[data-lightbox-id]");
      if (!target) return;
      const id = target.getAttribute("data-lightbox-id");
      if (!id) return;
      const found = allMedia.find((m) => m.id === id);
      if (found) setSelectedMedia(found);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [allMedia]);

  // Escape key to close
  useEffect(() => {
    if (!selectedMedia) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedMedia(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedMedia]);

  async function handleShare() {
    if (!selectedMedia) return;
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: selectedMedia.title ?? selectedMedia.originalFilename, url: shareUrl });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      window.alert("Link copied to clipboard.");
    } catch {
      window.open(shareUrl, "_blank", "noopener,noreferrer");
    }
  }

  if (!selectedMedia) return null;

  const isVideo = selectedMedia.mimeType?.startsWith("video/") ?? false;

  return (
    <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={selectedMedia.originalFilename}>
      <button className="photo-lightbox-backdrop" type="button" onClick={() => setSelectedMedia(null)} aria-label="Close photo viewer" />
      <div className="photo-lightbox-panel">
        <div className="photo-lightbox-toolbar">
          <div className="photo-lightbox-meta">
            <strong>{selectedMedia.title ?? selectedMedia.originalFilename}</strong>
            {selectedMedia.caption ? <span>{selectedMedia.caption}</span> : null}
            {selectedMedia.capturedAt ? <span>{formatShortDate(selectedMedia.capturedAt)}</span> : null}
          </div>
          <div className="inline-actions">
            <button className="button-secondary icon-button" type="button" onClick={handleShare} aria-label="Share" title="Share">
              <FontAwesomeIcon icon={faShareNodes} />
            </button>
            <button className="button-secondary icon-button" type="button" onClick={() => setSelectedMedia(null)} aria-label="Close photo viewer" title="Close photo viewer">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        </div>
        <div className="photo-lightbox-image-wrap">
          {isVideo ? (
            <video key={selectedMedia.id} className="photo-lightbox-image" src={selectedMedia.filePath} controls playsInline preload="metadata" />
          ) : (
            <img className="photo-lightbox-image" src={selectedMedia.filePath} alt={selectedMedia.originalFilename} />
          )}
        </div>
      </div>
    </div>
  );
}
