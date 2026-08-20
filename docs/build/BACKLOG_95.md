# Backlog de execução 95/100

**Status inicial:** planejado em 20/08/2026; status atual registrado na coluna `Estado`.  
**Fonte:** [`QUALITY_SCORECARD_95.md`](QUALITY_SCORECARD_95.md) e [`ROADMAP_95.md`](ROADMAP_95.md).  
**Regra:** `DONE` significa implementado e verificado localmente; `CONDITIONAL` significa tecnicamente pronto, mas dependente de ambiente externo; `BLOCKED` significa que implementar a decisão sem owner seria inseguro.

**Fechamento local W5/W6 (20/08/2026):** os itens técnicos foram verificados novamente no artefato servido. A evidência consolidada é `npm run test:coverage` (110 testes; 95,35% statements; 81,05% branches), typecheck/lint/build, Playwright 27/27 pela URL LAN, incluindo a regressão visual da tela de solicitação e a landing técnica do ADMIN, acessibilidade 6/6, OpenAPI 47 paths, docs 56 arquivos, PostgreSQL/restore (`1|26|13`), perf smoke em quatro rotas no `next start` (400 requests, 0 erros, p95 máximo 434,69 ms contra alvo de 500 ms) e secret/audit scans limpos. `CONDITIONAL` e `BLOCKED EXTERNAL` permanecem gates de ambiente, política ou aceite; não representam aprovação hospitalar.

| ID | Onda | Scorecard | Entrega | Critério de aceite | Teste/evidência | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| G95-PLAN-001 | W0 | BUILD-12 | Congelar scorecard, roadmap e backlog | todos os gates têm alvo, owner/dependência e saída | docs validator + revisão | DONE |
| G95-FOUND-001 | W1 | BUILD-1 | Migrar `middleware.ts` para `proxy.ts` no Next 16 | build sem convenção legada e CSP preservada | typecheck/build/E2E | DONE |
| G95-FOUND-002 | W1 | BUILD-3 | Tornar migration runner incremental | aplica todos os `.sql` ordenados, transacional e idempotente | banco descartável + teste | DONE |
| G95-API-001 | W1 | BUILD-2/5 | Reforçar limite efetivo de body e configuração de rate limit | bytes recebidos nunca excedem o limite configurado | testes de rota | DONE |
| G95-OUT-001 | W2 | BUILD-3/7 | Adicionar lease, worker e estado `PROCESSING` ao outbox | claim concorrente único, retry com backoff e erro seguro | unit/integration | DONE |
| G95-OUT-002 | W2 | BUILD-7 | Criar sink/event bus local bounded | publish só após confirmação e sem payload clínico em logs | testes de sink | DONE |
| G95-RT-001 | W2 | BUILD-7 | SSE contínuo com heartbeat, replay, resync e fallback | Last-Event-ID funciona e desconexão vira estado degradado | API + Playwright | CONDITIONAL |
| G95-OBS-001 | W3 | BUILD-8/10 | Métricas Prometheus bounded e endpoint protegido | labels não contêm IDs clínicos; endpoint respeita RBAC | route test + smoke | DONE |
| G95-OBS-002 | W3 | BUILD-1/8 | Readiness verifica DB e storage | `/readyz` diferencia falha e não inicializa liveness | route + DB smoke | DONE |
| G95-STO-001 | W3 | BUILD-8 | Adapter S3-compatible e factory por ambiente | MinIO/local têm contrato comum; chave é segura | unit + MinIO opcional | CONDITIONAL |
| G95-SEC-001 | W3 | BUILD-5/10 | Secret scan e configuração segura | nenhum segredo real no código; placeholders detectados | script + audit | DONE |
| G95-API-002 | W3 | BUILD-2/12 | Publicar OpenAPI mínimo verificável | paths e schemas principais refletem rotas reais, inclusive dashboard e administração de roles | validator | DONE |
| G95-OPS-001 | W4 | BUILD-11 | Smoke de backup e restore em banco descartável | dump restaura e relações essenciais existem | script Docker/DB | CONDITIONAL |
| G95-OPS-002 | W4 | BUILD-1/10/11 | Workflow CI reproduz gates locais | CI roda install, docs, typecheck, lint, test, build | revisão YAML | CONDITIONAL |
| G95-PERF-001 | W4 | BUILD-8/11 | Perf smoke com p50/p95/p99 e erro | benchmark reproduzível com alvo explícito | script servido | CONDITIONAL |
| G95-UX-001 | W5 | BUILD-9 | Axe/teclado nos fluxos críticos | zero violação no conjunto axe selecionado do artefato servido | Playwright + axe | CONDITIONAL |
| G95-UX-002 | W5 | BUILD-6/9 | Regressão desktop/tablet/mobile e degradação | estados loading/empty/error/offline/permission visíveis | E2E | DONE |
| G95-TRACE-001 | W5 | BUILD-12 | Atualizar matriz, build plan, readiness e release checklist | cada entrega aponta para evidência e limitação | docs validator + revisão | DONE |
| G95-CLIN-001 | W6 | BUILD-7 | Política de resultado crítico aprovada | thresholds, SLA, fallback e owner definidos externamente | decisão assinada + E2E | BLOCKED EXTERNAL |
| G95-CLIN-002 | W6 | BUILD-5/6 | Transferência/alta e ownership hospitalar | transições, autoridade e auditoria aprovadas | decisão + integração | BLOCKED EXTERNAL |
| G95-OPS-003 | W6 | BUILD-8/11 | AV, object storage, retenção e RPO/RTO produtivos | fornecedores, configuração e restore aceitos | evidência do ambiente | BLOCKED EXTERNAL |
| G95-PILOT-001 | W6 | BUILD-9/11/12 | Aceite e piloto hospitalar | owner assina checklist e plano de rollback | ata/checklist | BLOCKED EXTERNAL |

## Ordem de implementação

1. `G95-FOUND-*` fecha as fundações que todo o restante usa.
2. `G95-OUT-*` e `G95-RT-*` fecham a semântica de eventos antes de métricas e UI.
3. `G95-OBS-*`, `G95-STO-*`, `G95-SEC-*` e `G95-API-002` tornam o sistema observável e operável.
4. `G95-OPS-*` e `G95-PERF-*` produzem evidência de entrega/recuperação.
5. `G95-UX-*` e `G95-TRACE-*` fecham a verificação independente.
6. `G95-CLIN-*`, `G95-OPS-003` e `G95-PILOT-*` só avançam com autoridade externa.

## Definition of Done por item técnico

- teste novo escrito antes da implementação quando a mudança tiver comportamento novo;
- typecheck, lint e cobertura não regredem;
- erro é seguro para o usuário e detalhado apenas no sinal operacional apropriado;
- nenhuma entrada externa é confiada sem validação;
- docs e rastreabilidade são atualizados na mesma onda;
- evidência bruta é registrada no estado gauntlet;
- não há claim de produção quando a evidência é apenas local.
