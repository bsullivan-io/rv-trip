"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock, faLockOpen } from "@fortawesome/free-solid-svg-icons";
import { useEditMode } from "@/components/ui/edit-mode";

type TopNavProps = {
  tripSlug: string;
};

export function FooterLock() {
  const { isUnlocked, setIsUnlocked } = useEditMode();

  return (
    <button
      className="footer-lock-button"
      type="button"
      onClick={() => setIsUnlocked(!isUnlocked)}
      title={isUnlocked ? "Lock editing" : "Unlock editing"}
    >
      <FontAwesomeIcon icon={isUnlocked ? faLockOpen : faLock} />
      {isUnlocked ? " Unlocked" : " Locked"}
    </button>
  );
}

export function TopNav({ tripSlug }: TopNavProps) {
  const pathname = usePathname();

  const overviewPath = `/trips/${tripSlug}/overview`;
  const detailsPath = `/trips/${tripSlug}`;

  const overviewActive = pathname.startsWith(overviewPath);
  const detailsActive = !overviewActive && pathname.startsWith(detailsPath);

  if (!tripSlug) return null;

  return (
    <nav className="top-nav-tabs">
      <Link
        href={overviewPath}
        className={`top-nav-tab${overviewActive ? " active" : ""}`}
      >
        <img src="/map_icon.png" alt="" aria-hidden className="top-nav-tab-rv" />
        Overview
      </Link>
      <Link
        href={detailsPath}
        className={`top-nav-tab${detailsActive ? " active" : ""}`}
      >
        <img src="/rv.png" alt="" aria-hidden className="top-nav-tab-rv" />
        Details
      </Link>
    </nav>
  );
}
