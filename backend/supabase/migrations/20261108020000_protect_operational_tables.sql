alter table public.thresholds enable row level security;
alter table public.advisory_settings enable row level security;
alter table public.manual_entries enable row level security;
alter table public.activity_logs enable row level security;
alter table public.calibration_logs enable row level security;
alter table public.validation_rows enable row level security;
alter table public.validation_tolerances enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.thresholds, public.advisory_settings,
  public.manual_entries, public.activity_logs, public.calibration_logs,
  public.validation_rows, public.validation_tolerances, public.audit_logs
  from public, anon, authenticated;
