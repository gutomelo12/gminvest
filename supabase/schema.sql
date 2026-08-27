-- ============================================================
--  gminvest — esquema do banco
--  Cole este arquivo inteiro no SQL Editor do Supabase e execute.
--  Pode ser reexecutado sem quebrar nada.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
--  Perfis — espelha auth.users para conseguirmos convidar por e-mail
-- ------------------------------------------------------------
create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  nome       text,
  criado_em  timestamptz not null default now()
);

create or replace function public.ao_criar_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email, nome)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists trg_novo_usuario on auth.users;
create trigger trg_novo_usuario after insert on auth.users
  for each row execute function public.ao_criar_usuario();

-- ------------------------------------------------------------
--  Carteiras e quem acessa cada uma
-- ------------------------------------------------------------
create table if not exists public.carteiras (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (char_length(nome) between 1 and 60),
  cor        text not null default '#0B6E4F',
  criada_por uuid not null references auth.users(id) on delete cascade,
  criada_em  timestamptz not null default now()
);

do $$ begin
  create type public.papel as enum ('dono','edicao','leitura');
exception when duplicate_object then null; end $$;

create table if not exists public.acessos (
  carteira_id uuid not null references public.carteiras(id) on delete cascade,
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  papel       public.papel not null default 'leitura',
  criado_em   timestamptz not null default now(),
  primary key (carteira_id, usuario_id)
);
create index if not exists idx_acessos_usuario on public.acessos(usuario_id);

-- Convites para quem ainda não tem conta, ou ainda não aceitou
create table if not exists public.convites (
  id          uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references public.carteiras(id) on delete cascade,
  email       text not null,
  papel       public.papel not null default 'leitura',
  criado_por  uuid not null references auth.users(id) on delete cascade,
  criado_em   timestamptz not null default now(),
  aceito_em   timestamptz,
  unique (carteira_id, email)
);
create index if not exists idx_convites_email on public.convites(lower(email));

-- ------------------------------------------------------------
--  Funções de autorização
--  SECURITY DEFINER para evitar recursão infinita nas policies.
-- ------------------------------------------------------------
create or replace function public.pode_ler(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.acessos a
                 where a.carteira_id = cid and a.usuario_id = auth.uid());
$$;

create or replace function public.pode_escrever(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.acessos a
                 where a.carteira_id = cid and a.usuario_id = auth.uid()
                   and a.papel in ('dono','edicao'));
$$;

create or replace function public.e_dono(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.acessos a
                 where a.carteira_id = cid and a.usuario_id = auth.uid() and a.papel = 'dono');
$$;

-- Cria a carteira e já registra o criador como dono, numa transação só
create or replace function public.criar_carteira(p_nome text, p_cor text default '#0B6E4F')
returns uuid language plpgsql security definer set search_path = public as $$
declare novo uuid;
begin
  if auth.uid() is null then raise exception 'sem sessão'; end if;
  insert into public.carteiras (nome, cor, criada_por) values (p_nome, p_cor, auth.uid())
    returning id into novo;
  insert into public.acessos (carteira_id, usuario_id, papel) values (novo, auth.uid(), 'dono');
  return novo;
end $$;

-- Ao entrar, converte convites pendentes do e-mail em acesso efetivo
create or replace function public.aceitar_convites()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; meu_email text;
begin
  select email into meu_email from public.perfis where id = auth.uid();
  if meu_email is null then return 0; end if;
  with pend as (
    select * from public.convites
     where lower(email) = lower(meu_email) and aceito_em is null
  ), ins as (
    insert into public.acessos (carteira_id, usuario_id, papel)
    select carteira_id, auth.uid(), papel from pend
    on conflict (carteira_id, usuario_id) do update set papel = excluded.papel
    returning carteira_id
  )
  update public.convites c set aceito_em = now()
    where c.id in (select id from pend);
  get diagnostics n = row_count;
  return n;
end $$;

-- ------------------------------------------------------------
--  Lançamentos
-- ------------------------------------------------------------
do $$ begin
  create type public.tipo_operacao as enum
    ('compra','venda','bonificacao','desdobramento','grupamento','ajuste');
exception when duplicate_object then null; end $$;

