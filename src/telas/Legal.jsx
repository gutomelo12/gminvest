const ATUALIZADO_TERMOS = '1 de setembro de 2026'
const ATUALIZADO_PRIVACIDADE = '1 de setembro de 2026'

function Secao({ n, titulo, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
        {n}. {titulo}
      </h3>
      <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--tinta-2)' }}>{children}</div>
    </div>
  )
}

export function TermosDeUso() {
  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--tinta-3)', marginBottom: 20 }}>Última atualização: {ATUALIZADO_TERMOS}</p>

      <Secao n={1} titulo="Aceitação dos termos">
        <p>Ao criar uma conta ou usar o gmINVEST, você concorda com estes Termos de Uso e com a nossa
          Política de Privacidade. Se não concordar com qualquer parte destes termos, não crie uma conta
          nem use o serviço.</p>
      </Secao>

      <Secao n={2} titulo="O que é o gmINVEST">
        <p>O gmINVEST é uma ferramenta pessoal de acompanhamento de carteira de investimentos. Ele permite
          registrar operações de compra e venda, importar extratos da B3 e notas da Nomad, acompanhar
          proventos, definir metas de alocação, calcular preço teto por diferentes modelos (Bazin, Graham,
          Gordon e teto por P/VP) e simular aportes.</p>
        <p style={{ marginTop: 8 }}>Os cálculos de preço teto, alocação e simulação de aporte são
          ferramentas de organização pessoal baseadas nas premissas que você mesmo informa. <strong>Nada
          no gmINVEST constitui recomendação de investimento, análise de valores mobiliários ou
          aconselhamento financeiro.</strong> Toda decisão de compra, venda ou manutenção de um ativo é
          sua, e só sua.</p>
      </Secao>

      <Secao n={3} titulo="Cadastro e acesso">
        <p>O cadastro no gmINVEST é feito somente por convite de quem já administra o sistema. Você é
          responsável por manter sua senha em sigilo e por tudo que acontecer usando o seu acesso.</p>
        <p style={{ marginTop: 8 }}>Uma carteira pode ser compartilhada com outras pessoas, em três
          níveis: leitura (só visualizar), edição (lançar e apagar operações e proventos) e dono (tudo
          isso, mais convidar outras pessoas e apagar a carteira). Quem compartilha uma carteira é
          responsável por escolher com quem compartilha.</p>
      </Secao>

      <Secao n={4} titulo="Fontes de dados e precisão das informações">
        <p>Cotações e alguns indicadores fundamentalistas vêm de fontes públicas de terceiros (como o
          Yahoo Finance) e podem estar atrasados, incompletos ou incorretos. O gmINVEST não verifica a
          exatidão desses dados antes de exibi-los. Sempre que um preço não puder ser obtido, o próprio
          sistema avisa isso na tela, em vez de inventar um número.</p>
      </Secao>

      <Secao n={5} titulo="O que o gmINVEST não faz">
        <p>O gmINVEST não envia comunicações promocionais, não tem parceiros comerciais e não usa seus
          dados para publicidade. Os únicos e-mails enviados pelo sistema são os estritamente necessários
          para o funcionamento da sua conta, como convites de acesso.</p>
      </Secao>

      <Secao n={6} titulo="Cancelamento e exclusão de dados">
        <p>Você pode sair da sua conta a qualquer momento. Você também pode excluir sua própria conta
          diretamente em Ajustes → Sua conta, a qualquer momento — a ação é permanente e exige digitar
          seu e-mail para confirmar. Excluir a conta remove toda carteira sua que mais ninguém acessa,
          com tudo o que há dentro dela, e remove seu acesso a carteiras de outras pessoas, sem afetar
          essas carteiras.</p>
        <p style={{ marginTop: 8 }}>Se você for dona de uma carteira que outra pessoa também acessa, ou a
          única administradora do sistema, a exclusão fica temporariamente bloqueada até essa situação
          ser resolvida — para não remover, de forma automática, o acesso de alguém que também depende
          daquela carteira ou do próprio funcionamento do sistema.</p>
      </Secao>

      <Secao n={7} titulo="Alterações nestes termos">
        <p>Estes termos podem ser alterados a qualquer momento. Mudanças relevantes serão comunicadas
          dentro do próprio sistema. O uso continuado do gmINVEST após uma alteração vale como aceite dos
          novos termos.</p>
      </Secao>

      <Secao n={8} titulo="Limitação de responsabilidade">
        <p>O gmINVEST é fornecido "como está". Na maior extensão permitida por lei, não nos
          responsabilizamos por perdas financeiras, decisões de investimento tomadas com base nas
          informações do sistema, ou indisponibilidade temporária do serviço.</p>
      </Secao>
    </div>
  )
}

