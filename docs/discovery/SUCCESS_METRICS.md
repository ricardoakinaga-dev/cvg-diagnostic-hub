# Success metrics

Os valores abaixo são metas de trabalho, não baselines observados. Baseline e metas finais devem ser medidos/validados no piloto. Métricas clínicas não devem estimular atalho inseguro.

## North Star metric

**Solicitações diagnósticas importantes sem perda de acompanhamento.** Proxy operacional: percentual de solicitações que alcançam estado terminal com histórico completo e sem intervenção manual fora do Hub, medido com amostra auditada.

## Métricas de outcome

| ID | Métrica | Definição | Baseline | Meta inicial proposta | Fonte |
| --- | --- | --- | --- | --- | --- |
| MET-001 | Solicitações esquecidas | itens não terminais sem owner/atividade além da janela acordada | desconhecido | reduzir vs baseline do piloto; alvo numérico após 2 semanas | events + fila |
| MET-002 | Tempo até visualização | `result_viewed_at - released_at` para versões não críticas | desconhecido | p95 dentro de uma janela operacional acordada | audit events |
| MET-003 | Tempo até revisão | `reviewed_at - released_at` | desconhecido | p95 e distribuição por serviço | audit events |
| MET-004 | Turnaround | início do SLA policy até término definido por serviço | desconhecido | comparar por prioridade/serviço, sem média única enganosa | timestamps + SLA |
| MET-005 | Taxa de recoleta | itens com `RecollectionRequested` / itens laboratoriais recebidos | desconhecido | monitorar tendência e motivo; não impor redução cega | sample events |
| MET-006 | Itens atrasados | itens não terminais com `now > due_at` | desconhecido | reduzir e manter intervenção registrada | SLA query |
| MET-007 | Comunicação paralela | solicitações que exigiram canal fora do Hub | desconhecido | reduzir vs baseline, por survey/amostragem | piloto/feedback |
| MET-008 | Tempo de solicitação | início da tela contextual até confirmação do servidor | desconhecido | tarefa comum em poucos passos; medir p50/p95 | telemetry consentida |

## Guardrails

- taxa de erro de identificação de paciente/amostra: zero incidentes aceitáveis em piloto;
- nenhum resultado crítico sem trilha de notificação/acknowledgement;
- nenhum release sem auditoria;
- nenhum aumento de cancelamento/recoleta causado por UX sem investigação;
- autorização negada não pode virar vazamento de existência de recurso;
- uptime, erro e perda de eventos devem ser acompanhados junto com velocidade.

## Instrumentation rules

- usar IDs internos/correlation IDs, não conteúdo clínico em métricas;
- registrar server timestamps e policy version;
- separar logs técnicos de eventos clínicos;
- preservar denominadores, filtros e timezone ao publicar dashboard;
- reportar p50/p95 quando o tail importa;
- rotular métricas como “proposta” até aprovação do hospital.

## Pilot learning loop

1. Medir baseline manual por período curto e representativo.
2. Treinar pequeno grupo e acompanhar Internação + Laboratório.
3. Capturar erros, abandonos, uso de canais paralelos e feedback qualitativo.
4. Ajustar apenas com evidência; atualizar PRD/SPEC quando a regra mudar.
5. Expandir para imagem após os gates de segurança e operação.
