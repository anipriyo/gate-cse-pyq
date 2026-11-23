#!/bin/zsh
# Builds "~/Applications/GATE PYQ.app": a launcher for app/gate_app.py (shows up in Launchpad and Spotlight).
# Rebuild after moving this workspace. Code changes in site/ or app/ need no rebuild.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HOME/Applications/GATE PYQ.app"
PY="$HOME/.venvs/analysis/bin/python"
[ -f "$ROOT/app/GatePYQ.icns" ] || "$PY" "$ROOT/app/make_icon.py"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$ROOT/app/GatePYQ.icns" "$APP/Contents/Resources/GatePYQ.icns"
cat > "$APP/Contents/Info.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>GATE PYQ</string>
<key>CFBundleDisplayName</key><string>GATE PYQ</string>
<key>CFBundleIdentifier</key><string>local.manda.gate-pyq</string>
<key>CFBundleExecutable</key><string>gate-pyq</string>
<key>CFBundleIconFile</key><string>GatePYQ</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSApplicationCategoryType</key><string>public.app-category.education</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PL
cat > "$APP/Contents/MacOS/gate-pyq" <<SH
#!/bin/zsh
export PATH=/opt/homebrew/bin:/usr/local/bin:\$PATH
exec "$PY" "$ROOT/app/gate_app.py" >> "$ROOT/app/app.log" 2>&1
SH
chmod +x "$APP/Contents/MacOS/gate-pyq"
touch "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" 2>/dev/null || true
echo "Built $APP"
