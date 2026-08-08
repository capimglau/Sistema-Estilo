/**
 * Suíte de testes do AutoGest.
 *
 * Roda com `node tests/run.js` — sem dependências, sem instalar nada.
 * Cobre as funções puras que carregam regra de negócio: validação de
 * documentos, revisão por km, pneus, combustível e conflito de agenda das
 * reservas. São as que, se quebrarem em silêncio, produzem dado errado no
 * banco ou contrato em cima de carro ocupado.
 *
 * Também valida a integridade do próprio index.html (sintaxe dos blocos
 * inline e ausência de funções duplicadas), que é como um bloco de 338 linhas
 * duplicadas passou despercebido antes.
 */

const fs = require("fs");
const { extrair, MARCADORES, lerIndex, INDEX } = require("./extrair");

let passou = 0;
const falhas = [];
let grupoAtual = "";

function grupo(nome) {
  grupoAtual = nome;
  console.log("\n\x1b[1m" + nome + "\x1b[0m");
}

function eq(descricao, obtido, esperado) {
  const ok = Object.is(obtido, esperado);
  if (ok) {
    passou++;
    console.log("  \x1b[32m✓\x1b[0m " + descricao);
  } else {
    falhas.push({ grupo: grupoAtual, descricao, obtido, esperado });
    console.log("  \x1b[31m✗\x1b[0m " + descricao +
      "\n      obtido:   " + JSON.stringify(obtido) +
      "\n      esperado: " + JSON.stringify(esperado));
  }
}

function ok(descricao, valor) { eq(descricao, !!valor, true); }

// ───────────────────────────────────────────────────────────────────────────
const F = extrair(MARCADORES);

grupo("CPF — dígito verificador");
eq("CPF válido", F.validarCPF("529.982.247-25"), true);
eq("CPF válido sem pontuação", F.validarCPF("52998224725"), true);
eq("último dígito errado", F.validarCPF("529.982.247-26"), false);
eq("todos os dígitos iguais não passa", F.validarCPF("111.111.111-11"), false);
eq("comprimento errado", F.validarCPF("123"), false);
eq("vazio é aceito (obrigatoriedade é do formulário)", F.validarCPF(""), true);
eq("null é aceito", F.validarCPF(null), true);

grupo("CNPJ — dígito verificador");
eq("CNPJ válido", F.validarCNPJ("11.222.333/0001-81"), true);
eq("dígito errado", F.validarCNPJ("11.222.333/0001-82"), false);
eq("todos iguais não passa", F.validarCNPJ("11111111111111"), false);
eq("vazio é aceito", F.validarCNPJ(""), true);

grupo("CPF ou CNPJ no mesmo campo");
eq("11 dígitos usa regra de CPF", F.validarCpfCnpj("52998224725"), true);
eq("14 dígitos usa regra de CNPJ", F.validarCpfCnpj("11222333000181"), true);
eq("12 dígitos não é nem um nem outro", F.validarCpfCnpj("123456789012"), false);

grupo("Placa");
eq("padrão antigo", F.validarPlaca("ABC1234"), true);
eq("padrão Mercosul", F.validarPlaca("ABC1D23"), true);
eq("com hífen e minúscula", F.validarPlaca("abc-1234"), true);
eq("curta demais", F.validarPlaca("AB12"), false);
eq("letra onde deveria ter número", F.validarPlaca("ABCD234"), false);

grupo("E-mail e telefone");
eq("e-mail simples", F.validarEmail("a@b.com"), true);
eq("e-mail sem TLD", F.validarEmail("a@b"), false);
eq("e-mail com espaço", F.validarEmail("a b@c.com"), false);
eq("celular com DDD", F.validarTelefone("(11) 91234-5678"), true);
eq("fixo com DDD", F.validarTelefone("1123456789"), true);
eq("9 dígitos é curto", F.validarTelefone("123456789"), false);

grupo("Normalização");
eq("CPF formatado", F.fmtCpfCnpj("52998224725"), "529.982.247-25");
eq("CNPJ formatado", F.fmtCpfCnpj("11222333000181"), "11.222.333/0001-81");
eq("celular formatado", F.fmtTelefone("11912345678"), "(11) 91234-5678");
eq("fixo formatado", F.fmtTelefone("1123456789"), "(11) 2345-6789");
eq("placa normalizada", F.fmtPlaca("abc-1d23"), "ABC1D23");

