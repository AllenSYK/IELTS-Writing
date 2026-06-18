-- Read-only verification for the reconciled admin portal schema.
-- Run after applying 20260618103007_reconcile_admin_portal_schema.sql.

with required_columns(table_name, column_name) as (
  values
    ('admin_settings', 'id'),
    ('admin_settings', 'setting_key'),
    ('admin_settings', 'setting_value'),
    ('admin_settings', 'description'),
    ('admin_settings', 'created_at'),
    ('admin_settings', 'updated_at'),
    ('profiles', 'id'),
    ('profiles', 'email'),
    ('profiles', 'role'),
    ('profiles', 'license_status'),
    ('profiles', 'license_expires_at'),
    ('profiles', 'created_at'),
    ('profiles', 'updated_at'),
    ('license_codes', 'id'),
    ('license_codes', 'code_hash'),
    ('license_codes', 'code_value'),
    ('license_codes', 'code_prefix'),
    ('license_codes', 'plan'),
    ('license_codes', 'duration_days'),
    ('license_codes', 'max_activations'),
    ('license_codes', 'activation_count'),
    ('license_codes', 'status'),
    ('license_codes', 'expires_at'),
    ('license_codes', 'created_by'),
    ('license_codes', 'created_at'),
    ('license_codes', 'updated_at'),
    ('license_codes', 'note'),
    ('license_activations', 'id'),
    ('license_activations', 'license_id'),
    ('license_activations', 'user_id'),
    ('license_activations', 'email'),
    ('license_activations', 'activated_at'),
    ('license_activations', 'expires_at'),
    ('license_activations', 'status'),
    ('license_activations', 'last_used_at'),
    ('license_activations', 'revoked_at'),
    ('license_activations', 'revoked_reason'),
    ('license_activations', 'created_at'),
    ('usage_records', 'id'),
    ('usage_records', 'user_id'),
    ('usage_records', 'license_id'),
    ('usage_records', 'success'),
    ('usage_records', 'created_at')
),
column_results as (
  select
    required.table_name,
    required.column_name,
    columns.column_name is not null as present
  from required_columns as required
  left join information_schema.columns as columns
    on columns.table_schema = 'public'
   and columns.table_name = required.table_name
   and columns.column_name = required.column_name
)
select
  table_name,
  bool_and(present) as all_required_columns_present,
  array_agg(column_name order by column_name) filter (where not present) as missing_columns
from column_results
group by table_name
order by table_name;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_settings'
      and column_name = 'setting_value'
      and data_type = 'jsonb'
  ) as admin_settings_uses_setting_value,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_settings'
      and column_name = 'id'
      and data_type = 'text'
  ) as admin_settings_id_is_text,
  to_regclass('public.admin_settings_id_reconcile_uidx') is not null
    as admin_settings_id_unique_index_present,
  exists (
    select 1
    from pg_constraint
    where contype = 'f'
      and conrelid = 'public.license_activations'::regclass
      and confrelid = 'public.license_codes'::regclass
  ) as activation_license_foreign_key_present;

select
  count(*) as activation_rows,
  count(license.id) as activation_rows_with_license,
  count(*) filter (where license.id is null) as orphaned_license_links
from public.license_activations as activation
left join public.license_codes as license
  on license.id = activation.license_id;
