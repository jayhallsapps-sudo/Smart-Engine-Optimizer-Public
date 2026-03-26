CREATE TABLE "admin_config_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"namespace" varchar(64) NOT NULL,
	"item_key" varchar(128) NOT NULL,
	"field" varchar(64) NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_guidance" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"report_type" varchar(64),
	"workflow_area" varchar(64),
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ama_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"client_name" text,
	"title" text DEFAULT 'New Conversation' NOT NULL,
	"integrations" text[] DEFAULT '{}'::text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ama_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"provider" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"credential_type" text NOT NULL,
	"account_label" text DEFAULT 'Default' NOT NULL,
	"encrypted_value" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_tracking_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"report_date" text NOT NULL,
	"filename" text NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"headers" text[],
	"data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_competitors" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"gsc_site_url" text,
	"ga4_property_id" text,
	"callrail_company_id" text,
	"callrail_account_id" text,
	"ctm_account_id" text,
	"ahrefs_project_url" text,
	"semrush_project_id" text,
	"screaming_frog_profile" text,
	"nimbata_account_id" text,
	"attention_account_id" text,
	"airtable_base_id" text,
	"airtable_table_name" text,
	"airtable_production_view" text,
	"airtable_published_view" text,
	"brand_terms" text[] DEFAULT '{}'::text[],
	"lead_events" text[] DEFAULT '{}'::text[],
	"money_pages" text[] DEFAULT '{}'::text[],
	"callrail_organic_source_terms" text[] DEFAULT '{}'::text[],
	"ctm_organic_source_terms" text[] DEFAULT '{}'::text[],
	"gbp_location_name" text,
	"gbp_profile_url" text,
	"asana_project_id" text,
	"primary_goal" text,
	"about_page_url" text,
	"contact_name" text,
	"contact_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discoverability_workspaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer,
	"name" text DEFAULT 'Untitled Workspace' NOT NULL,
	"business_profile" jsonb,
	"clusters" jsonb DEFAULT '[]'::jsonb,
	"keywords" jsonb DEFAULT '[]'::jsonb,
	"scoring_weights" jsonb,
	"internal_link_suggestions" jsonb,
	"change_log" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"client_name_snapshot" text DEFAULT '' NOT NULL,
	"evaluation_name" text NOT NULL,
	"evaluation_date" text NOT NULL,
	"prepared_by" text DEFAULT '' NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"linked_mid_strategy_deck_id" integer,
	"category_rules" jsonb,
	"crawl_upload_id" integer,
	"data_sources_used" text[] DEFAULT '{}'::text[],
	"enrichment_status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_competitor_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"eval_batch_id" integer NOT NULL,
	"row_order" integer DEFAULT 0 NOT NULL,
	"is_client" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"website_url" text DEFAULT '' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ranks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_trace" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_crawl_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"eval_batch_id" integer NOT NULL,
	"url" text NOT NULL,
	"page_category" text DEFAULT 'Other' NOT NULL,
	"manual_category_override" text,
	"tier" text,
	"crawl_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"performance_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"data_source" text DEFAULT 'screaming_frog_upload' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_source_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"eval_batch_id" integer NOT NULL,
	"source_type" varchar(64) NOT NULL,
	"source_tool" varchar(64) NOT NULL,
	"file_name" text,
	"uploaded_at" timestamp,
	"fetch_run_id" text,
	"parse_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"enrichment_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"raw_payload" jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_summary_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"eval_batch_id" integer NOT NULL,
	"table_type" varchar(32) NOT NULL,
	"row_order" integer DEFAULT 0 NOT NULL,
	"category" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finding_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"report_type" varchar(50) NOT NULL,
	"area_id" varchar(100) NOT NULL,
	"body_hash" varchar(8) NOT NULL,
	"body" text NOT NULL,
	"bucket" varchar(30),
	"execution_status" varchar(30),
	"linked_ref_title" varchar(255),
	"period_label" varchar(200),
	"seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gap_analysis_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"report_type" text NOT NULL,
	"questions_json" jsonb NOT NULL,
	"answers_json" jsonb,
	"seo_hq_checks_applied" text[],
	"seo_hq_load_status" text,
	"answer_usage_json" jsonb,
	"linked_report_id" integer,
	"linked_report_type" text,
	"generated_on" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mid_strategy_decks" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"eval_batch_id" integer,
	"report_name" text NOT NULL,
	"report_status" varchar(32) DEFAULT 'not_generated' NOT NULL,
	"report_date" text NOT NULL,
	"prepared_by" text DEFAULT '' NOT NULL,
	"slides_json" jsonb,
	"edits_json" jsonb,
	"ia_structure_json" jsonb,
	"slide_content_json" jsonb,
	"export_payload" jsonb,
	"generated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qbr_prep_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"report_type" text DEFAULT 'qbr_prep' NOT NULL,
	"report_name" text NOT NULL,
	"analysis_window_start" text NOT NULL,
	"analysis_window_end" text NOT NULL,
	"planning_quarter" integer NOT NULL,
	"planning_year" integer NOT NULL,
	"generated_on" text NOT NULL,
	"source_snapshot_json" jsonb,
	"generated_report_json" jsonb,
	"html_snapshot" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_saved_at" timestamp DEFAULT now() NOT NULL,
	"version_label" text
);
--> statement-breakpoint
CREATE TABLE "query_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"command" text NOT NULL,
	"natural_query" text NOT NULL,
	"date_range" text NOT NULL,
	"filters" jsonb,
	"result_summary" text,
	"result_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_type" text NOT NULL,
	"client_id" integer,
	"saved_report_id" integer,
	"anchor_id" text DEFAULT 'report' NOT NULL,
	"anchor_label" text,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"parent_id" integer,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_template_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_type" varchar(32) NOT NULL,
	"section_key" varchar(64) NOT NULL,
	"section_label" varchar(120),
	"enabled" boolean,
	"display_order" integer,
	"helper_copy" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"report_type" text NOT NULL,
	"report_name" text NOT NULL,
	"report_period_label" text,
	"analysis_window_start" text,
	"analysis_window_end" text,
	"planning_quarter" integer,
	"planning_year" integer,
	"generated_on" text NOT NULL,
	"source_snapshot_json" jsonb,
	"generated_report_json" jsonb,
	"edits_json" jsonb,
	"html_snapshot" text,
	"current_crawl_asset_id" integer,
	"comparison_crawl_asset_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_saved_at" timestamp DEFAULT now() NOT NULL,
	"version_label" text,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sf_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"report_date" text NOT NULL,
	"filename" text NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"headers" text[],
	"data" jsonb,
	"asset_name" text,
	"notes" text,
	"session_id" text,
	"session_name" text,
	"file_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ama_messages" ADD CONSTRAINT "ama_messages_conversation_id_ama_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ama_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_competitors" ADD CONSTRAINT "client_competitors_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discoverability_workspaces" ADD CONSTRAINT "discoverability_workspaces_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_batches" ADD CONSTRAINT "eval_batches_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_competitor_rows" ADD CONSTRAINT "eval_competitor_rows_eval_batch_id_eval_batches_id_fk" FOREIGN KEY ("eval_batch_id") REFERENCES "public"."eval_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_crawl_rows" ADD CONSTRAINT "eval_crawl_rows_eval_batch_id_eval_batches_id_fk" FOREIGN KEY ("eval_batch_id") REFERENCES "public"."eval_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_source_imports" ADD CONSTRAINT "eval_source_imports_eval_batch_id_eval_batches_id_fk" FOREIGN KEY ("eval_batch_id") REFERENCES "public"."eval_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_summary_rows" ADD CONSTRAINT "eval_summary_rows_eval_batch_id_eval_batches_id_fk" FOREIGN KEY ("eval_batch_id") REFERENCES "public"."eval_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mid_strategy_decks" ADD CONSTRAINT "mid_strategy_decks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mid_strategy_decks" ADD CONSTRAINT "mid_strategy_decks_eval_batch_id_eval_batches_id_fk" FOREIGN KEY ("eval_batch_id") REFERENCES "public"."eval_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_saved_report_id_saved_reports_id_fk" FOREIGN KEY ("saved_report_id") REFERENCES "public"."saved_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_parent_id_report_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."report_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ama_conversations_created_idx" ON "ama_conversations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "discoverability_workspaces_client_idx" ON "discoverability_workspaces" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "eval_batches_client_idx" ON "eval_batches" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "eval_competitor_rows_batch_idx" ON "eval_competitor_rows" USING btree ("eval_batch_id");--> statement-breakpoint
