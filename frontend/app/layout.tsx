import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "AllWin — Análise Cripto",
  description:
    "Plataforma de análise técnica, sinais IA, paper trading e execução real para criptomoedas.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${inter.variable} ${sora.variable}`}
    >
      <body className="min-h-screen flex flex-col">
        <Providers>
          <Header />
          <div className="pt-14 flex-1 flex flex-col">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
