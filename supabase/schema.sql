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
  pvp_maximo      numeric(7,4)  default 1.1,    -- teto por patrimônio, principalmente para FII
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
--  carteira sua — é uma conta nova e independente, do zero.
--
--  O convite é um token próprio, gerado por aqui — não passa pela conta de
--  e-mail nem pelo link mágico do Supabase. Só a hash do token fica salva;
--  o token bruto some depois de gerado, então nem um vazamento do banco
--  entrega convites válidos. Isso também evita um problema real: link
--  mágico é de uso único, e o WhatsApp (e a maioria dos apps de mensagem)
--  pré-carrega o link para montar a prévia antes de qualquer humano
--  clicar — o que já queimava o token do Supabase sozinho. Aqui, abrir o
--  link (GET) não consome nada; só o envio da senha (POST) consome.
--
--  O gate de "só quem foi convidado pode ter conta" continua imposto no
--  próprio banco (gatilho em auth.users), como sempre — chamar a API de
--  cadastro por fora do app também é barrado. Continua aceitando também
--  quem foi convidado para compartilhar uma carteira específica (a tabela
--  "convites" de sempre), sem mudar aquele fluxo.
-- ------------------------------------------------------------
create table if not exists public.convites_cadastro (
  email         text primary key,
  token_hash    text,
  expira_em     timestamptz,
  usuario_id    uuid references auth.users(id) on delete set null,
  convidado_por uuid references auth.users(id),
  criado_em     timestamptz not null default now(),
  usado_em      timestamptz
);
create unique index if not exists ux_convites_cadastro_token on public.convites_cadastro(token_hash);

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

-- ------------------------------------------------------------
--  Alvo por segmento e por ativo passam a valer dentro da classe, não
--  mais sobre a carteira inteira. Isso deixa o nome de um segmento livre
--  para se repetir em classes diferentes (ex.: "Diversos" em Ação e em
--  FII) sem colidir — a trava de duplicidade da tabela precisa saber
--  disso, senão dois segmentos de mesmo nome em classes diferentes
--  travariam um no outro.
--
--  classe_pai é nulo para alvo de classe (não tem "classe pai" de si
--  mesma) — e o Postgres nunca trata dois nulos como iguais numa
--  constraint normal de unicidade, o que destravaria sem querer a
--  duplicidade de classe. Por isso é um índice com coalesce, não uma
--  constraint direta: nulo vira string vazia só para efeito da trava.
-- ------------------------------------------------------------
do $$
declare nome_constraint text;
begin
  select conname into nome_constraint
  from pg_constraint
  where conrelid = 'public.alocacao_alvo'::regclass and contype = 'u';
  if nome_constraint is not null then
    execute format('alter table public.alocacao_alvo drop constraint %I', nome_constraint);
  end if;
end $$;

drop index if exists public.alocacao_alvo_unico;
create unique index alocacao_alvo_unico
  on public.alocacao_alvo (carteira_id, nivel, chave, coalesce(classe_pai, ''));

-- ------------------------------------------------------------
--  Premissas de preço teto — coluna nova para o modelo de teto por P/VP,
--  pensado principalmente para FII (onde Graham não se aplica).
-- ------------------------------------------------------------
alter table public.premissas_teto add column if not exists pvp_maximo numeric(7,4) default 1.1;

-- ------------------------------------------------------------
--  Comparação anônima de premissas entre carteiras
--
--  Só devolve números agregados (mediana, quantidade) de um ticker,
--  nunca uma linha identificável nem de qual carteira ela veio — é a
--  única informação no gminvest que atravessa a fronteira normal de
--  "só quem tem acesso a esta carteira vê o dado desta carteira".
--  A sua própria carteira fica de fora da conta, para comparar com
--  "os outros", não consigo mesmo.
-- ------------------------------------------------------------
create or replace function public.premissas_da_comunidade(p_ticker text, p_carteira_id uuid)
returns table(quantidade bigint, mediana_dpa numeric, mediana_lpa numeric, mediana_vpa numeric,
              mediana_yield numeric, mediana_pvp_maximo numeric)
language sql security definer set search_path = public as $$
  select
    count(*)::bigint,
    percentile_cont(0.5) within group (order by dpa),
    percentile_cont(0.5) within group (order by lpa),
    percentile_cont(0.5) within group (order by vpa),
    percentile_cont(0.5) within group (order by yield_exigido),
    percentile_cont(0.5) within group (order by pvp_maximo)
  from public.premissas_teto
  where upper(ticker) = upper(p_ticker)
    and carteira_id <> p_carteira_id
    and auth.uid() is not null
$$;

