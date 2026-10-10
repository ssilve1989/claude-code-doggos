# doggo

A pixel-art golden retriever that keeps you company in Claude Code. It sniffs
the files Claude reads, digs when it edits, fetches your shell commands, tilts
its head when Claude asks permission, and gets the zoomies when your tests
pass. Every subagent Claude starts brings a puppy. It barks when a long turn is
done, brings its leash when you've worked too long, plays fetch, learns tricks
as your bond grows, and dresses up for the holidays. It remembers you between
sessions.

![sprite sheet](art/preview.png)

## Requirements

- **Claude Code 2.1.287 or later** (tested on 2.1.296). Check with `claude --version`.
- **A truecolor terminal** for the sprite (Ghostty, kitty, iTerm2, WezTerm).
  The Claude Desktop app shows a one-line text version instead.
- **Python 3 + Pillow**, only if you want to redraw the art.

Mods are code that runs with your permissions inside Claude Code. Read
`hooks/` before installing if you didn't write it.

## Install

### From GitHub (recommended)

At the Claude Code prompt:

```
/plugin install doggo --marketplace ssilve1989/claude-code-doggos
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in
every project). Or from your shell:

```sh
claude plugin marketplace add ssilve1989/claude-code-doggos
claude plugin install doggo@doggos
```

If a session is already open, run `/reload-plugins` there.

To get a newer version later:

```sh
claude plugin update doggo@doggos
```

then `/reload-plugins` in any open session.

### From a local clone (for development)

Clone the repo somewhere permanent. Both options below read the plugin from
that folder, so moving or deleting it stops the dog loading.

```sh
git clone git@github.com:ssilve1989/claude-code-doggos.git ~/dev/claude-mods/doggos
```

**Try it for one session.** Nothing is installed, and the session hot-reloads
the mod whenever you save a file in the folder:

```sh
claude --plugin-dir ~/dev/claude-mods/doggos
```

**Install it for every session.** The repo is its own marketplace
(`.claude-plugin/marketplace.json`), so it can be added as a local one:

```sh
claude plugin marketplace add ~/dev/claude-mods/doggos
claude plugin install doggo@doggos
```

Because that marketplace is a local folder, the installed mod reads your
folder directly. After editing the code, run `/reload-plugins`; no reinstall
or version bump is needed. Use either the GitHub or the local marketplace, not
both: they share the name `doggos`.

### Check that it loaded

Run `/plugin` at the Claude Code prompt. A dim line under the tabs should read
`1 mod active · doggo` (the count includes any other mods you run). The
dog appears above the prompt with a greeting.

## Setup

Options, settable in `/config` (look for the `doggo` rows), or with
`/plugin configure doggo@doggos`:

| Option | Values | Default |
|---|---|---|
| `display` | `band` (above the prompt), `pane` (beside the transcript), `off` | `band` |
| `name` | any name | `Biscuit` |
| `barkAfterSeconds` | turns at least this long send a notification | `60` |
| `breakAfterMinutes` | work streak before the break reminder | `90` |
| `spinner` | swap Claude's spinner word for the dog's | `true` |
| `coat` | `golden`, `cream` (English cream) or `red` | `golden` |
| `outfits` | `auto` dresses up by the calendar, `off` never | `auto` |
| `recap` | after a turn of 30s or more, a one-line recap in dog voice from Haiku | `false` |
| `barks` | bark sounds on long turns, fetch and treats (macOS) | `false` |
| `barkVolume` | 0 to 1 | `0.6` |

`recap` makes one small Haiku call per long turn on your plan, with the list of
files and commands from that turn and the start of Claude's answer. The barks
are synthesized by `art/build.py` (`sounds/*.wav`); swap in your own clips with
the same names if you'd like a real dog.

Changes made with `/doggo band|pane|off`, `/doggo name <name>` or
`/doggo coat <coat>` are saved and take precedence over these options from then
on.

The pane opens beside the transcript in a wide fullscreen terminal and above
the prompt otherwise. It needs 48 columns for the big sprite and falls back to
the small one below that.

## What it notices

- **Context:** past 70% of the context window the dog gets drowsy; past 90%
  it pants and suggests `/compact` once. After a compaction it shakes off.
- **Long waits:** when Claude has been busy for 2 minutes with nothing new to
  show, the dog lies down to wait.
- **Milestones:** passing tests (npm/pnpm/yarn/bun test, vitest, jest, pytest,
  go test, cargo test, claude plugin test) set off the zoomies; failing ones
  get sad ears. A successful `git commit` or `git push` is celebrated.
- **The pack:** every subagent or teammate Claude starts brings a puppy. It
  runs in from the right and sits while its agent works, then wags (or droops
  its ears if the agent failed) and runs off when it's done. Up to 4 show at
  once, with a `+N` for the rest. In the pane each pup has its task under it.
- **Dress-up days:** a witch hat Oct 24–31, a Santa hat Dec 1–26, a party hat
  for New Year's and on the dog's birthday (the anniversary of your first
  session together), and a heart bandana on Valentine's Day. On those days the
  band dog grows two rows taller to fit its hat.

Changes of pose are animated: the dog stands, sits, turns and lies down
through in-between frames instead of cutting between poses.

## Nudges

- **Done bark:** a turn that runs for `barkAfterSeconds` or more sends a native
  notification ("Claude's done! 🐾"). Aborted turns and subagents stay quiet.
- **Waiting bark:** if Claude has been waiting on your permission for 30
  seconds, you get "Claude needs you!".
- **Break reminders:** after `breakAfterMinutes` of steady work (no gap longer
  than 15 minutes) the dog brings its leash, and again every 30 minutes.
- **Night owl:** between midnight and 5 am it yawns at your prompts (once an
  hour) and dozes off after 2 quiet minutes instead of 10.
- **Dog spinner:** Claude's spinner reads Sniffing, Digging, Fetching,
  Pondering, Wagging or Woofing. The Desktop app keeps its own.

Notifications use your terminal's notification channel (Claude Code's
`preferredNotifChannel` setting). If that's off, the dog still reacts on screen.

## Commands

| Command | What it does |
|---|---|
| `/doggo` | toggle the pane (big sprite + stats) |
| `/doggo pet` | pet the dog (bond +1, counts 5 times per session) |
| `/doggo treat` | give a treat (bond +2; the 4th in a session is refused) |
| `/doggo fetch` | throw the ball (bond +1, up to 3 times per session) |
| `/doggo trick [name]` | a trick it knows: a random one, or `sit`, `paw`, `roll`, `dead` |
| `/doggo band` / `pane` / `off` | move or hide the dog |
| `/doggo name <name>` | rename the dog |
| `/doggo coat <golden\|cream\|red>` | change coat (saved) |
| `/doggo outfit <witch\|santa\|party\|bandana\|none\|auto>` | try on an outfit for this session |

Tricks are learned with the bond: *sit pretty* from the start, *paw* as a
friend, *roll over* as a best friend and *play dead* as a soulmate. Fetch
usually ends with the ball dropped at your feet, but now and then there's a
squirrel, or the dog decides the ball is its now.

In the pane, `p` pets, `t` gives a treat and `f` throws the ball while the
pane has focus (Ctrl+X then Tab, or click it). `Esc` returns focus to the
prompt.

While the dog is on screen, commands answer through the dog. With it hidden
(`/doggo off`), they reply with a line of text instead.

## Memory

The dog's name, bond, stats (sessions, pets, treats, balls and things
fetched), coat and display choice live in the mod's store, a JSON file under
`~/.claude/plugins/store/`. Every session on your machine
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
  than 6 rows (8 on dress-up days), or you're in the Desktop app.
- **No bark notifications:** they only fire for turns of `barkAfterSeconds` or
  more. They go through Claude Code's `preferredNotifChannel`; check that
  setting, and that your terminal is allowed to show notifications in macOS
  System Settings → Notifications.

## Development

```sh
pnpm install              # dev tooling only: commit hooks (the mod needs no install)
claude plugin test        # unit + integration tests, no session needed
claude plugin validate .  # what Claude Code reads from the mod
tsc -p .                  # type-check (types land in .claude-plugin/types/ once the mod has loaded)
python3 art/build.py      # redraw sprites -> hooks/sprites.ts and art/preview.png; resynthesize sounds/
python3 art/build.py --sound-preview   # also plot the barks to art/sounds.png
```

`hooks/register.tsx` wires everything to Claude Code's events. The rest of
`hooks/` is pure logic with no access to Claude Code, each file tested on its
own:

| File | What it decides |
|---|---|
| `mood.ts` | the dog's mood and pose from session events |
| `bond.ts` | bond levels, greetings, tricks learned |
| `nudges.ts` | barks, break reminders, night owl, the spinner word |
| `milestones.ts` | which shell commands are tests, commits or pushes; context levels |
| `pack.ts` | puppies arriving, sitting, leaving, scooting |
| `shows.ts` | fetch and trick timelines |
| `recap.ts` | the dog-speak recap prompt and its cleanup |
| `looks.ts` | coats, the outfit calendar, where hats go |
| `animator.ts` | smooth transitions between poses |
| `raster.ts` | turning pixel frames into terminal cells |

`hooks/sprites.ts` and `sounds/` are generated, so edit `art/build.py` instead.
The original design is in `docs/superpowers/specs/`.

### Commits and releases

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:`, `chore:`…). `pnpm install` sets up a `commit-msg`
hook that rejects anything else, and CI lints every commit in a pull request.

Releases are automated by [release-please](https://github.com/googleapis/release-please):
each push to `main` updates a release PR with the next version, the
`CHANGELOG.md` entry and the version in `.claude-plugin/plugin.json`. Merging
that PR tags the release, and `claude plugin update doggo@doggos` then picks
it up. While the version is below 1.0, `feat` bumps the minor version and
`fix` the patch.

## License

MIT. See [LICENSE.md](LICENSE.md).
