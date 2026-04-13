"use client";

import { TabsList, TabsRoot, TabsTrigger } from "@chakra-ui/react";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays, faLocationDot, faMap, faRoute } from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";

export type TripStageTabValue = "map" | "calendar" | "locations" | "hotdogs" | "tracker";

type TripStageTabsProps = {
  slug: string;
  value: TripStageTabValue;
  onSelectLocal?: (value: TripStageTabValue) => void;
  className?: string;
};

const tabs: Array<{ value: TripStageTabValue; label: string; imageIcon?: string; fontIcon?: IconDefinition }> = [
  { value: "map", label: "Map", fontIcon: faMap },
  { value: "calendar", label: "Calendar", fontIcon: faCalendarDays },
  { value: "locations", label: "Locations", fontIcon: faLocationDot },
  { value: "hotdogs", label: "Hot Dogs", imageIcon: "/hot_dog.png" },
  { value: "tracker", label: "Tracker", fontIcon: faRoute }
];

export function TripStageTabs({ slug, value, onSelectLocal, className }: TripStageTabsProps) {
  const router = useRouter();

  return (
    <TabsRoot
      value={value}
      onValueChange={(details) => {
        const next = details.value as TripStageTabValue;

        if (onSelectLocal) {
          onSelectLocal(next);
          return;
        }

        if (next === "tracker") {
          router.push(`/trips/${slug}/overview`);
          return;
        }

        router.push(`/trips/${slug}?view=${next}`);
      }}
      className={className}
    >
      <TabsList
        className="trip-stage-tabs"
        bg="transparent"
        borderBottomWidth="1px"
        borderColor="border"
        gap={1}
        px={0}
        py={0}
        minH="auto"
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="trip-stage-tab"
            bg="transparent"
            color="muted"
            borderBottomWidth="2px"
            borderBottomColor="transparent"
            pl={3}
            pr={4}
            py={3}
            fontSize="sm"
            fontWeight="600"
            lineHeight="1"
            _selected={{
              color: "brand.700",
              borderBottomColor: "brand.700"
            }}
          >
            {tab.imageIcon ? <img src={tab.imageIcon} alt="" aria-hidden className="hotdog-toolbar-icon" /> : null}
            {tab.fontIcon ? <FontAwesomeIcon icon={tab.fontIcon} className="trip-stage-tab-icon" /> : null}
            <span>{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </TabsRoot>
  );
}
