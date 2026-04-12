import "./globals.css";
import type { Metadata } from "next";
import NextLink from "next/link";
import { Box, Flex, HStack, Link, Text } from "@chakra-ui/react";
import { Provider } from "@/components/ui/provider";

export const metadata: Metadata = {
  title: "RV Trip",
  description: "Interactive RV itinerary map and admin console"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Provider>
          <Box className="site-shell" maxW="92rem" mx="auto" px={{ base: 3, md: 5 }} py={{ base: 3, md: 4 }}>
            <Flex
              as="header"
              className="site-header"
              direction={{ base: "column", md: "row" }}
              align={{ base: "flex-start", md: "center" }}
              justify="space-between"
              gap={4}
              px={{ base: 4, md: 5 }}
              py={{ base: 4, md: 5 }}
              mb={4}
              borderWidth="1px"
              borderColor="brand.600"
              borderTopWidth="4px"
              bg="white"
              boxShadow="lg"
            >
              <Link className="brand" as={NextLink} href="/" _hover={{ textDecoration: "none", color: "brand.600" }}>
                <Text fontSize={{ base: "xl", md: "2xl" }} fontWeight="700" letterSpacing="0.04em" textTransform="uppercase">
                  RV Trip Atlas
                </Text>
              </Link>
              <HStack className="top-nav" as="nav" gap={5} color="muted" fontSize="sm" textTransform="uppercase" letterSpacing="0.08em">
                <Link as={NextLink} href="/" _hover={{ color: "accentStrong" }}>
                  Trips
                </Link>
                <Link as={NextLink} href="/admin" _hover={{ color: "accentStrong" }}>
                  Admin
                </Link>
              </HStack>
            </Flex>
            {children}
          </Box>
        </Provider>
      </body>
    </html>
  );
}
