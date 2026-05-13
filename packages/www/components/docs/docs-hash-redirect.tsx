"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function DocsHashRedirect({
  redirects,
}: {
  redirects: Record<string, string>;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/docs") {
      return;
    }
    const target = redirects[window.location.hash];
    if (target) {
      window.location.replace(target);
    }
  }, [pathname, redirects]);

  return null;
}
