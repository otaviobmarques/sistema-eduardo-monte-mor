# CLAUDE.md — Sistema de OS – Auto Visão

Este arquivo contém o briefing de desenvolvimento V1 (abaixo, transcrito do PDF de 05/11/2026).
**Quando divergir do "Documento de escopo funcional" de 04/11/2026, vale este documento.**

## Decisões tomadas (seção 14) — 05/11/2026
1. Preços: Creditas usa a **tabela padrão**; valores **a definir** (seed zerado, editável em Cadastros).
2. Ajuste de preço com aprovação do cliente: implementado **atrás de flag** (`configuracoes.ajuste_preco_habilitado`, desligada).
3. Cor do veículo: **opcional** na abertura; a Loja completa.
4. Motivos: lista do seed (seção 11), editável em Cadastros › Motivos.
5. SLA: **horas corridas** (padrão). `lib/regras/sla.ts` já suporta horas úteis + feriados.
6. Pátios: endereço/cidade **provisórios** até confirmação do franqueado.
7. Importação em lote: a planilha não traz categoria; as OS do lote nascem como **Carro** (1ª categoria) e a Loja corrige na ficha se preciso.
8. **Modelo novo da importação (09/11/2026)**: planilha de controle (Data, Cliente/unidade, Solicitação, Placa, Veículo, Renavam,
   Ano/Modelo, Cor, Serviço, Valor, Deslocamento, Forma de Pagamento, Pagamento Efetuado, Status, Obs.). O modelo antigo
   (PLACA, MODELO, RENAVAM, PÁTIO) continua aceito. A **unidade** (coluna Cliente) é campo da OS (`ordens_servico.unidade`);
   o **pátio** é reconhecido pelo nome da unidade (`acharPatioPorUnidade`). **Loja importando** (`lotes_importacao.modo =
   'historico'`): valem Data, Status, Pagamento e Valor da linha; vistoriadas entram com `sla_indisponivel` (fora das
   métricas de prazo) e sem rajada de alertas. **Cliente importando**: tudo vira OS nova “A vistoriar”, valor pela tabela.
9. **Concluir OS sem laudo (09/11/2026)**: a Loja pode finalizar sem PDF (`concluir_sem_laudo()`), com alerta na tela,
   motivo e confirmação obrigatórios e as mesmas travas do laudo (pendência aberta; atraso exige justificativa).
   A OS fica `sem_laudo = true` (selo “Sem laudo” na ficha) até um laudo ser anexado (“Anexar laudo”).
10. **Conclusão livre (09/11/2026)**: o Gestor com `perfis_usuario.conclusao_livre = true` (ligado para o `eduardo`)
   fecha a placa sem travas: sem motivo nem confirmação, com OS frustrada, com pendência aberta (encerrada junto, pausas
   fechadas) e com atraso sem justificativa (`app.conclusao_livre` na transação pula `tg_exigir_justificativa`).
   Vale para “Concluir sem laudo” e “Enviar laudo”. Os demais Gestores continuam com as travas.
11. **Melhorias (09/11/2026)**: o mesmo Gestor (`conclusao_livre`) **reabre** OS vistoriada/cancelada (`reabrir_os()`,
   volta para A vistoriar · Aberta; o tempo encerrada não conta) e **pausa/retoma** o prazo à mão (`pausar_os()` /
   `retomar_os()`, pausa `origem = 'manual'`). **Cores dos status** em Configurações (`configuracoes.cores_status`:
   amarelo, roxo, vermelho, verde ou azul, `lib/cores-status.ts`), aplicadas por variáveis CSS (`components/cores-status.tsx`)
   para a Loja e os clientes dela. **Filtro “Unidade / Pátio”** com várias escolhas (parâmetro `local=p:<pátio>`/`u:<unidade>`,
   `lib/fila.ts`) na fila da Loja, na exportação e no painel do cliente. **Sessão**: “Sair” encerra só o aparelho
   (`signOut({ scope: 'local' })`), o middleware não desloga por falha passageira e `ManterSessao` renova o acesso.
12. **Data da conclusão (09/11/2026)**: o Gestor com `conclusao_livre` escolhe data/hora da conclusão (pode ser anterior a
   hoje; nunca antes da abertura nem no futuro) em “Concluir sem laudo” e “Enviar laudo” (`p_concluida_em`,
   `data_conclusao()`). O SLA (no prazo/atrasada, tempo de conclusão, mês do fechamento) vale por essa data; pausas abertas
   fecham nela. Gestor comum: sempre “agora”.
13. **Painel de OS (10/11/2026)**: OS pausada mostra o motivo na fila e na exportação (`sla_pausas.motivo` da pausa manual;
   descrição da pendência/frustração). KPI **“A receber em <mês>”** soma todas as placas abertas no mês com pagamento
   pendente, em qualquer status menos cancelado (`numerosDoMes().aReceberMes`). Card **“Vistorias por pátio”**: ranking das
   OS abertas no mês (sem canceladas) por pátio, com quantas já vistoriadas.

## Multi-Loja e Administrador (decidido em 05/11/2026 — substitui “multiempresa fora da V1”)
- **3 perfis**: `admin` (dono da plataforma, sem Loja: cadastra Lojas franqueadas, gera o Gestor e cobra),
  `loja` (Gestor de UMA Loja) e `cliente` (empresa cliente de UMA Loja).
