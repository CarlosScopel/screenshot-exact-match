-- A ORDEM: mentorship terms, receivables and private payment evidence.
-- Apply once through the authorized database administration connection, after QA.
-- Does not create plans, confirm payments or change any existing member's access.
BEGIN;
CREATE TABLE public.mentorship_plans (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 start_date date NOT NULL, end_date date NOT NULL, duration_count integer NOT NULL CHECK(duration_count BETWEEN 1 AND 120),
 duration_unit text NOT NULL CHECK(duration_unit IN ('months','years')),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 total_cents integer NOT NULL CHECK(total_cents BETWEEN 1 AND 1000000000),
 installment_count integer NOT NULL CHECK(installment_count BETWEEN 1 AND 60), first_due_date date NOT NULL,
 revision integer NOT NULL DEFAULT 1, created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date>start_date), CHECK(total_cents>=installment_count)
);
CREATE INDEX mentorship_plans_user ON public.mentorship_plans(user_id,starts_at);
CREATE TABLE public.mentorship_installments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES public.mentorship_plans(id) ON DELETE RESTRICT,
 number integer NOT NULL CHECK(number BETWEEN 1 AND 60), amount_cents integer NOT NULL CHECK(amount_cents>0),
 due_date date NOT NULL, paid_at timestamptz, paid_on date, confirmed_by uuid REFERENCES auth.users(id),
 payment_note text NOT NULL DEFAULT '' CHECK(length(payment_note)<=500),
 UNIQUE(plan_id,number), CHECK((paid_at IS NULL AND paid_on IS NULL AND confirmed_by IS NULL) OR (paid_at IS NOT NULL AND paid_on IS NOT NULL AND confirmed_by IS NOT NULL))
);
CREATE TABLE public.mentorship_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), installment_id uuid NOT NULL REFERENCES public.mentorship_installments(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 file_path text NOT NULL UNIQUE, file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 180),
 paid_on date NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 review_note text NOT NULL DEFAULT '' CHECK(length(review_note)<=500), reviewed_by uuid REFERENCES auth.users(id), reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (status<>'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX mentorship_one_pending_receipt ON public.mentorship_receipts(installment_id) WHERE status='pending';
CREATE INDEX mentorship_receipts_user ON public.mentorship_receipts(user_id);
ALTER TABLE public.mentorship_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentorship_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentorship_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mentorship_plans,public.mentorship_installments,public.mentorship_receipts FROM anon,authenticated;
GRANT SELECT ON public.mentorship_plans,public.mentorship_installments,public.mentorship_receipts TO authenticated;
GRANT ALL ON public.mentorship_plans,public.mentorship_installments,public.mentorship_receipts TO service_role;
CREATE POLICY mentorship_plans_read ON public.mentorship_plans FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY mentorship_installments_read ON public.mentorship_installments FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.mentorship_plans p WHERE p.id=plan_id AND (p.user_id=auth.uid() OR public.is_admin(auth.uid()))));
CREATE POLICY mentorship_receipts_read ON public.mentorship_receipts FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_admin(auth.uid()));

-- Existing course, lesson and materials policies already call this function.
-- Legacy members with no plan retain the exact previous behavior.
CREATE OR REPLACE FUNCTION public.is_active_member(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=_user_id AND p.status='active'
 AND (p.access_expires_at IS NULL OR p.access_expires_at>now())
 AND (NOT EXISTS(SELECT 1 FROM public.mentorship_plans m WHERE m.user_id=_user_id)
 OR EXISTS(SELECT 1 FROM public.mentorship_plans m WHERE m.user_id=_user_id AND m.starts_at<=now() AND m.ends_at>now())))
$$;

