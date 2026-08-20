# Risk register

Escala: probabilidade/impacto `low`, `medium`, `high`, `critical`. Dono indica a área responsável por reduzir o risco, não uma pessoa inventada.

| ID | Risco | Prob. | Impacto | Mitigação | Dono/área | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| RSK-001 | Resultado associado ao paciente/amostra errado | medium | critical | identificadores redundantes, constraints, confirmação contextual, testes de homônimo | Clínica + Lab + Segurança | aberto |
| RSK-002 | Resultado crítico não chega ou não é confirmado | medium | critical | política explícita, inbox prioritário, acknowledgement, escalonamento e auditoria; canal redundante validado antes de produção | Direção clínica | aberto |
| RSK-003 | Release/correção sobrescreve história | medium | critical | versões imutáveis, reason obrigatório, re-review e auditoria | Engenharia + Clínica | mitigação proposta |
| RSK-004 | Atraso não é percebido por SLA incorreto | high | high | policy configurável, timestamp server-side, definição com setor e métricas de relógio | Gestão + TI | aberto |
| RSK-005 | Duplicidade gera custo ou confusão clínica | medium | high | aviso contextual, override autorizado com motivo, busca por item pendente | Produto + Clínica | mitigação proposta |
| RSK-006 | Recoleta perde vínculo com a primeira amostra | medium | high | accession/sample chain, novo ID, eventos e testes de múltiplas amostras | Laboratório | mitigação proposta |
| RSK-007 | Permissão ampla expõe resultados | medium | critical | RBAC + escopo por departamento/atendimento, server-side authorization, IDOR tests | Segurança + TI | aberto |
| RSK-008 | Upload malicioso ou arquivo errado é exposto | medium | critical | allowlist, sniffing, checksum, quarantine/scan, URLs temporárias, ACL | Segurança + TI | aberto |
| RSK-009 | Usuários voltam a usar WhatsApp porque a UI cria burocracia | high | high | progressive disclosure, piloto observado, tempo de tarefa e feedback | Produto + Operações | aberto |
| RSK-010 | Realtime cria falsa confirmação ou estado stale | medium | high | SSE como sinal, refetch autorizado, Last-Event-ID, degraded polling | Engenharia | mitigação proposta |
| RSK-011 | Duas pessoas atualizam o mesmo item | medium | high | optimistic locking, command idempotency, `409 CONFLICT`, testes concorrentes | Engenharia | mitigação proposta |
| RSK-012 | Backup existe mas não restaura | low/medium | critical | restore drill isolado, checksum, RPO/RTO e runbook | TI/Operações | aberto |
| RSK-013 | Integração futura acopla o Hub ao cadastro errado | medium | high | Patient/Encounter/ExternalReference, anti-corruption boundary | Arquitetura + TI | mitigação proposta |
| RSK-014 | Dados sensíveis aparecem em logs/URLs | medium | high | redaction, opaque IDs, signed URLs, revisão de logs | Segurança | aberto |
| RSK-015 | Scope creep transforma MVP em ERP/PACS | high | medium | non-goals, ADRs, change control e backlog priorizado | Product owner | mitigação proposta |

## Mini-FMEA dos fluxos críticos

| Fluxo | Failure mode | Detecção | Recuperação |
| --- | --- | --- | --- |
| Solicitação | pedido não criado ou duplicado | resposta idempotente, audit event ausente, duplicate warning | retry seguro ou revisão do pedido |
| Recepção | sample não associado | fila de amostras órfãs, barcode/accession e alerta | reconciliação autorizada sem apagar história |
| Execução | estado avançou sem trabalho | command permission + audit trail + revisão de fila | voltar somente por transição explícita/manager |
| Resultado | conteúdo não liberado | item em `IN_PROGRESS/AWAITING_REPORT` além do SLA | alerta ao owner, draft preservado |
| Comunicação | release sem destinatário confirmado | outbox/notification status + critical queue | retry/escalonamento; não depender de toast |
| Correção | versão antiga fica como atual | constraint current version + revisão de transação | emenda formal e re-notificação |
| Disponibilidade | banco/storage fora | readiness/metrics | degraded read/incident runbook; nenhuma falsa confirmação |
