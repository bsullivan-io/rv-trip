import NextLink from "next/link";
import { Box, Button, Field, Heading, Input, Link, Stack, Text } from "@chakra-ui/react";
import { loginAction } from "@/app/admin/login/actions";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const hasError = params.error === "1";

  return (
    <Box minH="calc(100vh - 10rem)" display="grid" placeItems="center">
      <Box
        as="section"
        w="full"
        maxW="32rem"
        p={{ base: 5, md: 7 }}
        borderWidth="1px"
        borderColor="brand.600"
        borderTopWidth="4px"
        bg="white"
        boxShadow="lg"
      >
        <Stack gap={5}>
          <Box>
            <Text textTransform="uppercase" letterSpacing="0.14em" fontSize="xs" color="muted" mb={2}>
              Admin Access
            </Text>
            <Heading size="2xl" mb={3}>
              Sign in to edit trips
            </Heading>
          </Box>

          <form action={loginAction}>
            <Stack gap={4}>
              <Field.Root>
                <Field.Label>Email</Field.Label>
                <Input name="email" type="email" required bg="blackAlpha.300" borderColor="border" size="sm" />
              </Field.Root>

              <Field.Root>
                <Field.Label>Password</Field.Label>
                <Input name="password" type="password" required bg="blackAlpha.300" borderColor="border" size="sm" />
              </Field.Root>

              {hasError ? (
                <Text color="accentStrong" fontSize="sm">
                  Invalid credentials.
                </Text>
              ) : null}

              <Button type="submit" bg="accentStrong" color="white" _hover={{ bg: "brand.700" }} size="sm">
                Sign in
              </Button>
            </Stack>
          </form>

          <Link as={NextLink} href="/" color="muted" fontSize="sm">
            Back to public trip viewer
          </Link>
        </Stack>
      </Box>
    </Box>
  );
}
