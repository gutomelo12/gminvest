import { useDados } from '../ctx/Dados'
import { fmtBRL } from '../lib/formato'

/**
 * Problemas que distorcem os números e têm conserto em Ajustes.
 * Fica onde o estrago aparece, não escondido numa tela de configuração.
 */
export default function Pendencias({ ir }) {
  const { previewDuplicatas, previewFracionarios, previewClasses } = useDados()

  const dup = previewDuplicatas()
  const frac = previewFracionarios()
  const cls = previewClasses()
  if (!dup.length && !frac.length && !cls.length) return null

  // quanto de dinheiro está sendo contado duas vezes
  const emDobro = dup.reduce((s, p) => s + Math.abs(Number(p.sai.quantidade)) * Number(p.sai.preco), 0)

  const itens = []
  if (dup.length) itens.push(
    <li key="d">
      <strong>{dup.length} lançamento{dup.length === 1 ? '' : 's'} em duplicidade</strong> —{' '}
      {fmtBRL(emDobro)} contados a mais. Vem de importar os dois extratos da B3 do mesmo período.
    </li>)
  if (frac.length) itens.push(
    <li key="f">
      <strong>{frac.length} código{frac.length === 1 ? '' : 's'} do mercado fracionário</strong>{' '}
      separado{frac.length === 1 ? '' : 's'} do lote padrão
      ({frac.slice(0, 4).map(x => x.de).join(', ')}{frac.length > 4 ? '…' : ''}).
      O ativo é o mesmo e o preço médio deveria ser um só.
    </li>)
  if (cls.length) itens.push(
    <li key="c">
      <strong>{cls.length} ativo{cls.length === 1 ? '' : 's'} com classe divergente</strong> —{' '}
      {cls.slice(0, 4).map(x => `${x.ticker} está como ${x.atual}`).join(', ')}
      {cls.length > 4 ? '…' : ''}. Isso distorce a alocação.
    </li>)

  return (
    <div className="aviso atencao" style={{ marginBottom: 20 }}>
      <strong>Há {itens.length === 1 ? 'um ajuste pendente' : `${itens.length} ajustes pendentes`}.</strong>
      <ul style={{ paddingLeft: 18, margin: '8px 0 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {itens}
      </ul>
      <button className="btn mini" onClick={() => ir('ajustes')}>Resolver em Ajustes</button>
    </div>
  )
}
