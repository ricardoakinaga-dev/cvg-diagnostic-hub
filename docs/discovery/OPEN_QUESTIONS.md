# Open questions

Perguntas são mantidas mesmo quando não bloqueiam a produção documental. “Bloqueante” significa que não se deve liberar a funcionalidade correspondente em ambiente real sem resposta.

| ID | Pergunta | Por que importa | Dono da decisão | Gate | Estado |
| --- | --- | --- | --- | --- | --- |
| OQ-001 | Quem pode solicitar cada serviço e em quais escopos/departamentos? | autorização e fluxo de criação | direção clínica + gestão | PRD/SPEC | aberta |
| OQ-002 | Quem pode liberar resultado por serviço e quem pode emendar depois de revisão? | segurança clínica e autoria | direção clínica + responsáveis técnicos | SPEC/produção | aberta |
| OQ-003 | O que significa “revisado”, “confirmado” e “concluído” em cada setor? | estados semânticos e métricas | direção clínica | PRD/SPEC | aberta |
| OQ-004 | Qual é o fallback quando o solicitante encerra o turno ou não está disponível? | crítico e pendências | gestão clínica | SPEC/piloto | aberta |
| OQ-005 | Quais valores/políticas definem resultado crítico e qual escalonamento é obrigatório? | risco clínico | responsável clínico/laboratorial | SPEC/produção | aberta/bloqueante para crítico |
| OQ-006 | Quando o SLA começa para Laboratório, RX e Ultrassom? Há pausas/calendário? | atraso e indicadores | gestores de cada setor | SPEC/produção | aberta |
| OQ-007 | Qual é o comportamento após alta, transferência e atendimento encerrado? | ownership e notificações | gestão clínica + TI | PRD/SPEC | aberta |
| OQ-008 | Uma amostra pode servir quais itens e como accession/etiqueta funciona hoje? | integridade de amostra | laboratório | SPEC/piloto | aberta |
| OQ-009 | Há agenda existente para Ultrassom e qual é o mínimo de integração? | não duplicar agenda clínica | US + TI | PRD/API | aberta |
| OQ-010 | RX/US precisam de anexos no MVP ou apenas referência/laudo? | storage e escopo | imagem + TI | PRD/SPEC | aberta |
| OQ-011 | Qual sistema mestre fornece Patient/Encounter e external IDs? | integração e duplicidade | TI | arquitetura/API | aberta/bloqueante para integração |
| OQ-012 | Qual método de identidade existe (OIDC/AD, diretório, contas locais)? | autenticação e suporte | TI/segurança | ADR/produção | aberta |
| OQ-013 | Qual a política de retenção, exportação e exclusão de dados/anexos? | privacidade e storage | jurídico/privacidade | segurança/produção | aberta/bloqueante para retenção |
| OQ-014 | Qual volume, pico, disponibilidade, RPO e RTO são necessários no piloto? | sizing e operations | TI/gestão | arquitetura/ops | aberta |
| OQ-015 | Existe política de correção/void de laudo já adotada? | versionamento e comunicação | direção clínica | SPEC | aberta |
| OQ-016 | Quais templates, unidades e componentes estruturados são necessários para cada exame? | catálogo/result entry | técnicos responsáveis | PRD/SPEC | aberta |
| OQ-017 | Quem pode cancelar depois de receber amostra ou iniciar execução? | cancelamento seguro | gestão + responsáveis técnicos | SPEC | aberta |
| OQ-018 | A notificação interna atende o crítico no piloto, ou é necessário canal redundante? | disponibilidade de comunicação | direção clínica/segurança | PRD/produção | aberta/bloqueante para crítico |
| OQ-019 | Quais regras de identificação distinguem homônimos sem expor dados excessivos? | segurança e UX | privacidade + clínica | UX/security | aberta |
| OQ-020 | Quais métricas atuais/baselines podem ser extraídos sem criar dado pessoal desnecessário? | medir sucesso | gestão + TI | pilot | aberta |

## Questions that do not stop documentation

O modelo, PRD e Build Plan usam políticas configuráveis e gates de ativação para avançar sem inventar respostas. As perguntas OQ-005, OQ-013 e OQ-018 bloqueiam produção das respectivas capacidades, não a escrita da arquitetura.
