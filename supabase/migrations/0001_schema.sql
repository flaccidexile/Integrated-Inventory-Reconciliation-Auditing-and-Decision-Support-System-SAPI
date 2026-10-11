-- ============================================================================
--  Southwind Automotive Parts Inc. (SAPI)
--  Integrated Inventory Reconciliation, Auditing & Decision Support System
--
--  Migration 0001 — schema
--
--  Run order in the Supabase SQL Editor:  0001 -> 0002 -> 0003 -> 0004 -> seed.sql
--  (Or paste supabase/setup-all.sql once — it is these files in that order.)
--
--  Design notes
--  ------------
--  * Every identifier that already exists in the client domain model is kept
--    verbatim as a natural key (branch id, SKU, ticket id) so the React layer
--    needs no translation table.
--  * `stock_records` is the fact table: one row per (SKU, branch) position.
--    Derived figures (status, value, shortfall) are NOT stored — they live in
--    the `v_stock_enriched` view so they can never drift out of sync.
--  * `variance` and `variance_value` on discrepancies ARE stored, as generated
--    columns, because the approval workflow audits them and they must be
--    immutable evidence rather than a recomputed value.
-- ============================================================================

-- No `create extension` is needed. This schema deliberately depends on nothing
-- beyond core Postgres: primary keys are natural keys (branch id, SKU, ticket
-- id) or supplied by Supabase Auth, so there is no `gen_random_uuid()` call and
-- no `pgcrypto`. An earlier revision ran `create extension if not exists
-- "pgcrypto"`; nothing used it, and because the whole script is one transaction
-- a failure there would have rolled back the entire migration, so it was
-- removed rather than left in as a single point of failure.

-- ─────────────────────────────────────────────────────────────────────────────
--  Enumerated types
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every type is created inside its own guarded block. A bare `create type`
-- raises `duplicate_object` on the second run, which aborts the surrounding
-- transaction and rolls the whole migration back — the exact opposite of what a
-- file documented as "safe to re-run" should do. Guarding here, together with
-- `if not exists` on the tables and indexes below, is what actually delivers
-- that promise.

do $enums$
begin
  -- The three user-facing roles requested for the system. A single `profiles`
  -- row per auth user carries exactly one of these.
  begin
    create type public.user_role as enum ('management', 'warehouse', 'sales');
  exception when duplicate_object then null; end;

  begin
    create type public.part_category as enum (
      'Engine Parts', 'Brakes', 'Electrical', 'Suspension',
      'Filters', 'Exhaust', 'Drivetrain', 'Body Parts'
    );
  exception when duplicate_object then null; end;

  -- ABC classification drives how heavily a position is weighted in the
  -- targeted cycle-count score (Objective 1).
  begin
    create type public.abc_class as enum ('A', 'B', 'C');
  exception when duplicate_object then null; end;

  begin
    create type public.cycle_priority as enum ('Critical', 'High', 'Medium', 'Low');
  exception when duplicate_object then null; end;

  begin
    create type public.cycle_task_status as enum (
      'Pending', 'Sheet Printed', 'Counted', 'Reconciled'
    );
  exception when duplicate_object then null; end;

  -- Objective 2 — a count that does not match locks the record until a
  -- management user approves or rejects it.
  begin
    create type public.discrepancy_status as enum (
      'Locked', 'Under Review', 'Approved', 'Rejected'
    );
  exception when duplicate_object then null; end;

  begin
    create type public.root_cause as enum (
      'Miscount', 'Unrecorded Transfer', 'Damaged Goods', 'Misplaced Item',
      'Supplier Short-Ship', 'Encoding Error', 'Theft / Shrinkage'
    );
  exception when duplicate_object then null; end;

  begin
    create type public.transfer_status as enum (
      'Pending', 'Approved', 'In Transit', 'Completed', 'Rejected'
    );
  exception when duplicate_object then null; end;

  begin
    create type public.po_status as enum (
      'Draft', 'Submitted', 'Confirmed', 'Partially Received', 'Completed', 'Cancelled'
    );
  exception when duplicate_object then null; end;

  begin
    create type public.supplier_status as enum ('Active', 'Inactive');
  exception when duplicate_object then null; end;

  begin
    create type public.account_status as enum ('Active', 'Suspended');
  exception when duplicate_object then null; end;
end
$enums$;

-- ─────────────────────────────────────────────────────────────────────────────
--  Reference data
-- ─────────────────────────────────────────────────────────────────────────────