CREATE INDEX "eval_crawl_rows_batch_idx" ON "eval_crawl_rows" USING btree ("eval_batch_id");--> statement-breakpoint
CREATE INDEX "eval_crawl_rows_batch_url_idx" ON "eval_crawl_rows" USING btree ("eval_batch_id","url");--> statement-breakpoint
CREATE INDEX "eval_source_imports_batch_idx" ON "eval_source_imports" USING btree ("eval_batch_id");--> statement-breakpoint
CREATE INDEX "eval_summary_rows_batch_type_idx" ON "eval_summary_rows" USING btree ("eval_batch_id","table_type");--> statement-breakpoint
CREATE INDEX "finding_history_client_type_idx" ON "finding_history" USING btree ("client_id","report_type");--> statement-breakpoint
CREATE INDEX "finding_history_client_area_idx" ON "finding_history" USING btree ("client_id","report_type","area_id");--> statement-breakpoint
CREATE INDEX "gap_sessions_client_idx" ON "gap_analysis_sessions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "mid_strategy_decks_client_idx" ON "mid_strategy_decks" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "mid_strategy_decks_eval_idx" ON "mid_strategy_decks" USING btree ("eval_batch_id");--> statement-breakpoint
CREATE INDEX "qbr_prep_reports_client_id_idx" ON "qbr_prep_reports" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "report_comments_saved_idx" ON "report_comments" USING btree ("saved_report_id");--> statement-breakpoint
CREATE INDEX "report_comments_type_client_idx" ON "report_comments" USING btree ("report_type","client_id");--> statement-breakpoint
CREATE INDEX "report_comments_parent_idx" ON "report_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "saved_reports_client_type_idx" ON "saved_reports" USING btree ("client_id","report_type");--> statement-breakpoint
CREATE INDEX "saved_reports_client_id_idx" ON "saved_reports" USING btree ("client_id");