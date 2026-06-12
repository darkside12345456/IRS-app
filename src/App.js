import React, { useState, useEffect, useMemo } from 'react';
import './style.css';

// =============================================================
// DADOS / TABELAS DE IRS (Portugal Continental)
// Confirma sempre os valores atuais no Portal das Finanças
// (artigo 68.º do Código do IRS) antes de usar para uma entrega real.
// =============================================================

const ESCALOES = {
  2025: [
    { escalao: 1, limite: 8059, taxaNormal: 0.125 },
    { escalao: 2, limite: 12160, taxaNormal: 0.160 },
    { escalao: 3, limite: 17233, taxaNormal: 0.215 },
    { escalao: 4, limite: 22306, taxaNormal: 0.244 },
    { escalao: 5, limite: 28400, taxaNormal: 0.314 },
    { escalao: 6, limite: 41629, taxaNormal: 0.349 },
    { escalao: 7, limite: 44987, taxaNormal: 0.431 },
    { escalao: 8, limite: 83696, taxaNormal: 0.446 },
    { escalao: 9, limite: Infinity, taxaNormal: 0.48 }
  ],
  2026: [
    { escalao: 1, limite: 8342, taxaNormal: 0.125 },
    { escalao: 2, limite: 12587, taxaNormal: 0.157 },
    { escalao: 3, limite: 17838, taxaNormal: 0.212 },
    { escalao: 4, limite: 23089, taxaNormal: 0.241 },
    { escalao: 5, limite: 29397, taxaNormal: 0.311 },
    { escalao: 6, limite: 43090, taxaNormal: 0.349 },
    { escalao: 7, limite: 46566, taxaNormal: 0.431 },
    { escalao: 8, limite: 86634, taxaNormal: 0.446 },
    { escalao: 9, limite: Infinity, taxaNormal: 0.48 }
  ]
};

const DEDUCAO_ESPECIFICA = {
  2025: { A: 4462.15, H: 4462.15, B_coeficiente: 0.75 },
  2026: { A: 4633.42, H: 4633.42, B_coeficiente: 0.75 }
};

const MINIMO_EXISTENCIA = { 2025: 11480, 2026: 12880 };

const TAXA_SOLIDARIEDADE = [
  { min: 80000, max: 250000, taxa: 0.025 },
  { min: 250000, max: Infinity, taxa: 0.05 }
];

const CATEGORIAS_DESPESA = {
  saude: { label: 'Saúde', percentagem: 0.15, limite: 1000, descricao: '15% das despesas, até 1.000€ por agregado.' },
  educacao: { label: 'Educação e Formação', percentagem: 0.30, limite: 800, descricao: '30% das despesas, até 800€ por agregado.' },
  habitacao: { label: 'Habitação (juros/rendas)', percentagem: 0.15, limite: 600, descricao: '15% de juros/rendas, até 600€.' },
  geral: { label: 'Despesas Gerais e Familiares', percentagem: 0.35, limite: 250, descricao: '35% das despesas com NIF, até 250€ por pessoa.' },
  lares: { label: 'Lares e 3.ª Idade', percentagem: 0.25, limite: 403.75, descricao: '25% das despesas, até 403,75€.' }
};

const CATEGORIAS_RENDIMENTO = {
  A: 'Categoria A — Trabalho dependente',
  B: 'Categoria B — Trabalho independente (recibos verdes)',
  H: 'Categoria H — Pensões'
};

const ANOS_DISPONIVEIS = [2025, 2026];

const ESTADOS = {
  individual: 'Tributação separada',
  conjunta: 'Tributação conjunta (casados/unidos de facto)'
};

// =============================================================
// LÓGICA DE CÁLCULO
// =============================================================

function calcularColetaPorEscaloes(rendimentoColetavel, ano) {
  const escaloes = ESCALOES[ano];
  let coleta = 0;
  let limiteAnterior = 0;
  const breakdown = [];

  for (const escalao of escaloes) {
    if (rendimentoColetavel <= limiteAnterior) break;
    const tetoEscalao = Math.min(rendimentoColetavel, escalao.limite);
    const base = tetoEscalao - limiteAnterior;
    if (base > 0) {
      const imposto = base * escalao.taxaNormal;
      coleta += imposto;
      breakdown.push({ escalao: escalao.escalao, base, taxa: escalao.taxaNormal, imposto });
    }
    if (rendimentoColetavel <= escalao.limite) break;
    limiteAnterior = escalao.limite;
  }
  return { coleta, breakdown };
}

