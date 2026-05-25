import { db } from "./server/db.ts";
import { clients } from "./shared/schema.ts";
import { isNotNull } from "drizzle-orm";

(async () => {
  const pat = process.env.AIRTABLE_PAT;
  if (!pat) { console.error("AIRTABLE_PAT not set"); process.exit(1); }

  const all = await db.select().from(clients).where(isNotNull(clients.airtableBaseId));

  for (const c of all) {
    const baseId = c.airtableBaseId;
    if (!baseId) continue;
    const tableName = c.airtableTableName ?? "Content";
    const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;

    let actual: string[] | null = null;
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
      if (r.ok) {
        const d: any = await r.json();
        const t = d.tables?.find((x: any) => x.name === tableName);
        actual = t ? (t.views ?? []).map((v: any) => v.name) : [];
      }
    } catch {}

    console.log("\n=====================================");
    console.log("  " + c.name);
    console.log("  Base: " + baseId + " | Table: " + tableName);
    console.log("=====================================");

    if (actual === null) { console.log("  ERROR: could not fetch metadata"); continue; }
    if (actual.length === 0) { console.log("  ERROR: table not found"); continue; }

    const check = (stored: string | null) =>
      stored ? (actual!.includes(stored) ? stored + "  OK" : stored + "  *** NOT FOUND ***") : "(blank)";

    console.log("  Production:  " + check(c.airtableProductionView));
    console.log("  Published:   " + check(c.airtablePublishedView));
    console.log("  Everything:  " + check(c.airtableEverythingView));
    console.log("  Views in Airtable:");
    for (const v of actual) console.log("    - " + v);
  }
  process.exit(0);
})();
