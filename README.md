# Stem Humanize

Transient-aware micro-timing and expression effect for rendered stems, running locally in
your browser. You get adjustable timing looseness, organic drift, feel bias, transient
protection, expression movement and a dry/wet mix — plus offline WAV export.

Current version: **1.2.0** (see `VERSION`, `version.json`, `CHANGELOG.md`, `STATUS.md`).

## Install (Windows)

1. Download `StemHumanizeSetup-1.2.0.exe` from the [Releases page](https://github.com/marduk111/stem-humanize-local/releases).
2. Double-click it and confirm.
3. It installs to `%LOCALAPPDATA%\StemHumanize`, adds a **Desktop shortcut** and a Start Menu
   entry, and launches the app. Windows SmartScreen may warn because the installer is not
   code-signed — choose *More info → Run anyway*.

No Node.js, Python or other runtime is required. The installer contains a small native
launcher that serves the app on `http://127.0.0.1:<random port>/` and lives in the tray
(double-click the tray icon to reopen, right-click for Changelog / About / Exit).

Uninstall from **Settings → Apps → Stem Humanize**, or run the *Uninstall Stem Humanize*
Start Menu shortcut.

## Run without installing

- **One-click:** `Start Stem Humanize.cmd` — uses `dist\portable\StemHumanizeServer.exe` when present,
  otherwise falls back to the Node dev server.
- **Portable:** extract `StemHumanize-1.2.0-portable.zip` anywhere and run
  `StemHumanizeServer.exe`.
- **Dev server:** `node build/dev-server.js` then open the printed URL.

## Using the app

1. Press **Start audio** (browsers require a user gesture before audio starts).
2. Load a stem with **Audio file**, or use **Use mic**.
3. Adjust the controls; they are live.
4. Press **Export humanized WAV** to render the loaded file with the current settings.

| Control | What it does |
|---|---|
| Preset | Source calibration (Lead Vox … Full Mix) that scales the safe amount of movement. |
| Loose | Size of the micro-timing displacement. |
| Organic | Amount of slow, natural drift. |
| Expr | Gentle level motion on the humanized layer. |
| Feel | Sluggish (0) ↔ neutral (0.5) ↔ rushed (1) timing bias. |
| Sense | How readily attacks pause the timing movement. |
| Release | How quickly movement returns after an attack (20–500 ms). |
| Mix | Dry/wet balance between the original stem and the humanized layer. |

## Build from source

Requirements: Windows, Windows PowerShell 5.1, and the .NET Framework 4.x C# compiler
(shipped with Windows). No external packages.

```powershell
powershell -ExecutionPolicy Bypass -File .\build\build.ps1
```

Outputs:

- `dist\portable\` — runnable app folder
- `dist\StemHumanize-1.2.0-portable.zip`
- `dist\StemHumanizeSetup-1.2.0.exe` — the installer

`build.ps1` writes `version.json` from `VERSION`, generates the icon, compiles
`launcher\StemHumanizeServer.cs`, stages the web app, then compiles
`installer\Installer.cs` with the payload embedded.

## Project layout

```
index.html               UI
main.js                  wiring, source handling, offline WAV export
humanize-processor.js    AudioWorklet DSP
version.json             version/build/commit shown in the UI
VERSION / CHANGELOG.md   release metadata
STATUS.md                current state + next steps (read this before continuing)
launcher/                native localhost server + tray app (C#)
installer/               self-contained Windows installer (C#)
build/                   build script, icon generator, dev server
```

## Notes

- Export renders the currently loaded file. For mic input, record first (not implemented yet).
- The DSP is a real-time approximation of the original graph definition (linked transient
  detection → bounded variable micro-delay → expression motion → dry/wet).
- Mic and file are mutually exclusive; switching sources disconnects the previous one.
