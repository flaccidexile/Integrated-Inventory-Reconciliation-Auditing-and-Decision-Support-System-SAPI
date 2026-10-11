-- ============================================================================
--  SAPI — Migration 0003 — Derived views and analytics
--
--  The algorithmic work (cycle-count scoring, dead-stock matching) lives in the
--  Express service tier because it is business logic that deserves unit tests.
--  Aggregation, by contrast, is what Postgres is for — so every roll-up the
--  dashboard and the analytics page need is expressed here as a view or an RPC
--  and computed in the database.
--
--  Every view is declared `security_invoker = true`. Without that flag a view
--  runs as its owner and would silently bypass the RLS policies from 0002.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  v_stock_enriched — the single source of truth for a stock position
--
--  Mirrors the derived fields on the client's `BranchStock` type exactly:
--    status        Out of Stock when on_hand <= 0, Low Stock below the
--                  reorder point, otherwise In Stock
--    shortfall     how many units below the reorder point
--    value         on_hand x unit_cost
--    is_dead_stock no movement for 90+ days while still holding stock
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_stock_enriched
with (security_invoker = true)
as
select
  s.sku,
  s.branch_id,
  s.on_hand,
  s.bin_location,
  s.days_since_movement,
  s.days_since_count,
  s.days_since_transfer,
  s.locked_by_discrepancy,
  p.name            as part_name,
  p.category,
  p.brand,
  p.unit_cost,
  p.reorder_point,
  p.abc_class,
  b.name            as branch_name,
  b.short_name      as branch_short_name,
  b.region          as branch_region,
  b.manager         as branch_manager,
  case
    when s.on_hand <= 0                 then 'Out of Stock'
    when s.on_hand <  p.reorder_point   then 'Low Stock'
    else                                     'In Stock'
  end                                 as status,
  greatest(0, p.reorder_point - s.on_hand)          as shortfall,
  (s.on_hand * p.unit_cost)::numeric(14, 2)         as value,
  (s.days_since_movement >= 90 and s.on_hand > 0)   as is_dead_stock
from public.stock_records s
join public.parts    p on p.sku = s.sku
join public.branches b on b.id  = s.branch_id;

comment on view public.v_stock_enriched is
  'Stock positions joined with part and branch detail plus every derived field the client renders.';

-- ─────────────────────────────────────────────────────────────────────────────
--  v_branch_summary — per-branch roll-up used by the dashboard table
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_branch_summary
with (security_invoker = true)
as
select
  v.branch_id,
  v.branch_name,
  v.branch_short_name,
  v.branch_region,
  v.branch_manager,
  count(*)::integer                                            as positions,
  coalesce(sum(v.on_hand), 0)::integer                          as units,
  coalesce(sum(v.value), 0)::numeric(16, 2)                     as value,
  count(*) filter (where v.status = 'Low Stock')::integer       as low_stock,
  count(*) filter (where v.status = 'Out of Stock')::integer    as out_of_stock,
  count(*) filter (where v.is_dead_stock)::integer              as dead_stock,
  count(*) filter (where v.on_hand >= v.reorder_point)::integer as healthy,
  round(
    100.0 * count(*) filter (where v.on_hand >= v.reorder_point) / nullif(count(*), 0),
    1
  )                                                             as health_rate
from public.v_stock_enriched v
group by
  v.branch_id, v.branch_name, v.branch_short_name, v.branch_region, v.branch_manager;

-- ─────────────────────────────────────────────────────────────────────────────
--  v_category_summary — per-category roll-up used by the inventory page
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_category_summary
with (security_invoker = true)
as
select
  v.category,
  count(distinct v.sku)::integer                                as skus,
  count(*)::integer                                             as positions,
  coalesce(sum(v.on_hand), 0)::integer                          as units,
  coalesce(sum(v.value), 0)::numeric(16, 2)                     as value,
  count(*) filter (where v.status <> 'In Stock')::integer       as attention,
  count(*) filter (where v.is_dead_stock)::integer              as dead_stock
from public.v_stock_enriched v
group by v.category;

