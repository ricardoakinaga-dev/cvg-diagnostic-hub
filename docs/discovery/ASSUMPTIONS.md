# Assumption register

| ID | Assumption | Impact if wrong | Validation method | Status |
| --- | --- | --- | --- | --- |
| ASM-001 | O hospital possui paciente e atendimento cadastrados em algum sistema ou consegue fornecer referência mínima | muda o onboarding e a integração | entrevistar TI e observar criação de atendimento | open |
| ASM-002 | Internação + Laboratório é um piloto operacional viável | muda ordem de implantação | decisão da direção/gestão | open |
| ASM-003 | Usuários têm identidade individual, não conta compartilhada | auditoria/RBAC podem falhar | inventário de autenticação e turnos | open |
| ASM-004 | Uma solicitação agrupa itens clinicamente relacionados | modelo de request/item | validar com solicitantes | open |
| ASM-005 | Um sample pode atender vários itens laboratoriais | modelagem de accession | observar tubos/painéis | open |
| ASM-006 | Resultados podem ser liberados por uma equipe técnica autorizada e revisados por cuidado | matriz de permissões | validar com responsável clínico/lab | open |
| ASM-007 | Notificações internas são suficientes para o MVP | risco de atraso crítico | teste de comunicação no piloto | open |
| ASM-008 | Há conectividade razoável, mas perdas de rede acontecem | UX de retry e confirmação | teste em rede hospitalar | open |
| ASM-009 | O volume inicial permite PostgreSQL + modular monolith | arquitetura e custos | estimar requests/items por dia e picos | open |
| ASM-010 | Os serviços podem ser configurados sem workflow hardcoded | extensibilidade | validar catálogo e variações | open |
| ASM-011 | O primeiro locale é `pt-BR` e o timezone é configurável por hospital | labels/timestamps | confirmação com TI | proposed |
| ASM-012 | Dados de tutor/profissional exigem controle de privacidade; dados do animal podem ser vinculados | LGPD, logs e retenção | jurídico/privacidade | open |
| ASM-013 | Uploads do MVP serão limitados a formatos e tamanhos aprovados | storage/security | responsável por segurança | proposed |
| ASM-014 | O SLA deve ser medido com timestamps do servidor e policy configurável | indicadores | gestão + cada setor | proposed |
| ASM-015 | Resultados corrigidos precisam de histórico e nova revisão | segurança clínica | direção clínica | proposed |

## Uso

Uma assumption não pode virar comportamento invisível. Se for necessária para BUILD, deve ser convertida em `DECISION` aprovada ou em pergunta bloqueante resolvida; caso contrário, o sistema deve usar default seguro e explicitar a limitação.
