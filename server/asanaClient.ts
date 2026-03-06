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
  "Technical SEO": "Technical SEO",
  "Local SEO": "Local SEO",
};

export function asanaSectionToCategory(sectionName: string): { category: string; italicize: boolean } {
  const known = SECTION_TO_CATEGORY[sectionName];
  if (known) return { category: known, italicize: false };
  return { category: "Technical SEO", italicize: true };
}

async function fetchAllTasks(projectGid: string): Promise<any[]> {
  const connectors = new ReplitConnectors();
  const fields = "name,completed,completed_at,due_on,memberships.section.name,notes";
  const url = `/api/1.0/tasks?project=${projectGid}&opt_fields=${fields}&limit=100`;
  const resp = await connectors.proxy("asana", url, { method: "GET" });
  const data = await resp.json() as any;
  return data.data ?? [];
}

function taskSection(task: any): string {
  const memberships: any[] = task.memberships ?? [];
  for (const m of memberships) {
    if (m.section?.name) return m.section.name;
  }
  return "";
}

const IGNORED_SECTIONS = new Set(["Meetings", "Onboarding", "Setup", "Reporting", "SEO Strategy"]);

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

      if (t.completed && t.completed_at) {
        const completedAt = new Date(t.completed_at);
        if (completedAt >= start && completedAt <= end) {
          completed.push(task);
        }
      } else if (!t.completed) {
        if (t.due_on) {
          const due = new Date(t.due_on + "T00:00:00Z");
          if (due >= start && due <= end) {
            upcoming.push(task);
          }
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
