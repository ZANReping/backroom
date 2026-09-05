# Codex agent routing

## Automatic Luna delegation

- Automatically delegate implementation work to the custom `luna_repetitive_worker` agent without asking the user when all of the following are true:
  - the requested behavior and modification direction are fully explicit;
  - the relevant subsystem and expected result are already known;
  - the work is simple, repetitive, local, and mechanically verifiable;
  - the subtask can be bounded to a non-overlapping set of files or symbols.
- Good Luna tasks include repeated data-entry changes, mechanical renames, applying an established pattern to more files, small isolated model/material variants, straightforward UI text changes, and focused fixes whose cause and solution are already established.
- Keep ambiguous requirements, architecture and data-model decisions, cross-system debugging, performance root-cause analysis, save/network compatibility, security-sensitive work, and subjective visual design on the primary model.
- Multiple independent Luna subtasks may run in parallel, but never assign two agents overlapping files or ownership.

## Escalation back to the primary model

- Treat any response beginning with `ESCALATE_TO_MAIN:` as an immediate handoff, not a failed final result.
- The primary agent must inspect the worker's evidence and partial diff, take ownership, and continue with the stronger model.
- Do not repeatedly send the same blocker back to Luna. Ask the user only when completion genuinely needs a new user decision or authority.
- If the Luna worker silently produces an incomplete or unsafe result, the primary agent reviews and repairs it before reporting completion.

## Godot MCP ownership

- The live Godot editor bridge permits one active MCP client at a time. The primary agent owns editor/runtime verification by default.
- Luna workers should prefer direct file edits and static checks. Give a worker exclusive live-editor access only when its bounded task specifically requires it and no other agent is using the bridge.

## Godot skill version guard

- This repository's active Godot project targets Godot 4.4, while the installed `godot-master` knowledge library targets Godot 4.7+.
- Use `godot-master` for architecture and domain routing, but resolve concrete APIs against the active Godot 4.4 editor, its MCP documentation, and the installed `godot-version-migration` notes.
- Do not upgrade the engine, change `config/features`, or introduce APIs first added in Godot 4.5–4.7 unless the user explicitly requests an engine upgrade.
- When a referenced pattern is 4.7-only, implement the Godot 4.4 equivalent or escalate to the primary model if no safe equivalent exists.
