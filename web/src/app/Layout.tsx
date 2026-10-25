import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { SiteFooter } from "@/landing/Shell";
import { AppHeader } from "./AppHeader";
import { useStats } from "./queries";

/** Header, page and footer for every app route. */
export function Layout() {
  const stats = useStats();
  // A new page starts at the top (filters only change the query string).
  const { pathname } = useLocation();
  useEffect(() => {
    scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-[3px] focus:ring-ring/50"
      >
        Skip to content
      </a>
      <AppHeader />
      {/* At least a screen tall, so the footer never jumps up into view while a page loads. */}
      <main id="main" className="min-h-[calc(100svh-4rem)] flex-1">
        <Outlet />
      </main>
      <SiteFooter health={stats.isSuccess ? "ok" : stats.isError ? "down" : undefined} />
    </div>
  );
}
