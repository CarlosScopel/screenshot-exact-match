-- Run only after validate-mentorship.sql in its disposable PostgreSQL database.
\set ON_ERROR_STOP on
SELECT current_database()='ordem_billing_qa' AS isolated \gset
\if :isolated
\else
 \echo 'Refusing non-QA database'
 \quit 1
\endif
\ir setup-billing-observations.sql
BEGIN;
INSERT INTO auth.users(id,email) VALUES
('00000000-0000-4000-8000-000000000001','admin@example.invalid'),
('00000000-0000-4000-8000-000000000002','a@example.invalid'),
('00000000-0000-4000-8000-000000000003','b@example.invalid');
INSERT INTO public.user_roles(user_id,role) VALUES ('00000000-0000-4000-8000-000000000001','admin');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT public.mentorship_save_plan('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000002',current_date-1,1,'months',500000,3,current_date,0);
SELECT qa_assert('no message initially',(public.mentorship_get_observation('00000000-0000-4000-8000-000000000002')->>'content')='');
SELECT qa_assert('admin writes for A',(public.mentorship_save_observation('00000000-0000-4000-8000-000000000002','Pagamento no dia 10',0)->>'revision')::integer=1);
SELECT qa_assert('admin writes separately for B',(public.mentorship_save_observation('00000000-0000-4000-8000-000000000003','Pagamento no dia 20',0)->>'revision')::integer=1);
SELECT qa_assert('admin reads both',(SELECT count(*)=2 FROM public.mentorship_billing_observations));
SELECT qa_reject('stale revision refused',$q$SELECT public.mentorship_save_observation('00000000-0000-4000-8000-000000000002','wrong',0)$q$,'mudou');
SELECT qa_reject('oversized message refused',$q$SELECT public.mentorship_save_observation('00000000-0000-4000-8000-000000000002',repeat('x',5001),1)$q$,'inválida');
SELECT qa_reject('null content refused',$q$SELECT public.mentorship_save_observation('00000000-0000-4000-8000-000000000002',null,1)$q$,'inválida');
SELECT qa_reject('unknown member refused',$q$SELECT public.mentorship_save_observation('00000000-0000-4000-8000-000000000099','note',0)$q$,'não encontrado');
SELECT qa_assert('contract and installments unchanged',(SELECT total_cents=500000 AND revision=1 FROM public.mentorship_plans WHERE id='00000000-0000-4000-8000-000000000101') AND (SELECT sum(amount_cents)=500000 AND count(*)=3 AND count(paid_at)=0 FROM public.mentorship_installments));
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SELECT qa_assert('A reads own observation',(public.mentorship_get_observation(auth.uid())->>'content')='Pagamento no dia 10');
SELECT qa_assert('RLS shows only A',(SELECT count(*)=1 AND bool_and(user_id=auth.uid()) FROM public.mentorship_billing_observations));
SELECT qa_reject('A cannot read B by RPC',$q$SELECT public.mentorship_get_observation('00000000-0000-4000-8000-000000000003')$q$,'não autorizado');
SELECT qa_reject('member cannot edit own note',$q$SELECT public.mentorship_save_observation(auth.uid(),'changed',1)$q$,'administradores');
SELECT qa_reject('member cannot edit other note',$q$SELECT public.mentorship_save_observation('00000000-0000-4000-8000-000000000003','changed',1)$q$,'administradores');
SELECT qa_reject('direct update refused',$q$UPDATE public.mentorship_billing_observations SET content='changed'$q$,'permission denied');
SELECT qa_reject('direct insert refused',$q$INSERT INTO public.mentorship_billing_observations(user_id,content) VALUES(auth.uid(),'x')$q$,'permission denied');
SELECT qa_reject('direct deletion refused',$q$DELETE FROM public.mentorship_billing_observations$q$,'permission denied');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
SELECT qa_assert('B only sees B',(public.mentorship_get_observation(auth.uid())->>'content')='Pagamento no dia 20' AND (SELECT count(*)=1 FROM public.mentorship_billing_observations));
SELECT qa_reject('B cannot read A',$q$SELECT public.mentorship_get_observation('00000000-0000-4000-8000-000000000002')$q$,'não autorizado');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SELECT qa_assert('admin updates message',(public.mentorship_save_observation('00000000-0000-4000-8000-000000000002','Novo combinado',1)->>'revision')::integer=2);
SELECT qa_assert('admin clears message only',(public.mentorship_save_observation('00000000-0000-4000-8000-000000000002','',2)->>'content')='');
SELECT qa_assert('clearing A preserves B',(public.mentorship_get_observation('00000000-0000-4000-8000-000000000003')->>'content')='Pagamento no dia 20');
SELECT qa_reject('stale save cannot restore removed message',$q$SELECT public.mentorship_save_observation('00000000-0000-4000-8000-000000000002','resurrect',2)$q$,'mudou');
UPDATE public.profiles SET status='suspended',access_expires_at=now()-interval '1 day' WHERE id='00000000-0000-4000-8000-000000000003';
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
SELECT qa_assert('expired or suspended can still read own billing message',(public.mentorship_get_observation(auth.uid())->>'content')='Pagamento no dia 20');
SELECT qa_assert('billing message never restores content access',NOT public.is_active_member(auth.uid()));
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
SELECT qa_reject('anon cannot select notes',$q$SELECT * FROM public.mentorship_billing_observations$q$,'permission denied');
SELECT qa_reject('anon cannot call reader',$q$SELECT public.mentorship_get_observation('00000000-0000-4000-8000-000000000002')$q$,'permission denied');
SELECT qa_reject('anon cannot call writer',$q$SELECT public.mentorship_save_observation('00000000-0000-4000-8000-000000000002','x',0)$q$,'permission denied');
RESET ROLE;
ROLLBACK;
