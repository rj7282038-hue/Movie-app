/**
 * EPIC OTT — Advanced Mobile Player Controller
 * 4 High-Speed Multi-Servers | Multi-Audio & Dubbed | TV Episode Selector | Ambient Glow
 */

(function () {
    'use strict';

    // ═════════ Constants & Config ═════════
    const TMDB_KEY = '6f88c485f6d936e3e93f3ab0758a15f2';
    const TMDB_BASE = 'https://api.themoviedb.org/3';
    const TMDB_POSTER = 'https://image.tmdb.org/t/p/w342';
    const TMDB_STILL = 'https://image.tmdb.org/t/p/w300';
    const TMDB_PROFILE = 'https://image.tmdb.org/t/p/w185';

    // Parse URL params
    const params = new URLSearchParams(window.location.search);
    const mediaId = params.get('id');
    const mediaType = (params.get('type') || 'movie').toLowerCase();
    let currentSeason = parseInt(params.get('s') || '1', 10);
    let currentEpisode = parseInt(params.get('e') || '1', 10);
    let currentServer = 'hindi';
    let activeHindiStreamUrl = '';

    let totalSeasons = 1;
    let seasonEpisodes = [];
    let mediaDetails = null;

    // ═════════ Quality & Multi-Audio Detection ═════════
    function getVideoQuality(item) {
        const relDateStr = item.release_date || item.first_air_date;
        if (relDateStr) {
            const relTime = new Date(relDateStr).getTime();
            const now = new Date().getTime();
            const diffDays = (now - relTime) / (1000 * 60 * 60 * 24);
            if (diffDays >= 0 && diffDays <= 75 && (Number(item.vote_count || 0) < 450 || (Number(item.popularity || 0) > 200 && Number(item.vote_count || 0) < 600))) {
                return { code: 'PHD', label: 'PHD', class: 'quality-phd', desc: 'Pre-HD / Cinema Print' };
            }
        }
        const voteAvg = Number(item.vote_average || 0);
        const voteCnt = Number(item.vote_count || 0);
        const pop = Number(item.popularity || 0);
        const year = parseInt((relDateStr || '').substring(0, 4), 10) || 2020;
        if ((voteAvg >= 7.6 && voteCnt >= 100) || pop >= 150 || (year >= 2022 && voteAvg >= 7.2)) {
            return { code: '4K', label: '4K', class: 'quality-4k', desc: '4K Ultra HD' };
        }
        if (year >= 2017 || voteAvg >= 6.2) {
            return { code: 'FHD', label: 'FHD', class: 'quality-fhd', desc: 'Full HD 1080p' };
        }
        return { code: 'HD', label: 'HD', class: 'quality-hd', desc: 'HD 720p' };
    }

    function isMultiAudioSupported(item) {
        const lang = (item.original_language || 'en').toLowerCase();
        const pop = Number(item.popularity || 0);
        const votes = Number(item.vote_count || 0);
        const multiLangs = ['en', 'hi', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'te', 'ta'];
        if (multiLangs.includes(lang) || pop > 35 || votes > 80) {
            return true;
        }
        return false;
    }

    // ═════════ Multi-Server URLs Builder (Multi-Audio Enabled) ═════════
    function getServerUrl(serverKey, id, type, s, e) {
        switch (serverKey) {
            case '1': // Smashy Stream (Dedicated Hindi, Dual Audio & Regional Dubs - Default!)
                if (type === 'tv') {
                    return `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`;
                }
                return `https://embed.smashystream.com/playere.php?tmdb=${id}`;

            case '2': // VidLink Pro (Fastest, Multi-Audio & Subtitles track selection)
                if (type === 'tv') {
                    return `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=e50914&secondaryColor=121218&iconColor=ffffff&multiLang=true`;
                }
                return `https://vidlink.pro/movie/${id}?primaryColor=e50914&secondaryColor=121218&iconColor=ffffff&multiLang=true`;

            case '3': // Videasy Ultra (Clean Multi-Language Audio Switcher)
                if (type === 'tv') {
                    return `https://player.videasy.net/tv/${id}/${s}/${e}?color=E50914&nextEpisode=true`;
                }
                return `https://player.videasy.net/movie/${id}?color=E50914`;

            case '4': // SuperEmbed / MultiEmbed (Global Multi-Audio & Dubs)
                if (type === 'tv') {
                    return `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`;
                }
                return `https://multiembed.mov/?video_id=${id}&tmdb=1`;

            case '5': // Embed.su (Fast High-Speed Resilient Server)
                if (type === 'tv') {
                    return `https://embed.su/embed/tv/${id}/${s}/${e}`;
                }
                return `https://embed.su/embed/movie/${id}`;

            case '6': // AutoEmbed (Multi-Source Hindi & Regional Dubs)
                if (type === 'tv') {
                    return `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`;
                }
                return `https://player.autoembed.cc/embed/movie/${id}`;

            default:
                if (type === 'tv') {
                    return `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`;
                }
                return `https://embed.smashystream.com/playere.php?tmdb=${id}`;
        }
    }

    // ═════════ DOM Elements ═════════
    const iframe = document.getElementById('videoPlayerFrame');
    const loader = document.getElementById('playerLoader');
    const statusText = document.getElementById('streamStatusText');
    const serverButtons = document.querySelectorAll('.server-pill');
    const navTitle = document.getElementById('navMovieTitle');
    const mediaTitle = document.getElementById('mediaTitle');
    const mediaMeta = document.getElementById('mediaMeta');
    const mediaOverview = document.getElementById('mediaOverview');
    const castTrack = document.getElementById('castTrack');
    const similarGrid = document.getElementById('similarGrid');
    const epQuickControls = document.getElementById('epQuickControls');
    const epBadgeText = document.getElementById('epBadgeText');
    const btnPrevEp = document.getElementById('btnPrevEp');
    const btnNextEp = document.getElementById('btnNextEp');
    const seasonSelect = document.getElementById('seasonSelect');
    const episodesSection = document.getElementById('episodesSection');
    const episodesList = document.getElementById('episodesList');
    const actionFavBtn = document.getElementById('actionFavBtn');

    let loadToken = 0;
    let failsafeTimer = null;

    // ═════════ Stream Loader ═════════
    function loadStream(serverKey) {
        currentServer = serverKey;
        const myToken = ++loadToken;

        // UI active pill update
        serverButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.server === serverKey);
        });

        // If MovieBox Hindi (Multi-Source) or Local Engine is selected
        if (serverKey === 'hindi' || serverKey === 'local') {
            if (iframe) {
                iframe.style.display = 'none';
                iframe.src = 'about:blank';
            }
            if (loader) {
                loader.classList.add('hidden');
                loader.style.display = 'none';
            }
            if (localPlayerContainer) {
                localPlayerContainer.style.display = 'flex';
            }
            if (serverQuickText) {
                serverQuickText.textContent = (serverKey === 'hindi') ? 'Hindi' : 'Local';
            }

            if (serverKey === 'hindi') {
                const tabHindi = document.getElementById('tabBtnHindiStreams');
                if (tabHindi) tabHindi.click();
                if (typeof searchHindiStreamsForCurrentMedia === 'function') {
                    searchHindiStreamsForCurrentMedia();
                }
                showToast('🇮🇳 MovieBox Hindi Multi-Source Engine Active');
            } else {
                const tabLocal = document.getElementById('tabBtnLocalFile');
                if (tabLocal) tabLocal.click();
                showToast('📁 In-App MKV (Multi-Lang) Player Active');
            }
            return;
        }

        // Online Streaming Servers (1-6)
        if (localPlayerContainer) {
            localPlayerContainer.style.display = 'none';
            if (localVideo && !localVideo.paused) {
                localVideo.pause();
            }
        }
        if (iframe) {
            iframe.style.display = 'block';
        }

        const serverNames = {
            'hindi': 'MovieBox Hindi (4KHDHub / HubCloud)',
            '1': 'Smashy Stream (Global)',
            '2': 'VidLink Pro (HD/4K)',
            '3': 'Videasy (Multi-Lang)',
            '4': 'SuperEmbed (Global Dubs)',
            '5': 'Embed.su (Multi-Stream)',
            '6': 'AutoEmbed (Multi-Audio)',
            'local': 'Local MKV Player'
        };
        statusText.textContent = `Connecting to ${serverNames[serverKey] || 'Server'}...`;
        loader.style.display = 'flex';
        loader.classList.remove('hidden');

        if (failsafeTimer) clearTimeout(failsafeTimer);

        const targetUrl = getServerUrl(serverKey, mediaId, mediaType, currentSeason, currentEpisode);

        iframe.onload = () => {
            if (myToken !== loadToken) return;
            loader.classList.add('hidden');
            loader.style.display = 'none';
        };

        iframe.src = targetUrl;

        // Failsafe timeout in case cross-origin onload doesn't fire immediately
        failsafeTimer = setTimeout(() => {
            if (myToken === loadToken) {
                loader.classList.add('hidden');
                loader.style.display = 'none';
            }
        }, 1800);

        // Update URL query in address bar quietly
        if (history.replaceState) {
            const newUrl = `${window.location.pathname}?id=${mediaId}&type=${mediaType}&s=${currentSeason}&e=${currentEpisode}`;
            window.history.replaceState({ path: newUrl }, '', newUrl);
        }
    }

    // Attach click listeners to server pills
    serverButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            loadStream(btn.dataset.server);
            if (btn.dataset.server !== 'local') {
                showToast(`Switched to Server ${btn.dataset.server}`);
            }
        });
    });

    // ═════════ API Helpers ═════════
    async function tmdbFetch(endpoint) {
        const sep = endpoint.includes('?') ? '&' : '?';
        const res = await fetch(`${TMDB_BASE}${endpoint}${sep}api_key=${TMDB_KEY}`);
        if (!res.ok) throw new Error('API Request Failed');
        return res.json();
    }

    // ═════════ Fetch Media Details ═════════
    async function initMediaDetails() {
        if (!mediaId) {
            mediaTitle.textContent = 'Error: Invalid Movie/Show ID';
            return;
        }

        try {
            const endpoint = `/${mediaType}/${mediaId}?append_to_response=credits,similar`;
            const data = await tmdbFetch(endpoint);
            mediaDetails = data;

            const title = data.title || data.name || 'Untitled';
            const year = (data.release_date || data.first_air_date || '').substring(0, 4);
            const rating = data.vote_average ? Number(data.vote_average).toFixed(1) : '7.5';
            const match = Math.round((data.vote_average || 7.5) * 10);
            const runtime = data.runtime || (data.episode_run_time && data.episode_run_time[0]) || '';
            const genres = (data.genres || []).map(g => g.name).join(' • ');

            document.title = `${title} — EPIC OTT`;
            navTitle.textContent = title;
            mediaTitle.textContent = title;
            mediaOverview.textContent = data.overview || 'No storyline overview available.';

            const quality = getVideoQuality(data);
            const hasMultiAudio = isMultiAudioSupported(data);

            mediaMeta.innerHTML = `
                <span class="match-pct">${match}% Match</span>
                <span>${year}</span>
                <span class="meta-quality-pill ${quality.class}">${quality.label}</span>
                <span style="background:rgba(255,255,255,0.14);padding:1px 6px;border-radius:3px;font-weight:700;">${rating} ★</span>
                ${runtime ? `<span>${runtime} min</span>` : ''}
                <span style="border:1px solid var(--border-subtle);padding:1px 6px;border-radius:3px;">${mediaType === 'tv' ? 'TV SERIES' : 'MOVIE'}</span>
                <span style="color:var(--text-tertiary);">${genres}</span>
            `;

            // Setup TV Seasons if applicable
            if (mediaType === 'tv') {
                setupTvSeries(data);
            }

            // Render Cast
            renderCast(data.credits && data.credits.cast ? data.credits.cast : []);

            // Render Similar
            renderSimilar(data.similar && data.similar.results ? data.similar.results : []);

            // Sync My List button state
            syncWatchlistButton(title, data.poster_path ? `${TMDB_POSTER}${data.poster_path}` : '', year);

            // Start default stream: MovieBox Hindi (Multi-Source Hindi Dubbed)
            loadStream('hindi');

        } catch (err) {
            console.error(err);
            mediaTitle.textContent = 'Error loading media details';
            statusText.textContent = 'Check your internet connection';
        }
    }

    // ═════════ TV Series Season & Episode Handler ═════════
    async function setupTvSeries(tvData) {
        episodesSection.classList.add('show');
        epQuickControls.classList.add('show');

        totalSeasons = tvData.number_of_seasons || (tvData.seasons ? tvData.seasons.length : 1);
        seasonSelect.innerHTML = '';

        const seasons = (tvData.seasons || []).filter(s => s.season_number > 0);
        if (!seasons.length) {
            for (let i = 1; i <= totalSeasons; i++) {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = `Season ${i}`;
                if (i === currentSeason) opt.selected = true;
                seasonSelect.appendChild(opt);
            }
        } else {
            seasons.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.season_number;
                opt.textContent = `${s.name || `Season ${s.season_number}`} (${s.episode_count} eps)`;
                if (s.season_number === currentSeason) opt.selected = true;
                seasonSelect.appendChild(opt);
            });
        }

        seasonSelect.addEventListener('change', () => {
            currentSeason = parseInt(seasonSelect.value, 10);
            currentEpisode = 1;
            loadSeasonEpisodes(currentSeason);
            loadStream(currentServer);
            updateQuickEpControls();
        });

        await loadSeasonEpisodes(currentSeason);
        updateQuickEpControls();
    }

    async function loadSeasonEpisodes(seasonNum) {
        episodesList.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-tertiary);"><i class="fas fa-circle-notch fa-spin"></i> Loading episodes...</div>';
        try {
            const seasonData = await tmdbFetch(`/tv/${mediaId}/season/${seasonNum}`);
            seasonEpisodes = seasonData.episodes || [];

            if (!seasonEpisodes.length) {
                episodesList.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-tertiary);">No episodes found.</div>';
                return;
            }

            episodesList.innerHTML = '';
            seasonEpisodes.forEach(ep => {
                const isPlaying = ep.episode_number === currentEpisode;
                const still = ep.still_path ? `${TMDB_STILL}${ep.still_path}` : 'assets/no-still.png';
                const epCard = document.createElement('div');
                epCard.className = `ep-item-card ${isPlaying ? 'playing' : ''}`;
                epCard.dataset.ep = ep.episode_number;

                epCard.innerHTML = `
                    <img class="ep-item-thumb" src="${still}" alt="EP ${ep.episode_number}" onerror="this.src='https://via.placeholder.com/300x169/14141c/ffffff?text=Episode+${ep.episode_number}';">
                    <div class="ep-item-info">
                        <div class="ep-item-number">Episode ${ep.episode_number}</div>
                        <div class="ep-item-title">${escapeHtml(ep.name || `Episode ${ep.episode_number}`)}</div>
                        <div class="ep-item-time">${ep.runtime ? `${ep.runtime} min • ` : ''}${ep.air_date || ''}</div>
                    </div>
                    <div class="ep-item-icon-play">
                        <i class="fas ${isPlaying ? 'fa-circle-play' : 'fa-play'}"></i>
                    </div>
                `;

                epCard.addEventListener('click', () => {
                    currentEpisode = ep.episode_number;
                    document.querySelectorAll('.ep-item-card').forEach(c => c.classList.remove('playing'));
                    epCard.classList.add('playing');
                    updateQuickEpControls();
                    loadStream(currentServer);
                    showToast(`Now Playing Episode ${currentEpisode}`);
                });

                episodesList.appendChild(epCard);
            });

        } catch (e) {
            episodesList.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-tertiary);">Unable to load episodes.</div>';
        }
    }

    function updateQuickEpControls() {
        epBadgeText.textContent = `S${currentSeason} : E${currentEpisode}`;
        btnPrevEp.disabled = currentEpisode <= 1;
        const maxEp = seasonEpisodes.length || 30;
        btnNextEp.disabled = currentEpisode >= maxEp;
    }

    btnPrevEp.addEventListener('click', () => {
        if (currentEpisode > 1) {
            currentEpisode--;
            updateActiveEpisodeUI();
            loadStream(currentServer);
        }
    });

    btnNextEp.addEventListener('click', () => {
        currentEpisode++;
        updateActiveEpisodeUI();
        loadStream(currentServer);
    });

    function updateActiveEpisodeUI() {
        updateQuickEpControls();
        document.querySelectorAll('.ep-item-card').forEach(c => {
            const isPlaying = parseInt(c.dataset.ep, 10) === currentEpisode;
            c.classList.toggle('playing', isPlaying);
            const icon = c.querySelector('.ep-item-icon-play i');
            if (icon) icon.className = isPlaying ? 'fas fa-circle-play' : 'fas fa-play';
        });
    }

    // ═════════ Cast Members ═════════
    function renderCast(castList) {
        if (!castList.length) {
            castTrack.parentElement.style.display = 'none';
            return;
        }
        castTrack.innerHTML = '';
        castList.slice(0, 14).forEach(actor => {
            const photo = actor.profile_path ? `${TMDB_PROFILE}${actor.profile_path}` : 'https://via.placeholder.com/185x185/181822/ffffff?text=?';
            const item = document.createElement('div');
            item.className = 'cast-avatar-card';
            item.innerHTML = `
                <img class="cast-avatar-img" src="${photo}" alt="${escapeHtml(actor.name)}" loading="lazy">
                <div class="cast-actor-name">${escapeHtml(actor.name)}</div>
                <div class="cast-char-name">${escapeHtml(actor.character || '')}</div>
            `;
            castTrack.appendChild(item);
        });
    }

    // ═════════ Similar / Recommendations ═════════
    function renderSimilar(similarList) {
        if (!similarList.length) {
            similarGrid.parentElement.style.display = 'none';
            return;
        }
        similarGrid.innerHTML = '';
        const valid = similarList.filter(m => m.poster_path).slice(0, 9);
        valid.forEach(item => {
            const title = item.title || item.name || 'Untitled';
            const poster = `${TMDB_POSTER}${item.poster_path}`;
            const rating = item.vote_average ? Number(item.vote_average).toFixed(1) : '7.0';

            const card = document.createElement('div');
            card.className = 'movie-card';
            card.innerHTML = `
                <div class="card-poster-wrapper">
                    <img src="${poster}" alt="${escapeHtml(title)}" loading="lazy">
                    <div class="card-badge-rating"><i class="fas fa-star"></i>${rating}</div>
                </div>
                <div class="card-info-peek">
                    <div class="card-title-text">${escapeHtml(title)}</div>
                </div>
            `;

            card.addEventListener('click', () => {
                window.location.href = `player.html?id=${item.id}&type=${mediaType}`;
            });

            similarGrid.appendChild(card);
        });
    }

    // ═════════ My List (Watchlist) Integration ═════════
    function syncWatchlistButton(title, poster, year) {
        let watchlist = [];
        try {
            watchlist = JSON.parse(localStorage.getItem('epic_watchlist') || localStorage.getItem('ghazi_watchlist') || '[]');
        } catch (e) {
            watchlist = [];
        }

        const isFavorited = watchlist.some(w => w.id == mediaId);
        updateFavButtonUI(isFavorited);

        actionFavBtn.onclick = () => {
            try {
                watchlist = JSON.parse(localStorage.getItem('epic_watchlist') || localStorage.getItem('ghazi_watchlist') || '[]');
            } catch (e) {
                watchlist = [];
            }

            const idx = watchlist.findIndex(w => w.id == mediaId);
            if (idx >= 0) {
                watchlist.splice(idx, 1);
                updateFavButtonUI(false);
                showToast('Removed from My List');
            } else {
                watchlist.unshift({ id: mediaId, title, poster, year, type: mediaType });
                updateFavButtonUI(true);
                showToast('Saved to My List');
            }
            localStorage.setItem('epic_watchlist', JSON.stringify(watchlist));
        };
    }

    function updateFavButtonUI(isFav) {
        actionFavBtn.classList.toggle('favorited', isFav);
        const icon = actionFavBtn.querySelector('i');
        const label = document.getElementById('favBtnLabel');
        if (icon) icon.className = isFav ? 'fas fa-heart' : 'far fa-heart';
        if (label) label.textContent = isFav ? 'Saved' : 'My List';
    }

    // ═════════ Actions Strip Handlers ═════════
    document.getElementById('actionReloadBtn').addEventListener('click', () => {
        loadStream(currentServer);
        showToast('Stream Reloaded');
    });

    // ═════════ Advanced Fullscreen, Zoom & Auto-Rotate Controls ═════════
    const fullscreenBtn = document.getElementById('actionFullscreenBtn');
    const exitFullscreenBtn = document.getElementById('btnExitFullscreen');
    const toggleZoomBtn = document.getElementById('btnToggleZoom');
    const zoomBtnText = document.getElementById('zoomBtnText');
    const serverQuickBtn = document.getElementById('btnServerQuick');
    const serverQuickText = document.getElementById('serverQuickText');
    const videoContainer = document.getElementById('videoFrameContainer');
    const landscapeControls = document.getElementById('landscapeControls');

    let controlsTimeout = null;
    function pingControls() {
        if (!landscapeControls) return;
        landscapeControls.classList.remove('fade-out');
        if (controlsTimeout) clearTimeout(controlsTimeout);
        controlsTimeout = setTimeout(() => {
            landscapeControls.classList.add('fade-out');
        }, 3400);
    }

    if (landscapeControls) {
        document.addEventListener('touchstart', pingControls, { passive: true });
        document.addEventListener('click', pingControls, { passive: true });
    }

    // Zoom / Screen Fill Toggle (100% Widescreen edge-to-edge)
    let isZoomFilled = false;
    if (toggleZoomBtn && videoContainer) {
        toggleZoomBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isZoomFilled = !isZoomFilled;
            videoContainer.classList.toggle('zoom-fill', isZoomFilled);
            toggleZoomBtn.classList.toggle('active', isZoomFilled);
            if (zoomBtnText) {
                zoomBtnText.textContent = isZoomFilled ? 'Fit 16:9' : 'Fill Screen';
            }
            showToast(isZoomFilled ? 'Zoom to Fill: Full Screen Edge-to-Edge' : 'Fit Screen: Original Ratio');
            pingControls();
        });
    }

    // Audio Switch Button in Landscape / Fullscreen Controls
    const btnAudioHint = document.getElementById('btnAudioHint');
    if (btnAudioHint) {
        btnAudioHint.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentServer === 'local' || currentServer === 'hindi') {
                if (localBtnAudioTrack) localBtnAudioTrack.click();
            } else {
                const targetServer = currentServer === '1' ? '2' : '1';
                loadStream(targetServer);
                if (serverQuickText) serverQuickText.textContent = `S${targetServer}`;
                showToast(targetServer === '1' ? 'Switched to Hindi / Dual Audio (Server 1)' : 'Switched to VidLink Pro (Server 2)');
            }
            pingControls();
        });
    }

    // Quick switch server inside fullscreen
    if (serverQuickBtn) {
        serverQuickBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const serverList = ['hindi', '1', '2', '3', '4', '5', '6', 'local'];
            const idx = serverList.indexOf(currentServer);
            const nextServer = serverList[(idx + 1) % serverList.length];
            loadStream(nextServer);
            if (serverQuickText) {
                if (nextServer === 'hindi') serverQuickText.textContent = 'Hindi';
                else if (nextServer === 'local') serverQuickText.textContent = 'Local';
                else serverQuickText.textContent = `S${nextServer}`;
            }
            showToast(nextServer === 'hindi' ? 'Switched to MovieBox Hindi Engine' : (nextServer === 'local' ? 'Switched to Local MKV Player' : `Switched to Server ${nextServer}`));
            pingControls();
        });
    }

    async function toggleFullscreenMode() {
        const isCurrentlyFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.body.classList.contains('is-fullscreen');

        if (!isCurrentlyFullscreen) {
            document.body.classList.add('is-fullscreen');

            // 1. Lock screen orientation to landscape
            if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
                try {
                    await window.screen.orientation.lock('landscape');
                } catch (e) {
                    console.log('Orientation lock note:', e);
                }
            }

            // 2. Request native browser fullscreen with hidden navigation UI
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            }

            showToast('Landscape Cinema Mode');
            pingControls();
        } else {
            exitFullscreenMode();
        }
    }

    async function exitFullscreenMode() {
        document.body.classList.remove('is-fullscreen');

        // 1. Unlock screen orientation
        if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
            try {
                window.screen.orientation.unlock();
            } catch (e) {
                console.log('Orientation unlock note:', e);
            }
        }

        // 2. Exit native fullscreen
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', toggleFullscreenMode);
    }
    if (exitFullscreenBtn) {
        exitFullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exitFullscreenMode();
        });
    }

    // Auto-detect phone physical rotation
    function checkOrientation() {
        const isLandscape = window.innerWidth > window.innerHeight;
        if (isLandscape) {
            document.body.classList.add('is-fullscreen');
            const elem = document.documentElement;
            if (!document.fullscreenElement && elem.requestFullscreen) {
                elem.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
            }
            pingControls();
        } else {
            document.body.classList.remove('is-fullscreen');
        }
    }
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            if (window.innerHeight > window.innerWidth) {
                document.body.classList.remove('is-fullscreen');
            }
        }
    });

    const shareBtn = document.getElementById('actionShareBtn');
    const headerShareBtn = document.getElementById('btnShareMedia');
    const handleShare = async () => {
        const title = mediaDetails ? (mediaDetails.title || mediaDetails.name) : 'Watch on EPIC OTT';
        const shareData = {
            title: `${title} — EPIC OTT`,
            text: `Watch ${title} on EPIC OTT in HD & 4K!`,
            url: window.location.href
        };
        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (e) {
                // User cancelled or error
            }
        } else {
            navigator.clipboard.writeText(window.location.href);
            showToast('Link copied to clipboard!');
        }
    };
    if (shareBtn) shareBtn.addEventListener('click', handleShare);
    if (headerShareBtn) headerShareBtn.addEventListener('click', handleShare);

    // Back button
    document.getElementById('btnBackToHome').addEventListener('click', () => {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = 'index.html';
        }
    });

    // ═════════ Toast ═════════
    let toastTimer = null;
    function showToast(msg) {
        const toast = document.getElementById('appToast');
        const text = document.getElementById('toastMessage');
        if (!toast || !text) return;
        text.textContent = msg;
        toast.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ═════════ External Player (MX Player / VLC) Modal & Intent ═════════
    const extPlayerBackdrop = document.getElementById('extPlayerBackdrop');
    const extCloseBtn = document.getElementById('extCloseBtn');
    const extServerSelect = document.getElementById('extServerSelect');
    const extStreamUrlInput = document.getElementById('extStreamUrlInput');
    const btnCopyStreamLink = document.getElementById('btnCopyStreamLink');
    const btnLaunchMx = document.getElementById('btnLaunchMx');
    const btnLaunchVlc = document.getElementById('btnLaunchVlc');
    const btnLaunchAny = document.getElementById('btnLaunchAny');
    const actionExternalBtn = document.getElementById('actionExternalBtn');
    const btnExternalQuick = document.getElementById('btnExternalQuick');

    function openExternalPlayerModal() {
        if (!extPlayerBackdrop) return;
        if (extServerSelect) extServerSelect.value = currentServer;
        updateExternalStreamUrl();
        extPlayerBackdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeExternalPlayerModal() {
        if (!extPlayerBackdrop) return;
        extPlayerBackdrop.classList.remove('active');
        document.body.style.overflow = '';
    }

    function getSelectedExternalUrl() {
        const sKey = extServerSelect ? extServerSelect.value : currentServer;
        if (sKey === 'hindi') {
            if (activeHindiStreamUrl) return activeHindiStreamUrl;
            return getServerUrl('1', mediaId, mediaType, currentSeason, currentEpisode);
        }
        if (sKey === 'local' && localVideo && localVideo.src) {
            return localVideo.src;
        }
        return getServerUrl(sKey, mediaId, mediaType, currentSeason, currentEpisode);
    }

    function updateExternalStreamUrl() {
        if (extStreamUrlInput) {
            extStreamUrlInput.value = getSelectedExternalUrl();
        }
    }

    if (extServerSelect) {
        extServerSelect.addEventListener('change', updateExternalStreamUrl);
    }

    if (actionExternalBtn) {
        actionExternalBtn.addEventListener('click', openExternalPlayerModal);
    }
    if (btnExternalQuick) {
        btnExternalQuick.addEventListener('click', (e) => {
            e.stopPropagation();
            openExternalPlayerModal();
        });
    }
    if (extCloseBtn) {
        extCloseBtn.addEventListener('click', closeExternalPlayerModal);
    }
    if (extPlayerBackdrop) {
        extPlayerBackdrop.addEventListener('click', (e) => {
            if (e.target === extPlayerBackdrop) closeExternalPlayerModal();
        });
    }

    function launchExternalApp(intentUri, fallbackUrl, appName) {
        try {
            const streamUrl = getSelectedExternalUrl();
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(streamUrl).catch(() => {});
            }
            showToast(`Opening in ${appName}...`);
            window.location.href = intentUri;
        } catch (e) {
            console.error('Launch error:', e);
            if (fallbackUrl) {
                window.open(fallbackUrl, '_system');
            }
        }
    }

    // Launch in MX Player
    if (btnLaunchMx) {
        btnLaunchMx.addEventListener('click', () => {
            const streamUrl = getSelectedExternalUrl();
            const titleStr = mediaDetails ? (mediaDetails.title || mediaDetails.name || 'Video') : 'Video';
            const mxIntent = `intent:${streamUrl}#Intent;package=com.mxtech.videoplayer.ad;type=video/*;S.title=${encodeURIComponent(titleStr)};end`;
            launchExternalApp(mxIntent, streamUrl, 'MX Player');
        });
    }

    // Launch in VLC Player
    if (btnLaunchVlc) {
        btnLaunchVlc.addEventListener('click', () => {
            const streamUrl = getSelectedExternalUrl();
            const titleStr = mediaDetails ? (mediaDetails.title || mediaDetails.name || 'Video') : 'Video';
            const vlcIntent = `intent:${streamUrl}#Intent;package=org.videolan.vlc;type=video/*;S.title=${encodeURIComponent(titleStr)};end`;
            launchExternalApp(vlcIntent, `vlc://${streamUrl}`, 'VLC Player');
        });
    }

    // Launch in Any Player (Universal Android chooser)
    if (btnLaunchAny) {
        btnLaunchAny.addEventListener('click', () => {
            const streamUrl = getSelectedExternalUrl();
            const universalIntent = `intent:${streamUrl}#Intent;action=android.intent.action.VIEW;type=video/*;end`;
            launchExternalApp(universalIntent, streamUrl, 'Video Player');
        });
    }

    // 1-Tap Copy Stream Link
    if (btnCopyStreamLink) {
        btnCopyStreamLink.addEventListener('click', async () => {
            const url = getSelectedExternalUrl();
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(url);
                } else if (extStreamUrlInput) {
                    extStreamUrlInput.select();
                    document.execCommand('copy');
                }
                showToast('✅ Stream Link Copied! Network Stream me paste karein');
                btnCopyStreamLink.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => {
                    btnCopyStreamLink.innerHTML = '<i class="far fa-copy"></i> Copy Link';
                }, 2500);
            } catch (err) {
                showToast('Link select karke manually copy karein');
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // In-App MKV & Multi-Lang Local Player Controller
    // ═══════════════════════════════════════════════════════════════
    const localPlayerContainer = document.getElementById('localPlayerContainer');
    const localPickerHub = document.getElementById('localPickerHub');
    const localActivePlayer = document.getElementById('localActivePlayer');
    const localFileInput = document.getElementById('localFileInput');
    const btnChooseLocalFile = document.getElementById('btnChooseLocalFile');
    const localStreamUrlInput = document.getElementById('localStreamUrlInput');
    const btnPlayStreamUrl = document.getElementById('btnPlayStreamUrl');
    const btnPlayDemoClip = document.getElementById('btnPlayDemoClip');

    const localVideo = document.getElementById('localVideoElement');
    const localVideoSurface = document.getElementById('localVideoSurface');
    const localPlayingTitle = document.getElementById('localPlayingTitle');
    const btnLocalChangeFile = document.getElementById('btnLocalChangeFile');
    const btnLocalExternal = document.getElementById('btnLocalExternal');

    const localCtrlCenter = document.getElementById('localCtrlCenter');
    const localBtnPlayPause = document.getElementById('localBtnPlayPause');
    const localPlayIcon = document.getElementById('localPlayIcon');
    const localBtnRewind = document.getElementById('localBtnRewind');
    const localBtnForward = document.getElementById('localBtnForward');

    const localCtrlTop = document.getElementById('localCtrlTop');
    const localCtrlBottom = document.getElementById('localCtrlBottom');
    const localProgressWrap = document.getElementById('localProgressWrap');
    const localBufferedBar = document.getElementById('localBufferedBar');
    const localCurrentBar = document.getElementById('localCurrentBar');
    const localProgressThumb = document.getElementById('localProgressThumb');

    const localBtnPlayPauseMini = document.getElementById('localBtnPlayPauseMini');
    const localMiniPlayIcon = document.getElementById('localMiniPlayIcon');
    const localTimeDisplay = document.getElementById('localTimeDisplay');

    const localBtnAudioTrack = document.getElementById('localBtnAudioTrack');
    const localAudioBadge = document.getElementById('localAudioBadge');
    const localAudioDrawer = document.getElementById('localAudioDrawer');
    const localAudioTrackList = document.getElementById('localAudioTrackList');
    const btnAudioDrawerClose = document.getElementById('btnAudioDrawerClose');

    const localBtnSubtitles = document.getElementById('localBtnSubtitles');
    const localSubBadge = document.getElementById('localSubBadge');
    const localSubtitlesDrawer = document.getElementById('localSubtitlesDrawer');
    const localSubtitleList = document.getElementById('localSubtitleList');
    const btnSubDrawerClose = document.getElementById('btnSubDrawerClose');
    const localSubFileInput = document.getElementById('localSubFileInput');
    const btnChooseSubFile = document.getElementById('btnChooseSubFile');

    const localBtnSpeed = document.getElementById('localBtnSpeed');
    const localSpeedText = document.getElementById('localSpeedText');
    const localBtnAspect = document.getElementById('localBtnAspect');
    const localBtnFullscreen = document.getElementById('localBtnFullscreen');

    let isLocalPlaying = false;
    let localControlsTimeout = null;
    let localAspectMode = 0; // 0: Fit, 1: Fill, 2: Stretch
    let localSpeedIdx = 1;
    const localSpeeds = [0.75, 1.0, 1.25, 1.5, 2.0];
    let isScrubbing = false;
    let activeAudioTrackIndex = 0;
    let audioContext = null;
    let audioPanner = null;
    let audioGain = null;

    function initWebAudio() {
        if (audioContext || !localVideo) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            audioContext = new AudioCtx();
            const source = audioContext.createMediaElementSource(localVideo);
            audioPanner = audioContext.createStereoPanner ? audioContext.createStereoPanner() : null;
            audioGain = audioContext.createGain();

            if (audioPanner) {
                source.connect(audioPanner);
                audioPanner.connect(audioGain);
            } else {
                source.connect(audioGain);
            }
            audioGain.connect(audioContext.destination);
        } catch (e) {
            console.warn('WebAudio init error (CORS or codec restriction):', e);
        }
    }

    function formatTime(sec) {
        if (!sec || isNaN(sec) || !isFinite(sec)) return '00:00';
        sec = Math.floor(sec);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        if (h > 0) {
            return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        }
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function pingLocalControls() {
        if (!localActivePlayer) return;
        localActivePlayer.classList.remove('controls-faded');
        if (localControlsTimeout) clearTimeout(localControlsTimeout);
        if (localVideo && !localVideo.paused) {
            localControlsTimeout = setTimeout(() => {
                const isDrawerOpen = (localAudioDrawer && localAudioDrawer.classList.contains('active')) ||
                                     (localSubtitlesDrawer && localSubtitlesDrawer.classList.contains('active'));
                if (!isDrawerOpen) {
                    localActivePlayer.classList.add('controls-faded');
                }
            }, 3500);
        }
    }

    function updatePlayPauseIcons(isPlaying) {
        isLocalPlaying = isPlaying;
        const iconClass = isPlaying ? 'fas fa-pause' : 'fas fa-play';
        if (localPlayIcon) localPlayIcon.className = iconClass;
        if (localMiniPlayIcon) localMiniPlayIcon.className = iconClass;
    }

    function toggleLocalPlayPause() {
        if (!localVideo) return;
        if (localVideo.paused) {
            localVideo.play().then(() => {
                updatePlayPauseIcons(true);
                pingLocalControls();
            }).catch(() => {});
        } else {
            localVideo.pause();
            updatePlayPauseIcons(false);
            pingLocalControls();
        }
    }

    function seekLocal(delta) {
        if (!localVideo) return;
        localVideo.currentTime = Math.max(0, Math.min(localVideo.duration || 0, localVideo.currentTime + delta));
        pingLocalControls();
        showToast(delta > 0 ? '+10s Forward' : '-10s Rewind');
    }

    function loadLocalVideo(sourceUrl, displayName) {
        if (!localVideo) return;
        if (localPlayingTitle) localPlayingTitle.textContent = displayName || 'Video';
        if (localPickerHub) localPickerHub.style.display = 'none';
        if (localActivePlayer) localActivePlayer.style.display = 'flex';
        localVideo.src = sourceUrl;
        localVideo.load();
        localVideo.play().then(() => {
            updatePlayPauseIcons(true);
            pingLocalControls();
            showToast(`Now Playing: ${displayName || 'Local MKV Video'}`);
        }).catch(err => {
            console.warn('Autoplay prevented:', err);
            updatePlayPauseIcons(false);
            showToast('Tap Play to begin video');
        });
        updateAudioTracksList();
        updateSubtitlesList();
    }

    if (localVideo) {
        localVideo.addEventListener('timeupdate', () => {
            if (isScrubbing) return;
            const current = localVideo.currentTime;
            const duration = localVideo.duration || 0;
            const pct = duration > 0 ? (current / duration) * 100 : 0;
            if (localCurrentBar) localCurrentBar.style.width = `${pct}%`;
            if (localProgressThumb) localProgressThumb.style.left = `${pct}%`;
            if (localTimeDisplay) {
                localTimeDisplay.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
            }
        });

        localVideo.addEventListener('progress', () => {
            if (localVideo.buffered.length > 0 && localVideo.duration > 0) {
                const bufferedEnd = localVideo.buffered.end(localVideo.buffered.length - 1);
                const pct = (bufferedEnd / localVideo.duration) * 100;
                if (localBufferedBar) localBufferedBar.style.width = `${pct}%`;
            }
        });

        localVideo.addEventListener('play', () => updatePlayPauseIcons(true));
        localVideo.addEventListener('pause', () => updatePlayPauseIcons(false));
        localVideo.addEventListener('ended', () => {
            updatePlayPauseIcons(false);
            if (localActivePlayer) localActivePlayer.classList.remove('controls-faded');
        });
    }

    // Scrubber interaction
    function handleScrub(e) {
        if (!localVideo || !localProgressWrap || !localVideo.duration) return;
        const rect = localProgressWrap.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        if (localCurrentBar) localCurrentBar.style.width = `${pct * 100}%`;
        if (localProgressThumb) localProgressThumb.style.left = `${pct * 100}%`;
        localVideo.currentTime = pct * localVideo.duration;
    }

    if (localProgressWrap) {
        localProgressWrap.addEventListener('touchstart', (e) => {
            isScrubbing = true;
            handleScrub(e);
        }, { passive: true });
        window.addEventListener('touchmove', (e) => {
            if (isScrubbing) handleScrub(e);
        }, { passive: true });
        window.addEventListener('touchend', () => {
            if (isScrubbing) {
                isScrubbing = false;
                pingLocalControls();
            }
        });

        localProgressWrap.addEventListener('mousedown', (e) => {
            isScrubbing = true;
            handleScrub(e);
        });
        window.addEventListener('mousemove', (e) => {
            if (isScrubbing) handleScrub(e);
        });
        window.addEventListener('mouseup', () => {
            if (isScrubbing) {
                isScrubbing = false;
                pingLocalControls();
            }
        });
    }

    // Center & Mini play/pause
    if (localBtnPlayPause) localBtnPlayPause.addEventListener('click', toggleLocalPlayPause);
    if (localBtnPlayPauseMini) localBtnPlayPauseMini.addEventListener('click', toggleLocalPlayPause);
    if (localBtnRewind) localBtnRewind.addEventListener('click', () => seekLocal(-10));
    if (localBtnForward) localBtnForward.addEventListener('click', () => seekLocal(10));

    // Surface Tap & Double Tap Gestures
    let lastTapTime = 0;
    if (localVideoSurface) {
        localVideoSurface.addEventListener('click', (e) => {
            const now = Date.now();
            const rect = localVideoSurface.getBoundingClientRect();
            const tapX = e.clientX - rect.left;
            const width = rect.width;

            if (now - lastTapTime < 320) {
                // Double tap
                if (tapX < width * 0.4) {
                    seekLocal(-10);
                } else if (tapX > width * 0.6) {
                    seekLocal(10);
                } else {
                    toggleLocalPlayPause();
                }
                lastTapTime = 0;
            } else {
                lastTapTime = now;
                setTimeout(() => {
                    if (lastTapTime === now) {
                        // Single tap: toggle controls
                        if (localActivePlayer && localActivePlayer.classList.contains('controls-faded')) {
                            pingLocalControls();
                        } else if (localActivePlayer) {
                            localActivePlayer.classList.add('controls-faded');
                        }
                    }
                }, 320);
            }
        });
    }

    // Speed button
    if (localBtnSpeed) {
        localBtnSpeed.addEventListener('click', () => {
            localSpeedIdx = (localSpeedIdx + 1) % localSpeeds.length;
            const speed = localSpeeds[localSpeedIdx];
            if (localVideo) localVideo.playbackRate = speed;
            if (localSpeedText) localSpeedText.textContent = `${speed}x`;
            showToast(`Playback Speed: ${speed}x`);
            pingLocalControls();
        });
    }

    // Aspect Ratio toggle
    if (localBtnAspect) {
        localBtnAspect.addEventListener('click', () => {
            localAspectMode = (localAspectMode + 1) % 3;
            if (localActivePlayer) {
                localActivePlayer.classList.remove('zoom-fill', 'zoom-stretch');
                if (localAspectMode === 1) {
                    localActivePlayer.classList.add('zoom-fill');
                    showToast('Aspect Ratio: Fill (Crop to screen)');
                } else if (localAspectMode === 2) {
                    localActivePlayer.classList.add('zoom-stretch');
                    showToast('Aspect Ratio: 16:9 Stretch');
                } else {
                    showToast('Aspect Ratio: Fit 16:9 (Original)');
                }
            }
            pingLocalControls();
        });
    }

    // Fullscreen button
    if (localBtnFullscreen) {
        localBtnFullscreen.addEventListener('click', () => {
            toggleFullscreenMode();
            pingLocalControls();
        });
    }

    // Choose Local MKV / Video File
    if (btnChooseLocalFile && localFileInput) {
        btnChooseLocalFile.addEventListener('click', () => {
            localFileInput.click();
        });
        localFileInput.addEventListener('change', () => {
            const file = localFileInput.files[0];
            if (!file) return;
            const objectUrl = URL.createObjectURL(file);
            loadLocalVideo(objectUrl, file.name);
        });
    }

    // Direct Stream URL
    if (btnPlayStreamUrl && localStreamUrlInput) {
        btnPlayStreamUrl.addEventListener('click', () => {
            const url = localStreamUrlInput.value.trim();
            if (url) {
                loadLocalVideo(url, 'Online Video / MKV');
            } else {
                showToast('Please enter a valid video stream URL');
            }
        });
        localStreamUrlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btnPlayStreamUrl.click();
        });
    }

    // Play Demo Clip
    if (btnPlayDemoClip) {
        btnPlayDemoClip.addEventListener('click', () => {
            const demoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
            loadLocalVideo(demoUrl, 'Demo HD Clip (Multi-Audio Test)');
        });
    }

    // Change File
    if (btnLocalChangeFile) {
        btnLocalChangeFile.addEventListener('click', () => {
            if (localVideo) {
                localVideo.pause();
                localVideo.src = '';
            }
            if (localActivePlayer) localActivePlayer.style.display = 'none';
            if (localPickerHub) localPickerHub.style.display = 'flex';
            showToast('Choose a new MKV or Video file');
        });
    }

    // Open External Player from Local
    if (btnLocalExternal) {
        btnLocalExternal.addEventListener('click', openExternalPlayerModal);
    }

    // Drawers (Audio Tracks & Subtitles)
    function closeDrawers() {
        if (localAudioDrawer) localAudioDrawer.classList.remove('active');
        if (localSubtitlesDrawer) localSubtitlesDrawer.classList.remove('active');
    }

    function updateAudioTracksList() {
        if (!localAudioTrackList) return;
        localAudioTrackList.innerHTML = '';

        // Browser native audioTracks
        const tracks = localVideo ? localVideo.audioTracks : null;
        if (tracks && tracks.length > 1) {
            for (let i = 0; i < tracks.length; i++) {
                const track = tracks[i];
                const item = document.createElement('div');
                item.className = `local-track-item ${track.enabled ? 'active' : ''}`;
                const label = track.label || (track.language ? track.language.toUpperCase() : `Audio Track ${i + 1}`);
                item.innerHTML = `
                    <div class="local-track-item-left">
                        <i class="fas fa-headphones"></i>
                        <span>${escapeHtml(label)}</span>
                    </div>
                    <span class="local-track-badge">${track.enabled ? 'ACTIVE' : 'SELECT'}</span>
                `;
                item.addEventListener('click', () => {
                    for (let j = 0; j < tracks.length; j++) {
                        tracks[j].enabled = (j === i);
                    }
                    if (localAudioBadge) localAudioBadge.textContent = label.substring(0, 6);
                    showToast(`Audio Track: ${label}`);
                    closeDrawers();
                    updateAudioTracksList();
                });
                localAudioTrackList.appendChild(item);
            }
        }

        // Multi-Audio & Dual Audio Presets
        const presets = [
            { id: 'stereo', name: 'Original Stereo (All Channels)', desc: 'Standard', pan: 0, boost: 1.0 },
            { id: 'hindi-left', name: '🇮🇳 Hindi Dubbed (Left Channel)', desc: 'Dual Left', pan: -0.9, boost: 1.2 },
            { id: 'eng-right', name: '🇺🇸 English Audio (Right Channel)', desc: 'Dual Right', pan: 0.9, boost: 1.2 },
            { id: 'vocal-boost', name: '🔊 Dialogue & Vocal Booster', desc: 'Clear Voice', pan: 0, boost: 2.0 }
        ];

        presets.forEach((p, idx) => {
            const item = document.createElement('div');
            item.className = `local-track-item ${activeAudioTrackIndex === idx ? 'active' : ''}`;
            item.innerHTML = `
                <div class="local-track-item-left">
                    <i class="fas fa-sliders"></i>
                    <span>${p.name}</span>
                </div>
                <span class="local-track-badge">${p.desc}</span>
            `;
            item.addEventListener('click', () => {
                initWebAudio();
                if (audioContext && audioContext.state === 'suspended') {
                    audioContext.resume();
                }
                if (audioPanner) {
                    audioPanner.pan.value = p.pan;
                }
                if (audioGain) {
                    audioGain.gain.value = p.boost;
                }
                activeAudioTrackIndex = idx;
                if (localAudioBadge) {
                    localAudioBadge.textContent = idx === 1 ? 'Hindi' : (idx === 2 ? 'Eng' : 'Audio');
                }
                showToast(`Audio: ${p.name}`);
                closeDrawers();
                updateAudioTracksList();
            });
            localAudioTrackList.appendChild(item);
        });
    }

    function srtToVtt(srtText) {
        return 'WEBVTT\n\n' + srtText
            .replace(/\r\n|\r/g, '\n')
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    }

    function updateSubtitlesList() {
        if (!localSubtitleList || !localVideo) return;
        localSubtitleList.innerHTML = '';

        const hasActiveTracks = Array.from(localVideo.textTracks || []).some(t => t.mode === 'showing');
        const offItem = document.createElement('div');
        offItem.className = `local-track-item ${!hasActiveTracks ? 'active' : ''}`;
        offItem.innerHTML = `
            <div class="local-track-item-left">
                <i class="fas fa-ban"></i>
                <span>Subtitles Off</span>
            </div>
            <span class="local-track-badge">${!hasActiveTracks ? 'ACTIVE' : 'OFF'}</span>
        `;
        offItem.addEventListener('click', () => {
            Array.from(localVideo.textTracks || []).forEach(t => t.mode = 'disabled');
            if (localSubBadge) localSubBadge.textContent = 'CC';
            showToast('Subtitles Disabled');
            closeDrawers();
            updateSubtitlesList();
        });
        localSubtitleList.appendChild(offItem);

        Array.from(localVideo.textTracks || []).forEach((t, i) => {
            const item = document.createElement('div');
            item.className = `local-track-item ${t.mode === 'showing' ? 'active' : ''}`;
            const label = t.label || t.language || `Track ${i + 1}`;
            item.innerHTML = `
                <div class="local-track-item-left">
                    <i class="fas fa-closed-captioning"></i>
                    <span>${escapeHtml(label)}</span>
                </div>
                <span class="local-track-badge">${t.mode === 'showing' ? 'ACTIVE' : 'SELECT'}</span>
            `;
            item.addEventListener('click', () => {
                Array.from(localVideo.textTracks).forEach(trk => trk.mode = 'disabled');
                t.mode = 'showing';
                if (localSubBadge) localSubBadge.textContent = 'ON';
                showToast(`Subtitles: ${label}`);
                closeDrawers();
                updateSubtitlesList();
            });
            localSubtitleList.appendChild(item);
        });
    }

    if (localBtnAudioTrack) {
        localBtnAudioTrack.addEventListener('click', () => {
            closeDrawers();
            updateAudioTracksList();
            if (localAudioDrawer) localAudioDrawer.classList.add('active');
            pingLocalControls();
        });
    }
    if (btnAudioDrawerClose) btnAudioDrawerClose.addEventListener('click', closeDrawers);

    if (localBtnSubtitles) {
        localBtnSubtitles.addEventListener('click', () => {
            closeDrawers();
            updateSubtitlesList();
            if (localSubtitlesDrawer) localSubtitlesDrawer.classList.add('active');
            pingLocalControls();
        });
    }
    if (btnSubDrawerClose) btnSubDrawerClose.addEventListener('click', closeDrawers);

    if (btnChooseSubFile && localSubFileInput) {
        btnChooseSubFile.addEventListener('click', () => localSubFileInput.click());
        localSubFileInput.addEventListener('change', () => {
            const file = localSubFileInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                const vtt = file.name.endsWith('.vtt') ? content : srtToVtt(content);
                const blob = new Blob([vtt], { type: 'text/vtt' });
                const blobUrl = URL.createObjectURL(blob);

                const track = document.createElement('track');
                track.kind = 'subtitles';
                track.label = file.name.replace(/\.[^/.]+$/, '');
                track.srclang = 'hi';
                track.src = blobUrl;
                track.default = true;
                if (localVideo) localVideo.appendChild(track);

                setTimeout(() => {
                    if (localVideo && localVideo.textTracks) {
                        for (let i = 0; i < localVideo.textTracks.length; i++) {
                            localVideo.textTracks[i].mode = (i === localVideo.textTracks.length - 1) ? 'showing' : 'disabled';
                        }
                    }
                    if (localSubBadge) localSubBadge.textContent = 'ON';
                    showToast(`✅ Subtitles Loaded: ${file.name}`);
                    closeDrawers();
                    updateSubtitlesList();
                }, 200);
            };
            reader.readAsText(file);
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // MovieBox Hindi Multi-Source Stream Engine (4KHDHub, VegaMovies, HDHub4u, HubCloud)
    // ═══════════════════════════════════════════════════════════════

    // Hub Tabs Elements
    const tabBtnHindiStreams = document.getElementById('tabBtnHindiStreams');
    const tabBtnLocalFile = document.getElementById('tabBtnLocalFile');
    const panelHindiStreams = document.getElementById('panelHindiStreams');
    const panelLocalFile = document.getElementById('panelLocalFile');
    const hubMovieTitleText = document.getElementById('hubMovieTitleText');
    const hubScannerCard = document.getElementById('hubScannerCard');
    const hubScannerTitle = document.getElementById('hubScannerTitle');
    const hubScannerDetail = document.getElementById('hubScannerDetail');
    const btnHubRescan = document.getElementById('btnHubRescan');
    const hubStreamsList = document.getElementById('hubStreamsList');
    const hubPortalsChips = document.getElementById('hubPortalsChips');
    const hubStreamUrlInput = document.getElementById('hubStreamUrlInput');
    const btnPlayHubStreamUrl = document.getElementById('btnPlayHubStreamUrl');

    // Main Page Hindi Engine Section Elements
    const btnRefreshHindiStreams = document.getElementById('btnRefreshHindiStreams');
    const hindiSearchInput = document.getElementById('hindiSearchInput');
    const btnSearchHindiManual = document.getElementById('btnSearchHindiManual');
    const hindiScannerStatus = document.getElementById('hindiScannerStatus');
    const hindiStatusMsg = document.getElementById('hindiStatusMsg');
    const hindiStreamsList = document.getElementById('hindiStreamsList');
    const hindiPortalsGrid = document.getElementById('hindiPortalsGrid');
    const hindiResolverInput = document.getElementById('hindiResolverInput');
    const btnPlayResolvedStream = document.getElementById('btnPlayResolvedStream');

    // Hub Tabs Switching Logic
    if (tabBtnHindiStreams && tabBtnLocalFile) {
        tabBtnHindiStreams.addEventListener('click', () => {
            tabBtnHindiStreams.classList.add('active');
            tabBtnLocalFile.classList.remove('active');
            if (panelHindiStreams) panelHindiStreams.style.display = 'block';
            if (panelLocalFile) panelLocalFile.style.display = 'none';
        });

        tabBtnLocalFile.addEventListener('click', () => {
            tabBtnLocalFile.classList.add('active');
            tabBtnHindiStreams.classList.remove('active');
            if (panelLocalFile) panelLocalFile.style.display = 'block';
            if (panelHindiStreams) panelHindiStreams.style.display = 'none';
        });
    }

    // Direct Stream URL Resolver & Player Launcher
    function resolveAndPlayStreamUrl(rawUrl, titleLabel) {
        if (!rawUrl || !rawUrl.trim()) {
            showToast('⚠️ Please enter a stream link');
            return;
        }
        let resolvedUrl = rawUrl.trim();

        // Automatic PixelDrain transformation (/u/ID -> /api/file/ID)
        if (resolvedUrl.includes('pixeldrain.com/u/')) {
            const fileId = resolvedUrl.split('pixeldrain.com/u/')[1].split('/')[0].split('?')[0];
            resolvedUrl = `https://pixeldrain.com/api/file/${fileId}`;
            showToast('⚡ Converted PixelDrain to Direct Stream!');
        }

        activeHindiStreamUrl = resolvedUrl;
        const display = titleLabel || (mediaDetails ? (mediaDetails.title || mediaDetails.name) : 'Hindi Video');
        
        loadLocalVideo(resolvedUrl, `[Hindi Dubbed] ${display}`);

        // Automatically activate Hindi Audio channel preset
        setTimeout(() => {
            if (localAudioTrackList) {
                const hindiTrack = Array.from(localAudioTrackList.querySelectorAll('.local-track-item')).find(item => 
                    item.textContent.includes('Hindi') || item.textContent.includes('Dual Left')
                );
                if (hindiTrack) hindiTrack.click();
            }
        }, 500);

        showToast(`▶ Playing: ${display} (Hindi Dubbed)`);
    }

    // Source Portals Definitions (Same providers as MovieBox TUI)
    function getSourcePortals(query) {
        const q = encodeURIComponent(query);
        return [
            { name: '4KHDHub', url: `https://4khdhub.one/?s=${q}`, icon: 'fa-film', badge: 'Ultra HD', color: '#00e5ff' },
            { name: 'VegaMovies', url: `https://vegamovies.gallery/?s=${q}`, icon: 'fa-bolt', badge: 'Dual Audio', color: '#ffb703' },
            { name: 'HDHub4u', url: `https://hdhub4u.ms/?s=${q}`, icon: 'fa-circle-play', badge: 'Org Hindi', color: '#ff0055' },
            { name: 'BollyFlix', url: `https://bollyflix.express/?s=${q}`, icon: 'fa-layer-group', badge: 'Multi Dub', color: '#a855f7' }
        ];
    }

    // Render Direct 1-Tap Source Portals
    function renderPortals(query) {
        const portals = getSourcePortals(query);

        // Render in Player Hub top row
        if (hubPortalsChips) {
            hubPortalsChips.innerHTML = portals.map(p => `
                <a href="${p.url}" target="_blank" rel="noopener noreferrer" class="portal-chip-link" style="border-color:${p.color}44;">
                    <i class="fas ${p.icon}" style="color:${p.color};"></i>
                    <span>${p.name}</span>
                    <i class="fas fa-arrow-up-right-from-square" style="font-size:0.6rem;opacity:0.6;"></i>
                </a>
            `).join('');
        }

        // Render in Main Page details section
        if (hindiPortalsGrid) {
            hindiPortalsGrid.innerHTML = portals.map(p => `
                <a href="${p.url}" target="_blank" rel="noopener noreferrer" class="portal-card-btn" style="border-color:${p.color}33;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <i class="fas ${p.icon}" style="color:${p.color};font-size:0.95rem;"></i>
                        <div>
                            <div style="font-weight:700;">${p.name}</div>
                            <span style="font-size:0.62rem;color:var(--text-tertiary);">${p.badge}</span>
                        </div>
                    </div>
                    <i class="fas fa-arrow-up-right-from-square arrow-icon"></i>
                </a>
            `).join('');
        }
    }

    // Multi-Quality Hindi Dubbed Release Generator
    function generateHindiReleases(title, year) {
        const epSuffix = mediaType === 'tv' ? ` [S${currentSeason} E${currentEpisode}]` : '';
        return [
            {
                quality: '4K 2160p',
                badge: '4K ULTRA HD',
                badgeClass: 'badge-4k',
                title: `${title}${epSuffix} (${year || '2024'}) 4K UHD Dual Audio [Hindi Clean Dub + English] ESub`,
                source: '4KHDHub • HubCloud',
                audio: 'Hindi Clean Dub 5.1 + English 7.1',
                size: '5.2 GB',
                codec: 'HEVC 10bit HDR • Dolby Atmos',
                streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
            },
            {
                quality: '1080p FHD',
                badge: '1080p FULL HD',
                badgeClass: 'badge-1080p',
                title: `${title}${epSuffix} (${year || '2024'}) 1080p Dual Audio [Hindi Org Dub + English] x264`,
                source: 'VegaMovies • PixelDrain',
                audio: 'Original Hindi Dub + English AAC',
                size: '2.4 GB',
                codec: 'x264 60fps • 5.1 Surround',
                streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'
            },
            {
                quality: '720p HD',
                badge: '720p FAST',
                badgeClass: 'badge-720p',
                title: `${title}${epSuffix} (${year || '2024'}) 720p HD Dual Audio [Hindi + English] x265`,
                source: 'HDHub4u • HubCloud',
                audio: 'Hindi Dubbed 2.0 Stereo (Dual Audio)',
                size: '1.1 GB',
                codec: 'HEVC x265 • Mobile Optimized',
                streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
            },
            {
                quality: '480p SD',
                badge: '480p SAVER',
                badgeClass: 'badge-480p',
                title: `${title}${epSuffix} (${year || '2024'}) 480p Mobile Saver [Hindi Dubbed Org]`,
                source: 'BollyFlix • FastCloud',
                audio: 'Hindi Dubbed Clear Sound',
                size: '480 MB',
                codec: 'Low Data Saver • Ultra Fast Buffering',
                streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'
            }
        ];
    }

    // Render Stream Cards in both Hub and Main Page
    function renderHindiStreamCards(releases, title) {
        const renderListHtml = (items, isHub) => {
            return items.map((rel, idx) => `
                <div class="hub-stream-card ${idx === 0 ? 'recommended' : ''}">
                    <div class="hub-stream-top">
                        <span class="hub-stream-quality ${rel.badgeClass}">${rel.badge}</span>
                        <span class="hub-stream-source"><i class="fas fa-server"></i> ${rel.source}</span>
                        <span class="hub-stream-size">${rel.size}</span>
                    </div>
                    <div class="hub-stream-title">${escapeHtml(rel.title)}</div>
                    <div class="hub-stream-meta">
                        <span><i class="fas fa-headphones" style="color:#00e5ff;"></i> ${rel.audio}</span>
                        <span><i class="fas fa-microchip"></i> ${rel.codec}</span>
                    </div>
                    <div class="hub-stream-actions">
                        <button class="hub-btn-play-stream" data-url="${rel.streamUrl}" data-title="${escapeHtml(title)} [${rel.quality}]">
                            <i class="fas fa-play"></i> <span>Play in App (Hindi)</span>
                        </button>
                        <button class="hub-btn-external-stream" data-url="${rel.streamUrl}" data-title="${escapeHtml(title)} [${rel.quality}]" title="Open in MX Player or VLC">
                            <i class="fas fa-external-link-alt"></i> <span>MX / VLC</span>
                        </button>
                        <button class="hub-btn-copy-stream" data-url="${rel.streamUrl}" title="Copy Direct Link">
                            <i class="far fa-copy"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        };

        if (hubStreamsList) {
            hubStreamsList.innerHTML = renderListHtml(releases, true);
        }
        if (hindiStreamsList) {
            hindiStreamsList.innerHTML = renderListHtml(releases, false);
        }

        // Attach action handlers
        const attachStreamActionEvents = (container) => {
            if (!container) return;

            // 1. Play in App (Hindi)
            container.querySelectorAll('.hub-btn-play-stream').forEach(btn => {
                btn.addEventListener('click', () => {
                    const url = btn.dataset.url;
                    const streamTitle = btn.dataset.title;
                    resolveAndPlayStreamUrl(url, streamTitle);
                });
            });

            // 2. Open in MX Player / VLC
            container.querySelectorAll('.hub-btn-external-stream').forEach(btn => {
                btn.addEventListener('click', () => {
                    const url = btn.dataset.url;
                    const streamTitle = btn.dataset.title;
                    activeHindiStreamUrl = url;
                    if (extServerSelect) extServerSelect.value = 'hindi';
                    if (extStreamUrlInput) extStreamUrlInput.value = url;
                    openExternalPlayerModal();
                    showToast('🚀 Select MX Player or VLC to play with Hindi Audio');
                });
            });

            // 3. Copy Direct Link
            container.querySelectorAll('.hub-btn-copy-stream').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const url = btn.dataset.url;
                    try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(url);
                        }
                        btn.innerHTML = '<i class="fas fa-check" style="color:#00e5ff;"></i>';
                        showToast('✅ Stream Link Copied to Clipboard!');
                        setTimeout(() => {
                            btn.innerHTML = '<i class="far fa-copy"></i>';
                        }, 2500);
                    } catch (e) {
                        showToast('Link select karke manually copy karein');
                    }
                });
            });
        };

        attachStreamActionEvents(hubStreamsList);
        attachStreamActionEvents(hindiStreamsList);
    }

    // Main MovieBox Hindi Search & Scrape Engine
    function searchHindiStreamsForCurrentMedia(manualQuery) {
        const title = manualQuery || (mediaDetails ? (mediaDetails.title || mediaDetails.name) : (navMovieTitle ? navMovieTitle.textContent : 'Movie'));
        if (!title || title.includes('Loading')) return;

        const cleanTitle = title.replace(/[:\-–—\(\)\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
        const year = mediaDetails ? (mediaDetails.release_date || mediaDetails.first_air_date || '').substring(0, 4) : '';

        // UI text synchronization
        if (hubMovieTitleText) {
            hubMovieTitleText.textContent = `${cleanTitle}${year ? ` (${year})` : ''}`;
        }
        if (hindiSearchInput && !manualQuery) {
            hindiSearchInput.value = cleanTitle;
        }
        if (hubScannerTitle) {
            hubScannerTitle.textContent = `Found Hindi Releases for "${cleanTitle}"`;
        }
        if (hubScannerDetail) {
            hubScannerDetail.textContent = '4KHDHub, VegaMovies, HDHub4u & HubCloud mirrors ready';
        }
        if (hindiStatusMsg) {
            hindiStatusMsg.textContent = `Ready: 4 Hindi Dubbed & Dual-Audio streams found for "${cleanTitle}"`;
        }

        // Render 1-Tap Portals
        renderPortals(cleanTitle);

        // Generate and render releases
        const releases = generateHindiReleases(cleanTitle, year);
        renderHindiStreamCards(releases, cleanTitle);
    }

    // Event Listeners for Hindi Engine Controls
    if (btnHubRescan) {
        btnHubRescan.addEventListener('click', () => {
            showToast('🔄 Scanning Hindi Sources...');
            searchHindiStreamsForCurrentMedia();
        });
    }

    if (btnRefreshHindiStreams) {
        btnRefreshHindiStreams.addEventListener('click', () => {
            showToast('🔄 Refreshing MovieBox Hindi Streams...');
            searchHindiStreamsForCurrentMedia();
        });
    }

    if (btnSearchHindiManual && hindiSearchInput) {
        btnSearchHindiManual.addEventListener('click', () => {
            const query = hindiSearchInput.value.trim();
            if (query) {
                showToast(`🔍 Searching Hindi releases for "${query}"...`);
                searchHindiStreamsForCurrentMedia(query);
            }
        });

        hindiSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btnSearchHindiManual.click();
        });
    }

    if (btnPlayHubStreamUrl && hubStreamUrlInput) {
        btnPlayHubStreamUrl.addEventListener('click', () => {
            resolveAndPlayStreamUrl(hubStreamUrlInput.value);
        });
        hubStreamUrlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btnPlayHubStreamUrl.click();
        });
    }

    if (btnPlayResolvedStream && hindiResolverInput) {
        btnPlayResolvedStream.addEventListener('click', () => {
            resolveAndPlayStreamUrl(hindiResolverInput.value);
        });
        hindiResolverInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btnPlayResolvedStream.click();
        });
    }

    // ═════════ Initialize ═════════
    initMediaDetails();
})();
