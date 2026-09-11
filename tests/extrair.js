/**
 * Extrai funções puras do index.html para poder testá-las em Node.
 *
 * O app é um único HTML sem bundler nem módulos, então não há `require`
 * possível. Em vez de duplicar as regras num arquivo de teste — o que garante
 * que teste e produção divirjam com o tempo — recortamos o trecho real do
 * index.html e avaliamos. Se alguém renomear ou apagar uma função, a extração
 * falha e o teste quebra, que é exatamente o aviso que queremos.
 */

const fs = require("fs");
const path = require("path");

const INDEX = path.join(__dirname, "..", "index.html");

function lerIndex() {
  return fs.readFileSync(INDEX, "utf8");
}

/**
 * Recorta de `inicio` (inclusive) até `fim` (exclusive) e avalia o trecho,
 * devolvendo o escopo com as funções declaradas.
 */
function extrair(marcadores) {
  const html = lerIndex();
  let codigo = "";

  for (const { de, ate, nome } of marcadores) {
    const i = html.indexOf(de);
    if (i === -1) {
      throw new Error(
        `Trecho "${nome}" não encontrado no index.html (procurando por ${JSON.stringify(de)}).\n` +
        `A função pode ter sido renomeada ou removida — atualize tests/extrair.js.`,
      );
    }
    const j = html.indexOf(ate, i + de.length);
    if (j === -1) {
      throw new Error(`Fim do trecho "${nome}" não encontrado (procurando por ${JSON.stringify(ate)}).`);
    }
    codigo += html.slice(i, j) + "\n";
  }

  // `capSentence` e `_brNow` vivem em outra parte do arquivo e alguns trechos
  // dependem delas; stubs bastam porque não é isso que está sob teste aqui.
  const preludio = `
    var capSentence = function (s) { return String(s == null ? "" : s); };
    var _brNow = function () { return new Date("2026-08-06T12:00:00Z"); };
    var fmtDate = function (d) { if (!d) return "--"; var p = String(d).split("-"); return p.length !== 3 ? d : p[2] + "/" + p[1] + "/" + p[0]; };
    var fmtDateShort = function (d) { if (!d) return "--"; var p = String(d).split("-"); return p.length !== 3 ? d : p[2] + "/" + p[1] + "/" + p[0].slice(2); };
    var fmtBRL = function (v) { return "R$ " + (Math.abs(parseFloat(v || 0))).toFixed(2); };
  `;

  const escopo = {};
  const fn = new Function(`
    ${preludio}
    ${codigo}
    return {
      _soDig, validarCPF, validarCNPJ, validarCpfCnpj, validarPlaca, validarEmail,
      validarTelefone, fmtCpfCnpj, fmtPlaca, fmtTelefone, primeiroErro,
      difCombustivel, fmtFracao, KM_PNEUS_ALERTA, statusPneus,
      KM_REVISAO_ALERTA, statusRevisaoKm,
      _periodosSobrepoem, veiculoDaReserva, conflitosDaReserva, clienteDaReserva,
      rdSum, rdGroupBy, RD_COR_CATEGORIA, RD_PALETTE_CLIENTE,
      TIPOS_ANOTACAO, tipoAnotacao, lerAnotacaoContrato, definirTipoAnotacao,
      definirValorAnotacao, definirAnotacaoContrato,
      encerrarAnotacaoCobrada,
      manutencaoAindaPendente, painelManutencoesPendentes, avariaDoContrato,
      situacaoMulta, multaEncerrada, painelMultasPendentes, GRUPOS_MULTA,
      parcelaCC, numParcelasCC, ancoraParcelaCC, grupoParcelasCC,
      principalParcelaCC, formPrincipalCC,
      agk2CorteDias, AGK2_LIM_DIAS,
      agAdiaMapa, agAdiaOculto, agAdiaAgora,
      faturaEmissaoDataISO, faturaEmissaoChave, faturaEmissaoDispensada,
      rdClienteDaReceita, rdLinhasReceitaCliente, rdLinhasDespesaCategoria, rdMesDoContrato,
      receitaVisivelNoMes, receitaDoMes, manVisivelNoMes, resolverDespesasDoMes, isRetLucro,
      despesaDoMes, manDoMes, manDataFluxo, manMesRefGlobal, multaDataFluxo, multaDoMes,
      mesDoLancamentoCt, lancamentosDoContrato, somaContratoBusca, resumoPorMesContratos
    };
  `);
  return Object.assign(escopo, fn());
}

