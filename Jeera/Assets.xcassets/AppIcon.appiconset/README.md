This repo intentionally avoids committing binary icon assets in this folder
because the current PR pipeline rejects binary files.

To add the app icon locally before shipping:
1. Place a `1024x1024` PNG file named `AppIcon-1024.png` in this folder.
2. Add `"filename": "AppIcon-1024.png"` to `Contents.json` for the universal iOS entry.
3. Build/archive from Xcode with the icon present.
