-- ============================================================================
--  SAPI — Migration 0002 — Row Level Security
--
--  The three roles and what they may do (proposal-faithful):
--
--    management  Full oversight. Approves or rejects discrepancy tickets,
--                generates and assigns cycle-count work, manages parts,
--                suppliers and purchase orders.
--    warehouse   Encodes physical counts, prints blind-count sheets, raises
--                discrepancy tickets for its own branch, and executes
--                inter-branch transfers.
--    sales       Read-only visibility of stock availability across all eight
--                branches, plus the ability to request a transfer.
--
--  All three roles may SELECT across branches: the whole point of the system
--  is that a sales officer in Dipolog can see what Cebu has on the shelf.
--  Writes are where the roles diverge.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  Role helpers
--
--  These are SECURITY DEFINER on purpose. A policy on `profiles` that queried
--  `profiles` would recurse; running the lookup as the owner sidesteps that and
--  also lets the same helpers be reused inside the self-escalation trigger.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.auth_branch_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.branch_id from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'management' and p.status = 'Active'
  );
$$;

create or replace function public.is_warehouse()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'warehouse' and p.status = 'Active'
  );
$$;

create or replace function public.is_sales()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'sales' and p.status = 'Active'
  );
$$;

/** Any signed-in user with a live profile. */
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'Active'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  Privilege-escalation guard
--
--  RLS `with check` cannot compare against the previous row, so a user who is
--  allowed to edit their own profile could otherwise promote themselves to
--  management. This trigger closes that hole: only management (or the service
--  role, which bypasses RLS entirely) may change `role`, `branch_id` or
--  `status`.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.prevent_profile_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- `auth.uid() is null` means the service role / a direct SQL session
  -- (the seed script). Those are trusted.
  if auth.uid() is null or public.is_management() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.branch_id is distinct from old.branch_id
     or new.status is distinct from old.status then
    raise exception
      'Only management may change role, branch or account status'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_escalation on public.profiles;
create trigger profiles_guard_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_escalation();

-- ─────────────────────────────────────────────────────────────────────────────
--  Enable RLS everywhere
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.branches         enable row level security;
alter table public.parts            enable row level security;
alter table public.suppliers        enable row level security;
alter table public.company_settings enable row level security;
alter table public.profiles         enable row level security;
alter table public.stock_records    enable row level security;
alter table public.cycle_tasks      enable row level security;
alter table public.discrepancies    enable row level security;
alter table public.transfers        enable row level security;
alter table public.purchase_orders  enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
--  branches — readable by everyone signed in, curated by management
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists branches_select on public.branches;

create policy branches_select on public.branches
  for select to authenticated using (public.is_active_user());

drop policy if exists branches_insert on public.branches;

create policy branches_insert on public.branches
  for insert to authenticated with check (public.is_management());

drop policy if exists branches_update on public.branches;

create policy branches_update on public.branches
  for update to authenticated
  using (public.is_management()) with check (public.is_management());

drop policy if exists branches_delete on public.branches;

create policy branches_delete on public.branches
  for delete to authenticated using (public.is_management());

-- ─────────────────────────────────────────────────────────────────────────────
--  parts — catalogue is readable by all, maintained by management
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists parts_select on public.parts;

create policy parts_select on public.parts
  for select to authenticated using (public.is_active_user());

drop policy if exists parts_insert on public.parts;

create policy parts_insert on public.parts
  for insert to authenticated with check (public.is_management());

drop policy if exists parts_update on public.parts;

create policy parts_update on public.parts
  for update to authenticated
  using (public.is_management()) with check (public.is_management());

drop policy if exists parts_delete on public.parts;

create policy parts_delete on public.parts
  for delete to authenticated using (public.is_management());

-- ─────────────────────────────────────────────────────────────────────────────
--  suppliers
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists suppliers_select on public.suppliers;

create policy suppliers_select on public.suppliers
  for select to authenticated using (public.is_active_user());

drop policy if exists suppliers_write on public.suppliers;

create policy suppliers_write on public.suppliers
  for all to authenticated
  using (public.is_management()) with check (public.is_management());

-- ─────────────────────────────────────────────────────────────────────────────
--  company_settings — one row, management edits
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists company_settings_select on public.company_settings;

create policy company_settings_select on public.company_settings
  for select to authenticated using (public.is_active_user());

drop policy if exists company_settings_update on public.company_settings;

create policy company_settings_update on public.company_settings
  for update to authenticated
  using (public.is_management()) with check (public.is_management());

-- ─────────────────────────────────────────────────────────────────────────────
--  profiles
--
--  Everyone signed in may read the directory — the UI needs to resolve
--  "assigned to" and "reviewed by" display names. Only management may write
--  arbitrary rows; everyone else may edit their own name and job title, and
--  the trigger above stops them touching role / branch / status.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select to authenticated using (public.is_active_user());

drop policy if exists profiles_update_self on public.profiles;

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_manage on public.profiles;

create policy profiles_manage on public.profiles
  for all to authenticated
  using (public.is_management()) with check (public.is_management());

