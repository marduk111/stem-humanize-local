# Changelog

All notable changes to Stem Humanize. Versions follow `MAJOR.MINOR.PATCH`.

## 1.3.0 — 2026-11-03

### Added
- Guided six-step workflow: Load & listen, Instrument preset, Timing feel,
  Transient protection, Blend & expression, Check & export. Steps are chosen one at a time
  from the dropdown (or Back/Next), with a progress bar; only the current step is shown.
- Step-specific guidance and live readouts: preset movement ceiling and best use, timing
  displacement, attack-protection meters from the audio engine, and an artifact-risk
  estimate.
- Source panel with waveform and playhead, Play / Pause / Restart / Loop, and an output
  level meter.
- Header A/B button to compare the processed blend against the untouched stem without
  losing settings.
- "Apply recommended defaults" action.
- Live meter messages from the AudioWorklet (movement allowed, attacks protected).
- Source-file checks: peak level, clipping, sample rate, lossy format, very quiet input,
  and long-file warning.

### Changed
- New conservative starting point for the least audible degradation: Lead Vox preset,
  Loose 0.42, Organic 0.35, Expr 0.15, Sense 0.50, Release 100 ms, Mix 0.35. That keeps
  timing movement near 0.15 ms, protects attacks, and uses a low blend. This is a safe
  baseline for A/B comparison, not a guarantee about any detection system.
- Full UI redesign: clearer hierarchy, step cards, consistent controls, accessible labels.
- The risk number is now explicitly labelled an estimate derived from settings, not an
  analysis of the rendered audio.

### Fixed
- Changing Mix while A/B bypass is active is now remembered when switching back to the
  processed signal.

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
