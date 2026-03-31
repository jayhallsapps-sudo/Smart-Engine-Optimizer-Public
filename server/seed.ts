import { db } from "./db";
import { clients, users, userPermissions, userReportPermissions, MODULE_KEYS, REPORT_SUB_KEYS } from "@shared/schema";
import { log } from "./index";
import { hashPassword } from "./auth";
import { eq } from "drizzle-orm";

const CREATOR_ADMIN_EMAIL = "jayhallsapps@gmail.com";
const CREATOR_ADMIN_PASSWORD = "SmartEO2740@";
const CREATOR_ADMIN_NAME = "Jay Hall";

export async function seedDatabase() {
  await seedAdminUser();
  await seedClients();
}

async function seedAdminUser() {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, CREATOR_ADMIN_EMAIL))
    .limit(1);

  if (existing.length > 0) return;

  log("Seeding creator admin account...", "seed");

  const passwordHash = await hashPassword(CREATOR_ADMIN_PASSWORD);

  const [admin] = await db
    .insert(users)
    .values({
      fullName: CREATOR_ADMIN_NAME,
      email: CREATOR_ADMIN_EMAIL,
      passwordHash,
      role: "admin",
      accountState: "active",
    })
    .returning();

  await db.insert(userPermissions).values(
    MODULE_KEYS.map(module => ({ userId: admin.id, module })),
  );

  await db.insert(userReportPermissions).values(
    REPORT_SUB_KEYS.map(reportSubKey => ({ userId: admin.id, reportSubKey })),
  );

  log(`Creator admin seeded: ${CREATOR_ADMIN_EMAIL}`, "seed");
}

async function seedClients() {
  const existing = await db.select().from(clients);
  if (existing.length > 0) return;

  log("Seeding database with recovery & addiction centre clients...", "seed");

  await db.insert(clients).values([
    {
      name: "Anchored Tides Recovery",
      gscSiteUrl: "https://anchoredtidesrecovery.com",
      ga4PropertyId: "properties/401000001",
      callrailCompanyId: "COM-ATR001",
      ctmAccountId: null,
      ahrefsProjectUrl: "https://anchoredtidesrecovery.com",
      semrushProjectId: "proj-atr-001",
      screamingFrogProfile: null,
      brandTerms: ["anchored tides", "anchored tides recovery"],
      leadEvents: ["phone_call", "form_submit"],
      moneyPages: ["/programs/detox", "/programs/residential", "/insurance", "/admissions", "/contact"],
      callrailOrganicSourceTerms: ["google / organic"],
      ctmOrganicSourceTerms: [],
    },
    {
      name: "Bliss Recovery",
      gscSiteUrl: "https://www.blissrecoveryla.com",
      ga4PropertyId: "properties/401000002",
      callrailCompanyId: "COM-BRL002",
      ctmAccountId: "CTM-BRL002",
      ahrefsProjectUrl: "https://www.blissrecoveryla.com",
      semrushProjectId: "proj-brl-002",
      screamingFrogProfile: null,
      brandTerms: ["bliss recovery", "bliss rehab", "bliss la"],
      leadEvents: ["verify_insurance", "admissions_inquiry", "call_click"],
      moneyPages: ["/luxury-rehab", "/detox", "/residential-treatment", "/verify-insurance"],
      callrailOrganicSourceTerms: ["google / organic"],
      ctmOrganicSourceTerms: ["google / organic"],
    },
    {
      name: "Horseshoe Ridge Recovery",
      gscSiteUrl: "https://horseshoeridgerv.com",
      ga4PropertyId: "properties/401000003",
      callrailCompanyId: "COM-HRR003",
      ctmAccountId: null,
      ahrefsProjectUrl: "https://horseshoeridgerv.com",
      semrushProjectId: "proj-hrr-003",
      screamingFrogProfile: null,
      brandTerms: ["horseshoe ridge", "horseshoe recovery"],
      leadEvents: ["insurance_check", "admissions_form", "contact_click"],
      moneyPages: ["/treatment/detox", "/treatment/residential", "/insurance-verification", "/contact"],
      callrailOrganicSourceTerms: ["google / organic", "bing / organic"],
      ctmOrganicSourceTerms: [],
    },
    {
      name: "Iris Healing",
      gscSiteUrl: "https://irishealing.com",
      ga4PropertyId: "properties/401000005",
      callrailCompanyId: "COM-IH005",
      ctmAccountId: null,
      ahrefsProjectUrl: "https://irishealing.com",
      semrushProjectId: "proj-ih-005",
      screamingFrogProfile: null,
      brandTerms: ["iris healing", "iris retreat", "iris healing retreat"],
      leadEvents: ["admissions_form", "insurance_form", "call_click", "chat"],
      moneyPages: ["/addiction-treatment", "/mental-health", "/dual-diagnosis", "/insurance", "/admissions"],
      callrailOrganicSourceTerms: ["google / organic"],
      ctmOrganicSourceTerms: [],
    },
    {
      name: "New Day Recovery",
      gscSiteUrl: "https://newday-recovery.com",
      ga4PropertyId: "properties/401000006",
      callrailCompanyId: "COM-NDR006",
      ctmAccountId: "CTM-NDR006",
      ahrefsProjectUrl: "https://newday-recovery.com",
      semrushProjectId: "proj-ndr-006",
      screamingFrogProfile: null,
      brandTerms: ["new day recovery", "new day rehab"],
      leadEvents: ["verify_insurance", "admissions_call", "contact_form"],
      moneyPages: ["/detox", "/residential", "/outpatient", "/verify-insurance", "/contact"],
      callrailOrganicSourceTerms: ["google / organic"],
      ctmOrganicSourceTerms: ["google / organic"],
    },
    {
      name: "Sol Womens Treatment",
      gscSiteUrl: "https://solwomenstreatment.com",
      ga4PropertyId: "properties/401000007",
      callrailCompanyId: "COM-SWT007",
      ctmAccountId: null,
      ahrefsProjectUrl: "https://solwomenstreatment.com",
      semrushProjectId: "proj-swt-007",
      screamingFrogProfile: null,
      brandTerms: ["sol womens", "sol treatment", "sol women's treatment"],
      leadEvents: ["insurance_verification", "admissions_inquiry", "call_click", "form_submit"],
      moneyPages: ["/programs/detox", "/programs/residential", "/programs/php-iop", "/insurance", "/admissions"],
      callrailOrganicSourceTerms: ["google / organic"],
      ctmOrganicSourceTerms: [],
    },
    {
      name: "Williamsburg House",
      gscSiteUrl: "https://williamsburghousenyc.com",
      ga4PropertyId: "properties/401000008",
      callrailCompanyId: "COM-WH008",
      ctmAccountId: null,
      ahrefsProjectUrl: "https://williamsburghousenyc.com",
      semrushProjectId: null,
      screamingFrogProfile: null,
      brandTerms: ["williamsburg house", "williamsburg sober"],
      leadEvents: ["contact_form", "inquiry_form", "call_click"],
      moneyPages: ["/sober-living", "/mens-sober-living", "/womens-sober-living", "/contact"],
      callrailOrganicSourceTerms: ["google / organic"],
      ctmOrganicSourceTerms: [],
    },
  ]);

  log("Database seeded with 7 recovery & addiction centre clients", "seed");
}
