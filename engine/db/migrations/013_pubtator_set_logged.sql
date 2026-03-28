-- 013_pubtator_set_logged.sql
-- Convert pubtator tables from UNLOGGED to LOGGED so data survives
-- container restarts and crashes.
--
-- Background: These tables were originally UNLOGGED for fast bulk loading
-- (10x faster COPY). However, UNLOGGED tables silently lose all data on
-- unclean shutdown, which caused loss of 342M rows on 2026-03-18.
-- The load is fast enough (~7 min) that LOGGED performance is acceptable,
-- and data safety is more important than load speed.
--
-- NOTE: On an empty table this is instant. On a populated table this
-- rewrites all data to WAL (may take minutes for large tables).
-- Must run outside a transaction (autocommit).

ALTER TABLE pubtator.entity_annotations SET LOGGED;
ALTER TABLE pubtator.relations SET LOGGED;
