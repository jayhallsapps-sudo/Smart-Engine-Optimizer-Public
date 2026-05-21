CREATE TABLE IF NOT EXISTS "client_qcr_config" (
	"client_id" integer PRIMARY KEY REFERENCES "clients"("id") ON DELETE cascade,
	"asana_section_ids" jsonb DEFAULT '{}' NOT NULL,
	"url_pattern_overrides" jsonb DEFAULT '{}' NOT NULL,
	"last_scan_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
