# Jobs To Be Done

## Job central

> Quando um paciente está em atendimento e preciso de um exame, quero solicitar e acompanhar o pedido em uma única linha do tempo, para que o setor certo execute, o resultado chegue a quem precisa agir e nada dependa de mensagens paralelas.

## Jobs funcionais

| ID | Situação | Motivação | Resultado esperado | Sinal de falha |
| --- | --- | --- | --- | --- |
| JTBD-01 | Solicitação clínica | Pedir um ou mais serviços para um atendimento | Pedido correto, com prioridade e responsável | paciente/serviço errado ou duplicidade invisível |
| JTBD-02 | Fila do executor | Receber e ordenar trabalho | Próximo item acionável explicado por prioridade/SLA | fila por data sem contexto |
| JTBD-03 | Amostra | Registrar recebimento ou rejeição | Cadeia de amostra preservada | recoleta sem vínculo |
| JTBD-04 | Execução | Atualizar etapa sem burocracia | Status confiável e auditado | estado impossível/duplo clique |
| JTBD-05 | Resultado | Produzir e liberar | Conteúdo disponível ao escopo correto | sobrescrita silenciosa |
| JTBD-06 | Revisão | Ver e confirmar resultado | Separar visualização, revisão e conclusão | “pronto” tratado como “visto” |
| JTBD-07 | Exceção | Recuperar erro, atraso ou indisponibilidade | Próxima ação, responsável e histórico | pendência perdida |
| JTBD-08 | Gestão | Intervir em gargalos | Métricas explicáveis e acionáveis | indicador sem definição |
| JTBD-09 | Suporte | Investigar incidente | Correlation ID + auditoria + timeline | logs sem contexto |
| JTBD-10 | Evolução | Adicionar serviço futuro | Novo workflow sem reescrever o core | serviço codificado em tela/tabela específica |

## Outcomes desejados

- menor tempo entre solicitação e processamento;
- menor tempo até visualização/revisão;
- redução de pedidos esquecidos e comunicação paralela;
- recoletas recuperáveis e rastreáveis;
- atraso detectado antes de virar surpresa;
- identificação segura do paciente, amostra e resultado;
- aprendizado contínuo com métricas de fluxo.

## Anti-jobs

O sistema não deve obrigar profissionais a:

- preencher dados já conhecidos do atendimento;
- abrir uma tela administrativa para cada atualização trivial;
- confiar em cor ou toast para informação crítica;
- repetir a mesma informação em WhatsApp para o fluxo funcionar;
- apagar histórico para corrigir um erro.
