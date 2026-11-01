-- General Admin: edits all content (learning catalogue, curriculum mapping for every business line and audience,
-- knowledge bundles), but manages no users and grants no roles. Its own migration: a new enum value cannot be
-- used in the transaction that adds it.
alter type public.app_role add value if not exists 'general_admin' after 'system_admin';
