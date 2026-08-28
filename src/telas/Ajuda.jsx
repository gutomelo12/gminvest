import { Painel } from '../comp/base'

const PASSOS = [
  {
    titulo: 'Lance ou importe suas operações',
    onde: 'Operações, ou Importações',
    texto: 'É a base de tudo — sem elas não existe posição, preço médio nem resultado. Se você já '
      + 'investe pela B3, importe o extrato em vez de digitar ativo por ativo. Se tem ETFs '
      + 'internacionais pela Nomad, solte a nota em PDF na mesma tela, aba Nomad. CDB, LCI, LCA e afins '
      + 'entram como Renda Fixa, com um formulário próprio.',
  },
  {
    titulo: 'Confira Meus Ativos',
    onde: 'Resumo ou Posições',
    texto: 'Depois de lançar, veja se o valor de cada ativo bate com o que você tem de verdade — '
      + 'principalmente quantidade e preço médio. É mais fácil corrigir um lançamento agora do que '
      + 'depois de meses de histórico em cima.',
  },
  {
    titulo: 'Monte a reserva de emergência antes de mirar em alocação',
    onde: 'Alocação → Reserva de emergência',
    texto: '6 a 12 meses do seu custo fixo, guardado em algo de liquidez diária — não é investimento, '
      + 'é a rede de segurança que evita vender na baixa por precisar do dinheiro. O simulador de '
      + 'aporte prioriza completar isso antes de sugerir comprar mais ativos.',
  },
  {
    titulo: 'Defina a alocação alvo por classe',
    onde: 'Alocação → Por classe',
    texto: 'Quanto da carteira você quer em Ações, FIIs, Renda Fixa e assim por diante. Não existe '
      + 'número certo — depende do seu horizonte e do quanto de oscilação você aguenta ver sem mexer.',
  },
  {
    titulo: 'Se quiser mais controle, refine por segmento',
    onde: 'Alocação → Por segmento',
    texto: 'Opcional. Separe Bancos de Energia dentro de Ações, por exemplo, e defina o alvo do '
      + 'segmento — o sistema reparte esse alvo entre os ativos daquele grupo sozinho, proporcional ao '
      + 'peso atual de cada um.',
  },
  {
    titulo: 'Configure o preço teto dos ativos que acompanha de perto',
    onde: 'Preço teto',
    texto: 'Bazin, Graham e Gordon lado a lado. Alimenta o simulador de aporte, que usa o desconto '
      + 'sobre o teto para sugerir quais ativos comprar primeiro dentro de uma classe.',
  },
  {
    titulo: 'Simule o próximo aporte',
    onde: 'Alocação → Simulador de aporte',
    texto: 'Digite quanto vai investir. O sistema separa a parte que ainda falta para a reserva (se '
      + 'houver), distribui o resto entre as classes mais deficitárias, e aponta os ativos com melhor '
      + 'desconto dentro delas — só compra, nunca sugere vender.',
  },
]

const TELAS_INFO = [
  ['resumo', 'Resumo', 'Visão geral: patrimônio, lucro, rentabilidade, evolução mês a mês, aportes e a lista de ativos agrupada por classe.'],
  ['posicoes', 'Posições', 'A mesma tabela de "Meus Ativos" do Resumo, em tela cheia — clique num ativo para ver o histórico completo dele.'],
  ['operacoes', 'Operações', 'O livro de lançamentos: toda compra, venda, bonificação, desdobro e ajuste que compõe a carteira. É aqui que se edita ou apaga um lançamento.'],
  ['proventos', 'Proventos', 'Dividendos, JCP e rendimentos recebidos, com o gráfico mensal e o ranking de quais ativos mais pagaram.'],
  ['alocacao', 'Alocação', 'Cinco abas: alvo por classe, por segmento, por ativo, reserva de emergência e o simulador de aporte.'],
  ['teto', 'Preço teto', 'Bazin, Graham e Gordon para decidir se um ativo está caro ou barato frente ao que ele paga de provento.'],
  ['cotacoes', 'Cotações', 'Busca automática de preços na abertura da carteira, mais edição manual de qualquer valor — inclusive a taxa de câmbio, para quem tem ativo em dólar.'],
  ['b3', 'Importações', 'Extratos da B3 em planilha (Negociação, Movimentação, Posição) e notas de corretagem da Nomad em PDF, cada um numa aba.'],
]

const AJUSTES_INFO = [
  ['Sua conta', 'Seu e-mail e um botão para sair.'],
  ['Convidar para o gminvest', 'Só aparece para quem administra o sistema. Gera um link para uma pessoa criar conta nova, independente — não empresta acesso a nenhuma carteira sua.'],
  ['Convites enviados', 'Também só para administradores: lista quem foi convidado e se já terminou de entrar ou ainda está pendente.'],
  ['Duplicatas', 'Encontra lançamentos que parecem repetidos (mesmo ativo, quantidade e preço parecido, poucos dias de diferença) e deixa remover em lote.'],
  ['Recomeçar a carteira', 'Apaga operações e proventos, preservando cotações, alocação alvo, preço teto e classificação — para reimportar do zero quando o histórico ficou bagunçado.'],
  ['Códigos do mercado fracionário', 'Junta um ativo com sufixo F (ex.: VALE3F) com o lote padrão dele (VALE3), que é o mesmo papel negociado em quantidade menor.'],
  ['Classificação dos ativos', 'Corrige a classe de um ativo quando a dedução automática erra, ou quando você prefere outra classificação — e sugere ajustes com base no que a fonte de cotações identifica.'],
  ['Cores das classes', 'Troca a cor de cada classe usada no gráfico de "Ativos na carteira" e nos indicadores coloridos pela carteira toda.'],
  ['Quem acessa esta carteira', 'Convida outra pessoa (que já tenha conta) para ver ou editar esta carteira específica, e mostra quem já tem acesso.'],
]

