begin;
-- Apply together with schema.sql before exposing the API. Explicit grants remove Supabase defaults.
do $$ declare t text; begin
 foreach t in array array['profiles','categories','campaigns','campaign_drafts','campaign_story_sections','campaign_sources','campaign_assets','campaign_targeting','campaign_reviews','contributions','campaign_follows','saved_campaigns','campaign_updates','notifications','distribution_reports','campaign_status_history','advertising_creatives'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create function private.is_reviewer() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from private.reviewer_memberships where user_id=auth.uid()) $$;
grant usage on schema private to authenticated;
grant execute on function private.is_reviewer() to authenticated;
create function public.can_read_campaign(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.campaigns c where c.id=p_id and (c.status in ('approved','active','completed') or c.creator_id=auth.uid() or (private.is_reviewer() and c.status in ('submitted','in_review'))));
$$;
create policy campaign_read on public.campaigns for select using(public.can_read_campaign(id));
grant select on public.campaigns,public.categories to anon,authenticated;
create policy category_read on public.categories for select using(true);
-- Clients can edit content only before submission. Totals, ownership, status and approval metadata have no client grants.
grant update(title,summary,category_id,duration_days,funding_goal_minor,currency) on public.campaigns to authenticated;
create policy creator_edit on public.campaigns for update to authenticated using(creator_id=auth.uid() and status in ('draft','changes_requested')) with check(creator_id=auth.uid() and status in ('draft','changes_requested'));
create policy profile_self_read on public.profiles for select to authenticated using(id=auth.uid());
create policy profile_self_create on public.profiles for insert to authenticated with check(id=auth.uid());
create policy profile_self_edit on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
grant select,insert on public.profiles to authenticated;
grant update(display_name,avatar_url,organization_name,bio) on public.profiles to authenticated;
create policy draft_owner on public.campaign_drafts for all to authenticated using(creator_id=auth.uid() and exists(select 1 from public.campaigns c where c.id=campaign_id and c.creator_id=auth.uid() and c.status in ('draft','changes_requested'))) with check(creator_id=auth.uid() and exists(select 1 from public.campaigns c where c.id=campaign_id and c.creator_id=auth.uid() and c.status in ('draft','changes_requested')));
grant select,delete on public.campaign_drafts to authenticated;
grant update(current_step,draft_data,last_saved_at) on public.campaign_drafts to authenticated;
do $$ declare t text; begin foreach t in array array['campaign_story_sections','campaign_sources','campaign_assets','campaign_targeting','campaign_updates','advertising_creatives'] loop
 execute format('grant select on public.%I to anon,authenticated',t);
 execute format('create policy content_read on public.%I for select using(public.can_read_campaign(campaign_id))',t);
 end loop; end $$;
create policy published_report on public.distribution_reports for select using(report_status='published' and public.can_read_campaign(campaign_id));
create policy branding_asset_read on public.campaign_assets for select using(campaign_id is null);
grant select on public.distribution_reports to anon,authenticated;
create policy reviews_private on public.campaign_reviews for select to authenticated using(private.is_reviewer() or exists(select 1 from public.campaigns c where c.id=campaign_id and c.creator_id=auth.uid()));
create policy history_private on public.campaign_status_history for select to authenticated using(private.is_reviewer() or exists(select 1 from public.campaigns c where c.id=campaign_id and c.creator_id=auth.uid()));
grant select on public.campaign_reviews,public.campaign_status_history to authenticated;
create policy own_contribution on public.contributions for select to authenticated using(backer_id=auth.uid());
-- Even a backer cannot select provider references directly. No public contribution endpoint.
grant select(id,campaign_id,backer_id,contribution_amount_minor,fee_amount_minor,total_amount_minor,currency,payment_status,is_anonymous,is_simulated,created_at) on public.contributions to authenticated;
do $$ declare t text; begin foreach t in array array['campaign_follows','saved_campaigns'] loop
 execute format('grant select,insert,delete on public.%I to authenticated',t);
 execute format('create policy own_read on public.%I for select to authenticated using(user_id=auth.uid())',t);
 execute format('create policy own_insert on public.%I for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.campaigns c where c.id=campaign_id and c.status in (''approved'',''active'',''completed'')))',t);
 execute format('create policy own_delete on public.%I for delete to authenticated using(user_id=auth.uid())',t);
 end loop; end $$;
create policy own_notification on public.notifications for select to authenticated using(user_id=auth.uid());
create policy mark_notification on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select on public.notifications to authenticated;
grant update(is_read) on public.notifications to authenticated;
create function public.create_campaign_draft(p_title text, p_category_id uuid default null) returns public.campaign_drafts
language plpgsql security definer set search_path='' as $$
declare cid uuid:=gen_random_uuid(); result public.campaign_drafts;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into public.profiles(id) values(auth.uid()) on conflict do nothing;
 insert into public.campaigns(id,creator_id,category_id,slug,title,amount_raised_minor) values(cid,auth.uid(),p_category_id,'draft-'||cid::text,p_title,0);
 insert into public.campaign_drafts(campaign_id,creator_id) values(cid,auth.uid()) returning * into result;
 return result;