-- ─────────────────────────────────────────────────────────────────────────────
--  stock_records — the fact table
--
--  Read: every signed-in role, all branches (this is the cross-branch
--        availability the sales desk depends on).
--  Write: warehouse (reconcile a counted position) and management (apply an
--         approved variance). Sales never writes stock.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists stock_select on public.stock_records;

create policy stock_select on public.stock_records
  for select to authenticated using (public.is_active_user());

drop policy if exists stock_update on public.stock_records;

create policy stock_update on public.stock_records
  for update to authenticated
  using (public.is_management() or public.is_warehouse())
  with check (public.is_management() or public.is_warehouse());

drop policy if exists stock_insert on public.stock_records;

create policy stock_insert on public.stock_records
  for insert to authenticated with check (public.is_management());

drop policy if exists stock_delete on public.stock_records;

create policy stock_delete on public.stock_records
  for delete to authenticated using (public.is_management());

-- ─────────────────────────────────────────────────────────────────────────────
--  cycle_tasks — Objective 1
--
--  Management generates the queue for any branch and may reassign work.
--  Warehouse staff work the queue for their own branch only.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists cycle_tasks_select on public.cycle_tasks;

create policy cycle_tasks_select on public.cycle_tasks
  for select to authenticated using (public.is_active_user());

drop policy if exists cycle_tasks_insert on public.cycle_tasks;

create policy cycle_tasks_insert on public.cycle_tasks
  for insert to authenticated
  with check (
    public.is_management()
    or (public.is_warehouse() and branch_id = public.auth_branch_id())
  );

drop policy if exists cycle_tasks_update on public.cycle_tasks;

create policy cycle_tasks_update on public.cycle_tasks
  for update to authenticated
  using (
    public.is_management()
    or (public.is_warehouse() and branch_id = public.auth_branch_id())
  )
  with check (
    public.is_management()
    or (public.is_warehouse() and branch_id = public.auth_branch_id())
  );

drop policy if exists cycle_tasks_delete on public.cycle_tasks;

create policy cycle_tasks_delete on public.cycle_tasks
  for delete to authenticated using (public.is_management());

-- ─────────────────────────────────────────────────────────────────────────────
--  discrepancies — Objective 2
--
--  Warehouse raises tickets for its own branch. ONLY management decides.
--  There is deliberately no update policy for warehouse or sales: once a
--  ticket is Locked it stays Locked until a manager rules on it, which is the
--  control the proposal promises.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists discrepancies_select on public.discrepancies;

create policy discrepancies_select on public.discrepancies
  for select to authenticated using (public.is_active_user());

drop policy if exists discrepancies_insert on public.discrepancies;

create policy discrepancies_insert on public.discrepancies
  for insert to authenticated
  with check (
    public.is_management()
    or (
      public.is_warehouse()
      and branch_id = public.auth_branch_id()
      and raised_by_id = auth.uid()
      and status in ('Locked', 'Under Review')
    )
  );

drop policy if exists discrepancies_update on public.discrepancies;

create policy discrepancies_update on public.discrepancies
  for update to authenticated
  using (public.is_management()) with check (public.is_management());

drop policy if exists discrepancies_delete on public.discrepancies;

create policy discrepancies_delete on public.discrepancies
  for delete to authenticated using (public.is_management());

-- ─────────────────────────────────────────────────────────────────────────────
--  transfers — Objective 4 output
--
--  Sales may REQUEST a transfer (the "sales staff can flag a shortage" path).
--  Warehouse and management execute and progress it.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists transfers_select on public.transfers;

create policy transfers_select on public.transfers
  for select to authenticated using (public.is_active_user());

drop policy if exists transfers_insert on public.transfers;

create policy transfers_insert on public.transfers
  for insert to authenticated
  with check (
    public.is_management()
    or public.is_warehouse()
    or (public.is_sales() and requested_by_id = auth.uid() and status = 'Pending')
  );

drop policy if exists transfers_update on public.transfers;

create policy transfers_update on public.transfers
  for update to authenticated
  using (public.is_management() or public.is_warehouse())
  with check (public.is_management() or public.is_warehouse());

drop policy if exists transfers_delete on public.transfers;

create policy transfers_delete on public.transfers
  for delete to authenticated using (public.is_management());

-- ─────────────────────────────────────────────────────────────────────────────
--  purchase_orders — procurement is a management function
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists purchase_orders_select on public.purchase_orders;

create policy purchase_orders_select on public.purchase_orders
  for select to authenticated using (public.is_active_user());

drop policy if exists purchase_orders_insert on public.purchase_orders;

create policy purchase_orders_insert on public.purchase_orders
  for insert to authenticated with check (public.is_management());

drop policy if exists purchase_orders_update on public.purchase_orders;

create policy purchase_orders_update on public.purchase_orders
  for update to authenticated
  using (public.is_management()) with check (public.is_management());

drop policy if exists purchase_orders_delete on public.purchase_orders;

create policy purchase_orders_delete on public.purchase_orders
  for delete to authenticated using (public.is_management());