export default function Ajuda({ ir }) {
  return (
    <>
      <Painel titulo="Por onde começar" aoLado="uma sequência sugerida, não uma obrigação">
        <p style={{ fontSize: 13, color: 'var(--tinta-3)', marginBottom: 18, maxWidth: 820, lineHeight: 1.6 }}>
          Nenhum passo é travado — dá para usar o sistema em qualquer ordem. Mas se você está começando
          agora, esta sequência evita o erro mais comum: montar uma alocação bonita antes de ter uma
          rede de segurança por baixo dela.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {PASSOS.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 14 }}>
              <div style={{
                flex: '0 0 auto', width: 26, height: 26, borderRadius: '50%', background: 'var(--verde-claro)',
                color: 'var(--verde)', display: 'grid', placeItems: 'center', fontFamily: 'var(--mono)',
                fontWeight: 700, fontSize: 12,
              }}>{i + 1}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.titulo}</div>
                <div className="rotulo" style={{ margin: '2px 0 6px' }}>{p.onde}</div>
                <p style={{ fontSize: 13, color: 'var(--tinta-2)', lineHeight: 1.6, maxWidth: 760 }}>{p.texto}</p>
              </div>
            </div>
          ))}
        </div>
      </Painel>

      <Painel titulo="O que cada tela faz" aoLado="clique no nome para ir direto">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {TELAS_INFO.map(([chave, nome, texto], i) => (
            <div key={chave} style={{
              display: 'flex', gap: 16, padding: '12px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--linha-2)',
            }}>
              <button className="btn mini vazio" style={{ flex: '0 0 auto', width: 110 }} onClick={() => ir(chave)}>
                {nome}
              </button>
              <p style={{ fontSize: 13, color: 'var(--tinta-2)', lineHeight: 1.6, margin: 0 }}>{texto}</p>
            </div>
          ))}
        </div>
      </Painel>

      <Painel titulo="Dentro de Ajustes" aoLado="um painel por assunto, nem todos aparecem sempre">
        <p style={{ fontSize: 13, color: 'var(--tinta-3)', marginBottom: 16, maxWidth: 820, lineHeight: 1.6 }}>
          Ajustes reúne o que não é do dia a dia — manutenção da carteira, quem tem acesso a ela, e (para
          quem administra o gminvest) o convite de contas novas. Alguns painéis só aparecem quando fazem
          sentido: "Duplicatas" some se não houver nenhuma, os de administrador somem se você não for um.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {AJUSTES_INFO.map(([nome, texto], i) => (
            <div key={nome} style={{
              display: 'flex', gap: 16, padding: '12px 0', alignItems: 'baseline',
              borderTop: i === 0 ? 'none' : '1px solid var(--linha-2)',
            }}>
              <strong style={{ flex: '0 0 auto', width: 200, fontSize: 13 }}>{nome}</strong>
              <p style={{ fontSize: 13, color: 'var(--tinta-2)', lineHeight: 1.6, margin: 0 }}>{texto}</p>
            </div>
          ))}
        </div>
        <button className="btn mini vazio" style={{ marginTop: 16 }} onClick={() => ir('ajustes')}>Ir para Ajustes</button>
      </Painel>

      <Painel titulo="Perguntas rápidas">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <strong style={{ fontSize: 13 }}>Tenho ETF americano — os valores em real ficam errados?</strong>
            <p style={{ fontSize: 13, color: 'var(--tinta-2)', lineHeight: 1.6, marginTop: 4, maxWidth: 780 }}>
              Classifique o ativo como <strong>ETFs Intern.</strong> — aí o preço fica em dólar na linha
              dele, e só entra convertido para real nos totais da carteira, usando a taxa de câmbio
              cadastrada em Cotações. Sem essa classificação, o sistema trata o número como se já fosse
              real.
            </p>
          </div>
          <div>
            <strong style={{ fontSize: 13 }}>Por que às vezes os proventos ou a rentabilidade zeram para um ativo?</strong>
            <p style={{ fontSize: 13, color: 'var(--tinta-2)', lineHeight: 1.6, marginTop: 4, maxWidth: 780 }}>
              Se faltar cotação, o ativo é avaliado pelo próprio preço médio até você definir um preço em
              Cotações — o resultado zera porque não há informação, não porque o ativo empatou de
              verdade.
            </p>
          </div>
          <div>
            <strong style={{ fontSize: 13 }}>Qual a diferença entre os papéis de acesso?</strong>
            <p style={{ fontSize: 13, color: 'var(--tinta-2)', lineHeight: 1.6, marginTop: 4, maxWidth: 780 }}>
              <strong>Leitura</strong> só vê. <strong>Edição</strong> lança e apaga operações, proventos e
              alvos. <strong>Dono</strong> tudo isso, mais convidar gente e apagar a carteira inteira.
              Configura em Ajustes → Quem acessa esta carteira.
            </p>
          </div>
          <div>
            <strong style={{ fontSize: 13 }}>Como convido alguém para usar o gminvest?</strong>
            <p style={{ fontSize: 13, color: 'var(--tinta-2)', lineHeight: 1.6, marginTop: 4, maxWidth: 780 }}>
              Cadastro é só por convite. Se você administra o sistema, gere o link em Ajustes → Convidar
              para o gminvest — é uma conta nova e independente, sem vínculo com a sua. Se você só quer
              compartilhar <em>esta carteira</em> com alguém que já tem conta, use Ajustes → Quem acessa
              esta carteira.
            </p>
          </div>
        </div>
      </Painel>
    </>
  )
}