grant execute on function public.premissas_da_comunidade(text, uuid) to authenticated;

-- ------------------------------------------------------------
--  Gordon Ajustado para FII — a taxa exigida deixa de ser um número
--  solto e passa a ser composta: taxa livre de risco (o Tesouro que
--  serve de referência) + prêmio de risco que você escolhe. O valor
--  somado continua guardado em taxa_exigida, para o motor de cálculo
--  não precisar saber de onde ele veio.
-- ------------------------------------------------------------
alter table public.premissas_teto add column if not exists tipo_fii text check (tipo_fii in ('tijolo','papel'));
alter table public.premissas_teto add column if not exists taxa_livre_risco numeric(7,4);
alter table public.premissas_teto add column if not exists premio_risco numeric(7,4) default 2;
alter table public.premissas_teto add column if not exists ajustar_ir boolean default true;
alter table public.premissas_teto add column if not exists aliquota_ir numeric(7,4) default 15;

-- ------------------------------------------------------------
--  Guarda o preço teto já calculado junto da premissa. Cada carteira
--  pode escolher uma combinação diferente de modelos, então não dá pra
--  reconstruir um "teto típico" só a partir dos insumos (DPA, VPA...) —
--  é preciso guardar o resultado final para poder comparar de verdade.
-- ------------------------------------------------------------
alter table public.premissas_teto add column if not exists teto_calculado numeric(20,8);

-- o retorno da função mudou (ganhou uma coluna) — "create or replace" não
-- permite trocar o formato de saída, então precisa apagar e recriar
drop function if exists public.premissas_da_comunidade(text, uuid);

create function public.premissas_da_comunidade(p_ticker text, p_carteira_id uuid)
returns table(quantidade bigint, mediana_dpa numeric, mediana_lpa numeric, mediana_vpa numeric,
              mediana_yield numeric, mediana_pvp_maximo numeric, mediana_teto numeric)
language sql security definer set search_path = public as $$
  select
    count(*)::bigint,
    percentile_cont(0.5) within group (order by dpa),
    percentile_cont(0.5) within group (order by lpa),
    percentile_cont(0.5) within group (order by vpa),
    percentile_cont(0.5) within group (order by yield_exigido),
    percentile_cont(0.5) within group (order by pvp_maximo),
    percentile_cont(0.5) within group (order by teto_calculado) filter (where teto_calculado is not null)
  from public.premissas_teto
  where upper(ticker) = upper(p_ticker)
    and carteira_id <> p_carteira_id
    and auth.uid() is not null
$$;

grant execute on function public.premissas_da_comunidade(text, uuid) to authenticated;

-- ------------------------------------------------------------
--  A comparação com a comunidade passa a mostrar o MENOR teto calculado
--  entre outras carteiras, não a mediana — consistente com o resto do
--  sistema, que sempre prefere o número mais conservador quando há mais
--  de uma referência (é a mesma regra de "o teto que vale é o mais baixo
--  entre os modelos escolhidos", agora estendida à comparação entre
--  carteiras).
-- ------------------------------------------------------------
drop function if exists public.premissas_da_comunidade(text, uuid);

create function public.premissas_da_comunidade(p_ticker text, p_carteira_id uuid)
returns table(quantidade bigint, mediana_dpa numeric, mediana_lpa numeric, mediana_vpa numeric,
              mediana_yield numeric, mediana_pvp_maximo numeric, menor_teto numeric)
language sql security definer set search_path = public as $$
  select
    count(*)::bigint,
    percentile_cont(0.5) within group (order by dpa),
    percentile_cont(0.5) within group (order by lpa),
    percentile_cont(0.5) within group (order by vpa),
    percentile_cont(0.5) within group (order by yield_exigido),
    percentile_cont(0.5) within group (order by pvp_maximo),
    min(teto_calculado) filter (where teto_calculado is not null)
  from public.premissas_teto
  where upper(ticker) = upper(p_ticker)
    and carteira_id <> p_carteira_id
    and auth.uid() is not null
$$;

grant execute on function public.premissas_da_comunidade(text, uuid) to authenticated;

-- ------------------------------------------------------------
--  Registro de aceite dos Termos de Uso e da Política de Privacidade,
--  guardado no momento da criação da conta.
-- ------------------------------------------------------------
alter table public.perfis add column if not exists aceitou_termos_em timestamptz;

