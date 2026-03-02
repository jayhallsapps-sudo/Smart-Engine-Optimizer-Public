import { db } from "./db";
import { clients } from "@shared/schema";
import { log } from "./index";

export async function seedDatabase() {
  const existing = await db.select().from(clients);
  if (existing.length > 0) return;

  log("Seeding database with example clients...", "seed");

  await db.insert(clients).values([
    {
      name: "Acme Digital Marketing",
      gscSiteUrl: "https://www.acmedigital.com",
      ga4PropertyId: "properties/123456789",
      callrailCompanyId: "COM-ABC123",
      brandTerms: ["acme", "acme digital", "acme marketing"],
      leadEvents: ["form_submit", "contact_click", "demo_request"],
      moneyPages: ["/services/seo-audit", "/pricing", "/services/local-seo"],
      callrailOrganicSourceTerms: ["google / organic"],
    },
    {
      name: "Summit Law Group",
      gscSiteUrl: "https://www.summitlawgroup.com",
      ga4PropertyId: "properties/987654321",
      callrailCompanyId: "COM-DEF456",
      brandTerms: ["summit law", "summit legal", "summit law group"],
      leadEvents: ["consultation_form", "call_click"],
      moneyPages: ["/practice-areas/personal-injury", "/practice-areas/family-law", "/contact"],
      callrailOrganicSourceTerms: ["google / organic", "bing / organic"],
    },
    {
      name: "GreenLeaf Landscaping",
      gscSiteUrl: "https://www.greenleaflandscaping.com",
      ga4PropertyId: "properties/456789012",
      callrailCompanyId: "COM-GHI789",
      brandTerms: ["greenleaf", "green leaf", "greenleaf landscaping"],
      leadEvents: ["quote_request", "contact_form"],
      moneyPages: ["/services/lawn-care", "/services/hardscaping", "/free-quote"],
      callrailOrganicSourceTerms: ["google / organic"],
    },
    {
      name: "Bright Smile Dental",
      gscSiteUrl: "https://www.brightsmileclinic.com",
      ga4PropertyId: "properties/321654987",
      callrailCompanyId: "COM-JKL012",
      brandTerms: ["bright smile", "bright smile dental", "bsd clinic"],
      leadEvents: ["appointment_booking", "call_click", "form_submit"],
      moneyPages: ["/services/teeth-whitening", "/services/implants", "/book-appointment"],
      callrailOrganicSourceTerms: ["google / organic"],
    },
  ]);

  log("Database seeded with 4 example clients", "seed");
}
