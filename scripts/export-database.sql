BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '120s';
WITH public_sites AS (
  SELECT s.id, s.site_name, s.site_domain, s.site_established_at, s.created_at,
    d.slug, d.site_description, d.official_site_established_at, d.payment_methods,
    d.refund_support, d.domestic_invoice_support, d.updated_at AS details_updated_at,
    r.rank_position, r.avg_online_rate, r.avg_latency_ms, r.model_count, r.updated_at AS ranking_updated_at,
    lower(regexp_replace(split_part(regexp_replace(s.site_domain, '^https?://', '', 'i'), '/', 1), '^www\.', '')) AS host
  FROM relay_sites s
  JOIN relay_site_details d ON d.relay_site_id = s.id AND d.is_public
  LEFT JOIN relay_site_rankings r ON r.relay_site_id = s.id AND r.is_public
), detections AS (
  SELECT s.id, count(*) AS runs, count(*) FILTER (WHERE dr.final_result = 'pass') AS passed,
    count(*) FILTER (WHERE dr.final_result = 'fail') AS failed,
    count(*) FILTER (WHERE dr.final_result = 'error') AS errors,
    max(dr.completed_at) AS latest_at, array_agg(DISTINCT dr.model_key ORDER BY dr.model_key) AS models
  FROM public_sites s JOIN detection_runs dr
    ON lower(regexp_replace(dr.endpoint_host, '^www\.', '')) = s.host
  WHERE dr.completed_at IS NOT NULL
  GROUP BY s.id
), prices AS (
  SELECT p.relay_site_id, count(*) AS channel_count,
    array_agg(DISTINCT p.model_id ORDER BY p.model_id) AS models,
    max(p.last_seen_at) AS latest_at
  FROM site_model_price_catalog p JOIN public_sites s ON s.id = p.relay_site_id
  WHERE p.currently_active
  GROUP BY p.relay_site_id
), history AS (
  SELECT lower(regexp_replace(endpoint_host, '^www\.', '')) AS host,
    count(*) AS runs, count(*) FILTER (WHERE final_result = 'pass') AS passed,
    count(*) FILTER (WHERE final_result = 'fail') AS failed,
    count(*) FILTER (WHERE final_result = 'error') AS errors,
    max(coalesce(completed_at, created_at)) AS latest_at,
    array_agg(DISTINCT model_key ORDER BY model_key) FILTER (WHERE model_key IS NOT NULL) AS models
  FROM detection_runs WHERE endpoint_host IS NOT NULL AND endpoint_host <> ''
  GROUP BY 1
), reviews AS (
  SELECT relay_site_id, avg(rating) AS rating, count(*) AS count
  FROM relay_site_user_reviews WHERE status = 'approved' AND deleted_at IS NULL
  GROUP BY relay_site_id
)
SELECT json_build_object('schemaVersion', 1, 'exportedAt', now(),
  'updatedAt', greatest(max(greatest(s.details_updated_at, s.ranking_updated_at, d.latest_at, p.latest_at)), (SELECT max(latest_at) FROM history)),
  'historicalSites', (SELECT json_agg(json_build_object('name', h.host, 'domain', h.host,
    'url', 'https://' || h.host || '/', 'models', h.models, 'updatedAt', h.latest_at,
    'historicalOnly', true, 'detection', json_build_object('runs', h.runs, 'passed', h.passed,
      'failed', h.failed, 'errors', h.errors, 'latestAt', h.latest_at)) ORDER BY h.host)
    FROM history h WHERE NOT EXISTS (SELECT 1 FROM public_sites ps WHERE ps.host = h.host)),
  'sites', json_agg(json_build_object(
    'name', s.site_name, 'domain', s.host, 'slug', s.slug,
    'url', CASE WHEN s.slug IS NOT NULL AND s.slug <> '' THEN 'https://www.hvoy.ai/sites/' || s.slug || '/' ELSE 'https://' || s.host || '/' END,
    'rank', s.rank_position, 'description', s.site_description,
    'establishedDate', coalesce(nullif(s.official_site_established_at, ''), s.site_established_at),
    'models', coalesce(p.models, ARRAY[]::text[]) || coalesce(d.models, ARRAY[]::text[]),
    'modelCount', greatest(s.model_count, cardinality(p.models), cardinality(d.models)),
    'uptime', s.avg_online_rate, 'latencyMs', s.avg_latency_ms,
    'userRating', v.rating, 'ratingCount', v.count,
    'paymentMethods', string_to_array(nullif(s.payment_methods, ''), ','),
    'supportsRefund', CASE s.refund_support WHEN 'yes' THEN true WHEN 'no' THEN false ELSE null END,
    'supportsInvoice', CASE s.domestic_invoice_support WHEN 'yes' THEN true WHEN 'no' THEN false ELSE null END,
    'updatedAt', greatest(s.details_updated_at, s.ranking_updated_at, d.latest_at, p.latest_at),
    'rankingUpdatedAt', s.ranking_updated_at,
    'priceCatalog', json_build_object('activeChannels', coalesce(p.channel_count, 0), 'updatedAt', p.latest_at),
    'detection', CASE WHEN d.runs IS NOT NULL THEN json_build_object('runs', d.runs, 'passed', d.passed, 'failed', d.failed, 'errors', d.errors, 'latestAt', d.latest_at) ELSE null END
  ) ORDER BY s.rank_position NULLS LAST, s.host))
FROM public_sites s LEFT JOIN detections d ON d.id = s.id
LEFT JOIN prices p ON p.relay_site_id = s.id LEFT JOIN reviews v ON v.relay_site_id = s.id;
COMMIT;
