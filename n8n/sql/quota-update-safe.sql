SELECT result.* FROM jsonb_to_record(tbs_update_quota($1::jsonb)) AS result(ok boolean, "statusCode" integer, error text, "quotaRevision" text);