- **Tudo separado por Loja** (`loja_id` em clientes, OS, lotes, pátios, serviços, preços, vistoriadores, motivos,
  configurações, feriados, notificações, auditoria). `categorias_veiculo` é global. Numeração de OS por Loja
  (`lojas.proximo_numero_os`). Mesmo CNPJ pode ser cliente de duas Lojas.
- RLS: `minha_loja()`, `is_loja()`, `minha_empresa()`, `os_da_minha_loja()`, `is_admin()`. Loja **bloqueada ou
  inativa** ⇒ essas funções retornam nulo/falso ⇒ Gestor e clientes dela não leem nada.
- Loja nova nasce com `semear_loja()` (serviço padrão, preços zerados, motivos, configurações); pátios vazios.
- **Cobrança das Lojas pelo Asaas** (`lib/asaas.ts`, webhook `/api/asaas/webhook`, faturas em `faturas`):
  Start (cobrança única) + assinatura mensal (Pix/boleto/cartão). Sem gateway ativo, faturas manuais + baixa.
- **Gateways de pagamento** em `/admin/gateways`: o Administrador configura o Asaas (chave, sandbox/produção, teste de
  conexão, webhook automático). Chave e token do webhook ficam no **Supabase Vault** (`salvar_gateway()`, só admin);
  o servidor lê por `credenciais_gateway()` (só service_role). Variáveis `ASAAS_*` são apenas alternativa.
  Mercado Pago e Stripe aparecem como "Em breve" (não implementados).
- **Nova fatura** em `/admin/cobranca` com escolha da Loja e opção “Cobrar pelo Asaas” (gera link Pix/boleto/cartão)
  ou fatura manual com baixa.
- FKs para `auth.users` são `ON DELETE SET NULL` (exceto perfis/push em cascata) para permitir excluir usuários.
- Testes E2E usam um administrador temporário (`adminTemporario()`), nunca o login real `admin`.
- **Inadimplência**: `verificar_inadimplencia()` diária (pg_cron 09:05) marca vencidas e bloqueia quem passar de
  `dias_tolerancia`; `reavaliar_bloqueio()` libera ao pagar (só bloqueios automáticos).
- Logins: `admin` = Administrador (Otávio); `eduardo` = Gestor da Loja Auto Visão Monte Mor.
- Testes E2E criam uma Loja isolada (`tests/e2e/apoio.js`) e apagam tudo no fim.

## Convenções do código
- Supabase project ref: `klctfofigyukwldcvsue` (sa-east-1). Migrations em `supabase/migrations` (aplicar em ordem).
- Funções `security definer`: nunca usar `current_user` para autorizar (é sempre o dono); usar `is_admin()`/`is_loja()`
  ou `auth.jwt() ->> 'role'`. Em funções que retornam `table(id, …)`, qualificar colunas (`lj.id`) para evitar ambiguidade.
- Leituras via RLS com o cliente do usuário (`lib/supabase/server.ts`). Mutações de negócio via funções SQL
  `security definer` (checam perfil) ou Server Actions; `lib/supabase/admin.ts` (service role) só no servidor,
  após `exigirPerfil()`.
- Regras puras e testadas em `lib/regras/*` (`npm test`). Datas sempre exibidas em America/Sao_Paulo (`lib/formato.ts`).
- Consultas que podem passar de 1000 linhas usam `todasAsLinhas()` (`lib/supabase/paginar.ts`): a API do Supabase corta em 1000.
- Relatórios leem `vw_os_sla` / `vw_kpis_mensais` (`security_invoker`). PDFs com `@react-pdf/renderer` (`lib/pdf/relatorio.tsx`);
  rotas que geram PDF precisam das fontes do pdfkit em `outputFileTracingIncludes` (next.config.ts).
- Cabeçalhos de segurança e CSP em `next.config.ts`: serviço externo novo chamado pelo navegador precisa entrar em `connect-src`.
- Docs de operação: `docs/DEPLOY.md`, `docs/BACKUP.md`, `docs/SEGURANCA.md`. E2E: `npm run test:e2e`
  (`PLANILHA=` com a planilha da Creditas para `etapa6-importacao` e `criterio-pronto`; `PLANILHA_DUKAR=` com a planilha de
  controle da Dukar para `importacao-modelo-novo`).
- Login por usuário: `loginParaEmail()` converte em e-mail sintético `@LOGIN_EMAIL_DOMAIN`.
- Marca: arquivos oficiais em `/public/brand/` extraídos do **Design System Auto Visão 1.1** (PDF oficial, 45 p.):
  `logo-colorido.png` / `logo-branco.png` (2048×474, proporção 4,3207), `simbolo.png`, `simbolo-mono.png`, `mosaico.png`.
  Use sempre `components/marca.tsx` (`Logo`, `Mosaico`, `RecorteSimbolo`). **Nunca recriar o lettering.**
