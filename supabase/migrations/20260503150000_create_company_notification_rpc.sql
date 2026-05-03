-- RPC to insert notifications (bypasses client RLS on direct INSERT).
-- Caller must be p_actor_user_id and both actor and recipient must be company_members of p_company_id.

create or replace function public.create_company_notification(
  p_company_id uuid,
  p_recipient_user_id uuid,
  p_actor_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_project_id text,
  p_project_name text,
  p_cost_centre text,
  p_related_timesheet_id uuid,
  p_related_folder text,
  p_item_count integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor_user_id then
    raise exception 'invalid actor';
  end if;

  if not exists (
    select 1 from public.company_members cm
    where cm.company_id = p_company_id and cm.user_id = p_actor_user_id
  ) then
    raise exception 'actor not in company';
  end if;

  if not exists (
    select 1 from public.company_members cm
    where cm.company_id = p_company_id and cm.user_id = p_recipient_user_id
  ) then
    raise exception 'recipient not in company';
  end if;

  insert into public.notifications (
    company_id,
    recipient_user_id,
    actor_user_id,
    type,
    title,
    message,
    read_at,
    project_id,
    project_name,
    cost_centre,
    related_timesheet_id,
    related_folder,
    item_count
  ) values (
    p_company_id,
    p_recipient_user_id,
    p_actor_user_id,
    p_type,
    p_title,
    p_message,
    null,
    p_project_id,
    p_project_name,
    p_cost_centre,
    p_related_timesheet_id,
    p_related_folder,
    p_item_count
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function public.create_company_notification(
  uuid, uuid, uuid, text, text, text, text, text, text, uuid, text, integer
) FROM PUBLIC;

grant execute on function public.create_company_notification(
  uuid, uuid, uuid, text, text, text, text, text, text, uuid, text, integer
) to authenticated;