export function PoliticaPrivacidade() {
  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--tinta-3)', marginBottom: 20 }}>Última atualização: {ATUALIZADO_PRIVACIDADE}</p>

      <Secao n={1} titulo="Informações que coletamos">
        <p>Coletamos seu e-mail e senha (a senha nunca fica visível para nós — é armazenada de forma
          protegida pelo provedor de autenticação) e os dados que você mesmo insere ao usar o sistema:
          operações de compra e venda, proventos recebidos, premissas de cálculo de preço teto, metas de
          alocação e nome das carteiras que você cria.</p>
      </Secao>

      <Secao n={2} titulo="Como usamos suas informações">
        <p>Usamos essas informações exclusivamente para:</p>
        <ul style={{ margin: '8px 0 0 18px' }}>
          <li>Calcular e exibir a evolução, o resultado e o preço teto da sua carteira</li>
          <li>Permitir o compartilhamento de uma carteira com quem você escolher</li>
          <li>Enviar e-mails estritamente funcionais, como convites de acesso</li>
        </ul>
        <p style={{ marginTop: 8 }}>Não enviamos comunicação promocional, não fazemos publicidade e não
          usamos seus dados para nenhuma finalidade além do funcionamento do próprio gmINVEST.</p>
      </Secao>

      <Secao n={3} titulo="Compartilhamento de dados">
        <p>Não vendemos nem compartilhamos seus dados pessoais com terceiros para fins comerciais. Os
          dados da sua carteira só ficam visíveis para outras pessoas quando você explicitamente
          compartilha essa carteira com elas, dentro do próprio sistema.</p>
        <p style={{ marginTop: 8 }}>Os dados são armazenados usando o Supabase como provedor de
          infraestrutura (banco de dados e autenticação). Cotações são buscadas em fontes públicas de
          terceiros (como o Yahoo Finance) no momento da consulta, sem que seus dados pessoais sejam
          enviados a essas fontes.</p>
      </Secao>

      <Secao n={4} titulo="Proteção de dados">
        <p>O acesso aos dados de cada carteira é restrito por regras de segurança no próprio banco de
          dados, que garantem que só quem tem acesso concedido a uma carteira consegue ler ou alterar as
          informações dela.</p>
      </Secao>

      <Secao n={5} titulo="Seus direitos">
        <p>Você pode, a qualquer momento:</p>
        <ul style={{ margin: '8px 0 0 18px' }}>
          <li>Ver e exportar os dados da sua carteira em Ajustes → Exportar</li>
          <li>Corrigir qualquer dado incorreto diretamente pelas telas do sistema</li>
          <li>Excluir sua própria conta e os dados que só você acessa, diretamente em Ajustes → Sua conta</li>
        </ul>
      </Secao>

      <Secao n={6} titulo="Cookies e armazenamento no navegador">
        <p>O gmINVEST não usa Google Analytics, Meta Pixel, Microsoft Clarity ou qualquer outra ferramenta
          de rastreamento ou publicidade. O sistema guarda, no seu próprio navegador, apenas o que é
          necessário para manter você conectado (o token da sua sessão) e uma preferência de qual carteira
          você abriu por último — nada disso é enviado a terceiros.</p>
      </Secao>

      <Secao n={7} titulo="Alterações nesta política">
        <p>Esta política pode ser atualizada periodicamente. Mudanças relevantes serão comunicadas dentro
          do próprio sistema.</p>
      </Secao>

      <Secao n={8} titulo="Contato">
        <p>Para dúvidas sobre esta política ou para exercer os seus direitos sobre os dados, entre em
          contato com quem administra o gmINVEST na sua organização.</p>
      </Secao>
    </div>
  )
}