grupo("primeiroErro");
eq("devolve a primeira mensagem que falha",
  F.primeiroErro([["ok", () => true, "A"], ["x", () => false, "B"], ["y", () => false, "C"]]), "B");
eq("null quando tudo passa",
  F.primeiroErro([["a", () => true, "A"]]), null);

grupo("Revisão por quilometragem");
eq("sem meta cadastrada não alerta", F.statusRevisaoKm({ km_atual: 5000 }), null);
ok("passou da meta = vencida", F.statusRevisaoKm({ km_atual: 61000, km_revisao_proxima: 60000 }).vencida);
ok("dentro da antecedência = próxima", F.statusRevisaoKm({ km_atual: 59500, km_revisao_proxima: 60000 }).proxima);
eq("longe da meta não é próxima", F.statusRevisaoKm({ km_atual: 40000, km_revisao_proxima: 60000 }).proxima, false);
eq("km faltante", F.statusRevisaoKm({ km_atual: 59500, km_revisao_proxima: 60000 }).falta, 500);
eq("sem km_atual conta desde zero", F.statusRevisaoKm({ km_revisao_proxima: 60000 }).falta, 60000);
eq("exatamente na meta já conta como vencida",
  F.statusRevisaoKm({ km_atual: 60000, km_revisao_proxima: 60000 }).vencida, true);

grupo("Pneus");
eq("sem km de troca não alerta", F.statusPneus({ km_atual: 50000 }), null);
eq("vida útil padrão quando não informada",
  F.statusPneus({ km_atual: 10000, pneus_km_troca: 0 }).vida, 40000);
ok("rodou além da vida útil = vencido",
  F.statusPneus({ km_atual: 75000, pneus_km_troca: 30000, pneus_vida_util_km: 40000 }).vencido);
ok("perto do fim = próximo",
  F.statusPneus({ km_atual: 68000, pneus_km_troca: 30000, pneus_vida_util_km: 40000 }).proximo);
eq("km restante",
  F.statusPneus({ km_atual: 68000, pneus_km_troca: 30000, pneus_vida_util_km: 40000 }).restante, 2000);
eq("pneu novo não é próximo",
  F.statusPneus({ km_atual: 31000, pneus_km_troca: 30000, pneus_vida_util_km: 40000 }).proximo, false);
eq("km_troca zero é válido, não ausente",
  F.statusPneus({ km_atual: 45000, pneus_km_troca: 0, pneus_vida_util_km: 40000 }).vencido, true);

grupo("Combustível");
eq("faltou meio tanque", F.difCombustivel("Cheio", "1/2"), 0.5);
eq("voltou igual", F.difCombustivel("1/2", "1/2"), 0);
eq("voltou com mais dá negativo", F.difCombustivel("1/2", "Cheio"), -0.5);
eq("sem informação devolve null", F.difCombustivel("Cheio", ""), null);
eq("nível desconhecido devolve null", F.difCombustivel("Cheio", "80%"), null);
eq("fração legível — meio", F.fmtFracao(0.5), "1/2 de tanque");
eq("fração legível — três quartos", F.fmtFracao(0.75), "3/4 de tanque");
eq("fração legível — tanque inteiro", F.fmtFracao(1), "1 tanque");

grupo("Sobreposição de períodos");
eq("faixas que se cruzam", F._periodosSobrepoem("2026-01-10", "2026-01-20", "2026-01-15", "2026-01-25"), true);
eq("faixas separadas", F._periodosSobrepoem("2026-01-10", "2026-01-20", "2026-01-21", "2026-01-25"), false);
eq("encostando na borda conta como conflito", F._periodosSobrepoem("2026-01-10", "2026-01-20", "2026-01-20", "2026-01-25"), true);
eq("sem data fim bloqueia daí em diante", F._periodosSobrepoem("2026-01-10", null, "2030-01-01", "2030-02-01"), true);
eq("sem data início não dá para afirmar", F._periodosSobrepoem(null, "2026-01-20", "2026-01-15", "2026-01-25"), false);

