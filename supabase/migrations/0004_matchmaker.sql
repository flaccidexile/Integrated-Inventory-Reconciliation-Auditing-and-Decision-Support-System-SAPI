-- ============================================================================
--  SAPI — Migration 0004 — Matchmaker decisions
--
--  Objective 4 proposes transfers. Two things then need to be remembered:
--
--    * Accepting a suggestion creates a `transfers` row (already covered by
--      0001), and the suggestion is suppressed from then on because the
--      matchmaker ignores pairs that already have a live transfer.
--    * Dismissing a suggestion has no transfer to point at, so it needs its
--      own record — otherwise the same rejected idea reappears on every page
--      load and the tool becomes noise.
--
--  Run this after 0003_analytics.sql.
-- ============================================================================

create table if not exists public.match_suggestion_dismissals (
  sku              text not null references public.parts (sku) on delete cascade,
  from_branch_id   text not null references public.branches (id) on delete cascade,
  to_branch_id     text not null references public.branches (id) on delete cascade,
  reason           text,
  dismissed_by     text not null,
  dismissed_by_id  uuid references public.profiles (id) on delete set null,
  dismissed_at     timestamptz not null default now(),
  primary key (sku, from_branch_id, to_branch_id),
  constraint dismissal_distinct_branches check (from_branch_id <> to_branch_id)
);

create index if not exists match_suggestion_dismissals_at_idx
  on public.match_suggestion_dismissals (dismissed_at desc);

alter table public.match_suggestion_dismissals enable row level security;

drop policy if exists dismissals_select on public.match_suggestion_dismissals;
create policy dismissals_select on public.match_suggestion_dismissals
  for select to authenticated using (public.is_active_user());

-- Sales may not overrule an operational decision, so dismissing is limited to
-- the two roles that actually move stock.
drop policy if exists dismissals_insert on public.match_suggestion_dismissals;
create policy dismissals_insert on public.match_suggestion_dismissals
  for insert to authenticated
  with check (
    public.is_management()
    or (public.is_warehouse() and dismissed_by_id = auth.uid())
  );

drop policy if exists dismissals_delete on public.match_suggestion_dismissals;
create policy dismissals_delete on public.match_suggestion_dismissals
  for delete to authenticated using (public.is_management());