CREATE FUNCTION public.mentorship_account(p_user_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=coalesce(p_user_id,auth.uid()); result jsonb;
BEGIN
 IF auth.uid() IS NULL OR (u<>auth.uid() AND NOT public.is_admin(auth.uid())) THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('server_now',now(),'user_id',u,'status',p.status,'legacy_expires_at',p.access_expires_at,'has_access',public.is_active_member(u),
 'plans',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.starts_at DESC) FROM public.mentorship_plans m WHERE m.user_id=u),'[]'::jsonb),
 'installments',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.due_date,i.number) FROM public.mentorship_installments i JOIN public.mentorship_plans m ON m.id=i.plan_id WHERE m.user_id=u),'[]'::jsonb),
 'receipts',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC) FROM public.mentorship_receipts r WHERE r.user_id=u),'[]'::jsonb)) INTO result
 FROM public.profiles p WHERE p.id=u;
 IF result IS NULL THEN RAISE EXCEPTION 'Mentorado não encontrado.'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.mentorship_save_plan(p_id uuid,p_user_id uuid,p_start_date date,p_duration_count integer,p_duration_unit text,p_total_cents integer,p_installment_count integer,p_first_due_date date,p_expected_revision integer DEFAULT 0) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.mentorship_plans%ROWTYPE; months integer; finish date; n integer; financial_change boolean; is_new boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Apenas administradores podem definir planos.' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_start_date IS NULL OR p_first_due_date IS NULL OR p_duration_count IS NULL OR p_duration_unit IS NULL OR p_total_cents IS NULL OR p_installment_count IS NULL OR p_expected_revision IS NULL THEN RAISE EXCEPTION 'Preencha todos os dados do plano.'; END IF;
 IF p_duration_unit NOT IN ('months','years') OR p_duration_count<1 OR p_duration_count>CASE WHEN p_duration_unit='years' THEN 10 ELSE 120 END OR p_total_cents NOT BETWEEN 1 AND 1000000000 OR p_installment_count NOT BETWEEN 1 AND 60 OR p_total_cents<p_installment_count OR p_start_date NOT BETWEEN DATE '2000-01-01' AND DATE '2100-01-01' OR p_first_due_date NOT BETWEEN DATE '2000-01-01' AND DATE '2100-01-01' THEN RAISE EXCEPTION 'Dados do plano inválidos.'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mentorado não encontrado.'; END IF;
 months:=p_duration_count*CASE WHEN p_duration_unit='years' THEN 12 ELSE 1 END;
 finish:=(p_start_date+make_interval(months=>months))::date;
 SELECT * INTO old FROM public.mentorship_plans WHERE id=p_id FOR UPDATE;
 is_new:=NOT FOUND;
 IF (is_new AND p_expected_revision<>0) OR (NOT is_new AND (old.user_id<>p_user_id OR old.revision<>p_expected_revision)) THEN RAISE EXCEPTION 'Este plano foi alterado. Atualize a página antes de salvar.'; END IF;
 IF EXISTS(SELECT 1 FROM public.mentorship_plans m WHERE m.user_id=p_user_id AND m.id<>p_id AND m.start_date<finish AND m.end_date>p_start_date) THEN RAISE EXCEPTION 'O período se sobrepõe a outro plano. Inicie a renovação no vencimento do plano anterior.'; END IF;
 financial_change:=is_new OR old.total_cents<>p_total_cents OR old.installment_count<>p_installment_count OR old.first_due_date<>p_first_due_date;
 IF NOT is_new AND financial_change AND EXISTS(SELECT 1 FROM public.mentorship_installments i WHERE i.plan_id=p_id AND (i.paid_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.mentorship_receipts r WHERE r.installment_id=i.id))) THEN RAISE EXCEPTION 'Valores e parcelas com pagamentos ou comprovantes não podem ser reescritos. O histórico deve ser preservado.'; END IF;
 IF is_new THEN
 INSERT INTO public.mentorship_plans(id,user_id,start_date,end_date,duration_count,duration_unit,starts_at,ends_at,total_cents,installment_count,first_due_date,created_by)
 VALUES(p_id,p_user_id,p_start_date,finish,p_duration_count,p_duration_unit,p_start_date::timestamp AT TIME ZONE 'America/Sao_Paulo',finish::timestamp AT TIME ZONE 'America/Sao_Paulo',p_total_cents,p_installment_count,p_first_due_date,auth.uid());
 ELSE
 UPDATE public.mentorship_plans SET start_date=p_start_date,end_date=finish,duration_count=p_duration_count,duration_unit=p_duration_unit,starts_at=p_start_date::timestamp AT TIME ZONE 'America/Sao_Paulo',ends_at=finish::timestamp AT TIME ZONE 'America/Sao_Paulo',total_cents=p_total_cents,installment_count=p_installment_count,first_due_date=p_first_due_date,revision=revision+1,updated_at=now() WHERE id=p_id;
 END IF;
 IF financial_change THEN
 DELETE FROM public.mentorship_installments WHERE plan_id=p_id;
 FOR n IN 1..p_installment_count LOOP
 INSERT INTO public.mentorship_installments(plan_id,number,amount_cents,due_date) VALUES(p_id,n,p_total_cents/p_installment_count+CASE WHEN n<=p_total_cents%p_installment_count THEN 1 ELSE 0 END,(p_first_due_date+make_interval(months=>n-1))::date);
 END LOOP;
 END IF;
 -- Never unsuspend, approve an admission, or alter course grants while saving a plan.
 UPDATE public.profiles SET access_expires_at=(SELECT max(ends_at) FROM public.mentorship_plans WHERE user_id=p_user_id) WHERE id=p_user_id;
 RETURN p_id;
