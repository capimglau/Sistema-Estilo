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

grupo("Anotação do contrato — tipo escolhido");
eq("sem marcador é comentário", F.lerAnotacaoContrato("Pagamento via Pix").tipo, "comentario");
eq("comentário não vai pro painel", F.avariaDoContrato({ observacoes: "Pagamento via Pix" }), null);
eq("contrato sem observações não vai pro painel", F.avariaDoContrato({}), null);
eq("reconhece avaria", F.lerAnotacaoContrato("⚠️ Avaria: farol trincado").tipo, "avaria");
eq("reconhece manutenção", F.lerAnotacaoContrato("🔧 Manutenção pendente: freio").tipo, "manutencao");
eq("reconhece sem emoji", F.lerAnotacaoContrato("Avaria: risco na porta").tipo, "avaria");
eq("reconhece sem acento", F.lerAnotacaoContrato("manutencao pendente").tipo, "manutencao");
eq("só a primeira linha define o tipo",
  F.lerAnotacaoContrato("Pagamento via Pix\n⚠️ Avaria: farol").tipo, "comentario");
eq("frase que menciona avaria no meio não vira tipo",
  F.lerAnotacaoContrato("Cliente relatou avaria no retrovisor").tipo, "comentario");
eq("lê o texto depois dos dois pontos",
  F.lerAnotacaoContrato("⚠️ Avaria: farol trincado").texto, "farol trincado");
eq("sem texto na marca, usa a linha de baixo",
  F.lerAnotacaoContrato("⚠️ Avaria\nFarol trincado").texto, "Farol trincado");

eq("marcar como avaria leva o comentário junto",
  F.definirTipoAnotacao("Farol trincado", "avaria"), "⚠️ Avaria\nFarol trincado");
eq("trocar de tipo preserva o texto",
  F.definirTipoAnotacao("⚠️ Avaria: farol trincado", "manutencao"),
  "🔧 Manutenção pendente: farol trincado");
eq("voltar pra comentário tira só o marcador",
  F.definirTipoAnotacao("⚠️ Avaria: farol\nPagamento via Pix", "comentario"), "Pagamento via Pix");
eq("marcar duas vezes não duplica",
  F.definirTipoAnotacao(F.definirTipoAnotacao("Obs", "avaria"), "avaria"), "⚠️ Avaria\nObs");
eq("tipo desconhecido cai em comentário", F.tipoAnotacao("xpto").id, "comentario");