grupo("Reserva → veículo da frota");
const FROTA = [
  { id: 1, placa: "ABC1234", marca: "VW", modelo: "Polo" },
  { id: 2, placa: "XYZ5D67", marca: "GM", modelo: "Spin" },
  { id: 3, placa: "DEF1111", marca: "VW", modelo: "Polo" },
];
eq("resolve pela FK", F.veiculoDaReserva({ veiculo_id: 2 }, FROTA).placa, "XYZ5D67");
eq("resolve pela placa no texto", F.veiculoDaReserva({ veiculo: "abc-1234" }, FROTA).placa, "ABC1234");
eq("modelo ambíguo não chuta", F.veiculoDaReserva({ veiculo: "Polo" }, FROTA), null);
eq("modelo único resolve", F.veiculoDaReserva({ veiculo: "GM Spin" }, FROTA).placa, "XYZ5D67");
eq("sem informação nenhuma", F.veiculoDaReserva({}, FROTA), null);
eq("frota vazia", F.veiculoDaReserva({ veiculo: "ABC1234" }, []), null);

grupo("Conflito de agenda da reserva");
const CTS = [
  { id: 9,  veiculo_id: 1, status: "ativo",     data_inicio: "2026-01-15", data_fim: "2026-01-25" },
  { id: 10, veiculo_id: 1, status: "concluido", data_inicio: "2026-01-15", data_fim: "2026-01-25" },
];
const RES = [
  { id: 5, veiculo_id: 1, status: "confirmada", data_retirada: "2026-01-12", data_devolucao: "2026-01-14" },
  { id: 6, veiculo_id: 1, status: "pendente",   data_retirada: "2026-01-12", data_devolucao: "2026-01-14" },
];
const ALVO = { id: 99, data_retirada: "2026-01-10", data_devolucao: "2026-01-20" };
const cf = F.conflitosDaReserva(ALVO, 1, CTS, RES);
eq("acha o contrato ativo", cf.contratos.length, 1);
eq("ignora contrato concluído", cf.contratos.map((c) => c.id).join(), "9");
eq("acha a reserva confirmada", cf.reservas.length, 1);
eq("ignora reserva pendente", cf.reservas.map((r) => r.id).join(), "5");
eq("sem veículo não há conflito", F.conflitosDaReserva(ALVO, null, CTS, RES).contratos.length, 0);
eq("outro veículo não conflita", F.conflitosDaReserva(ALVO, 2, CTS, RES).contratos.length, 0);
eq("não conflita consigo mesma",
  F.conflitosDaReserva({ id: 5, data_retirada: "2026-01-12", data_devolucao: "2026-01-14" }, 1, [], RES).reservas.length, 0);

grupo("Reserva → cliente");
const CLI = [{ id: 7, nome: "Ana", cpf: "529.982.247-25" }];
eq("acha pelo CPF ignorando pontuação", F.clienteDaReserva({ cpf: "52998224725" }, CLI).nome, "Ana");
eq("acha pela FK", F.clienteDaReserva({ cliente_id: 7 }, CLI).nome, "Ana");
eq("CPF desconhecido", F.clienteDaReserva({ cpf: "11122233396" }, CLI), null);

// ── Integridade do arquivo ────────────────────────────────────────────────
grupo("Integridade do index.html");
const html = lerIndex();

const blocos = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
let comErro = 0;
for (const b of blocos) {
  try { new Function(b[1]); } catch (e) { comErro++; console.log("      " + e.message.slice(0, 120)); }
}
ok("há blocos de script inline para verificar", blocos.length > 0);
eq("todos os blocos inline compilam", comErro, 0);

// Um bloco de 338 linhas já foi duplicado literalmente neste arquivo; por
// hoisting a segunda cópia vencia e editar a primeira não surtia efeito.
//
// A checagem é POR BLOCO de <script>, não no arquivo todo: cada bloco é uma
// IIFE com escopo próprio, e nomes repetidos entre blocos (openMenu/closeMenu,
// por exemplo) são legítimos — não se enxergam. Comparar o arquivo inteiro
// acusaria esses como duplicata e treinaria a equipe a ignorar o teste.
const duplicadas = new Set();
for (const b of blocos) {
  const vistas = new Set();
  for (const m of b[1].matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)) {
    if (vistas.has(m[1])) duplicadas.add(m[1]);
    vistas.add(m[1]);
  }
}
eq("nenhuma função duplicada dentro do mesmo escopo",
  [...duplicadas].join(", ") || "(nenhuma)", "(nenhuma)");

