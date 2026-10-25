import type { ComponentProps } from "react";
import { Link, NavLink } from "react-router";
import { entryFor } from "@/routing";

/**
 * A link that stays in the app when the target is one of its routes and
 * does a normal navigation otherwise (the prerendered landing pages).
 */
export function AppLink({ href, ...props }: Omit<ComponentProps<"a">, "href"> & { href: string }) {
  const inApp = href.startsWith("/") && entryFor(new URL(href, location.origin).pathname) === "app";
  return inApp ? <Link to={href} {...props} /> : <a href={href} {...props} />;
}

/** Like AppLink, with aria-current="page" on the active route. */
export function AppNavLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const inApp = entryFor(new URL(href, location.origin).pathname) === "app";
  return inApp ? (
    <NavLink to={href} className={className}>
      {children}
    </NavLink>
  ) : (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
