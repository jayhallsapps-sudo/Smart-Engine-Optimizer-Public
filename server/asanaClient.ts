import { ReplitConnectors } from "@replit/connectors-sdk";

export interface AsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  completed_at: string | null;
  due_on: string | null;
  section: string;
  notes: string;
}

export interface AsanaWorkLog {
  completed: AsanaTask[];
  upcoming: AsanaTask[];
}

const SECTION_TO_CATEGORY: Record<string, string> = {
  "SEO Content": "New Content",
  "Content": "New Content",
  "Blog": "New Content",
  "Technical SEO": "Technical SEO",
  "Technical": "Technical SEO",
  "Core Web Vitals": "Technical SEO",
  "Site Health": "Technical SEO",
  "Local SEO": "Local SEO",
  "Local": "Local SEO",
  "GBP": "Local SEO",
  "Google Business Profile": "Local SEO",
  "GMB": "Local SEO",
  "Citations": "Local SEO",
  "Map Pack": "Local SEO",
  "Google Maps": "Local SEO",
  "On-Page SEO": "Optimization",
  "Optimization": "Optimization",
  "On-Page": "Optimization",
  "SEO Strategy": "SEO Strategy",
};

export function asanaSectionToCategory(sectionName: string): { category: string; italicize: boolean } {
  const known = SECTION_TO_CATEGORY[sectionName];
  if (known) return { category: known, italicize: false };

  const lower = sectionName.toLowerCase();

  if (
    lower.includes("gbp") ||
    lower.includes("google business") ||
    lower.includes("google my business") ||
    lower.includes("gmb") ||
    lower.includes("local seo") ||
    lower.includes("citation") ||
    lower.includes("map pack") ||
    lower.includes("maps") ||
    lower.includes("local listing") ||
    lower.includes("service area")
  ) {
    return { category: "Local SEO", italicize: true };
  }

  if (lower.includes("content") || lower.includes("blog") || lower.includes("article") || lower.includes("copywriting")) {
    return { category: "New Content", italicize: true };
  }

  if (
    lower.includes("on-page") ||
    lower.includes("on page") ||
    lower.includes("optimization") ||
    lower.includes("meta") ||
    lower.includes("title tag") ||
    lower.includes("cro")
  ) {
    return { category: "Optimization", italicize: true };
  }

  return { category: "Technical SEO", italicize: true };
}

async function fetchAllTasks(projectGid: string): Promise<any[]> {
  const connectors = new ReplitConnectors();
  const fields = "name,completed,completed_at,due_on,memberships.section.name,notes";
  const all: any[] = [];
  let cursor: string | null = null;
  do {
    const url = cursor
      ? `/api/1.0/tasks?project=${projectGid}&opt_fields=${fields}&limit=100&offset=${cursor}`
      : `/api/1.0/tasks?project=${projectGid}&opt_fields=${fields}&limit=100`;
    const resp = await connectors.proxy("asana", url, { method: "GET" });
    const data = await resp.json() as any;
    const batch = data.data ?? [];
    all.push(...batch);
    cursor = data.next_page?.offset ?? null;
  } while (cursor);
  return all;
}

function taskSection(task: any): string {
  const memberships: any[] = task.memberships ?? [];
  for (const m of memberships) {
    if (m.section?.name) return m.section.name;
  }
  return "";
}

const IGNORED_SECTIONS = new Set(["Meetings", "Onboarding", "Setup", "Reporting"]);

export async function fetchAsanaWorkLog(
  projectGid: string,
  startDate: string,
  endDate: string
): Promise<{ success: true; completed: AsanaTask[]; upcoming: AsanaTask[] } | { success: false; error: string }> {
  try {
    const raw = await fetchAllTasks(projectGid);
    const start = new Date(startDate + "T00:00:00Z");
    const end = new Date(endDate + "T23:59:59Z");

    const completed: AsanaTask[] = [];
    const upcoming: AsanaTask[] = [];

    for (const t of raw) {
      const section = taskSection(t);
      if (IGNORED_SECTIONS.has(section)) continue;
      if (!t.name?.trim()) continue;

      const task: AsanaTask = {
        gid: t.gid,
        name: t.name.trim(),
        completed: !!t.completed,
        completed_at: t.completed_at ?? null,
        due_on: t.due_on ?? null,
        section,
        notes: t.notes?.trim() ?? "",
      };

      if (t.completed) {
        const completedInWindow = t.completed_at && (() => {
          const completedAt = new Date(t.completed_at);
          return completedAt >= start && completedAt <= end;
        })();
        const dueInWindow = t.due_on && (() => {
          const due = new Date(t.due_on + "T00:00:00Z");
          return due >= start && due <= end;
        })();
        if (completedInWindow || dueInWindow) {
          completed.push(task);
        }
      } else if (t.due_on) {
        const due = new Date(t.due_on + "T00:00:00Z");
        const nextTwoWeeks = new Date(end);
        nextTwoWeeks.setDate(nextTwoWeeks.getDate() + 14);
        if (due >= start && due <= nextTwoWeeks) {
          upcoming.push(task);
        }
      }
    }

    return { success: true, completed, upcoming };
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  }
}

export function groupAsanaTasks(tasks: AsanaTask[]): Record<string, AsanaTask[]> {
  const groups: Record<string, AsanaTask[]> = {};
  for (const task of tasks) {
    const { category } = asanaSectionToCategory(task.section);
    if (!groups[category]) groups[category] = [];
    groups[category].push(task);
  }
  return groups;
}

/**
 * Returns all open (incomplete) tasks for a project — no date filter.
 * Used by the execution ref picker to let AMs link findings to real Asana tasks.
 */
export async function fetchAsanaOpenTasks(
  projectGid: string,
): Promise<{ gid: string; name: string; url: string }[]> {
  try {
    const raw = await fetchAllTasks(projectGid);
    return raw
      .filter((t: any) => !t.completed && t.name?.trim())
      .map((t: any) => ({
        gid: t.gid as string,
        name: (t.name as string).trim(),
        url: `https://app.asana.com/0/${projectGid}/${t.gid}`,
      }))
      .slice(0, 100);
  } catch {
    return [];
  }
}
