-- Destructive fixtures are allowed only in this disposable QA database.
\set ON_ERROR_STOP on
SELECT current_database()='ordem_recordings_qa' AS isolated \gset
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
\ir setup-mentorship-recordings.sql
CREATE FUNCTION public.qa_assert(label text,condition boolean) RETURNS text LANGUAGE plpgsql AS $$ BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RETURN 'PASS: '||label; END $$;
CREATE FUNCTION public.qa_reject(label text,command text,expected text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN IF SQLERRM ~* expected THEN RETURN 'PASS: '||label; END IF; RAISE EXCEPTION 'Wrong error for %: %',label,SQLERRM; END; RAISE EXCEPTION 'FAIL: allowed: %',label; END $$;
BEGIN;
INSERT INTO auth.users(id,email) VALUES
('00000000-0000-4000-8000-000000000001','admin@example.invalid'),
('00000000-0000-4000-8000-000000000002','alice@example.invalid'),
('00000000-0000-4000-8000-000000000003','bob@example.invalid');
INSERT INTO public.user_roles(user_id,role) VALUES('00000000-0000-4000-8000-000000000001','admin');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT public.recordings_create('00000000-0000-4000-8000-000000000002','Call Alice','Conteúdo privado',current_date,'call.mp4',1024,'video/mp4')->>'id' AS alice \gset
SELECT public.recordings_create('00000000-0000-4000-8000-000000000003','Call Bob','',current_date,'call.webm',2048,'video/webm')->>'id' AS bob \gset
SELECT qa_assert('admin can see pending uploads',jsonb_array_length(public.recordings_list('00000000-0000-4000-8000-000000000002'))=1);
SELECT qa_assert('recordings bucket is private',(SELECT NOT public AND file_size_limit=2147483648 FROM storage.buckets WHERE id='mentorship-recordings'));
SELECT qa_reject('cannot publish before upload',format('SELECT public.recordings_publish(%L)',:'alice'),'Envio incompleto');
INSERT INTO storage.objects(bucket_id,name,metadata) SELECT 'mentorship-recordings',file_path,jsonb_build_object('size',size_bytes,'mimetype',mime_type) FROM public.mentorship_recordings;
SELECT public.recordings_publish(:'alice');
SELECT public.recordings_publish(:'bob');
SELECT public.recordings_create('00000000-0000-4000-8000-000000000002','Uploading Alice','',current_date,'pending.mp4',500,'video/mp4')->>'id' AS pending \gset
SELECT qa_reject('cannot overwrite published video',format('INSERT INTO storage.objects(bucket_id,name) SELECT %L,file_path FROM public.mentorship_recordings WHERE id=%L','mentorship-recordings',:'alice'),'row-level security');
SELECT qa_reject('admin cannot read private student notes',format('SELECT public.recordings_learning(%L)',:'alice'),'privadas');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SELECT qa_assert('student sees only own published call',(SELECT count(*)=1 FROM public.mentorship_recordings));
SELECT qa_assert('list excludes unfinished uploads',jsonb_array_length(public.recordings_list(auth.uid()))=1);
SELECT qa_assert('student can read own published video',public.recordings_can_read(:'alice'));
SELECT qa_assert('student cannot read another video',NOT public.recordings_can_read(:'bob'));
SELECT qa_assert('student cannot read own incomplete upload',NOT public.recordings_can_read(:'pending'));
SELECT qa_assert('storage returns only own published video',(SELECT count(*)=1 FROM storage.objects WHERE bucket_id='mentorship-recordings'));
SELECT qa_reject('cannot list other student calls',$q$SELECT public.recordings_list('00000000-0000-4000-8000-000000000003')$q$,'não autorizado');
SELECT qa_reject('cannot create own recording',$q$SELECT public.recordings_create(auth.uid(),'Fake','',current_date,'a.mp4',20,'video/mp4')$q$,'administradores');
SELECT qa_reject('cannot publish calls',format('SELECT public.recordings_publish(%L)',:'alice'),'administradores');
SELECT qa_reject('cannot change assignment directly',$q$UPDATE public.mentorship_recordings SET user_id=auth.uid()$q$,'permission denied');
SELECT qa_reject('cannot upload files',$q$INSERT INTO storage.objects(bucket_id,name) VALUES('mentorship-recordings','fake.mp4')$q$,'row-level security');
SELECT qa_assert('new learning state is empty',public.recordings_learning(:'alice')->>'content'='');
SELECT public.recordings_save_note(:'alice','Meus próximos passos',0);
SELECT public.recordings_save_position(:'alice',135);
SELECT qa_assert('position is persisted',public.recordings_learning(:'alice')->>'position_seconds'='135');
SELECT qa_assert('progress cannot erase notes',public.recordings_learning(:'alice')->>'content'='Meus próximos passos');
SELECT public.recordings_save_note(:'alice','Texto atualizado',1);
SELECT qa_assert('notes preserve playback position',public.recordings_learning(:'alice')->>'position_seconds'='135');
SELECT qa_reject('stale note update cannot erase newer text',format('SELECT public.recordings_save_note(%L,%L,1)',:'alice','stale'),'outra aba');
SELECT qa_reject('cannot read other notes',format('SELECT public.recordings_learning(%L)',:'bob'),'privadas');
SELECT qa_reject('cannot save another note',format('SELECT public.recordings_save_note(%L,%L,0)',:'bob','intrusion'),'privadas');
SELECT qa_reject('cannot save another progress',format('SELECT public.recordings_save_position(%L,100)',:'bob'),'privadas');
SELECT qa_reject('learning direct edits denied',$q$UPDATE public.mentorship_recording_learning SET content='bypass'$q$,'permission denied');
SELECT qa_reject('negative progress refused',format('SELECT public.recordings_save_position(%L,-10)',:'alice'),'inválida');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
SELECT qa_assert('second student cannot see first notes',(SELECT count(*)=0 FROM public.mentorship_recording_learning));
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SELECT qa_assert('admin never reads student notes via table',(SELECT count(*)=0 FROM public.mentorship_recording_learning));
UPDATE public.profiles SET access_expires_at=now()-interval '1 second' WHERE id='00000000-0000-4000-8000-000000000002';
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SELECT qa_assert('expiry blocks recordings immediately',(SELECT count(*)=0 FROM public.mentorship_recordings));
SELECT qa_assert('expiry blocks video storage immediately',(SELECT count(*)=0 FROM storage.objects WHERE bucket_id='mentorship-recordings'));
SELECT qa_reject('expired cannot read annotations',format('SELECT public.recordings_learning(%L)',:'alice'),'privadas');
SELECT qa_reject('expired cannot update notes',format('SELECT public.recordings_save_note(%L,%L,2)',:'alice','expired'),'privadas');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
UPDATE public.profiles SET access_expires_at=NULL,status='suspended' WHERE id='00000000-0000-4000-8000-000000000002';
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SELECT qa_assert('suspension blocks calls',NOT public.recordings_can_read(:'alice'));
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
UPDATE public.profiles SET status='active' WHERE id='00000000-0000-4000-8000-000000000002';
SELECT public.mentorship_save_plan('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000002',current_date+10,1,'months',10000,1,current_date,0);
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SELECT qa_assert('future mentorship does not unlock calls early',NOT public.recordings_can_read(:'alice'));
RESET ROLE;
SELECT qa_assert('anonymous cannot execute recordings RPC',NOT has_function_privilege('anon','public.recordings_list(uuid)','EXECUTE'));
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
SELECT qa_assert('anonymous cannot read recordings files',(SELECT count(*)=0 FROM storage.objects WHERE bucket_id='mentorship-recordings'));
ROLLBACK;
