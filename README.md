# doggo

A pixel-art golden retriever that keeps you company in Claude Code. It sniffs
the files Claude reads, digs when it edits, fetches your shell commands, tilts
its head when Claude asks permission, looks worried when a tool fails, and
falls asleep when you wander off. Pet it, feed it, and it remembers you
between sessions.

![sprite sheet](art/preview.png)

## Requirements

- **Claude Code 2.1.287 or later** (tested on 2.1.296). Check with `claude --version`.
- **A truecolor terminal** for the sprite (Ghostty, kitty, iTerm2, WezTerm).
  The Claude Desktop app shows a one-line text version instead.
- **Python 3 + Pillow**, only if you want to redraw the art.

Mods are code that runs with your permissions inside Claude Code. Read
`hooks/` before installing if you didn't write it.

## Install

Clone or copy this folder somewhere permanent first. Both options below read
the plugin from that folder, so moving or deleting it stops the dog loading.

### Option A: try it for one session

```sh
claude --plugin-dir ~/dev/claude-mods/doggos
```

Nothing is installed. The session hot-reloads the mod whenever you save a file
in the folder, which makes this the best mode for working on it.

### Option B: install it for every session

The repo is its own local marketplace (`.claude-plugin/marketplace.json`).
Add it, then install from it:

```sh
claude plugin marketplace add ~/dev/claude-mods/doggos
claude plugin install doggo@doggos
```

Or from inside a session, giving the folder's full path:

```
/plugin install doggo --marketplace /Users/<you>/dev/claude-mods/doggos
```

Answer `y` to add the marketplace and pick a scope (user scope loads it in
every project). If a session is already open, run `/reload-plugins` there.

Because the marketplace is a local folder, the installed mod reads your
folder directly. After editing the code, run `/reload-plugins`; no reinstall
or version bump is needed.

### Check that it loaded

Run `/plugin` at the Claude Code prompt. A dim line under the tabs should read
`1 mod active · doggo` (the count includes any other mods you run). The
dog appears above the prompt with a greeting.

## Setup

Two options, settable in `/config` (look for the `doggo` rows), or with
`/plugin configure doggo@doggos`:

| Option | Values | Default |
|---|---|---|
| `display` | `band` (above the prompt), `pane` (beside the transcript), `off` | `band` |
| `name` | any name | `Biscuit` |

Changes made with `/doggo band|pane|off` or `/doggo name <name>` are saved
and take precedence over these options from then on.

The pane opens beside the transcript in a wide fullscreen terminal and above
the prompt otherwise. It needs 48 columns for the big sprite and falls back to
the small one below that.

## Commands

| Command | What it does |
|---|---|
| `/doggo` | toggle the pane (big sprite + stats) |
| `/doggo pet` | pet the dog (bond +1, counts 5 times per session) |
| `/doggo treat` | give a treat (bond +2; the 4th in a session is refused) |
| `/doggo band` / `pane` / `off` | move or hide the dog |
| `/doggo name <name>` | rename the dog |

In the pane, `p` pets and `t` gives a treat while the pane has focus
(Ctrl+X then Tab, or click it). `Esc` returns focus to the prompt.

## Memory

The dog's name, bond, stats and display choice live in the mod's store, a
JSON file under `~/.claude/plugins/store/`. Every session on your machine
shares it. Delete that file to start over with a dog who has never met you.

## Uninstall

```sh
claude plugin uninstall doggo@doggos
claude plugin marketplace remove doggos
```

To pause it without uninstalling, disable it in `/plugin` → **Installed**, or
start a session with `--safe-mode`.

## Troubleshooting

- **No dog, no `mods active` line:** check `claude --version`, and that
  `disableAllHooks` isn't set in `~/.claude/settings.json`. Organization
  policies can also block user-installed mods.
- **Mod loads but nothing draws:** start with `claude --debug` and look for
  lines starting `doggo:`. With `--plugin-dir` the same lines also show in the
  transcript.
- **Blocky or wrong colours:** the terminal isn't truecolor. Check
  `echo $COLORTERM` prints `truecolor`.
- **Dog only shows as text:** the band is narrower than 16 columns or shorter
  than 6 rows, or you're in the Desktop app.

## Development

```sh
claude plugin test        # unit + integration tests, no session needed
claude plugin validate .  # what Claude Code reads from the mod
tsc -p .                  # type-check (types land in .claude-plugin/types/ once the mod has loaded)
python3 art/build.py      # redraw sprites -> hooks/sprites.ts and art/preview.png
```

`hooks/mood.ts`, `hooks/bond.ts` and `hooks/raster.ts` are pure logic;
`hooks/register.tsx` wires them to Claude Code's events. `hooks/sprites.ts` is
generated, so edit `art/build.py` instead. Design notes are in
`docs/superpowers/specs/`.

## License

MIT. See [LICENSE.md](LICENSE.md).