create table if not exists public.operacoes (
  id          uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references public.carteiras(id) on delete cascade,
  data        date not null,
  tipo        public.tipo_operacao not null,
  ticker      text not null,
  classe      text not null default 'Outro',
  quantidade  numeric(20,8) not null,
  preco       numeric(20,8) not null default 0,
  taxas       numeric(20,4) not null default 0,
  corretora   text,
  nota        text,
  digital     text,                       -- impressão da linha do extrato da B3
  criado_em   timestamptz not null default now()
);
create index if not exists idx_ops_carteira on public.operacoes(carteira_id, data);
create unique index if not exists idx_ops_digital
  on public.operacoes(carteira_id, digital);

create table if not exists public.proventos (
  id          uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references public.carteiras(id) on delete cascade,
  data        date not null,
  ticker      text not null,
  classe      text not null default 'Outro',
  tipo        text not null default 'Dividendo',
  valor       numeric(20,4) not null,
  digital     text,
  criado_em   timestamptz not null default now()
);
create index if not exists idx_pv_carteira on public.proventos(carteira_id, data);
create unique index if not exists idx_pv_digital
  on public.proventos(carteira_id, digital);

create table if not exists public.cotacoes (
  carteira_id uuid not null references public.carteiras(id) on delete cascade,
  ticker      text not null,
  preco       numeric(20,8) not null,
  origem      text not null default 'manual',
  atualizado  timestamptz not null default now(),
  primary key (carteira_id, ticker)
);

-- ------------------------------------------------------------
--  Alocação alvo — por classe e por ativo dentro da classe
-- ------------------------------------------------------------
create table if not exists public.alocacao_alvo (
  id          uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references public.carteiras(id) on delete cascade,
  nivel       text not null check (nivel in ('classe','ativo')),
  chave       text not null,              -- nome da classe, ou ticker
  classe_pai  text,                       -- só para nivel = 'ativo'
  percentual  numeric(7,4) not null check (percentual >= 0 and percentual <= 100),
  unique (carteira_id, nivel, chave)
);

-- ------------------------------------------------------------
--  Preço teto — premissas por ativo
-- ------------------------------------------------------------
create table if not exists public.premissas_teto (
  carteira_id     uuid not null references public.carteiras(id) on delete cascade,
  ticker          text not null,
  dpa             numeric(20,8),   -- dividendo por ação, média dos últimos anos
  lpa             numeric(20,8),   -- lucro por ação
  vpa             numeric(20,8),   -- valor patrimonial por ação ou por cota
  yield_exigido   numeric(7,4)  default 6,      -- Bazin, em %
  taxa_exigida    numeric(7,4)  default 10,     -- Gordon, em %
  crescimento     numeric(7,4)  default 3,      -- Gordon, em %
  margem          numeric(7,4)  default 0,      -- margem de segurança, em %
  metodos         text[]        default array['bazin','graham','gordon'],
  nota            text,
  atualizado      timestamptz not null default now(),
  primary key (carteira_id, ticker)
);

-- ------------------------------------------------------------
--  RLS
-- ------------------------------------------------------------
alter table public.perfis         enable row level security;
alter table public.carteiras      enable row level security;
alter table public.acessos        enable row level security;
alter table public.convites       enable row level security;
alter table public.operacoes      enable row level security;
alter table public.proventos      enable row level security;
alter table public.cotacoes       enable row level security;
alter table public.alocacao_alvo  enable row level security;
alter table public.premissas_teto enable row level security;

drop policy if exists p_perfis_self on public.perfis;
create policy p_perfis_self on public.perfis for select using (
  id = auth.uid()
  or exists (select 1 from public.acessos a join public.acessos b
               on a.carteira_id = b.carteira_id
             where a.usuario_id = auth.uid() and b.usuario_id = perfis.id)
);

drop policy if exists p_cart_ler on public.carteiras;
create policy p_cart_ler on public.carteiras for select using (public.pode_ler(id));
drop policy if exists p_cart_alterar on public.carteiras;
create policy p_cart_alterar on public.carteiras for update using (public.e_dono(id));
drop policy if exists p_cart_apagar on public.carteiras;
create policy p_cart_apagar on public.carteiras for delete using (public.e_dono(id));

