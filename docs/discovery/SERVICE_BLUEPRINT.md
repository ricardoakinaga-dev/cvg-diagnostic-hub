# Service Blueprint

O blueprint separa comportamento visível, sistema e operações de suporte. A coluna “evidência atual” não presume que este processo já exista no hospital.

| Etapa | Ação do solicitante/cuidado | Frontstage do Hub | Backstage do executor | Dados/eventos | Falhas e controles |
| --- | --- | --- | --- | --- | --- |
| 1. Contexto | Seleciona paciente/atendimento | Pré-preenche paciente, encounter e actor | Valida escopo e catálogo | `DiagnosticRequestCreated` | homônimo, atendimento encerrado |
| 2. Pedido | Seleciona serviços, prioridade e observação | formulário curto + alerta de duplicidade | permission check + transaction | `DiagnosticItemRequested` | item duplicado, serviço inativo |
| 3. Recepção | aguarda | “Solicitado” e notificação ao setor | setor aceita/recusa e associa sample | `SampleReceived` ou `ItemRejected` | amostra ausente/identificação |
| 4. Execução | acompanha | status e tempo/SLA | técnico/imagista atualiza etapa | `ProcessingStarted`, `ExamPerformed` | equipamento indisponível, conflito |
| 5. Resultado | espera/recebe alerta | inbox + deep link | produz draft, valida anexos | `ResultDraftCreated` | conteúdo incompleto, upload |
| 6. Liberação | recebe | estado disponível e destinatários | release autorizado e auditado | `ResultReleased` | dupla liberação, conflito |
| 7. Ação | abre/revisa | “visualizado” ≠ “revisado” | grava view/review | `ResultViewed`, `ResultReviewed` | usuário sem escopo, emenda |
| 8. Exceção | age sobre alerta | recoleta/atraso/crítico destacados | política de escalonamento | `RecollectionRequested`, `CriticalResultDetected`, `ItemOverdue` | notification fatigue |
| 9. Gestão | analisa fila/indicadores | dashboard acionável | consultas e agregações definidas | métricas derivadas | timestamp ambíguo |
| 10. Suporte | investiga incidente | correlation ID ao usuário | logs/auditoria/backups | `AuditEvent`, application log | dados sensíveis em log |

## Linha de visibilidade

O usuário deve conseguir ir de uma notificação ao item, ao resultado/version e à timeline sem perder o contexto do paciente. A UI nunca é fonte de verdade para estado final; após ação de risco, aguarda confirmação do servidor.

## Processos de suporte

- Identity fornece autenticação, sessão, roles e escopos.
- Catalog fornece serviços, workflows, prioridades e políticas de SLA.
- Database preserva constraints, versionamento e transações.
- Object storage guarda anexos fora do banco.
- Notification/outbox entrega eventos após commit.
- Observability registra logs técnicos e métricas sem substituir auditoria clínica.
- Backup/restore protege banco e arquivos como conjunto recuperável.
