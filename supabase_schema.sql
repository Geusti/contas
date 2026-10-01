-- ==============================================================================
-- GiroFinance - Estrutura de Banco de Dados com Autenticação Supabase Auth
-- Copie e cole este código no SQL Editor do seu projeto Supabase:
-- https://supabase.com/dashboard/project/tqlyltckhlrjogvxqsbt/sql
-- ==============================================================================

-- 1. Tabela de Perfil do Usuário vinculada ao Supabase Auth
CREATE TABLE IF NOT EXISTS public.perfil (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    nome TEXT DEFAULT 'Motorista',
    data_nascimento DATE,
    carro TEXT DEFAULT 'Meu Carro',
    meta_mensal NUMERIC(10,2) DEFAULT 5000.00,
    foto_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabela de Lançamentos Diários com vinculo por usuário
CREATE TABLE IF NOT EXISTS public.lancamentos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    ganho_bruto NUMERIC(10,2) DEFAULT 0,
    combustivel NUMERIC(10,2) DEFAULT 0,
    outros_gastos NUMERIC(10,2) DEFAULT 0,
    lucro_liquido NUMERIC(10,2) DEFAULT 0,
    observacoes TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT lancamentos_user_data_unique UNIQUE (user_id, data)
);

-- 3. Habilitar Row Level Security (RLS)
ALTER TABLE public.perfil ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Segurança RLS para a tabela 'perfil'
DROP POLICY IF EXISTS "Usuários podem visualizar o próprio perfil" ON public.perfil;
CREATE POLICY "Usuários podem visualizar o próprio perfil"
ON public.perfil FOR SELECT
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Usuários podem atualizar o próprio perfil" ON public.perfil;
CREATE POLICY "Usuários podem atualizar o próprio perfil"
ON public.perfil FOR UPDATE
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Usuários podem inserir o próprio perfil" ON public.perfil;
CREATE POLICY "Usuários podem inserir o próprio perfil"
ON public.perfil FOR INSERT
WITH CHECK (auth.uid() = id);

-- Política permissiva para chave anônima/convidado (modo offline ou demo)
DROP POLICY IF EXISTS "Permitir acesso público fallback perfil" ON public.perfil;
CREATE POLICY "Permitir acesso público fallback perfil"
ON public.perfil FOR ALL
USING (true)
WITH CHECK (true);

-- 5. Políticas de Segurança RLS para a tabela 'lancamentos'
DROP POLICY IF EXISTS "Usuários podem ver seus próprios lançamentos" ON public.lancamentos;
CREATE POLICY "Usuários podem ver seus próprios lançamentos"
ON public.lancamentos FOR SELECT
USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Usuários podem inserir seus lançamentos" ON public.lancamentos;
CREATE POLICY "Usuários podem inserir seus lançamentos"
ON public.lancamentos FOR INSERT
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Usuários podem atualizar seus lançamentos" ON public.lancamentos;
CREATE POLICY "Usuários podem atualizar seus lançamentos"
ON public.lancamentos FOR UPDATE
USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Usuários podem deletar seus lançamentos" ON public.lancamentos;
CREATE POLICY "Usuários podem deletar seus lançamentos"
ON public.lancamentos FOR DELETE
USING (auth.uid() = user_id OR user_id IS NULL);

-- 6. Trigger automático para criar o perfil quando um novo usuário se cadastrar no Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.perfil (id, email, nome, carro, meta_mensal)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
        'Meu Carro',
        5000.00
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