- Regras do DS 1.1: fundo claro → logo colorido; fundo escuro **ou vermelho** → logo **integralmente branco**
  (não manter "visão" em vermelho). Área livre mínima 1x (ponto do "i"); redução mínima 320 px de largura em tela
  (em menus usar ≥ 28 px de altura). Vermelho da marca #ED3237 só em destaques ≥ 24 px; ações usam #C9232C.
  Tipografia: H1 Nunito 900 40/44, H2 800 32/38, H3 800 24/30, corpo Inter 400 16/24, rótulo Inter 600 14/20,
  legenda Inter 500 12/16. Contêiner até 1200 px; margens 16/24/32. Botões 48 px (compacto 40, grande 56), raio 8,
  foco 2 px com afastamento 2 px; indisponível = fundo superfície + texto secundário. Transições 120/180/240 ms.
  Feedback: barra lateral + ícone + título + texto. Abas: atual com texto, peso e traço vermelho.
  Ícones: grade 24 px, traço 2 px. Linguagem: verbo que descreve o resultado; erro explica como corrigir.

---

# Briefing original

Sistema de OS – Auto Visão: briefing de
desenvolvimento (V1)
      Este documento é a especificação para o Claude Code construir a V1.
      Salve-o como CLAUDE.md na raiz do repositório. Quando ele divergir
      do “Documento de escopo funcional” de 04/11/2026, vale este
      documento: o modelo de perfis foi simplificado depois.

1. Contexto
Nome do sistema: Sistema de OS – Auto Visão (use esse nome no título
das páginas, no manifest do PWA, no login e nos PDFs exportados).
A Auto Visão Vistorias (a “Loja”) faz vistorias veiculares para clientes
empresariais. O primeiro cliente é a Creditas, que manda lotes de veículos
parados em pátios de leilão (Freitas Utinga, Freitas Santa Bárbara, Leilo São
Carlos, Leilomaster SP).
O sistema substitui a planilha de controle atual. O cliente abre ordens de
serviço (OS) por placa, uma a uma ou em lote, e acompanha prazo e laudo. A
Loja executa, controla o SLA de 48h, registra frustrações, pendências e
pagamentos e entrega o laudo em PDF.
Objetivo: nenhuma informação perdida, nenhum prazo despercebido e tudo
rastreável por placa.

2. Stack e convenções
  •    Next.js 14+ (App Router) + TypeScript, com Server Actions e
       Route Handlers.
  •    Supabase: Postgres, Auth, Storage, Realtime e pg_cron.
  •    Tailwind CSS, configurado com os tokens do design system (seção
       10). Componentes próprios, sem biblioteca visual pronta.
  •    Zod para validação, compartilhado entre cliente e servidor.
  •    PWA (manifest e service worker) com Web Push (biblioteca web-push,
       chaves VAPID).
  •    Exportação: ExcelJS para Excel e @react-pdf/renderer para PDF.
  •    Deploy na Vercel, com fuso America/Sao_Paulo em toda exibição. O
       banco guarda timestamptz.
  •    Idioma da interface: português do Brasil. Moeda R$ e datas
       dd/mm/aaaa hh:mm.
  •    Testes com Vitest para regras de negócio (SLA, placa, Renavam,
       importação) e Playwright para os fluxos principais.
  •    Migrations SQL versionadas em supabase/migrations. RLS ligada em
       todas as tabelas.
3. Perfis e acesso
Há só dois perfis.

Perfil                       Quem                      Pode
loja                         Equipe da Auto Visão      Tudo: fila de OS, SLA,
                             (gestor)                  agendamento, laudos,
                                                       frustrações,
                                                       pendências, financeiro,
                                                       relatórios, cadastros
                                                       (clientes, pátios,
                                                       serviços, preços,
                                                       vistoriadores, motivos,
                                                       configurações) e
                                                       auditoria
cliente                      Um login por              Só os dados da própria
                             empresa cliente           empresa: abrir OS
                                                       (individual ou lote),
                                                       acompanhar, pedir
                                                       cancelamento,
                                                       responder pendências
                                                       atribuídas a ela, baixar
                                                       laudos, ver o próprio
                                                       painel, relatórios e
                                                       financeiro

Regras de acesso:
 •       O cliente não se cadastra. Só a Loja cria a empresa cliente e o login
         dela.
 •       Ao criar o login, o sistema gera uma senha temporária, mostrada
         uma única vez, com botão para copiar usuário e senha. Ela expira em
         7 dias, e o cliente é obrigado a trocá-la no primeiro acesso.
 •       A Loja pode resetar a senha (gera nova senha temporária) e
         bloquear ou desbloquear o acesso.
 •       O login é por usuário (texto curto, por exemplo creditas, ou e-mail) e
         senha. Use Supabase Auth com e-mail sintético interno quando o
         usuário não for e-mail, ou um fluxo próprio sobre Auth. O que importa
         é login por usuário e senha, sem confirmação por e-mail.
 •       Como o login é por empresa, todo pedido de abertura e de
         cancelamento exige “Nome do solicitante”, que fica gravado na
         OS e na auditoria.
 •       Vistoriadores não têm login. São um cadastro (nome, ativo) usado
         para designação e relatórios. Quem registra execução e frustração é a
         Loja.
  •   Toda consulta do perfil cliente passa por RLS filtrando empresa_cliente_id
      = (empresa do usuário).

4. Modelo de dados
Use UUIDs. Toda tabela tem created_at, updated_at e, onde fizer sentido,
created_by.

