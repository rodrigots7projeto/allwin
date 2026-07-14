"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const auth = isAuthenticated();
    setAuthed(auth);
    setChecked(true);
    if (pathname !== "/login" && !auth) {
      router.replace("/login");
    }
  }, [pathname, router]);

  if (!checked) return null;
  return <>{children}</>;
}

export function useAuth() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    setAuthed(isAuthenticated());
  }, []);
  return authed;
}
