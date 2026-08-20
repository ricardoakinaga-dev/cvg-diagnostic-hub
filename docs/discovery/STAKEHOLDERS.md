# Stakeholders

`FACT`: os grupos abaixo foram citados no briefing. Necessidades, influência e disponibilidade de validação são `ASSUMPTION` até entrevistas/observação.

| Stakeholder | Interesse/necessidade | Influência | Decisões que precisa validar | Evidência desejada |
| --- | --- | --- | --- | --- |
| Veterinários solicitantes | Solicitar rápido, ver resultado e revisar sem buscar em vários canais | alta | campos mínimos, revisão, cancelamento e resultado crítico | shadowing de solicitações e entrevistas |
| Clínica Médica/Emergência | Prioridade, resposta rápida e visibilidade de atraso | alta | semântica de `URGENT`/`EMERGENCY`, handoff de turno | fila real e incidentes |
| Internação/UTI | Acompanhar pacientes e receber ações pendentes | alta | “Meus pacientes”, alta, transferência e responsável substituto | jornada por turno |
| Centro Cirúrgico | Exames pré-operatórios e resultados a tempo | média/alta | dependências de agenda e prioridade | casos de preparo cirúrgico |
| Laboratório | Fila, amostra, processamento, recoleta e liberação | alta | accession, motivos, SLA e quem pode liberar | observação de bancada |
| Radiologia/RX | Fila, encaminhamento, execução, laudo e anexos | alta | agenda/queue, laudo corrigido, arquivos | observação do fluxo RX |
| Ultrassonografia | Agenda, execução e laudo | alta | reagendamento, janela e responsável pelo laudo | agenda e jornada completa |
| Gestão operacional | Atrasos, gargalos, volume e qualidade | média/alta | definições de SLA, indicadores e escopo de acesso | relatórios atuais e metas |
| TI/Segurança | Integração, disponibilidade, backup, logs e suporte | alta | identity, deployment, RPO/RTO, suporte | arquitetura e runbooks |
| Administração/Privacidade | Base legal, retenção, acesso e contratos | alta | retenção, exportação, exclusão e fornecedores | política institucional |
| Direção clínica | Segurança e adoção | alta | policy de críticos, revisão e piloto | aprovação formal |
| Paciente/tutor | Indiretamente afetado por tempo/erro; não é usuário do MVP | média | comunicação futura e minimização | feedback por equipe, sem canal direto no MVP |

## Validation sequence

1. Mapear uma solicitação e um resultado em cada serviço.
2. Observar um caso de recoleta e um atraso.
3. Confirmar quem é responsável por liberar, revisar e confirmar crítico.
4. Validar handoffs de turno, alta e transferência.
5. Obter políticas institucionais de acesso, retenção, backup e incidentes.

## Stakeholder acceptance

Nenhum grupo deve aprovar somente a aparência do sistema. A validação precisa cobrir fluxo, segurança, responsabilidades, exceções, métricas e capacidade de recuperação.