perfis_usuario      (user_id PK → auth.users, perfil enum[loja,cliente],
empresa_cliente_id NULL p/ loja,
             login text unique, nome_exibicao, deve_trocar_senha bool,
senha_expira_em timestamptz,
             bloqueado bool)
empresas_clientes (id, cnpj unique, razao_social, nome_fantasia, endereco,
telefone, email,
             responsavel_financeiro, responsavel_acesso, forma_cobranca
enum[faturado,avulso],
             usa_tabela_propria bool, sla_horas int default 48, ativo bool)
patios         (id, nome unique, endereco, cidade, uf, ativo)
patio_apelidos       (id, patio_id, apelido unique) -- p/ importação reconhecer "Freitas
S. Barbara"
categorias_veiculo (id, nome) -- Carro, Moto, Utilitário, Caminhão, Outro
servicos        (id, nome, sla_horas int default 48 check (sla_horas <= 48), ativo)
precos          (id, servico_id, categoria_id, valor numeric(10,2))
precos_cliente      (id, empresa_cliente_id, servico_id, categoria_id, valor) --
sobrepõe precos
taxas_deslocamento (id, cidade, uf, valor)
vistoriadores      (id, nome, ativo)
motivos          (id, tipo
enum[frustracao,cancelamento,atraso,pendencia,reagendamento], descricao, ativo)
configuracoes        (singleton: alerta1_horas default 24, alerta2_horas_antes default
8,
             contagem enum[corridas,uteis] default corridas, horario_util jsonb,
             escalonar_minutos default 30)

lotes_importacao (id, empresa_cliente_id, arquivo_path, nome_solicitante, total,
validas, com_erro,
            duplicadas, status enum[previa,confirmado,descartado], criado_por,
criado_em)
lote_linhas    (id, lote_id, linha int, dados_originais jsonb, placa_normalizada,
renavam,
            modelo, patio_id NULL, servico_id NULL, resultado
enum[ok,erro,duplicada], mensagens text[])

ordens_servico    (id, numero bigserial unique, empresa_cliente_id, lote_id NULL,
            nome_solicitante, telefone_contato,
            -- cópia dos dados do veículo (não muda se o cadastro mudar)
            placa, renavam, marca_modelo, ano, cor NULL, categoria_id,
            servico_id, local_tipo enum[patio,endereco], patio_id NULL, endereco
NULL, cidade, uf,
             observacao, status enum[a_vistoriar,frustrado,vistoriado,cancelado],
             etapa enum[aberta,agendada,em_execucao,laudo_em_elaboracao]
NULL,
              vistoriador_id NULL, aberta_em timestamptz, prazo_em timestamptz,
              pausado_desde timestamptz NULL, total_pausado interval default '0',
              alerta1_enviado bool, alerta2_enviado bool, vencida_notificada bool,
              concluida_em NULL, cancelada_em NULL,
              valor_base, valor_deslocamento, valor_ajuste, valor_final,
              pagamento_status enum[pendente,pago,faturado] default pendente,
              pagamento_forma NULL, pagamento_data NULL)
os_agendamentos (id, os_id, versao int, data_hora, local_texto, vistoriador_id,
motivo_id NULL,
              motivo_texto NULL, criado_por)
os_frustracoes       (id, os_id, motivo_id, descricao, ocorrida_em, pendencia_id,
criado_por)
os_cancelamentos (id, os_id, solicitado_por_nome, solicitado_por_user, motivo_id,
descricao, data)
pendencias          (id, os_id, tipo
enum[documental,falta_autorizacao,nao_localizado,agendamento,outra],
              descricao, responsavel enum[cliente,loja], previsao date, resolvida_em
NULL,
              resolucao_texto NULL, criado_por)
sla_pausas         (id, os_id, inicio, fim NULL, origem
enum[frustracao,pendencia,aprovacao_preco])
justificativas_atraso (id, os_id, motivo_id, texto, criado_por, criado_em)
os_ajustes_preco (id, os_id, valor_anterior, valor_novo, motivo, status
enum[pendente,aprovado,recusado],
              decidido_por_nome, decidido_em)
anexos           (id, os_id, tipo
enum[laudo,foto,documento,comprovante,justificativa],
              storage_path, nome_arquivo, versao int, atual bool, enviado_por,
enviado_em)
historico_os      (id, os_id, evento text, de text, para text, usuario_id,
nome_exibicao, em)
auditoria        (id, tabela, registro_id, campo, valor_anterior, valor_novo, usuario_id,
em)
notificacoes       (id, destino enum[loja,cliente], empresa_cliente_id NULL, tipo, os_id
NULL,
              lote_id NULL, titulo, corpo, criada_em, vista_em NULL, vista_por NULL)
push_inscricoes (id, user_id, endpoint, p256dh, auth, criado_em)
acessos_log         (id, user_id, ip, user_agent, em, sucesso bool)

