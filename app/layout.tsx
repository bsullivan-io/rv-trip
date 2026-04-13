import "./globals.css";
import type { Metadata } from "next";
import NextLink from "next/link";
import Image from "next/image";
import { Box, Flex, Link } from "@chakra-ui/react";
import { Provider } from "@/components/ui/provider";
import { getAdminSession } from "@/lib/auth";
import { AdminTrackerClient } from "@/components/public/admin-tracker-client";
import { TopNav, FooterLock } from "@/components/public/top-nav";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Make a Mile",
  description: "Interactive RV itinerary map and admin console",
  icons: { icon: "/rv.png" }
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [adminSession, trip] = await Promise.all([
    getAdminSession(),
    prisma.trip.findFirst({ select: { slug: true } })
  ]);

  return (
    <html lang="en">
      <body>
        <Provider>
          <AdminTrackerClient enabled={Boolean(adminSession)} />
          <Flex
            as="header"
            className="site-header"
            direction={{ base: "column", md: "row" }}
            align={{ base: "flex-start", md: "flex-end" }}
            justify="space-between"
            gap={4}
            px={{ base: 4, md: 5 }}
            pt={{ base: 4, md: 5 }}
            pb={0}
            mb={4}
            borderColor="brand.600"
            borderTopWidth="4px"
            bg="white"
            boxShadow="lg"
          >
            <Box className="site-header-inner" maxW="92rem" mx="auto" w="100%" display="flex" alignItems={{ base: "center", md: "flex-end" }} justifyContent={{ base: "center", md: "space-between" }} gap={4} flexWrap="wrap">
              <Link className="brand" as={NextLink} href="/" _hover={{ textDecoration: "none", color: "brand.600" }}>
                <Image className="brand-logo" src="/logo.png" alt="Make a Mile" width={220} height={52} priority />
              </Link>
              <TopNav tripSlug={trip?.slug ?? ""} />
            </Box>
          </Flex>
          <Box className="site-shell" maxW="92rem" mx="auto" px={{ base: 3, md: 5 }} py={{ base: 3, md: 4 }}>
            {children}
          </Box>
          <footer className="site-footer">
            {adminSession ? <FooterLock /> : null}
            <Link as={NextLink} href="/admin">Admin</Link>
          </footer>
        </Provider>
      </body>
    </html>
  );
}
