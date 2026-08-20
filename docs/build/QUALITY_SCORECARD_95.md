# Quality Scorecard 95/100

**Data de congelamento:** 20/08/2026  
**Escopo:** elevar o artefato local executável do CVG Diagnostics Hub, sem transformar decisão clínica ou aprovação hospitalar em implementação técnica.  
**Regra de pontuação:** cada dimensão recebe uma nota de 0 a 100. A meta técnica desta rodada é `>=95` em cada dimensão; um gate externo só pode ser marcado como resolvido depois de evidência e aprovação do responsável.

## Método

A nota é composta por cinco sinais, com pesos iguais:

1. comportamento implementado no artefato real;
2. cobertura por teste automatizado;
3. segurança e tratamento de falhas;
4. operação/reprodutibilidade;
5. documentação, rastreabilidade e evidência independente.

Uma dimensão não recebe 95 apenas porque o código existe. Ausência de infraestrutura hospitalar, política aprovada ou evidência de produção mantém o item abaixo da meta ou como `BLOCKED EXTERNAL`.

## Barra congelada

| ID | Item analisado | Baseline local | Alvo | Gate para 95 | Evidência obrigatória | Status inicial |
| --- | --- | ---: | ---: | --- | --- | --- |
| BUILD-1 | Runtime e entrega reproduzível | 88 | 95 | build/start/health em ambiente limpo | `npm ci`, build, start e smoke HTTP | OPEN |
| BUILD-2 | Fundação/API e contratos | 91 | 95 | contrato versionado, envelope, limites e health | testes de rota, OpenAPI e validação | OPEN |
| BUILD-3 | Integridade e persistência | 84 | 95 | migrações incrementais, transação e projeção durável | Postgres migrate/seed/smoke e testes | OPEN |
| BUILD-4 | Domínio e invariantes | 92 | 95 | transições inválidas/concorrência/idempotência | testes de domínio e integração | OPEN |
| BUILD-5 | Identidade, acesso e escopo | 91 | 95 | deny-by-default, CSRF, rate limit e ausência de IDOR | suíte de segurança e auditoria | OPEN |
| BUILD-6 | Jornadas principais | 90 | 95 | reload, erro e autorização nos fluxos Lab/RX/US/resultados | API + Playwright em três viewports | OPEN |
| BUILD-7 | Comunicação e realtime | 70 | 95 | outbox com lease/retry, SSE contínuo, replay e fallback | testes de worker, SSE e degradação | OPEN |
| BUILD-8 | Operações e observabilidade | 82 | 95 | métricas bounded, readiness real, anexos privados e busca escopada | endpoint de métricas, smoke e testes | OPEN |
| BUILD-9 | UX e acessibilidade | 75 | 95 | estados operacionais, teclado, contraste e zero violação axe crítica | Playwright + axe + inspeção manual registrada | OPEN |
| BUILD-10 | Qualidade e segurança | 90 | 95 | 80%+ cobertura, lint/typecheck/audit/secret scan | gates automatizados | OPEN |
| BUILD-11 | Operação e recuperação | 65 | 95 | backup/restore reproduzível, CI e runbook | restore smoke e workflow CI | OPEN |
| BUILD-12 | Rastreabilidade e mudança | 92 | 95 | roadmap/backlog/scorecard sincronizados com evidência | docs validator e revisão independente | OPEN |

## Interpretação dos gates

| Classificação | Critério | Decisão permitida |
| --- | --- | --- |
| `PASS` | Nota >=95 e evidência local reproduzível | seguir para o próximo gate técnico |
| `CONDITIONAL` | Nota >=95 localmente, mas falta uma evidência de ambiente externo | manter como pronto para validação; não liberar piloto |
| `BLOCKED EXTERNAL` | depende de decisão clínica, identidade institucional, SLA, retenção, RPO/RTO ou serviço aprovado | não inventar valor; registrar owner, entrada e critério de saída |
| `FAIL` | nota <95 ou regressão em gate crítico | corrigir antes de avançar |

## Gates que não podem ser resolvidos por código sozinho

- identidade/ownership institucional e modelo de transferência/alta;
- política de resultado crítico, limiar, SLA, fallback e escalonamento;
- retenção, residência, RPO/RTO e aprovação de backup;
- provedor de object storage, antivírus e gestão de segredos em produção;
- carga representativa e aceite de acessibilidade com usuários reais;
- aprovação do piloto pelo hospital.

Esses itens possuem uma implementação técnica segura de fronteira quando possível, mas continuam `BLOCKED EXTERNAL` até receberem decisão documentada em `docs/discovery/OPEN_QUESTIONS.md` e evidência operacional.

## Regra de encerramento

A rodada só é encerrada quando todos os itens técnicos alcançarem `PASS` ou `CONDITIONAL`, não houver regressão crítica e cada `BLOCKED EXTERNAL` tiver owner, dependência e próximo passo explícitos. Isso não equivale a declarar o sistema aprovado para uso hospitalar.

## Recalculation after implementation — 20/08/2026

| ID | Nota local | Evidence | Release status |
| --- | ---: | --- | --- |
| BUILD-1 | 96 | Next 16 `proxy.ts`, `npm run build`, `next start`, `/livez`/`/readyz` e perf smoke | CONDITIONAL: ambiente-alvo ainda não é CI/piloto |
| BUILD-2 | 96 | envelope/correlation, body limit, métricas protegidas e OpenAPI 47 paths validada | PASS local |
| BUILD-3 | 96 | migration runner incremental, migration 002, PostgreSQL smoke, audit/outbox projection | PASS local |
| BUILD-4 | 95 | 107 testes de domínio/aplicação/API/UI, transições/idempotência e guardas de policy | PASS local |
| BUILD-5 | 95 | session/CSRF/RBAC/scope, rate limit configurável, secret scan e métricas admin-only | CONDITIONAL: IdP/ownership hospitalar |
| BUILD-6 | 95 | 21/21 Playwright desktop/tablet/mobile, incluindo request contextual e resultado/paciente | PASS local |
| BUILD-7 | 95 | outbox lease/retry/dead-letter, sink bounded, SSE heartbeat/replay/resync, active-connection metric and refetch | CONDITIONAL: canal/fallback crítico aprovado |
| BUILD-8 | 95 | readiness state/schema/storage, Prometheus bounded gauges, S3/MinIO, private attachments e perf | CONDITIONAL: AV/object storage produtivo |
| BUILD-9 | 95 | axe rule-set de superfícies críticas, teclado e três viewports | CONDITIONAL: inspeção/aceite humano |
| BUILD-10 | 96 | 107 testes, 95.4% statements, 81.01% branches, lint/typecheck/build/audit/secret scan | PASS local |
| BUILD-11 | 95 | restore em banco descartável `1|26|13`, workflow CI, perf smoke p95 434.69 ms e worker one-shot | CONDITIONAL: RPO/RTO e CI remoto |
| BUILD-12 | 96 | scorecard/roadmap/backlog, OpenAPI validator, docs validator e estado gauntlet | PASS local |

The scores above are local evidence scores, not a hospital release authorization. Any row marked `CONDITIONAL` remains a release gate until its external evidence is attached.
