alter table public.activity_logs add column hatchery_id text;

update public.activity_logs
set hatchery_id = 'camiguin-sagay'
where tank_id = 'hatchery' and hatchery_id is null;
