-- Integration tests only. Refuse to run against any production database.
\set ON_ERROR_STOP on
SELECT current_database() = 'a_ordem_qa' AS isolated_database \gset
\if :isolated_database
\else
  \echo 'Refusing to run: this is not the isolated a_ordem_qa database.'
  \quit 1
\endif
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA auth,storage TO anon,authenticated,service_role;
GRANT SELECT ON storage.objects TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

-- Apply the repository's unchanged production policy definitions.
\ir ../drizzle/migrations/0000_migration.sql
\ir ../drizzle/migrations/0001_migration.sql

CREATE FUNCTION public.qa_assert(label text, condition boolean) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  RETURN 'PASS: '||label;
END $$;
CREATE FUNCTION public.qa_denied(label text, command text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE command;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RETURN 'PASS: '||label;
  END;
  RAISE EXCEPTION 'FAIL: operation was allowed: %',label;
END $$;

INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-000000000001','qa-admin@example.invalid'),
 ('00000000-0000-4000-8000-000000000002','qa-learner@example.invalid'),
 ('00000000-0000-4000-8000-000000000003','qa-outsider@example.invalid'),
 ('00000000-0000-4000-8000-000000000004','qa-pending@example.invalid'),
 ('00000000-0000-4000-8000-000000000005','qa-expired@example.invalid'),
 ('00000000-0000-4000-8000-000000000006','qa-cohort@example.invalid');
INSERT INTO public.user_roles(user_id,role) VALUES('00000000-0000-4000-8000-000000000001','admin');
UPDATE public.profiles SET status='suspended',admin_notes='A_ORDEM:AWAITING_APPLICATION_APPROVAL' WHERE id='00000000-0000-4000-8000-000000000004';
UPDATE public.profiles SET access_expires_at=now()-interval '1 hour' WHERE id='00000000-0000-4000-8000-000000000005';
INSERT INTO public.trainings(id,title,status) VALUES
 ('00000000-0000-4000-8000-000000000101','Published QA','published'),
 ('00000000-0000-4000-8000-000000000102','Draft QA','draft');
INSERT INTO public.modules(id,training_id,title,status) VALUES
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101','Published module','published'),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000101','Draft module','draft'),
 ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000102','Draft training module','published');
INSERT INTO public.lessons(id,module_id,title,status,available_at) VALUES
 ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000201','Published lesson','published',NULL),
 ('00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000201','Draft lesson','draft',NULL),
 ('00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-000000000201','Scheduled lesson','published',now()+interval '1 day'),
 ('00000000-0000-4000-8000-000000000304','00000000-0000-4000-8000-000000000202','Hidden module lesson','published',NULL),
 ('00000000-0000-4000-8000-000000000305','00000000-0000-4000-8000-000000000203','Hidden training lesson','published',NULL);
INSERT INTO public.training_grants(training_id,user_id) SELECT t.id,p.id FROM public.trainings t CROSS JOIN public.profiles p WHERE p.id IN ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000005');
INSERT INTO public.cohorts(id,name) VALUES('00000000-0000-4000-8000-000000000401','QA cohort');
INSERT INTO public.cohort_members(cohort_id,user_id) VALUES('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000006');
INSERT INTO public.training_cohorts(training_id,cohort_id) VALUES('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000401');
INSERT INTO public.library_items(id,title,status,cohort_ids) VALUES
 ('00000000-0000-4000-8000-000000000501','All active members','published','{}'),
 ('00000000-0000-4000-8000-000000000502','Cohort only','published','{00000000-0000-4000-8000-000000000401}');
