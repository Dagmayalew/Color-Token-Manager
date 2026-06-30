# Next Steps — Make Color Token Manager Powerful And Easy To Use

This file is the working plan for the next phase of Color Token Manager.

The extension is currently:

- VS Code-first
- not yet published to Open VSX
- already useful for token management, extraction, diagnostics, previews, exports, and MCP-based agent access

The next goal is bigger:

**Make the extension feel easy, powerful, and obviously valuable inside VS Code first, while exposing its capabilities cleanly to AI agents second.**

## Product Direction

The extension should work well in two layers:

- **Primary layer**: a VS Code user opens the manager, previews changes, runs commands, audits tokens, and edits safely.
- **Integration layer**: Cursor, Claude Code, Windsurf, Copilot, or another MCP client can consume the extension's knowledge and workflows through MCP.

The key product rule for the next phase:

**The extension must stand on its own as a strong VS Code product. AI integrations should depend on the extension's workflows and knowledge, not the other way around.**

That means:

- the extension should solve real token problems even if the user never connects an AI agent
- MCP should expose the extension's value, not define it
- AI clients are a distribution and automation layer on top of a solid VS Code feature set

## Step 0 — Product Model

Before changing behavior, define the supported project shapes clearly.

### Supported setups

- `colors.ts` only
- `theme.ts` only
- `colors.ts + theme.ts`
- `tokens.ts` or `designTokens.ts`
- custom token file paths

### Supported workflows

- collect hardcoded colors into reusable tokens
- build or maintain semantic themes
- work with separate colors and theme files
- scan and replace in supported source files

### Supported source languages

- JavaScript and JSX
- TypeScript and TSX
- CSS, SCSS, and LESS
- HTML inline styles
- preview-only scan support for the other languages already listed in the extension

### Product rule

The extension must let the user choose:

- what kind of token file they want to manage
- whether they are managing colors, themes, or both
- which files to scan in the workspace

This step is about making the product model explicit before we refine setup and UI flows.

## Core Priorities

We will focus on four areas:

1. **Stronger VS Code workflows**
2. **Extension-first audit and reporting**
3. **Useful MCP exposure of extension capabilities**
4. **Small, high-value shortcuts and ergonomics**

## Phase A — Stronger VS Code Core

### Goal

Make Color Token Manager powerful enough that it is valuable before MCP is even considered.

### What we want

- better first-run onboarding in VS Code
- clearer manager UI
- safer and more obvious preview/apply flows
- stronger token reports and audit views
- better guidance when configuration is missing or invalid

### Planned commands

- `Color Token Manager: Open Color Token Manager`
- `Color Token Manager: Set Up Color Token Manager`
- `Color Token Manager: Preview Current File`
- `Color Token Manager: Preview Colors From Folder`
- `Color Token Manager: Find Unused Color Tokens`
- `Color Token Manager: Audit Design Tokens`
- `Color Token Manager: Audit Contrast`

### Planned UI

Improve the manager with:

- stronger onboarding for first-time users
- a clear audit entry point
- visible next actions
- stronger empty states and error states
- clearer distinction between read-only previews and apply actions

### Success criteria

- a VS Code user understands the value of the extension without using MCP
- setup and recovery paths are obvious
- audit and preview flows feel central, not hidden

## Phase B — One-Click MCP Exposure

### Goal

Expose the extension to AI tools without making AI tools the center of the product.

### What we want

- the extension owns the source of truth
- AI clients can connect in one guided flow
- MCP setup feels optional and easy
- the extension can test its own MCP surface from inside VS Code

### Planned commands

- `Color Token Manager: Connect AI Agent`
- `Color Token Manager: Install Cursor MCP Config`
- `Color Token Manager: Install Claude Code MCP Config`
- `Color Token Manager: Install Windsurf MCP Config`
- `Color Token Manager: Copy MCP Client Config`
- `Color Token Manager: Test MCP Server`
- `Color Token Manager: Show MCP Logs`

### Planned UI

Add a short integration panel in the manager with:

- `Connect AI Agent`
- `Install Client Config`
- `Test MCP`
- `Copy Config`
- `Show Logs`
- example prompts

### Success criteria

- A user can set up a supported client in one flow
- Existing client configs are preserved
- The extension shows a clear success message
- If setup fails, the message explains what to do next

## Phase C — Extension-First Audit And Reporting

### Goal

Give users a strong reason to use the extension for design token health, with MCP simply exposing the same capability to agents.

### Planned VS Code features

- a first-class audit command and report view
- contrast audit view
- duplicate and similar-color analysis
- unused token cleanup preview
- clear recommended next actions from reports

### Planned MCP resources

- `colors://report`
- `colors://tokens`
- `colors://tokens/flat`
- `colors://tokens/unused`
- `colors://exports/json`
- `colors://exports/css`
- `colors://exports/tailwind`
- `colors://exports/figma`
- `colors://exports/w3c`
- `colors://help`

### Planned MCP tools

- `audit_project()`
- `audit_contrast()`
- `preview_extract_from_folder(path)`
- `preview_file_extraction(path)` or a refined version of `extract_from_file(path)`
- `list_tokens(query?)`
- `find_similar_tokens(colorValue)`
- `preview_unused_cleanup()`
- `suggest_token_name(context)`
- `get_contrast(tokenPath, againstTokenPath)`

