# CVG Diagnostics Hub

Central operacional para solicitar, executar, acompanhar, liberar e revisar exames diagnósticos em um hospital veterinário.

> **Status (20/08/2026):** MVP executável em ambiente local, com dados sintéticos, memória ou PostgreSQL 16. Ainda não é uma release aprovada para uso hospitalar.

## Objetivo

Responder rapidamente:

> O que foi solicitado para este paciente, em que etapa está, onde está o resultado e quem precisa tomar conhecimento dele?

O produto é deliberadamente um hub especializado em diagnóstico e comunicação entre setores, não um ERP veterinário completo.

## Método de trabalho

O projeto segue a ordem:

```text
DISCOVERY → PRD → SPEC → BUILD PLAN → IMPLEMENTATION
```

A implementação segue slices verticais: contrato → persistência → API → autorização → auditoria → UI → testes. O estado atual, a barra de qualidade, as rodadas e os gaps estão em `.gauntlet/`.

## Leitura recomendada

1. [`docs/README.md`](docs/README.md) — mapa e convenções da documentação.
2. [`docs/discovery/DISCOVERY.md`](docs/discovery/DISCOVERY.md) — problema, limites de evidência e contexto.
3. [`docs/prd/PRD.md`](docs/prd/PRD.md) — produto, MVP e acceptance criteria.
4. [`docs/spec/SYSTEM_SPEC.md`](docs/spec/SYSTEM_SPEC.md) — contrato técnico consolidado.
5. [`docs/build/BUILD_PLAN.md`](docs/build/BUILD_PLAN.md) — ordem, status e limites da implementação.
6. [`docs/TRACEABILITY_MATRIX.md`](docs/TRACEABILITY_MATRIX.md) — prova de ligação entre problema e execução.

## Executar localmente

Requer Node.js 22+, Docker e npm:

```bash
npm ci
cp .env.example .env
docker compose up -d postgres
DATABASE_URL=postgresql://cvg:cvg_dev@localhost:54329/cvg_diagnostics npm run db:migrate
DATABASE_URL=postgresql://cvg:cvg_dev@localhost:54329/cvg_diagnostics npm run db:seed
npm run dev
```

Abra `http://localhost:3000`. Neste ambiente, outro dispositivo na mesma rede pode acessar `http://192.168.15.14:3000`; o host LAN está liberado apenas para a demonstração local. O ambiente de demonstração usa `APP_DATA_MODE=memory` e a senha sintética definida por `DEMO_PASSWORD`; para testar persistência, use `APP_DATA_MODE=postgres` junto com `DATABASE_URL` após a migração.

## Gates de qualidade

```bash
npm run validate
npm run typecheck
npm run lint
npm test -- --run
npm run test:coverage
npm run build
npm run test:e2e
npm run test:accessibility
npm run validate:openapi
npm run security:scan
npm audit --audit-level=high
```

Para evidência operacional adicional: `npm run perf:smoke` exige um servidor já iniciado; `ALLOW_DB_RESTORE_SMOKE=true npm run db:restore:smoke` restaura apenas em um banco Docker descartável.

O E2E usa o Chrome disponível no host quando o navegador Playwright empacotado não possui dependências gráficas. Os dados e arquivos locais ficam em `.data/` e não devem receber informação clínica real.

## Validação documental

```bash
bash scripts/validate-docs.sh
```

O script verifica a árvore obrigatória, headings mínimos, IDs de requisitos, referências aos principais documentos e ausência de placeholders proibidos. Ele complementa, mas não substitui, os gates de runtime.

## Escopo atual

O MVP proposto cobre o fluxo ponta a ponta para Laboratório, Radiologia/RX e Ultrassonografia, com busca, prioridade, filas setoriais, recoleta, resultados versionados, anexos controlados, timeline derivada de eventos, notificações internas, realtime, RBAC e auditoria.

Ficam fora do MVP: faturamento, estoque, prontuário completo, agenda clínica geral, comunicação com tutor, PACS completo, visualizador DICOM avançado, automação direta de analisadores, aplicativo mobile nativo e BI empresarial.

## Princípios

- Poucos cliques e progressive disclosure.
- Status evidente por texto, ícone e posição; nunca somente por cor.
- Eventos importantes encontram o usuário.
- Uma fonte de verdade para timeline e auditoria.
- Seguro por padrão, com histórico imutável de ações clínicas.
- Modular monolith antes de microserviços.
- Simples, mas não frágil.

## Limites atuais e próximos gates

O runtime atual cobre as slices principais de solicitação, Lab, RX/US, resultados versionados, anexos locais/S3-compatible, notificações, filas, busca, timeline, dashboard, RBAC, CSRF, auditoria, outbox com retry/lease, SSE, métricas e PostgreSQL snapshot. A barra local e o status dos gates estão em [`docs/build/QUALITY_SCORECARD_95.md`](docs/build/QUALITY_SCORECARD_95.md), [`docs/build/ROADMAP_95.md`](docs/build/ROADMAP_95.md) e [`docs/build/BACKLOG_95.md`](docs/build/BACKLOG_95.md).

Antes de qualquer piloto, ainda precisam de decisão/evidência: identidade e ownership no hospital, transferência/alta, política de resultado crítico, fallback de notificação, retenção, RPO/RTO aprovado, varredura AV externa, object storage produtivo/credenciais, workload representativo, inspeção manual de acessibilidade e sign-off. Esses gates estão em [`docs/discovery/OPEN_QUESTIONS.md`](docs/discovery/OPEN_QUESTIONS.md), [`docs/operations/PRODUCTION_READINESS.md`](docs/operations/PRODUCTION_READINESS.md) e no backlog 95/100.
