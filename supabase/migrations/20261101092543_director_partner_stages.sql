-- Two senior career stages after Senior manager: Director, then Partner.
alter type public.career_stage add value if not exists 'Director' after 'Senior manager';
alter type public.career_stage add value if not exists 'Partner' after 'Director';