### What `colors://report` should include

- total token count
- unused token count
- alias count
- duplicate values
- similar color clusters
- contrast risks
- suggested next actions
- colors file path

### Example agent prompts we want to support well

- `Audit my design tokens.`
- `Find unused tokens and explain what looks safe to remove.`
- `Check contrast risks in my token system.`
- `Preview extraction for this file.`
- `Preview extraction for this folder.`
- `Export Tailwind tokens.`

### Success criteria

- the extension can produce a useful token audit inside VS Code
- Cursor or another MCP client can consume the same audit through MCP
- The report is understandable to a non-expert user
- The output suggests safe next actions instead of only raw data

## Phase D — MCP Design Token Audit Exposure

### Goal

Expose extension audit capabilities to agents cleanly and safely.

### Error messages to improve

- `Cursor config not found. Click Install Cursor Config.`
- `No colors file found. Run Set Up Color Token Manager first.`
- `MCP config installed, but the client needs a restart or reload.`
- `The configured colors file is outside the active workspace.`

### Success criteria

- MCP mirrors the extension's most valuable workflows
- MCP remains safe, lightweight, and easy to understand
- setup failures explain what needs fixing

## Phase E — Shortcuts And Speed

### Goal

Add only shortcuts that save real time.

We do **not** want to add many random shortcuts. We want a small set of memorable ones for common actions.

### Keep

- Open manager
- Preview selection

### Likely additions

- `Open Color Token Manager`
- `Preview Current File`
- `Extract Colors From Current File`
- `Find Unused Color Tokens`
- `Test MCP Server`

### Shortcut guidance

Use shortcuts only when:

- the action is frequent
- the action is safe
- the action is easy to understand
- the shortcut is unlikely to conflict badly with common VS Code usage

### Candidate shortcuts to evaluate

- `cmd+alt+shift+c` / `ctrl+alt+shift+c`: open manager
- `cmd+alt+shift+p` / `ctrl+alt+shift+p`: preview selection
- `cmd+alt+shift+e` / `ctrl+alt+shift+e`: extract current file
- `cmd+alt+shift+u` / `ctrl+alt+shift+u`: find unused tokens
- `cmd+alt+shift+m` / `ctrl+alt+shift+m`: test MCP

### What we should avoid

- `cmd+0` style shortcuts unless there is a very strong reason

Reason:

- these are easier to conflict with editor or layout workflows
- they are less descriptive and less memorable than an `alt+shift` pattern

## Phase F — Marketplace Value

### Goal

Make the extension easy to understand and easy to recommend.

### README improvements

The README should make these things obvious fast:

- works in VS Code today
- works powerfully on its own in VS Code
- works with Cursor and other AI agents through MCP
- can help manage and audit a design token system
- can preview refactors safely
- can export tokens in multiple formats

### README additions

- a short **Works With AI Agents** section
- screenshots or GIFs later if helpful
- one-click setup flow
- example prompts
- why the MCP server is useful

### Positioning

This extension should not be described only as:

- a token editor

It should also be described as:

- a design token workflow tool
- a safe extraction and audit tool
- a VS Code-native token platform with MCP exposure for AI-assisted token work

## Proposed Implementation Order

This is the recommended order for the next several PRs.

### PR 1 — VS Code Audit Core

- add `Audit Design Tokens`
- add `Audit Contrast`
- add report view
- improve onboarding and empty states in the manager

### PR 2 — MCP Exposure And Guided Setup

- add `Connect AI Agent`
- add client picker
- add install commands for supported clients
- add `Test MCP Server`
- improve onboarding panel in the manager

### PR 3 — MCP Design Token Audit

- add `colors://report`
- add `audit_project`
- add `audit_contrast`
- add `preview_extract_from_folder`

### PR 4 — Token Intelligence

- add `find_similar_tokens`
- add `list_tokens(query?)`
- improve token naming suggestions
- add unused cleanup preview

### PR 5 — Marketplace Polish

- tighten README
- add screenshots
- package smoke tests
- publish checklist updates

## Acceptance Criteria For The Next Big Step

We should consider the next phase successful when:

- a user can get value from the extension in VS Code without needing any AI client
- a user can run a useful audit from inside VS Code
- a user can connect their preferred AI agent in one guided flow
- a user can test the MCP server from inside VS Code
- an AI agent can consume the extension's audit capabilities using MCP resources and tools
- the extension remains small, safe, and understandable
- setup errors are easy to recover from

## Constraints We Should Keep

- stay lightweight
- keep `dist/extension.js` small
- do not silently write code from MCP flows
- require preview or confirmation for risky changes
- keep VS Code as the primary home for the extension
- avoid adding features that feel impressive but are not actually useful in daily work

## Short-Term Recommendation

If we are choosing only one next step, choose this:

**Build VS Code Audit Core + MCP Test + Token Audit Report.**

That gives us:

- stronger standalone value
- easier setup when AI is desired
- clearer user value
- stronger marketplace story
- better day-one experience

## Notes

- The extension is currently VS Code-first, and that is fine.
- Open VSX can come later.
- We should optimize for a great VS Code experience first, because that is the environment we actually support today.
