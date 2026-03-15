const { Plugin, PluginSettingTab, Setting, Notice, Modal } = require("obsidian");

class ArtistLookupPlugin extends Plugin {
async onload() {
await this.loadSettings();
    this.addCommand({
        id: "search-music-artist",
        name: "Search Music Artist",
        callback: () => this.searchArtist(),
    });

    this.addSettingTab(new ArtistLookupSettingsTab(this.app, this));
    console.log("Artist Lookup Plugin Loaded");
}

async searchArtist() {
    new TextInputModal(this.app, "Enter artist name:", async (artistName) => {
        const trimmedName = (artistName || "").trim();
        if (!trimmedName) {
            new Notice("Artist search canceled.");
            return;
        }

        const musicBrainzArtist = await this.fetchMusicBrainzArtist(trimmedName);
        if (!musicBrainzArtist) {
            new Notice("Artist not found.");
            return;
        }

        const musicBrainzGenres = await this.fetchMusicBrainzGenres(musicBrainzArtist.id);
        const lastFmData = await this.fetchLastFmArtistData(musicBrainzArtist.name || trimmedName);
        const wikipediaData = await this.fetchWikipediaData(musicBrainzArtist.name || trimmedName);

        await this.createArtistNote({
            queryName: trimmedName,
            musicBrainzArtist,
            musicBrainzGenres,
            lastFmData,
            wikipediaData,
        });
    }).open();
}

async fetchMusicBrainzArtist(artistName) {
    try {
        const url = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:${artistName}`)}&fmt=json&limit=10`;
        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
                "User-Agent": this.settings.musicBrainzUserAgent,
            },
        });

        if (!response.ok) {
            new Notice("Error retrieving MusicBrainz artist data.");
            return null;
        }

        const data = await response.json();
        const artists = Array.isArray(data?.artists) ? data.artists : [];
        if (!artists.length) return null;

        const normalizedQuery = this.normalizeName(artistName);

        const scored = artists.map((artist) => {
            const normalizedName = this.normalizeName(artist.name || "");
            let matchScore = 0;

            if (normalizedName === normalizedQuery) {
                matchScore += 1000;
            } else if (normalizedName.includes(normalizedQuery)) {
                matchScore += 500;
            }

            matchScore += Number(artist.score || 0);
            return { artist, matchScore };
        });

        scored.sort((a, b) => b.matchScore - a.matchScore);
        return scored[0].artist;
    } catch (error) {
        console.error("MusicBrainz artist lookup failed", error);
        new Notice("MusicBrainz artist lookup failed.");
        return null;
    }
}

async fetchMusicBrainzGenres(artistId) {
    if (!artistId) return [];

    try {
        const url = `https://musicbrainz.org/ws/2/artist/${artistId}?inc=genres&fmt=json`;
        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
                "User-Agent": this.settings.musicBrainzUserAgent,
            },
        });

        if (!response.ok) return [];

        const data = await response.json();
        return Array.isArray(data?.genres)
            ? data.genres
                .slice()
                .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
                .map((genre) => genre.name)
                .filter(Boolean)
            : [];
    } catch (error) {
        console.error("MusicBrainz genre lookup failed", error);
        return [];
    }
}

async fetchLastFmArtistData(artistName) {
    const apiKey = (this.settings.lastFmApiKey || "").trim();
    if (!apiKey) return null;

    try {
        const infoUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artistName)}&api_key=${encodeURIComponent(apiKey)}&format=json&autocorrect=1`;
        const infoResponse = await fetch(infoUrl, {
            headers: { Accept: "application/json" },
        });

        if (!infoResponse.ok) return null;

        const infoData = await infoResponse.json();
        const artist = infoData?.artist || null;

        const tags = Array.isArray(artist?.tags?.tag)
            ? artist.tags.tag.map((tag) => tag?.name).filter(Boolean)
            : [];

        const rawImageUrl = this.extractLastFmImageUrl(artist?.image);
        const imageUrl = this.isLikelyPlaceholderImage(rawImageUrl) ? "" : rawImageUrl;

        return {
            name: artist?.name || artistName,
            url: artist?.url || `https://www.last.fm/music/${encodeURIComponent(artistName).replace(/%20/g, "+")}`,
            tags,
            imageUrl,
        };
    } catch (error) {
        console.error("Last.fm lookup failed", error);
        return null;
    }
}

extractLastFmImageUrl(images) {
    if (!Array.isArray(images)) return "";

    const preferredOrder = ["mega", "extralarge", "large", "medium", "small"];
    for (const size of preferredOrder) {
        const match = images.find((image) => image?.size === size && image?.["#text"]);
        if (match?.["#text"]) return match["#text"];
    }

    const fallback = images.find((image) => image?.["#text"]);
    return fallback?.["#text"] || "";
}

isLikelyPlaceholderImage(url) {
    if (!url) return true;

    const lowered = url.toLowerCase();
    return [
        "2a96cbd8b46e442fc41c2b86b821562f",
        "/noimage/",
        "placeholder",
        "default_album",
        "default_user",
        "default_artist"
    ].some((pattern) => lowered.includes(pattern));
}

