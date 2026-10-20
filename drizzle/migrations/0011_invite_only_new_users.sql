CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_first boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  -- Only the very first account and invited employees get access; any other self-created account is held suspended without a role.
  INSERT INTO public.profiles (id, full_name, email, suspended)
  VALUES (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), new.email,
          NOT is_first AND new.invited_at IS NULL);
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'super_admin');
  ELSIF new.invited_at IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, coalesce(nullif(new.raw_user_meta_data->>'invited_role','')::public.app_role, 'viewer'));
  END IF;
  RETURN new;
END $$;