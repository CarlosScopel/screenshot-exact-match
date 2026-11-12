-- Isolated integration tests; never run against the application database.
\set ON_ERROR_STOP on
SELECT current_database()='ordem_billing_qa' AS isolated \gset
\if :isolated
\else
 \echo 'Refusing non-QA database'
 \quit 1
\endif
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text NOT NULL,name text NOT NULL,owner_id text,metadata jsonb);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA auth,storage TO anon,authenticated,service_role;
GRANT SELECT ON storage.objects TO anon;
GRANT SELECT ON storage.buckets TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
\ir ../drizzle/migrations/0000_migration.sql
\ir ../drizzle/migrations/0001_migration.sql
\ir setup-mentorship-billing.sql
CREATE FUNCTION public.qa_assert(label text,condition boolean) RETURNS text LANGUAGE plpgsql AS $$ BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RETURN 'PASS: '||label; END $$;
CREATE FUNCTION public.qa_reject(label text,command text,expected text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN IF SQLERRM ~* expected THEN RETURN 'PASS: '||label; END IF; RAISE EXCEPTION 'Wrong error for %: %',label,SQLERRM; END; RAISE EXCEPTION 'FAIL: allowed: %',label; END $$;
BEGIN;
INSERT INTO auth.users(id,email) VALUES
('00000000-0000-4000-8000-000000000001','admin@example.invalid'),
('00000000-0000-4000-8000-000000000002','student@example.invalid'),
('00000000-0000-4000-8000-000000000003','other@example.invalid'),
('00000000-0000-4000-8000-000000000004','calendar@example.invalid'),
('00000000-0000-4000-8000-000000000005','expired@example.invalid'),
('00000000-0000-4000-8000-000000000006','future@example.invalid'),
('00000000-0000-4000-8000-000000000007','suspended@example.invalid');
INSERT INTO public.user_roles(user_id,role) VALUES('00000000-0000-4000-8000-000000000001','admin');
UPDATE public.profiles SET status='suspended' WHERE id='00000000-0000-4000-8000-000000000007';
SELECT qa_assert('legacy members unchanged',public.is_active_member('00000000-0000-4000-8000-000000000003'));
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT public.mentorship_save_plan('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000002',current_date-1,1,'months',500000,3,current_date,0);
SELECT qa_assert('exact sum of all installments',(SELECT sum(amount_cents)=500000 FROM public.mentorship_installments WHERE plan_id='00000000-0000-4000-8000-000000000101'));
SELECT qa_assert('rounding assigns remaining cents',(SELECT array_agg(amount_cents ORDER BY number)=ARRAY[166667,166667,166666] FROM public.mentorship_installments WHERE plan_id='00000000-0000-4000-8000-000000000101'));
SELECT qa_assert('expiry persisted to protected profile',(SELECT p.access_expires_at=m.ends_at FROM public.profiles p JOIN public.mentorship_plans m ON m.user_id=p.id WHERE m.id='00000000-0000-4000-8000-000000000101'));
SELECT qa_assert('active paid or credit plan can access',public.is_active_member('00000000-0000-4000-8000-000000000002'));
SELECT public.mentorship_save_plan('00000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000004','2024-01-31',1,'months',10000,3,'2024-01-31',0);
SELECT qa_assert('calendar month clamps leap February',(SELECT end_date='2024-02-29' FROM public.mentorship_plans WHERE id='00000000-0000-4000-8000-000000000104'));
SELECT qa_assert('schedule anchors to original day',(SELECT array_agg(due_date ORDER BY number)=ARRAY[DATE '2024-01-31',DATE '2024-02-29',DATE '2024-03-31'] FROM public.mentorship_installments WHERE plan_id='00000000-0000-4000-8000-000000000104'));
SELECT qa_assert('end is Sao Paulo midnight',(SELECT ends_at='2024-02-29 03:00:00+00' FROM public.mentorship_plans WHERE id='00000000-0000-4000-8000-000000000104'));
SELECT public.mentorship_save_plan('00000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000005',(current_date-interval '2 months')::date,1,'months',10000,1,current_date,0);
SELECT qa_assert('expired plan automatically blocks',NOT public.is_active_member('00000000-0000-4000-8000-000000000005'));
SELECT public.mentorship_save_plan('00000000-0000-4000-8000-000000000106','00000000-0000-4000-8000-000000000006',current_date+30,1,'years',10000,1,current_date,0);
SELECT qa_assert('future start cannot access early',NOT public.is_active_member('00000000-0000-4000-8000-000000000006'));
SELECT public.mentorship_save_plan('00000000-0000-4000-8000-000000000107','00000000-0000-4000-8000-000000000007',current_date-1,1,'years',10000,1,current_date,0);
SELECT qa_assert('creating plan never approves suspension',NOT public.is_active_member('00000000-0000-4000-8000-000000000007'));
SELECT qa_reject('overlapping renewal refused',$q$SELECT public.mentorship_save_plan('00000000-0000-4000-8000-000000000108','00000000-0000-4000-8000-000000000002',current_date,1,'months',10000,1,current_date,0)$q$,'sobrepõe');
SELECT qa_reject('invalid duration refused',$q$SELECT public.mentorship_save_plan('00000000-0000-4000-8000-000000000108','00000000-0000-4000-8000-000000000003',current_date,0,'months',10000,1,current_date,0)$q$,'inválidos');
SELECT qa_assert('receipts bucket private and limited',(SELECT NOT public AND file_size_limit=10485760 FROM storage.buckets WHERE id='payment-receipts'));
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SELECT qa_assert('student sees only own plan',(SELECT count(*)=1 FROM public.mentorship_plans));
SELECT qa_assert('student sees only own installments',(SELECT count(*)=3 FROM public.mentorship_installments));
SELECT qa_reject('student cannot read other account',$q$SELECT public.mentorship_account('00000000-0000-4000-8000-000000000003')$q$,'não autorizado');
SELECT qa_reject('student cannot confirm payments',$q$SELECT public.mentorship_confirm_payment('00000000-0000-4000-8000-000000000999',current_date,'')$q$,'administradores');
SELECT qa_reject('student cannot approve evidence',$q$SELECT public.mentorship_review_receipt('00000000-0000-4000-8000-000000000999','approved','')$q$,'administradores');
SELECT qa_reject('student cannot save own plan',$q$SELECT public.mentorship_save_plan('00000000-0000-4000-8000-000000000108','00000000-0000-4000-8000-000000000002',current_date,1,'months',1,1,current_date,0)$q$,'administradores');
SELECT qa_reject('direct financial update forbidden',$q$UPDATE public.mentorship_installments SET amount_cents=1$q$,'permission denied');
UPDATE public.profiles SET access_expires_at=now()+interval '100 years' WHERE id=auth.uid();
SELECT qa_assert('student cannot extend expiry',(SELECT p.access_expires_at=m.ends_at FROM public.profiles p JOIN public.mentorship_plans m ON m.user_id=p.id WHERE m.id='00000000-0000-4000-8000-000000000101'));
SELECT id AS invoice FROM public.mentorship_installments WHERE plan_id='00000000-0000-4000-8000-000000000101' AND number=1 \gset
SELECT '00000000-0000-4000-8000-000000000002/'||:'invoice'||'/00000000-0000-4000-8000-000000000501.pdf' AS path \gset
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES('payment-receipts',:'path',auth.uid()::text,'{"size":100,"mimetype":"application/pdf"}');
SELECT public.mentorship_register_receipt(:'invoice',:'path','comprovante.pdf',current_date) AS receipt \gset
SELECT qa_assert('receipt does not settle payment',(SELECT paid_at IS NULL FROM public.mentorship_installments WHERE id=:'invoice'));
SELECT qa_assert('receipt starts pending',(SELECT status='pending' FROM public.mentorship_receipts WHERE id=:'receipt'));
SELECT qa_reject('student cannot modify proof decision',$q$UPDATE public.mentorship_receipts SET status='approved'$q$,'permission denied');
WITH removed AS (DELETE FROM storage.objects WHERE name=:'path' RETURNING id) SELECT qa_assert('submitted proof immutable',(SELECT count(*)=0 FROM removed));
SELECT qa_reject('duplicate pending proof refused',format('SELECT public.mentorship_register_receipt(%L,%L,%L,current_date)',:'invoice',:'path','again.pdf'),'em análise');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
SELECT qa_assert('other member cannot see receipt',(SELECT count(*)=0 FROM public.mentorship_receipts));
SELECT qa_assert('other member cannot read receipt file',(SELECT count(*)=0 FROM storage.objects WHERE bucket_id='payment-receipts'));
SELECT qa_reject('other member cannot register receipt',format('SELECT public.mentorship_register_receipt(%L,%L,%L,current_date)',:'invoice',:'path','fake.pdf'),'não autorizada');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SELECT qa_assert('admin sees private receipt',(SELECT count(*)=1 FROM storage.objects WHERE bucket_id='payment-receipts'));
SELECT qa_reject('reject requires reason',format('SELECT public.mentorship_review_receipt(%L,%L,%L)',:'receipt','rejected',''),'motivo');
SELECT public.mentorship_review_receipt(:'receipt','rejected','Pagamento não localizado');
SELECT qa_assert('rejected proof remains in history',(SELECT status='rejected' AND review_note='Pagamento não localizado' FROM public.mentorship_receipts WHERE id=:'receipt'));
SELECT qa_assert('rejection does not settle',(SELECT paid_at IS NULL FROM public.mentorship_installments WHERE id=:'invoice'));
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SELECT '00000000-0000-4000-8000-000000000002/'||:'invoice'||'/00000000-0000-4000-8000-000000000502.pdf' AS path2 \gset
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES('payment-receipts',:'path2',auth.uid()::text,'{"size":100}');
SELECT public.mentorship_register_receipt(:'invoice',:'path2','novo.pdf',current_date) AS receipt2 \gset
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SELECT qa_reject('manual settle cannot skip pending review',format('SELECT public.mentorship_confirm_payment(%L,current_date,%L)',:'invoice',''),'Analise');
SELECT public.mentorship_review_receipt(:'receipt2','approved','Conferido');
SELECT qa_assert('approval settles exact installment',(SELECT paid_at IS NOT NULL AND confirmed_by=auth.uid() FROM public.mentorship_installments WHERE id=:'invoice'));
SELECT qa_assert('rejected and approved evidence both preserved',(SELECT count(*)=2 FROM public.mentorship_receipts WHERE installment_id=:'invoice'));
SELECT qa_reject('duplicate review cannot count twice',format('SELECT public.mentorship_review_receipt(%L,%L,%L)',:'receipt2','approved',''),'já analisado');
SELECT qa_assert('payment never renews duration',(SELECT duration_count=1 AND revision=1 FROM public.mentorship_plans WHERE id='00000000-0000-4000-8000-000000000101'));
SELECT qa_reject('cannot rewrite financial history',$q$SELECT public.mentorship_save_plan('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000002',current_date-1,1,'months',10000,3,current_date,1)$q$,'histórico');
SELECT public.mentorship_save_plan('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000002',current_date-1,2,'months',500000,3,current_date,1);
SELECT qa_assert('term editing preserves paid row',(SELECT paid_at IS NOT NULL FROM public.mentorship_installments WHERE id=:'invoice'));
SELECT qa_reject('stale editor cannot overwrite',$q$SELECT public.mentorship_save_plan('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000002',current_date-1,3,'months',500000,3,current_date,1)$q$,'alterado');
SELECT end_date AS renewal_date FROM public.mentorship_plans WHERE id='00000000-0000-4000-8000-000000000101' \gset
SELECT public.mentorship_save_plan('00000000-0000-4000-8000-000000000108','00000000-0000-4000-8000-000000000002',:'renewal_date',1,'years',250000,1,:'renewal_date',0);
SELECT qa_assert('scheduled renewal keeps currently active term usable',public.is_active_member('00000000-0000-4000-8000-000000000002'));
SELECT qa_assert('renewal retains original plan and receipts',(SELECT count(*)=2 FROM public.mentorship_plans WHERE user_id='00000000-0000-4000-8000-000000000002') AND (SELECT count(*)=2 FROM public.mentorship_receipts));
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
SELECT qa_assert('expired member can still see own financial history',jsonb_array_length(public.mentorship_account()->'plans')=1);
SELECT qa_assert('account reports no content access',(public.mentorship_account()->>'has_access')::boolean=false);
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
SELECT qa_reject('anonymous cannot read billing',$q$SELECT * FROM public.mentorship_plans$q$,'permission denied');
SELECT qa_reject('anonymous cannot execute account RPC',$q$SELECT public.mentorship_account()$q$,'permission denied');
RESET ROLE;
ROLLBACK;
