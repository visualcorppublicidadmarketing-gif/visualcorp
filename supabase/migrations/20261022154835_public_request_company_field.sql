alter table public.public_requests
  add column if not exists company text not null default '' check (char_length(company) <= 200);
grant insert (company) on public.public_requests to anon;