-- ------------------------------------------------------------
--  Para o caminho legado (DefinirSenha, quando a pessoa já chega
--  autenticada pelo link do Supabase) — grava só a própria data de
--  aceite, na própria linha. Não dá uma política de update geral em
--  perfis porque isso deixaria e-mail e nome editáveis por conta própria,
--  o que não é a ideia — essa função só toca a coluna do aceite.
-- ------------------------------------------------------------
create or replace function public.registrar_aceite_termos()
returns void language sql security definer set search_path = public as $$
  update public.perfis set aceitou_termos_em = now() where id = auth.uid()
$$;

grant execute on function public.registrar_aceite_termos() to authenticated;

-- ------------------------------------------------------------
--  Segmento padrão por ticker — uma sugestão compartilhada entre todo
--  mundo que usa o gmINVEST, para não precisar etiquetar PETR4 como
--  "Petróleo, Gás e Combustíveis" ativo por ativo, carteira por carteira.
--  É só um PONTO DE PARTIDA: continua sendo possível escrever um nome
--  diferente por cima, carteira por carteira, como sempre foi.
--
--  Leitura é livre pra qualquer conta logada — é a mesma lista pra todo
--  mundo, não tem nada de privado aqui. Escrita é só de administrador,
--  porque alguém precisa ser responsável por manter isso atualizado.
-- ------------------------------------------------------------
create table if not exists public.segmentos_padrao (
  ticker     text primary key,
  classe     text not null,
  segmento   text not null,
  atualizado timestamptz not null default now()
);

alter table public.segmentos_padrao enable row level security;

drop policy if exists p_segmentos_padrao_ler on public.segmentos_padrao;
create policy p_segmentos_padrao_ler on public.segmentos_padrao
  for select using (auth.uid() is not null);

drop policy if exists p_segmentos_padrao_escrever on public.segmentos_padrao;
create policy p_segmentos_padrao_escrever on public.segmentos_padrao
  for all using (exists (select 1 from public.administradores where usuario_id = auth.uid()))
  with check (exists (select 1 from public.administradores where usuario_id = auth.uid()));