// Os wrappers de progresso (agBar) envolvem db.post/patch/del/restaurar. Um
// deles esquecia o `return`, e db.del devolvia undefined: o "Desfazer" de toda
// exclusão recebia undefined em vez do registro e não restaurava nada, sem erro.
const wrappers = [...html.matchAll(/db\.(post|patch|del|restaurar) = async function[^{]*\{([\s\S]*?)\n  \};/g)];
eq("os quatro wrappers de agBar existem", wrappers.length, 4);
for (const w of wrappers) {
  ok(`wrapper de db.${w[1]} devolve o resultado`, /return r;/.test(w[2]));
}

// A chave da Anthropic saiu do cliente e não pode voltar. O que caracteriza a
// regressão é a CHAMADA, não a string: o arquivo cita api.anthropic.com num
// comentário que explica por que ela foi removida, e cita claude_api_key no SQL
// que derruba a coluna. Procurar a string acusaria a própria documentação.
const semComentarios = html
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
eq("nenhum fetch direto para a API da Anthropic",
  (semComentarios.match(/fetch\(\s*["'`]https:\/\/api\.anthropic\.com/g) || []).length, 0);
eq("nenhum header x-api-key no cliente",
  (semComentarios.match(/["']x-api-key["']/g) || []).length, 0);
eq("chave da IA não é lida do banco nem do localStorage",
  (semComentarios.match(/getItem\(\s*["']claude_api_key["']\s*\)|empresa\.claude_api_key/g) || []).length, 0);

grupo("Vitrine do miolo — volta representativa");
{
  // O caso que quebrou de verdade: o seguro lançado veículo a veículo dá
  // vários lançamentos com a MESMA data e a MESMA categoria. Ordenando por
  // data, esse lote tomava a volta inteira e o miolo parecia travado em
  // "Seguros" — como se fosse a única despesa do mês.
  const rec = [
    { chave: "Kablan Engenharia Ltda", valor: 8223, data: "2026-08-10" },
    { chave: "SP9 Incorpor. Ltda", valor: 2700, data: "2026-08-16" },
  ];
  const desp = [
    { chave: "Seguros", valor: 307, data: "2026-08-25" },
    { chave: "Seguros", valor: 412, data: "2026-08-25" },
    { chave: "Seguros", valor: 298, data: "2026-08-25" },
    { chave: "Seguros", valor: 255, data: "2026-08-25" },
    { chave: "Impostos", valor: 1220, data: "2026-08-06" },
    { chave: "Manutenção", valor: 310, data: "2026-08-07" },
  ];
  const volta = F.rdVoltaVitrine(rec, desp, 16);

  // 2 clientes + 3 categorias = 5 grupos, então a primeira rodada tem 5
  // cartões e passa uma vez por cada um.
  const primeiraRodada = volta.slice(0, 5).map((c) => c.nome);
  eq("a primeira rodada passa por todos os grupos, sem repetir",
    new Set(primeiraRodada).size, 5);
  eq("nenhum grupo aparece duas vezes antes de todos aparecerem uma",
    primeiraRodada.filter((n) => n === "Seguros").length, 1);
  // Enquanto houver dos dois lados, alterna; quando um acaba, o outro segue.
  eq("entrada e saída se intercalam enquanto há dos dois",
    volta.slice(0, 4).map((c) => c.tipo).join(","),
    "receita,despesa,receita,despesa");
  eq("o lote repetido só volta depois que todo mundo apareceu",
    volta[5].nome, "Seguros");
  eq("dentro do grupo, o maior lançamento vem primeiro",
    volta.find((c) => c.nome === "Seguros").valor, 412);
  eq("a volta cobre todos os lançamentos", volta.length, rec.length + desp.length);
  eq("cliente entra com o nome curto, igual ao rótulo da fatia",
    volta[0].nome, "Kablan");
  eq("categoria de despesa entra com o nome inteiro",
    F.rdNomeNoGrafico("despesa", "Contabilidade"), "Contabilidade");
  eq("o teto corta a volta", F.rdVoltaVitrine(rec, desp, 3).length, 3);
  eq("mês sem lançamento devolve volta vazia", F.rdVoltaVitrine([], [], 16).length, 0);
}

// ───────────────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
if (falhas.length) {
  console.log(`\x1b[31m${falhas.length} falha(s)\x1b[0m de ${passou + falhas.length} verificações`);
  for (const f of falhas) console.log(`  • [${f.grupo}] ${f.descricao}`);
  process.exit(1);
}
console.log(`\x1b[32mTodas as ${passou} verificações passaram.\x1b[0m`);