/**
 * Marcadores dos trechos que os testes usam.
 *
 * No index.html estes helpers são um bloco contíguo — revisão por km, pneus,
 * combustível, reservas × frota e validação de documentos, nessa ordem — então
 * um único recorte basta. Se alguém separar o bloco, a extração falha com uma
 * mensagem clara em vez de silenciosamente testar código velho.
 */
const MARCADORES = [
  {
    nome: "helpers de regra de negócio",
    de: "var KM_REVISAO_ALERTA =",
    ate: "// ─────────────────────────────────────────────────────────────────────────",
  },
  {
    nome: "manutenção pendente",
    de: "var TIPOS_ANOTACAO =",
    ate: "function AlertBox(",
  },
  {
    // O pipeline de multas e o mapa de responsável por etapa — fica junto
    // do módulo de Multas, então é um recorte à parte.
    nome: "multas — pipeline e responsável",
    de: "var PIPELINE_MULTA = [",
    ate: "var DSV_LOGO_SVG =",
  },
  {
    // Agregação que alimenta o gráfico circular: soma por chave, ordena e
    // escolhe a cor de cada fatia. Começa na paleta (AG_PASTEL) porque as
    // cores das fatias saem dela — recortar só a partir de RD_COR_CATEGORIA
    // deixaria o trecho sem as constantes que ele usa.
    nome: "agregação do gráfico circular",
    de: "var AG_PASTEL = {",
    ate: "function _fmtBarVal(",
  },
  {
    // Reconstrução do grupo de parcelas de cartão. É o que decide qual
    // lançamento a edição vai atingir — se agrupar errado, a edição de uma
    // compra sobrescreve outra. Merece teste.
    nome: "parcelas de cartão",
    de: "function parcelaCC(",
    ate: "// Fatura de contrato realmente EMITIDA",
  },
  {
    // Competência: o que cai em cada mês (despesa, receita, manutenção),
    // incluindo a projeção da recorrente. É a base de rdLinhasReceitaCliente
    // e rdLinhasDespesaCategoria, testadas em "Receita por cliente".
    nome: "competência mensal de despesa/receita/manutenção",
    de: "function resolverDespesasDoMes(",
    ate: "var STATUS = {",
  },
  {
    nome: "retirada de lucro × ajuste de saldo",
    de: "function isRetLucro(d) {",
    ate: "function isRetLucroPura(",
  },
  {
    // Emissão de fatura dispensada ([emissao-dispensada]): a chave do cartão
    // "Emitir Fatura" da Agenda e a pergunta "o usuário já disse que não
    // emite esta?". Todos os avisos de emissão do app passam por aqui — se
    // divergirem, o usuário resolve num lugar e continua sendo cobrado no
    // outro.
    nome: "emissão de fatura dispensada",
    de: "// Dia em que a fatura do contrato deveria ser emitida",
    ate: "// Próximo número sequencial de fatura",
  },
  {
    // O mapa de adiados/resolvidos da Agenda (agenda_adiamentos), que é quem
    // responde `faturaEmissaoDispensada`. Sem localStorage (Node), a leitura
    // local cai no catch e devolve {} — os testes injetam direto no mapa.
    nome: "mapa de adiados/resolvidos da Agenda",
    de: 'var AG_ADIA_TABELA = "agenda_adiamentos";',
    ate: "/* Carrega o que está no banco por cima",
  },
];

module.exports = { extrair, MARCADORES, lerIndex, INDEX };
