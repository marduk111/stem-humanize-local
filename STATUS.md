# Status

**Current version:** `1.3.0`  
**Build:** local  
**Repo:** [marduk111/stem-humanize-local](https://github.com/marduk111/stem-humanize-local)

## What exists now

| Area | State | Notes |
|---|---|---|
| Realtime processing | Working | AudioWorklet (`humanize-processor.js`) with transient detection, variable micro-delay (max ~20 ms), expression motion, dry/wet mix, all presets. |
| UI | Working | Guided six-step workflow (dropdown + Back/Next + progress), step-specific guidance, live readouts, waveform/playhead, A/B bypass, output level meter. Recommended defaults can be re-applied. |
| File input | Working | Load any `audio/*`, disconnects mic on file load. |
| Mic input | Working | `getUserMedia`, disconnects file on mic load. |
| WAV export | Working | OfflineAudioContext render + 16-bit PCM WAV download. Renders the loaded file with current settings. |
| Engine metering | Working | Worklet posts throttled movement/attack values for the transient-protection meters. |
| Version display | Working | UI badge, title, footer, `/api/info`, tray tooltip, installer metadata. |
| Changelog/release notes | Working | `CHANGELOG.md` embedded in app + in repo. |
| Native server/launcher | Ready to build | `launcher/StemHumanizeServer.cs` - serves app, tray UI, opens browser, single instance. |
| Windows installer | Ready to build | `installer/Installer.cs` - extracts payload, shortcuts, uninstall. |
| One-click launch (repo) | Working | `Start Stem Humanize.cmd`. |
| Dev server | Working | `node build/dev-server.js`. |

## How to review / run

- **Dev (browser):** run `Start Stem Humanize.cmd` or `node build/dev-server.js`. Open `http://127.0.0.1:8000/` (port auto-finds free). No build step.
- **Build installer + portable:** `powershell -ExecutionPolicy Bypass -File .\build\build.ps1` (outputs `dist/`).
- **Installed app:** runs as a tray app; closes to tray or Exit from context menu.

## Known gaps / next ideas

- Export doesn't currently support the mic/live path (renders the loaded `currentBuffer` only).
- Mic + file simultaneously not supported.
- DSP is an approximation of the original graph (good for listening; could be tightened to match the DSL nodes exactly).
- No drag-and-drop yet.
- A/B compares the current blend against the dry stem; it does not level-match automatically.
- Auto-updates not implemented.

## Quick check to continue

1. Read `CHANGELOG.md` and `VERSION`.
2. Run the app and test export with a short stem.
3. Pick an item from "next ideas" or describe a change.
4. If changing version, bump `VERSION` and `CHANGELOG.md` before building.