Índices: ordens_servico(placa), (renavam), (empresa_cliente_id, status),
(prazo_em) where status='a_vistoriar', além de busca textual por marca_modelo
e nome_solicitante.
Auditoria: um trigger genérico em ordens_servico, pendencias,
os_agendamentos, empresas_clientes e precos grava em auditoria um registro
por campo alterado (valor anterior e novo, usuário e data). O usuário vem de
auth.uid().
5. Regras de negócio
5.1 Placa e Renavam
  • Placa: remover espaços e hífen e converter para maiúsculas. Válida se
     casar com ^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$ (formato antigo e Mercosul).
     Guardar a original na linha do lote para mostrar “digitada eui6776”.
  • Renavam: só dígitos, com zeros à esquerda até 11. DV: aplicar os
     pesos 3,2,9,8,7,6,5,4,3,2 aos 10 primeiros dígitos e somar. dv = (soma *
     10) % 11; se dv == 10, então dv = 0. Comparar com o 11º dígito.
     Escrever testes unitários.
  • Duplicidade: não deixar abrir OS para uma placa que já tem OS
     a_vistoriar ou frustrado do mesmo cliente. Mostrar o número da OS
     existente.
  • Placa já conhecida: ao digitar a placa, preencher modelo, ano,
     categoria e cor a partir da última OS do mesmo cliente, com aviso
     “Placa já vistoriada antes. Confira.”

5.2 Status e etapas
  • O cliente vê 4 status: A vistoriar, Frustrado, Vistoriado,
     Cancelado.
  • Dentro de “A vistoriar”, a Loja controla a etapa: Aberta → Agendada →
     Em execução → Laudo em elaboração.
  • Toda mudança grava em historico_os (linha do tempo da ficha).

5.3 SLA
  • O relógio começa na abertura (aberta_em). Prazo padrão de 48h,
     vindo de servicos.sla_horas ou do SLA do cliente, o que for menor, nunca
     acima de 48.
  • prazo_em = aberta_em + sla + total_pausado, recalculado ao fechar cada
     pausa.
  • Pausas: abrem ao frustrar, ao abrir uma pendência e enquanto um
     ajuste de preço aguarda o cliente. Fecham quando aquilo é resolvido.
     Com a OS pausada, o tempo não corre e o painel mostra “Pausado ·
     Xh”.
  • Cor, calculada na leitura e não gravada:
       –   Verde: tempo útil consumido < alerta1_horas (24h).
       –   Amarelo: ≥ 24h e antes do prazo.
       –   Vermelho: passou do prazo.
       –   Cinza: pausada.
     Cor nunca sozinha: sempre ícone ou forma e texto (“Vence em 3h”,
     “+5h atrasada”).
  • Alertas por job pg_cron a cada 5 min (ou Vercel Cron chamando um
     endpoint protegido):
       –   Ao completar 24h, notifica Loja e cliente.
       –   Quando faltarem alerta2_horas_antes (8h), notifica de novo.
       –   Ao vencer, notifica os dois. As flags na OS evitam envio
           duplicado.
 •   Horas úteis: se contagem = uteis, usar horario_util (dias e horas) e uma
     tabela de feriados. A V1 pode nascer só com horas corridas, mas a
     função de cálculo já deve receber a configuração.
 •   Atraso: uma OS vermelha só pode ir para Vistoriado com uma
     justificativa (motivo padronizado + texto). Sem ela, o botão de
     concluir fica bloqueado.

5.4 Frustração e pendências
  • Frustrar exige motivo, data e hora, descrição, responsável (cliente ou
     loja), previsão de resolução e anexo opcional.
  • Ao frustrar, o sistema muda o status para frustrado, abre uma pendencia
     ligada, abre uma sla_pausa e notifica o cliente.
  • Resolver a pendência: fecha a pausa, volta o status para a_vistoriar
     (na etapa anterior ou em Aberta) e retoma o relógio.
  • Pendências também podem ser abertas sem frustrar (falta documento,
     por exemplo). Elas pausam o SLA da mesma forma.
  • A tela de Pendências mostra o tempo aberto, a previsão (vencida em
     vermelho) e o responsável.

5.5 Cancelamento
  • Cliente ou Loja podem cancelar. Exige nome de quem pediu, motivo e
     descrição.
  • O cancelamento encerra o SLA e grava em os_cancelamentos. O sistema
     mostra há quanto tempo a OS está cancelada.

5.6 Agendamento
  • Data e hora, local e vistoriador. Reagendar cria uma nova versão em
     os_agendamentos, com motivo, e mantém o histórico.
  • Há uma agenda por vistoriador (visão de dia e semana).

5.7 Laudo e anexos
  • O laudo é PDF de até 20 MB, enviado pela Loja ao bucket privado
     laudos/{empresa}/{os}/v{n}.pdf.
  • O envio do laudo conclui a OS (status vistoriado, concluida_em),
     encerra o SLA, congela valor_final e notifica o cliente.
  • Um novo envio cria uma nova versão. O cliente sempre vê a mais
     recente, e as anteriores ficam no histórico.
  • Outros anexos (fotos, documentos, comprovantes, justificativas)
     podem ser JPG, PNG ou PDF.
  • Download sempre por URL assinada de curta duração.
5.8 Preço e pagamento (pagamento é feito por fora do sistema)
  • valor_base vem de precos_cliente, se existir, ou de precos (serviço ×
     categoria).
  • valor_deslocamento vem de taxas_deslocamento quando o local é um
     endereço fora de pátio cadastrado.
  • Ajuste de preço: a Loja propõe um novo valor e o cliente aprova ou
     recusa. Só vale depois de aprovado, e enquanto isso o SLA fica
     pausado. (Ainda em aberto se entra na V1: deixar atrás de uma flag.)
  • Pagamento por placa: status (pendente, pago ou faturado), forma,
     data e comprovante anexado.
  • Painéis mostram valor recebido × pendente. Um alerta de “pagamento
     pendente” vai para a Loja.
  • Fechamento mensal por cliente: OS vistoriadas no mês, com totais,
     exportável.
