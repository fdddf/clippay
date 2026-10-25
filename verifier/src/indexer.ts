// Copies CampaignPool's contract events into D1, so payout, refund and
// submission history outlives the RPC's ~7-day event retention. Runs from the
// verifier's Durable Object once a minute; resumes from a stored cursor.
import { rpc } from "@stellar/stellar-sdk";
import { poolClient } from "@clippay/pool-client";

export interface IndexerConfig {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
}

const PAGE = 200;
const MAX_PAGES = 25;

/** The ledger a getEvents cursor points at (cursors are TOIDs: ledger << 32 | …). */
function cursorLedger(cursor: string): number {
  return Number(BigInt(cursor.split("-")[0]!) >> 32n);
}

/** "CampaignCreated" → "campaign_created" */
function snake(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function str(v: unknown): string | null {
  return v === undefined || v === null ? null : String(v);
}

/** Indexes new events; returns how many were stored. */
export async function indexEvents(db: D1Database, cfg: IndexerConfig): Promise<number> {
  const server = new rpc.Server(cfg.rpcUrl);
  const client = await poolClient(cfg);
  const key = `cursor:${cfg.contractId}`;
  const saved = await db.prepare("SELECT v FROM kv WHERE k = ?").bind(key).first<{ v: string }>();
  const filters: rpc.Api.EventFilter[] = [{ type: "contract", contractIds: [cfg.contractId] }];

  let request: rpc.Api.GetEventsRequest;
  if (saved) {
    request = { filters, cursor: saved.v, limit: PAGE };
  } else {
    // First run: start as far back as the RPC still keeps events.
    const latest = await server.getLatestLedger();
    request = { filters, startLedger: Math.max(1, latest.sequence - 120_000), limit: PAGE };
  }

  let stored = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    let res: rpc.Api.GetEventsResponse;
    try {
      res = await server.getEvents(request);
    } catch (e) {
      // A cursor older than the RPC's retention can't be resumed: start over.
      if (saved && page === 0 && /cursor|start/i.test(String(e))) {
        await db.prepare("DELETE FROM kv WHERE k = ?").bind(key).run();
      }
      throw e;
    }

    const rows = [];
    for (const ev of res.events) {
      // Deprecated on current RPCs (undefined); failed calls no longer emit events.
      if (ev.inSuccessfulContractCall === false) continue;
      const parsed = client.parseEvent(ev.topic, ev.value) as
        | { name: string; data: Record<string, unknown> }
        | undefined;
      if (!parsed) continue;
      const d = parsed.data;
      rows.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO events (id, ledger, ts, tx, type, campaign, address, amount, fee, views, data)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            ev.id,
            ev.ledger,
            Math.floor(Date.parse(ev.ledgerClosedAt) / 1000),
            ev.txHash,
            snake(parsed.name),
            typeof d.id === "number" ? d.id : null,
            str(d.creator ?? d.brand ?? d.from ?? d.token ?? null),
            str(d.amount ?? d.budget ?? null),
            str(d.fee ?? null),
            str(d.views ?? null),
            JSON.stringify(d, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
          ),
      );
    }
    if (rows.length) await db.batch(rows);
    stored += rows.length;

    await db
      .prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v")
      .bind(key, res.cursor)
      .run();
    // The RPC scans a window of ledgers per request, so an empty or short page
    // doesn't mean we're done: stop once the cursor reaches the latest ledger.
    const caughtUp = cursorLedger(res.cursor) >= res.latestLedger - 1;
    const stuck = "cursor" in request && request.cursor === res.cursor;
    if ((res.events.length < PAGE && caughtUp) || stuck) break;
    request = { filters, cursor: res.cursor, limit: PAGE };
  }
  return stored;
}
