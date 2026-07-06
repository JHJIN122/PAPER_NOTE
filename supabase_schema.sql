-- Paper Notes: schema + Row Level Security
-- Run this once in Supabase Dashboard -> SQL Editor -> New query -> Run

create extension if not exists "pgcrypto";

create table if not exists papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  authors text[] not null default '{}',
  venue text,
  year int,
  project text,
  tags text[] not null default '{}',
  source_url text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  paper_id uuid not null references papers(id) on delete cascade,
  quote_text text not null,
  memo text,
  tags text[] not null default '{}',
  purpose text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists papers_user_id_idx on papers(user_id);
create index if not exists papers_title_idx on papers using gin (to_tsvector('simple', title));
create index if not exists papers_authors_idx on papers using gin (authors);
create index if not exists papers_tags_idx on papers using gin (tags);
create index if not exists quotes_user_id_idx on quotes(user_id);
create index if not exists quotes_paper_id_idx on quotes(paper_id);
create index if not exists quotes_tags_idx on quotes using gin (tags);
create index if not exists quotes_purpose_idx on quotes using gin (purpose);

alter table papers enable row level security;
alter table quotes enable row level security;

drop policy if exists "papers_owner_all" on papers;
create policy "papers_owner_all" on papers
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "quotes_owner_all" on quotes;
create policy "quotes_owner_all" on quotes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