grupo("Manutenção pendente — painel");
{
  const veiculos = [{ id: 1, placa: "ABC1D23", marca: "VW", modelo: "Saveiro" },
                    { id: 2, placa: "XYZ4E56", marca: "Fiat", modelo: "Strada" }];
  const clientes = [{ id: 7, nome: "Kablan Engenharia Ltda" }, { id: 8, nome: "SP9 Ltda" }];
  const contratos = [
    { id: 11, veiculo_id: 1, cliente_id: 7, status: "ativo", data_inicio: "2026-08-01" },
    { id: 12, veiculo_id: 2, cliente_id: 8, status: "ativo", data_inicio: "2026-08-01",
      observacoes: "🔧 Manutenção pendente: revisão dos 20 mil" },
  ];
  const mans = [
    { id: 91, veiculo_id: 1, descricao: "Troca de embreagem", custo: 2400,
      status: "pendente", data_previsao_pagamento: "2026-08-20" },
    { id: 92, veiculo_id: 1, descricao: "Alinhamento", custo: 180, status: "pago",
      data_previsao_pagamento: "2026-08-02" },
  ];
  const p = F.painelManutencoesPendentes(mans, contratos, veiculos, clientes);

  eq("manutenção paga sai do painel", p.filter((l) => l.id === 92).length, 0);
  eq("pendente e tique aparecem juntos", p.length, 2);
  eq("linha do registro traz o cliente do contrato do veículo", p[0].cliente, "Kablan Engenharia Ltda");
  eq("linha do registro traz o contrato", p[0].contrato_id, 11);
  eq("linha do registro traz a placa", p[0].placa, "ABC1D23");
  eq("linha do contrato usa o texto da anotação como descrição",
    p.find((l) => l.origem === "contrato").descricao, "revisão dos 20 mil");
  eq("linha do contrato carrega o tipo escolhido",
    p.find((l) => l.origem === "contrato").tipo, "manutencao");
  eq("linha com data vem antes da linha sem data", p[0].origem, "manutencao");

  // Um veículo que já tem manutenção cadastrada não deve aparecer duas vezes
  // só porque o contrato também está marcado.
  const ct2 = contratos.concat([{ id: 13, veiculo_id: 1, cliente_id: 7, status: "ativo",
    data_inicio: "2026-08-05", observacoes: "🔧 Manutenção pendente" }]);
  eq("anotação não duplica veículo que já tem registro pendente",
    F.painelManutencoesPendentes(mans, ct2, veiculos, clientes).length, 2);

  eq("em andamento continua pendente", F.manutencaoAindaPendente({ status: "em_andamento" }), true);
  eq("cancelada sai", F.manutencaoAindaPendente({ status: "cancelada" }), false);
  eq("sem nada pendente devolve lista vazia",
    F.painelManutencoesPendentes([], [contratos[0]], veiculos, clientes).length, 0);

  // Comentário solto NÃO puxa o veículo — é o ponto do seletor.
  const ctObs = [{ id: 14, veiculo_id: 2, cliente_id: 8, status: "ativo",
    data_inicio: "2026-08-01", observacoes: "Pagamento via Pix, km livre" }];
  eq("comentário solto fica fora do painel",
    F.painelManutencoesPendentes([], ctObs, veiculos, clientes).length, 0);

  const ctAvaria = [{ id: 14, veiculo_id: 2, cliente_id: 8, status: "ativo",
    data_inicio: "2026-08-01", observacoes: "⚠️ Avaria: farol direito trincado" }];
  const pAv = F.painelManutencoesPendentes([], ctAvaria, veiculos, clientes);
  eq("avaria marcada entra no painel", pAv.length, 1);
  eq("com o texto da anotação", pAv[0].descricao, "farol direito trincado");
  eq("e com o tipo avaria", pAv[0].tipo, "avaria");

  // Avaria antes de manutenção pendente entre as linhas sem data.
  const ctMix = [
    { id: 15, veiculo_id: 1, cliente_id: 7, status: "ativo", data_inicio: "2026-08-01",
      observacoes: "🔧 Manutenção pendente: embreagem" },
    { id: 16, veiculo_id: 2, cliente_id: 8, status: "ativo", data_inicio: "2026-08-01",
      observacoes: "⚠️ Avaria: farol" },
  ];
  eq("avaria vem antes de manutenção pendente",
    F.painelManutencoesPendentes([], ctMix, veiculos, clientes)[0].descricao, "farol");
}

