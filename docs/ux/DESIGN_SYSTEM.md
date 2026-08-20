# Design system direction

**Knowledge status:** `DECISION/PROPOSAL` visual e de acessibilidade; budgets e validação de uso serão produzidos no BUILD/piloto.

## 1. Experience target

Premium, hospitalar, moderna, limpa e funcional. Informação e ação dominam a interface; efeitos decorativos não podem competir com status clínico.

## 2. Tokens (initial proposal)

- typography: sans legible, numeric tabular for times/counts;
- spacing: 4px base scale, larger section rhythm;
- radius: modest 8–12px for cards/inputs;
- elevation: restrained, avoid shadow-only grouping;
- density: `comfortable` default, `compact` for laboratory queues after user validation;
- color: neutral canvas + semantic accents; every semantic color paired with label/icon/text.

## 3. Shared components

- `DiagnosticStatus`: canonical code → Portuguese label, icon, description and tone.
- `PriorityBadge`: Routine/Urgent/Emergency with text/icon/position.
- `SlaIndicator`: age, due/overdue, explicit explanation.
- `PatientIdentity`: name + species/sex/tutor abbreviation/external ID under scope.
- `QueueTable`/`QueueCard`: same semantic columns and next action.
- `ResultVersionBanner`: current version, amended/re-review state.
- `NotificationRow`, `CriticalAlert`, `Timeline`, `AuditSummary`.
- `EmptyState`, `ErrorState`, `OfflineBanner`, `Skeleton`, `ConfirmationDialog`.

## 4. Interaction rules

- progressive disclosure for notes, attachments, advanced filters and admin fields;
- server-confirmed final state for clinical actions;
- contextual action is close to the item; destructive actions require proportionate reason/confirmation;
- feedback remains visible for critical actions; toast alone is insufficient;
- no disabled button without explanation when permission/state blocks action;
- loading preserves context; prevent double submit and show pending state.

## 5. Accessibility

Target WCAG 2.2 applicable: semantic HTML, visible focus, keyboard order, accessible names, contrast, target size, error association, live region restraint, reduced motion and no color-only status. Automated checks plus keyboard/screen-reader manual pass are required.

## 6. Content guidelines

Use plain Portuguese, action verbs and context:

- “Resultado disponível para Thor · Hemograma · liberado há 4 min”;
- “Amostra insuficiente — solicite uma nova coleta para continuar”;
- “Atualização não confirmada. Verifique a fila antes de repetir.”

Avoid “Erro 500”, unexplained codes, blame and false certainty.