5.9 Importação em lote (V1)
  1. Baixar o modelo .xlsx com as colunas: PLACA, MODELO, RENAVAM, PÁTIO,
     SERVIÇO, OBS (SERVIÇO e OBS opcionais, o serviço padrão é “Vistoria
     cautelar”).
  2. Enviar .xlsx ou .csv, com até 500 linhas. Pedir Nome do solicitante
     uma vez para o lote.
  3. Prévia: para cada linha, normalizar a placa, validar o Renavam,
     reconhecer o pátio (nome ou patio_apelidos, sem distinção de
     maiúsculas e acentos) e checar duplicidade. Mostrar os contadores
     (prontas, com erro, já com OS, placas corrigidas) e filtros. Linhas com
     erro podem ser corrigidas na própria prévia ou baixadas.
  4. Confirmar: criar uma OS por linha válida numa única transação,
     com o mesmo aberta_em, e gerar uma notificação só para o lote
     (“Novo lote · Creditas · 37 OS”).
  5. A planilha atual da Creditas tem linhas com placa em minúsculas e
     modelo em texto livre. Aceitar o modelo como vier e ignorar colunas
     extras e linhas vazias.

5.10 Cadastro de cliente (só perfil Loja)
  • O CNPJ busca razão social, nome fantasia, endereço e telefone na
     BrasilAPI (/api/cnpj/v1/{cnpj}), com fallback manual. Endereço via
     ViaCEP quando faltar.
  • Condições comerciais: forma de cobrança, tabela de preços (padrão ou
     própria), responsável financeiro e SLA.
  • Acesso do cliente: usuário, responsável pelo acesso e botão Gerar
     acesso, que mostra a senha temporária uma vez. Botões Resetar
     senha e Bloquear acesso. Situação: Aguardando 1º acesso, Ativo ou
     Bloqueado.
6. Notificações (V1: só dentro do sistema)
  •  Realtime: os painéis assinam notificacoes e ordens_servico via
     Supabase Realtime e atualizam sem recarregar.
  • Na Loja, ao chegar OS ou lote:
        –  Toast escuro no canto (“Novo lote recebido · Creditas · 37 OS ·
           Ver lote”).
        –  Som de alerta, repetindo a cada 20 s até alguém abrir a
           notificação.
        –  Contador no menu e título da aba piscando, por exemplo “(2)
           Nova OS”.
        –  Os navegadores bloqueiam som automático, então mostrar uma
           vez por sessão o botão “Ativar alertas sonoros”.
  • Web Push para o navegador e para o celular com o PWA instalado.
     Pedir permissão na primeira entrada.
  • Escalonamento: OS ou lote sem ninguém abrir em escalonar_minutos
     gera um push reforçado.
  • Eventos:
 Evento                Loja                Cliente
 Nova OS ou lote        ✓
 Vistoriado (laudo                           ✓
 disponível)
 Frustrado              ✓                    ✓
 Cancelado              ✓                    ✓
 Alerta de 24h          ✓                    ✓
 Faltam 8h              ✓                    ✓
 Vencida                ✓                    ✓
 Novo preço                                  ✓
 aguardando
 Pagamento              ✓
 pendente
 Pendência atribuída ✓                       ✓
  • Registrar vista_em e vista_por. Isso alimenta o indicador “tempo até o
      primeiro atendimento”.
  • WhatsApp e e-mail ficam fora da V1, mas o envio deve passar por um
      módulo notificar() único, para acrescentar canais depois.

7. Telas e rotas
Comum: /login (usuário e senha), /trocar-senha (obrigatória no primeiro
acesso).
Loja (/loja/...):
Rota                Conteúdo
/loja               Fila de OS: hero com ações (Abrir
                    OS para cliente, Importar lote). KPIs:
                    a vistoriar, vencendo, vencidas,
                    vistoriadas no mês com % no prazo,
                    frustradas/canceladas, a receber.
                    Busca (placa, Renavam, modelo,
                    solicitante, nº OS), filtros (cliente,
                    pátio, cidade, etapa, vistoriador),
                    chips de SLA (Todas, Vencidas,
                    Vencendo, No prazo, Pausadas).
                    Tabela ordenada por urgência
                    (vencidas, depois vencendo, depois
                    restante), com a cor do SLA na
                    lateral da linha. Exportar Excel e
                    PDF. Cards com motivos de atraso
                    do mês e vistoriadores hoje.
/loja/os/[numero]   Ficha da placa: placa estilo
                    Mercosul, modelo, status e SLA.
                    Ações: Registrar frustração,
                    Cancelar, Enviar laudo. Barra de SLA
                    com marcos (abertura, 24h, 2º
                    alerta, prazo), tempo corrido,
                    pausas e restante. Dados do veículo
                    e da solicitação. Observação do
                    cliente em destaque. Agendamento
                    com histórico de versões. Upload do
                    laudo e anexos. Pagamento com
                    comprovante. Linha do tempo e
                    auditoria campo a campo.
