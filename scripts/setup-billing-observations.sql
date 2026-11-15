-- Additive setup for private billing messages. Existing contracts and payments are untouched.
BEGIN;
CREATE TABLE public.mentorship_billing_observations (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 content text NOT NULL DEFAULT '' CHECK (char_length(content) <= 5000),
 revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mentorship_billing_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mentorship_billing_observations FROM anon, authenticated;
GRANT SELECT ON public.mentorship_billing_observations TO authenticated;
GRANT ALL ON public.mentorship_billing_observations TO service_role;
CREATE POLICY billing_observation_self_or_admin ON public.mentorship_billing_observations
 FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE FUNCTION public.mentorship_get_observation(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_user_id IS NULL OR
    (auth.uid() <> p_user_id AND NOT public.is_admin(auth.uid())) THEN
   RAISE EXCEPTION 'Acesso não autorizado à observação.' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN
   RAISE EXCEPTION 'Mentorado não encontrado.';
 END IF;
 SELECT jsonb_build_object('user_id',user_id,'content',content,'revision',revision,'updated_at',updated_at)
 INTO result FROM public.mentorship_billing_observations WHERE user_id=p_user_id;
 RETURN COALESCE(result,jsonb_build_object('user_id',p_user_id,'content','','revision',0,'updated_at',null));
END $$;

CREATE FUNCTION public.mentorship_save_observation(p_user_id uuid,p_content text,p_expected_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_revision integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
   RAISE EXCEPTION 'Somente administradores podem alterar a observação.' USING ERRCODE='42501';
 END IF;
 IF p_user_id IS NULL OR p_content IS NULL OR char_length(p_content)>5000 OR
    p_expected_revision IS NULL OR p_expected_revision<0 THEN
   RAISE EXCEPTION 'Observação inválida. Use até 5000 caracteres.';
 END IF;
 -- Serialize first writes too; a stale editor cannot overwrite another administrator's message.
 PERFORM 1 FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mentorado não encontrado.'; END IF;
 SELECT revision INTO current_revision FROM public.mentorship_billing_observations WHERE user_id=p_user_id;
 IF COALESCE(current_revision,0)<>p_expected_revision THEN
   RAISE EXCEPTION 'A observação mudou em outra aba. Copie seu texto e recarregue antes de salvar.';
 END IF;
 INSERT INTO public.mentorship_billing_observations(user_id,content,revision,updated_at)
 VALUES (p_user_id,btrim(p_content),1,now())
 ON CONFLICT(user_id) DO UPDATE SET content=EXCLUDED.content,
   revision=public.mentorship_billing_observations.revision+1,updated_at=now();
 RETURN public.mentorship_get_observation(p_user_id);
END $$;
REVOKE ALL ON FUNCTION public.mentorship_get_observation(uuid),public.mentorship_save_observation(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mentorship_get_observation(uuid),public.mentorship_save_observation(uuid,text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
