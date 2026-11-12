-- Dedicated private weekly-call recordings. Reviewed setup; does not change existing content.
BEGIN;
CREATE TABLE public.mentorship_recordings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 1 AND 160),
 description text NOT NULL DEFAULT '' CHECK(char_length(description)<=8000),
 recorded_on date NOT NULL,
 file_path text NOT NULL UNIQUE,
 file_name text NOT NULL CHECK(char_length(file_name) BETWEEN 1 AND 180),
 mime_type text NOT NULL CHECK(mime_type IN ('video/mp4','video/webm')),
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 2147483648),
 status text NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','published')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(file_path=user_id::text||'/'||id::text||CASE mime_type WHEN 'video/mp4' THEN '/recording.mp4' ELSE '/recording.webm' END)
);
CREATE INDEX mentorship_recordings_user_date ON public.mentorship_recordings(user_id,recorded_on DESC,created_at DESC);
CREATE TABLE public.mentorship_recording_learning (
 recording_id uuid PRIMARY KEY REFERENCES public.mentorship_recordings(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 content text NOT NULL DEFAULT '' CHECK(char_length(content)<=50000),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 position_seconds integer NOT NULL DEFAULT 0 CHECK(position_seconds BETWEEN 0 AND 604800),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mentorship_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentorship_recording_learning ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mentorship_recordings,public.mentorship_recording_learning FROM anon,authenticated;
GRANT SELECT ON public.mentorship_recordings,public.mentorship_recording_learning TO authenticated;

CREATE FUNCTION public.recordings_can_read(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.mentorship_recordings r WHERE r.id=p_id AND
 (public.is_admin(auth.uid()) OR (r.user_id=auth.uid() AND r.status='published' AND public.is_active_member(auth.uid()))))
$$;
CREATE FUNCTION public.recordings_can_read_path(p_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.mentorship_recordings r WHERE r.file_path=p_path AND public.recordings_can_read(r.id))
$$;
CREATE FUNCTION public.recordings_can_upload(p_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND public.is_admin(auth.uid()) AND EXISTS(SELECT 1 FROM public.mentorship_recordings r WHERE r.file_path=p_path AND r.status='uploading')
$$;
CREATE POLICY recordings_select ON public.mentorship_recordings FOR SELECT TO authenticated USING(public.recordings_can_read(id));
CREATE POLICY recording_learning_self ON public.mentorship_recording_learning FOR SELECT TO authenticated USING(user_id=auth.uid() AND public.recordings_can_read(recording_id));
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES
 ('mentorship-recordings','mentorship-recordings',false,2147483648,ARRAY['video/mp4','video/webm']);
CREATE POLICY recordings_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='mentorship-recordings' AND public.recordings_can_read_path(name));
CREATE POLICY recordings_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='mentorship-recordings' AND public.recordings_can_upload(name));

CREATE FUNCTION public.recordings_list(p_user_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT (public.is_admin(auth.uid()) OR (auth.uid()=p_user_id AND public.is_active_member(auth.uid()))) THEN
  RAISE EXCEPTION 'Acesso não autorizado às gravações.' USING ERRCODE='42501';
 END IF;
 RETURN COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.recorded_on DESC,r.created_at DESC) FROM public.mentorship_recordings r WHERE r.user_id=p_user_id AND (public.is_admin(auth.uid()) OR r.status='published')),'[]'::jsonb);
