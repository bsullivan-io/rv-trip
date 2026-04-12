import { prisma } from "@/lib/prisma";

export async function getTrips() {
  return prisma.trip.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      days: {
        orderBy: { dayNumber: "asc" }
      }
    }
  });
}

export async function getTripBySlug(slug: string) {
  return prisma.trip.findUnique({
    where: { slug },
    include: {
      hotDogPlaces: {
        orderBy: [{ tripDayId: "asc" }, { name: "asc" }],
        include: {
          tripDay: true
        }
      },
      days: {
        orderBy: { dayNumber: "asc" },
        include: {
          startPlace: true,
          endPlace: true,
          locations: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include: {
              place: true
            }
          },
          photos: {
            orderBy: { createdAt: "asc" }
          },
          stops: {
            orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
            include: {
              place: true
            }
          }
        }
      }
    }
  });
}

export async function getAdminTrip(tripId: string) {
  return prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      hotDogPlaces: {
        orderBy: [{ tripDayId: "asc" }, { name: "asc" }]
      },
      days: {
        orderBy: { dayNumber: "asc" },
        include: {
          startPlace: true,
          endPlace: true,
          locations: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            include: {
              place: true
            }
          },
          photos: {
            orderBy: { createdAt: "asc" }
          },
          stops: {
            orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
            include: {
              place: true
            }
          }
        }
      }
    }
  });
}

export async function getPlaces() {
  return prisma.place.findMany({
    orderBy: { name: "asc" }
  });
}
