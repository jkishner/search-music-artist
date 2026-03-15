# Search Music Artist (Obsidian Plugin)

Create an Obsidian note for a musical artist by pulling data from
multiple music and knowledge APIs.

The plugin fetches artist metadata, genres, images, and a short
biography, then generates a structured note with YAML frontmatter that
can be used with Dataview or other Obsidian workflows.

This plugin is designed especially for users who organize **artist pages
inside an Obsidian vault**.

------------------------------------------------------------------------

# Features

When you run **Search Music Artist**, the plugin:

1.  Prompts for an artist name\
2.  Looks up the artist in **MusicBrainz**\
3.  Fetches genres from MusicBrainz\
4.  Retrieves a biography and image from **Wikipedia** (if available)\
5.  Falls back to **Last.fm** for tags, image, or bio when needed\
6.  Uses **Wikidata / Wikimedia Commons** as an additional image source\
7.  Generates an **Apple Music search link** for the artist

It then creates (or updates) an Obsidian note containing:

-   YAML metadata
-   artist image
-   artist biography

------------------------------------------------------------------------

# Example Output

Example note for an artist:

``` markdown
---
musicbrainzId: "f4a31f0f-08f0-4c40-9f67-8b66e8d4d0b9"
musicbrainzUrl: "https://musicbrainz.org/artist/f4a31f0f-08f0-4c40-9f67-8b66e8d4d0b9"
lastfmUrl: "https://www.last.fm/music/Rachel+Baiman"
wikipediaUrl: "https://en.wikipedia.org/wiki/Rachel_Baiman"
appleMusicSearchUrl: "https://music.apple.com/us/search?term=Rachel%20Baiman"
genres:
  - bluegrass
  - americana
  - folk
---

![image](https://upload.wikimedia.org/...)

Rachel Baiman is an American fiddler, singer, and songwriter known for her work in bluegrass and Americana music...
```

------------------------------------------------------------------------

# Data Sources

This plugin combines several public APIs:

  Source                         Used For
  ------------------------------ ----------------------------------
  MusicBrainz                    Artist identification and genres
  Wikipedia                      Biography and primary image
  Wikidata / Wikimedia Commons   Image fallback
  Last.fm                        Backup tags, image, and bio
  Apple Music                    Search link generation

------------------------------------------------------------------------

# Settings

The plugin has a few optional settings:

### Last.fm API Key (optional)

Used for:

-   additional genre tags
-   backup bio
-   backup artist image

You can obtain a free API key here:

https://www.last.fm/api/account/create

------------------------------------------------------------------------

### Apple Storefront

Used when generating Apple Music search links.

Examples:

    us
    gb
    ca
    de

Default: `us`

------------------------------------------------------------------------

### Save Path

Optional folder where artist notes will be created.

Examples:

    Music/Artists
    Artists
    Music Library/Artists

Leave blank to save in the vault root.

------------------------------------------------------------------------

### MusicBrainz User Agent

MusicBrainz recommends including a user-agent string for API requests.

Default:

    ObsidianArtistLookupPlugin/1.0.0

------------------------------------------------------------------------

# Installation

### Manual Installation

1.  Download the latest release
2.  Copy these files into your vault:

```{=html}
<!-- -->
```
    .obsidian/plugins/search-music-artist/

Files required:

    main.js
    manifest.json
    styles.css (optional)

3.  Restart Obsidian
4.  Enable **Search Music Artist** in **Settings → Community Plugins**

------------------------------------------------------------------------

# Usage

Open the command palette:

    Cmd/Ctrl + P

Run:

    Search Music Artist

Enter an artist name and the plugin will generate the artist page.

If a note already exists, the plugin updates it.

------------------------------------------------------------------------

# Notes

-   Some APIs (especially Last.fm) return truncated biographies.
-   Images are pulled from Wikipedia, Wikidata, or Last.fm depending on
    availability.
-   Artist matching prioritizes exact matches to avoid incorrect
    Wikipedia pages.

------------------------------------------------------------------------

# Author

Jeffrey Kishner, vibe-coded with ChatGPT

https://github.com/jkishner