END $$;
CREATE FUNCTION public.recordings_create(p_user_id uuid,p_title text,p_description text,p_recorded_on date,p_file_name text,p_size_bytes bigint,p_mime_type text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rid uuid:=gen_random_uuid(); result public.mentorship_recordings;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Somente administradores podem enviar gravações.' USING ERRCODE='42501'; END IF;
 INSERT INTO public.mentorship_recordings(id,user_id,title,description,recorded_on,file_path,file_name,size_bytes,mime_type)
 VALUES(rid,p_user_id,btrim(p_title),COALESCE(p_description,''),p_recorded_on,p_user_id::text||'/'||rid::text||CASE p_mime_type WHEN 'video/mp4' THEN '/recording.mp4' ELSE '/recording.webm' END,p_file_name,p_size_bytes,p_mime_type) RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;
CREATE FUNCTION public.recordings_publish(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.mentorship_recordings; meta jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Somente administradores podem publicar gravações.' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.mentorship_recordings WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Gravação não encontrada.'; END IF;
 SELECT metadata INTO meta FROM storage.objects WHERE bucket_id='mentorship-recordings' AND name=r.file_path;
 IF meta IS NULL OR COALESCE(meta->>'size','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Envio incompleto: arquivo ainda não disponível.'; END IF;
 IF (meta->>'size')::bigint<>r.size_bytes OR COALESCE(meta->>'mimetype','')<>r.mime_type THEN RAISE EXCEPTION 'Envio incompleto: tamanho ou formato do arquivo não confere.'; END IF;
 UPDATE public.mentorship_recordings SET status='published' WHERE id=p_id RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;
CREATE FUNCTION public.recordings_learning(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.recordings_can_read(p_id) OR NOT EXISTS(SELECT 1 FROM public.mentorship_recordings WHERE id=p_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Anotações privadas do mentorado.' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('content',content,'revision',revision,'position_seconds',position_seconds) INTO result FROM public.mentorship_recording_learning WHERE recording_id=p_id AND user_id=auth.uid();
 RETURN COALESCE(result,jsonb_build_object('content','','revision',0,'position_seconds',0));
END $$;
CREATE FUNCTION public.recordings_save_note(p_id uuid,p_content text,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.mentorship_recording_learning;
BEGIN
 PERFORM public.recordings_learning(p_id);
 IF p_revision IS NULL OR p_revision<0 OR p_content IS NULL OR char_length(p_content)>50000 THEN RAISE EXCEPTION 'Anotação inválida.'; END IF;
 INSERT INTO public.mentorship_recording_learning(recording_id,user_id) VALUES(p_id,auth.uid()) ON CONFLICT(recording_id) DO NOTHING;
 UPDATE public.mentorship_recording_learning SET content=p_content,revision=revision+1,updated_at=now() WHERE recording_id=p_id AND user_id=auth.uid() AND revision=p_revision RETURNING * INTO result;
 IF NOT FOUND THEN RAISE EXCEPTION 'A anotação mudou em outra aba. Copie seu texto e reabra a gravação antes de salvar.'; END IF;
 RETURN jsonb_build_object('content',result.content,'revision',result.revision,'position_seconds',result.position_seconds);
END $$;
CREATE FUNCTION public.recordings_save_position(p_id uuid,p_seconds integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.recordings_learning(p_id);
 IF p_seconds IS NULL OR p_seconds<0 OR p_seconds>604800 THEN RAISE EXCEPTION 'Posição inválida.'; END IF;
 INSERT INTO public.mentorship_recording_learning(recording_id,user_id,position_seconds) VALUES(p_id,auth.uid(),p_seconds)
 ON CONFLICT(recording_id) DO UPDATE SET position_seconds=EXCLUDED.position_seconds WHERE public.mentorship_recording_learning.user_id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.recordings_can_read(uuid),public.recordings_can_read_path(text),public.recordings_can_upload(text),public.recordings_list(uuid),public.recordings_create(uuid,text,text,date,text,bigint,text),public.recordings_publish(uuid),public.recordings_learning(uuid),public.recordings_save_note(uuid,text,integer),public.recordings_save_position(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recordings_can_read(uuid),public.recordings_can_read_path(text),public.recordings_can_upload(text),public.recordings_list(uuid),public.recordings_create(uuid,text,text,date,text,bigint,text),public.recordings_publish(uuid),public.recordings_learning(uuid),public.recordings_save_note(uuid,text,integer),public.recordings_save_position(uuid,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