drop policy if exists p_acessos_ler on public.acessos;
create policy p_acessos_ler on public.acessos for select using (
  usuario_id = auth.uid() or public.pode_ler(carteira_id));
drop policy if exists p_acessos_dono on public.acessos;
create policy p_acessos_dono on public.acessos for all
  using (public.e_dono(carteira_id)) with check (public.e_dono(carteira_id));

drop policy if exists p_convites_dono on public.convites;
create policy p_convites_dono on public.convites for all
  using (public.e_dono(carteira_id)) with check (public.e_dono(carteira_id));

-- as cinco tabelas de conteúdo seguem a mesma regra
do $$
declare t text;
begin
  foreach t in array array['operacoes','proventos','cotacoes','alocacao_alvo','premissas_teto'] loop
    execute format('drop policy if exists p_%1$s_ler on public.%1$s', t);
    execute format('create policy p_%1$s_ler on public.%1$s for select using (public.pode_ler(carteira_id))', t);
    execute format('drop policy if exists p_%1$s_escrever on public.%1$s', t);
    execute format($f$create policy p_%1$s_escrever on public.%1$s for all
                      using (public.pode_escrever(carteira_id))
                      with check (public.pode_escrever(carteira_id))$f$, t);
  end loop;
end $$;

-- ------------------------------------------------------------
--  Origem das premissas de preço teto
--  Marca o que veio de busca automática, para que a próxima busca
--  não sobrescreva número conferido à mão no balanço.
-- ------------------------------------------------------------
alter table public.premissas_teto
  add column if not exists origem text not null default 'manual';

-- ------------------------------------------------------------
--  Origem do lançamento
--  Distingue o que veio do relatório de Negociação do que veio da
--  Movimentação, para localizar duplicatas entre os dois.
-- ------------------------------------------------------------
alter table public.operacoes
  add column if not exists fonte text;

-- ------------------------------------------------------------
--  Classificação por ativo
--  A classe deixa de viver em cada operação e passa a ser uma
--  decisão sua, por papel. O que você definir aqui vence qualquer
--  dedução automática, sempre.
-- ------------------------------------------------------------
create table if not exists public.classificacao (
  carteira_id uuid not null references public.carteiras(id) on delete cascade,
  ticker      text not null,
  classe      text not null,
  atualizado  timestamptz not null default now(),
  primary key (carteira_id, ticker)
);

alter table public.classificacao enable row level security;

drop policy if exists p_classificacao_ler on public.classificacao;
create policy p_classificacao_ler on public.classificacao
  for select using (public.pode_ler(carteira_id));

drop policy if exists p_classificacao_escrever on public.classificacao;
create policy p_classificacao_escrever on public.classificacao
  for all using (public.pode_escrever(carteira_id))
  with check (public.pode_escrever(carteira_id));

-- ------------------------------------------------------------
--  Histórico de patrimônio
--  Uma fotografia por dia do valor de mercado e do custo. Alimenta o
--  gráfico "Evolução do Patrimônio". Não existe preço histórico dos
--  ativos disponível de graça — por isso o histórico só começa a se
--  formar a partir do dia em que a carteira é aberta com esta versão
--  do app, e cresce um ponto por dia daí em diante.
-- ------------------------------------------------------------
create table if not exists public.patrimonio_historico (
  carteira_id uuid not null references public.carteiras(id) on delete cascade,
  data        date not null,
  valor       numeric(20,2) not null,
  custo       numeric(20,2) not null,
  criado_em   timestamptz not null default now(),
  primary key (carteira_id, data)
);

alter table public.patrimonio_historico enable row level security;

drop policy if exists p_patrimonio_historico_ler on public.patrimonio_historico;
create policy p_patrimonio_historico_ler on public.patrimonio_historico
  for select using (public.pode_ler(carteira_id));

drop policy if exists p_patrimonio_historico_escrever on public.patrimonio_historico;
create policy p_patrimonio_historico_escrever on public.patrimonio_historico
  for all using (public.pode_escrever(carteira_id))
  with check (public.pode_escrever(carteira_id));