END $$;

CREATE FUNCTION public.mentorship_confirm_payment(p_installment_id uuid,p_paid_on date,p_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.mentorship_installments%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Apenas administradores confirmam pagamentos.' USING ERRCODE='42501'; END IF;
 IF p_paid_on IS NULL OR p_paid_on>(now() AT TIME ZONE 'America/Sao_Paulo')::date OR p_paid_on<DATE '2000-01-01' OR length(coalesce(p_note,''))>500 THEN RAISE EXCEPTION 'Data ou observação inválida.'; END IF;
 SELECT * INTO item FROM public.mentorship_installments WHERE id=p_installment_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;
 IF item.paid_at IS NOT NULL THEN RAISE EXCEPTION 'Esta parcela já foi confirmada.'; END IF;
 IF EXISTS(SELECT 1 FROM public.mentorship_receipts WHERE installment_id=item.id AND status='pending') THEN RAISE EXCEPTION 'Analise o comprovante pendente desta parcela.'; END IF;
 UPDATE public.mentorship_installments SET paid_at=now(),paid_on=p_paid_on,confirmed_by=auth.uid(),payment_note=coalesce(p_note,'') WHERE id=item.id;
END $$;

CREATE FUNCTION public.mentorship_register_receipt(p_installment_id uuid,p_path text,p_file_name text,p_paid_on date) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.mentorship_installments%ROWTYPE; owner uuid; new_id uuid; bytes bigint;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM public.mentorship_installments WHERE id=p_installment_id FOR UPDATE;
 SELECT user_id INTO owner FROM public.mentorship_plans WHERE id=item.plan_id;
 IF owner IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Parcela não autorizada.' USING ERRCODE='42501'; END IF;
 IF item.paid_at IS NOT NULL THEN RAISE EXCEPTION 'Parcela já quitada.'; END IF;
 IF p_path IS NULL OR p_path !~ ('^'||owner::text||'/'||item.id::text||'/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg)$') OR length(coalesce(p_file_name,'')) NOT BETWEEN 1 AND 180 OR p_paid_on IS NULL OR p_paid_on>(now() AT TIME ZONE 'America/Sao_Paulo')::date OR p_paid_on<DATE '2000-01-01' THEN RAISE EXCEPTION 'Comprovante ou data inválidos.'; END IF;
 SELECT (metadata->>'size')::bigint INTO bytes FROM storage.objects WHERE bucket_id='payment-receipts' AND name=p_path AND owner_id=auth.uid()::text;
 IF bytes IS NULL OR bytes<=0 OR bytes>10485760 THEN RAISE EXCEPTION 'Arquivo não encontrado ou maior que 10 MB.'; END IF;
 IF EXISTS(SELECT 1 FROM public.mentorship_receipts WHERE installment_id=item.id AND status='pending') THEN RAISE EXCEPTION 'Esta parcela já tem um comprovante em análise.'; END IF;
 INSERT INTO public.mentorship_receipts(installment_id,user_id,file_path,file_name,paid_on) VALUES(item.id,owner,p_path,p_file_name,p_paid_on) RETURNING id INTO new_id;
 RETURN new_id;
END $$;

CREATE FUNCTION public.mentorship_review_receipt(p_receipt_id uuid,p_decision text,p_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.mentorship_receipts%ROWTYPE; item public.mentorship_installments%ROWTYPE; iid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Apenas administradores analisam comprovantes.' USING ERRCODE='42501'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') OR length(coalesce(p_note,''))>500 OR (p_decision='rejected' AND length(trim(coalesce(p_note,'')))=0) THEN RAISE EXCEPTION 'Informe uma decisão válida e o motivo da recusa.'; END IF;
 SELECT installment_id INTO iid FROM public.mentorship_receipts WHERE id=p_receipt_id;
 SELECT * INTO item FROM public.mentorship_installments WHERE id=iid FOR UPDATE;
 SELECT * INTO r FROM public.mentorship_receipts WHERE id=p_receipt_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' THEN RAISE EXCEPTION 'Comprovante inexistente ou já analisado.'; END IF;
 IF item.paid_at IS NOT NULL THEN RAISE EXCEPTION 'A parcela já está quitada.'; END IF;
 UPDATE public.mentorship_receipts SET status=p_decision,review_note=coalesce(p_note,''),reviewed_by=auth.uid(),reviewed_at=now() WHERE id=r.id;
 IF p_decision='approved' THEN UPDATE public.mentorship_installments SET paid_at=now(),paid_on=r.paid_on,confirmed_by=auth.uid(),payment_note=coalesce(p_note,'') WHERE id=item.id; END IF;
 -- A receipt never extends a plan. Renewals require a new administrator-defined term.
END $$;

-- A private bucket: expired members may still settle and document their own installments.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('payment-receipts','payment-receipts',false,10485760,ARRAY['application/pdf','image/png','image/jpeg']);
CREATE FUNCTION public.mentorship_receipt_path(p_path text,p_upload boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.mentorship_installments i JOIN public.mentorship_plans m ON m.id=i.plan_id
 WHERE i.id::text=split_part(p_path,'/',2) AND m.user_id::text=split_part(p_path,'/',1)
 AND p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg)$'
 AND ((NOT p_upload AND (m.user_id=auth.uid() OR public.is_admin(auth.uid()))) OR (p_upload AND m.user_id=auth.uid() AND i.paid_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.mentorship_receipts r WHERE r.installment_id=i.id AND r.status='pending'))))
