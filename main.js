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
            const wikipediaData = await this.fetchWikipediaData(trimmedName);
            const lastFmData = await this.fetchLastFmArtistData(trimmedName);
            const wikidataImageUrl = await this.fetchWikidataImageFromMusicBrainz(musicBrainzArtist.id);
            const relatedArtists = await this.fetchLastFmSimilarArtists(trimmedName);

            await this.createArtistNote({
                queryName: trimmedName,
                musicBrainzArtist,
                musicBrainzGenres,
                wikipediaData,
                lastFmData,
                wikidataImageUrl,
                relatedArtists,
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
                    matchScore += 10000;
                } else if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) {
                    matchScore += 1000;
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

    async fetchWikipediaData(artistName) {
        const candidates = [
            artistName,
            artistName.replace(/_/g, " "),
        ];

        for (const candidate of candidates) {
            try {
                const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidate)}`;
                const response = await fetch(summaryUrl, {
                    headers: { Accept: "application/json" },
                });

                if (!response.ok) continue;

                const data = await response.json();

                if (data?.type === "disambiguation") continue;

                const returnedTitle = data?.title || "";
                const normQuery = this.normalizeName(artistName);
                const normTitle = this.normalizeName(returnedTitle);
                const normBaseTitle = this.normalizeName(returnedTitle.replace(/\s*\([^)]*\)\s*$/, ""));

                if (normTitle !== normQuery && normBaseTitle !== normQuery) {
                    continue;
                }

                return {
                    title: returnedTitle,
                    url: data?.content_urls?.desktop?.page || "",
                    extract: data?.extract || "",
                    imageUrl: data?.thumbnail?.source || "",
                };
            } catch (error) {
                console.error("Wikipedia summary lookup failed", error);
            }
        }

        return null;
    }

    async fetchLastFmArtistData(artistName) {
        const apiKey = (this.settings.lastFmApiKey || "").trim();
        if (!apiKey) return null;

        try {
            const infoUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artistName)}&api_key=${encodeURIComponent(apiKey)}&format=json&autocorrect=0`;
            const infoResponse = await fetch(infoUrl, {
                headers: { Accept: "application/json" },
            });

            if (!infoResponse.ok) return null;

            const infoData = await infoResponse.json();
            const artist = infoData?.artist || null;
            if (!artist) return null;

            const returnedName = artist?.name || "";
            if (this.normalizeName(returnedName) !== this.normalizeName(artistName)) {
                return null;
            }

            const tags = Array.isArray(artist?.tags?.tag)
                ? artist.tags.tag.map((tag) => tag?.name).filter(Boolean)
                : [];

            const rawImageUrl = this.extractLastFmImageUrl(artist?.image);
            const imageUrl = this.isUsableLastFmImage(rawImageUrl) ? rawImageUrl : "";

            const bio = this.cleanLastFmBio(artist?.bio?.summary || "");

            return {
                name: returnedName,
                url: artist?.url || `https://www.last.fm/music/${encodeURIComponent(artistName).replace(/%20/g, "+")}`,
                tags,
                imageUrl,
                bio,
            };
        } catch (error) {
            console.error("Last.fm lookup failed", error);
            return null;
        }
    }

    async fetchLastFmSimilarArtists(artistName) {
        const apiKey = (this.settings.lastFmApiKey || "").trim();
        if (!apiKey) return [];

        try {
            const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(artistName)}&api_key=${encodeURIComponent(apiKey)}&format=json&autocorrect=0&limit=10`;
            const response = await fetch(url, {
                headers: { Accept: "application/json" },
            });

            if (!response.ok) return [];

            const data = await response.json();
            const similarArtists = data?.similarartists?.artist;

            if (!Array.isArray(similarArtists)) return [];

            const names = similarArtists
                .map((artist) => artist?.name)
                .filter(Boolean)
                .map((name) => name.trim());

            return [...new Set(names)];
        } catch (error) {
            console.error("Last.fm similar artists lookup failed", error);
            return [];
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

    isUsableLastFmImage(url) {
        if (!url) return false;

        const lowered = url.toLowerCase();

        const badPatterns = [
            "2a96cbd8b46e442fc41c2b86b821562f",
            "4128a6eb29f94943c9d206c08e625904",
            "/noimage/",
            "placeholder",
            "default_album",
            "default_user",
            "default_artist",
            "imageholder",
            "missing",
            "empty_avatar",
            "avatar170s/",
            "gif",
        ];

        if (badPatterns.some((pattern) => lowered.includes(pattern))) {
            return false;
        }

        return lowered.startsWith("http://") || lowered.startsWith("https://");
    }

    cleanLastFmBio(bio) {
        if (!bio) return "";

        let cleaned = bio;
        cleaned = cleaned.replace(/<a\b[^>]*>.*?<\/a>/gi, "");
        cleaned = cleaned.replace(/<[^>]+>/g, "");
        cleaned = cleaned.replace(/\s*Read more on Last\.fm\s*\.?/gi, "");
        cleaned = cleaned.replace(/\s+/g, " ").trim();

        return cleaned;
    }

    async fetchWikidataImageFromMusicBrainz(artistId) {
        if (!artistId) return "";

        try {
            const mbUrl = `https://musicbrainz.org/ws/2/artist/${artistId}?inc=url-rels&fmt=json`;
            const mbResponse = await fetch(mbUrl, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": this.settings.musicBrainzUserAgent,
                },
            });

            if (!mbResponse.ok) return "";

            const mbData = await mbResponse.json();
            const relations = Array.isArray(mbData?.relations) ? mbData.relations : [];

            const wikidataRelation = relations.find((rel) => {
                const resource = rel?.url?.resource || "";
                return rel?.type === "wikidata" && resource.includes("wikidata.org/wiki/");
            });

            if (!wikidataRelation?.url?.resource) return "";

            const wikidataUrl = wikidataRelation.url.resource;
            const entityId = wikidataUrl.split("/").pop();
            if (!entityId) return "";

            const wikidataApiUrl = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(entityId)}.json`;
            const wikidataResponse = await fetch(wikidataApiUrl, {
                headers: { Accept: "application/json" },
            });

            if (!wikidataResponse.ok) return "";

            const wikidataData = await wikidataResponse.json();
            const entity = wikidataData?.entities?.[entityId];
            const imageClaim = entity?.claims?.P18?.[0];
            const fileName = imageClaim?.mainsnak?.datavalue?.value;

            if (!fileName || typeof fileName !== "string") return "";

            return await this.resolveCommonsImageUrl(fileName);
        } catch (error) {
            console.error("Wikidata image lookup failed", error);
            return "";
        }
    }

    async resolveCommonsImageUrl(fileName) {
        try {
            const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(`File:${fileName}`)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
            const response = await fetch(commonsUrl, {
                headers: { Accept: "application/json" },
            });

            if (!response.ok) return "";

            const data = await response.json();
            const pages = data?.query?.pages || {};
            const firstPage = Object.values(pages)[0];
            const imageInfo = firstPage?.imageinfo?.[0];

            return imageInfo?.url || "";
        } catch (error) {
            console.error("Commons image resolution failed", error);
            return "";
        }
    }

    async createArtistNote({ queryName, musicBrainzArtist, musicBrainzGenres, wikipediaData, lastFmData, wikidataImageUrl, relatedArtists }) {
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

        const relatedArtistsYaml = Array.isArray(relatedArtists) && relatedArtists.length
            ? `relatedArtists:\n${relatedArtists.map((artist) => `  - ${artist}`).join("\n")}`
            : "";

        const frontmatterLines = [
            "---",
            musicbrainzId ? `musicbrainzId: ${this.escapeYamlValue(musicbrainzId)}` : "",
            musicbrainzUrl ? `musicbrainzUrl: ${this.escapeYamlValue(musicbrainzUrl)}` : "",
            lastfmUrl ? `lastfmUrl: ${this.escapeYamlValue(lastfmUrl)}` : "",
            wikipediaUrl ? `wikipediaUrl: ${this.escapeYamlValue(wikipediaUrl)}` : "",
            `appleMusicSearchUrl: ${this.escapeYamlValue(appleMusicSearchUrl)}`,
            genresYaml,
            relatedArtistsYaml,
            "---",
        ].filter(Boolean);

        const bodyParts = [];

        const imageUrl = wikipediaData?.imageUrl || wikidataImageUrl || lastFmData?.imageUrl || "";
        if (imageUrl) {
            bodyParts.push(`![image](${imageUrl})`);
        }

        if (wikipediaData?.extract) {
            bodyParts.push(wikipediaData.extract.trim());
        } else if (lastFmData?.bio) {
            bodyParts.push(lastFmData.bio);
        }

        const content = `${frontmatterLines.join("\n")}\n\n${bodyParts.join("\n\n")}`.trim() + "\n";

        const existing = this.app.vault.getAbstractFileByPath(filePath);
        if (existing) {
            await this.app.vault.modify(existing, content);
            new Notice(`Updated note: ${filePath}`);
        } else {
            await this.app.vault.create(filePath, content);
            new Notice(`Created note: ${filePath}`);
        }
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
        this.settings = Object.assign(
            {
                musicBrainzUserAgent: "ObsidianArtistLookupPlugin/1.0.0 ( https://github.com/jkishner/spotify-artist )",
                lastFmApiKey: "",
                appleStorefront: "us",
                savePath: "",
            },
            await this.loadData()
        );
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

class ArtistLookupSettingsTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("p", {
            text: "This plugin uses MusicBrainz for artist lookup and genres, Wikipedia for primary image and bio, Wikidata for image fallback, Last.fm for backup tags/bio/image and related artists, and generates an Apple Music search URL.",
        });

        new Setting(containerEl)
            .setName("Last.fm API Key")
            .setDesc("Optional. Used for backup tags, fallback bio, backup image, and related artists.")
            .addText((text) =>
                text.setValue(this.plugin.settings.lastFmApiKey || "").onChange(async (value) => {
                    this.plugin.settings.lastFmApiKey = value.trim();
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Apple Storefront")
            .setDesc("Used when generating the Apple Music search URL, for example us, gb, or ca.")
            .addText((text) =>
                text
                    .setPlaceholder("us")
                    .setValue(this.plugin.settings.appleStorefront || "us")
                    .onChange(async (value) => {
                        this.plugin.settings.appleStorefront = value.trim() || "us";
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Save Path")
            .setDesc("Relative path where artist notes should be saved. Leave blank for the vault root.")
            .addText((text) =>
                text.setValue(this.plugin.settings.savePath || "").onChange(async (value) => {
                    this.plugin.settings.savePath = value.trim();
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("MusicBrainz User-Agent")
            .setDesc("Optional but recommended when making requests to MusicBrainz.")
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.musicBrainzUserAgent || "")
                    .onChange(async (value) => {
                        this.plugin.settings.musicBrainzUserAgent =
                            value.trim() || "ObsidianArtistLookupPlugin/1.0.0 ( https://github.com/jkishner/spotify-artist )";
                        await this.plugin.saveSettings();
                    })
            );
    }
}

module.exports = ArtistLookupPlugin;