(modal)             Registrar frustração, Justificar
                    atraso, Cancelar OS, Reagendar,
                    Resolver pendência.
/loja/pendencias    KPIs (abertas, previsão vencida, com
                    o cliente, com a loja), chips por tipo
                    e tabela com o botão Resolver.
/loja/agenda        Agenda por vistoriador.
/loja/relatorios    Lista de relatórios à esquerda: por
                    cidade, por pátio, por vistoriador,
                    desempenho de SLA, frustrados e
                    cancelados, pagamentos,
                    fechamento mensal, por período.
                    Filtros (período, cliente, cidade,
                    pátio, status). KPIs: vistorias, % no
Rota                                   Conteúdo
                                       prazo, tempo médio, índice de
                                       frustração e de cancelamento.
                                       Gráfico de barras e tabela. Exportar
                                       Excel e PDF.
/loja/financeiro                       Pagos × pendentes por placa, baixa
                                       de pagamento e fechamento
                                       mensal.
/loja/clientes, /loja/clientes/novo,   Cadastro de cliente e acesso (5.10).
/loja/clientes/[id]
/loja/cadastros/*                      Pátios (com apelidos), serviços e
                                       preços, preços por cliente, taxas de
                                       deslocamento, vistoriadores,
                                       motivos.
/loja/configuracoes                    SLA, alertas, contagem e
                                       escalonamento.
/loja/auditoria                        Busca na trilha de auditoria.

Cliente (/app/...):

Rota                                   Conteúdo
/app                                   Painel: hero “Olá, {empresa}” com
                                       Nova OS e Importar planilha. Alerta
                                       de pendências que aguardam o
                                       cliente. KPIs: recebidas no mês,
                                       vistoriadas, a vistoriar, frustradas,
                                       canceladas, não pagas. Busca por
                                       placa, chips de status e tabela com
                                       status, prazo, pagamento e botão
                                       Baixar PDF.
/app/nova-os                           Solicitante (empresa somente
                                       leitura, nome do solicitante,
                                       telefone, abertura automática).
                                       Veículo: placa grande, Renavam
                                       com DV validado ao vivo, aviso de
                                       placa conhecida, modelo, ano, cor
                                       opcional, categoria em botões.
                                       Serviço e local: serviço com preço,
                                       “Em pátio” ou “Outro endereço”, e a
                                       cidade vem do pátio. Observações e
                                       anexos. Resumo lateral com prazo
                                       do laudo (abertura + 48h), valor e
                                       botão Abrir OS.
/app/importar                          Passos (modelo, envio, prévia, criar),
Rota                                    Conteúdo
                                        arquivo enviado, contadores, filtros,
                                        tabela da prévia e barra final “N OS
                                        serão criadas com abertura às
                                        HH:MM”, com os botões Baixar
                                        linhas com erro e Criar N OS.
/app/os/[numero]                        Ficha somente leitura: linha do
                                        tempo, SLA, laudo, pendência (com
                                        campo para o cliente responder) e
                                        cancelar.
/app/pendencias, /app/relatorios,       Versões filtradas para o cliente.
/app/financeiro

Responsivo: em telas < 900px o menu lateral vira gaveta e aparece uma
barra inferior. Tabelas viram cartões em telas < 760px.

8. Relatórios e exportação
 •     Todos os relatórios aceitam os filtros período, cliente, cidade, pátio,
       vistoriador, status e pagamento.
 •     Excel: uma aba de dados e uma aba de resumo. PDF: com logo, título,
       filtros aplicados, data de geração e paginação.
 •     KPIs: % no prazo, % frustrados, % cancelados, tempo médio de
       conclusão (abertura até laudo, descontando pausas), vistorias por
       vistoriador, volume por mês e índice de pagamentos pendentes.
 •     Dados vêm de views SQL (vw_os_sla, vw_kpis_mensais), para não
       calcular no front.

9. Segurança, LGPD e backup
 •     RLS em todas as tabelas, com policies por perfil e por
       empresa_cliente_id. Buckets de storage privados.
 •     Senhas: mínimo de 8 caracteres. Rate limit no login (5 tentativas em
       15 min por usuário/IP). Todo login é registrado em acessos_log.
 •     Não guardar dados pessoais de proprietário do veículo. Do solicitante,
       só nome e telefone.
 •     Backup diário do Supabase, mais dump semanal exportado para
       storage externo, com rotina documentada de restauração.
 •     .env.example com todas as variáveis, sem segredos no repositório.

10. Design system Auto Visão (v1.1 + Direção Visual v1.0)
As telas de referência estão no canvas “Sistema de Vistorias Auto Visão –
Telas”, que deve ser seguido fielmente. Os arquivos de marca vão junto com
este briefing no pacote brand/ (logo branco e colorido em PNG 1024×237,
faixa quadriculada, ilustrações do carro, lupa e curvas em SVG e av.css com
os tokens e componentes): copie para /public/brand/ e use av.css como
referência para o tema do Tailwind.
:root{
  --brand-red:#ED3237; --brand-graphite:#373435; --white:#FFFFFF;
  --action-primary:#C9232C; --action-hover:#B51C25; --action-pressed:#A21B23; --
impact:#151415;
  --text:#373435; --text-secondary:#696267; --border:#8C8288; --
divider:#DED8DC; --surface:#F6F4F5;
  --ok:#18743B; --ok-bg:#EDF8F0; --warn:#805500; --warn-bg:#FFF6DE;
  --error:#B42318; --error-bg:#FFF0ED; --info:#165EA8; --info-bg:#EFF6FF;
  --font-display:'Nunito'; /* 300, 800, 900: títulos, números de KPI, placa */
  --font-body:'Inter';   /* 400–700: texto, formulários, tabelas */
  /* espaçamento base 4: 4 8 12 16 24 32 48 64 | raios: campo 8, card 12, painel 16,
hero 24 */
}

