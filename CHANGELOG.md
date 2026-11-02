# Changelog

All notable changes to Stem Humanize. Versions follow `MAJOR.MINOR.PATCH`.

## 1.2.0 — 2026-11-03

### Added
- Windows installer `StemHumanizeSetup-1.2.0.exe` (no prerequisites, installs to
  `%LOCALAPPDATA%\StemHumanize`, Desktop + Start Menu shortcuts, uninstall entry in
  Apps & Features).
- Native `StemHumanizeServer.exe` launcher: serves the app on a free localhost port,
  opens the default browser, and stays in the system tray (Open / Copy link / Changelog /
  About / Exit).
- One-click launcher `Start Stem Humanize.cmd` for running from the repo.
- Version surfaced in the UI badge, page title, tray tooltip, `/api/info` endpoint,
  installer, and file properties.
- "Version & release notes" section inside the app.
- `STATUS.md` describing the current build so development can continue from it.

### Changed
- Export is now wrapped in error handling, disables the button while rendering, and
  reports success/failure in the status line.
- Loading a file or enabling the mic now disconnects the other source instead of summing
  them.
- Added "Stop source" and clearer source/transport states.
- Sliders show live numeric values.

### Fixed
- Export could fail silently when worklet parameters were unavailable.
- Immediate `URL.revokeObjectURL` after download could break the save in some browsers.

## 1.1.1 — 2026-11-02

### Fixed
- Added `parameterDescriptors` to the AudioWorklet so parameters exist for both realtime
  playback and offline export.
- Guarded parameter access during export.

## 1.1.0 — 2026-11-02

### Added
- Offline WAV export of the processed stem (`<name>-humanized.wav`).

## 1.0.0 — 2026-11-02

### Added
- Initial browser implementation of the Stem Humanize effect: transient-aware modulated
  micro-delay, expression motion, dry/wet mix, instrument presets.
- Audio file and microphone input.
