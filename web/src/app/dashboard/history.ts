// Withdrawals made from this browser. The chain has the transfers, but not
// which were cash-outs to a bank, so this list is kept on the device.
export interface Withdrawal {
  kind: "bank" | "address";
  /** Token amount, as typed. */
  amount: string;
  /** Destination address, or "<amount> <currency>" received at the bank. */
  to: string;
  hash: string;
  ts: number;
}

const key = (address: string) => `clippay.withdrawals.${address}`;

export function loadHistory(address: string): Withdrawal[] {
  try {
    return JSON.parse(localStorage.getItem(key(address)) ?? "[]") as Withdrawal[];
  } catch {
    return [];
  }
}

export function addHistory(address: string, w: Withdrawal): Withdrawal[] {
  const list = [w, ...loadHistory(address)].slice(0, 50);
  try {
    localStorage.setItem(key(address), JSON.stringify(list));
  } catch {}
  return list;
}
