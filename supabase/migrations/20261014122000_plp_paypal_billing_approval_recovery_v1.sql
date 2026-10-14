-- PLP Enterprise Billing repair: stale approval recovery and documented PayPal buyer preferences.
-- This migration matches the production Vault-backed checkout/status functions.
-- Subscription activation remains provider-verified only.

CREATE OR REPLACE FUNCTION public.pandora_plp_billing_checkout_v1(p_organization_id uuid, p_actor uuid, p_plan_code text, p_idempotency_key text, p_return_url text, p_cancel_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_session public.pandora_paypal_billing_sessions%rowtype;
  v_other public.pandora_paypal_billing_sessions%rowtype;
  v_plan public.pandora_service_plans%rowtype;
  v_link public.pandora_paypal_plan_links%rowtype;
  v_reusing boolean := false;
  v_response jsonb;
  v_body jsonb;
  v_status int;
  v_approval text;
  v_sub_id text;
begin
  if p_organization_id is null then
    raise exception 'ORGANIZATION_REQUIRED' using errcode = '22023';
  end if;

  if p_actor is null then
    raise exception 'ACTOR_REQUIRED' using errcode = '22023';
  end if;

  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$' then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  if p_return_url is null or p_return_url !~ '^https://' or p_cancel_url is null or p_cancel_url !~ '^https://' then
    raise exception 'INVALID_RETURN_URL' using errcode = '22023';
  end if;

  -- Advisory lock serialises concurrent checkouts per organization
  perform pg_advisory_xact_lock(hashtextextended('plp-billing-checkout:' || p_organization_id::text, 0));

  -- Same key replay check
  select * into v_session
  from public.pandora_paypal_billing_sessions
  where organization_id = p_organization_id
    and idempotency_key = p_idempotency_key;

  if found then
    if v_session.status = 'approval_pending' and v_session.approval_url is not null and v_session.expires_at > now() then
      return jsonb_build_object(
        'replayed', true,
        'status', v_session.status,
        'approvalUrl', v_session.approval_url,
        'providerReference', v_session.paypal_subscription_id,
        'verified', false
      );
    elsif v_session.status in ('failed', 'created') then
      v_reusing := true;
    elsif v_session.status = 'approval_pending' and v_session.expires_at <= now() then
      -- Archive the stale provider attempt and free its key for a fresh provider request.
      -- A new session UUID is essential because PayPal deduplicates by PayPal-Request-Id.
      update public.pandora_paypal_billing_sessions
      set idempotency_key = left(v_session.idempotency_key, 87)
            || ':expired:' || replace(substr(v_session.id::text, 1, 36), '-', ''),
          status = 'expired',
          updated_at = now()
      where id = v_session.id;
      v_reusing := false;
    else
      -- active, cancelled, expired, etc.
      return jsonb_build_object(
        'replayed', true,
        'status', v_session.status,
        'approvalUrl', null,
        'providerReference', v_session.paypal_subscription_id,
        'verified', false
      );
    end if;
  end if;

  -- Active subscription check
  if exists (
    select 1 from public.pandora_customer_subscriptions
    where organization_id = p_organization_id
      and state in ('trial', 'active', 'past_due', 'suspended')
  ) then
    raise exception 'SUBSCRIPTION_ALREADY_ACTIVE' using errcode = '23505';
  end if;

  -- Cross-device dedupe
  if not v_reusing then
    select * into v_other
    from public.pandora_paypal_billing_sessions
    where organization_id = p_organization_id
      and status = 'approval_pending'
      and plan_code = p_plan_code
      and approval_url is not null
      and expires_at > now()
    order by created_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'replayed', true,
        'status', v_other.status,
        'approvalUrl', v_other.approval_url,
        'providerReference', v_other.paypal_subscription_id,
        'verified', false
      );
    end if;
  end if;

  -- Plan and provider link validation
  select * into v_plan
  from public.pandora_service_plans
  where code = p_plan_code and state = 'active';

  if not found or v_plan.monthly_fee_micros is null then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_link
  from public.pandora_paypal_plan_links
  where plan_id = v_plan.id and active;

  if not found or v_link.paypal_plan_id is null then
    raise exception 'PLAN_PROVIDER_LINK_REQUIRED' using errcode = 'P0002';
  end if;

  -- Insert or update session row
  if v_reusing then
    update public.pandora_paypal_billing_sessions
    set plan_id = v_plan.id,
        plan_code = p_plan_code,
        paypal_plan_id = v_link.paypal_plan_id,
        status = 'created',
        return_url = p_return_url,
        cancel_url = p_cancel_url,
        expires_at = now() + interval '3 hours',
        updated_at = now()
    where id = v_session.id
    returning * into v_session;
  else
    insert into public.pandora_paypal_billing_sessions (
      organization_id, requested_by, plan_id, plan_code, idempotency_key,
      paypal_plan_id, status, return_url, cancel_url, expires_at
    ) values (
      p_organization_id, p_actor, v_plan.id, p_plan_code, p_idempotency_key,
      v_link.paypal_plan_id, 'created', p_return_url, p_cancel_url, now() + interval '3 hours'
    )
    returning * into v_session;
  end if;

  -- PayPal API create subscription call
  v_response := private.pandora_paypal_billing_api_v1(
    'POST',
    '/v1/billing/subscriptions',
    jsonb_build_object(
      'plan_id', v_link.paypal_plan_id,
      'custom_id', v_session.id::text,
      'application_context', jsonb_build_object(
        'brand_name', 'PLP Enterprise',
        'locale', 'en-US',
        'shipping_preference', 'NO_SHIPPING',
        'user_action', 'SUBSCRIBE_NOW',
        'payment_method', jsonb_build_object(
          'payer_selected', 'PAYPAL',
          'payee_preferred', 'IMMEDIATE_PAYMENT_REQUIRED'
        ),
        'return_url', p_return_url,
        'cancel_url', p_cancel_url
      )
    ),
    v_session.id::text
  );

  v_status := coalesce((v_response->>'status')::int, 0);
  v_body := coalesce(v_response->'body', '{}'::jsonb);

  select link->>'href' into v_approval
  from jsonb_array_elements(coalesce(v_body->'links', '[]'::jsonb)) link
  where link->>'rel' = 'approve'
  limit 1;

  v_sub_id := nullif(v_body->>'id', '');

  if v_status not between 200 and 299
     or v_sub_id is null
     or v_approval is null
     or v_approval !~* '^https://([a-zA-Z0-9-]+\.)*paypal\.com([/:?#].*|$)$' then
    -- The whole attempt is rolled back on purpose so a retry with the same
    -- idempotency key starts clean and PayPal dedupes on paypal-request-id = session id.
    raise exception 'PAYPAL_CHECKOUT_FAILED' using errcode = 'P0001';
  end if;

  update public.pandora_paypal_billing_sessions
  set paypal_subscription_id = v_sub_id,
      approval_url = v_approval,
      status = 'approval_pending',
      updated_at = now()
  where id = v_session.id;

  return jsonb_build_object(
    'replayed', false,
    'status', 'approval_pending',
    'approvalUrl', v_approval,
    'providerReference', v_sub_id,
    'verified', false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.pandora_plp_billing_status_v1(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_subscription jsonb;
  v_plans jsonb;
  v_change jsonb;
  v_checkout jsonb;
  v_activity jsonb;
  v_configured boolean;
begin
  if p_organization_id is null then
    raise exception 'ORGANIZATION_REQUIRED' using errcode = '22023';
  end if;

  select (
    exists (
      select 1 from vault.decrypted_secrets
      where name = 'paypal_client_id' and nullif(btrim(decrypted_secret), '') is not null
    )
    and exists (
      select 1 from vault.decrypted_secrets
      where name = 'paypal_client_secret' and nullif(btrim(decrypted_secret), '') is not null
    )
  ) into v_configured;

  select jsonb_build_object(
    'plan_id', s.plan_id,
    'plan_code', p.code,
    'plan_name', p.name,
    'state', s.state,
    'currency', s.currency,
    'monthly_fee', private.pandora_plp_billing_money(s.monthly_fee_micros),
    'monthly_fee_micros', s.monthly_fee_micros,
    'setup_fee', private.pandora_plp_billing_money(s.setup_fee_micros),
    'setup_fee_micros', s.setup_fee_micros,
    'discount', private.pandora_plp_billing_money(s.discount_micros),
    'discount_micros', s.discount_micros,
    'net_monthly_fee', private.pandora_plp_billing_money(coalesce(s.monthly_fee_micros, 0) - s.discount_micros),
    'starts_on', s.starts_on,
    'ends_on', s.ends_on,
    'renews_on', s.renews_on,
    'source_kind', s.source_kind,
    'provider_reference', s.provider_reference,
    'verified_at', s.verified_at,
    'updated_at', s.updated_at,
    'verification_label', case
      when s.source_kind = 'provider_verified' and s.verified_at is not null then 'Verified'
      when s.provider_reference is not null then 'Reconciliation required'
      else 'Awaiting provider confirmation'
    end
  )
  into v_subscription
  from public.pandora_customer_subscriptions s
  join public.pandora_service_plans p on p.id = s.plan_id
  where s.organization_id = p_organization_id;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.monthly_fee_micros nulls last, x.code), '[]'::jsonb)
  into v_plans
  from (
    select
      p.id as plan_id,
      p.code,
      p.name,
      p.currency,
      private.pandora_plp_billing_money(p.monthly_fee_micros) as monthly_fee,
      p.monthly_fee_micros,
      l.paypal_plan_id is not null and l.active as provider_linked
    from public.pandora_service_plans p
    left join public.pandora_paypal_plan_links l on l.plan_id = p.id and l.active
    where p.state = 'active'
  ) x;

  select jsonb_build_object(
    'id', c.id,
    'from_plan_code', c.from_plan_code,
    'to_plan_code', c.to_plan_code,
    'provider_subscription', c.paypal_subscription_id,
    'status', c.status,
    'approval_url', c.approval_url,
    'provider_reference', c.provider_reference,
    'error_message', c.error_message,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'completed_at', c.completed_at,
    'trust', case
      when c.status in ('provider_verified', 'completed') then 'provider'
      when c.status = 'approval_pending' then 'pending_action'
      when c.status = 'failed' then 'failed'
      else 'local_request'
    end
  )
  into v_change
  from public.pandora_paypal_plan_change_sessions c
  where c.organization_id = p_organization_id
  order by c.created_at desc
  limit 1;

  select jsonb_build_object(
    'id', b.id,
    'plan_code', b.plan_code,
    'status', case
      when b.status = 'approval_pending' and b.expires_at <= now() then 'expired'
      else b.status
    end,
    'provider_reference', b.paypal_subscription_id,
    'approval_url', case
      when b.status = 'approval_pending' and b.expires_at <= now() then null
      else b.approval_url
    end,
    'expires_at', b.expires_at,
    'created_at', b.created_at,
    'updated_at', b.updated_at,
    'trust', case
      when b.status in ('provider_verified', 'completed', 'active') then 'provider'
      when b.status = 'approval_pending' and b.expires_at <= now() then 'expired'
      when b.status = 'approval_pending' then 'pending_action'
      when b.status = 'failed' then 'failed'
      else 'local_request'
    end
  )
  into v_checkout
  from public.pandora_paypal_billing_sessions b
  where b.organization_id = p_organization_id
  order by b.created_at desc
  limit 1;

  select coalesce(jsonb_agg(item order by item->>'occurred_at' desc), '[]'::jsonb)
  into v_activity
  from (
    select jsonb_build_object(
      'kind', 'payment',
      'trust', case when pay.source_kind = 'provider_verified' then 'provider' else 'local_request' end,
      'title', case pay.payment_kind when 'refund' then 'Refund recorded' else 'Payment recorded' end,
      'detail', pay.reference,
      'occurred_at', pay.occurred_on,
      'verified_at', pay.verified_at,
      'amount', private.pandora_plp_billing_money(pay.amount_micros),
      'currency', pay.currency
    ) as item
    from public.pandora_customer_payments pay
    where pay.organization_id = p_organization_id
    union all
    select jsonb_build_object(
      'kind', 'webhook',
      'trust', 'provider',
      'title', w.event_type,
      'detail', coalesce(w.paypal_subscription_id, w.resource_id, w.provider_event_id),
      'occurred_at', w.received_at,
      'verified_at', w.processed_at,
      'provider_reference', w.paypal_subscription_id
    )
    from public.pandora_paypal_billing_webhook_events w
    where w.organization_id = p_organization_id
    union all
    select jsonb_build_object(
      'kind', 'plan_change',
      'trust', case when c.status in ('provider_verified', 'completed') then 'provider' else 'local_request' end,
      'title', 'Plan change ' || c.status,
      'detail', c.from_plan_code || ' → ' || c.to_plan_code,
      'occurred_at', c.updated_at,
      'verified_at', case when c.status in ('provider_verified', 'completed') then c.completed_at else null end,
      'status', c.status
    )
    from public.pandora_paypal_plan_change_sessions c
    where c.organization_id = p_organization_id
    union all
    select jsonb_build_object(
      'kind', 'checkout',
      'trust', case when b.status in ('provider_verified', 'completed', 'active') then 'provider' else 'local_request' end,
      'title', 'Checkout ' || b.status,
      'detail', coalesce(p.name, b.plan_code),
      'occurred_at', b.updated_at,
      'verified_at', case when b.status in ('provider_verified', 'completed', 'active') then b.updated_at else null end,
      'status', b.status
    )
    from public.pandora_paypal_billing_sessions b
    left join public.pandora_service_plans p on p.id = b.plan_id
    where b.organization_id = p_organization_id
  ) events
  limit 12;

  return jsonb_build_object(
    'provider', jsonb_build_object(
      'name', 'paypal',
      'configured', coalesce(v_configured, false),
      'label', case when coalesce(v_configured, false) then 'PayPal' else 'Provider state unavailable' end
    ),
    'subscription', v_subscription,
    'plans', v_plans,
    'pendingPlanChange', v_change,
    'checkout', v_checkout,
    'activity', coalesce(v_activity, '[]'::jsonb)
  );
end;
$function$;
