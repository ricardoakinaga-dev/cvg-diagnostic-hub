# Jornadas ponta a ponta

Os fluxos abaixo são o baseline de produto. Onde não há observação de campo, o texto está marcado como hipótese e deve ser validado.

## Estados de linguagem

Os nomes técnicos são definidos na SPEC. Nesta fase, “resultado disponível” significa liberado, “visualizado” significa aberto e “revisado” significa confirmado por pessoa autorizada.

## Fluxo A — Laboratório normal

1. Veterinário abre paciente + atendimento e seleciona um ou mais serviços.
2. Sistema sugere dados confiáveis, detecta duplicidade pendente e cria `DiagnosticRequest` com itens.
3. Laboratório vê a fila por criticidade, SLA e espera; recebe a amostra e associa o accession.
4. Técnico inicia processamento e registra resultado draft.
5. Usuário autorizado libera uma versão do resultado; a transação cria evento de auditoria e notificações internas.
6. Solicitante/equipe de cuidado recebe deep link, abre o resultado e o sistema registra visualização.
7. Profissional autorizado revisa; item e request podem concluir quando todos os itens atingirem condição terminal.

## Fluxo B — Recoleta

1. Amostra é recebida e identificada como hemolisada, coagulada, insuficiente, incorreta, inadequada ou outro motivo autorizado.
2. Técnico executa `request-recollection`, informa motivo obrigatório e observação opcional.
3. Sistema vincula o novo sample ao anterior, marca itens afetados como `RECOLLECTION_REQUIRED`, audita e notifica a equipe responsável.
4. Nova amostra é recebida; o item retorna ao passo operacional permitido sem apagar a cadeia anterior.
5. Resultado segue o fluxo normal; contagem e duração da recoleta alimentam métricas.

## Fluxo C — RX

1. Solicitante cria item com serviço de Radiologia/RX.
2. Fila de imagem registra encaminhamento do paciente.
3. Equipe marca `PERFORMED`/etapa equivalente e registra anexos ou referência externa, se disponíveis.
4. Laudo é produzido em draft, liberado com versão auditável e notificado.
5. Profissional de cuidado visualiza e revisa; correções posteriores criam nova versão.

## Fluxo D — Ultrassom

1. Solicitação cria item que exige agendamento.
2. Equipe agenda janela, com conflito e reagendamento explícitos.
3. Paciente é encaminhado; exame é iniciado e concluído.
4. Item entra em `AWAITING_REPORT`; laudo é produzido e liberado.
5. Notificação, visualização e revisão seguem o core comum.

## Fluxo E — Resultado crítico

1. Usuário autorizado identifica/produz resultado marcado conforme política configurada.
2. Liberação registra `CriticalResultDetected` e cria notificações internas prioritárias para o responsável e fallback definido.
3. Destinatário confirma recebimento; o sistema registra actor, timestamps, versão e tentativas.
4. Ausência de confirmação gera lembrete/escalonamento configurável e fila de intervenção.
5. Correção posterior nunca remove a história: nova versão, nova notificação e decisão sobre nova confirmação.

`OPEN QUESTION`: política clínica, valores e fallback de contato precisam ser aprovados pelo responsável clínico. O MVP não envia WhatsApp/e-mail automaticamente.

## Fluxo F — Exame atrasado

1. Serviço/prioridade fornece política de SLA e evento de início.
2. Sistema calcula `due_at` no fuso/política configurados.
3. Antes do vencimento, a fila sinaliza aproximação; após vencimento, item fica `overdue` e gera evento acionável segundo política.
4. Gestão/setor recebe notificação sem alterar o status clínico automaticamente.
5. Pausas, exceções e motivo de atraso devem ser explícitos; nunca há “pausa” silenciosa.

`OPEN QUESTION`: validar relógio, calendários e metas por serviço.

## Fluxo G — Cancelamento/rejeição

1. Usuário autorizado solicita cancelamento com motivo.
2. Se nenhum trabalho foi iniciado, o serviço pode aprovar/cancelar conforme matriz.
3. Depois de amostra recebida ou execução iniciada, somente actor com permissão elevada pode cancelar/rejeitar, sempre com impacto e histórico.
4. Itens parcialmente executados mantêm seu histórico; itens irmãos continuam independentes.
5. Request só fica `CANCELLED` quando todos os itens forem cancelados/rejeitados, ou possui estado agregado parcial conforme regra da SPEC.

## Casos limite obrigatórios

| Caso | Comportamento esperado | Pergunta/risco |
| --- | --- | --- |
| Alta com exame pendente | manter item, remover dependência de leito, notificar responsável/fila; não cancelar automaticamente | política pós-alta e contato |
| Transferência de setor/leito | atualizar contexto do atendimento e manter identidade/histórico | integração com HIS |
| Solicitante encerra turno | responsabilidade segue para equipe do atendimento/substituto configurado | quem é fallback |
| Solicitante ≠ revisor | ambos aparecem na auditoria; revisor precisa ter escopo | matriz clínica |
| Exame duplicado | alertar com pedido pendente e permitir override autorizado com motivo | regra de janela |
| Pedido incorreto | cancelar/rejeitar sem apagar; resultado já liberado exige emenda/void controlado | governança |
| Cancelado após início | bloquear transição casual; registrar impacto e material processado | política de segurança |
| Falta de amostra/recoletas sucessivas | cada amostra e motivo formam cadeia; limitar/escalar somente por política | limiar clínico |
| Equipamento/setor indisponível | status de pendência/atraso com owner; não fingir execução | disponibilidade |
| Reagendamento de US | preservar agenda anterior e motivo; atualizar `due_at` conforme política | agenda mínima |
| Laudo corrigido | nova versão, motivo, autor e nova revisão/notificação | `ResultVersion` |
| Anexo errado | invalidar/revogar a versão/attachment conforme permissão; nunca apagar sem auditoria | acesso a arquivo |
| Crítico corrigido | nova versão e nova comunicação se a política exigir | clínica |
| Perda de conexão | não confirmar sucesso localmente; retry idempotente ou mostrar estado desconhecido | UX de rede |
| Dois usuários atualizam | optimistic concurrency retorna `409 CONFLICT`; reconsultar | versionamento |
| Duplo clique/retry | idempotency key e transição condicional não duplicam evento/liberação | API |
| Upload falha/malicioso | estado incompleto/quarentena, checksum e scan; resultado não libera anexo inseguro | segurança |
| Pacientes homônimos | mostrar espécie, sexo, tutor abreviado, identificador externo e data de nascimento quando permitido | privacidade |
| Busca sem paciente | protocolo, item, setor, profissional e external ID são chaves de entrada | índices |
