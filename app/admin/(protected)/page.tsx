import NextLink from "next/link";
import { Box, Button, Field, Grid, Heading, Input, Link, Stack, Text, Textarea } from "@chakra-ui/react";
import { createTripAction } from "@/app/admin/(protected)/actions";
import { getTrips } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const trips = await getTrips();

  return (
    <Grid templateColumns={{ base: "1fr", xl: "1.1fr 0.9fr" }} gap={4}>
      <Box borderWidth="1px" borderColor="border" bg="panel" p={{ base: 4, md: 5 }}>
        <Text textTransform="uppercase" letterSpacing="0.14em" fontSize="xs" color="muted" mb={3}>
          Trips
        </Text>
        <Stack gap={3}>
          {trips.map((trip) => (
            <Link
              key={trip.id}
              as={NextLink}
              href={`/admin/trips/${trip.id}`}
              display="block"
              borderWidth="1px"
              borderColor="border"
              bg="blackAlpha.200"
              p={4}
              _hover={{ bg: "blackAlpha.300", textDecoration: "none" }}
            >
              <Heading size="md" mb={1}>
                {trip.title}
              </Heading>
              <Text color="muted" fontSize="sm">
                {trip.days.length} days · {trip.slug}
              </Text>
            </Link>
          ))}
        </Stack>
      </Box>

      <Box borderWidth="1px" borderColor="border" bg="panel" p={{ base: 4, md: 5 }}>
        <Text textTransform="uppercase" letterSpacing="0.14em" fontSize="xs" color="muted" mb={3}>
          Create Trip
        </Text>
        <form action={createTripAction}>
          <Stack gap={4}>
            <Field.Root>
              <Field.Label>Title</Field.Label>
              <Input name="title" required bg="blackAlpha.300" borderColor="border" size="sm" />
            </Field.Root>
            <Field.Root>
              <Field.Label>Summary</Field.Label>
              <Textarea name="summary" rows={3} required bg="blackAlpha.300" borderColor="border" size="sm" />
            </Field.Root>
            <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
              <Field.Root>
                <Field.Label>Starting location</Field.Label>
                <Input name="startingLocation" required bg="blackAlpha.300" borderColor="border" size="sm" />
              </Field.Root>
              <Field.Root>
                <Field.Label>Ending location</Field.Label>
                <Input name="endingLocation" required bg="blackAlpha.300" borderColor="border" size="sm" />
              </Field.Root>
            </Grid>
            <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
              <Field.Root>
                <Field.Label>Start date</Field.Label>
                <Input name="startDate" type="date" required bg="blackAlpha.300" borderColor="border" size="sm" />
              </Field.Root>
              <Field.Root>
                <Field.Label>End date</Field.Label>
                <Input name="endDate" type="date" required bg="blackAlpha.300" borderColor="border" size="sm" />
              </Field.Root>
            </Grid>
            <Field.Root>
              <Field.Label>Route overview</Field.Label>
              <Textarea name="routeOverview" rows={3} required bg="blackAlpha.300" borderColor="border" size="sm" />
            </Field.Root>
            <Field.Root>
              <Field.Label>Notes</Field.Label>
              <Textarea name="notes" rows={4} bg="blackAlpha.300" borderColor="border" size="sm" />
            </Field.Root>
            <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
              <Field.Root>
                <Field.Label>Booking phone</Field.Label>
                <Input name="bookingPhone" bg="blackAlpha.300" borderColor="border" size="sm" />
              </Field.Root>
              <Field.Root>
                <Field.Label>Total miles</Field.Label>
                <Input name="totalMiles" type="number" min="0" bg="blackAlpha.300" borderColor="border" size="sm" />
              </Field.Root>
            </Grid>
            <Button type="submit" bg="accentStrong" color="white" _hover={{ bg: "brand.700" }} size="sm">
              Create trip
            </Button>
          </Stack>
        </form>
      </Box>
    </Grid>
  );
}
