"use client";

import { ThemeProvider } from "next-themes";
import { CarteiraProvider } from "@/contexts/CarteiraContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <CarteiraProvider>
        {children}
      </CarteiraProvider>
    </ThemeProvider>
  );
}
