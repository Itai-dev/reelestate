-- Reel Estate: accounts, credits and payments. Applied to the studio-hq
-- project on 2026-11-18. All writes go through the server (service role);
-- signed-in users may only read their own rows.

create table public.re_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  plan text,
  sub_status text not null default 'none' check (sub_status in ('none','active','past_due','canceled')),
  current_period_end timestamptz,
  plan_credits integer not null default 0 check (plan_credits >= 0),
  extra_credits integer not null default 0 check (extra_credits >= 0),
  grow_direct_debit_id text,
  grow_transaction_id text,
  grow_transaction_token text,
  grow_asmachta text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index re_profiles_direct_debit_idx on public.re_profiles (grow_direct_debit_id);
create index re_profiles_email_idx on public.re_profiles (lower(email));

create table public.re_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('subscription','topup','renewal')),
  product text not null,
  amount numeric(10,2) not null,
  credits integer not null,
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  process_id text,
  process_token text,
  transaction_id text unique,
  asmachta text,
  direct_debit_id text,
  raw jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index re_payments_user_idx on public.re_payments (user_id, created_at desc);
create index re_payments_process_idx on public.re_payments (process_id);

create table public.re_credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  bucket text not null check (bucket in ('plan','extra')),
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);
create index re_credit_ledger_user_idx on public.re_credit_ledger (user_id, created_at desc);

create table public.re_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  credits integer not null,
  plan_used integer not null default 0,
  extra_used integer not null default 0,
  request_id text unique,
  status text not null default 'pending' check (status in ('pending','queued','done','failed','refunded')),
  video_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index re_generations_user_idx on public.re_generations (user_id, created_at desc);

alter table public.re_profiles enable row level security;
alter table public.re_payments enable row level security;
alter table public.re_credit_ledger enable row level security;
alter table public.re_generations enable row level security;

create policy "re_profiles: read own" on public.re_profiles for select to authenticated using ((select auth.uid()) = id);
create policy "re_payments: read own" on public.re_payments for select to authenticated using ((select auth.uid()) = user_id);
create policy "re_credit_ledger: read own" on public.re_credit_ledger for select to authenticated using ((select auth.uid()) = user_id);
create policy "re_generations: read own" on public.re_generations for select to authenticated using ((select auth.uid()) = user_id);

revoke insert, update, delete, truncate on public.re_profiles, public.re_payments, public.re_credit_ledger, public.re_generations from anon, authenticated;
revoke all on public.re_profiles, public.re_payments, public.re_credit_ledger, public.re_generations from anon;

