import { DayStopKind, TripDayType } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { addUtcDays, makeUtcDate } from "./dates";
import { recomputeTripRoutes } from "./google-routes";
import { prisma } from "./prisma";
import { slugify } from "./utils";

type ParsedStop = {
  kind: DayStopKind;
  name: string;
  note: string;
};

type ParsedDay = {
  dayNumber: number;
  routeText: string;
  routeParts: string[];
  startName: string;
  endName: string;
  title: string;
  type: TripDayType;
  miles: number;
  summary: string;
  callout: string;
  accommodationName: string | null;
  accommodationDescription: string | null;
  stops: ParsedStop[];
};

const seedPlaces = [
  { slug: "marcellus-ny", name: "Marcellus, NY", regionLabel: "Marcellus, NY", latitude: 42.9828, longitude: -76.3413 },
  { slug: "rochester-ny", name: "Rochester, NY", regionLabel: "Rochester, NY", latitude: 43.1566, longitude: -77.6088 },
  { slug: "buffalo-niagara-ny", name: "Buffalo / Niagara, NY", regionLabel: "Buffalo / Niagara, NY", latitude: 43.0962, longitude: -79.0377 },
  { slug: "cambridge-oh", name: "Cambridge, OH", regionLabel: "Cambridge, OH", latitude: 40.0312, longitude: -81.5885 },
  { slug: "cumberland-falls-ky", name: "Cumberland Falls, KY", regionLabel: "Cumberland Falls, KY", latitude: 36.8372, longitude: -84.3454 },
  { slug: "grimsley-tn", name: "Grimsley, TN", regionLabel: "Grimsley, TN", latitude: 36.271, longitude: -85.034 },
  {
    slug: "cathedral-caverns-state-park-al",
    name: "Cathedral Caverns State Park, AL",
    regionLabel: "637 Cave Rd, Woodville, AL 35776",
    latitude: 34.5727,
    longitude: -86.2297
  },
  { slug: "birmingham-al", name: "Birmingham, AL", regionLabel: "Birmingham, AL", latitude: 33.5186, longitude: -86.8104 },
  { slug: "gulf-state-park-campground-al", name: "Gulf State Park Campground, AL", regionLabel: "Gulf Shores, AL", latitude: 30.2461, longitude: -87.7008 },
  { slug: "pensacola-beach-fl", name: "Pensacola Beach, FL", regionLabel: "Pensacola Beach, FL", latitude: 30.3269, longitude: -87.1500 },
  { slug: "atlanta-ga", name: "Atlanta, GA", regionLabel: "Atlanta, GA", latitude: 33.749, longitude: -84.388 },
  { slug: "roanoke-va", name: "Roanoke, VA", regionLabel: "Roanoke, VA", latitude: 37.2710, longitude: -79.9414 }
];

// Coordinates for activity/dinner stops — keyed by exact stop name
const seedStopCoordinates: Record<string, { latitude: number; longitude: number }> = {
  "It's A Wonderful Life Museum": { latitude: 42.9105234, longitude: -76.7974377 },
  "Dave and Rita's Farm Market and Bakery": { latitude: 42.9828438, longitude: -76.3404867 },
  "Patterson Fruit Farm": { latitude: 41.5604909, longitude: -81.3638734 },
  "Monroes Orchard & Farm Market": { latitude: 40.4172871, longitude: -82.907123 },
  "McKinley Birthplace Home": { latitude: 41.1796897, longitude: -80.7656426 },
  "World's Largest Baseball Bat": { latitude: 38.2572651, longitude: -85.7638079 },
  "Vintage Fire Museum and Safety Education Center": { latitude: 37.8393332, longitude: -84.2700179 },
  "Lincoln Museum": { latitude: 37.573904, longitude: -85.741008 },
  "Onyx Cave and Rock Shop": { latitude: 37.1366151, longitude: -85.981699 },
  "Hatcher Family Dairy": { latitude: 35.8164317, longitude: -86.7365085 },
  "Cathedral Caverns State Park": { latitude: 34.5727, longitude: -86.2297 },
  "Vulcan Park and Museum": { latitude: 33.4917, longitude: -86.795537 },
  "Birmingham Museum of Art": { latitude: 33.5222317, longitude: -86.8100742 },
  "Alabama Jazz Hall of Fame": { latitude: 33.514982, longitude: -86.8118713 },
  "Railroad Park Foundation": { latitude: 33.5088158, longitude: -86.810923 },
  "Pensacola Beach": { latitude: 30.3337006, longitude: -87.1411089 },
  "Alligator Alley": { latitude: 30.0202022, longitude: -84.9790797 },
  "Bamahenge": { latitude: 30.331442, longitude: -87.5672317 },
  "Delta Flight Museum": { latitude: 33.656077, longitude: -84.4223542 },
  "World of Coca-Cola": { latitude: 33.7625564, longitude: -84.392436 },
  "Leita Thompson Park (Dog Park)": { latitude: 34.0631062, longitude: -84.4032648 },
  "Wildman's Civil War Surplus": { latitude: 34.0238455, longitude: -84.6155803 },
  "Coot's Lake Beach": { latitude: 34.0234337, longitude: -84.6154897 },
  "Whirlpool Aero Car": { latitude: 43.1180306, longitude: -79.0687889 },
  "Horseshoe Falls": { latitude: 43.0793119, longitude: -79.0788341 },
  "Buffalo and Erie County Naval & Military Park": { latitude: 42.8774914, longitude: -78.8795832 },
  "Theodore Roosevelt Inaugural National Historic Site": { latitude: 42.9015939, longitude: -78.872706 },
};

