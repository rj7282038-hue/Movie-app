/**
 * EPIC OTT — High Performance Mobile App Client
 * Zero Lag | Touch Gestures | Infinite Poster Wall | Fast Search
 */

(function () {
    'use strict';

    // ═════════ Constants & Config ═════════
    const TMDB_KEY = '6f88c485f6d936e3e93f3ab0758a15f2';
    const TMDB_BASE = 'https://api.themoviedb.org/3';
    const TMDB_POSTER = 'https://image.tmdb.org/t/p/w342'; // Optimized mobile size
    const TMDB_BACKDROP = 'https://image.tmdb.org/t/p/w780'; // Fast loading mobile backdrop

    const HOME_SECTIONS = [
        { key: 'trending', title: 'Trending Now', ep: '/trending/movie/day?page=', type: 'movie', hero: true },
        { key: 'toprated', title: 'Top Rated Movies', ep: '/movie/top_rated?page=', type: 'movie' },
        { key: 'action', title: 'Action & Adventure', ep: '/discover/movie?with_genres=28&sort_by=popularity.desc&page=', type: 'movie' },
        { key: 'scifi', title: 'Sci-Fi & Fantasy', ep: '/discover/movie?with_genres=878&sort_by=popularity.desc&page=', type: 'movie' },
        { key: 'bollywood', title: 'Bollywood Hits', ep: '/discover/movie?with_original_language=hi&sort_by=popularity.desc&page=', type: 'movie' },
        { key: 'comedy', title: 'Blockbuster Comedies', ep: '/discover/movie?with_genres=35&sort_by=popularity.desc&page=', type: 'movie' },
        { key: 'animation', title: 'Animation & Anime', ep: '/discover/movie?with_genres=16&sort_by=popularity.desc&page=', type: 'movie' },
        { key: 'tvshows', title: 'Popular TV Series', ep: '/trending/tv/week?page=', type: 'tv' }
    ];

    const WALL_ENDPOINTS = {
        movies: { title: 'Explore Movies', ep: '/discover/movie?sort_by=popularity.desc&vote_count.gte=30&page=', type: 'movie' },
        tv: { title: 'Explore TV Series', ep: '/discover/tv?sort_by=popularity.desc&vote_count.gte=30&page=', type: 'tv' },
        trending: { title: 'Trending This Week', ep: '/trending/all/week?page=', type: 'mixed' },
        action: { title: 'Action Movies', ep: '/discover/movie?with_genres=28&sort_by=popularity.desc&page=', type: 'movie' },
        scifi: { title: 'Sci-Fi & Fantasy', ep: '/discover/movie?with_genres=878&sort_by=popularity.desc&page=', type: 'movie' },
        bollywood: { title: 'Bollywood Movies', ep: '/discover/movie?with_original_language=hi&sort_by=popularity.desc&page=', type: 'movie' },
        toprated: { title: 'All Time Top Rated', ep: '/movie/top_rated?page=', type: 'movie' }
    };

    // ═════════ State Management ═════════
    let watchlist = [];
    let recent = [];
    let heroItems = [];
    let heroIndex = 0;
    let heroInterval = null;
    let currentTab = 'home';
    let wallState = null;
    const apiCache = new Map();

    // ═════════ Storage Helpers ═════════
    function loadUserData() {
        try {
            watchlist = JSON.parse(localStorage.getItem('epic_watchlist') || localStorage.getItem('ghazi_watchlist') || '[]');
            recent = JSON.parse(localStorage.getItem('epic_recent') || localStorage.getItem('ghazi_recent') || '[]');
        } catch (e) {
            watchlist = [];
            recent = [];
        }
        updateWatchlistBadge();
    }

    function saveWatchlist() {
        localStorage.setItem('epic_watchlist', JSON.stringify(watchlist));
        updateWatchlistBadge();
    }

    function saveRecent() {
        localStorage.setItem('epic_recent', JSON.stringify(recent));
    }

    function updateWatchlistBadge() {
        const dot = document.getElementById('watchlistDot');
        if (dot) {
            dot.style.display = watchlist.length > 0 ? 'block' : 'none';
        }
    }

    // ═════════ API Fetching with in-memory caching ═════════
    async function tmdb(endpoint) {
        if (apiCache.has(endpoint)) {
            return apiCache.get(endpoint);
        }
        const sep = endpoint.includes('?') ? '&' : '?';
        const url = `${TMDB_BASE}${endpoint}${sep}api_key=${TMDB_KEY}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('API Request Failed');
        const data = await response.json();
        apiCache.set(endpoint, data);
        return data;
    }

    // ═════════ UI Toast Helper ═════════
    let toastTimeout = null;
    function showToast(msg) {
        const toast = document.getElementById('appToast');
        const text = document.getElementById('toastMessage');
        if (!toast || !text) return;
        text.textContent = msg;
        toast.classList.add('show');
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 2200);
    }

    // ═════════ Video Quality & Multi-Audio Detection ═════════
    function getVideoQuality(item) {
        // If print version (PHD) -> recently released in cinema / fresh theatrical release
        const relDateStr = item.release_date || item.first_air_date;
        if (relDateStr) {
            const relTime = new Date(relDateStr).getTime();
            const now = new Date().getTime();
            const diffDays = (now - relTime) / (1000 * 60 * 60 * 24);
            // If released within last 75 days and either low votes (theatre cam/print) or very high popularity with recent release
            if (diffDays >= 0 && diffDays <= 75 && (Number(item.vote_count || 0) < 450 || (Number(item.popularity || 0) > 200 && Number(item.vote_count || 0) < 600))) {
                return { code: 'PHD', label: 'PHD', class: 'quality-phd', desc: 'Pre-HD / Cinema Print' };
            }
        }

        const voteAvg = Number(item.vote_average || 0);
        const voteCnt = Number(item.vote_count || 0);
        const pop = Number(item.popularity || 0);
        const year = parseInt((relDateStr || '').substring(0, 4), 10) || 2020;

        // 4K Ultra HD for top rated / blockbuster modern titles
        if ((voteAvg >= 7.6 && voteCnt >= 100) || pop >= 150 || (year >= 2022 && voteAvg >= 7.2)) {
            return { code: '4K', label: '4K', class: 'quality-4k', desc: '4K Ultra HD' };
        }

        // Full HD 1080p (FHD) for modern releases
        if (year >= 2017 || voteAvg >= 6.2) {
            return { code: 'FHD', label: 'FHD', class: 'quality-fhd', desc: 'Full HD 1080p' };
        }

        // Standard HD 720p
        return { code: 'HD', label: 'HD', class: 'quality-hd', desc: 'HD 720p' };
    }

    function isMultiAudioSupported(item) {
        const lang = (item.original_language || 'en').toLowerCase();
        const pop = Number(item.popularity || 0);
        const votes = Number(item.vote_count || 0);
        // Titles from major dubbed industries (EN, HI, JA, KO, ES, FR, DE, IT, TE, TA) or popular titles have multi-audio
        const multiLangs = ['en', 'hi', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'te', 'ta'];
        if (multiLangs.includes(lang) || pop > 35 || votes > 80) {
            return true;
        }
        return false;
    }

    // ═════════ Card Component (Mobile Ultra Fast) ═════════
    function createMovieCard(item, forcedType) {
        const type = forcedType || item.media_type || 'movie';
        if (type !== 'movie' && type !== 'tv') return null;

        const id = item.id;
        const title = item.title || item.name || 'Untitled';
        const posterUrl = item.poster_path ? `${TMDB_POSTER}${item.poster_path}` : 'assets/no-poster.png';
        const year = (item.release_date || item.first_air_date || '').substring(0, 4);
        const rating = item.vote_average ? Number(item.vote_average).toFixed(1) : '7.0';
        const quality = getVideoQuality(item);
        const hasMultiAudio = isMultiAudioSupported(item);

        const card = document.createElement('div');
        card.className = 'movie-card';
        card.dataset.id = id;
        card.dataset.type = type;

        card.innerHTML = `
            <div class="card-poster-wrapper">
                <img src="${posterUrl}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.src='https://via.placeholder.com/342x513/14141c/ffffff?text=${encodeURIComponent(title)}';">
                <div class="card-badge-rating"><i class="fas fa-star"></i>${rating}</div>
                <div class="card-badge-quality ${quality.class}" title="${quality.desc}">${quality.label}</div>
                ${hasMultiAudio ? '<div class="card-badge-lang"><i class="fas fa-globe"></i> Multi-Audio</div>' : ''}
            </div>
            <div class="card-info-peek">
                <div class="card-title-text">${escapeHtml(title)}</div>
                <div class="card-sub-text">
                    <span>${year || (type === 'tv' ? 'Series' : 'Movie')}</span>
                    <span class="quality-text-badge ${quality.class}">${quality.label}</span>
                </div>
            </div>
        `;

        // Direct tap: Open Native Bottom Sheet
        card.addEventListener('click', () => {
            openBottomSheet(id, type);
        });

        return card;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ═════════ Hero Carousel with Touch Swipe ═════════
    function buildHeroBanner(items) {
        heroItems = items.filter(m => m.backdrop_path).slice(0, 6);
        const slider = document.getElementById('heroSlider');
        const indicators = document.getElementById('heroIndicators');
        slider.innerHTML = '';
        indicators.innerHTML = '';

        if (!heroItems.length) {
            document.getElementById('heroSection').style.display = 'none';
            return;
        }
        document.getElementById('heroSection').style.display = 'block';

        heroItems.forEach((m, idx) => {
            const slide = document.createElement('div');
            slide.className = `hero-slide ${idx === 0 ? 'active' : ''}`;
            const title = m.title || m.name || 'Featured';
            const year = (m.release_date || m.first_air_date || '').substring(0, 4);
            const rating = m.vote_average ? Number(m.vote_average).toFixed(1) : '8.2';
            const match = Math.round((m.vote_average || 8) * 10);
            const backdropUrl = `${TMDB_BACKDROP}${m.backdrop_path}`;

            slide.innerHTML = `
                <img class="hero-backdrop" src="${backdropUrl}" alt="${escapeHtml(title)}">
                <div class="hero-overlay-gradient"></div>
                <div class="hero-content">
                    <div class="hero-badge-tag"><i class="fas fa-bolt"></i> EPIC EXCLUSIVE</div>
                    <h1 class="hero-title">${escapeHtml(title)}</h1>
                    <div class="hero-meta-row">
                        <span class="match-score">${match}% Match</span>
                        <span>${year}</span>
                        <span class="quality-badge">${rating} ★</span>
                        <span class="quality-badge">4K ULTRA HD</span>
                        <span class="drawer-audio-pill"><i class="fas fa-headphones"></i> Multi-Audio</span>
                    </div>
                    <div class="hero-actions">
                        <button class="btn-play-primary" data-id="${m.id}" data-type="movie">
                            <i class="fas fa-play"></i> Play
                        </button>
                        <button class="btn-secondary-action" data-id="${m.id}" data-type="movie">
                            <i class="fas fa-info-circle"></i> Info
                        </button>
                    </div>
                </div>
            `;

            slide.querySelector('.btn-play-primary').addEventListener('click', (e) => {
                e.stopPropagation();
                launchPlayer(m.id, 'movie', title, `${TMDB_POSTER}${m.poster_path}`, year);
            });

            slide.querySelector('.btn-secondary-action').addEventListener('click', (e) => {
                e.stopPropagation();
                openBottomSheet(m.id, 'movie');
            });

            slider.appendChild(slide);

            const dot = document.createElement('div');
            dot.className = `hero-indicator-dot ${idx === 0 ? 'active' : ''}`;
            dot.addEventListener('click', () => setHeroSlide(idx));
            indicators.appendChild(dot);
        });

        // Touch Swipe Handling on Hero
        let touchStartX = 0;
        let touchEndX = 0;
        slider.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            stopHeroAuto();
        }, { passive: true });

        slider.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            if (touchStartX - touchEndX > 45) {
                nextHeroSlide(); // swipe left
            } else if (touchEndX - touchStartX > 45) {
                prevHeroSlide(); // swipe right
            }
            startHeroAuto();
        }, { passive: true });

        heroIndex = 0;
        startHeroAuto();
    }

    function setHeroSlide(idx) {
        const slides = document.querySelectorAll('.hero-slide');
        const dots = document.querySelectorAll('.hero-indicator-dot');
        if (!slides.length) return;

        slides[heroIndex]?.classList.remove('active');
        dots[heroIndex]?.classList.remove('active');

        heroIndex = (idx + slides.length) % slides.length;

        slides[heroIndex]?.classList.add('active');
        dots[heroIndex]?.classList.add('active');
    }

    function nextHeroSlide() {
        setHeroSlide(heroIndex + 1);
    }
    function prevHeroSlide() {
        setHeroSlide(heroIndex - 1);
    }

    function startHeroAuto() {
        if (heroInterval) clearInterval(heroInterval);
        if (heroItems.length > 1) {
            heroInterval = setInterval(nextHeroSlide, 7000);
        }
    }

    function stopHeroAuto() {
        if (heroInterval) clearInterval(heroInterval);
    }

    // ═════════ Home Curated Sections ═════════
    async function renderHomeView() {
        stopWallObserver();
        document.getElementById('wallSection').style.display = 'none';
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('homeSections').style.display = 'block';
        document.getElementById('heroSection').style.display = 'block';

        renderRecentRow();

        const container = document.getElementById('homeSections');
        container.innerHTML = '';

        // Create placeholders for instant layout
        HOME_SECTIONS.forEach(cfg => {
            const sec = document.createElement('section');
            sec.className = 'section-block';
            sec.id = `sec-${cfg.key}`;
            sec.innerHTML = `
                <div class="section-header">
                    <h2 class="section-heading">${cfg.title}</h2>
                    <a class="section-more-link" data-target="${cfg.key}">See all <i class="fas fa-chevron-right" style="font-size:0.7rem;"></i></a>
                </div>
                <div class="horizontal-track" id="track-${cfg.key}"></div>
            `;
            sec.querySelector('.section-more-link').addEventListener('click', () => {
                activateCategoryWall(cfg.key);
            });
            container.appendChild(sec);
        });

        // Fetch data concurrently
        const promises = HOME_SECTIONS.map(async cfg => {
            try {
                const data = await tmdb(cfg.ep + '1');
                return { cfg, items: data.results || [] };
            } catch (e) {
                return { cfg, items: [] };
            }
        });

        const results = await Promise.all(promises);
        results.forEach(res => {
            const track = document.getElementById(`track-${res.cfg.key}`);
            if (!track) return;
            const valid = res.items.filter(m => m.poster_path);
            valid.slice(0, 16).forEach(m => {
                const card = createMovieCard(m, res.cfg.type);
                if (card) track.appendChild(card);
            });
        });

        const heroRow = results.find(r => r.cfg.hero);
        if (heroRow && heroRow.items.length) {
            buildHeroBanner(heroRow.items);
        }
    }

    // ═════════ Recent / Continue Watching ═════════
    function renderRecentRow() {
        const block = document.getElementById('recentBlock');
        const track = document.getElementById('recentTrack');
        if (!recent.length) {
            block.style.display = 'none';
            return;
        }
        block.style.display = 'flex';
        track.innerHTML = '';

        recent.slice(0, 10).forEach(item => {
            const card = createMovieCard({
                id: item.id,
                title: item.title,
                poster_path: null,
                release_date: item.year ? `${item.year}-01-01` : '',
                vote_average: 8.0
            }, item.type);

            if (card) {
                if (item.poster) {
                    const img = card.querySelector('img');
                    if (img) img.src = item.poster;
                }
                const badge = card.querySelector('.card-badge-rating');
                if (badge) badge.innerHTML = '<i class="fas fa-play" style="color:var(--primary);font-size:0.6rem;"></i>';
                track.appendChild(card);
            }
        });
    }

    function addRecentWatched(id, title, poster, year, type) {
        recent = recent.filter(r => r.id != id);
        recent.unshift({ id, title, poster, year, type });
        if (recent.length > 20) recent.pop();
        saveRecent();
        renderRecentRow();
    }

    // ═════════ Infinite Scroll Grid Wall ═════════
    function stopWallObserver() {
        if (wallState && wallState.observer) {
            wallState.observer.disconnect();
        }
        wallState = null;
    }

    async function activateCategoryWall(catKey) {
        stopHeroAuto();
        document.getElementById('heroSection').style.display = 'none';
        document.getElementById('recentBlock').style.display = 'none';
        document.getElementById('homeSections').style.display = 'none';
        document.getElementById('emptyState').style.display = 'none';

        const wallSec = document.getElementById('wallSection');
        const wallGrid = document.getElementById('wallGrid');
        const wallHeading = document.getElementById('wallHeading');
        const wallSpinner = document.getElementById('wallSpinner');

        wallSec.style.display = 'block';
        wallGrid.innerHTML = '';
        wallSpinner.style.display = 'flex';

        const cfg = WALL_ENDPOINTS[catKey] || WALL_ENDPOINTS.movies;
        wallHeading.textContent = cfg.title;

        // Sync chip button UI
        document.querySelectorAll('.chip-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.cat === catKey);
        });

        wallState = {
            page: 0,
            ep: cfg.ep,
            type: cfg.type,
            loading: false,
            ended: false,
            observer: null
        };

        await loadNextWallPage();

        if (wallState) {
            const sentinel = document.createElement('div');
            sentinel.id = 'wallSentinel';
            sentinel.style.height = '40px';
            sentinel.style.width = '100%';
            wallSec.appendChild(sentinel);

            wallState.observer = new IntersectionObserver(entries => {
                if (entries[0].isIntersecting) {
                    loadNextWallPage();
                }
            }, { rootMargin: '600px' });

            wallState.observer.observe(sentinel);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function loadNextWallPage() {
        if (!wallState || wallState.loading || wallState.ended) return;
        wallState.loading = true;

        const grid = document.getElementById('wallGrid');
        const spinner = document.getElementById('wallSpinner');
        const nextPage = wallState.page + 1;

        try {
            const data = await tmdb(wallState.ep + nextPage);
            const results = (data.results || []).filter(m => m.poster_path);

            if (results.length) {
                results.forEach(m => {
                    const type = wallState.type === 'mixed' ? m.media_type : wallState.type;
                    const card = createMovieCard(m, type);
                    if (card) grid.appendChild(card);
                });
                wallState.page = nextPage;
                if (nextPage >= (data.total_pages || 500)) {
                    wallState.ended = true;
                    if (spinner) spinner.style.display = 'none';
                }
            } else {
                wallState.ended = true;
                if (spinner) spinner.style.display = 'none';
            }
        } catch (e) {
            // Error, keep sentinel active for retry
        } finally {
            if (wallState) wallState.loading = false;
        }
    }

    // ═════════ Watchlist View ═════════
    function renderWatchlistView() {
        stopHeroAuto();
        stopWallObserver();
        document.getElementById('heroSection').style.display = 'none';
        document.getElementById('recentBlock').style.display = 'none';
        document.getElementById('homeSections').style.display = 'none';

        const wallSec = document.getElementById('wallSection');
        const wallGrid = document.getElementById('wallGrid');
        const wallHeading = document.getElementById('wallHeading');
        const wallSpinner = document.getElementById('wallSpinner');
        const emptyState = document.getElementById('emptyState');

        if (!watchlist.length) {
            wallSec.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        wallSec.style.display = 'block';
        wallHeading.textContent = `My List (${watchlist.length})`;
        wallGrid.innerHTML = '';
        wallSpinner.style.display = 'none';

        watchlist.forEach(item => {
            const card = createMovieCard({
                id: item.id,
                title: item.title,
                poster_path: null,
                release_date: item.year ? `${item.year}-01-01` : '',
                vote_average: 8.5
            }, item.type);

            if (card) {
                if (item.poster) {
                    const img = card.querySelector('img');
                    if (img) img.src = item.poster;
                }
                const rating = card.querySelector('.card-badge-rating');
                if (rating) rating.innerHTML = '<i class="fas fa-heart" style="color:var(--primary);"></i>';
                wallGrid.appendChild(card);
            }
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function toggleWatchlist(id, title, poster, year, type) {
        const idx = watchlist.findIndex(w => w.id == id);
        let added = false;
        if (idx >= 0) {
            watchlist.splice(idx, 1);
            showToast('Removed from My List');
        } else {
            watchlist.unshift({ id, title, poster, year, type });
            showToast('Added to My List');
            added = true;
        }
        saveWatchlist();

        // Update sheet button if open
        const favBtn = document.getElementById('drawerFavBtn');
        if (favBtn) {
            favBtn.querySelector('i').className = added ? 'fas fa-heart' : 'far fa-heart';
            favBtn.style.color = added ? 'var(--primary)' : '#fff';
        }

        if (currentTab === 'mylist') {
            renderWatchlistView();
        }
    }

    // ═════════ Bottom Sheet Modal ═════════
    const backdrop = document.getElementById('bottomSheetBackdrop');
    const drawer = document.getElementById('bottomSheetDrawer');
    let currentSheetItem = null;

    async function openBottomSheet(id, type) {
        backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';

        document.getElementById('drawerBackdrop').src = '';
        document.getElementById('drawerTitle').textContent = 'Loading details...';
        document.getElementById('drawerOverview').textContent = '';
        document.getElementById('drawerMeta').innerHTML = '';
        document.getElementById('drawerCast').textContent = 'Loading...';
        document.getElementById('drawerGenres').textContent = 'Loading...';
        document.getElementById('drawerLang').textContent = '-';

        // Check if favorited
        const isFav = watchlist.some(w => w.id == id);
        const favBtn = document.getElementById('drawerFavBtn');
        favBtn.querySelector('i').className = isFav ? 'fas fa-heart' : 'far fa-heart';
        favBtn.style.color = isFav ? 'var(--primary)' : '#fff';

        try {
            const endpoint = `/${type}/${id}?append_to_response=credits`;
            const data = await tmdb(endpoint);

            const title = data.title || data.name || 'Untitled';
            const year = (data.release_date || data.first_air_date || '').substring(0, 4);
            const rating = data.vote_average ? Number(data.vote_average).toFixed(1) : '7.5';
            const match = Math.round((data.vote_average || 7.5) * 10);
            const runtime = data.runtime || (data.episode_run_time && data.episode_run_time[0]) || '120';
            const poster = data.poster_path ? `${TMDB_POSTER}${data.poster_path}` : '';
            const backdropImg = data.backdrop_path ? `${TMDB_BACKDROP}${data.backdrop_path}` : poster;
            const cast = data.credits && data.credits.cast ? data.credits.cast.slice(0, 5).map(c => c.name).join(', ') : 'N/A';
            const genres = data.genres ? data.genres.map(g => g.name).join(' • ') : 'N/A';
            const lang = data.original_language ? data.original_language.toUpperCase() : 'EN';

            const quality = getVideoQuality(data);
            const hasMultiAudio = isMultiAudioSupported(data);

            currentSheetItem = { id, title, poster, year, type };

            document.getElementById('drawerBackdrop').src = backdropImg;
            document.getElementById('drawerTitle').textContent = title;
            document.getElementById('drawerOverview').textContent = data.overview || 'No storyline available.';
            document.getElementById('drawerMeta').innerHTML = `
                <span style="color:var(--green);font-weight:800;">${match}% Match</span>
                <span>${year}</span>
                <span class="drawer-quality-pill ${quality.class}">${quality.label}</span>
                ${hasMultiAudio ? '<span class="drawer-audio-pill"><i class="fas fa-headphones"></i> Multi-Audio</span>' : ''}
                <span style="background:rgba(255,255,255,0.15);padding:1px 6px;border-radius:3px;">${rating} ★</span>
                <span>${runtime} min</span>
                <span style="border:1px solid var(--border-subtle);padding:1px 6px;border-radius:3px;">${type === 'tv' ? 'TV SERIES' : 'MOVIE'}</span>
            `;
            document.getElementById('drawerCast').textContent = cast;
            document.getElementById('drawerGenres').textContent = genres;
            document.getElementById('drawerLang').textContent = hasMultiAudio ? `${lang} (Multi-Audio Support)` : lang;

            document.getElementById('drawerPlayBtn').onclick = () => {
                closeBottomSheet();
                launchPlayer(id, type, title, poster, year);
            };

            favBtn.onclick = () => {
                toggleWatchlist(id, title, poster, year, type);
            };

        } catch (e) {
            document.getElementById('drawerTitle').textContent = 'Error loading title';
        }
    }

    function closeBottomSheet() {
        backdrop.classList.remove('active');
        document.body.style.overflow = '';
    }

    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeBottomSheet();
    });

    // ═════════ Launch Player Screen ═════════
    function launchPlayer(id, type, title, poster, year) {
        addRecentWatched(id, title, poster, year, type);
        window.location.href = `player.html?id=${id}&type=${type}`;
    }

    // ═════════ Search View Logic ═════════
    const searchOverlay = document.getElementById('searchOverlay');
    const searchInput = document.getElementById('searchInputField');
    const searchClear = document.getElementById('btnClearSearch');
    const searchResults = document.getElementById('searchResultsArea');
    let searchDebounce = null;

    function openSearchView() {
        searchOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => searchInput.focus(), 150);
    }

    function closeSearchView() {
        searchOverlay.classList.remove('active');
        document.body.style.overflow = '';
        searchInput.value = '';
        searchClear.style.display = 'none';
        searchResults.innerHTML = `
            <div style="text-align: center; color: var(--text-tertiary); margin-top: 60px; font-size: 0.9rem;">
                <i class="fas fa-film" style="font-size: 2.2rem; margin-bottom: 12px; display: block; opacity: 0.4;"></i>
                Type to search thousands of movies & series
            </div>
        `;
    }

    document.getElementById('btnOpenSearch').addEventListener('click', openSearchView);
    document.getElementById('btnCloseSearch').addEventListener('click', closeSearchView);
    document.getElementById('btnOpenWatchlist').addEventListener('click', () => {
        switchTab('mylist');
    });

    searchInput.addEventListener('input', function () {
        const query = this.value.trim();
        searchClear.style.display = query.length > 0 ? 'block' : 'none';
        clearTimeout(searchDebounce);

        if (query.length < 2) {
            searchResults.innerHTML = '';
            return;
        }

        searchDebounce = setTimeout(async () => {
            searchResults.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-tertiary);"><i class="fas fa-circle-notch fa-spin"></i> Searching...</div>';
            try {
                const data = await tmdb(`/search/multi?query=${encodeURIComponent(query)}`);
                const items = (data.results || []).filter(r => ['movie', 'tv'].includes(r.media_type));

                if (items.length) {
                    searchResults.innerHTML = items.map(item => {
                        const poster = item.poster_path ? `${TMDB_POSTER}${item.poster_path}` : '';
                        const title = item.title || item.name || 'Untitled';
                        const year = (item.release_date || item.first_air_date || '').substring(0, 4);
                        const rating = item.vote_average ? Number(item.vote_average).toFixed(1) : '7.0';
                        const type = item.media_type;

                        return `
                            <div class="search-item-row" data-id="${item.id}" data-type="${type}">
                                ${poster ? `<img src="${poster}" alt="${escapeHtml(title)}">` : '<div style="width:52px;height:74px;background:#181822;border-radius:6px;"></div>'}
                                <div class="search-item-details">
                                    <div class="search-item-title">${escapeHtml(title)}</div>
                                    <div class="search-item-sub">
                                        <span style="color:var(--gold);font-weight:700;"><i class="fas fa-star" style="font-size:0.65rem;"></i> ${rating}</span>
                                        <span>${year}</span>
                                        <span style="text-transform:uppercase;">${type === 'tv' ? 'Series' : 'Movie'}</span>
                                    </div>
                                </div>
                                <button class="icon-btn" style="border:none;background:rgba(255,255,255,0.08);"><i class="fas fa-play" style="font-size:0.8rem;"></i></button>
                            </div>
                        `;
                    }).join('');

                    searchResults.querySelectorAll('.search-item-row').forEach(row => {
                        row.addEventListener('click', () => {
                            const id = row.dataset.id;
                            const type = row.dataset.type;
                            closeSearchView();
                            openBottomSheet(id, type);
                        });
                    });
                } else {
                    searchResults.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">No movies or series found.</div>';
                }
            } catch (err) {
                searchResults.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">Search error. Check connection.</div>';
            }
        }, 320);
    });

    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.style.display = 'none';
        searchInput.focus();
    });

    // ═════════ Tab Switching (Bottom Navigation Bar) ═════════
    function switchTab(tabKey) {
        currentTab = tabKey;
        document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.tab === tabKey);
        });

        if (tabKey === 'home') {
            document.querySelectorAll('.chip-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.cat === 'home');
            });
            renderHomeView();
        } else if (tabKey === 'search') {
            openSearchView();
        } else if (tabKey === 'movies') {
            activateCategoryWall('movies');
        } else if (tabKey === 'tv') {
            activateCategoryWall('tv');
        } else if (tabKey === 'mylist') {
            renderWatchlistView();
        }
    }

    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(item.dataset.tab);
        });
    });

    // ═════════ Category Chips Click ═════════
    document.querySelectorAll('.chip-btn').forEach(chip => {
        chip.addEventListener('click', () => {
            const cat = chip.dataset.cat;
            if (cat === 'home') {
                switchTab('home');
            } else {
                activateCategoryWall(cat);
            }
        });
    });

    // ═════════ Header Scroll Effect ═════════
    window.addEventListener('scroll', () => {
        const header = document.getElementById('appHeader');
        if (header) {
            header.classList.toggle('scrolled', window.scrollY > 25);
        }
    }, { passive: true });

    // ═════════ Android Hardware Back Button Handling ═════════
    window.addEventListener('popstate', (e) => {
        if (searchOverlay.classList.contains('active')) {
            closeSearchView();
        } else if (backdrop.classList.contains('active')) {
            closeBottomSheet();
        } else if (currentTab !== 'home') {
            switchTab('home');
        }
    });

    // ═════════ Initial Launch ═════════
    async function init() {
        loadUserData();
        await renderHomeView();

        // Dismiss splash screen quickly
        setTimeout(() => {
            const splash = document.getElementById('splashLoader');
            if (splash) {
                splash.classList.add('done');
                setTimeout(() => splash.remove(), 500);
            }
        }, 1200);
    }

    init();
})();