-- ------------------------------------------------------------
--  Administradores
--  Quem pode convidar gente nova para o gminvest. Gerenciado só por SQL
--  direto no Supabase — não existe tela para isso, de propósito: é uma
--  ação rara e sensível o bastante para não precisar de interface.
--
--  Depois de rodar este arquivo, torne a SUA PRÓPRIA conta administradora
--  (troque o e-mail e rode uma vez só):
--
--    insert into public.administradores (usuario_id)
--    select id from auth.users where email = 'seuemail@exemplo.com'
--    on conflict do nothing;
-- ------------------------------------------------------------
create table if not exists public.administradores (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  criado_em  timestamptz not null default now()
);

alter table public.administradores enable row level security;

drop policy if exists p_admin_le_a_si_mesmo on public.administradores;
create policy p_admin_le_a_si_mesmo on public.administradores
  for select using (usuario_id = auth.uid());
-- sem policy de insert/update/delete: só dá para mexer nesta tabela pelo
-- SQL Editor (ou pela service_role, usada só dentro da função de convite)

-- ------------------------------------------------------------
--  Cadastro fechado por convite
--  Ninguém cria conta sozinho, e o convite não empresta acesso a nenhuma
--  carteira sua — é uma conta nova e independente, do zero. Quem convida
--  (um administrador) manda um e-mail de verdade, com um link que deixa
--  a pessoa definir a própria senha; ao entrar pela primeira vez, ela cai
--  direto na tela de "criar minha primeira carteira", sem vínculo com
--  ninguém.
--
--  O gate é imposto no próprio banco (gatilho em auth.users), não só na
--  tela — chamar a API de cadastro por fora do app também é barrado.
--  Continua aceitando também quem foi convidado para compartilhar uma
--  carteira específica (a tabela "convites" de sempre), sem mudar aquele
--  fluxo.
-- ------------------------------------------------------------
create table if not exists public.convites_cadastro (
  email         text primary key,
  usuario_id    uuid references auth.users(id) on delete set null,
  convidado_por uuid references auth.users(id),
  criado_em     timestamptz not null default now(),
  usado_em      timestamptz
);

alter table public.convites_cadastro enable row level security;

-- ninguém escreve por aqui com a chave anon — só a função de convite,
-- com a service_role. A leitura é liberada só para administradores, para
-- alimentar o painel "Convites enviados".
drop policy if exists p_convites_cadastro_admin_le on public.convites_cadastro;
create policy p_convites_cadastro_admin_le on public.convites_cadastro
  for select using (exists (select 1 from public.administradores where usuario_id = auth.uid()));

-- a própria pessoa convidada marca o convite como concluído, no momento
-- em que define a senha — nunca antes disso, então "usado_em" preenchido
-- significa mesmo que ela terminou de entrar, não só que clicou no link.
create or replace function public.marcar_convite_usado()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.convites_cadastro
  set usado_em = now()
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and usado_em is null;
end $$;

create or replace function public.verificar_convite_cadastro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.convites where lower(email) = lower(new.email))
     and not exists (select 1 from public.convites_cadastro where lower(email) = lower(new.email)) then
    raise exception 'Cadastro fechado: peça um convite a quem administra o gminvest.';
  end if;
  return new;
end $$;

drop trigger if exists trg_verificar_convite on auth.users;
create trigger trg_verificar_convite before insert on auth.users
  for each row execute function public.verificar_convite_cadastro();

-- ------------------------------------------------------------
--  Segmento — uma camada entre classe e ativo
--  BBAS3 e BRBI11 são Ação, mas um é Banco, o outro Serviços
--  Financeiros. Definir o alvo por segmento (Bancos, Energia,
--  Shoppings...) e deixar o app distribuir para os ativos daquele
--  segmento é mais natural do que digitar o percentual ativo a ativo.
-- ------------------------------------------------------------
create table if not exists public.segmentos (
  carteira_id uuid not null references public.carteiras(id) on delete cascade,
  ticker      text not null,
  segmento    text not null,
  atualizado  timestamptz not null default now(),
  primary key (carteira_id, ticker)
);

alter table public.segmentos enable row level security;

drop policy if exists p_segmentos_ler on public.segmentos;
create policy p_segmentos_ler on public.segmentos
  for select using (public.pode_ler(carteira_id));

drop policy if exists p_segmentos_escrever on public.segmentos;
create policy p_segmentos_escrever on public.segmentos
  for all using (public.pode_escrever(carteira_id))
  with check (public.pode_escrever(carteira_id));