-- The eight branches named in the proposal. QC is the main warehouse.
create table if not exists public.branches (
  id          text primary key,
  name        text not null,
  short_name  text not null,
  region      text not null,
  manager     text not null,
  address     text not null,
  phone       text not null,
  is_main     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.parts (
  sku            text primary key,
  name           text not null,
  category       public.part_category not null,
  brand          text not null,
  unit_cost      numeric(12, 2) not null check (unit_cost >= 0),
  reorder_point  integer not null check (reorder_point >= 0),
  abc_class      public.abc_class not null,
  created_at     timestamptz not null default now()
);

create index if not exists parts_category_idx on public.parts (category);
create index if not exists parts_abc_class_idx on public.parts (abc_class);

create table if not exists public.suppliers (
  id              integer primary key,
  name            text not null,
  categories      text not null,
  phone           text not null,
  email           text not null,
  lead_time_days  integer not null check (lead_time_days >= 0),
  rating          numeric(2, 1) not null check (rating between 0 and 5),
  active_pos      integer not null default 0 check (active_pos >= 0),
  status          public.supplier_status not null default 'Active',
  created_at      timestamptz not null default now()
);

-- Single-row configuration table backing the Settings screen.
create table if not exists public.company_settings (
  id             boolean primary key default true check (id),
  name           text not null,
  short_name     text not null,
  abbr           text not null,
  system_name    text not null,
  hq             text not null,
  phone          text not null,
  email          text not null,
  website        text not null,
  branch_count   integer not null default 8,
  no_phone_policy text not null,
  updated_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
--  Users
-- ─────────────────────────────────────────────────────────────────────────────

-- Application profile, one-to-one with auth.users. `role` and `branch_id` are
-- the two facts every RLS policy keys off.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null,
  role        public.user_role not null default 'sales',
  branch_id   text references public.branches (id) on delete set null,
  job_title   text,
  status      public.account_status not null default 'Active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_branch_idx on public.profiles (branch_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  Stock — the fact table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.stock_records (
  sku                   text not null references public.parts (sku) on delete cascade,
  branch_id             text not null references public.branches (id) on delete cascade,
  on_hand               integer not null default 0 check (on_hand >= 0),
  bin_location          text not null,
  days_since_movement   integer not null default 0 check (days_since_movement >= 0),
  days_since_count      integer not null default 0 check (days_since_count >= 0),
  days_since_transfer   integer check (days_since_transfer is null or days_since_transfer >= 0),
  -- Set by the approval workflow: while a discrepancy ticket is open against
  -- this position, the record is frozen and cannot be recounted.
  locked_by_discrepancy text,
  updated_at            timestamptz not null default now(),
  primary key (sku, branch_id)
);

create index if not exists stock_records_branch_idx on public.stock_records (branch_id);
create index if not exists stock_records_staleness_idx on public.stock_records (days_since_count desc);
create index if not exists stock_records_movement_idx on public.stock_records (days_since_movement desc);

-- ─────────────────────────────────────────────────────────────────────────────
--  Objective 1 — Targeted cycle counting
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.cycle_tasks (
  id                   text primary key,
  sku                  text not null references public.parts (sku) on delete cascade,
  branch_id            text not null references public.branches (id) on delete cascade,
  bin_location         text not null,
  priority             public.cycle_priority not null,
  score                numeric(6, 1) not null check (score >= 0),
  days_since_count     integer not null,
  days_since_transfer  integer,
  abc_class            public.abc_class not null,
  reason               text not null,
  status               public.cycle_task_status not null default 'Pending',
  assigned_to          text,
  generated_at         timestamptz not null default now(),
  printed_at           timestamptz,
  counted_at           timestamptz,
  reconciled_at        timestamptz,
  created_by           uuid references public.profiles (id) on delete set null,
  updated_at           timestamptz not null default now()
);

create index if not exists cycle_tasks_branch_idx on public.cycle_tasks (branch_id);
create index if not exists cycle_tasks_status_idx on public.cycle_tasks (status);
create index if not exists cycle_tasks_priority_idx on public.cycle_tasks (priority);
-- One live task per position; regenerating replaces the queue.
create unique index if not exists cycle_tasks_position_key
  on public.cycle_tasks (sku, branch_id)
  where status <> 'Reconciled';

-- ─────────────────────────────────────────────────────────────────────────────
--  Objective 2 — Discrepancy approval workflow
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.discrepancies (
  id             text primary key,
  sku            text not null references public.parts (sku) on delete cascade,
  branch_id      text not null references public.branches (id) on delete cascade,
  bin_location   text not null,
  system_qty     integer not null,
  counted_qty    integer not null,
  variance       integer generated always as (counted_qty - system_qty) stored,
  unit_cost      numeric(12, 2) not null check (unit_cost >= 0),
  variance_value numeric(14, 2) generated always as
                   (abs(counted_qty - system_qty) * unit_cost) stored,
  root_cause     public.root_cause,
  status         public.discrepancy_status not null default 'Locked',
  notes          text not null default '',
  raised_by      text not null,
  raised_by_id   uuid references public.profiles (id) on delete set null,
  raised_at      timestamptz not null default now(),
  reviewed_by    text,
  reviewed_by_id uuid references public.profiles (id) on delete set null,
  reviewed_at    timestamptz,
  -- Only an approval carries a root cause; the workflow enforces it here too.
  constraint discrepancy_review_coherent check (
    (status = 'Approved' and root_cause is not null and reviewed_at is not null)
    or (status in ('Locked', 'Under Review'))
    or (status = 'Rejected' and reviewed_at is not null)
  )
);

create index if not exists discrepancies_branch_idx on public.discrepancies (branch_id);
create index if not exists discrepancies_status_idx on public.discrepancies (status);
create index if not exists discrepancies_raised_at_idx on public.discrepancies (raised_at desc);
create index if not exists discrepancies_root_cause_idx on public.discrepancies (root_cause);

-- ─────────────────────────────────────────────────────────────────────────────
--  Objective 4 — Dead-stock matchmaker + supply chain
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.transfers (
  id             text primary key,
  sku            text not null references public.parts (sku) on delete cascade,
  part_name      text not null,
  from_branch_id text not null references public.branches (id) on delete cascade,
  to_branch_id   text not null references public.branches (id) on delete cascade,
  qty            integer not null check (qty > 0),
  requested_by   text not null,
  requested_by_id uuid references public.profiles (id) on delete set null,
  transfer_date  date not null default current_date,
  status         public.transfer_status not null default 'Pending',
  -- True when the row originated from an accepted matchmaker suggestion.
  auto_suggested boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint transfers_distinct_branches check (from_branch_id <> to_branch_id)
);

create index if not exists transfers_status_idx on public.transfers (status);
create index if not exists transfers_from_idx on public.transfers (from_branch_id);
create index if not exists transfers_to_idx on public.transfers (to_branch_id);
create index if not exists transfers_date_idx on public.transfers (transfer_date desc);

create table if not exists public.purchase_orders (
  id            text primary key,
  supplier      text not null,
  items         integer not null check (items >= 0),
  total         numeric(14, 2) not null check (total >= 0),
  order_date    date not null,
  delivery_date date not null,
  status        public.po_status not null default 'Draft',
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists purchase_orders_status_idx on public.purchase_orders (status);
create index if not exists purchase_orders_order_date_idx on public.purchase_orders (order_date desc);

-- ─────────────────────────────────────────────────────────────────────────────
--  Triggers
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- `create trigger` has no `if not exists` form, so each is dropped first. The
-- drop is a no-op on a first run and makes re-runs safe.
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch        before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists stock_records_touch on public.stock_records;
create trigger stock_records_touch   before update on public.stock_records
  for each row execute function public.touch_updated_at();
drop trigger if exists cycle_tasks_touch on public.cycle_tasks;
create trigger cycle_tasks_touch     before update on public.cycle_tasks
  for each row execute function public.touch_updated_at();
drop trigger if exists transfers_touch on public.transfers;
create trigger transfers_touch       before update on public.transfers
  for each row execute function public.touch_updated_at();
drop trigger if exists purchase_orders_touch on public.purchase_orders;
create trigger purchase_orders_touch before update on public.purchase_orders
  for each row execute function public.touch_updated_at();

-- Mirror every new auth user into `profiles`. Role and branch are read from the
-- sign-up metadata, defaulting to the least-privileged role (sales) so a
-- mis-provisioned account can never self-escalate.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   public.user_role := 'sales';
  v_branch text;
  v_name   text;
  v_title  text;
begin
  if (new.raw_user_meta_data ? 'role') then
    begin
      v_role := (new.raw_user_meta_data ->> 'role')::public.user_role;
    exception when invalid_text_representation then
      v_role := 'sales';
    end;
  end if;

  v_branch := new.raw_user_meta_data ->> 'branch_id';
  if v_branch is not null and not exists (select 1 from public.branches where id = v_branch) then
    v_branch := null;
  end if;

  v_name  := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1));
  v_title := new.raw_user_meta_data ->> 'job_title';

  insert into public.profiles (id, email, full_name, role, branch_id, job_title)
  values (new.id, new.email, v_name, v_role, v_branch, v_title)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