-- ─────────────────────────────────────────────────────────────────────────────
--  v_discrepancy_enriched — tickets with the names the UI needs
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.v_discrepancy_enriched
with (security_invoker = true)
as
select
  d.*,
  p.name     as part_name,
  p.category,
  b.name     as branch_name,
  b.short_name as branch_short_name,
  case
    when d.status in ('Locked', 'Under Review') then true
    else false
  end        as is_open
from public.discrepancies d
join public.parts    p on p.sku = d.sku
join public.branches b on b.id  = d.branch_id;

-- ─────────────────────────────────────────────────────────────────────────────
--  rpc_dashboard_kpis — every headline number in one round trip
--
--  Two accuracy measures are reported deliberately separately. "Count accuracy"
--  is what the capstone is graded on: the share of stock positions with no
--  discrepancy ticket against them. "Stock health" is a level metric: the share
--  of positions sitting at or above their reorder point. Blending them, as the
--  original prototype did, produces a number that means nothing.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.rpc_dashboard_kpis()
returns table (
  total_positions      integer,
  total_units          integer,
  total_value          numeric,
  dead_stock_count     integer,
  dead_stock_value     numeric,
  low_stock_count      integer,
  low_stock_value      numeric,
  out_of_stock_count   integer,
  count_accuracy       numeric,
  stock_health         numeric,
  open_discrepancies   integer,
  locked_value         numeric,
  total_variance_cost  numeric,
  resolved_this_month  integer,
  pending_transfers    integer,
  in_transit_transfers integer,
  open_pos             integer,
  po_spend_total       numeric,
  sku_count            integer,
  branch_count         integer
)
language sql
stable
set search_path = public
as $$
  with stock as (
    select * from public.v_stock_enriched
  ),
  ticket as (
    select * from public.discrepancies
  )
  select
    (select count(*) from stock)::integer,
    (select coalesce(sum(on_hand), 0) from stock)::integer,
    (select coalesce(sum(value), 0) from stock)::numeric,
    (select count(*) from stock where is_dead_stock)::integer,
    (select coalesce(sum(value), 0) from stock where is_dead_stock)::numeric,
    (select count(*) from stock where status = 'Low Stock')::integer,
    (select coalesce(sum(value), 0) from stock where status = 'Low Stock')::numeric,
    (select count(*) from stock where status = 'Out of Stock')::integer,

    -- Count accuracy: positions with a clean count record.
    (
      select round(
        100.0 * count(*) filter (
          where not exists (
            select 1 from ticket t
            where t.sku = s.sku and t.branch_id = s.branch_id
          )
        ) / nullif(count(*), 0),
        1
      )
      from stock s
    ),

    -- Stock health: positions at or above their reorder point.
    (
      select round(
        100.0 * count(*) filter (where on_hand >= reorder_point) / nullif(count(*), 0),
        1
      )
      from stock
    ),

    (select count(*) from ticket where status in ('Locked', 'Under Review'))::integer,
    (select coalesce(sum(variance_value), 0) from ticket
      where status in ('Locked', 'Under Review'))::numeric,
    (select coalesce(sum(variance_value), 0) from ticket)::numeric,
    (select count(*) from ticket
      where status in ('Approved', 'Rejected')
        and reviewed_at >= date_trunc('month', now()))::integer,

    (select count(*) from public.transfers where status = 'Pending')::integer,
    (select count(*) from public.transfers where status = 'In Transit')::integer,

    (select count(*) from public.purchase_orders
      where status in ('Submitted', 'Confirmed', 'Partially Received'))::integer,
    (select coalesce(sum(total), 0) from public.purchase_orders)::numeric,

    (select count(distinct sku) from stock)::integer,
    (select count(*) from public.branches)::integer;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  rpc_discrepancy_analytics — Objective 3
