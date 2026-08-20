# Documentação do CVG Diagnostics Hub

## Ordem normativa

| Fase | Artefatos | Pergunta respondida |
| --- | --- | --- |
| Reconnaissance | `discovery/DISCOVERY.md` | O que sabemos sobre o ponto de partida? |
| Discovery | `discovery/*` | Qual problema existe, para quem e em quais fluxos? |
| PRD | `prd/PRD.md` | O que o produto deve fazer e o que não fará? |
| SPEC | `spec/*`, `api/API_SPEC.md` | Como o sistema deve se comportar e persistir dados? |
| Arquitetura/UX | `architecture/*`, `ux/*`, `adr/*` | Como organizar módulos, telas e decisões duráveis? |
| Segurança/testes/operações | `security/*`, `testing/*`, `operations/*` | Como operar com segurança e saber que está correto? |
| Build | `build/*` | Em que ordem construir e validar? |
| Barra de qualidade | `build/QUALITY_SCORECARD_95.md`, `build/ROADMAP_95.md`, `build/BACKLOG_95.md` | O que significa 95/100 e qual é a próxima entrega? |
| Rastreabilidade | `TRACEABILITY_MATRIX.md` | Como cada problema chega a requisito, teste e task? |

## Classificação de conhecimento

Todo conteúdo relevante usa uma destas marcas:

- `FACT` — veio da reconnaissance ou foi explicitamente fornecido no briefing.
- `ASSUMPTION` — hipótese útil para avançar, ainda não validada no hospital.
- `DECISION` — escolha de produto/técnica proposta para esta versão documental.
- `OPEN QUESTION` — informação que precisa de decisão/validação humana.

Uma decisão documental não transforma uma hipótese operacional em fato. Perguntas clínicas e de governança permanecem no registro de perguntas abertas e nos gates de produção.

## Convenções

- Documentação em português; nomes de entidades, enums, eventos e APIs em inglês estável.
- Datas e horários de persistência em UTC; apresentação em `pt-BR` e no fuso configurado do hospital.
- IDs de requisitos: `FR-*` para funcionais, `NFR-*` para não funcionais, `AC-*` para acceptance criteria, `TEST-*` para validação e `BLD-*` para tasks.
- Mermaid é usado para modelos e fluxos. Diagramas são explicativos; o contrato textual ao lado é normativo.
- “Item diagnóstico” é a unidade operacional rastreada. “Serviço diagnóstico” é a capacidade/catálogo que define seu workflow.

## Fonte de verdade por assunto

| Assunto | Fonte normativa |
| --- | --- |
| Escopo e prioridade | `prd/PRD.md` |
| Entidades e invariantes | `spec/DOMAIN_MODEL.md` |
| Estados e transições | `spec/STATE_MACHINES.md` |
| Persistência | `spec/DATA_MODEL.md` |
| Acesso | `spec/PERMISSIONS.md` |
| API e erros | `api/API_SPEC.md` (ponteiro opcional em `spec/API_SPEC.md`) e `spec/ERROR_MODEL.md` |
| Notificações/realtime | `spec/NOTIFICATIONS.md` e `spec/REALTIME.md` |
| Segurança | `security/SECURITY.md` e `security/THREAT_MODEL.md` |
| Ordem de construção | `build/BUILD_PLAN.md` e `build/ROADMAP_95.md` |

Quando dois documentos divergirem, a divergência é um defeito de documentação: corrigir a fonte apropriada e a matriz de rastreabilidade antes do BUILD.

## Estado da entrega

O projeto tem um MVP executável para ambiente local com dados sintéticos. O arquivo [`../.gauntlet/state.md`](../.gauntlet/state.md) contém a barra de qualidade congelada, rodadas, gaps e evidências; [`../.gauntlet/progress.md`](../.gauntlet/progress.md) mantém o status corrente. A documentação normativa continua sendo a fonte de intenção; quando o runtime é parcial, a limitação está registrada no Build Plan, backlog e matriz de rastreabilidade.

A rodada atual usa o [`build/QUALITY_SCORECARD_95.md`](build/QUALITY_SCORECARD_95.md) como barra congelada, o [`build/ROADMAP_95.md`](build/ROADMAP_95.md) como sequência de ondas e o [`build/BACKLOG_95.md`](build/BACKLOG_95.md) como lista executável.
