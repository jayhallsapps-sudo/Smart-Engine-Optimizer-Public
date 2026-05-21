import type { QcrFinding, QcrCategory } from "./types";
import { ReplitConnectors } from "@replit/connectors-sdk";

const CATEGORY_TO_SECTION_KEY: Record<QcrCategory, string> = {
  technical_seo: "technical_seo",
  seo_content: "seo_content",
  local_seo: "local_seo",
  seo_strategy: "seo_strategy",
};

export interface AsanaPushInput {
  clientId: number;
  finding: QcrFinding;
  overrides?: {
    taskName?: string;
    description?: string;
    dueDate?: string;
  };
  projectGid: string;
  sectionGid: string;
}

export interface AsanaPushResult {
  taskGid: string;
  taskUrl: string;
}

export async function pushFindingToAsana(input: AsanaPushInput): Promise<AsanaPushResult> {
  const name = input.overrides?.taskName ?? `[${input.finding.severity.toUpperCase()}] ${input.finding.title}`;

  let notes = input.overrides?.description ?? input.finding.description;
  notes += "\n\nAffected URLs:\n";
  const capped = input.finding.affectedUrls.slice(0, 50);
  for (const url of capped) {
    notes += `- ${url}\n`;
  }
  if (input.finding.affectedUrls.length > 50) {
    notes += `(+${input.finding.affectedUrls.length - 50} more)\n`;
  }

  const connectors = new ReplitConnectors();
  const resp = await connectors.proxy("asana", "/api/1.0/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        name,
        notes,
        due_on: input.overrides?.dueDate ?? undefined,
        projects: [input.projectGid],
        memberships: [{ project: input.projectGid, section: input.sectionGid }],
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as any;
    throw new Error(`Asana API error: ${err?.errors?.[0]?.message ?? resp.statusText}`);
  }

  const data = (await resp.json()) as any;
  const taskGid = data.data?.gid as string;
  if (!taskGid) {
    throw new Error("Asana API did not return a task gid");
  }

  return {
    taskGid,
    taskUrl: `https://app.asana.com/0/${input.projectGid}/${taskGid}`,
  };
}