--
--  Returns the three breakdowns the analytics page charts, as one JSON payload:
--  by month, by branch, and by root cause.
--
--  The monthly roll-up distinguishes three things, and conflating them is what
--  makes a discrepancy chart useless:
--
--    opened    tickets raised during the month
--    resolved  tickets DECIDED during the month (keyed on reviewed_at, not
--              raised_at). Keying resolution on the raise date counts every
--              already-decided ticket as resolved in the month it was raised,
--              which makes "Opened" and "Resolved" identical and hides the
--              backlog entirely.
--    backlog   tickets raised on or before the month that were still
--              undecided at its close
--
--  Months are the union of raise months and review months, so a month in which
--  the team only cleared a backlog still appears on the axis.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.rpc_discrepancy_analytics()
returns jsonb
language sql
stable
set search_path = public
as $$
  with ticket as (
    select * from public.discrepancies
  ),
  months as (
    select date_trunc('month', raised_at) as month from ticket
    union
    select date_trunc('month', reviewed_at) from ticket where reviewed_at is not null
  ),
  by_month as (
    select
      to_char(m.month, 'Mon')  as month,
      m.month                  as sort_key,
      count(t.id) filter (
        where date_trunc('month', t.raised_at) = m.month
      )::integer               as opened,
      count(t.id) filter (
        where date_trunc('month', t.reviewed_at) = m.month
      )::integer               as resolved,
      count(t.id) filter (
        where date_trunc('month', t.raised_at) <= m.month
          and (t.reviewed_at is null or date_trunc('month', t.reviewed_at) > m.month)
      )::integer               as backlog,
      coalesce(sum(t.variance_value) filter (
        where date_trunc('month', t.raised_at) = m.month
      ), 0)::numeric           as cost
    from months m
    left join ticket t on true
    group by m.month
    order by m.month
  ),
  by_branch as (
    select
      b.id                       as branch_id,
      b.short_name               as short_name,
      count(d.id)::integer       as discrepancies,
      coalesce(sum(d.variance_value), 0)::numeric as cost,
      count(d.id) filter (where d.status = 'Approved')::integer as approved,
      count(d.id) filter (where d.status = 'Rejected')::integer as rejected,
      count(d.id) filter (where d.status in ('Locked', 'Under Review'))::integer as open,
      (
        select round(
          100.0 * count(*) filter (
            where not exists (
              select 1 from ticket t2
              where t2.sku = s.sku and t2.branch_id = b.id
            )
          ) / nullif(count(*), 0),
          1
        )
        from public.v_stock_enriched s
        where s.branch_id = b.id
      )                          as accuracy_rate
    from public.branches b
    left join ticket d on d.branch_id = b.id
    group by b.id, b.short_name
    order by count(d.id) desc
  ),
  by_cause as (
    select
      rc.cause::text             as cause,
      count(t.id)::integer       as count,
      coalesce(sum(t.variance_value), 0)::numeric as cost
    from unnest(enum_range(null::public.root_cause)) as rc(cause)
    left join ticket t on t.root_cause = rc.cause and t.status = 'Approved'
    group by rc.cause
    order by count(t.id) desc
  )
  select jsonb_build_object(
    -- Built key by key rather than with to_jsonb(x) so `sort_key`, which exists
    -- only to order the aggregation, does not leak into the payload the client
    -- deserialises into DiscrepancyByMonth.
    'byMonth',  coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'month',    x.month,
          'opened',   x.opened,
          'resolved', x.resolved,
          'backlog',  x.backlog,
          'cost',     x.cost
        ) order by x.sort_key
      )
      from by_month x
    ), '[]'::jsonb),
    'byBranch', coalesce((select jsonb_agg(to_jsonb(y)) from by_branch y), '[]'::jsonb),
    'byCause',  coalesce((select jsonb_agg(to_jsonb(z)) from by_cause z), '[]'::jsonb)
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  rpc_cycle_summary — Objective 1 progress
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.rpc_cycle_summary()
returns table (
  total_tasks     integer,
  pending         integer,
  sheet_printed   integer,
  counted         integer,
  reconciled      integer,
  critical        integer,
  high            integer,
  medium          integer,
  low             integer,
  completion_rate numeric
)
language sql
stable
set search_path = public
as $$
  select
    count(*)::integer,
    count(*) filter (where status = 'Pending')::integer,
    count(*) filter (where status = 'Sheet Printed')::integer,
    count(*) filter (where status = 'Counted')::integer,
    count(*) filter (where status = 'Reconciled')::integer,
    count(*) filter (where priority = 'Critical')::integer,
    count(*) filter (where priority = 'High')::integer,
    count(*) filter (where priority = 'Medium')::integer,
    count(*) filter (where priority = 'Low')::integer,
    round(
      100.0 * count(*) filter (where status = 'Reconciled') / nullif(count(*), 0),
      1
    )
  from public.cycle_tasks;
$$;