function calcularRendimentoColetavel({ ano, categoria, rendimentoBruto }) {
  const parametros = DEDUCAO_ESPECIFICA[ano];
  let deducaoEspecifica = 0;
  let rendimentoColetavel = 0;

  if (categoria === 'A' || categoria === 'H') {
    deducaoEspecifica = parametros.A;
    rendimentoColetavel = Math.max(0, rendimentoBruto - deducaoEspecifica);
  } else if (categoria === 'B') {
    const coeficiente = parametros.B_coeficiente;
    rendimentoColetavel = rendimentoBruto * coeficiente;
    deducaoEspecifica = rendimentoBruto - rendimentoColetavel;
  }
  return { rendimentoColetavel, deducaoEspecifica };
}

function calcularTaxaSolidariedade(rendimentoColetavel) {
  let total = 0;
  for (const tramo of TAXA_SOLIDARIEDADE) {
    if (rendimentoColetavel <= tramo.min) continue;
    const teto = Math.min(rendimentoColetavel, tramo.max);
    const base = teto - tramo.min;
    if (base > 0) total += base * tramo.taxa;
  }
  return total;
}

function calcularIRS(input) {
  const {
    ano, categoria, rendimentoBruto,
    estadoCivil = 'individual', deducoesColeta = 0, retencaoNaFonte = 0
  } = input;

  const { rendimentoColetavel, deducaoEspecifica } = calcularRendimentoColetavel({ ano, categoria, rendimentoBruto });

  const divisorQuociente = estadoCivil === 'conjunta' ? 2 : 1;
  const baseParaTaxas = rendimentoColetavel / divisorQuociente;

  const { coleta: coletaBase, breakdown } = calcularColetaPorEscaloes(baseParaTaxas, ano);
  const coletaTotal = coletaBase * divisorQuociente;

  const solidariedade = calcularTaxaSolidariedade(rendimentoColetavel);

  const deducoesAplicadas = Math.min(deducoesColeta, coletaTotal);
  const coletaLiquida = Math.max(0, coletaTotal + solidariedade - deducoesAplicadas);

  const taxaEfetiva = rendimentoColetavel > 0 ? coletaLiquida / rendimentoColetavel : 0;
  const acertoFinal = coletaLiquida - retencaoNaFonte;
  const rendimentoLiquidoEstimado = rendimentoBruto - coletaLiquida;
  const abaixoMinimoExistencia = rendimentoLiquidoEstimado < MINIMO_EXISTENCIA[ano];

  return {
    ano, categoria, rendimentoBruto, deducaoEspecifica, rendimentoColetavel, divisorQuociente,
    breakdown, coletaBase, coletaTotal, solidariedade, deducoesColeta, deducoesAplicadas,
    coletaLiquida, taxaEfetiva, retencaoNaFonte, acertoFinal, rendimentoLiquidoEstimado,
    abaixoMinimoExistencia, minimoExistencia: MINIMO_EXISTENCIA[ano]
  };
}

function formatarEuros(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
}