async fetchWikipediaData(artistName) {
    try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`intitle:${artistName}`)}&utf8=1&format=json&origin=*`;
        const searchResponse = await fetch(searchUrl, {
            headers: { Accept: "application/json" },
        });

        if (!searchResponse.ok) return null;

        const searchData = await searchResponse.json();
        const results = Array.isArray(searchData?.query?.search) ? searchData.query.search : [];
        if (!results.length) return null;

        const normalizedQuery = this.normalizeName(artistName);
        const scored = results.map((result) => {
            const title = result?.title || "";
            const snippet = (result?.snippet || "").replace(/<[^>]+>/g, " ");
            const normalizedTitle = this.normalizeName(title);
            const normalizedSnippet = this.normalizeName(snippet);

            let matchScore = 0;
            if (normalizedTitle === normalizedQuery) {
                matchScore += 1000;
            } else if (normalizedTitle.includes(normalizedQuery)) {
                matchScore += 300;
            }

            if (normalizedSnippet.includes(normalizedQuery)) {
                matchScore += 200;
            }

            if (normalizedTitle.includes("band")) matchScore += 50;
            if (normalizedSnippet.includes("band")) matchScore += 25;
            if (normalizedSnippet.includes("musician") || normalizedSnippet.includes("singer") || normalizedSnippet.includes("songwriter")) {
                matchScore += 10;
            }

            return { result, matchScore, normalizedTitle };
        });

        scored.sort((a, b) => b.matchScore - a.matchScore);
        const best = scored[0];
        if (!best) return null;

        const highConfidence = best.normalizedTitle === normalizedQuery || best.matchScore >= 700;
        if (!highConfidence) return null;

        const bestTitle = best.result.title;
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestTitle)}`;
        const summaryResponse = await fetch(summaryUrl, {
            headers: { Accept: "application/json" },
        });

        if (!summaryResponse.ok) {
            return {
                title: bestTitle,
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(bestTitle.replace(/ /g, "_"))}`,
                extract: "",
                imageUrl: "",
            };
        }

        const summaryData = await summaryResponse.json();
        return {
            title: summaryData?.title || bestTitle,
            url: summaryData?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(bestTitle.replace(/ /g, "_"))}`,
            extract: summaryData?.extract || "",
            imageUrl: summaryData?.thumbnail?.source || "",
        };
    } catch (error) {
        console.error("Wikipedia lookup failed", error);
        return null;
    }
}

async createArtistNote({ queryName, musicBrainzArtist, musicBrainzGenres, lastFmData, wikipediaData }) {
    const noteTitle = musicBrainzArtist?.name || queryName;
    const safeSavePath = (this.settings.savePath || "").trim();
    const filePath = safeSavePath ? `${safeSavePath}/${noteTitle}.md` : `${noteTitle}.md`;

    const musicbrainzId = musicBrainzArtist?.id || "";
    const musicbrainzUrl = musicbrainzId ? `https://musicbrainz.org/artist/${musicbrainzId}` : "";
    const lastfmUrl = lastFmData?.url || "";
    const wikipediaUrl = wikipediaData?.url || "";
    const appleMusicSearchUrl = `https://music.apple.com/${encodeURIComponent(this.settings.appleStorefront || "us")}/search?term=${encodeURIComponent(noteTitle)}`;

    const genres = musicBrainzGenres.length ? musicBrainzGenres : (lastFmData?.tags || []);
    const uniqueGenres = [...new Set(genres.map((genre) => (genre || "").trim()).filter(Boolean))];
    const genresYaml = uniqueGenres.length
        ? `genres:\n${uniqueGenres.map((genre) => `  - ${genre}`).join("\n")}`
        : "";

    const frontmatterLines = [
        "---",
        musicbrainzId ? `musicbrainzId: ${this.escapeYamlValue(musicbrainzId)}` : "",
        musicbrainzUrl ? `musicbrainzUrl: ${this.escapeYamlValue(musicbrainzUrl)}` : "",
        lastfmUrl ? `lastfmUrl: ${this.escapeYamlValue(lastfmUrl)}` : "",
        wikipediaUrl ? `wikipediaUrl: ${this.escapeYamlValue(wikipediaUrl)}` : "",
        `appleMusicSearchUrl: ${this.escapeYamlValue(appleMusicSearchUrl)}`,
        genresYaml,
        "---",
    ].filter(Boolean);

    const bodyParts = [];
    const imageUrl = lastFmData?.imageUrl || wikipediaData?.imageUrl || "";
    if (imageUrl) {
        bodyParts.push(`![image](${imageUrl})`);
    }

    if (wikipediaData?.extract) {
        bodyParts.push(wikipediaData.extract.trim());
    }

    const content = `${frontmatterLines.join("\n")}\n\n${bodyParts.join("\n\n")}`.trim() + "\n";

    await this.app.vault.create(filePath, content);
    new Notice(`Created note: ${filePath}`);
}

normalizeName(value) {
    return (value || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[’'`]/g, "")
        .replace(/[^a-z0-9&+ ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

escapeYamlValue(value) {
    return JSON.stringify(String(value ?? ""));
}

async loadSettings() {
    this.settings = Object.assign({
        musicBrainzUserAgent: "ObsidianArtistLookupPlugin/1.0.0 ( https://github.com/jkishner/spotify-artist )",
        lastFmApiKey: "",
        appleStorefront: "us",
        savePath: "",
    }, await this.loadData());
}

async saveSettings() {
    await this.saveData(this.settings);
}
}

class TextInputModal extends Modal {
constructor(app, title, callback) {
super(app);
this.title = title;
this.callback = callback;
}
onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.title });

    const input = contentEl.createEl("input", { type: "text" });
    input.style.width = "100%";

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            this.callback(input.value);
            this.close();
        }
    });

    const submitBtn = contentEl.createEl("button", { text: "Search" });
    submitBtn.style.marginTop = "10px";
    submitBtn.addEventListener("click", () => {
        this.callback(input.value);
        this.close();
    });

    input.focus();
}

onClose() {
    this.contentEl.empty();
}
}

module.exports = ArtistLookupPlugin;