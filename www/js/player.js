/**
 * GHAZI OTT — Advanced Mobile Player Controller
 * 4 High-Speed Multi-Servers | TV Episode Selector | Ambient Glow | Binge Mode
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
    let currentServer = '1';

    let totalSeasons = 1;
    let seasonEpisodes = [];
    let mediaDetails = null;

    // ═════════ Multi-Server URLs Builder ═════════
    function getServerUrl(serverKey, id, type, s, e) {
        switch (serverKey) {
            case '1': // Videasy Pro (Ultra Fast, Clean UI, Auto Next Ep)
                if (type === 'tv') {
                    return `https://player.videasy.net/tv/${id}/${s}/${e}?overlay=true&color=E50914&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true`;
                }
                return `https://player.videasy.net/movie/${id}?overlay=true&color=E50914`;

            case '2': // Vidsrc VIP (Direct Multi-Quality Embed)
                if (type === 'tv') {
                    return `https://vidsrc.to/embed/tv/${id}/${s}/${e}`;
                }
                return `https://vidsrc.to/embed/movie/${id}`;

            case '3': // Smashy Auto (Reliable Fallback)
                if (type === 'tv') {
                    return `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`;
                }
                return `https://embed.smashystream.com/playere.php?tmdb=${id}`;

            case '4': // SuperEmbed / MultiEmbed
                if (type === 'tv') {
                    return `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`;
                }
                return `https://multiembed.mov/?video_id=${id}&tmdb=1`;

            default:
                return `https://player.videasy.net/movie/${id}?color=E50914`;
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

        const serverNames = {
            '1': 'Videasy Pro HD',
            '2': 'Vidsrc VIP',
            '3': 'Smashy Auto',
            '4': 'SuperEmbed'
        };
        statusText.textContent = `Connecting to ${serverNames[serverKey] || 'Server'}...`;
        loader.classList.remove('hidden');

        if (failsafeTimer) clearTimeout(failsafeTimer);

        const targetUrl = getServerUrl(serverKey, mediaId, mediaType, currentSeason, currentEpisode);

        iframe.onload = () => {
            if (myToken !== loadToken) return;
            loader.classList.add('hidden');
        };

        iframe.src = targetUrl;

        // Failsafe timeout in case cross-origin onload doesn't fire immediately
        failsafeTimer = setTimeout(() => {
            if (myToken === loadToken) {
                loader.classList.add('hidden');
            }
        }, 3200);

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
            showToast(`Switched to Server ${btn.dataset.server}`);
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

            document.title = `${title} — Ghazi OTT`;
            navTitle.textContent = title;
            mediaTitle.textContent = title;
            mediaOverview.textContent = data.overview || 'No storyline overview available.';

            mediaMeta.innerHTML = `
                <span class="match-pct">${match}% Match</span>
                <span>${year}</span>
                <span style="background:rgba(255,255,255,0.14);padding:1px 6px;border-radius:3px;font-weight:700;">${rating} ★</span>
                ${runtime ? `<span>${runtime} min</span>` : ''}
                <span style="border:1px solid var(--border-subtle);padding:1px 6px;border-radius:3px;">${mediaType === 'tv' ? 'TV SERIES' : '4K ULTRA HD'}</span>
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

            // Start default stream
            loadStream('1');

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
            watchlist = JSON.parse(localStorage.getItem('ghazi_watchlist') || '[]');
        } catch (e) {
            watchlist = [];
        }

        const isFavorited = watchlist.some(w => w.id == mediaId);
        updateFavButtonUI(isFavorited);

        actionFavBtn.onclick = () => {
            try {
                watchlist = JSON.parse(localStorage.getItem('ghazi_watchlist') || '[]');
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
            localStorage.setItem('ghazi_watchlist', JSON.stringify(watchlist));
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

    // ═════════ Advanced Fullscreen & Auto-Rotate Controls ═════════
    const fullscreenBtn = document.getElementById('actionFullscreenBtn');
    const exitFullscreenBtn = document.getElementById('btnExitFullscreen');

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

            // 2. Request native browser fullscreen on container or documentElement
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(() => {});
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            }

            showToast('Landscape Fullscreen');
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
        if (!isLandscape) {
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
        const title = mediaDetails ? (mediaDetails.title || mediaDetails.name) : 'Watch on Ghazi OTT';
        const shareData = {
            title: `${title} — Ghazi OTT`,
            text: `Watch ${title} on Ghazi OTT with high quality streaming!`,
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

    // ═════════ Initialize ═════════
    initMediaDetails();
})();
