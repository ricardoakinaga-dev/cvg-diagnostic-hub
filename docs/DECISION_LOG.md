# Decision log

Registro resumido de decisões de produto/arquitetura. Decisões arquiteturais duráveis possuem ADR em [`adr/`](adr/).

| ID | Data | Decision | Reason | Alternatives | Impact |
| --- | --- | --- | --- | --- | --- |
| D-001 | 2026-08-18 | Hub especializado em diagnóstico, não ERP | foco no problema central e adoção | ERP completo | limita non-goals e escopo |
| D-002 | 2026-08-18 | Request agrupa itens independentes | reduz pedidos repetidos e preserva status por exame | uma request por analito | exige aggregate summary |
| D-003 | 2026-08-18 | `DiagnosticService` + workflow type | permite Laboratório/RX/US e serviços futuros | código por setor | exige catálogo/capabilities |
| D-004 | 2026-08-18 | Patient/Encounter/Admission/ExternalReference separados | integração futura e segurança de identidade | cadastro acoplado | exige registry boundary |
| D-005 | 2026-08-18 | Resultado liberado é versionado | correção não pode apagar histórico | update in-place | exige re-review/notification |
| D-006 | 2026-08-18 | Timeline deriva de audit/domain events | uma fonte de verdade | timeline manual duplicada | exige eventos consistentes |
| D-007 | 2026-08-18 | Notificação interna no MVP | reduz dependências externas | WhatsApp/e-mail desde o início | exige inbox/ack/outbox |
| D-008 | 2026-08-18 | Status de item, resultado, prioridade, criticidade e SLA separados | evita enumeração ambígua | estado único gigante | exige projections/UI components |
| D-009 | 2026-08-18 | Modular monolith | transações e operação simples | microservices | module contracts |
| D-010 | 2026-08-18 | SSE para realtime | server→client suficiente e simples | WebSocket | reconnect/fallback |
| D-011 | 2026-08-18 | S3-compatible + MinIO local | arquivos fora do banco, integração futura | blobs no PostgreSQL | scan/ACL/backup |
| D-012 | 2026-08-18 | UUIDv7 interno + protocolo humano sequencial | segurança e comunicação | ID sequencial público | sequence transaction |
| D-013 | 2026-08-18 | Outbox transacional, sem broker no MVP | entrega durável de critical/event notifications | publish direto/Kafka | worker/retry/monitoring |
| D-014 | 2026-08-18 | Server-side session cookie com IdP boundary | evita token em browser e permite integração | JWT localStorage | session store/CSRF |

Se uma pergunta aberta invalidar uma decisão, registrar uma nova entrada e atualizar o ADR/traceability; não editar história sem explicação.
