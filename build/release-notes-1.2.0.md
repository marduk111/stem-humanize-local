Windows installer for Stem Humanize 1.2.0.

**Install:** download `StemHumanizeSetup-1.2.0.exe`, double-click, confirm. It installs to your local app data folder, adds a Desktop shortcut and a Start Menu entry, and opens the app. No Node.js, Python or other runtime is needed.

The installer is not code-signed, so Windows SmartScreen may show a warning — choose **More info** then **Run anyway**.

**Also included:** `StemHumanize-1.2.0-portable.zip` — extract anywhere and run `StemHumanizeServer.exe`.

## What's in 1.2.0

- Self-contained Windows installer and portable build
- Native tray launcher (serves the app on localhost, opens the browser, Open / Copy link / Changelog / About / Exit)
- One-click `Start Stem Humanize.cmd` for running from the source folder
- Version shown in the app badge, page title, footer, and tray tooltip
- "Version & release notes" panel inside the app
- Safer export (error reporting, button state, delayed object URL cleanup)
- Source switching: loading a file or the mic now disconnects the other source
- New "Stop source" control and live slider values

See `CHANGELOG.md` and `STATUS.md` in the repo for full details and the current state of the project.
