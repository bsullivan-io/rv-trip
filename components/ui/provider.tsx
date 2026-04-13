"use client";

import { ChakraProvider } from "@chakra-ui/react";
import { chakraSystem } from "@/lib/chakra-theme";
import { EditModeProvider } from "@/components/ui/edit-mode";

export function Provider({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={chakraSystem}>
      <EditModeProvider>{children}</EditModeProvider>
    </ChakraProvider>
  );
}