end $$;
-- Submission copies only supported wizard fields into relational content, atomically, before locking edits.
create function public.submit_campaign(p_campaign_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.campaigns; d jsonb; item jsonb; i integer:=0;
begin
 select * into c from public.campaigns where id=p_campaign_id for update;
 if c.creator_id is distinct from auth.uid() or c.status not in ('draft','changes_requested') then raise exception 'Not an editable owned draft'; end if;
 select draft_data into d from public.campaign_drafts where campaign_id=c.id;
 if length(trim(coalesce(d->>'story','')))=0 or c.funding_goal_minor is null or c.currency is null or c.category_id is null then raise exception 'Story, category, currency and funding goal required'; end if;
 delete from public.campaign_story_sections where campaign_id=c.id;
 insert into public.campaign_story_sections(campaign_id,section_type,body,display_order) values(c.id,'text',d->>'story',0);
 delete from public.campaign_sources where campaign_id=c.id;
 for item in select * from jsonb_array_elements(coalesce(d->'sources','[]')) loop
 insert into public.campaign_sources(campaign_id,title,url,display_order) values(c.id,item->>'title',item->>'url',i); i:=i+1;
 end loop;
 update public.campaigns set status='submitted',updated_at=now() where id=c.id;
end $$;
create function public.review_campaign(p_campaign_id uuid,p_decision text,p_feedback text default null) returns void language plpgsql security definer set search_path='' as $$
declare c public.campaigns;
begin
 if not private.is_reviewer() then raise exception 'Reviewer access required'; end if;
 if p_decision not in ('approved','changes_requested','rejected') then raise exception 'Invalid decision'; end if;
 select * into c from public.campaigns where id=p_campaign_id for update;
 if c.id is null or c.status not in ('submitted','in_review') or c.creator_id=auth.uid() then raise exception 'Campaign is not eligible for this reviewer'; end if;
 insert into public.campaign_reviews(campaign_id,reviewer_id,decision,feedback) values(c.id,auth.uid(),p_decision,p_feedback);
 update public.campaigns set status=p_decision,published_at=case when p_decision='approved' then now() else published_at end,updated_at=now() where id=c.id;
end $$;
-- Trusted local/server-only simulation. A unique event and a row lock make retries idempotent.
create function public.complete_simulated_payment(p_contribution_id uuid,p_event_id text) returns void language plpgsql security definer set search_path='' as $$
declare b public.contributions; c public.campaigns;
begin
 select * into b from public.contributions where id=p_contribution_id for update;
 if b.id is null or not b.is_simulated then raise exception 'Simulation contribution required'; end if;
 if exists(select 1 from private.payment_events where provider_event_id=p_event_id and contribution_id<>b.id) then raise exception 'Event belongs to another contribution'; end if;
 if b.payment_status='succeeded' then return; end if;
 if b.payment_status<>'pending' then raise exception 'Not pending'; end if;
 select * into c from public.campaigns where id=b.campaign_id for update;
 if c.status not in ('approved','active') or c.currency is distinct from b.currency or (c.deadline_at is not null and c.deadline_at<=now()) then raise exception 'Campaign unavailable or currency mismatch'; end if;
 if c.data_origin not in ('website_demo','generated_demo') then raise exception 'Simulated payments require a demo campaign'; end if;
 insert into private.payment_events(contribution_id,provider_event_id,event_type) values(b.id,p_event_id,'simulated_success');
 update public.contributions set payment_status='succeeded' where id=b.id;
 update public.campaigns set amount_raised_minor=coalesce(amount_raised_minor,0)+b.contribution_amount_minor,updated_at=now() where id=c.id;
end $$;
-- Guest receipt access occurs behind a trusted, rate-limited server. Token generated with >=32 random bytes;
-- store only SHA-256, never tokens in datasets/logs. Server returns this allowlist, never payment_reference/email.
create function public.get_guest_receipt(p_token_sha256 text) returns table(id uuid,campaign_id uuid,total_amount_minor bigint,currency text,payment_status text,is_simulated boolean)
language sql stable security definer set search_path='' as $$
 select c.id,c.campaign_id,c.total_amount_minor,c.currency,c.payment_status,c.is_simulated from private.guest_receipts r join public.contributions c on c.id=r.contribution_id where r.token_sha256=p_token_sha256 and r.expires_at>now() and c.backer_id is null;
$$;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_reviewer() to authenticated;
revoke all on function public.can_read_campaign(uuid), public.create_campaign_draft(text,uuid),public.submit_campaign(uuid),public.review_campaign(uuid,text,text),public.complete_simulated_payment(uuid,text),public.get_guest_receipt(text) from public,anon,authenticated;
grant execute on function public.can_read_campaign(uuid) to anon,authenticated;
grant execute on function public.create_campaign_draft(text,uuid),public.submit_campaign(uuid),public.review_campaign(uuid,text,text) to authenticated;
grant execute on function public.complete_simulated_payment(uuid,text),public.get_guest_receipt(text) to service_role;
grant usage on schema private to service_role;
revoke all on all tables in schema private from public,anon,authenticated;
grant all on all tables in schema private to service_role;
-- Private bucket: signed URLs are subject to the same campaign visibility as SQL data.
create policy campaign_media_read on storage.objects for select to anon,authenticated using(
 bucket_id='campaign-media' and exists(select 1 from public.campaign_assets a where a.storage_bucket=bucket_id and a.storage_path=name and (a.campaign_id is null or public.can_read_campaign(a.campaign_id)))
);
commit;
