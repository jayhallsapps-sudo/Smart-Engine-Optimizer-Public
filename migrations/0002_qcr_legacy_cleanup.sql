-- Soft-delete legacy QCR reports -- they are PPTX-deck JSON and incompatible with the new findings JSON schema
UPDATE saved_reports
SET deleted_at = NOW()
WHERE report_type = 'quarterly_content_roadmap'
  AND deleted_at IS NULL;