Padrões visuais:
  •   Menu lateral: escuro com radial-gradient(120% 90% at 20% 0%,
      #2C2A2B, #151415), logo branco no topo, item ativo em vermelho
      #C9232C com sombra, grupos em caixa alta 11px e a faixa
      quadriculada no rodapé.
  •   Hero: vermelho #ED3237, raio de 24px, curvas concêntricas ao fundo,
      kicker com traço, título Nunito 900, ilustração do carro com lupa e
      faixa quadriculada embaixo.
  •   Botões: altura de 48px (compacto 40px). Primário vermelho,
      secundário branco com borda #151415.
  •   Campos: 48px, borda 1.5px #8C8288, foco com contorno #151415. A
      placa usa o campo grande (64px, 24px bold, espaçado).
  •   Tabelas: cabeçalho grafite #373435 com texto branco e linhas
      zebradas. A linha vencida tem barra vermelha à esquerda, e a que está
      vencendo tem barra âmbar.
  •   SLA: pílula com forma e texto. Verde com círculo, âmbar com losango,
      vermelho com quadrado e cinza com ícone de pausa.
  •   KPI: card branco com número em Nunito 900. KPI de destaque é
      escuro, e KPI de alerta tem borda vermelha.
  •   Acessibilidade: contraste AA, alvos de toque com pelo menos 44px,
      prefers-reduced-motion respeitado e labels reais em todos os campos.

11. Dados iniciais (seed)
  •   Pátios: Freitas Utinga, Freitas Santa Bárbara, Leilo São Carlos e
      Leilomaster SP. Endereço e cidade a confirmar com o franqueado.
  •   Categorias: Carro, Moto, Utilitário, Caminhão, Outro.
  •   Serviços: Vistoria cautelar (48h). Preços a definir.
 •    Motivos de frustração: veículo não localizado no pátio, falta de
      autorização do pátio, pendência documental, problema de
      agendamento, outro.
 •    Motivos de cancelamento: solicitado pelo cliente, veículo vendido
      ou retirado, duplicidade, outro.
 •    Motivos de atraso: falta de vistoriador na região, pátio sem acesso,
      demora na autorização, problema no sistema, outro.
 •    Usuário Loja inicial criado via script npm run seed:admin.
 •    Usar a planilha da Creditas (37 placas de 03/11/2026) como arquivo de
      teste da importação.

12. Fora da V1
Integração com a Creditas por API, WhatsApp e e-mail, pagamento dentro do
sistema, app do vistoriador com checklist, multiempresa (várias vistorias),
QR Code no laudo e consulta paga por placa.

13. Plano de entrega (fazer nesta ordem; cada etapa com
testes e deploy de preview)
 1.  Base: projeto Next.js, Supabase, Tailwind com tokens, layout (menu
     lateral e hero), login, troca obrigatória de senha, perfis e RLS.
 2. Cadastros: clientes com acesso (gerar, resetar e bloquear), pátios e
     apelidos, serviços e preços, vistoriadores, motivos e configurações.
 3. OS individual: Nova OS do cliente com validações, ficha da OS, linha
     do tempo e auditoria.
 4. SLA: cálculo, cores, pausas, job de alertas e justificativa obrigatória
     (com testes unitários do relógio).
 5. Operação: agendamento e reagendamento, frustração, pendências,
     cancelamento, laudo PDF com versões e anexos.
 6. Importação em lote: modelo, prévia, correção e confirmação
     transacional.
 7. Notificações: Realtime, toast, som, contador, Web Push, PWA e
     escalonamento.
 8. Financeiro: pagamento por placa, comprovante e fechamento
     mensal.
 9. Painéis e relatórios: KPIs, relatórios, exportação Excel e PDF.
 10. Endurecimento: testes E2E dos fluxos, rate limit, logs de acesso,
     backup e documentação de deploy.
Critério de pronto da V1: a Creditas importa a planilha de 37 placas, a
Loja recebe o alerta sonoro, agenda, frustra uma, resolve a pendência, envia
o laudo das demais e marca os pagamentos, e os dois lados veem tudo em
tempo real. O relatório de outubro exporta em Excel e PDF com os números
batendo com o banco.
14. Decisões ainda em aberto (perguntar antes de
implementar)
 1.   A Creditas tem tabela de preços própria ou usa a padrão?
 2.   O ajuste de preço com aprovação do cliente entra na V1? (Implementar
      atrás de uma flag.)
 3.   A cor do veículo é opcional na abertura e completada pela Loja?
 4.   A lista final de motivos (frustração, cancelamento e atraso).
 5.   O SLA conta em horas úteis ou corridas? (Padrão: corridas.)
 6.   Endereço e cidade de cada pátio.