const seedTripStartDate = makeUtcDate(2026, 3, 13);

function extractSection(markdown: string, heading: string) {
  const pattern = new RegExp(`## ${heading}\\n\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = markdown.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function cleanLabel(label: string) {
  return label.replace(/^\- /, "").trim();
}

function extractLineField(section: string, label: string) {
  const match = section.match(new RegExp(`\\- ${label}:\\s*([^\\n]+)`));
  return match?.[1]?.trim() ?? null;
}

function summarizeDay(startName: string, endName: string, stops: ParsedStop[], accommodationName: string | null, type: TripDayType) {
  const focus = stops
    .filter((stop) => stop.kind === DayStopKind.activity)
    .map((stop) => stop.name)
    .slice(0, 2)
    .join(" and ");

  if (type === TripDayType.basecamp) {
    return `Stay based in ${endName} and use the day for ${focus || "local exploring"}${accommodationName ? ` while remaining at ${accommodationName}` : ""}.`;
  }

  return `Travel from ${startName} to ${endName}${focus ? ` with time for ${focus}` : ""}${accommodationName ? ` before settling into ${accommodationName}` : ""}.`;
}

function calloutForDay(dayNumber: number, accommodationName: string | null, totalDays: number) {
  if (dayNumber === totalDays) {
    return "This closing day loops back to the trip's starting point and wraps the round trip.";
  }
  if (accommodationName) {
    return `Overnight stay is anchored by ${accommodationName}.`;
  }
  return "This day continues the broader southbound or return-route progression of the itinerary.";
}

function parseDay(section: string, dayNumber: number, totalDays: number): ParsedDay {
  const routeMatch = section.match(/\- Route:\s*(.+)/);
  if (!routeMatch) {
    throw new Error(`Day ${dayNumber} is missing a route.`);
  }

  const routeText = cleanLabel(routeMatch[1]);
  const routeParts = routeText.split("->").map((part) => part.trim());
  const startName = routeParts[0];
  const endName = routeParts.at(-1) ?? routeParts[0];
  const type = routeParts.length > 1 ? TripDayType.travel : TripDayType.basecamp;
  const fallbackTitle = type === TripDayType.basecamp ? `Exploring ${endName}` : routeText;
  const title = extractLineField(section, "Title") ?? fallbackTitle;
  const miles = Number(extractLineField(section, "Miles") ?? "0") || 0;
  const explicitSummary = extractLineField(section, "Summary");
  const explicitCallout = extractLineField(section, "Callout");

  const accommodationMatch = section.match(/\- Accommodation:\s*([^\n]+)\n\s+([^\n]+)/);
  const accommodationName = accommodationMatch?.[1]?.trim() ?? null;
  const accommodationDescription = accommodationMatch?.[2]?.trim() ?? null;

  const stopMatches = [...section.matchAll(/\- (Dinner|Activity):\s*([^\n]+)\n\s+([^\n]+)/g)];
  const stops: ParsedStop[] = stopMatches.map((match) => ({
    kind: match[1] === "Dinner" ? DayStopKind.dinner : DayStopKind.activity,
    name: match[2].trim(),
    note: match[3].trim()
  }));

  return {
    dayNumber,
    routeText,
    routeParts,
    startName,
    endName,
    title,
    type,
    miles,
    summary: explicitSummary ?? summarizeDay(startName, endName, stops, accommodationName, type),
    callout: explicitCallout ?? calloutForDay(dayNumber, accommodationName, totalDays),
    accommodationName,
    accommodationDescription,
    stops
  };
}

function parseNotes(notesSection: string) {
  const lines = notesSection
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const bookingLine = lines.find((line) => line.toLowerCase().includes("booking line"));
  const bookingPhone = bookingLine?.match(/(\+?\d[\d\-]+)/)?.[1] ?? null;

  return {
    notes: lines.map(cleanLabel).join("\n"),
    bookingPhone
  };
}

export async function readSeedMarkdown() {
  const filePath = path.join(process.cwd(), "data", "mark-brian-april-2026.md");
  return readFile(filePath, "utf8");
}

export async function importSeedTrip(markdown?: string) {
  const source = markdown ?? (await readSeedMarkdown());
  const title = source.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "Trip Itinerary";
  const tripSlug = "mark-brian-april-2026";
  const startingLocation = source.match(/^Starting location:\s*(.+)$/m)?.[1]?.trim() ?? "Marcellus, NY, USA";
  const introParagraphs = source.split("\n\n");
  const summary = introParagraphs[2]?.trim() ?? "RV trip itinerary";
  const routeOverview = extractSection(source, "Route Overview");
  const notesSection = extractSection(source, "Notes");
  const { notes, bookingPhone } = parseNotes(notesSection);
  const dayNumbers = [...source.matchAll(/^## Day (\d+)$/gm)].map((match) => Number(match[1])).sort((a, b) => a - b);
  const days = dayNumbers.map((dayNumber) => parseDay(extractSection(source, `Day ${dayNumber}`), dayNumber, dayNumbers.length));
  const tripEndDate = addUtcDays(seedTripStartDate, days.length - 1);
  const totalMiles = days.reduce((sum, day) => sum + day.miles, 0);
  const endingLocation = days.at(-1)?.endName ? `${days.at(-1)?.endName}, USA` : startingLocation;

  const trip = await prisma.$transaction(async (tx) => {
    for (const place of seedPlaces) {
      await tx.place.upsert({
        where: { slug: place.slug },
        update: place,
        create: place
      });
    }

    const placeMap = new Map(
      (await tx.place.findMany({
        where: {
          slug: {
            in: seedPlaces.map((place) => place.slug)
          }
        }
      })).map((place) => [place.name, place])
    );

    const trip = await tx.trip.upsert({
      where: { slug: tripSlug },
      update: {
        title,
        summary,
        startingLocation,
        endingLocation,
        startDate: seedTripStartDate,
        endDate: tripEndDate,
        routeOverview,
        notes,
        bookingPhone,
        totalMiles
      },
      create: {
        slug: tripSlug,
        title,
        summary,
        startingLocation,
        endingLocation,
        startDate: seedTripStartDate,
        endDate: tripEndDate,
        routeOverview,
        notes,
        bookingPhone,
        totalMiles
      }
    });

    await tx.dayStop.deleteMany({
      where: {
        tripDay: {
          tripId: trip.id
        }
      }
    });

    await tx.dayLocation.deleteMany({
      where: {
        tripDay: {
          tripId: trip.id
        }
      }
    });

    await tx.tripDay.deleteMany({
      where: { tripId: trip.id }
    });

    for (const day of days) {
      const startPlace = placeMap.get(day.startName);
      const endPlace = placeMap.get(day.endName);

      if (!startPlace || !endPlace) {
        throw new Error(`Missing place mapping for Day ${day.dayNumber}: ${day.routeText}`);
      }

      const createdDay = await tx.tripDay.create({
        data: {
          tripId: trip.id,
          dayNumber: day.dayNumber,
          date: addUtcDays(seedTripStartDate, day.dayNumber - 1),
          title: day.title,
          type: day.type,
          miles: day.miles,
          summary: day.summary,
          callout: day.callout,
          accommodationName: day.accommodationName,
          accommodationDescription: day.accommodationDescription,
          startPlaceId: startPlace.id,
          endPlaceId: endPlace.id
        }
      });

      if (day.stops.length) {
        await tx.dayStop.createMany({
          data: day.stops.map((stop, index) => ({
            tripDayId: createdDay.id,
            kind: stop.kind,
            sortOrder: index + 1,
            name: stop.name,
            note: stop.note,
            ...(seedStopCoordinates[stop.name] ?? {})
          }))
        });
      }

      let locationSort = 0;
      for (const partName of day.routeParts) {
        const partPlace = placeMap.get(partName);
        if (partPlace) {
          locationSort += 1;
          await tx.dayLocation.create({
            data: {
              tripDayId: createdDay.id,
              placeId: partPlace.id,
              sortOrder: locationSort
            }
          });
        }
      }
    }

    return trip;
  });

  await recomputeTripRoutes(trip.id);
  return trip;
}