INSERT INTO public.lesson_notes(user_id,lesson_id,content) VALUES('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000301','Private note of a different learner');
INSERT INTO storage.objects(bucket_id,name) VALUES
 ('materials','lesson/00000000-0000-4000-8000-000000000301/qa.pdf'),
 ('materials','lesson/00000000-0000-4000-8000-000000000302/draft.pdf'),
 ('materials','library/00000000-0000-4000-8000-000000000502/cohort.pdf');

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT qa_assert('learner can see only assigned published training',(SELECT count(*)=1 FROM public.trainings));
SELECT qa_assert('draft modules are hidden',(SELECT count(*)=1 FROM public.modules));
SELECT qa_assert('draft, scheduled and unpublished-parent lessons are hidden',(SELECT count(*)=1 FROM public.lessons));
SELECT qa_assert('other users profiles stay private',(SELECT count(*)=1 FROM public.profiles));
SELECT qa_assert('other users notes stay private',(SELECT count(*)=0 FROM public.lesson_notes));
INSERT INTO public.lesson_notes(user_id,lesson_id,content) VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000301','My own QA note');
SELECT qa_assert('learner can save and read own notes',(SELECT count(*)=1 FROM public.lesson_notes));
INSERT INTO public.lesson_progress(user_id,lesson_id,completed) VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000301',true);
SELECT qa_assert('learner can persist own completion',(SELECT bool_and(completed) FROM public.lesson_progress));
SELECT qa_denied('cannot assign own admin role','INSERT INTO public.user_roles(user_id,role) VALUES(''00000000-0000-4000-8000-000000000002'',''admin'')');
SELECT qa_denied('cannot publish courses','INSERT INTO public.trainings(title,status) VALUES(''Unauthorized'',''published'')');
SELECT qa_denied('cannot modify another user progress','INSERT INTO public.lesson_progress(user_id,lesson_id,completed) VALUES(''00000000-0000-4000-8000-000000000003'',''00000000-0000-4000-8000-000000000301'',true)');
SELECT qa_assert('cohort-only library items stay hidden',(SELECT count(*)=1 FROM public.library_items));
SELECT qa_assert('only authorized private lesson file is visible',(SELECT count(*)=1 FROM storage.objects));
SELECT qa_assert('malformed material paths denied',NOT public.can_read_material(auth.uid(),'lesson/not-a-uuid/file.pdf'));
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT qa_assert('unassigned learner cannot view courses',(SELECT count(*)=0 FROM public.trainings));
SELECT qa_assert('unassigned learner cannot view lessons',(SELECT count(*)=0 FROM public.lessons));
SELECT qa_assert('unassigned learner cannot view private lesson files',(SELECT count(*)=0 FROM storage.objects));
SELECT qa_denied('unassigned learner cannot forge progress','INSERT INTO public.lesson_progress(user_id,lesson_id,completed) VALUES(''00000000-0000-4000-8000-000000000003'',''00000000-0000-4000-8000-000000000301'',true)');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
SET LOCAL ROLE authenticated;
SELECT qa_assert('pending request cannot view assigned course',(SELECT count(*)=0 FROM public.trainings));
SELECT qa_assert('pending request cannot view library',(SELECT count(*)=0 FROM public.library_items));
SELECT qa_assert('pending request cannot view materials',(SELECT count(*)=0 FROM storage.objects));
UPDATE public.profiles SET status='active',admin_notes=NULL,access_expires_at=NULL WHERE id=auth.uid();
SELECT qa_assert('pending user cannot self-approve',(SELECT status='suspended' AND admin_notes='A_ORDEM:AWAITING_APPLICATION_APPROVAL' FROM public.profiles WHERE id=auth.uid()));
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
SET LOCAL ROLE authenticated;
SELECT qa_assert('expired access cannot view courses',(SELECT count(*)=0 FROM public.trainings));
UPDATE public.profiles SET access_expires_at=NULL WHERE id=auth.uid();
SELECT qa_assert('expired learner cannot extend own access',(SELECT access_expires_at<now() FROM public.profiles WHERE id=auth.uid()));
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
SET LOCAL ROLE authenticated;
SELECT qa_assert('cohort membership grants correct course',(SELECT count(*)=1 FROM public.trainings));
SELECT qa_assert('cohort membership grants restricted library',(SELECT count(*)=2 FROM public.library_items));
SELECT qa_assert('cohort learner sees own note only',(SELECT count(*)=1 FROM public.lesson_notes));
SELECT qa_assert('cohort learner gets published course and library files',(SELECT count(*)=2 FROM storage.objects));
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT qa_assert('admin can manage draft and published content',(SELECT count(*)=2 FROM public.trainings));
SELECT qa_assert('admin can see all learner profiles',(SELECT count(*)=6 FROM public.profiles));
UPDATE public.profiles SET status='active',admin_notes=NULL WHERE id='00000000-0000-4000-8000-000000000004';
SELECT qa_assert('admin approval persists',(SELECT status='active' FROM public.profiles WHERE id='00000000-0000-4000-8000-000000000004'));
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
SET LOCAL ROLE authenticated;
SELECT qa_assert('approved learner can access assigned published course',(SELECT count(*)=1 FROM public.trainings));
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
UPDATE public.profiles SET status='suspended',admin_notes='A_ORDEM:ACCESS_REJECTED' WHERE id='00000000-0000-4000-8000-000000000004';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
SET LOCAL ROLE authenticated;
SELECT qa_assert('rejected learner loses access even with existing grants',(SELECT count(*)=0 FROM public.trainings));
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
SELECT qa_denied('anonymous visitor cannot query private courses','SELECT * FROM public.trainings');
SELECT qa_assert('anonymous visitor cannot read private materials',(SELECT count(*)=0 FROM storage.objects));
SELECT qa_assert('anonymous visitor may read login branding',(SELECT count(*)=1 FROM public.platform_settings));
RESET ROLE;
SELECT 'REQUIRES PRODUCTION VERIFICATION: Auth direct signup must be disabled. The original schema creates profiles as active before the application suspends pending requests.' AS remaining_gate;
ROLLBACK;
