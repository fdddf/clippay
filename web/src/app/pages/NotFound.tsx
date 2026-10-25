import { SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { AppLink } from "../AppLink";
import { useTitle } from "../useTitle";

export function NotFound({ what = "page" }: { what?: string }) {
  useTitle("Not found");
  return (
    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <EmptyState
        icon={<SearchX />}
        heading="h1"
        title={`This ${what} doesn't exist`}
        description="The link may be mistyped, or the network was reset since it was shared."
        action={
          <AppLink href="/campaigns" className={buttonVariants()}>
            Browse campaigns
          </AppLink>
        }
      />
    </div>
  );
}

export default NotFound;
