begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text, avatar_url text, organization_name text, bio text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.categories (
 id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
 description text, icon_name text, display_order integer
);
create table public.campaigns (
 id uuid primary key default gen_random_uuid(), creator_id uuid references public.profiles(id),
 category_id uuid references public.categories(id), slug text not null unique, title text not null check(length(trim(title))>0), summary text,
 creator_display_name text, website_id text unique, source_page_url text, data_origin text not null default 'user' check(data_origin in ('user','website','website_demo','generated_demo')),
 is_featured boolean not null default false, cover_asset_id uuid,
 funding_goal_minor bigint check(funding_goal_minor>0 and funding_goal_minor<=9007199254740991),
 amount_raised_minor bigint check(amount_raised_minor>=0 and amount_raised_minor<=9007199254740991),
 currency text check(currency ~ '^[A-Z]{3}$'),
 estimated_reach_min bigint check(estimated_reach_min>=0), estimated_reach_max bigint check(estimated_reach_max>=0 and (estimated_reach_min is null or estimated_reach_max>=estimated_reach_min)),
 estimated_reach_point bigint check(estimated_reach_point>=0),
 duration_days integer check(duration_days>0),
 status text not null default 'draft' check(status in ('draft','submitted','in_review','changes_requested','approved','active','completed','rejected','cancelled')),
 published_at timestamptz, deadline_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(),
 check(deadline_at is null or published_at is null or deadline_at>=published_at)
);
create table public.campaign_assets (
 id uuid primary key default gen_random_uuid(), campaign_id uuid references public.campaigns(id) on delete cascade,
 asset_type text not null check(asset_type in ('image','video','svg','icon')), asset_role text not null,
 original_url text not null, storage_bucket text, storage_path text, mime_type text, width integer check(width>0), height integer check(height>0), duration_seconds numeric check(duration_seconds>=0), credit text, created_at timestamptz default now(),
 unique(id,campaign_id), unique(storage_bucket,storage_path), check((storage_bucket is null)=(storage_path is null))
);
alter table public.campaigns add constraint cover_same_campaign foreign key(cover_asset_id,id) references public.campaign_assets(id,campaign_id) deferrable initially deferred;
create table public.campaign_drafts (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
 creator_id uuid not null references public.profiles(id), current_step integer not null default 0 check(current_step>=0), draft_data jsonb not null default '{}' check(jsonb_typeof(draft_data)='object'), last_saved_at timestamptz not null default now()
);
create table public.campaign_story_sections (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
 section_type text not null check(section_type in ('text','html','image','video','statistic')), heading text, body text, asset_id uuid, caption text, image_credit text, display_order integer not null check(display_order>=0),
 foreign key(asset_id,campaign_id) references public.campaign_assets(id,campaign_id), unique(campaign_id,display_order)
);
create table public.campaign_sources (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
 title text, url text not null check(url ~ '^https?://'), description text, display_order integer not null check(display_order>=0), unique(campaign_id,url)
);
create table public.campaign_targeting (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
 locations text[] not null default '{}', interests text[] not null default '{}', audience_characteristics text[] not null default '{}', distribution_channels text[] not null default '{}',
 budget_allocation jsonb check(budget_allocation is null or jsonb_typeof(budget_allocation)='object'), duration_days integer check(duration_days>0), created_at timestamptz default now(), updated_at timestamptz default now()
);
create table private.reviewer_memberships(user_id uuid primary key references auth.users(id) on delete cascade);
create table public.campaign_reviews (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id), reviewer_id uuid not null references public.profiles(id),
 decision text not null check(decision in ('approved','changes_requested','rejected')), feedback text, reviewed_at timestamptz not null default now()
);
create table public.contributions (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id), backer_id uuid references public.profiles(id),
 contribution_amount_minor bigint not null check(contribution_amount_minor>0 and contribution_amount_minor<=9007199254740991), fee_amount_minor bigint not null default 0 check(fee_amount_minor>=0), total_amount_minor bigint not null check(total_amount_minor<=9007199254740991),
 currency text not null check(currency ~ '^[A-Z]{3}$'), payment_status text not null default 'pending' check(payment_status in ('pending','succeeded','failed','refunded')),
 payment_reference text unique, is_anonymous boolean not null default false, is_simulated boolean not null default true, created_at timestamptz not null default now(),
 check(total_amount_minor::numeric=contribution_amount_minor::numeric+fee_amount_minor::numeric)
);
create table private.guest_receipts (
 contribution_id uuid primary key references public.contributions(id) on delete cascade,
 token_sha256 text not null unique check(token_sha256 ~ '^[a-f0-9]{64}$'), expires_at timestamptz not null,
 receipt_email text
);
create table private.payment_events (
 id uuid primary key default gen_random_uuid(), contribution_id uuid not null references public.contributions(id), provider_event_id text not null unique,
 event_type text not null, received_at timestamptz not null default now()
);
create table public.campaign_follows(id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), unique(campaign_id,user_id));
create table public.saved_campaigns(id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), unique(campaign_id,user_id));
create table public.campaign_updates(id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade, title text not null, content text not null, update_type text not null check(update_type in ('progress','announcement','distribution')), created_at timestamptz default now());
create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, campaign_id uuid references public.campaigns(id) on delete cascade, title text not null, message text not null, notification_type text not null, is_read boolean not null default false, created_at timestamptz not null default now());
create table public.distribution_reports (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id),
 budget_allocated_minor bigint check(budget_allocated_minor>=0), advertising_spend_minor bigint check(advertising_spend_minor>=0), currency text check(currency ~ '^[A-Z]{3}$'),
 impressions bigint check(impressions>=0), estimated_reach bigint check(estimated_reach>=0), measured_reach bigint check(measured_reach>=0), clicks bigint check(clicks>=0),
 reporting_start timestamptz, reporting_end timestamptz, report_status text not null check(report_status in ('draft','published')), metric_basis text not null check(metric_basis in ('measured','estimated','simulated')), created_at timestamptz default now(),
 check(reporting_end>=reporting_start), check(metric_basis='measured' or (measured_reach is null and impressions is null and clicks is null))
);
create table public.campaign_status_history(id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.campaigns(id) on delete cascade, from_status text, to_status text not null, actor_id uuid references auth.users(id), created_at timestamptz not null default now());
create table public.advertising_creatives(id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.campaigns(id) on delete cascade,asset_id uuid,headline text,primary_text text,distribution_channel text, foreign key(asset_id,campaign_id) references public.campaign_assets(id,campaign_id));
create index campaigns_status_category on public.campaigns(status,category_id);
create index campaigns_creator on public.campaigns(creator_id);
create index campaigns_search on public.campaigns using gin(to_tsvector('english',coalesce(title,'')||' '||coalesce(summary,'')));
create index contributions_backer on public.contributions(backer_id);
create index notifications_user_unread on public.notifications(user_id,is_read);
create index follows_user on public.campaign_follows(user_id);
create index saved_user on public.saved_campaigns(user_id);
create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now();return new;end $$;
create trigger campaign_touch before update on public.campaigns for each row execute function private.touch_updated_at();
create trigger profile_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger targeting_touch before update on public.campaign_targeting for each row execute function private.touch_updated_at();
create function private.enforce_lifecycle() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status=old.status then return new; end if;
 if not ((old.status in ('draft','changes_requested') and new.status in ('submitted','cancelled'))
 or (old.status='submitted' and new.status in ('in_review','approved','changes_requested','rejected','cancelled'))
 or (old.status='in_review' and new.status in ('approved','changes_requested','rejected','cancelled'))
 or (old.status='approved' and new.status in ('active','cancelled'))
 or (old.status='active' and new.status in ('completed','cancelled'))) then raise exception 'Invalid campaign status transition: % -> %',old.status,new.status; end if;
 return new;
end $$;
create trigger lifecycle_guard before update of status on public.campaigns for each row execute function private.enforce_lifecycle();
create function private.audit_status() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status then insert into public.campaign_status_history(campaign_id,from_status,to_status,actor_id) values(new.id,old.status,new.status,auth.uid());end if;
 return new;
end $$;
create trigger status_audit after update of status on public.campaigns for each row execute function private.audit_status();
-- Index child foreign keys used by RLS and detail retrieval.
do $$ declare t text; begin foreach t in array array['campaign_assets','campaign_story_sections','campaign_sources','campaign_reviews','contributions','campaign_updates','distribution_reports','campaign_status_history','advertising_creatives'] loop execute format('create index %I on public.%I(campaign_id)',t||'_campaign',t); end loop; end $$;
commit;