-- povoamento inicial — os nomes de segmento batem com a lista sugerida
-- que já existe no aplicativo (src/lib/formato.js, SEGMENTOS_SUGERIDOS).
-- Não é uma lista completa da bolsa — é um começo sólido com os ativos
-- mais líquidos de cada segmento. `on conflict do nothing` permite rodar
-- este arquivo de novo sem sobrescrever uma correção manual já feita.
insert into public.segmentos_padrao (ticker, classe, segmento) values
  -- Ação — Bancos e Serviços Financeiros
  ('ITUB4','Ação','Bancos e Serviços Financeiros'), ('ITUB3','Ação','Bancos e Serviços Financeiros'),
  ('BBDC4','Ação','Bancos e Serviços Financeiros'), ('BBDC3','Ação','Bancos e Serviços Financeiros'),
  ('BBAS3','Ação','Bancos e Serviços Financeiros'), ('SANB11','Ação','Bancos e Serviços Financeiros'),
  ('BPAC11','Ação','Bancos e Serviços Financeiros'), ('BBSE3','Ação','Bancos e Serviços Financeiros'),
  ('B3SA3','Ação','Bancos e Serviços Financeiros'), ('CIEL3','Ação','Bancos e Serviços Financeiros'),
  ('BPAN4','Ação','Bancos e Serviços Financeiros'), ('IRBR3','Ação','Bancos e Serviços Financeiros'),
  ('PSSA3','Ação','Bancos e Serviços Financeiros'), ('CXSE3','Ação','Bancos e Serviços Financeiros'),
  -- Ação — Energia Elétrica
  ('ELET3','Ação','Energia Elétrica'), ('ELET6','Ação','Energia Elétrica'), ('CMIG4','Ação','Energia Elétrica'),
  ('CPFE3','Ação','Energia Elétrica'), ('EGIE3','Ação','Energia Elétrica'), ('TAEE11','Ação','Energia Elétrica'),
  ('CPLE6','Ação','Energia Elétrica'), ('CPLE3','Ação','Energia Elétrica'), ('EQTL3','Ação','Energia Elétrica'),
  ('ENGI11','Ação','Energia Elétrica'), ('AURE3','Ação','Energia Elétrica'), ('NEOE3','Ação','Energia Elétrica'),
  ('ENEV3','Ação','Energia Elétrica'), ('AESB3','Ação','Energia Elétrica'),
  -- Ação — Petróleo, Gás e Combustíveis
  ('PETR4','Ação','Petróleo, Gás e Combustíveis'), ('PETR3','Ação','Petróleo, Gás e Combustíveis'),
  ('PRIO3','Ação','Petróleo, Gás e Combustíveis'), ('RRRP3','Ação','Petróleo, Gás e Combustíveis'),
  ('UGPA3','Ação','Petróleo, Gás e Combustíveis'), ('VBBR3','Ação','Petróleo, Gás e Combustíveis'),
  ('CSAN3','Ação','Petróleo, Gás e Combustíveis'), ('RECV3','Ação','Petróleo, Gás e Combustíveis'),
  -- Ação — Mineração e Siderurgia
  ('VALE3','Ação','Mineração e Siderurgia'), ('CSNA3','Ação','Mineração e Siderurgia'),
  ('GGBR4','Ação','Mineração e Siderurgia'), ('GOAU4','Ação','Mineração e Siderurgia'),
  ('USIM5','Ação','Mineração e Siderurgia'), ('CMIN3','Ação','Mineração e Siderurgia'),
  -- Ação — Construção e Imobiliário
  ('CYRE3','Ação','Construção e Imobiliário'), ('EZTC3','Ação','Construção e Imobiliário'),
  ('MRVE3','Ação','Construção e Imobiliário'), ('EVEN3','Ação','Construção e Imobiliário'),
  ('DIRR3','Ação','Construção e Imobiliário'), ('TEND3','Ação','Construção e Imobiliário'),
  ('JHSF3','Ação','Construção e Imobiliário'), ('CURY3','Ação','Construção e Imobiliário'),
  ('TRIS3','Ação','Construção e Imobiliário'),
  -- Ação — Varejo e Consumo
  ('MGLU3','Ação','Varejo e Consumo'), ('LREN3','Ação','Varejo e Consumo'), ('RENT3','Ação','Varejo e Consumo'),
  ('VIVA3','Ação','Varejo e Consumo'), ('PETZ3','Ação','Varejo e Consumo'), ('ARZZ3','Ação','Varejo e Consumo'),
  ('CEAB3','Ação','Varejo e Consumo'), ('AMAR3','Ação','Varejo e Consumo'), ('SBFG3','Ação','Varejo e Consumo'),
  ('ALPA4','Ação','Varejo e Consumo'), ('GUAR3','Ação','Varejo e Consumo'),
  -- Ação — Alimentos e Bebidas
  ('ABEV3','Ação','Alimentos e Bebidas'), ('JBSS3','Ação','Alimentos e Bebidas'),
  ('BRFS3','Ação','Alimentos e Bebidas'), ('MRFG3','Ação','Alimentos e Bebidas'),
  ('BEEF3','Ação','Alimentos e Bebidas'), ('SMTO3','Ação','Alimentos e Bebidas'),
  ('CAML3','Ação','Alimentos e Bebidas'),
  -- Ação — Indústria e Bens de Capital
  ('WEGE3','Ação','Indústria e Bens de Capital'), ('EMBR3','Ação','Indústria e Bens de Capital'),
  ('RAPT4','Ação','Indústria e Bens de Capital'), ('TUPY3','Ação','Indústria e Bens de Capital'),
  ('POMO4','Ação','Indústria e Bens de Capital'), ('KEPL3','Ação','Indústria e Bens de Capital'),
  ('MTSA4','Ação','Indústria e Bens de Capital'),
  -- Ação — Tecnologia e Software
  ('TOTS3','Ação','Tecnologia e Software'), ('LWSA3','Ação','Tecnologia e Software'),
  ('POSI3','Ação','Tecnologia e Software'),
  -- Ação — Telecomunicações e Mídia
  ('VIVT3','Ação','Telecomunicações e Mídia'), ('TIMS3','Ação','Telecomunicações e Mídia'),
  -- Ação — Saúde e Farmacêutico
  ('RADL3','Ação','Saúde e Farmacêutico'), ('HAPV3','Ação','Saúde e Farmacêutico'),
  ('FLRY3','Ação','Saúde e Farmacêutico'), ('RDOR3','Ação','Saúde e Farmacêutico'),
  ('HYPE3','Ação','Saúde e Farmacêutico'), ('PNVL3','Ação','Saúde e Farmacêutico'),
  ('QUAL3','Ação','Saúde e Farmacêutico'), ('ONCO3','Ação','Saúde e Farmacêutico'),
  -- Ação — Transportes e Logística
  ('RAIL3','Ação','Transportes e Logística'), ('CCRO3','Ação','Transportes e Logística'),
  ('STBP3','Ação','Transportes e Logística'), ('AZUL4','Ação','Transportes e Logística'),
  ('GOLL4','Ação','Transportes e Logística'), ('ECOR3','Ação','Transportes e Logística'),
  ('JSLG3','Ação','Transportes e Logística'),
  -- Ação — Agronegócio e Papel & Celulose
  ('SUZB3','Ação','Agronegócio e Papel & Celulose'), ('KLBN11','Ação','Agronegócio e Papel & Celulose'),
  ('SLCE3','Ação','Agronegócio e Papel & Celulose'), ('SOJA3','Ação','Agronegócio e Papel & Celulose'),
  ('AGRO3','Ação','Agronegócio e Papel & Celulose'), ('RAIZ4','Ação','Agronegócio e Papel & Celulose'),
  -- Ação — Utilidades e Serviços Públicos
  ('SBSP3','Ação','Utilidades e Serviços Públicos'), ('SAPR11','Ação','Utilidades e Serviços Públicos'),
  ('CSMG3','Ação','Utilidades e Serviços Públicos'), ('ORVR3','Ação','Utilidades e Serviços Públicos'),
  -- Ação — Diversificado / Holding
  ('ITSA4','Ação','Diversificado / Holding'), ('SIMH3','Ação','Diversificado / Holding'),

  -- FII — Logística
  ('HGLG11','FII','Logística'), ('XPLG11','FII','Logística'), ('VILG11','FII','Logística'),
  ('BTLG11','FII','Logística'), ('LVBI11','FII','Logística'), ('GGRC11','FII','Logística'),
  ('BRCO11','FII','Logística'), ('ALZR11','FII','Logística'),
  -- FII — Shopping Centers
  ('XPML11','FII','Shopping Centers'), ('VISC11','FII','Shopping Centers'), ('HGBS11','FII','Shopping Centers'),
  ('MALL11','FII','Shopping Centers'), ('VRTA11','FII','Shopping Centers'),
  -- FII — Lajes Corporativas
  ('HGRE11','FII','Lajes Corporativas'), ('PVBI11','FII','Lajes Corporativas'), ('RCRB11','FII','Lajes Corporativas'),
  ('BRCR11','FII','Lajes Corporativas'), ('JSRE11','FII','Lajes Corporativas'),
  -- FII — Híbrido
  ('KNRI11','FII','Híbrido'), ('RBRP11','FII','Híbrido'), ('HGFF11','FII','Híbrido'),
  -- FII — Renda Urbana
  ('HGRU11','FII','Renda Urbana'), ('RBRR11','FII','Renda Urbana'), ('TRXF11','FII','Renda Urbana'),
  ('HCTR11','FII','Renda Urbana'),
  -- FII — CRI / Recebíveis
  ('KNCR11','FII','CRI / Recebíveis'), ('KNSC11','FII','CRI / Recebíveis'), ('IRDM11','FII','CRI / Recebíveis'),
  ('MXRF11','FII','CRI / Recebíveis'), ('CPTS11','FII','CRI / Recebíveis'), ('VGIR11','FII','CRI / Recebíveis'),
  ('RECR11','FII','CRI / Recebíveis'), ('KNIP11','FII','CRI / Recebíveis'), ('KNHY11','FII','CRI / Recebíveis'),
  ('AFHI11','FII','CRI / Recebíveis'), ('DEVA11','FII','CRI / Recebíveis'), ('VCJR11','FII','CRI / Recebíveis'),
  ('HGCR11','FII','CRI / Recebíveis'), ('RZTR11','FII','CRI / Recebíveis'), ('BRBI11','FII','CRI / Recebíveis'),
  -- FII — Fundo de Fundos (FOF)
  ('BCFF11','FII','Fundo de Fundos (FOF)'), ('RBFF11','FII','Fundo de Fundos (FOF)'), ('KFOF11','FII','Fundo de Fundos (FOF)'),
  ('MFII11','FII','Fundo de Fundos (FOF)'), ('XPSF11','FII','Fundo de Fundos (FOF)'),
  -- FII — Agronegócio / Fiagro
  ('FGAA11','FII','Agronegócio / Fiagro'), ('RZAG11','FII','Agronegócio / Fiagro'), ('VGIA11','FII','Agronegócio / Fiagro'),
  ('KNCA11','FII','Agronegócio / Fiagro'), ('AAZQ11','FII','Agronegócio / Fiagro'),
  -- FII — Educacional
  ('AEFI11','FII','Educacional'), ('FCFL11','FII','Educacional'),
  -- FII — Hospitalar
  ('NSLU11','FII','Hospitalar'), ('HOSP11','FII','Hospitalar')
on conflict (ticker) do nothing;

-- ------------------------------------------------------------
--  Retirando o compartilhamento anônimo de preço teto entre carteiras —
--  função e coluna que só existiam para essa funcionalidade.
-- ------------------------------------------------------------
drop function if exists public.premissas_da_comunidade(text, uuid);
alter table public.premissas_teto drop column if exists teto_calculado;
