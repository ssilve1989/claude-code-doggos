# doggo

A pixel-art golden retriever that keeps you company in Claude Code. It sniffs
the files Claude reads, digs when it edits, fetches your shell commands, looks
worried when a tool fails, and falls asleep when you wander off. Pet it, feed
it, and it remembers you between sessions.

Tested with Claude Code 2.1.296 in Ghostty. The sprite needs a truecolor
terminal; the Desktop app shows a one-line text version.

## Run it

```sh
claude --plugin-dir ~/dev/claude-mods/doggos
```

## Commands

| Command | What it does |
|---|---|
| `/doggo` | toggle the pane (big sprite + stats) |
| `/doggo pet` | pet the dog (bond +1, up to 5 per session) |
| `/doggo treat` | give a treat (bond +2, 3 per session) |
| `/doggo band` / `pane` / `off` | where the dog sits |
| `/doggo name <name>` | rename (default Biscuit) |

`display` and `name` are also plugin options (`/config`).

## Development

```sh
python3 art/build.py      # redraw sprites -> hooks/sprites.ts, art/preview.png (needs Pillow)
claude plugin test        # unit + integration tests
claude plugin validate .
tsc -p .                  # types appear in .claude-plugin/types/ once the mod has loaded
```

`hooks/mood.ts`, `hooks/bond.ts` and `hooks/raster.ts` are pure; `hooks/register.tsx`
wires them to Claude Code's events. Design notes: `docs/superpowers/specs/`.
