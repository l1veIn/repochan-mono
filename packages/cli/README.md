# RepoChan CLI

Modular RepoChan command line interface and TUI.

- `repochan` launches the interactive wizard.
- `repochan init` initializes `.repochan/` protocol directories.
- `repochan status`, `inspect`, and `validate` provide deterministic protocol views.
- `repochan order ...` and `repochan asset ...` inspect generated artifacts.

The TUI pages are organized under `src/pages`, reusable widgets under `src/components`, pure helpers under `src/lib`, and deterministic commands under `src/commands`.