-- Take credits for one clip: plan credits first (only while the paid period is
-- valid), then top-up credits. Returns the generation id.
create or replace function public.re_spend_credits(p_user uuid, p_amount integer, p_model text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan integer;
  v_extra integer;
  v_status text;
  v_end timestamptz;
  use_plan integer;
  use_extra integer;
  gen_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;
  select plan_credits, extra_credits, sub_status, current_period_end
    into v_plan, v_extra, v_status, v_end
    from re_profiles where id = p_user for update;
  if not found then
    raise exception 'insufficient_credits';
  end if;
  if not (v_status in ('active', 'canceled') and v_end is not null and v_end > now()) then
    v_plan := 0;
  end if;
  if v_plan + v_extra < p_amount then
    raise exception 'insufficient_credits';
  end if;
  use_plan := least(v_plan, p_amount);
  use_extra := p_amount - use_plan;
  update re_profiles
     set plan_credits = plan_credits - use_plan,
         extra_credits = extra_credits - use_extra,
         updated_at = now()
   where id = p_user;
  insert into re_generations (user_id, model, credits, plan_used, extra_used)
  values (p_user, p_model, p_amount, use_plan, use_extra)
  returning id into gen_id;
  if use_plan > 0 then
    insert into re_credit_ledger (user_id, delta, bucket, reason, ref) values (p_user, -use_plan, 'plan', 'generation', gen_id::text);
  end if;
  if use_extra > 0 then
    insert into re_credit_ledger (user_id, delta, bucket, reason, ref) values (p_user, -use_extra, 'extra', 'generation', gen_id::text);
  end if;
  return gen_id;
end;
$$;

-- Give credits back for a clip that failed (once).
create or replace function public.re_refund_generation(p_gen uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g re_generations%rowtype;
begin
  select * into g from re_generations where id = p_gen for update;
  if not found or g.status in ('refunded', 'done') then
    return;
  end if;
  update re_profiles
     set plan_credits = plan_credits + g.plan_used,
         extra_credits = extra_credits + g.extra_used,
         updated_at = now()
   where id = g.user_id;
  update re_generations set status = 'refunded', error = left(p_error, 500), updated_at = now() where id = p_gen;
  if g.plan_used > 0 then
    insert into re_credit_ledger (user_id, delta, bucket, reason, ref) values (g.user_id, g.plan_used, 'plan', 'refund', p_gen::text);
  end if;
  if g.extra_used > 0 then
    insert into re_credit_ledger (user_id, delta, bucket, reason, ref) values (g.user_id, g.extra_used, 'extra', 'refund', p_gen::text);
  end if;
end;
$$;

-- Mark a checkout paid and grant what it bought (idempotent).
create or replace function public.re_apply_payment(
  p_payment uuid,
  p_transaction_id text,
  p_transaction_token text,
  p_asmachta text,
  p_direct_debit_id text,
  p_raw jsonb,
  p_period_days integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  p re_payments%rowtype;
begin
  select * into p from re_payments where id = p_payment for update;
  if not found then
    raise exception 'no_payment';
  end if;
  if p.status = 'paid' then
    return 'already';
  end if;
  update re_payments
     set status = 'paid', paid_at = now(), transaction_id = p_transaction_id,
         asmachta = p_asmachta, direct_debit_id = p_direct_debit_id, raw = p_raw
   where id = p_payment;
  insert into re_profiles (id) values (p.user_id) on conflict (id) do nothing;
  if p.kind = 'subscription' then
    update re_profiles
       set plan = p.product,
           sub_status = 'active',
           current_period_end = now() + make_interval(days => p_period_days),
           plan_credits = p.credits,
           grow_direct_debit_id = p_direct_debit_id,
           grow_transaction_id = p_transaction_id,
           grow_transaction_token = p_transaction_token,
           grow_asmachta = p_asmachta,
           updated_at = now()
     where id = p.user_id;
    insert into re_credit_ledger (user_id, delta, bucket, reason, ref) values (p.user_id, p.credits, 'plan', 'subscription', p_payment::text);
  else
    update re_profiles set extra_credits = extra_credits + p.credits, updated_at = now() where id = p.user_id;
    insert into re_credit_ledger (user_id, delta, bucket, reason, ref) values (p.user_id, p.credits, 'extra', 'topup', p_payment::text);
  end if;
  return 'applied';
end;
$$;

-- Monthly renewal charged by Grow: reset plan credits, extend the period (idempotent per transaction).
create or replace function public.re_renew(
  p_user uuid,
  p_plan text,
  p_credits integer,
  p_amount numeric,
  p_transaction text,
  p_raw jsonb,
  p_period_days integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into re_payments (user_id, kind, product, amount, credits, status, transaction_id, raw, paid_at)
  values (p_user, 'renewal', p_plan, p_amount, p_credits, 'paid', p_transaction, p_raw, now())
  on conflict (transaction_id) do nothing;
  if not found then
    return 'already';
  end if;
  update re_profiles
     set sub_status = 'active',
         plan_credits = p_credits,
         current_period_end = greatest(coalesce(current_period_end, now()), now()) + make_interval(days => p_period_days),
         updated_at = now()
   where id = p_user;
  insert into re_credit_ledger (user_id, delta, bucket, reason, ref) values (p_user, p_credits, 'plan', 'renewal', p_transaction);
  return 'applied';
end;
$$;

revoke all on function public.re_spend_credits(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.re_refund_generation(uuid, text) from public, anon, authenticated;
revoke all on function public.re_apply_payment(uuid, text, text, text, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.re_renew(uuid, text, integer, numeric, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.re_spend_credits(uuid, integer, text) to service_role;
grant execute on function public.re_refund_generation(uuid, text) to service_role;
grant execute on function public.re_apply_payment(uuid, text, text, text, text, jsonb, integer) to service_role;
grant execute on function public.re_renew(uuid, text, integer, numeric, text, jsonb, integer) to service_role;
