"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Header } from "./Header";
import { isAuthenticated } from "@/lib/auth";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const isLogin = pathname === "/login";

  useEffect(() => {
    const auth = isAuthenticated();
    if (!auth && !isLogin) {
      router.replace("/login");
    } else {
      setChecked(true);
    }
  }, [pathname, isLogin, router]);

  if (!checked && !isLogin) return null;

  return (
    <>
      {!isLogin && <Header />}
      <div
        className="flex-1 flex flex-col"
        style={isLogin ? undefined : { paddingTop: 54 }}
      >
        {children}
      </div>
    </>
  );
}
