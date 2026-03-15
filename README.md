# Spotify Artist Lookup Plugin for Obsidian

## Overview
The **Spotify Artist Lookup Plugin** allows Obsidian users to fetch artist data from Spotify and automatically create a structured note with relevant metadata, including genres, Spotify links, and images. 

## Features
- 🔍 **Search for any artist** from the command palette.
- 📄 **Creates a structured note** with:
  - Genres (listed properly in YAML frontmatter)
  - Spotify, Chosic, and EveryNoise profile links
  - Artist image
- 📂 **Custom save location**: Users can specify a folder where artist notes should be saved.

## Installation
1. **Download the plugin** or clone this repository.
2. Place the `spotify-artist-lookup` folder inside:
   ```plaintext
   <your-obsidian-vault>/.obsidian/plugins/
   ```
3. Restart Obsidian.
4. Go to **Settings → Community Plugins** and enable "Spotify Artist Lookup."

## Setup Instructions
To use this plugin, you need a **Spotify Developer Account** and an API key.

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in or sign up.
3. Click **Create an App** → Give it a name and description.
4. Copy your **Client ID** and **Client Secret** from the app settings.
5. Open **Obsidian Settings** → "Spotify Artist Lookup" → Paste your credentials.

## How to Use
1. Open the **Command Palette** (`Cmd + P` or `Ctrl + P`).
2. Search for **"Search Spotify Artist"** and select it.
3. Enter the name of an artist.
4. The plugin will fetch the data and attempt to create a new note in your chosen folder.

## Example Output
```yaml
---
genres:
  - progressive rock
  - symphonic rock
spotifyUrl: https://open.spotify.com/artist/0G7KI9I5BApiXc5Sqpyil9
everynoiseUrl: https://everynoise.com/artistprofile.cgi?id=0G7KI9I5BApiXc5Sqpyil9
chosicUrl: https://www.chosic.com/artist/progressive-rock/0G7KI9I5BApiXc5Sqpyil9/
---

![image](https://i.scdn.co/image/xyz)
```

## Handling Duplicate Files
- **Currently, if a note with the same name already exists, the plugin will fail to create a new file.**
- **Merging data into existing files is not yet implemented** (see roadmap).

## Roadmap / Future Enhancements
- [ ] Implement merging metadata into existing notes instead of creating duplicates.
- [ ] Implement logic to append a number to duplicate filenames instead of failing.

## Contributing
Pull requests are welcome! Feel free to fork this project and submit improvements.

## License
This project is licensed under the **MIT License**.

