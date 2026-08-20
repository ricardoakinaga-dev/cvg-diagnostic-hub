# Personas operacionais

Estas personas são modelos de trabalho, não perfis de marketing. Os nomes são fictícios.

## P-01 — Veterinária solicitante

- Contexto: alterna entre atendimentos e precisa pedir exames com dados do paciente já disponíveis.
- Job: solicitar corretamente em poucos passos e saber quando há resultado novo.
- Fricções: formulários repetitivos, estados ambíguos, alertas que não levam ao contexto.
- Necessidades: paciente/atendimento pré-preenchidos, busca de serviços, prioridade, observação opcional, deep link e revisão.
- Risco: escolher paciente homônimo ou duplicar pedido.
- Sucesso: cria uma solicitação sem reescrever contexto e encontra o resultado sem contato manual.

## P-02 — Profissional de internação/UTI

- Contexto: acompanha vários pacientes, inclusive entre turnos e mudanças de leito.
- Job: saber o que exige ação agora por paciente.
- Fricções: resultado em outro canal, pendência não atribuída, alta com exames em aberto.
- Necessidades: “Meus pacientes”, pendências, críticos, recoletas, substituto/responsável e timeline.
- Risco: assumir que “disponível” significa “revisado”.

## P-03 — Técnica de laboratório

- Contexto: trabalha uma fila operacional, recebe amostras e registra exceções.
- Job: processar na ordem correta, documentar problema e liberar sem perder rastreabilidade.
- Fricções: fila por data apenas, identificação ambígua, dupla ação, notificação manual.
- Necessidades: prioridade/SLA visíveis, accession, motivos padronizados, atalhos acessíveis e confirmação de servidor.
- Risco: associar amostra/resultado ao paciente errado.

## P-04 — Equipe de radiologia

- Contexto: coordena encaminhamento, execução e laudo de RX.
- Job: ver fila, registrar realização e liberar laudo com anexos autorizados.
- Necessidades: status específico de imagem, agenda/encaminhamento e edição versionada do laudo.
- Risco: laudo ou arquivo incorreto e pedido cancelado após execução.

## P-05 — Equipe de ultrassom

- Contexto: opera agenda e execução com laudo posterior.
- Job: agendar/reagendar, executar, produzir e liberar laudo.
- Necessidades: agenda simples, status `AWAITING_REPORT`, lembrete de atraso e autoria clara.
- Risco: conflito de horário ou paciente não encaminhado.

## P-06 — Gestor operacional

- Contexto: não executa cada exame; precisa intervir nos gargalos.
- Job: identificar atraso, volume, recoleta, críticos sem confirmação e distribuição por setor.
- Necessidades: dashboard acionável, definições de métrica, filtros e acesso amplo sem editar resultado por padrão.
- Risco: indicadores sem definição ou baseados em timestamps inconsistentes.

## P-07 — Administrador/TI/Segurança

- Contexto: mantém identidade, configuração, disponibilidade e suporte.
- Job: operar o sistema sem poder apagar silenciosamente a história clínica.
- Necessidades: RBAC, logs técnicos com correlation ID, auditoria imutável, backup/restore e readiness.
- Risco: privilégio excessivo, segredo exposto, restore nunca testado.

## Persona ausente deliberadamente

`DECISION`: tutor e paciente não são usuários do MVP. Comunicação externa pode ser adicionada somente com política de consentimento, canal, identidade e auditoria definidos.