$$;
CREATE POLICY mentorship_receipts_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='payment-receipts' AND public.mentorship_receipt_path(name,false));
CREATE POLICY mentorship_receipts_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='payment-receipts' AND owner_id=auth.uid()::text AND public.mentorship_receipt_path(name,true));
CREATE POLICY mentorship_receipts_storage_cleanup ON storage.objects FOR DELETE TO authenticated USING(bucket_id='payment-receipts' AND owner_id=auth.uid()::text AND public.mentorship_receipt_path(name,false) AND NOT EXISTS(SELECT 1 FROM public.mentorship_receipts r WHERE r.file_path=name));
-- No UPDATE policy: submitted evidence cannot be overwritten.
REVOKE ALL ON FUNCTION public.mentorship_account(uuid),public.mentorship_save_plan(uuid,uuid,date,integer,text,integer,integer,date,integer),public.mentorship_confirm_payment(uuid,date,text),public.mentorship_register_receipt(uuid,text,text,date),public.mentorship_review_receipt(uuid,text,text),public.mentorship_receipt_path(text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mentorship_account(uuid),public.mentorship_save_plan(uuid,uuid,date,integer,text,integer,integer,date,integer),public.mentorship_confirm_payment(uuid,date,text),public.mentorship_register_receipt(uuid,text,text,date),public.mentorship_review_receipt(uuid,text,text),public.mentorship_receipt_path(text,boolean) TO authenticated;
COMMENT ON TABLE public.mentorship_plans IS 'A ORDEM: manual mentorship agreements. Amounts are BRL integer cents; end is exclusive at midnight America/Sao_Paulo.';
NOTIFY pgrst,'reload schema';
COMMIT;
