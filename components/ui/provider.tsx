"use client";

import { ChakraProvider } from "@chakra-ui/react";
import { chakraSystem } from "@/lib/chakra-theme";

export function Provider({ children }: { children: React.ReactNode }) {
  return <ChakraProvider value={chakraSystem}>{children}</ChakraProvider>;
}
