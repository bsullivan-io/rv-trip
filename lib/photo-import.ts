import { parse } from "exifr";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { distanceMiles } from "@/lib/google-maps";
import { parseUtcDateKey } from "@/lib/trip-stays";

type TripDayMatch = {
  id: string;
  dayNumber: number;
  date: string | null;
  locations: Array<{
    place: {
      latitude: number;
      longitude: number;
    };
  }>;
  endPlace: {
    name: string;
    latitude: number;
    longitude: number;
  };
};

type PhotoMetadata = {
  capturedAt: Date | null;
  latitude: number | null;
  longitude: number | null;
};

export async function extractPhotoMetadata(buffer: Buffer) {
  let metadata: {
    DateTimeOriginal?: Date;
    CreateDate?: Date;
    ModifyDate?: Date;
    latitude?: number;
    longitude?: number;
  } | null = null;

  try {
    metadata = (await parse(buffer, {
      gps: true,
      tiff: true,
      exif: true
    })) as {
      DateTimeOriginal?: Date;
      CreateDate?: Date;
      ModifyDate?: Date;
      latitude?: number;
      longitude?: number;
    } | null;
  } catch {
    metadata = null;
  }

  return {
    capturedAt: metadata?.DateTimeOriginal ?? metadata?.CreateDate ?? metadata?.ModifyDate ?? null,
    latitude: metadata?.latitude ?? null,
    longitude: metadata?.longitude ?? null
  } satisfies PhotoMetadata;
}

function dayDistance(day: TripDayMatch, latitude: number, longitude: number) {
  const places = day.locations.length
    ? day.locations.map((location) => location.place)
    : [day.endPlace];

  return Math.min(
    ...places.map((place) =>
      distanceMiles(
        { latitude, longitude },
        {
          latitude: place.latitude,
          longitude: place.longitude
        }
      )
    )
  );
}

function toDateKeyFromLocalDate(value: Date) {
  return `${value.getFullYear()}-${`${value.getMonth() + 1}`.padStart(2, "0")}-${`${value.getDate()}`.padStart(2, "0")}`;
}

export function matchPhotoToDay(days: TripDayMatch[], metadata: PhotoMetadata, selectedDayNumber: number) {
  const datedDays = days.filter((day): day is TripDayMatch & { date: string } => Boolean(day.date));
  const exactDateKey = metadata.capturedAt ? toDateKeyFromLocalDate(metadata.capturedAt) : null;

  let candidates = datedDays;
  if (exactDateKey) {
    const exactMatches = datedDays.filter((day) => day.date === exactDateKey);
    if (exactMatches.length) {
      candidates = exactMatches;
    } else {
      candidates = datedDays
        .map((day) => ({
          day,
          delta: Math.abs(parseUtcDateKey(day.date).getTime() - parseUtcDateKey(exactDateKey).getTime())
        }))
        .sort((left, right) => left.delta - right.delta)
        .map((entry) => entry.day);
    }
  }

  if (metadata.latitude != null && metadata.longitude != null) {
    return (
      candidates
        .map((day) => ({
          day,
          distance: dayDistance(day, metadata.latitude as number, metadata.longitude as number)
        }))
        .sort((left, right) => left.distance - right.distance)[0]?.day ??
      days.find((day) => day.dayNumber === selectedDayNumber) ??
      days[0]
    );
  }

  return candidates[0] ?? days.find((day) => day.dayNumber === selectedDayNumber) ?? days[0];
}

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/heic", "image/heif", "image/webp", "image/png", "image/tiff"]);

export async function saveUploadedMedia(file: File, directory = "trip-photos") {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const isImage = IMAGE_MIME_TYPES.has(file.type?.toLowerCase());

  // Auto-rotate based on EXIF orientation so OG crawlers and any viewer see
  // the correct orientation (iPhones store raw sensor data + an orientation tag)
  const outputBuffer = isImage
    ? await sharp(buffer).rotate().toBuffer()
    : buffer;

  const extension = path.extname(file.name) || ".jpg";
  const filename = `${randomUUID()}${extension.toLowerCase()}`;
  const relativePath = path.join("uploads", directory, filename);
  const outputPath = path.join(process.cwd(), "public", relativePath);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, outputBuffer);

  return {
    buffer,
    relativePath: `/${relativePath.replace(/\\/g, "/")}`
  };
}

export async function saveUploadedPhoto(file: File) {
  return saveUploadedMedia(file, "trip-photos");
}

export async function deleteUploadedPhoto(filePath: string) {
  const normalizedPath = filePath.replace(/^\/+/, "");
  const outputPath = path.join(process.cwd(), "public", normalizedPath);

  try {
    await unlink(outputPath);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }
}
