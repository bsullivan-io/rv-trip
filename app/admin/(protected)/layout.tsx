import NextLink from "next/link";
import { Box, Button, HStack, Heading, Link, Stack, Text } from "@chakra-ui/react";
import { requireAdmin } from "@/lib/auth";
import { logoutAction } from "@/app/admin/(protected)/actions";

export default async function AdminProtectedLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireAdmin();

  return (
    <Stack gap={4}>
      <Box borderWidth="1px" borderColor="brand.600" borderTopWidth="4px" bg="white" p={{ base: 4, md: 5 }}>
        <Stack direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "flex-start", md: "center" }} gap={4}>
          <Box>
            <Text textTransform="uppercase" letterSpacing="0.14em" fontSize="xs" color="muted" mb={2}>
              Admin
            </Text>
            <Heading size="2xl" mb={2}>
              Trip Console
            </Heading>
            <Text color="muted" fontSize="sm">
              Signed in as {user.email}
            </Text>
          </Box>
          <HStack gap={3} align="stretch" flexWrap="wrap">
            <Link as={NextLink} href="/" display="inline-flex" alignItems="center" justifyContent="center" minH="2.25rem" px={4} bg="blackAlpha.300" color="text">
              View Public App
            </Link>
            <form action={logoutAction}>
              <Button type="submit" bg="accentStrong" color="white" _hover={{ bg: "brand.700" }} size="sm">
                Sign out
              </Button>
            </form>
          </HStack>
        </Stack>
      </Box>
      {children}
    </Stack>
  );
}
