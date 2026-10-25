import { useEffect } from "react";

/** Sets the tab title: "<page> — ClipPay". */
export function useTitle(page: string | null | undefined) {
  useEffect(() => {
    if (page) document.title = `${page} — ClipPay`;
  }, [page]);
}
