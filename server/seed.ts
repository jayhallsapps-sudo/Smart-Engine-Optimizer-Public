import { db } from "./db";
import { clients } from "@shared/schema";
import { log } from "./index";

export async function seedDatabase() {
  const existing = await db.select().from(clients);
  if (existing.length > 0) return;

  log("Seeding database with recovery & addiction centre clients...", "seed");

  await db.insert(clients).values([
    {
      name: "Sunrise Recovery Center",
      gscSiteUrl: "https://www.sunriserecoverycenter.com",
      ga4PropertyId: "properties/301456789",
      callrailCompanyId: "COM-SRC001",
      ctmAccountId: "CTM-SRC001",
      ahrefsProjectUrl: "https://www.sunriserecoverycenter.com",
      semrushProjectId: "proj-src-001",
      brandTerms: ["sunrise recovery", "sunrise rehab", "sunrise treatment center"],
      leadEvents: ["insurance_verification", "admissions_form", "call_click", "chat_started"],
      moneyPages: ["/programs/detox", "/programs/residential", "/insurance-verification", "/admissions"],
      callrailOrganicSourceTerms: ["google / organic"],
      ctmOrganicSourceTerms: ["google / organic", "bing / organic"],
    },
    {
      name: "New Horizons Treatment",
      gscSiteUrl: "https://www.newhorizonstreatment.com",
      ga4PropertyId: "properties/302654321",
      callrailCompanyId: "COM-NHT002",
      ctmAccountId: "CTM-NHT002",
      ahrefsProjectUrl: "https://www.newhorizonstreatment.com",
      semrushProjectId: "proj-nht-002",
      brandTerms: ["new horizons", "new horizons treatment", "nht rehab"],
      leadEvents: ["verify_insurance_form", "contact_form", "call_now_click"],
      moneyPages: ["/treatment/alcohol-rehab", "/treatment/drug-rehab", "/treatment/dual-diagnosis", "/verify-insurance"],
      callrailOrganicSourceTerms: ["google / organic"],
      ctmOrganicSourceTerms: ["google / organic"],
    },
    {
      name: "Clarity Behavioral Health",
      gscSiteUrl: "https://www.claritybehavioralhealth.com",
      ga4PropertyId: "properties/303789012",
      callrailCompanyId: "COM-CBH003",
      ctmAccountId: null,
      ahrefsProjectUrl: "https://www.claritybehavioralhealth.com",
      semrushProjectId: "proj-cbh-003",
      brandTerms: ["clarity behavioral", "clarity health", "clarity rehab"],
      leadEvents: ["insurance_check", "admissions_inquiry", "live_chat"],
      moneyPages: ["/services/mental-health", "/services/substance-abuse", "/services/php-iop", "/insurance"],
      callrailOrganicSourceTerms: ["google / organic", "bing / organic"],
      ctmOrganicSourceTerms: [],
    },
    {
      name: "Pathways to Freedom Recovery",
      gscSiteUrl: "https://www.pathwaystofreedom.org",
      ga4PropertyId: "properties/304654987",
      callrailCompanyId: null,
      ctmAccountId: "CTM-PTF004",
      ahrefsProjectUrl: "https://www.pathwaystofreedom.org",
      semrushProjectId: null,
      brandTerms: ["pathways to freedom", "ptf recovery", "pathways recovery"],
      leadEvents: ["admissions_call", "form_submit", "insurance_verification"],
      moneyPages: ["/programs/inpatient", "/programs/outpatient", "/programs/sober-living", "/get-help-now"],
      callrailOrganicSourceTerms: [],
      ctmOrganicSourceTerms: ["google / organic"],
    },
  ]);

  log("Database seeded with 4 recovery & addiction centre clients", "seed");
}