-- a alocação alvo passa a aceitar um terceiro nível, além de classe e ativo
alter table public.alocacao_alvo drop constraint if exists alocacao_alvo_nivel_check;
alter table public.alocacao_alvo add constraint alocacao_alvo_nivel_check
  check (nivel in ('classe','segmento','ativo'));

-- ------------------------------------------------------------
--  Reserva de emergência
--  Não é posição de carteira — é dinheiro de liquidez diária, fora da
--  bolsa. O app só guarda a meta e o valor atual, que a pessoa mesma
--  atualiza; não há como ler o saldo de uma caixinha de banco daqui.
-- ------------------------------------------------------------
create table if not exists public.reserva_emergencia (
  carteira_id uuid primary key references public.carteiras(id) on delete cascade,
  meta        numeric(20,2) not null default 0,
  atual       numeric(20,2) not null default 0,
  atualizado  timestamptz not null default now()
);

alter table public.reserva_emergencia enable row level security;

drop policy if exists p_reserva_ler on public.reserva_emergencia;
create policy p_reserva_ler on public.reserva_emergencia
  for select using (public.pode_ler(carteira_id));

drop policy if exists p_reserva_escrever on public.reserva_emergencia;
create policy p_reserva_escrever on public.reserva_emergencia
  for all using (public.pode_escrever(carteira_id))
  with check (public.pode_escrever(carteira_id));

-- ------------------------------------------------------------
--  Detalhes de Renda Fixa
--  CDB, LCI, LCA e afins não têm código de bolsa, então a operação
--  ganha um ticker sintético (emissor + vencimento). Os campos que só
--  fazem sentido para renda fixa — indexador, taxa, vencimento,
--  liquidez diária — ficam numa tabela à parte, não na tabela geral
--  de operações, que serviria de nada para ação ou FII.
-- ------------------------------------------------------------
create table if not exists public.detalhes_renda_fixa (
  operacao_id     uuid primary key references public.operacoes(id) on delete cascade,
  emissor         text,
  subtipo         text,      -- CDB, LCI, LCA, CRI, CRA, Debênture, Letra Financeira...
  indexador       text,      -- CDI, IPCA, Selic, Prefixado
  taxa            numeric(9,4),  -- percentual contratado: 110 (110% do CDI) ou 6.5 (IPCA + 6,5%)
  forma           text,      -- Pós-fixado, Prefixado, Híbrido
  liquidez_diaria boolean not null default false,
  vencimento      date
);

alter table public.detalhes_renda_fixa enable row level security;

drop policy if exists p_detalhes_rf_ler on public.detalhes_renda_fixa;
create policy p_detalhes_rf_ler on public.detalhes_renda_fixa for select using (
  exists (select 1 from public.operacoes o where o.id = operacao_id and public.pode_ler(o.carteira_id))
);

drop policy if exists p_detalhes_rf_escrever on public.detalhes_renda_fixa;
create policy p_detalhes_rf_escrever on public.detalhes_renda_fixa for all using (
  exists (select 1 from public.operacoes o where o.id = operacao_id and public.pode_escrever(o.carteira_id))
) with check (
  exists (select 1 from public.operacoes o where o.id = operacao_id and public.pode_escrever(o.carteira_id))
);

-- ------------------------------------------------------------
--  Cores por classe
--  De fábrica, cada classe tem uma cor fixa no código. Aqui a pessoa
--  pode trocar — vale para o gráfico de "Ativos na carteira" e para os
--  indicadores coloridos de classe em outras telas.
-- ------------------------------------------------------------
create table if not exists public.cores_classe (
  carteira_id uuid not null references public.carteiras(id) on delete cascade,
  classe      text not null,
  cor         text not null,
  atualizado  timestamptz not null default now(),
  primary key (carteira_id, classe)
);

alter table public.cores_classe enable row level security;

drop policy if exists p_cores_classe_ler on public.cores_classe;
create policy p_cores_classe_ler on public.cores_classe
  for select using (public.pode_ler(carteira_id));

drop policy if exists p_cores_classe_escrever on public.cores_classe;
create policy p_cores_classe_escrever on public.cores_classe
  for all using (public.pode_escrever(carteira_id))
  with check (public.pode_escrever(carteira_id));
