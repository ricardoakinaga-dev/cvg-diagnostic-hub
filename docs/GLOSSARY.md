# Glossário

| Termo | Definição normativa |
| --- | --- |
| Paciente | Animal atendido; o sistema mantém identificação clínica mínima e referências externas, sem assumir ser o cadastro mestre futuro. |
| Tutor | Pessoa vinculada ao paciente. Seus dados pessoais são tratados sob controles de privacidade; não há comunicação ao tutor no MVP. |
| Atendimento (`Encounter`) | Contexto clínico em que uma solicitação é feita; pode ser ambulatorial, emergência ou internação. |
| Internação (`Admission`) | Período/local de permanência do paciente, incluindo setor e leito quando aplicável. |
| Solicitação diagnóstica (`DiagnosticRequest`) | Pedido clínico que agrupa um ou mais itens diagnósticos para um paciente/atendimento. Possui código humano e auditoria. |
| Item diagnóstico (`DiagnosticRequestItem`) | Unidade operacional individual dentro de uma solicitação, com serviço, prioridade, workflow, status e resultado próprios. |
| Serviço diagnóstico (`DiagnosticService`) | Capacidade configurável do catálogo, como Hemograma, RX tórax ou Ultrassom abdominal; define tipo de workflow, SLA e requisitos. |
| Procedimento (`DiagnosticProcedure`) | Instância operacional de execução quando o serviço exigir agenda ou etapas específicas; não é sinônimo obrigatório de item. |
| Amostra (`Sample`) | Material/acession coletado ou recebido para um ou mais itens; novas amostras de recoleta preservam a cadeia. |
| Recoleta | Solicitação de uma nova amostra porque a anterior foi rejeitada, insuficiente ou inadequada, com motivo obrigatório. |
| Resultado (`Result`) | Registro lógico do conteúdo clínico de um item; possui versões e lifecycle próprio. |
| Versão de resultado (`ResultVersion`) | Snapshot imutável de um resultado liberado ou corrigido. Uma correção não sobrescreve silenciosamente o histórico. |
| Laudo (`Report`) | Resultado narrativo de um serviço de imagem ou outro serviço que exija relatório. |
| Anexo (`Attachment`) | Arquivo referenciado por uma versão de resultado, armazenado em object storage com validação e autorização. |
| Liberação (`Release`) | Ação que torna uma versão de resultado disponível para os destinatários autorizados. |
| Visualização (`View`) | Registro de que o usuário abriu/consultou uma versão liberada; não significa que a revisou clinicamente. |
| Revisão (`Review`) | Confirmação operacional/clínica do usuário autorizado sobre a versão atualmente liberada. Uma emenda exige nova revisão. |
| Confirmação (`Acknowledgement`) | Confirmação de recebimento de uma notificação, especialmente para resultado crítico; é distinta de revisão. |
| Resultado crítico | Resultado marcado conforme uma política clínica/configuração aprovada; exige notificação e confirmação auditáveis. Valores não são inventados pela aplicação. |
| SLA | Política de tempo de atendimento associada a serviço, prioridade e evento de início configurado. |
| Atrasado (`Overdue`) | Item não terminal cuja hora de vencimento passou segundo o SLA vigente; não é um estado clínico separado. |
| Setor (`Department`) | Unidade organizacional solicitante ou executora, como Internação, Laboratório ou Radiologia. |
| Fila operacional | Visão priorizada de itens acionáveis por um setor, considerando prioridade, SLA, atraso e tempo de espera. |
| Evento de domínio | Fato significativo ocorrido no fluxo, com actor, entidade, timestamp do servidor e metadata. |
| Auditoria clínica | Histórico imutável de ações e mudanças relevantes, separado de logs técnicos. |
| Realtime | Propagação de mudança para telas abertas sem refresh manual; a fonte final continua sendo a API autorizada. |
| Protocolo | Identificador humano da solicitação, por exemplo `EX-260818-0042`; não substitui a PK técnica. |
| Escopo | Conjunto de pacientes, atendimentos, setores ou funções que o actor pode acessar. |
| Actor | Usuário autenticado ou processo de sistema que executa uma ação. |
| Terminal | Estado do qual não há retorno operacional normal: `COMPLETED`, `CANCELLED` ou `REJECTED`. |
