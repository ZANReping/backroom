# Codex agent routing

## Multiplayer freeze (user requirement, 2026-10-06)

- Multiplayer is temporarily disabled. Keep its entry points closed and retain its existing implementation for possible later use.
- Until the human user explicitly requests reopening multiplayer, do not update multiplayer features, protocols, synchronization or compatibility, and do not include multiplayer requirements or multiplayer testing in unrelated work.
- Current development and acceptance target single-player gameplay. A general request to continue development does not reopen multiplayer.
- This requirement applies to the Three.js game in `app`; do not propagate changes into `app-lite` without a separate request.

## Game models and texture assets

- Models may be authored in Blender and imported into the game. Reuse suitable open-source/openly licensed models when their license permits the intended distribution; optimize mesh, UVs, materials and scale for the project's runtime and performance budget.
- Prefer suitable openly licensed texture assets first. If none fit the intended appearance, use the imagegen skill to create textures, then prepare matching normal and roughness maps and other required PBR channels. Keep OpenGL normal orientation, world scale, seamless edges, mipmaps and quality tiers consistent with the renderer.
- Record the original source URL, author, exact license, local asset paths and modifications for every reused asset. Keep generated source images, prompts and reproducible processing scripts with the project. Do not assume that a free download permits redistribution.
- Compare generated textures strictly against the supplied references (motif, scale, color, contrast and wear). When they differ, revise the prompt and regenerate as far as practical; preserve iteration notes and verify the selected texture on the in-game geometry before accepting it.
- Inspect imported assets in the actual game, including UV seams, lighting, collision alignment, draw calls and resource disposal. Tool choice does not relax the current task's performance or compatibility requirements.

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