grupo("Multas — de quem é a bola");
{
  const etapa = (m) => { const s = F.situacaoMulta(m); return s ? s.resp + "/" + s.acao : null; };
  eq("multa recém-recebida é minha",
    etapa({}), "voce/Enviar notificação ao condutor");
  // O caso que motivou o painel: enviei pro cliente assinar e ele não devolveu.
  eq("notificação enviada fica com o cliente",
    etapa({ data_notificacao: "2026-08-02" }), "cliente/Aguardando o cliente assinar");
  eq("assinou, volta pra mim notificar o órgão",
    etapa({ data_notificacao: "2026-08-02", dsv_assinado_em: "2026-08-04" }), "voce/Notificar o órgão");
  eq("órgão notificado, falta eu pedir o boleto",
    etapa({ status_notificacao: "notificado" }), "voce/Solicitar o boleto");
  eq("boleto pedido fica com o órgão",
    etapa({ status_notificacao: "notificado", boleto_orgao_solicitado: true }), "orgao/Aguardando o boleto do órgão");
  eq("boleto na mão, falta pagar",
    etapa({ status_notificacao: "notificado", boleto_orgao_solicitado: true, boleto_orgao_recebido: true }),
    "voce/Pagar o órgão");
  eq("pago ao órgão, falta cobrar",
    etapa({ status_notificacao: "notificado", boleto_orgao_recebido: true, status: "pago" }), "voce/Cobrar do cliente");
  eq("cobrado, aguarda o cliente pagar",
    etapa({ status: "pago", cobrado_cliente: "pendente" }), "cliente/Aguardando o cliente pagar");
  eq("recusa de assinatura volta pra mim",
    etapa({ status_notificacao: "nao_notificado", data_notificacao: "2026-08-02" }),
    "voce/Recusou assinar — solicitar boleto");

  eq("multa quitada pelo cliente sai do painel", F.situacaoMulta({ cobrado_cliente: "pago" }), null);
  eq("multa cancelada sai do painel", F.situacaoMulta({ status: "cancelada" }), null);
  eq("encerrada é reconhecida", F.multaEncerrada({ cobrado_cliente: "pago" }), true);

  // O prazo depende da etapa: antes de notificar o órgão vale o prazo legal
  // de indicação do condutor; depois, o vencimento do boleto.
  eq("antes do órgão, vale o prazo de indicação",
    F.situacaoMulta({ prazo_notificacao_orgao: "2026-08-15", vencimento: "2026-09-10" }).prazo, "2026-08-15");
  eq("depois do órgão, vale o vencimento",
    F.situacaoMulta({ status_notificacao: "notificado", prazo_notificacao_orgao: "2026-08-15", vencimento: "2026-09-10" }).prazo,
    "2026-09-10");
  eq("sem prazo de indicação, cai no vencimento",
    F.situacaoMulta({ vencimento: "2026-09-10" }).prazo, "2026-09-10");
}

grupo("Multas — painel agrupado");
{
  const veiculos = [{ id: 1, placa: "ABC1D23", marca: "VW", modelo: "Saveiro" }];
  const clientes = [{ id: 7, nome: "Kablan Engenharia Ltda" }, { id: 8, nome: "SP9 Ltda" }];
  const contratos = [{ id: 11, veiculo_id: 1, cliente_id: 8, status: "ativo" }];
  const multas = [
    { id: 1, veiculo_id: 1, cliente_id: 7, valor: 130, ait: "A1", prazo_notificacao_orgao: "2026-08-30" },
    { id: 2, veiculo_id: 1, cliente_id: 7, valor: 293, ait: "A2", data_notificacao: "2026-08-02",
      prazo_notificacao_orgao: "2026-08-12" },
    { id: 3, veiculo_id: 1, cliente_id: 7, valor: 88, ait: "A3", prazo_notificacao_orgao: "2026-08-09" },
    { id: 4, veiculo_id: 1, cliente_id: 7, valor: 500, ait: "A4", cobrado_cliente: "pago" },
    { id: 5, veiculo_id: 1, contrato_id: 11, valor: 195, ait: "A5",
      status_notificacao: "notificado", boleto_orgao_solicitado: true, vencimento: "2026-08-25" },
  ];
  const g = F.painelMultasPendentes(multas, contratos, veiculos, clientes);

  eq("grupos vazios não aparecem", g.length, 3);
  eq("aguardando você vem primeiro", g[0].id, "voce");
  eq("depois o cliente", g[1].id, "cliente");
  eq("por último o órgão", g[2].id, "orgao");
  eq("multa quitada não entra em grupo nenhum",
    g.reduce((t, x) => t + x.itens.length, 0), 4);
  eq("prazo mais apertado primeiro dentro do grupo", g[0].itens[0].ait, "A3");
  eq("o grupo soma os valores", g[0].total, 218);
  eq("cliente vem do contrato quando a multa não tem",
    g[2].itens[0].cliente, "SP9 Ltda");
  eq("linha carrega a placa", g[0].itens[0].placa, "ABC1D23");
  eq("sem multa nenhuma, nenhum grupo",
    F.painelMultasPendentes([], contratos, veiculos, clientes).length, 0);
  eq("todas quitadas, nenhum grupo",
    F.painelMultasPendentes([multas[3]], contratos, veiculos, clientes).length, 0);
}

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
