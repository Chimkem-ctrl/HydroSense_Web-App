alter table public.reports
  alter column tank_ids drop default,
  drop constraint if exists reports_id_format_check,
  drop constraint if exists reports_report_type_check,
  drop constraint if exists reports_tank_ids_nonempty_check,
  drop constraint if exists reports_range_bounds_check,
  add constraint reports_id_format_check
    check (id ~ '^RPT-[0-9]{8}-[A-HJ-NP-Z2-9]{6}$'),
  add constraint reports_report_type_check
    check (report_type in ('pdf', 'csv', 'xlsx')),
  add constraint reports_tank_ids_nonempty_check
    check (cardinality(tank_ids) > 0),
  add constraint reports_range_bounds_check
    check (
      (range_from is null and range_to is null)
      or (range_from is not null and range_to is not null and range_from <= range_to)
    );
