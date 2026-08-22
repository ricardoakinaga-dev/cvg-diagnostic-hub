# Roadmap de melhoria para 95/100

> **Historical roadmap — superseded on 2026-08-22.** The active execution plan is
> [`.agent/plans/premium-enterprise-mvp-v4.md`](../../.agent/plans/premium-enterprise-mvp-v4.md)
> and its frozen bar is [`PREMIUM_MVP_V4.md`](PREMIUM_MVP_V4.md).

**Data:** 20/08/2026  
**Objetivo:** elevar cada dimensão do [`QUALITY_SCORECARD_95.md`](QUALITY_SCORECARD_95.md) para pelo menos 95/100 no ambiente local reproduzível e deixar os gates externos prontos para decisão humana.

## Princípios de execução

- cada onda começa com teste ou critério observável e termina com evidência bruta;
- mudanças compartilhadas de contrato, rota e persistência são integradas sequencialmente;
- dados de teste continuam sintéticos e nenhuma política clínica é inferida;
- falhas são visíveis: readiness não mascara dependência indisponível, outbox não perde mensagem e UI não promete realtime quando está degradada;
- o score só sobe quando a evidência reproduzível sobe junto.

## Ondas

| Onda | Foco | Entregas | Scorecards | Dependências | Saída |
| --- | --- | --- | --- | --- | --- |
| W0 | Planejamento congelado | scorecard, roadmap, backlog, estado gauntlet | BUILD-12 | baseline local | plano executável e rastreável |
| W1 | Fundação e persistência | migração incremental, runner multi-migration, proxy Next 16, limites de request | BUILD-1/2/3/5 | testes atuais | runtime sem depreciação conhecida e DB evolutivo |
| W2 | Comunicação confiável | claim/lease/retry do outbox, sink adapter, SSE contínuo/replay/resync | BUILD-3/6/7 | W1 | evento não some e cliente tem fallback explícito |
| W3 | Operação segura | readiness de DB/storage, métricas bounded, S3/MinIO adapter, secret scan, OpenAPI | BUILD-2/5/8/10 | W1/W2 | dependências e sinais operacionais verificáveis |
| W4 | Recuperação e entrega | backup/restore smoke, CI, perf smoke, índices/limites e runbooks | BUILD-1/8/10/11 | W1/W3 | release reproduzível e recuperação exercitada |
| W5 | UX e verificação independente | axe, teclado, mobile, E2E de degradação, revisão independente e regressão | BUILD-6/7/9/12 | W2/W3/W4 | score local recalculado e gaps classificados |
| W6 | Ativação externa | IdP, AV, object storage produtivo, política crítica, transferência/alta, RPO/RTO e piloto | BUILD-5/7/8/11 | decisão/infra hospitalar | `PASS` condicionado a aceite humano |

## Sequenciamento e critérios de saída

```text
W0 → W1 → W2 → W3 → W4 → W5
                         ↘ W6 (somente com decisões externas)
```

- W1 não pode terminar com `middleware.ts` legado, migration runner de arquivo único ou upload sem limite efetivo.
- W2 não pode terminar com mensagem marcada como entregue antes do sink confirmar nem com uma conexão SSE tratada como viva depois de encerrada.
- W3 não pode expor métrica com ID de paciente, segredo, corpo de requisição ou cardinalidade ilimitada.
- W4 não pode chamar backup/restore de “validado” sem restaurar em um banco descartável e verificar relações essenciais.
- W5 não pode chamar acessibilidade de “validada” sem rodar axe no artefato servido e verificar teclado nos fluxos críticos.
- W6 não pode ser simulado por fixtures: cada gate precisa de owner, política/contrato aprovado e evidência do ambiente-alvo.

## Evidência de cada onda

| Onda | Comandos mínimos | Registro |
| --- | --- | --- |
| W0 | `bash scripts/validate-docs.sh` | este roadmap, backlog e scorecard |
| W1 | `npm run typecheck`, `npm run lint`, `npm test -- --run`, `npm run build` | `.gauntlet/state.md` |
| W2 | testes de outbox/realtime + E2E de reconnect/resync | `.gauntlet/progress.md` |
| W3 | `npm run validate:openapi`, `npm run security:scan`, smoke de readiness/métricas | `docs/operations/OBSERVABILITY.md` |
| W4 | `npm run db:restore:smoke`, CI local equivalente, `npm run perf:smoke` | `docs/operations/PRODUCTION_READINESS.md` |
| W5 | `npm run test:e2e`, `npm run test:accessibility`, cobertura | scorecard recalculado |
| W6 | evidência assinada pelo owner do hospital | checklist de release/piloto |

## Riscos e mitigação

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| estado local em memória parecer durável | alto | testar Postgres, outbox projetado e readiness explícito |
| retry duplicar notificação | alto | idempotência por `event_id`, lease e dedupe no consumidor |
| métrica vazar contexto clínico | alto | labels normalizados e payload nunca registrado |
| política clínica ser inventada | crítico | feature gate fechado e decisão externa documentada |
| teste E2E flakey por processo/viewport | médio | servidor isolado, workers serializados e retries visíveis |
| backup passar sem restauração real | alto | smoke em banco descartável com assert de dados |

## Resultado esperado

Ao fim de W5, o projeto deve ter um score local recalculado, com notas >=95 nas dimensões técnicas que podem ser provadas neste workspace. A saída de W5 será `CONDITIONAL` enquanto os gates de W6 não tiverem decisão e infraestrutura aprovadas.
