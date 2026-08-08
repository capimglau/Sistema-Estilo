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
      rdNomeNoGrafico, rdVoltaVitrine, rdSum,
      TIPOS_ANOTACAO, tipoAnotacao, lerAnotacaoContrato, definirTipoAnotacao,
      manutencaoAindaPendente, painelManutencoesPendentes, avariaDoContrato,
      situacaoMulta, multaEncerrada, painelMultasPendentes, GRUPOS_MULTA
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
    // Monta a volta da vitrine do miolo do gráfico circular. Fica noutra
    // parte do arquivo, junto do componente, então é um recorte separado.
    nome: "vitrine do gráfico circular",
    de: "function rdNomeNoGrafico(",
    ate: "function rdGroupBy(",
  },
];

module.exports = { extrair, MARCADORES, lerIndex, INDEX };