function formatarPercentagem(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return new Intl.NumberFormat('pt-PT', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
}

// =============================================================
// ARMAZENAMENTO LOCAL
// =============================================================

const PREFIX = 'dossie-irs:';

function loadData(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveData(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) { /* ignore */ }
}

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// =============================================================
// COMPONENTES
// =============================================================

function StampBadge({ text, color = 'red' }) {
  return <span className={`carimbo carimbo-${color}`}>{text}</span>;
}

function Linha({ label, valor, destaque }) {
  return (
    <div className="kv">
      <dt>{label}</dt>
      <dd className={destaque ? 'strong' : ''}>{valor}</dd>
    </div>
  );
}

function Calculadora({ deducoesSugeridas, onSaveScenario }) {
  const [form, setForm] = useState({
    nome: '', ano: 2025, categoria: 'A', rendimentoBruto: 18000,
    estadoCivil: 'individual', deducoesColeta: 0, retencaoNaFonte: 0
  });

  const resultado = useMemo(() => calcularIRS(form), [form]);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function usarDeducoesSugeridas() {
    update('deducoesColeta', Math.round(deducoesSugeridas * 100) / 100);
  }

  function guardarCenario() {
    const nome = form.nome.trim() || `Cenário ${form.ano} · ${formatarEuros(form.rendimentoBruto)}`;
    onSaveScenario({ ...form, nome }, resultado);
  }

  const acertoPositivo = resultado.acertoFinal > 0;

  return (
    <div className="grid-2">
      <div className="card">
        <h2>Dados do contribuinte</h2>
        <p className="card-sub">Preenche com valores anuais. É uma estimativa — confirma no Portal das Finanças.</p>

        <label className="field-label">Nome do cenário (opcional)</label>
        <input className="field" type="text" value={form.nome} placeholder="ex.: Situação atual"
          onChange={(e) => update('nome', e.target.value)} />

        <label className="field-label">Ano dos rendimentos</label>
        <select className="field" value={form.ano} onChange={(e) => update('ano', Number(e.target.value))}>
          {ANOS_DISPONIVEIS.map((ano) => <option key={ano} value={ano}>{ano}</option>)}
        </select>

        <label className="field-label">Categoria de rendimento</label>
        <select className="field" value={form.categoria} onChange={(e) => update('categoria', e.target.value)}>
          {Object.entries(CATEGORIAS_RENDIMENTO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>

        <label className="field-label">Rendimento bruto anual</label>
        <div className="field-wrap">
          <span className="field-euro">€</span>
          <input className="field field-mono" type="number" min="0" step="100"
            value={form.rendimentoBruto} onChange={(e) => update('rendimentoBruto', Number(e.target.value) || 0)} />
        </div>

        <label className="field-label">Estado civil / tipo de tributação</label>
        <select className="field" value={form.estadoCivil} onChange={(e) => update('estadoCivil', e.target.value)}>
          {Object.entries(ESTADOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>

        <label className="field-label">Deduções à coleta (total anual)</label>
        {deducoesSugeridas > 0 && (
          <div style={{ marginBottom: 6 }}>
            <button className="link-btn" onClick={usarDeducoesSugeridas}>
              usar total do separador Documentos ({formatarEuros(deducoesSugeridas)})
            </button>
          </div>
        )}
        <div className="field-wrap">
          <span className="field-euro">€</span>
          <input className="field field-mono" type="number" min="0" step="10"
            value={form.deducoesColeta} onChange={(e) => update('deducoesColeta', Number(e.target.value) || 0)} />
        </div>

        <label className="field-label">Retenção na fonte já paga (total anual)</label>
        <div className="field-wrap">
          <span className="field-euro">€</span>
          <input className="field field-mono" type="number" min="0" step="10"
            value={form.retencaoNaFonte} onChange={(e) => update('retencaoNaFonte', Number(e.target.value) || 0)} />
        </div>
        <p className="field-hint">Consulta o total de "Retenção na fonte de IRS" nos recibos de vencimento.</p>

        <button className="btn" onClick={guardarCenario}>Guardar este cenário para comparar</button>
      </div>

      <div className="card">
        <div className="head-row">
          <div>
            <h2>Apuramento estimado</h2>
            <p className="card-sub">Rendimentos de {form.ano} · {CATEGORIAS_RENDIMENTO[form.categoria]}</p>
          </div>
          <StampBadge text="Estimativa" color="gold" />
        </div>

        <dl className="kv-grid">
          <Linha label="Rendimento bruto anual" valor={formatarEuros(resultado.rendimentoBruto)} />
          <Linha label="Dedução específica" valor={formatarEuros(resultado.deducaoEspecifica)} />
          <Linha label="Rendimento coletável" valor={formatarEuros(resultado.rendimentoColetavel)} destaque />
          <Linha label="Divisor (quociente conjugal)" valor={resultado.divisorQuociente.toFixed(0)} />
        </dl>

        <h3 className="section-title">Decomposição por escalão</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Escalão</th><th>Base tributada</th><th>Taxa</th><th>Imposto</th></tr></thead>
            <tbody>
              {resultado.breakdown.map((l) => (
                <tr key={l.escalao}>
                  <td>{l.escalao}.º</td>
                  <td>{formatarEuros(l.base)}</td>
                  <td>{formatarPercentagem(l.taxa)}</td>
                  <td>{formatarEuros(l.imposto)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3}>Coleta (antes de deduções)</td><td>{formatarEuros(resultado.coletaTotal)}</td></tr></tfoot>
          </table>
        </div>

        {resultado.solidariedade > 0 && (
          <div className="note-box red">
            <span>Taxa adicional de solidariedade: {formatarEuros(resultado.solidariedade)}</span>
          </div>
        )}

        <dl className="kv-grid">
          <Linha label="Deduções à coleta aplicadas" valor={formatarEuros(resultado.deducoesAplicadas)} />
          <Linha label="Coleta líquida (IRS final estimado)" valor={formatarEuros(resultado.coletaLiquida)} destaque />
          <Linha label="Taxa efetiva" valor={formatarPercentagem(resultado.taxaEfetiva)} />
          <Linha label="Rendimento líquido estimado" valor={formatarEuros(resultado.rendimentoLiquidoEstimado)} />
        </dl>

        {resultado.abaixoMinimoExistencia && (
          <div className="note-box">
            <span>
              O rendimento líquido estimado fica abaixo do <strong>mínimo de existência</strong> ({formatarEuros(resultado.minimoExistencia)}) para {form.ano}.
              Este simulador não aplica esse ajuste automaticamente.
            </span>
          </div>
        )}

        <div className="result-final">
          <div>
            <p className="label">{acertoPositivo ? 'Resultado: a pagar à AT' : 'Resultado: reembolso a receber'}</p>
            <p className="value">{formatarEuros(Math.abs(resultado.acertoFinal))}</p>
          </div>
          <StampBadge text={acertoPositivo ? 'A Pagar' : 'Reembolso'} color={acertoPositivo ? 'red' : 'green'} />
        </div>
      </div>
    </div>
  );
}

function Documentos({ onTotalChange }) {
  const [despesas, setDespesas] = useState(() => loadData('despesas', []));
  const [form, setForm] = useState({ descricao: '', categoria: 'saude', valor: '', data: '' });

  useEffect(() => { saveData('despesas', despesas); }, [despesas]);

  const resumo = useMemo(() => {
    const porCategoria = {};
    let totalDeducao = 0;
    for (const key of Object.keys(CATEGORIAS_DESPESA)) porCategoria[key] = { totalGasto: 0, deducaoEstimada: 0 };
    for (const d of despesas) {
      if (porCategoria[d.categoria]) porCategoria[d.categoria].totalGasto += d.valor;
    }
    for (const [key, cat] of Object.entries(CATEGORIAS_DESPESA)) {
      const totalGasto = porCategoria[key].totalGasto;
      const deducaoEstimada = Math.min(totalGasto * cat.percentagem, cat.limite);
      porCategoria[key].deducaoEstimada = deducaoEstimada;
      totalDeducao += deducaoEstimada;
    }
    return { porCategoria, totalDeducao };
  }, [despesas]);

  useEffect(() => { onTotalChange && onTotalChange(resumo.totalDeducao); }, [resumo.totalDeducao]);

  function adicionarDespesa(e) {
    e.preventDefault();
    const valor = Number(form.valor);
    if (!form.descricao.trim() || !valor || valor <= 0) return;
    setDespesas((prev) => [...prev, { id: generateId(), descricao: form.descricao.trim(), categoria: form.categoria, valor, data: form.data || null }]);
    setForm({ descricao: '', categoria: form.categoria, valor: '', data: '' });
  }

  function removerDespesa(id) {
    setDespesas((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div className="grid-2">
      <div className="card">
        <h2>Registar comprovativo</h2>
        <p className="card-sub">Guarda aqui as despesas com fatura associadas ao NIF.</p>

        <form onSubmit={adicionarDespesa}>
          <label className="field-label">Descrição</label>
          <input className="field" type="text" required placeholder="ex.: Consulta de dentista"
            value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />

          <label className="field-label">Categoria</label>
          <select className="field" value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}>
            {Object.entries(CATEGORIAS_DESPESA).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </select>

          <label className="field-label">Data</label>
          <input className="field field-mono" type="date" value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />

          <label className="field-label">Valor</label>
          <div className="field-wrap">
            <span className="field-euro">€</span>
            <input className="field field-mono" type="number" min="0" step="0.01" required placeholder="0.00"
              value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
          </div>

          <p className="field-hint" style={{ marginTop: -6 }}>{CATEGORIAS_DESPESA[form.categoria].descricao}</p>

          <button className="btn" type="submit">Adicionar comprovativo</button>
        </form>
      </div>

      <div className="card">
        <div className="head-row">
          <div>
            <h2>Resumo por categoria</h2>
            <p className="card-sub">Estimativa simplificada das deduções à coleta.</p>
          </div>
          <StampBadge text="Arquivo" color="green" />
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Categoria</th><th>Total gasto</th><th>% Dedução</th><th>Estimado</th></tr></thead>
            <tbody>
              {Object.entries(CATEGORIAS_DESPESA).map(([key, cat]) => {
                const linha = resumo.porCategoria[key];
                if (!linha || linha.totalGasto === 0) return null;
                return (
                  <tr key={key}>
                    <td>{cat.label}</td>
                    <td>{formatarEuros(linha.totalGasto)}</td>
                    <td>{formatarPercentagem(cat.percentagem)}</td>
                    <td>{formatarEuros(linha.deducaoEstimada)}</td>
                  </tr>
                );
              })}
              {despesas.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px' }}>Ainda não registaste nenhum comprovativo.</td></tr>}
            </tbody>
            {despesas.length > 0 && <tfoot><tr><td colSpan={3}>Total estimado de dedução à coleta</td><td>{formatarEuros(resumo.totalDeducao)}</td></tr></tfoot>}
          </table>
        </div>

        <h3 className="section-title">Comprovativos registados</h3>
        <ul className="list">
          {despesas.slice().sort((a, b) => (b.data || '').localeCompare(a.data || '')).map((d) => (
            <li key={d.id}>
              <div className="desc">
                <p>{d.descricao}</p>
                <p className="meta">{CATEGORIAS_DESPESA[d.categoria].label}{d.data ? ` · ${d.data}` : ''}</p>
              </div>
              <div className="right">
                <span>{formatarEuros(d.valor)}</span>
                <button className="del-btn" onClick={() => removerDespesa(d.id)} aria-label="Remover">✕</button>
              </div>
            </li>
          ))}
          {despesas.length === 0 && <li className="empty">Sem registos.</li>}
        </ul>
</div>
    </div>
}

function Cenarios({ cenarios, onRemove }) {
  if (cenarios.length === 0) {
    return (
      <div className="card empty-state">
        <h2>Ainda sem cenários guardados</h2>
        <p>
          Vai ao separador <strong>Calculadora</strong>, ajusta os valores e clica em
          "Guardar este cenário" para comparares aqui as diferentes hipóteses.
        </p>
      </div>
    );
  }

  const maiorValor = Math.max(...cenarios.map((c) => Math.max(c.resultado.coletaLiquida, c.resultado.rendimentoLiquidoEstimado)), 1);

  return (
    <div>
      <div className="card">
        <div className="head-row">
          <div>
            <h2>Comparação de cenários</h2>
            <p className="card-sub">IRS estimado e rendimento líquido para cada cenário guardado.</p>
          </div>
          <StampBadge text="Comparação" color="gold" />
        </div>

        <div className="bars">
          {cenarios.map((c) => (
            <div className="bar-group" key={c.id}>
              <div className="bar-label">{c.input.nome}</div>
              <div className="bar-row">
                <span className="bar-name">Coleta líquida</span>
                <div className="bar-track"><div className="bar-fill red" style={{ width: `${(c.resultado.coletaLiquida / maiorValor) * 100}%` }} /></div>
                <span className="bar-value">{formatarEuros(c.resultado.coletaLiquida)}</span>
              </div>
              <div className="bar-row">
                <span className="bar-name">Rend. líquido</span>
                <div className="bar-track"><div className="bar-fill green" style={{ width: `${(c.resultado.rendimentoLiquidoEstimado / maiorValor) * 100}%` }} /></div>
                <span className="bar-value">{formatarEuros(c.resultado.rendimentoLiquidoEstimado)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">Detalhe dos cenários</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Cenário</th><th>Ano</th><th>R. Bruto</th><th>R. Coletável</th><th>Coleta líquida</th><th>Taxa efetiva</th><th>Acerto final</th><th></th></tr>
            </thead>
            <tbody>
              {cenarios.map((c) => {
                const r = c.resultado;
                const pagar = r.acertoFinal > 0;
                return (
                  <tr key={c.id}>
                    <td>{c.input.nome}</td>
                    <td>{c.input.ano}</td>
                    <td>{formatarEuros(r.rendimentoBruto)}</td>
                    <td>{formatarEuros(r.rendimentoColetavel)}</td>
                    <td>{formatarEuros(r.coletaLiquida)}</td>
                    <td>{formatarPercentagem(r.taxaEfetiva)}</td>
                    <td style={{ color: pagar ? 'var(--stamp-red)' : 'var(--stamp-green)' }}>
                      {pagar ? '+ ' : '− '}{formatarEuros(Math.abs(r.acertoFinal))}
                    </td>
                    <td><button className="del-btn" onClick={() => onRemove(c.id)} aria-label="Remover">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="field-hint" style={{ marginTop: 10 }}>
          "Acerto final" positivo (vermelho) = imposto a pagar à AT; negativo (verde) = reembolso a receber.
        </p>
      </div>
    </div>
  );
}

// =============================================================
// APP
// =============================================================

export default function App() {
  const [activeTab, setActiveTab] = useState('calculadora');
  const [deducoesSugeridas, setDeducoesSugeridas] = useState(0);
  const [cenarios, setCenarios] = useState(() => loadData('cenarios', []));

  useEffect(() => { saveData('cenarios', cenarios); }, [cenarios]);

  function guardarCenario(input, resultado) {
    setCenarios((prev) => [...prev, { id: generateId(), input, resultado }]);
    setActiveTab('cenarios');
  }

  function removerCenario(id) {
    setCenarios((prev) => prev.filter((c) => c.id !== id));
  }

  const TABS = [
    { id: 'calculadora', label: 'Calculadora' },
    { id: 'documentos', label: 'Documentos' },
    { id: 'cenarios', label: 'Cenários' }
  ];

  return (
    <div className="app">
      <p className="title-eyebrow">Processo n.º IRS · {new Date().getFullYear()}</p>
      <h1 className="title">Dossiê IRS</h1>
      <p className="subtitle">O teu assistente para estimar o IRS, organizar comprovativos e comparar cenários de declaração.</p>

      <div className="tabs">
        {TABS.map((tab) => (
          <div key={tab.id} className={`tab ${tab.id === activeTab ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </div>
        ))}
      </div>

      {activeTab === 'calculadora' && <Calculadora deducoesSugeridas={deducoesSugeridas} onSaveScenario={guardarCenario} />}
      {activeTab === 'documentos' && <Documentos onTotalChange={setDeducoesSugeridas} />}
      {activeTab === 'cenarios' && <Cenarios cenarios={cenarios} onRemove={removerCenario} />}

      <p className="footer-note">
        Aviso: esta aplicação é uma ferramenta de apoio e estimativa pessoal. Os escalões, deduções e
        percentagens podem mudar todos os anos com o Orçamento de Estado — confirma sempre os valores
        oficiais no Portal das Finanças antes de submeteres a tua declaração. Todos os dados ficam
        guardados apenas neste navegador (localStorage).
      </p>
    </div>
  );
}
