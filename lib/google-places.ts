type PlaceSuggestion = {
  placeId: string;
  text: string;
  secondaryText: string | null;
};

type PlaceDetails = {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
};

type TextSearchPlace = {
  placeId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
};

function getApiKey() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is required for place search.");
  }
  return apiKey;
}

export async function autocompletePlaces(input: string) {
  const query = input.trim();
  if (!query) {
    return [];
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask": "suggestions.placePrediction.place,suggestions.placePrediction.placeId,suggestions.placePrediction.text"
    },
    body: JSON.stringify({
      input: query
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google place autocomplete failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        place?: string;
        placeId?: string;
        text?: {
          text?: string;
        };
        structuredFormat?: {
          mainText?: {
            text?: string;
          };
          secondaryText?: {
            text?: string;
          };
        };
      };
    }>;
  };

  return (payload.suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction?.placeId && prediction.text?.text))
    .map((prediction) => ({
      placeId: prediction.placeId as string,
      text: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "Unknown place",
      secondaryText: prediction.structuredFormat?.secondaryText?.text ?? null
    })) satisfies PlaceSuggestion[];
}

export async function getPlaceDetails(placeId: string) {
  const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask": "id,displayName,location"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google place details failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as {
    id?: string;
    displayName?: { text?: string };
    location?: { latitude?: number; longitude?: number };
  };

  if (!payload.id || !payload.displayName?.text || payload.location?.latitude == null || payload.location?.longitude == null) {
    throw new Error("Place details response was incomplete.");
  }

  return {
    placeId: payload.id,
    name: payload.displayName.text,
    latitude: payload.location.latitude,
    longitude: payload.location.longitude
  } satisfies PlaceDetails;
}

export async function searchTextPlaces(input: {
  query: string;
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  maxResultCount?: number;
}) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location"
    },
    body: JSON.stringify({
      textQuery: input.query,
      maxResultCount: input.maxResultCount ?? 8,
      locationBias: {
        circle: {
          center: {
            latitude: input.latitude,
            longitude: input.longitude
          },
          radius: input.radiusMeters ?? 50000
        }
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google text place search failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    }>;
  };

  return (payload.places ?? [])
    .filter((place) => place.id && place.displayName?.text && place.location?.latitude != null && place.location?.longitude != null)
    .map((place) => ({
      placeId: place.id as string,
      name: place.displayName?.text as string,
      address: place.formattedAddress ?? null,
      latitude: place.location?.latitude as number,
      longitude: place.location?.longitude as number
    })) satisfies TextSearchPlace[];
}
