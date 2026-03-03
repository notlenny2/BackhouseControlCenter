# macOS Apple Silicon Deployment

This guide packages Backhouse Control Center as a native macOS installer (`.pkg`) that installs a `launchd` service and starts automatically after reboot.

## What the package installs

- App files: `/opt/backhouse-control-center`
- Service plist: `/Library/LaunchDaemons/com.backhouse.controlcenter.plist`
- Logs:
  - `/var/log/backhouse-controlcenter.log`
  - `/var/log/backhouse-controlcenter.error.log`

## Prerequisites (on target/build Mac)

1. Apple Silicon Mac (M1/M2/M3).
2. Node.js installed and available in one of:
   - `/opt/homebrew/bin/node`
   - `/usr/local/bin/node`
3. FFmpeg installed:
   - `brew install ffmpeg`

## Build the macOS package

Run on a Mac in the repo root:

```bash
cd packaging/macos
chmod +x build-macos-pkg.sh
./build-macos-pkg.sh
```

Optional explicit version:

```bash
./build-macos-pkg.sh 1.0.0
```

Output package:

- `packaging/macos/out/BackhouseControlCenter-arm64.pkg`

## Install on a Mac

```bash
sudo installer -pkg packaging/macos/out/BackhouseControlCenter-arm64.pkg -target /
```

The postinstall script loads and starts:

- `com.backhouse.controlcenter`

## Verify service status

```bash
sudo launchctl print system/com.backhouse.controlcenter | head -n 40
sudo launchctl list | grep backhouse
```

## Restart service after config/code updates

```bash
sudo launchctl kickstart -k system/com.backhouse.controlcenter
```

## View logs

```bash
tail -f /var/log/backhouse-controlcenter.log
tail -f /var/log/backhouse-controlcenter.error.log
```

## Uninstall

```bash
sudo /opt/backhouse-control-center/uninstall.sh
```

## Notes

- Browser auto-open is disabled in daemon mode via `BHP_OPEN_BROWSER=0`.
- Service runner auto-detects `ffmpeg` from `PATH` and exports `FFMPEG_PATH`.
- Default port is `3000` (set in the launchd plist).
