# Information architecture

**Knowledge status:** `DECISION/PROPOSAL` de navegação; precisa de validação observacional com usuários do hospital.

## 1. Navigation

Primary navigation is short and action-oriented:

1. Visão geral
2. Central de Exames
3. Meus Pacientes
4. Laboratório
5. Imagem
6. Indicadores

Administração is separate and shown only to authorized roles. Contextual deep links open a request/item/result without forcing a full navigation path.

## 2. Information hierarchy

```text
Paciente
└── Atendimento / Internação
    └── Solicitação (protocolo, prioridade, aggregate status)
        └── Item diagnóstico (service, status, SLA, next action)
            ├── Sample / Procedure
            ├── Result current version
            ├── Review / Critical acknowledgement
            └── Timeline / audit
```

## 3. Core objects shown together

Every operational card/row should show, where permitted: patient identity bundle, request code, service, priority label/icon, current status, age/SLA, responsible queue and next action. Avoid hiding status behind detail view.

## 4. Entry points

- Home attention queues.
- Global search (`/search`).
- Notification deep link.
- Patient → diagnostics.
- Request protocol link.
- Sector queue with persistent filters.

## 5. Responsive strategy

Desktop-first dense queue/table; tablet supported for care teams; mobile keeps patient, status, priority, next action and result/review actions, while complex administration may require desktop. No horizontal scroll for primary action on a 390px viewport.
