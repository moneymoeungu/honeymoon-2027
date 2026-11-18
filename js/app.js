/* =========================================================================
   종구♡쨀린 허니문 (2027.05.08 ~ 05.22) — Main Application
   Barcelona (4N) · Porto (4N) · Mallorca (4N)
   ========================================================================= */

(function () {
  'use strict';

  const STORAGE_KEY = 'iberia_honeymoon_state_v1';

  const CITY_META = {
    bcn: { name: '바르셀로나', nameEn: 'Barcelona Spain', badge: 'city-badge-bcn', stripe: 'city-stripe-bcn', dot: 'dot-bcn', color: '#C8553D' },
    opo: { name: '포르투', nameEn: 'Porto Portugal', badge: 'city-badge-opo', stripe: 'city-stripe-opo', dot: 'dot-opo', color: '#2B59C3' },
    pmi: { name: '마요르카', nameEn: 'Mallorca Spain', badge: 'city-badge-pmi', stripe: 'city-stripe-pmi', dot: 'dot-pmi', color: '#2A9D8F' },
    common: { name: '공통·국제선', nameEn: '', badge: 'city-badge-common', stripe: 'city-stripe-common', dot: 'dot-common', color: '#8C6D46' }
  };

  const CAT_COLORS = {
    sight: '#C8553D',
    food: '#B45309',
    cafe: '#B45309',
    bar: '#92400E',
    stay: '#2B59C3',
    transport: '#2A9D8F'
  };

  const BUDGET_CAT_COLORS = {
    '항공': '#C8553D',
    '숙소': '#2B59C3',
    '투어·입장권': '#2A9D8F',
    '교통·렌터카': '#C88A3D',
    '식비·다이닝': '#6D597A',
    '쇼핑·기타': '#9E7B66'
  };

  let baseData = null;
  let userState = null;

  let activeTab = 'home';
  let layoutMode = 'tabs';
  let selectedTodayIndex = 1;
  let selectedItineraryDayIndex = 1;
  let mapScope = 'day';
  let mapCat = 'all';
  let foodFilterCity = 'all';
  let foodFilterType = 'all';
  let foodOnlyLiked = false;
  let foodOnlyVisited = false;
  let bookingFilterCat = 'all';
  let checklistFilterGroup = 'all';

  let mapInstance = null;
  let mapLayerGroup = null;

  /* -----------------------------------------------------------------------
     1. Initialization & Persistence
     ----------------------------------------------------------------------- */
  async function initApp() {
    try {
      const res = await fetch('data/trip.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      baseData = await res.json();
    } catch (_) {
      baseData = window.__DEFAULT_TRIP_DATA__;
    }

    if (!baseData) {
      document.body.innerHTML = '<div style="padding:40px;text-align:center;">데이터를 불러오지 못했습니다.</div>';
      return;
    }

    loadUserState();
    detectDefaultTodayIndex();
    initTheme();
    bindGlobalEvents();
    startWorldClocks();
    renderAll();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker
        .register('sw.js?v=10')
        .then((reg) => reg.update().catch(() => {}))
        .catch(() => {});
    }
  }

  function createInitialUserState() {
    return {
      coupleTitle: '종구♡쨀린 허니문',
      theme: 'light',
      flightOverrides: {},
      stayOverrides: {},
      customStays: [],
      foodState: {},
      customPlaces: [],
      dayCustomItems: {},
      dayMemoOverrides: {},
      bookingOverrides: {},
      customBookings: [],
      budgetConfig: {
        targetTotalKRW: baseData.budgetConfig?.targetTotalKRW || 13500000,
        eurRate: baseData.budgetConfig?.eurRate || 1500,
        peopleCount: baseData.budgetConfig?.peopleCount || 2
      },
      budgetItems: JSON.parse(JSON.stringify(baseData.budgetItems || [])),
      checklist: JSON.parse(JSON.stringify(baseData.checklist || []))
    };
  }

  function loadUserState() {
    const fresh = createInitialUserState();
    try {
      const savedRaw = localStorage.getItem(STORAGE_KEY);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (!saved.coupleTitle || saved.coupleTitle === '우리의 이베리아 허니문') {
          saved.coupleTitle = '종구♡쨀린 허니문';
        }
        let mergedBudgetItems = Array.isArray(saved.budgetItems) && saved.budgetItems.length ? [...saved.budgetItems] : [...fresh.budgetItems];
        const freshMainFlight = fresh.budgetItems.find((b) => b.id === 'bi-1');
        // Migrate previous split Doha(bi-1) + T'way(bi-1b) items into unified Korean Air round-trip bi-1
        const hasOldSplit = mergedBudgetItems.some((x) => x.id === 'bi-1b');
        const hasOldDoha = mergedBudgetItems.some((x) => x.id === 'bi-1' && x.title && (x.title.includes('도하') || !x.title.includes('대한항공')));
        if (freshMainFlight && (hasOldSplit || hasOldDoha)) {
          mergedBudgetItems = mergedBudgetItems.filter((x) => x.id !== 'bi-1b');
          const bi1Idx = mergedBudgetItems.findIndex((x) => x.id === 'bi-1');
          if (bi1Idx !== -1) {
            const prevBi1 = mergedBudgetItems[bi1Idx];
            const keepUserPaid = prevBi1.title && prevBi1.title.includes('대한항공') && prevBi1.actual > 0;
            mergedBudgetItems[bi1Idx] = keepUserPaid ? prevBi1 : { ...freshMainFlight };
          } else {
            mergedBudgetItems.unshift({ ...freshMainFlight });
          }
        }

        let mergedChecklist = Array.isArray(saved.checklist) && saved.checklist.length ? [...saved.checklist] : [...fresh.checklist];
        const refreshedIds = new Set(['c17', 'c18', 'c19', 'c20']);
        mergedChecklist = mergedChecklist.map((item) => {
          const fm = fresh.checklist.find((fc) => fc.id === item.id);
          if (fm && refreshedIds.has(item.id) && item.text !== fm.text) {
            return { ...fm };
          }
          return item;
        });
        const existingCheckIds = new Set(mergedChecklist.map((c) => c.id));
        fresh.checklist.forEach((fc) => {
          if (!existingCheckIds.has(fc.id)) {
            mergedChecklist.push(fc);
          }
        });

        if (saved.flightOverrides) {
          ['f1', 'f5'].forEach((fid) => {
            const ov = saved.flightOverrides[fid];
            if (ov && (ov.status === 'todo' || (ov.airline && !ov.airline.includes('대한항공')))) {
              delete saved.flightOverrides[fid];
            }
          });
        }
        if (saved.bookingOverrides) {
          ['b-flight-icn-bcn', 'b-flight-bcn-icn'].forEach((bid) => {
            if (saved.bookingOverrides[bid] && saved.bookingOverrides[bid].status === 'todo') {
              delete saved.bookingOverrides[bid];
            }
          });
        }
        userState = {
          ...fresh,
          ...saved,
          budgetConfig: { ...fresh.budgetConfig, ...(saved.budgetConfig || {}) },
          budgetItems: mergedBudgetItems,
          checklist: mergedChecklist
        };
        saveUserState();
      } else {
        userState = fresh;
      }
    } catch (_) {
      userState = fresh;
    }
  }

  function saveUserState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userState));
    } catch (_) {}
  }

  /* -----------------------------------------------------------------------
     2. Merged Data Getters
     ----------------------------------------------------------------------- */
  function getAllPlaces() {
    return [...baseData.places, ...(userState.customPlaces || [])];
  }

  function getPlaceById(id) {
    return getAllPlaces().find((p) => p.id === id) || null;
  }

  function getFlights() {
    return baseData.flights.map((f) => ({
      ...f,
      ...(userState.flightOverrides[f.id] || {})
    }));
  }

  function getStays() {
    const mergedBase = baseData.stays.map((s) => {
      const ov = userState.stayOverrides[s.id] || {};
      return {
        ...s,
        ...ov,
        votes: { ...s.votes, ...(ov.votes || {}) }
      };
    });
    return [...mergedBase, ...(userState.customStays || [])];
  }

  function getConfirmedStayForCity(cityCode) {
    return getStays().find((s) => s.city === cityCode && s.status === 'booked') || null;
  }

  function getBookings() {
    const merged = baseData.bookings.map((b) => ({
      ...b,
      ...(userState.bookingOverrides[b.id] || {})
    }));
    return [...merged, ...(userState.customBookings || [])];
  }

  function getDays() {
    return baseData.days.map((d) => {
      const baseItems = d.items.map((item, idx) => {
        const key = `${d.date}_${idx}`;
        const customMemo = userState.dayMemoOverrides[key];
        return customMemo !== undefined
          ? { ...item, memo: customMemo, _idx: idx, _isCustom: false }
          : { ...item, _idx: idx, _isCustom: false };
      });
      const extraItems = (userState.dayCustomItems[d.date] || []).map((item, cIdx) => ({
        ...item,
        _customIdx: cIdx,
        _isCustom: true
      }));
      const combined = [...baseItems, ...extraItems].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      return { ...d, items: combined };
    });
  }

  function getFoodPlaces() {
    return getAllPlaces()
      .filter((p) => ['food', 'cafe', 'bar'].includes(p.category))
      .map((p) => {
        const st = userState.foodState[p.id] || { liked: false, visited: false, rating: 0, review: '' };
        return { ...p, ...st };
      });
  }

  /* -----------------------------------------------------------------------
     3. Formatting & Google Maps Helpers
     ----------------------------------------------------------------------- */
  function fmtKRW(num) {
    const n = Math.round(Number(num) || 0);
    return '₩' + n.toLocaleString('ko-KR');
  }

  function fmtEUR(num) {
    const n = Number(num) || 0;
    return '€' + (Number.isInteger(n) ? n.toLocaleString('ko-KR') : n.toFixed(1));
  }

  function toKRW(amount, currency) {
    const val = Number(amount) || 0;
    if (currency === 'EUR') return val * (Number(userState.budgetConfig.eurRate) || 1500);
    return val;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildGoogleMapsPlaceUrl(place) {
    if (!place) return 'https://www.google.com/maps';
    const cityInfo = CITY_META[place.city] || { nameEn: '' };
    const q = `${place.nameLocal || place.name} ${cityInfo.nameEn}`.trim();
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }

  function buildDayRouteUrl(day, part) {
    let filteredItems = day.items;
    if (part === 'am') {
      filteredItems = day.items.filter((it) => (it.time || '00:00') < '14:00');
    } else if (part === 'pm') {
      filteredItems = day.items.filter((it) => (it.time || '00:00') >= '14:00');
    }
    if (!filteredItems.length) filteredItems = day.items;

    const coords = [];
    const confirmedStay = getConfirmedStayForCity(day.city);
    if ((part === 'am' || part === 'all') && confirmedStay && confirmedStay.placeId) {
      const stayPlace = getPlaceById(confirmedStay.placeId);
      if (stayPlace && stayPlace.lat && stayPlace.lng) {
        coords.push(`${stayPlace.lat},${stayPlace.lng}`);
      }
    }

    filteredItems.forEach((it) => {
      const p = getPlaceById(it.placeId);
      if (p && p.lat && p.lng) {
        const c = `${p.lat},${p.lng}`;
        if (coords[coords.length - 1] !== c) coords.push(c);
      }
    });

    if (coords.length === 0) return 'https://www.google.com/maps';
    if (coords.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords[0])}`;

    const origin = coords[0];
    const destination = coords[coords.length - 1];
    const waypointsArr = coords.slice(1, -1).slice(0, 8);
    const mode = day.travelMode || 'walking';
    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${encodeURIComponent(mode)}`;
    if (waypointsArr.length > 0) {
      url += `&waypoints=${encodeURIComponent(waypointsArr.join('|'))}`;
    }
    return url;
  }

  function showToast(msg) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'hm-toast';
    el.textContent = msg;
    root.innerHTML = '';
    root.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 2400);
  }

  /* -----------------------------------------------------------------------
     4. Clocks, D-Day & Theme
     ----------------------------------------------------------------------- */
  function detectDefaultTodayIndex() {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const matchIdx = baseData.days.findIndex((d) => d.date === todayIso);
    selectedTodayIndex = matchIdx >= 0 ? matchIdx : 1;
    selectedItineraryDayIndex = selectedTodayIndex;
  }

  function startWorldClocks() {
    function tick() {
      const now = new Date();
      const fmt = (tz) =>
        new Intl.DateTimeFormat('ko-KR', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(now);

      const elKst = document.getElementById('clock-kst');
      const elEsp = document.getElementById('clock-esp');
      const elPrt = document.getElementById('clock-prt');
      if (elKst) elKst.textContent = fmt('Asia/Seoul');
      if (elEsp) elEsp.textContent = fmt('Europe/Madrid');
      if (elPrt) elPrt.textContent = fmt('Europe/Lisbon');
    }
    tick();
    setInterval(tick, 15000);
  }

  function initTheme() {
    const theme = userState.theme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    const label = document.getElementById('theme-icon');
    if (label) label.textContent = theme === 'dark' ? '라이트' : '다크';
  }

  /* -----------------------------------------------------------------------
     5. Master Render & Tab Switch
     ----------------------------------------------------------------------- */
  function renderAll() {
    renderHero();
    renderHomePanel();
    renderFlightsPanel();
    renderItineraryPanel();
    renderFoodPanel();
    renderBookingsPanel();
    renderStaysPanel();
    renderBudgetPanel();
    renderPrepPanel();
  }

  function switchTab(tabId, options = {}) {
    activeTab = tabId;

    document.querySelectorAll('#top-nav-tabs .nav-tab').forEach((btn) => {
      const isAct = btn.dataset.tab === tabId;
      btn.classList.toggle('active', isAct);
      if (isAct) {
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    });
    document.querySelectorAll('.mobile-bottom-nav .mobile-tab-btn[data-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    const moreBtn = document.getElementById('btn-mobile-more');
    if (moreBtn) {
      moreBtn.classList.toggle('active', ['bookings', 'stays', 'prep'].includes(tabId));
    }

    if (layoutMode === 'tabs') {
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('active-panel', panel.id === `panel-${tabId}`);
      });
      if (!options.keepScroll) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      const target = document.getElementById(`panel-${tabId}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (tabId === 'itinerary') {
      requestAnimationFrame(() => {
        ensureMapInitialized();
        if (mapInstance) mapInstance.invalidateSize();
        renderMapMarkers();
        setTimeout(() => {
          if (mapInstance) {
            mapInstance.invalidateSize();
            renderMapMarkers();
          }
        }, 180);
      });
    }
  }

  /* -----------------------------------------------------------------------
     6. Header & Summary Strip
     ----------------------------------------------------------------------- */
  function renderHero() {
    const titleEl = document.getElementById('hero-title');
    if (titleEl) titleEl.textContent = userState.coupleTitle;
    document.title = `${userState.coupleTitle} · 바르셀로나 · 포르투 · 마요르카`;

    const start = new Date('2027-05-09T00:00:00+09:00');
    const end = new Date('2027-05-22T23:59:59+09:00');
    const now = new Date();
    const ddayPill = document.getElementById('dday-pill');

    if (now < start) {
      const diffDays = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
      ddayPill.textContent = `D-${diffDays}`;
    } else if (now >= start && now <= end) {
      const dayNum = Math.floor((now - start) / (1000 * 60 * 60 * 24));
      const curDay = baseData.days[dayNum] || baseData.days[0];
      ddayPill.textContent = `Day ${curDay.dayNo} · ${CITY_META[curDay.city]?.name || '이동'}`;
    } else {
      ddayPill.textContent = '2027.05';
    }

    const flights = getFlights();
    const bookedFlightsCount = flights.filter((f) => f.status === 'booked').length;
    const stays = getStays();
    const bookedStaysCities = new Set(stays.filter((s) => s.status === 'booked').map((s) => s.city)).size;
    const bookings = getBookings();
    const actionableBookings = bookings.filter((b) => b.status !== 'onsite');
    const doneBookings = actionableBookings.filter((b) => b.status === 'booked').length;
    const foods = getFoodPlaces();
    const likedFoods = foods.filter((f) => f.liked).length;

    const totalPlannedKRW = userState.budgetItems.reduce((acc, it) => acc + toKRW(it.planned, it.currency), 0);
    const totalActualKRW = userState.budgetItems.reduce((acc, it) => acc + toKRW(it.actual, it.currency), 0);

    const navFlightBadge = document.getElementById('nav-badge-flights');
    if (navFlightBadge) {
      if (bookedFlightsCount === flights.length) {
        navFlightBadge.textContent = '완료';
        navFlightBadge.className = 'text-[11px] px-1.5 py-0.2 rounded status-booked';
      } else {
        navFlightBadge.textContent = bookedFlightsCount === 0 ? '미예약' : `${bookedFlightsCount}/${flights.length}`;
        navFlightBadge.className = 'text-[11px] px-1.5 py-0.2 rounded status-todo';
      }
    }

    const stats = [
      { label: '일정', value: '12박 14일', sub: '5/9 직항 출발 · 5/22 도착', tab: 'home' },
      { label: '항공권', value: `${bookedFlightsCount} / ${flights.length} 구간`, sub: bookedFlightsCount === 0 ? '전 구간 예약 전' : '발권 현황 보기', tab: 'flights' },
      { label: '숙소', value: `${bookedStaysCities} / 3 도시`, sub: `후보 ${stays.length}곳 비교`, tab: 'stays' },
      { label: '필수 예약', value: `${doneBookings} / ${actionableBookings.length} 완료`, sub: '투어·입장권·렌터카', tab: 'bookings' },
      { label: '장소·맛집', value: `${getAllPlaces().length}곳`, sub: `맛집 ${foods.length} · 찜 ${likedFoods}`, tab: 'food' },
      { label: '예상 예산', value: `${Math.round(totalPlannedKRW / 10000).toLocaleString()}만 원`, sub: `결제 ${Math.round(totalActualKRW / 10000).toLocaleString()}만 원`, tab: 'budget' }
    ];

    document.getElementById('hero-stats-grid').innerHTML = stats
      .map(
        (s) => `
      <button type="button" data-jump-tab="${s.tab}" class="px-3 py-2.5 sm:px-4 sm:py-3 text-left hover:bg-[var(--bg-subtle)] transition cursor-pointer min-w-0">
        <div class="text-[11px] text-[var(--text-muted)] truncate">${escapeHtml(s.label)}</div>
        <div class="text-sm sm:text-base font-bold tabular-nums mt-0.5 text-[var(--text-main)] truncate">${escapeHtml(s.value)}</div>
        <div class="text-[10px] sm:text-xs text-[var(--text-sub)] truncate">${escapeHtml(s.sub)}</div>
      </button>
    `
      )
      .join('');
  }

  /* -----------------------------------------------------------------------
     7. PANEL 1: Calendar · Today Briefing · Cities · Prep Order
     ----------------------------------------------------------------------- */
  function renderHomePanel() {
    renderMay2027Calendar();

    const days = getDays();
    const selectEl = document.getElementById('today-day-select');
    selectEl.innerHTML = days
      .map(
        (d, idx) =>
          `<option value="${idx}" ${idx === selectedTodayIndex ? 'selected' : ''}>Day ${d.dayNo} · ${d.date.slice(5).replace('-', '/')} (${d.dow}) · ${d.cityLabel}</option>`
      )
      .join('');

    renderTodayFocusCard();

    // City Overview Cards
    document.getElementById('city-overview-cards').innerHTML = baseData.trip.cities
      .map((c) => {
        const confirmed = getConfirmedStayForCity(c.code);
        return `
        <div class="hm-card city-stripe-${c.code} p-4 sm:p-5 cursor-pointer hover:bg-[var(--bg-subtle)] transition" data-city-jump="${c.code}">
          <div class="flex items-center justify-between text-xs text-[var(--text-sub)] mb-1.5">
            <span class="inline-flex items-center gap-1.5 font-semibold text-[var(--text-main)]">
              <span class="city-dot dot-${c.code}"></span>${escapeHtml(c.name)} (${c.nights}박)
            </span>
            <span class="tabular-nums">${escapeHtml(c.dateRange)}</span>
          </div>
          <p class="text-xs sm:text-sm text-[var(--text-sub)] mb-3">${escapeHtml(c.vibe)}</p>
          <div class="pt-2.5 border-t border-[var(--border-line)] flex items-center justify-between text-xs">
            <span class="text-[var(--text-muted)]">${escapeHtml(c.utcOffset)}</span>
            <span class="font-semibold text-[var(--text-main)]">
              ${confirmed ? '확정 숙소: ' + escapeHtml(confirmed.name) : '일정·지도 보기 →'}
            </span>
          </div>
        </div>
      `;
      })
      .join('');

    // Prep Order
    document.getElementById('roadmap-list').innerHTML = baseData.roadmap
      .map(
        (r, i) => `
      <div class="hm-card p-4 flex flex-col justify-between">
        <div>
          <div class="text-[11px] font-semibold text-[var(--text-muted)] mb-1">0${i + 1}</div>
          <div class="font-bold text-sm mb-1.5 leading-snug">${escapeHtml(r.title)}</div>
          <p class="text-xs text-[var(--text-sub)] leading-relaxed">${escapeHtml(r.desc)}</p>
        </div>
        <button type="button" data-jump-tab="${r.targetTab}" class="mt-3 text-left text-xs font-semibold text-[var(--text-main)] hover:underline cursor-pointer">
          바로가기 →
        </button>
      </div>
    `
      )
      .join('');
  }

  function renderMay2027Calendar() {
    const grid = document.getElementById('may-calendar-grid');
    const days = getDays();
    const dayMap = {};
    days.forEach((d, idx) => {
      dayMap[d.date] = { ...d, idx };
    });

    const startCell = new Date(2027, 3, 25);
    const cellsHtml = [];

    for (let i = 0; i < 42; i++) {
      const dt = new Date(startCell.getFullYear(), startCell.getMonth(), startCell.getDate() + i);
      const y = dt.getFullYear();
      const m = dt.getMonth() + 1;
      const dNum = dt.getDate();
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
      const isMay = m === 5;
      const dow = dt.getDay();
      const tripDay = dayMap[iso];
      const isSelected = tripDay && tripDay.idx === selectedTodayIndex;

      let eventHtml = '';
      if (tripDay) {
        const badgeCls =
          tripDay.dayNo === 0 || tripDay.dayNo === 14
            ? 'city-badge-common'
            : CITY_META[tripDay.city]?.badge || 'city-badge-bcn';

        const shortMobileLabel =
          tripDay.dayNo === 0 ? '전야'
          : tripDay.dayNo === 1 ? '출국·바셀'
          : tripDay.dayNo === 13 ? '귀국편'
          : tripDay.dayNo === 14 ? '도착'
          : tripDay.city === 'bcn' ? '바셀'
          : tripDay.city === 'opo' ? '포르투'
          : '마요르카';

        eventHtml = `
          <div class="cal-city-bar ${badgeCls}">
            <span class="sm:hidden">${shortMobileLabel}</span>
            <span class="hidden sm:inline">${escapeHtml(tripDay.cityLabel)}</span>
          </div>
          <div class="cal-note-chip">${escapeHtml(tripDay.calendarTag)}</div>
        `;
      }

      const dayLabel = dNum === 1 ? `${m}/1` : `${dNum}`;
      const numColor = !isMay && !tripDay
        ? 'text-[var(--text-muted)]'
        : dow === 0
        ? 'text-rose-600'
        : dow === 6
        ? 'text-blue-600'
        : 'text-[var(--text-sub)]';

      cellsHtml.push(`
        <div class="calendar-cell ${!isMay && !tripDay ? 'is-outside' : ''} ${tripDay ? 'is-trip-day' : ''} ${isSelected ? 'is-selected-day' : ''}"
             ${tripDay ? `data-cal-day-idx="${tripDay.idx}"` : ''}>
          <div class="cal-date-num text-xs font-semibold tabular-nums ${numColor}">${dayLabel}</div>
          ${eventHtml}
        </div>
      `);
    }

    grid.innerHTML = cellsHtml.join('');
  }

  function renderTodayFocusCard() {
    const days = getDays();
    const day = days[selectedTodayIndex] || days[1];
    const cm = CITY_META[day.city] || CITY_META.bcn;
    const confirmedStay = getConfirmedStayForCity(day.city);
    const dayBookings = getBookings().filter((b) => b.date === day.date);

    const amUrl = buildDayRouteUrl(day, 'am');
    const pmUrl = buildDayRouteUrl(day, 'pm');
    const allUrl = buildDayRouteUrl(day, 'all');

    document.getElementById('today-focus-content').innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div class="lg:col-span-7 space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2.5 py-0.5 rounded text-xs font-semibold ${cm.badge}">
              Day ${day.dayNo} · ${day.date} (${day.dow}) · ${escapeHtml(day.cityLabel)}
            </span>
            <span class="text-xs text-[var(--text-muted)]">${escapeHtml(day.calendarTag)}</span>
          </div>
          <h3 class="text-base sm:text-lg font-bold">${escapeHtml(day.theme)}</h3>

          <div class="divide-y divide-[var(--border-line)] border-t border-b border-[var(--border-line)]">
            ${day.items
              .map((it, i) => {
                const place = getPlaceById(it.placeId);
                const title = it.customTitle || place?.name || '일정';
                const mapUrl = buildGoogleMapsPlaceUrl(place);
                return `
                <div class="py-2.5 flex items-start justify-between gap-3">
                  <div class="flex items-start gap-3 min-w-0">
                    <span class="text-xs font-semibold text-[var(--text-sub)] tabular-nums pt-0.5 w-11 shrink-0">${escapeHtml(it.time)}</span>
                    <div class="min-w-0">
                      <div class="font-semibold text-sm">${i + 1}. ${escapeHtml(title)}</div>
                      <div class="text-xs text-[var(--text-sub)] line-clamp-2 mt-0.5">${escapeHtml(it.memo || place?.summary || '')}</div>
                    </div>
                  </div>
                  ${
                    place
                      ? `<a href="${mapUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm shrink-0">구글맵</a>`
                      : ''
                  }
                </div>
              `;
              })
              .join('')}
          </div>
        </div>

        <div class="lg:col-span-5 flex flex-col justify-between gap-4">
          <div class="space-y-3">
            <div class="p-4 hm-subtle-box">
              <div class="text-xs font-semibold text-[var(--text-sub)] mb-2">구글맵 동선 바로 열기</div>
              <div class="grid grid-cols-2 gap-2 mb-2">
                <a href="${amUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm">오전 동선</a>
                <a href="${pmUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm">오후 동선</a>
              </div>
              <a href="${allUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-primary w-full text-xs">하루 전체 길찾기 열기</a>
              <button type="button" data-open-day-map="${selectedTodayIndex}" class="btn-hm w-full mt-2 text-xs">
                상세 지도·타임라인 탭에서 보기 →
              </button>
            </div>

            <div class="p-4 rounded-xl border border-[var(--border-line)]">
              <div class="text-xs font-semibold text-[var(--text-sub)] mb-2">당일 예약 확인 (${dayBookings.length}건)</div>
              ${
                dayBookings.length === 0
                  ? `<div class="text-xs text-[var(--text-muted)]">사전 예약 필수 항목이 없는 날입니다.</div>`
                  : dayBookings
                      .map(
                        (b) => `
                    <div class="flex items-center justify-between gap-2 py-1.5 border-b last:border-none border-[var(--border-line)] text-xs">
                      <span class="truncate">${escapeHtml(b.title)}</span>
                      <span class="px-2 py-0.5 rounded font-semibold shrink-0 ${b.status === 'booked' ? 'status-booked' : 'status-todo'}">
                        ${b.status === 'booked' ? '예약완료' : '미예약'}
                      </span>
                    </div>
                  `
                      )
                      .join('')
              }
            </div>

            ${
              confirmedStay
                ? `<div class="p-3 rounded-lg ${cm.badge} text-xs font-medium">확정 숙소: ${escapeHtml(confirmedStay.name)}</div>`
                : ''
            }
          </div>

          <div class="p-3.5 hm-subtle-box text-xs text-[var(--text-sub)] leading-relaxed">
            <strong class="text-[var(--text-main)]">대안 동선 (플랜 B):</strong> ${escapeHtml(day.planB)}
          </div>
        </div>
      </div>
    `;
  }

  /* -----------------------------------------------------------------------
     8. PANEL 2: Flights & Transfers
     ----------------------------------------------------------------------- */
  function renderFlightsPanel() {
    const flights = getFlights();
    const bookedCount = flights.filter((f) => f.status === 'booked').length;

    const badge = document.getElementById('flights-summary-badge');
    if (bookedCount === flights.length) {
      badge.className = 'px-2 py-0.5 rounded text-xs font-semibold status-booked';
      badge.textContent = `${flights.length}/${flights.length} 발권 완료`;
    } else {
      badge.className = 'px-2 py-0.5 rounded text-xs font-semibold status-todo';
      badge.textContent = bookedCount === 0 ? '전 구간 미예약' : `${bookedCount}/${flights.length} 발권`;
    }

    document.getElementById('flights-container').innerHTML = flights
      .map((f) => {
        const depParts = (f.depLocal || '').split('T');
        const arrParts = (f.arrLocal || '').split('T');
        const isBooked = f.status === 'booked';

        return `
        <article class="boarding-pass" style="border-left: 3px solid ${f.cityColor || '#C8553D'}">
          <div class="p-5 sm:p-6">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-[var(--text-sub)]">구간 0${f.order}</span>
                <h3 class="font-bold text-base">${escapeHtml(f.legTitle)}</h3>
              </div>
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-0.5 rounded text-xs font-semibold ${isBooked ? 'status-booked' : 'status-todo'}">
                  ${isBooked ? '발권 완료' : '미예약'}
                </span>
                <button type="button" data-edit-flight="${f.id}" class="btn-hm btn-hm-sm">
                  ${isBooked ? '정보 수정' : '발권 정보 입력'}
                </button>
              </div>
            </div>

            <!-- Route Block (Side-by-Side on Mobile & Desktop) -->
            <div class="p-3.5 sm:p-4 hm-subtle-box">
              <div class="grid grid-cols-11 gap-2 items-center">
                <div class="col-span-4">
                  <div class="text-[11px] sm:text-xs text-[var(--text-sub)] truncate">${escapeHtml(f.depCity)}</div>
                  <div class="iata-code" style="color:${f.cityColor}">${escapeHtml(f.depAirport)}</div>
                  <div class="text-[11px] sm:text-sm font-semibold tabular-nums mt-0.5">${escapeHtml((depParts[0] || '').slice(5))} ${escapeHtml(depParts[1] || '')}</div>
                </div>

                <div class="col-span-3 text-center px-1">
                  <div class="text-[10px] sm:text-xs text-[var(--text-muted)] truncate">${escapeHtml(f.flightNo)}</div>
                  <div class="my-1 border-t border-[var(--border-strong)]"></div>
                  <div class="text-[10px] sm:text-xs text-[var(--text-sub)] line-clamp-1">${escapeHtml(f.airline)}</div>
                </div>

                <div class="col-span-4 text-right">
                  <div class="text-[11px] sm:text-xs text-[var(--text-sub)] truncate">${escapeHtml(f.arrCity)}</div>
                  <div class="iata-code">${escapeHtml(f.arrAirport)}</div>
                  <div class="text-[11px] sm:text-sm font-semibold tabular-nums mt-0.5">${escapeHtml((arrParts[0] || '').slice(5))} ${escapeHtml(arrParts[1] || '')}</div>
                </div>
              </div>
              <div class="mt-2 pt-2 border-t border-[var(--border-line)] text-[11px] sm:text-xs text-[var(--text-sub)] flex items-center justify-between gap-2">
                <span>소요: ${escapeHtml(f.duration)}</span>
                <span class="tabular-nums text-[var(--text-muted)]">${escapeHtml(depParts[0] || '')}</span>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 ${f.seatAssigned ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3 mt-3 text-xs">
              <div class="p-3 rounded-lg border border-[var(--border-line)]">
                <span class="text-[var(--text-muted)] block mb-0.5">터미널</span>
                <strong class="text-[var(--text-main)]">${escapeHtml(f.terminal)}</strong>
              </div>
              <div class="p-3 rounded-lg border border-[var(--border-line)]">
                <span class="text-[var(--text-muted)] block mb-0.5">수하물</span>
                <strong class="text-[var(--text-main)]">${escapeHtml(f.baggage)}</strong>
              </div>
              ${
                f.seatAssigned
                  ? `<div class="p-3 rounded-lg border border-[#C8553D]/40 bg-[#C8553D]/5">
                      <span class="text-[var(--text-muted)] block mb-0.5">사전 지정 좌석</span>
                      <strong class="text-[#C8553D] tabular-nums">${escapeHtml(f.seatAssigned)}</strong>
                    </div>`
                  : ''
              }
              <div class="p-3 rounded-lg border border-[var(--border-line)]">
                <span class="text-[var(--text-muted)] block mb-0.5">${isBooked ? '결제 금액 · 좌석 메모' : '2인 예상 비용 · 좌석 팁'}</span>
                <strong class="text-[var(--text-main)] tabular-nums">
                  ${f.estimatedCostKRW > 0 ? fmtKRW(f.estimatedCostKRW) + ' · ' : f.costIncludedIn ? '왕복 포함 · ' : ''}${escapeHtml(f.seatMemo || '')}
                </strong>
              </div>
            </div>

            ${
              f.seatMap
                ? (() => {
                    const rNo = f.seatMap.row;
                    const sel = new Set(f.seatMap.selected || []);
                    const activeColor = f.seatMap.color || '#0F3460';
                    const blocks = f.seatMap.blocks || [['A', 'B', 'C'], ['D', 'E', 'G'], ['H', 'J', 'K']];
                    const seatBox = (col) => {
                      const active = sel.has(col);
                      return `<span class="inline-flex items-center justify-center w-8 h-7 sm:w-9 sm:h-8 rounded text-[10px] sm:text-[11px] font-bold tabular-nums border" style="${
                        active
                          ? `background:${activeColor};color:#fff;border-color:${activeColor}`
                          : 'background:var(--bg-card);color:var(--text-muted);border-color:var(--border-line);opacity:0.65'
                      }">${active ? '✓' : ''}${rNo}${col}</span>`;
                    };
                    const blocksHtml = blocks
                      .map((grp) => `<div class="flex items-center gap-0.5 sm:gap-1">${grp.map(seatBox).join('')}</div>`)
                      .join('<span class="text-[10px] text-[var(--text-muted)] px-0.5">복도</span>');
                    return `
                    <div class="mt-3 p-3 rounded-lg border border-[var(--border-line)] bg-[var(--bg-subtle)] flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
                      <div>
                        <div class="font-semibold text-[var(--text-main)]">사전 좌석 배치도 (${rNo}열 · ${escapeHtml(f.seatMap.layoutLabel || '3-3-3 배열')})</div>
                        <div class="text-[11px] text-[var(--text-sub)] mt-0.5">${escapeHtml(f.seatMap.caption || '')}</div>
                      </div>
                      <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 shrink-0">
                        ${blocksHtml}
                      </div>
                    </div>`;
                  })()
                : ''
            }

            ${
              f.pnrMemo
                ? `<div class="mt-3 p-2.5 rounded-lg status-booked text-xs font-medium">메모: ${escapeHtml(f.pnrMemo)}</div>`
                : ''
            }

            <p class="mt-3 text-xs text-[var(--text-sub)] leading-relaxed bg-[var(--bg-subtle)] p-3 rounded-lg">
              <strong class="text-[var(--text-main)]">${isBooked ? '탑승·출국 체크:' : '발권 참고:'}</strong> ${escapeHtml(f.importantNote)}
            </p>

            <div class="boarding-divider"></div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div class="lg:col-span-6 space-y-2">
                <div class="text-xs font-semibold text-[var(--text-sub)]">${isBooked ? '확정 항공편 상세 및 조회' : '추천 항공편 후보 및 검색'}</div>
                ${(f.candidates || [])
                  .map(
                    (c) => `
                  <div class="p-3 rounded-lg border border-[var(--border-line)] text-xs">
                    <div class="font-semibold text-[var(--text-main)]">${escapeHtml(c.name)} <span class="text-[var(--text-sub)] tabular-nums">(${escapeHtml(c.time)})</span></div>
                    <div class="text-[var(--text-sub)] mt-0.5">${escapeHtml(c.note)}</div>
                  </div>
                `
                  )
                  .join('')}
                <div class="flex flex-wrap gap-1.5 pt-1">
                  ${
                    isBooked
                      ? `
                    <a href="${f.bookingUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-primary btn-hm-sm">${escapeHtml(f.bookingLabel || '항공사 예약조회')}</a>
                    ${f.extraUrl ? `<a href="${f.extraUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm">${escapeHtml(f.extraLabel || '항공사 공식')}</a>` : ''}
                    <a href="${f.naverFlightsUrl || f.skyscannerUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm">노선 조회 (네이버)</a>
                    <a href="${f.googleFlightsUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm">Google 항공권</a>
                  `
                      : `
                    <a href="${f.naverFlightsUrl || f.skyscannerUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-primary btn-hm-sm">네이버 항공권 (2인·편도)</a>
                    <a href="${f.googleFlightsUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm">Google 항공권</a>
                    <a href="${f.bookingUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm">${escapeHtml(f.bookingLabel || '항공사 공식 사이트')}</a>
                    ${f.extraUrl ? `<a href="${f.extraUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm">${escapeHtml(f.extraLabel || '추가 비교')}</a>` : ''}
                  `
                  }
                </div>
              </div>

              <div class="lg:col-span-6">
                <div class="text-xs font-semibold text-[var(--text-sub)] mb-2">이동일 타임라인</div>
                <div class="divide-y divide-[var(--border-line)] border border-[var(--border-line)] rounded-lg px-3">
                  ${(f.transferTimeline || [])
                    .map(
                      (t) => `
                    <div class="py-2 flex items-start gap-3 text-xs">
                      <span class="font-semibold tabular-nums shrink-0 w-24 text-[var(--text-sub)]">${escapeHtml(t.time)}</span>
                      <span class="text-[var(--text-main)]">${escapeHtml(t.label)}</span>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>
            </div>
          </div>
        </article>
      `;
      })
      .join('');

    document.getElementById('airport-transfers-grid').innerHTML = (baseData.airportTransfers || [])
      .map((tr) => {
        const cm = CITY_META[tr.city] || CITY_META.bcn;
        return `
        <div class="p-4 rounded-xl border border-[var(--border-line)] ${cm.stripe}">
          <div class="inline-flex items-center gap-1.5 text-xs font-semibold mb-1">
            <span class="city-dot ${cm.dot}"></span>${escapeHtml(cm.name)}
          </div>
          <h4 class="font-bold text-sm mb-3">${escapeHtml(tr.airport)}</h4>
          <div class="space-y-2">
            ${tr.options
              .map(
                (o) => `
              <div class="p-3 hm-subtle-box text-xs">
                <div class="flex items-center justify-between font-semibold mb-1">
                  <span>${escapeHtml(o.method)}</span>
                  <span class="text-[var(--text-sub)] tabular-nums">${escapeHtml(o.time)} · ${escapeHtml(o.cost)}</span>
                </div>
                <p class="text-[var(--text-sub)]">${escapeHtml(o.pros)}</p>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `;
      })
      .join('');
  }

  /* -----------------------------------------------------------------------
     9. PANEL 3: Itinerary & Leaflet Map
     ----------------------------------------------------------------------- */
  function ensureMapInitialized() {
    const mapEl = document.getElementById('honeymoon-map');
    if (!mapEl) return;

    if (typeof L === 'undefined') {
      mapEl.innerHTML =
        '<div style="height:100%;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center;font-size:13px;color:var(--text-sub);">지도 라이브러리를 불러오는 중입니다. 잠시 후 다시 눌러주세요.</div>';
      setTimeout(() => {
        if (typeof L !== 'undefined' && activeTab === 'itinerary') {
          mapEl.innerHTML = '';
          ensureMapInitialized();
        }
      }, 800);
      return;
    }

    if (mapInstance) return;

    mapInstance = L.map('honeymoon-map', { scrollWheelZoom: true }).setView([41.3902, 2.1686], 13);

    // Key-free reliable basemaps (replaces CARTO which began returning "API KEY REQUIRED" tiles)
    const esriStreetLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: '&copy; Esri, HERE, Garmin, OpenStreetMap'
      }
    );

    const osmStandardLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    });

    const esriTopoLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: '&copy; Esri, OpenStreetMap contributors'
      }
    );

    const esriSatelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: '&copy; Esri, Maxar, Earthstar Geographics'
      }
    );

    // Default to Esri World Street/Topo (works 100% without API key or Referer in KakaoTalk/Safari/Chrome),
    // with OSM Detailed Streets & Satellite one tap away in top-right layer switcher.
    const defaultLayer = esriTopoLayer;

    defaultLayer.addTo(mapInstance);

    L.control
      .layers(
        {
          '기본 지도 (깔끔 지형)': esriTopoLayer,
          '도로·명소 지도': esriStreetLayer,
          '상세 골목 지도 (OSM)': osmStandardLayer,
          '위성 사진': esriSatelliteLayer
        },
        null,
        { position: 'topright', collapsed: true }
      )
      .addTo(mapInstance);

    mapLayerGroup = L.layerGroup().addTo(mapInstance);

    // Keep map size synced whenever hidden tab opens, screen rotates, or viewport resizes
    if (typeof ResizeObserver !== 'undefined') {
      let lastW = 0;
      const ro = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (rect && rect.width > 0 && Math.abs(rect.width - lastW) > 4 && mapInstance) {
          lastW = rect.width;
          mapInstance.invalidateSize();
        }
      });
      ro.observe(mapEl);
    }

    renderMapMarkers();
  }

  function createPinIcon(label, bgColor) {
    return L.divIcon({
      className: 'custom-pin-wrapper',
      html: `<div class="hm-map-pin" style="background:${bgColor}"><span>${label}</span></div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -14]
    });
  }

  function renderMapMarkers() {
    if (!mapInstance || !mapLayerGroup) return;
    mapLayerGroup.clearLayers();

    const days = getDays();
    const curDay = days[selectedItineraryDayIndex] || days[1];
    const bounds = [];

    if (mapScope === 'day') {
      const polyPoints = [];
      const confirmedStay = getConfirmedStayForCity(curDay.city);
      if (confirmedStay && confirmedStay.placeId) {
        const sp = getPlaceById(confirmedStay.placeId);
        if (sp && sp.lat && sp.lng) {
          const m = L.marker([sp.lat, sp.lng], { icon: createPinIcon('H', '#2B59C3') });
          m.bindPopup(buildPopupHtml(sp, '확정 숙소 (출발)'));
          m.addTo(mapLayerGroup);
          bounds.push([sp.lat, sp.lng]);
          polyPoints.push([sp.lat, sp.lng]);
        }
      }

      curDay.items.forEach((it, idx) => {
        const p = getPlaceById(it.placeId);
        if (!p || !p.lat || !p.lng) return;
        if (mapCat !== 'all') {
          if (mapCat === 'mustBook' && !p.mustBook) return;
          if (mapCat === 'food' && !['food', 'cafe', 'bar'].includes(p.category)) return;
          if (!['mustBook', 'food'].includes(mapCat) && p.category !== mapCat) return;
        }
        const pinColor = CITY_META[curDay.city]?.color || '#C8553D';
        const marker = L.marker([p.lat, p.lng], { icon: createPinIcon(String(idx + 1), pinColor) });
        marker.bindPopup(buildPopupHtml(p, `${idx + 1}. ${it.time}`, it.memo));
        marker.addTo(mapLayerGroup);
        bounds.push([p.lat, p.lng]);
        polyPoints.push([p.lat, p.lng]);
      });

      if (polyPoints.length >= 2) {
        L.polyline(polyPoints, {
          color: CITY_META[curDay.city]?.color || '#C8553D',
          weight: 3,
          opacity: 0.75,
          dashArray: '6, 6'
        }).addTo(mapLayerGroup);
      }
    } else {
      const allPlaces = getAllPlaces().filter((p) => {
        if (mapScope !== 'all' && p.city !== mapScope) return false;
        if (mapCat === 'mustBook') return !!p.mustBook;
        if (mapCat === 'food') return ['food', 'cafe', 'bar'].includes(p.category);
        if (mapCat !== 'all') return p.category === mapCat;
        return true;
      });

      allPlaces.forEach((p) => {
        if (!p.lat || !p.lng) return;
        const symbol =
          p.category === 'stay' ? 'H' : ['food', 'cafe', 'bar'].includes(p.category) ? 'F' : p.category === 'transport' ? 'A' : '•';
        const color = CITY_META[p.city]?.color || CAT_COLORS[p.category] || '#C8553D';
        const marker = L.marker([p.lat, p.lng], { icon: createPinIcon(symbol, color) });
        marker.bindPopup(buildPopupHtml(p));
        marker.addTo(mapLayerGroup);
        bounds.push([p.lat, p.lng]);
      });
    }

    if (bounds.length === 1) {
      mapInstance.setView(bounds[0], 14);
    } else if (bounds.length > 1) {
      mapInstance.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    }
  }

  function buildPopupHtml(place, stepLabel = '', extraMemo = '') {
    const gmapUrl = buildGoogleMapsPlaceUrl(place);
    return `
      <div style="min-width:210px;max-width:260px;font-family:Pretendard,sans-serif;">
        ${stepLabel ? `<div style="font-size:11px;font-weight:700;color:#665E57;margin-bottom:2px;">${escapeHtml(stepLabel)}</div>` : ''}
        <div style="font-size:14px;font-weight:700;margin-bottom:2px;">${escapeHtml(place.name)}</div>
        <div style="font-size:11px;color:#988F86;margin-bottom:6px;">${escapeHtml(place.nameLocal || '')}</div>
        <div style="font-size:12px;line-height:1.45;margin-bottom:8px;">${escapeHtml(extraMemo || place.summary || '')}</div>
        <div style="display:flex;gap:6px;">
          <a href="${gmapUrl}" target="_blank" rel="noopener"
             style="padding:5px 10px;border-radius:6px;background:#221E1C;color:#fff;font-size:11px;font-weight:600;text-decoration:none;">
            구글맵 열기
          </a>
          ${
            place.bookingUrl
              ? `<a href="${place.bookingUrl}" target="_blank" rel="noopener"
                   style="padding:5px 10px;border-radius:6px;border:1px solid #D5CEC2;color:#221E1C;font-size:11px;font-weight:600;text-decoration:none;">
                  공식 예약
                </a>`
              : ''
          }
        </div>
      </div>
    `;
  }

  function renderItineraryPanel() {
    const days = getDays();
    const curDay = days[selectedItineraryDayIndex] || days[1];
    const bookings = getBookings();

    document.getElementById('itinerary-day-tabs').innerHTML = days
      .map((d, idx) => {
        const active = idx === selectedItineraryDayIndex;
        const cColor = CITY_META[d.city]?.color || '#C8553D';
        return `
        <button type="button" data-itin-day="${idx}"
          class="shrink-0 px-3 py-2 rounded-lg text-left border transition cursor-pointer ${
            active
              ? 'text-white font-semibold'
              : 'bg-[var(--bg-surface)] border-[var(--border-line)] text-[var(--text-main)] hover:bg-[var(--bg-subtle)]'
          }"
          style="${active ? `background:${cColor};border-color:${cColor};` : ''}">
          <div class="text-[11px] opacity-85 tabular-nums">D${d.dayNo} · ${d.date.slice(5).replace('-', '/')} (${d.dow})</div>
          <div class="text-xs font-bold truncate max-w-[120px]">${escapeHtml(d.cityLabel)}</div>
        </button>
      `;
      })
      .join('');

    document.querySelectorAll('#map-scope-buttons button').forEach((b) => {
      b.classList.toggle('btn-hm-primary', b.dataset.scope === mapScope);
    });

    const amUrl = buildDayRouteUrl(curDay, 'am');
    const pmUrl = buildDayRouteUrl(curDay, 'pm');
    const allUrl = buildDayRouteUrl(curDay, 'all');
    const cm = CITY_META[curDay.city] || CITY_META.bcn;

    document.getElementById('selected-day-detail').innerHTML = `
      <div class="hm-card p-5 sm:p-6 ${cm.stripe}">
        <div class="flex flex-wrap items-start justify-between gap-4 pb-4 mb-5 border-b border-[var(--border-line)]">
          <div>
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="px-2 py-0.5 rounded text-xs font-semibold ${cm.badge}">
                Day ${curDay.dayNo} · ${curDay.date} (${curDay.dow}) · ${escapeHtml(curDay.cityLabel)}
              </span>
              <span class="text-xs text-[var(--text-muted)]">${escapeHtml(curDay.calendarTag)}</span>
            </div>
            <h3 class="text-lg font-bold">${escapeHtml(curDay.theme)}</h3>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <a href="${amUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm">오전 동선</a>
            <a href="${pmUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm">오후 동선</a>
            <a href="${allUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-primary btn-hm-sm">전체 구글맵 길찾기</a>
          </div>
        </div>

        <div class="space-y-4">
          ${curDay.items
            .map((it, i) => {
              const place = getPlaceById(it.placeId);
              const title = it.customTitle || place?.name || '일정';
              const gmapUrl = buildGoogleMapsPlaceUrl(place);
              const linkedBooking = it.bookingId ? bookings.find((b) => b.id === it.bookingId) : null;

              return `
              <div class="timeline-item">
                <div class="timeline-dot" style="background:${cm.color}"></div>
                <div class="p-4 rounded-xl border border-[var(--border-line)] bg-[var(--bg-surface)]">
                  <div class="flex flex-wrap items-start justify-between gap-2 mb-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-xs font-bold tabular-nums" style="color:${cm.color}">${escapeHtml(it.time)}</span>
                      <h4 class="font-bold text-sm sm:text-base">${i + 1}. ${escapeHtml(title)}</h4>
                      ${it.stayMin ? `<span class="text-xs text-[var(--text-muted)] tabular-nums">${it.stayMin}분</span>` : ''}
                      ${
                        linkedBooking
                          ? `<span class="px-2 py-0.5 rounded text-[11px] font-semibold ${
                              linkedBooking.status === 'booked'
                                ? 'status-booked'
                                : linkedBooking.status === 'onsite'
                                ? 'status-onsite'
                                : 'status-todo'
                            }">
                              ${linkedBooking.status === 'booked' ? '예약완료' : linkedBooking.status === 'onsite' ? '현장구매' : '미예약'}
                            </span>`
                          : ''
                      }
                    </div>

                    <div class="flex items-center gap-1.5">
                      ${place ? `<a href="${gmapUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm">구글맵</a>` : ''}
                      ${place?.bookingUrl ? `<a href="${place.bookingUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm">예약처</a>` : ''}
                      ${
                        it._isCustom
                          ? `<button type="button" data-del-custom-item="${curDay.date}|${it._customIdx}" class="btn-hm btn-hm-sm text-rose-600">삭제</button>`
                          : `<button type="button" data-edit-item-memo="${curDay.date}|${it._idx}" class="btn-hm btn-hm-sm">메모</button>`
                      }
                    </div>
                  </div>

                  <p class="text-xs sm:text-sm text-[var(--text-sub)] leading-relaxed">${escapeHtml(it.memo || place?.summary || '')}</p>

                  ${
                    place?.closedDays?.length
                      ? `<div class="mt-1.5 text-[11px] font-medium text-rose-600">휴무일: ${place.closedDays.join(', ')}요일 (${escapeHtml(place.hoursNote || '')})</div>`
                      : ''
                  }

                  ${
                    it.moveTo
                      ? `<div class="mt-2 pt-2 border-t border-dashed border-[var(--border-line)] text-xs text-[var(--text-muted)]">
                          이동: <strong class="text-[var(--text-sub)]">${escapeHtml(it.moveTo)}</strong> ${it.moveMin ? `(${it.moveMin}분)` : ''}
                        </div>`
                      : ''
                  }
                </div>
              </div>
            `;
            })
            .join('')}
        </div>

        <details class="mt-5 p-4 hm-subtle-box">
          <summary class="font-semibold text-xs sm:text-sm cursor-pointer list-none flex items-center justify-between">
            <span>우천 · 컨디션 조절 시 대안 동선 (플랜 B)</span>
            <span class="text-xs text-[var(--text-muted)]">펼치기 ▾</span>
          </summary>
          <p class="text-xs sm:text-sm text-[var(--text-sub)] mt-2 leading-relaxed">${escapeHtml(curDay.planB)}</p>
        </details>
      </div>
    `;

    if (mapInstance) renderMapMarkers();
  }

  /* -----------------------------------------------------------------------
     10. PANEL 4: Food & Cafes
     ----------------------------------------------------------------------- */
  function renderFoodPanel() {
    const foods = getFoodPlaces().filter((f) => {
      if (foodFilterCity !== 'all' && f.city !== foodFilterCity) return false;
      if (foodFilterType !== 'all' && !(f.foodType || '').includes(foodFilterType)) return false;
      if (foodOnlyLiked && !f.liked) return false;
      if (foodOnlyVisited && !f.visited) return false;
      return true;
    });

    document.querySelectorAll('#food-city-filters button').forEach((b) => {
      b.classList.toggle('btn-hm-primary', b.dataset.fcity === foodFilterCity);
    });

    const grid = document.getElementById('food-cards-grid');
    if (foods.length === 0) {
      grid.innerHTML = `<div class="col-span-full hm-card p-8 text-center text-sm text-[var(--text-sub)]">해당 조건의 맛집이 없습니다.</div>`;
      return;
    }

    grid.innerHTML = foods
      .map((f) => {
        const cm = CITY_META[f.city] || CITY_META.bcn;
        const gmapUrl = buildGoogleMapsPlaceUrl(f);
        const stars = [1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<button type="button" data-rate-food="${f.id}|${n}" class="text-sm cursor-pointer ${
                n <= (f.rating || 0) ? 'text-amber-500' : 'text-[var(--border-strong)]'
              }">★</button>`
          )
          .join('');

        return `
        <article class="hm-card p-5 flex flex-col justify-between ${cm.stripe}">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-1.5 flex-wrap text-xs">
                <span class="px-2 py-0.5 rounded font-semibold ${cm.badge}">${cm.name}</span>
                <span class="px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-sub)]">${escapeHtml(f.foodType || '식당')}</span>
                <span class="text-[var(--text-muted)] font-medium">${escapeHtml(f.price || '€€')}</span>
              </div>
              <button type="button" data-like-food="${f.id}" class="text-base cursor-pointer leading-none ${f.liked ? 'text-rose-500' : 'text-[var(--text-muted)]'}" title="찜하기">
                ${f.liked ? '♥' : '♡'}
              </button>
            </div>

            <h3 class="font-bold text-base">${escapeHtml(f.name)}</h3>
            <p class="text-xs text-[var(--text-muted)] mb-2">${escapeHtml(f.nameLocal || '')}</p>
            <p class="text-xs text-[var(--text-sub)] mb-3 leading-relaxed">${escapeHtml(f.summary || '')}</p>

            ${
              f.signature
                ? `<div class="p-2.5 hm-subtle-box text-xs mb-2.5">
                    <span class="font-semibold text-[var(--text-main)]">대표 메뉴:</span> <span class="text-[var(--text-sub)]">${escapeHtml(f.signature)}</span>
                  </div>`
                : ''
            }

            <div class="text-xs text-[var(--text-sub)] space-y-0.5 mb-3">
              ${f.hoursNote ? `<div>영업: ${escapeHtml(f.hoursNote)}</div>` : ''}
              ${
                f.closedDays?.length
                  ? `<div class="text-rose-600 font-medium">휴무: ${f.closedDays.join('·')}요일</div>`
                  : ''
              }
              ${f.nearDay ? `<div>추천 동선: ${escapeHtml(f.nearDay)}</div>` : ''}
            </div>
          </div>

          <div class="pt-3 border-t border-[var(--border-line)] space-y-2.5">
            <div class="flex items-center justify-between">
              <label class="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer text-[var(--text-sub)]">
                <input type="checkbox" data-visit-food="${f.id}" ${f.visited ? 'checked' : ''} class="accent-[var(--text-main)] w-3.5 h-3.5" />
                <span>${f.visited ? '방문 완료' : '다녀옴 표시'}</span>
              </label>
              <div class="flex items-center gap-0.5">${stars}</div>
            </div>

            ${f.review ? `<div class="p-2 hm-subtle-box text-xs text-[var(--text-main)]">"${escapeHtml(f.review)}"</div>` : ''}

            <div class="flex gap-1.5">
              <a href="${gmapUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-primary btn-hm-sm flex-1">구글맵</a>
              ${f.bookingUrl ? `<a href="${f.bookingUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm flex-1">예약·홈페이지</a>` : ''}
              <button type="button" data-review-food="${f.id}" class="btn-hm btn-hm-sm">메모</button>
            </div>
          </div>
        </article>
      `;
      })
      .join('');
  }

  /* -----------------------------------------------------------------------
     11. PANEL 5: Bookings Hub
     ----------------------------------------------------------------------- */
  function renderBookingsPanel() {
    const allBookings = getBookings();
    const needCount = allBookings.filter((b) => b.status !== 'onsite').length;
    const doneCount = allBookings.filter((b) => b.status === 'booked').length;
    const pct = needCount ? Math.round((doneCount / needCount) * 100) : 0;

    document.getElementById('booking-summary-banner').innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div class="text-sm font-bold">예약 완료 현황: <span class="tabular-nums">${doneCount} / ${needCount}건 (${pct}%)</span></div>
        <span class="text-xs text-[var(--text-muted)]">오른쪽 상태 태그를 누르면 상태가 전환됩니다</span>
      </div>
      <div class="w-full h-2 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
        <div class="h-full transition-all duration-300" style="width:${pct}%;background:var(--done-text)"></div>
      </div>
    `;

    document.querySelectorAll('#booking-cat-filters button').forEach((b) => {
      b.classList.toggle('btn-hm-primary', b.dataset.bcat === bookingFilterCat);
    });

    const filtered = allBookings
      .filter((b) => {
        if (bookingFilterCat === 'todo-only') return b.status === 'todo';
        if (bookingFilterCat !== 'all') return b.category === bookingFilterCat;
        return true;
      })
      .sort((a, b) => (a.priority || 9) - (b.priority || 9));

    document.getElementById('bookings-list').innerHTML = filtered
      .map((b) => {
        const cm = CITY_META[b.city] || CITY_META.common;
        const stClass = b.status === 'booked' ? 'status-booked' : b.status === 'onsite' ? 'status-onsite' : 'status-todo';
        const stLabel = b.status === 'booked' ? '예약완료' : b.status === 'onsite' ? '현장구매' : '미예약';

        return `
        <div class="hm-card p-5 flex flex-col justify-between ${cm.stripe}">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-2 text-xs">
                <span class="px-2 py-0.5 rounded font-semibold ${cm.badge}">${escapeHtml(b.category)} · ${cm.name}</span>
                <span class="text-[var(--text-muted)] tabular-nums">${escapeHtml(b.date)}</span>
              </div>
              <button type="button" data-cycle-booking="${b.id}" class="px-2.5 py-0.5 rounded text-xs font-semibold cursor-pointer ${stClass}">
                ${stLabel}
              </button>
            </div>

            <h3 class="font-bold text-base mb-1">${escapeHtml(b.title)}</h3>
            <div class="text-xs font-medium text-[var(--text-main)] mb-1.5">오픈·권장 시기: ${escapeHtml(b.openNote || b.opensAt)}</div>
            <p class="text-xs text-[var(--text-sub)] mb-3 leading-relaxed">${escapeHtml(b.note || '')}</p>
          </div>

          <div class="pt-3 border-t border-[var(--border-line)] space-y-2">
            <div class="flex items-center justify-between text-xs text-[var(--text-sub)]">
              <span>예상 비용: <strong class="text-[var(--text-main)]">${escapeHtml(b.price)}</strong></span>
              ${b.voucher ? `<span class="text-[var(--done-text)] font-medium">보관: ${escapeHtml(b.voucher)}</span>` : ''}
            </div>
            <div class="flex flex-wrap gap-1.5">
              ${b.url ? `<a href="${b.url}" target="_blank" rel="noopener" class="btn-hm btn-hm-primary btn-hm-sm flex-1">${escapeHtml(b.urlLabel || '공식 사이트')}</a>` : ''}
              ${b.subUrl ? `<a href="${b.subUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm">${escapeHtml(b.subLabel || '비교')}</a>` : ''}
              ${b.thirdUrl ? `<a href="${b.thirdUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm">${escapeHtml(b.thirdLabel || '공식')}</a>` : ''}
              <button type="button" data-voucher-booking="${b.id}" class="btn-hm btn-hm-sm">바우처 메모</button>
            </div>
          </div>
        </div>
      `;
      })
      .join('');
  }

  /* -----------------------------------------------------------------------
     12. PANEL 6: Stays Comparison
     ----------------------------------------------------------------------- */
  function renderStaysPanel() {
    document.getElementById('stay-area-guides').innerHTML = (baseData.areaGuides || [])
      .map((ag) => {
        const cm = CITY_META[ag.city] || CITY_META.bcn;
        return `
        <div class="hm-card p-5 ${cm.stripe}">
          <div class="inline-flex items-center gap-1.5 text-xs font-semibold mb-1.5">
            <span class="city-dot ${cm.dot}"></span>${escapeHtml(ag.cityName)}
          </div>
          <h3 class="font-bold text-sm sm:text-base mb-1">${escapeHtml(ag.recommended)}</h3>
          <p class="text-xs text-[var(--text-sub)] mb-3 leading-relaxed">${escapeHtml(ag.summary)}</p>
          <div class="space-y-2">
            ${ag.zones
              .map(
                (z) => `
              <div class="p-3 hm-subtle-box text-xs space-y-0.5">
                <div class="font-semibold text-[var(--text-main)]">${escapeHtml(z.name)}</div>
                <div class="text-[var(--text-sub)]">장점: ${escapeHtml(z.pros)}</div>
                <div class="text-[var(--text-muted)]">참고: ${escapeHtml(z.cons)}</div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `;
      })
      .join('');

    const stays = getStays();
    const rate = Number(userState.budgetConfig.eurRate) || 1500;

    document.getElementById('stays-city-sections').innerHTML = ['bcn', 'opo', 'pmi']
      .map((cityCode) => {
        const cm = CITY_META[cityCode];
        const cityStays = stays.filter((s) => s.city === cityCode);
        const confirmed = cityStays.find((s) => s.status === 'booked');

        return `
        <div class="hm-card p-5">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div class="flex items-center gap-2">
              <span class="city-dot ${cm.dot}"></span>
              <h3 class="text-base font-bold">
                ${confirmed ? `${cm.name} 확정 숙소: ${escapeHtml(confirmed.name)}` : `${cm.name} 후보 비교 (${cityStays.length}곳)`}
              </h3>
            </div>
            <span class="text-xs text-[var(--text-muted)] tabular-nums">4박 기준 · 1 EUR = ₩${rate.toLocaleString()}</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            ${cityStays
              .map((s) => {
                const isBooked = s.status === 'booked';
                const totalEur = (s.pricePerNight || 0) * (s.nightsCount || 4);
                const totalKrw = totalEur * rate;
                const place = getPlaceById(s.placeId);
                const gmapUrl = place
                  ? buildGoogleMapsPlaceUrl(place)
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name + ' ' + cm.nameEn)}`;

                return `
                <div class="p-4 rounded-xl border flex flex-col justify-between ${
                  isBooked ? 'border-[var(--done-text)] bg-[var(--done-bg)]/30' : 'border-[var(--border-line)]'
                }">
                  <div>
                    <div class="flex items-center justify-between gap-2 mb-1.5 text-xs">
                      <span class="text-[var(--text-sub)]">${escapeHtml(s.area)}</span>
                      <span class="px-2 py-0.5 rounded font-semibold ${isBooked ? 'status-booked' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'}">
                        ${isBooked ? '확정됨' : '후보'}
                      </span>
                    </div>
                    <h4 class="font-bold text-base mb-2.5">${escapeHtml(s.name)}</h4>

                    <div class="p-3 hm-subtle-box mb-3 tabular-nums text-xs">
                      <div class="flex items-baseline justify-between">
                        <span class="text-[var(--text-sub)]">1박</span>
                        <strong class="text-sm text-[var(--text-main)]">${fmtEUR(s.pricePerNight)} <span class="font-normal text-[var(--text-muted)]">(${fmtKRW(s.pricePerNight * rate)})</span></strong>
                      </div>
                      <div class="flex items-baseline justify-between mt-1 pt-1 border-t border-[var(--border-line)]">
                        <span class="text-[var(--text-sub)]">${s.nightsCount || 4}박 합계</span>
                        <strong>${fmtEUR(totalEur)} (${fmtKRW(totalKrw)})</strong>
                      </div>
                    </div>

                    <div class="flex flex-wrap gap-1 mb-2.5">
                      ${(s.features || [])
                        .map((ft) => `<span class="px-2 py-0.5 rounded text-[11px] bg-[var(--bg-subtle)] text-[var(--text-sub)]">${escapeHtml(ft)}</span>`)
                        .join('')}
                    </div>

                    <div class="text-xs text-[var(--text-sub)] space-y-1 mb-3">
                      <div>위치: ${escapeHtml(s.distanceNote || '')}</div>
                      <div>조식: ${escapeHtml(s.breakfast || '')}</div>
                      ${s.notes ? `<div class="text-[var(--text-main)] pt-0.5">${escapeHtml(s.notes)}</div>` : ''}
                    </div>
                  </div>

                  <div class="pt-3 border-t border-[var(--border-line)] space-y-2">
                    <div class="grid grid-cols-2 gap-1.5">
                      <button type="button" data-vote-stay="${s.id}|me" class="btn-hm btn-hm-sm ${s.votes?.me ? 'border-[var(--bcn)] text-[var(--bcn)]' : ''}">
                        종구 ${s.votes?.me ? '♥' : '♡'}
                      </button>
                      <button type="button" data-vote-stay="${s.id}|partner" class="btn-hm btn-hm-sm ${s.votes?.partner ? 'border-[var(--opo)] text-[var(--opo)]' : ''}">
                        쨀린 ${s.votes?.partner ? '♥' : '♡'}
                      </button>
                    </div>

                    <div class="flex gap-1.5">
                      <a href="${s.bookingUrl || 'https://www.booking.com'}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm flex-1">요금 확인</a>
                      <a href="${gmapUrl}" target="_blank" rel="noopener" class="btn-hm btn-hm-sm">지도</a>
                      <button type="button" data-confirm-stay="${s.id}" class="btn-hm btn-hm-sm ${isBooked ? '' : 'btn-hm-primary'}">
                        ${isBooked ? '해제' : '확정'}
                      </button>
                    </div>
                  </div>
                </div>
              `;
              })
              .join('')}
          </div>
        </div>
      `;
      })
      .join('');
  }

  /* -----------------------------------------------------------------------
     13. PANEL 7: Budget Management
     ----------------------------------------------------------------------- */
  function renderBudgetPanel() {
    const cfg = userState.budgetConfig;
    const rate = Number(cfg.eurRate) || 1500;
    const targetKRW = Number(cfg.targetTotalKRW) || 13500000;
    const items = userState.budgetItems || [];

    const inTarget = document.getElementById('input-target-budget');
    const inRate = document.getElementById('input-eur-rate');
    const inPeople = document.getElementById('input-people-count');
    if (inTarget && document.activeElement !== inTarget) inTarget.value = targetKRW;
    if (inRate && document.activeElement !== inRate) inRate.value = rate;
    if (inPeople) inPeople.value = String(cfg.peopleCount || 2);

    const calcEur = document.getElementById('calc-eur');
    const calcKrw = document.getElementById('calc-krw');
    if (calcEur && calcKrw && document.activeElement !== calcKrw) {
      const eurVal = Number(calcEur.value) || 0;
      calcKrw.value = Math.round(eurVal * rate);
      updateTaxRefundHint(eurVal, rate);
    }

    const totalPlannedKRW = items.reduce((s, it) => s + toKRW(it.planned, it.currency), 0);
    const totalActualKRW = items.reduce((s, it) => s + toKRW(it.actual, it.currency), 0);
    const unpaidItemsKRW = items
      .filter((it) => it.payStatus !== 'paid')
      .reduce((s, it) => s + Math.max(0, toKRW(it.planned, it.currency) - toKRW(it.actual, it.currency)), 0);

    const diffFromTarget = targetKRW - totalPlannedKRW;
    const paidPct = totalPlannedKRW > 0 ? Math.min(100, Math.round((totalActualKRW / totalPlannedKRW) * 100)) : 0;

    document.getElementById('budget-kpi-cards').innerHTML = `
      <div class="hm-card p-4">
        <div class="text-xs text-[var(--text-muted)]">목표 예산 (2인)</div>
        <div class="text-xl font-bold tabular-nums mt-1">${fmtKRW(targetKRW)}</div>
        <div class="text-xs text-[var(--text-sub)] mt-1 tabular-nums">1인 ${fmtKRW(targetKRW / 2)}</div>
      </div>

      <div class="hm-card p-4">
        <div class="text-xs text-[var(--text-muted)]">예상 지출 합계</div>
        <div class="text-xl font-bold tabular-nums mt-1">${fmtKRW(totalPlannedKRW)}</div>
        <div class="text-xs mt-1 font-medium tabular-nums ${diffFromTarget >= 0 ? 'text-[var(--done-text)]' : 'text-rose-600'}">
          ${diffFromTarget >= 0 ? `목표 내 여유 +${fmtKRW(diffFromTarget)}` : `목표 초과 -${fmtKRW(Math.abs(diffFromTarget))}`}
        </div>
      </div>

      <div class="hm-card p-4">
        <div class="text-xs text-[var(--text-muted)]">결제 완료 합계</div>
        <div class="text-xl font-bold tabular-nums mt-1 text-[var(--done-text)]">${fmtKRW(totalActualKRW)}</div>
        <div class="text-xs text-[var(--text-sub)] mt-1 tabular-nums">진행률 ${paidPct}%</div>
      </div>

      <div class="hm-card p-4">
        <div class="text-xs text-[var(--text-muted)]">남은 결제 예정액</div>
        <div class="text-xl font-bold tabular-nums mt-1">${fmtKRW(unpaidItemsKRW)}</div>
        <div class="text-xs text-[var(--text-sub)] mt-1 tabular-nums">약 ${fmtEUR(Math.round(unpaidItemsKRW / rate))}</div>
      </div>
    `;

    const categories = ['항공', '숙소', '투어·입장권', '교통·렌터카', '식비·다이닝', '쇼핑·기타'];
    const catTotals = categories.map((cat) => {
      const catItems = items.filter((it) => it.category === cat);
      const planned = catItems.reduce((s, it) => s + toKRW(it.planned, it.currency), 0);
      const actual = catItems.reduce((s, it) => s + toKRW(it.actual, it.currency), 0);
      const share = totalPlannedKRW > 0 ? (planned / totalPlannedKRW) * 100 : 0;
      return { cat, planned, actual, share, color: BUDGET_CAT_COLORS[cat] || '#C8553D' };
    });

    document.getElementById('budget-category-stack').innerHTML = `
      <div class="budget-stack-bar mb-2">
        ${catTotals
          .map((c) => `<div class="budget-stack-seg" style="width:${c.share.toFixed(1)}%;background:${c.color}" title="${c.cat} ${Math.round(c.share)}%"></div>`)
          .join('')}
      </div>
      <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-sub)]">
        ${catTotals
          .map(
            (c) =>
              `<span class="inline-flex items-center gap-1.5 tabular-nums"><span class="city-dot" style="background:${c.color}"></span>${c.cat} ${Math.round(c.share)}%</span>`
          )
          .join('')}
      </div>
    `;

    document.getElementById('budget-category-bars').innerHTML = catTotals
      .map((c) => {
        const paidRatio = c.planned > 0 ? Math.min(100, Math.round((c.actual / c.planned) * 100)) : 0;
        return `
        <div>
          <div class="flex items-center justify-between text-xs mb-1 tabular-nums">
            <span class="font-semibold flex items-center gap-1.5">
              <span class="city-dot" style="background:${c.color}"></span>${escapeHtml(c.cat)}
            </span>
            <span class="text-[var(--text-sub)]">
              예상 <strong class="text-[var(--text-main)]">${fmtKRW(c.planned)}</strong> · 결제 <strong class="text-[var(--done-text)]">${fmtKRW(c.actual)}</strong>
            </span>
          </div>
          <div class="w-full h-1.5 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
            <div class="h-full transition-all" style="width:${paidRatio}%;background:${c.color}"></div>
          </div>
        </div>
      `;
      })
      .join('');

    const cityGroups = [
      { key: 'common', label: '공통·국제선', dot: 'dot-common', color: '#8C6D46' },
      { key: 'bcn', label: '바르셀로나 (4박)', dot: 'dot-bcn', color: '#C8553D' },
      { key: 'opo', label: '포르투 (4박)', dot: 'dot-opo', color: '#2B59C3' },
      { key: 'pmi', label: '마요르카 (4박)', dot: 'dot-pmi', color: '#2A9D8F' }
    ];

    document.getElementById('budget-city-bars').innerHTML = cityGroups
      .map((cg) => {
        const cPlanned = items.filter((it) => it.city === cg.key).reduce((s, it) => s + toKRW(it.planned, it.currency), 0);
        const pct = totalPlannedKRW > 0 ? Math.round((cPlanned / totalPlannedKRW) * 100) : 0;
        return `
        <div>
          <div class="flex items-center justify-between text-xs mb-1 tabular-nums">
            <span class="font-semibold inline-flex items-center gap-1.5"><span class="city-dot ${cg.dot}"></span>${cg.label}</span>
            <span><strong>${fmtKRW(cPlanned)}</strong> <span class="text-[var(--text-muted)]">(${pct}%)</span></span>
          </div>
          <div class="w-full h-1.5 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
            <div class="h-full" style="width:${pct}%;background:${cg.color}"></div>
          </div>
        </div>
      `;
      })
      .join('');

    const fCat = document.getElementById('filter-budget-cat')?.value || 'all';
    const fCity = document.getElementById('filter-budget-city')?.value || 'all';
    const fStatus = document.getElementById('filter-budget-status')?.value || 'all';

    const filteredItems = items.filter((it) => {
      if (fCat !== 'all' && it.category !== fCat) return false;
      if (fCity !== 'all' && it.city !== fCity) return false;
      if (fStatus !== 'all' && it.payStatus !== fStatus) return false;
      return true;
    });

    document.getElementById('budget-ledger-container').innerHTML = `
      <!-- Mobile Stacked Cards -->
      <div class="md:hidden space-y-2.5 tabular-nums">
        ${filteredItems
          .map((it) => {
            const cm = CITY_META[it.city] || CITY_META.common;
            const plannedKRW = toKRW(it.planned, it.currency);
            const actualKRW = toKRW(it.actual, it.currency);
            const stClass = it.payStatus === 'paid' ? 'status-booked' : it.payStatus === 'deposit' ? 'status-onsite' : 'status-todo';
            const stText = it.payStatus === 'paid' ? '결제완료' : it.payStatus === 'deposit' ? '예약금' : '미결제';

            return `
            <div class="p-3.5 rounded-xl border border-[var(--border-line)] ${cm.stripe} space-y-2">
              <div class="flex items-center justify-between gap-2">
                <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${cm.badge}">${escapeHtml(it.category)} · ${cm.name}</span>
                <button type="button" data-cycle-pay="${it.id}" class="px-2.5 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${stClass}">
                  ${stText}
                </button>
              </div>
              <div>
                <div class="font-bold text-sm text-[var(--text-main)]">${escapeHtml(it.title)}</div>
                <div class="text-xs text-[var(--text-muted)] mt-0.5">${escapeHtml(it.method || '')}${it.memo ? ' · ' + escapeHtml(it.memo) : ''}</div>
              </div>
              <div class="pt-2 border-t border-[var(--border-line)] flex items-end justify-between gap-2">
                <div class="text-xs space-y-0.5">
                  <div class="text-[var(--text-sub)]">
                    예상: <strong class="text-[var(--text-main)]">${it.currency === 'EUR' ? `${fmtEUR(it.planned)} (${fmtKRW(plannedKRW)})` : fmtKRW(it.planned)}</strong>
                  </div>
                  <div class="${it.actual > 0 ? 'text-[var(--done-text)] font-semibold' : 'text-[var(--text-muted)]'}">
                    결제: ${it.currency === 'EUR' ? `${fmtEUR(it.actual)}${it.actual > 0 ? ` (${fmtKRW(actualKRW)})` : ''}` : fmtKRW(it.actual)}
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button type="button" data-edit-budget="${it.id}" class="btn-hm btn-hm-sm !min-h-[30px] !px-2.5">수정</button>
                  <button type="button" data-del-budget="${it.id}" class="btn-hm btn-hm-sm !min-h-[30px] !px-2 text-[var(--text-muted)]">삭제</button>
                </div>
              </div>
            </div>
          `;
          })
          .join('')}
      </div>

      <!-- Desktop Table -->
      <div class="hidden md:block overflow-x-auto">
        <table class="w-full text-left border-collapse min-w-[680px]">
          <thead>
            <tr class="border-b border-[var(--border-strong)] text-xs text-[var(--text-muted)]">
              <th class="py-2 px-2 font-medium">구분</th>
              <th class="py-2 px-2 font-medium">항목명</th>
              <th class="py-2 px-2 text-right font-medium">예상 금액</th>
              <th class="py-2 px-2 text-right font-medium">실제 결제</th>
              <th class="py-2 px-2 text-center font-medium">상태</th>
              <th class="py-2 px-2 text-right font-medium">관리</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--border-line)] text-xs sm:text-sm tabular-nums">
            ${filteredItems
              .map((it) => {
                const cm = CITY_META[it.city] || CITY_META.common;
                const plannedKRW = toKRW(it.planned, it.currency);
                const actualKRW = toKRW(it.actual, it.currency);
                const stClass = it.payStatus === 'paid' ? 'status-booked' : it.payStatus === 'deposit' ? 'status-onsite' : 'status-todo';
                const stText = it.payStatus === 'paid' ? '결제완료' : it.payStatus === 'deposit' ? '예약금' : '미결제';

                return `
                <tr class="hover:bg-[var(--bg-subtle)]/60">
                  <td class="py-2.5 px-2 align-top whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${cm.badge}">${escapeHtml(it.category)} · ${cm.name}</span>
                  </td>
                  <td class="py-2.5 px-2 align-top">
                    <div class="font-semibold text-[var(--text-main)]">${escapeHtml(it.title)}</div>
                    <div class="text-xs text-[var(--text-muted)]">${escapeHtml(it.method || '')}${it.memo ? ' · ' + escapeHtml(it.memo) : ''}</div>
                  </td>
                  <td class="py-2.5 px-2 align-top text-right whitespace-nowrap">
                    <div class="font-semibold">${it.currency === 'EUR' ? fmtEUR(it.planned) : fmtKRW(it.planned)}</div>
                    ${it.currency === 'EUR' ? `<div class="text-[11px] text-[var(--text-muted)]">${fmtKRW(plannedKRW)}</div>` : ''}
                  </td>
                  <td class="py-2.5 px-2 align-top text-right whitespace-nowrap">
                    <div class="font-semibold ${it.actual > 0 ? 'text-[var(--done-text)]' : 'text-[var(--text-muted)]'}">
                      ${it.currency === 'EUR' ? fmtEUR(it.actual) : fmtKRW(it.actual)}
                    </div>
                    ${it.currency === 'EUR' && it.actual > 0 ? `<div class="text-[11px] text-[var(--text-muted)]">${fmtKRW(actualKRW)}</div>` : ''}
                  </td>
                  <td class="py-2.5 px-2 align-top text-center whitespace-nowrap">
                    <button type="button" data-cycle-pay="${it.id}" class="px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${stClass}">
                      ${stText}
                    </button>
                  </td>
                  <td class="py-2.5 px-2 align-top text-right whitespace-nowrap">
                    <button type="button" data-edit-budget="${it.id}" class="btn-hm btn-hm-sm !min-h-[28px] !px-2">수정</button>
                    <button type="button" data-del-budget="${it.id}" class="btn-hm btn-hm-sm !min-h-[28px] !px-2 text-[var(--text-muted)] hover:text-rose-600">삭제</button>
                  </td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function updateTaxRefundHint(eurAmount, rate) {
    const el = document.getElementById('tax-refund-hint');
    if (!el) return;
    const minRef = Math.round(eurAmount * 0.105);
    const maxRef = Math.round(eurAmount * 0.13);
    const avgKrw = Math.round(((minRef + maxRef) / 2) * rate);
    el.textContent = `스페인 쇼핑 €${eurAmount.toLocaleString()} 기준 예상 환급액: €${minRef}~${maxRef} (${fmtKRW(avgKrw)})`;
  }

  /* -----------------------------------------------------------------------
     14. PANEL 8: Checklist · Honeymoon Mail · Tips
     ----------------------------------------------------------------------- */
  function renderPrepPanel() {
    const list = userState.checklist || [];
    const done = list.filter((c) => c.done).length;
    const pct = list.length ? Math.round((done / list.length) * 100) : 0;

    document.getElementById('checklist-progress-header').innerHTML = `
      <div class="flex items-center justify-between mb-1.5 text-sm">
        <span class="font-bold">체크 진행률 <span class="tabular-nums">${done} / ${list.length} (${pct}%)</span></span>
      </div>
      <div class="w-full h-2 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
        <div class="h-full bg-[var(--text-main)] transition-all" style="width:${pct}%"></div>
      </div>
    `;

    document.querySelectorAll('#checklist-group-filters button').forEach((b) => {
      b.classList.toggle('btn-hm-primary', b.dataset.cgroup === checklistFilterGroup);
    });

    const filtered = list.filter((c) => checklistFilterGroup === 'all' || c.group === checklistFilterGroup);
    document.getElementById('checklist-items-container').innerHTML = filtered
      .map(
        (c) => `
      <div class="flex items-start justify-between gap-2 p-3 rounded-lg border border-[var(--border-line)] ${c.done ? 'opacity-55' : ''}">
        <label class="flex items-start gap-2.5 cursor-pointer flex-1">
          <input type="checkbox" data-toggle-check="${c.id}" ${c.done ? 'checked' : ''} class="mt-1 accent-[var(--text-main)] w-4 h-4 shrink-0" />
          <div>
            <div class="text-sm font-medium ${c.done ? 'line-through text-[var(--text-muted)]' : ''}">${escapeHtml(c.text)}</div>
            <div class="text-[11px] text-[var(--text-muted)] mt-0.5">${escapeHtml(c.group || '준비')} · ${escapeHtml(c.due || '출발 전')}</div>
          </div>
        </label>
        <button type="button" data-del-check="${c.id}" class="text-xs text-[var(--text-muted)] hover:text-rose-600 px-1 cursor-pointer">삭제</button>
      </div>
    `
      )
      .join('');

    updateHoneymoonMailPreview();

    document.getElementById('tips-cards-grid').innerHTML = (baseData.tips || [])
      .map(
        (t, idx) => `
      <div class="hm-card p-5">
        <div class="text-xs font-semibold text-[var(--text-muted)] mb-1">TIP ${String(idx + 1).padStart(2, '0')}</div>
        <h4 class="font-bold text-sm sm:text-base mb-1.5">${escapeHtml(t.title)}</h4>
        <p class="text-xs text-[var(--text-sub)] leading-relaxed">${escapeHtml(t.body)}</p>
      </div>
    `
      )
      .join('');
  }

  function updateHoneymoonMailPreview() {
    const hotel = document.getElementById('hm-mail-hotel')?.value.trim() || '[Hotel Name]';
    const dates = document.getElementById('hm-mail-dates')?.value.trim() || 'May [Check-in] to May [Check-out], 2027';
    const ref = document.getElementById('hm-mail-ref')?.value.trim() || '#[Booking Number]';
    const names = document.getElementById('hm-mail-names')?.value.trim() || 'Jonggu & Chaerin';

    const previewEl = document.getElementById('hm-mail-preview');
    if (!previewEl) return;

    previewEl.value = `Subject: Honeymoon Stay Request – Reservation ${ref} (${names})

Dear Reservations Team at ${hotel},

Warm greetings from South Korea.
My partner and I are delighted to stay at ${hotel} (${dates}, Booking Reference: ${ref}) to celebrate our honeymoon.

As this is a very special trip for us, we would be grateful if you could kindly assign us a quiet room on a higher floor with a lovely view (and a king/double bed), subject to availability upon arrival.

Thank you very much for your warm hospitality, and we look forward to staying with you.

Warm regards,
${names}`;
  }

  /* -----------------------------------------------------------------------
     15. Modals
     ----------------------------------------------------------------------- */
  function openModal(html, onBind) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="hm-modal-backdrop" id="active-modal-backdrop">
        <div class="hm-modal-box">
          ${html}
        </div>
      </div>
    `;
    document.getElementById('active-modal-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'active-modal-backdrop' || e.target.closest('[data-close-modal]')) {
        closeModal();
      }
    });
    if (onBind) onBind(root);
  }

  function closeModal() {
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
  }

  function openFlightEditModal(flightId) {
    const flight = getFlights().find((f) => f.id === flightId);
    if (!flight) return;

    openModal(
      `
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold">항공편 정보 수정</h3>
        <button type="button" data-close-modal class="btn-hm btn-hm-sm">닫기</button>
      </div>
      <form id="form-edit-flight" class="space-y-3 text-sm">
        <div>
          <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">상태</label>
          <select name="status" class="hm-input font-semibold">
            <option value="todo" ${flight.status === 'todo' ? 'selected' : ''}>미예약</option>
            <option value="booked" ${flight.status === 'booked' ? 'selected' : ''}>발권 완료</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">항공사</label>
            <input name="airline" value="${escapeHtml(flight.airline)}" class="hm-input" />
          </div>
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">편명</label>
            <input name="flightNo" value="${escapeHtml(flight.flightNo)}" class="hm-input" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">출발 현지시각</label>
            <input type="datetime-local" name="depLocal" value="${escapeHtml(flight.depLocal)}" class="hm-input" />
          </div>
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">도착 현지시각</label>
            <input type="datetime-local" name="arrLocal" value="${escapeHtml(flight.arrLocal)}" class="hm-input" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">터미널</label>
            <input name="terminal" value="${escapeHtml(flight.terminal)}" class="hm-input" />
          </div>
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">2인 결제 금액 (KRW)</label>
            <input type="number" name="paidKRW" value="${flight.estimatedCostKRW || 0}" class="hm-input tabular-nums" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">수하물</label>
            <input name="baggage" value="${escapeHtml(flight.baggage)}" class="hm-input" />
          </div>
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">사전 지정 좌석</label>
            <input name="seatAssigned" value="${escapeHtml(flight.seatAssigned || '')}" placeholder="예: 34G · 34H" class="hm-input" />
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">발권처·개인 메모 (현재 기기에만 저장)</label>
          <input name="pnrMemo" value="${escapeHtml(flight.pnrMemo || '')}" placeholder="예: 하나투어 발권 · 좌석 지정 완료" class="hm-input" />
        </div>
        <label class="flex items-center gap-2 text-xs pt-1 cursor-pointer">
          <input type="checkbox" name="syncBudget" checked class="w-4 h-4 accent-[var(--text-main)]" />
          <span>발권 완료 시 예산 장부 및 예약 관리 상태 함께 반영</span>
        </label>
        <div class="flex justify-end gap-2 pt-3">
          <button type="button" data-close-modal class="btn-hm">취소</button>
          <button type="submit" class="btn-hm btn-hm-primary">저장</button>
        </div>
      </form>
    `,
      () => {
        document.getElementById('form-edit-flight').addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const status = fd.get('status');
          const paidKRW = Number(fd.get('paidKRW')) || 0;

          userState.flightOverrides[flightId] = {
            status,
            airline: fd.get('airline'),
            flightNo: fd.get('flightNo'),
            depLocal: fd.get('depLocal'),
            arrLocal: fd.get('arrLocal'),
            terminal: fd.get('terminal'),
            baggage: fd.get('baggage'),
            seatAssigned: fd.get('seatAssigned').trim(),
            pnrMemo: fd.get('pnrMemo'),
            estimatedCostKRW: paidKRW
          };

          if (fd.get('syncBudget')) {
            const bookingMap = { f1: 'b-flight-icn-bcn', f2: 'b-flight-bcn-opo', f3: 'b-flight-opo-pmi', f4: 'b-flight-pmi-bcn', f5: 'b-flight-bcn-icn' };
            const bId = bookingMap[flightId];
            if (bId) {
              userState.bookingOverrides[bId] = { ...(userState.bookingOverrides[bId] || {}), status: status === 'booked' ? 'booked' : 'todo' };
            }
            const budgetMap = { f1: 'bi-1', f2: 'bi-2', f3: 'bi-3', f4: 'bi-4', f5: 'bi-1' };
            const bItem = userState.budgetItems.find((x) => x.id === budgetMap[flightId]);
            if (bItem && status === 'booked' && paidKRW > 0) {
              bItem.currency = 'KRW';
              bItem.planned = paidKRW;
              bItem.actual = paidKRW;
              bItem.payStatus = 'paid';
            }
          }

          saveUserState();
          closeModal();
          renderAll();
          showToast('항공편 정보가 저장되었습니다.');
        });
      }
    );
  }

  function openBudgetItemModal(editId = null) {
    const existing = editId ? userState.budgetItems.find((x) => x.id === editId) : null;
    const item = existing || {
      category: '항공',
      city: 'common',
      title: '',
      currency: 'EUR',
      planned: 0,
      actual: 0,
      payStatus: 'todo',
      method: '트래블카드',
      memo: ''
    };

    openModal(
      `
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold">${existing ? '예산 항목 수정' : '예산 항목 추가'}</h3>
        <button type="button" data-close-modal class="btn-hm btn-hm-sm">닫기</button>
      </div>
      <form id="form-budget-item" class="space-y-3 text-sm">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">카테고리</label>
            <select name="category" class="hm-input">
              ${['항공', '숙소', '투어·입장권', '교통·렌터카', '식비·다이닝', '쇼핑·기타']
                .map((c) => `<option value="${c}" ${item.category === c ? 'selected' : ''}>${c}</option>`)
                .join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">도시</label>
            <select name="city" class="hm-input">
              <option value="common" ${item.city === 'common' ? 'selected' : ''}>공통·국제선</option>
              <option value="bcn" ${item.city === 'bcn' ? 'selected' : ''}>바르셀로나</option>
              <option value="opo" ${item.city === 'opo' ? 'selected' : ''}>포르투</option>
              <option value="pmi" ${item.city === 'pmi' ? 'selected' : ''}>마요르카</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">항목명</label>
          <input name="title" required value="${escapeHtml(item.title)}" placeholder="예: 마요르카 요트 투어" class="hm-input" />
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">통화</label>
            <select name="currency" class="hm-input">
              <option value="KRW" ${item.currency === 'KRW' ? 'selected' : ''}>KRW (₩)</option>
              <option value="EUR" ${item.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">예상 금액</label>
            <input type="number" step="any" name="planned" value="${item.planned}" class="hm-input tabular-nums" />
          </div>
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">실제 결제액</label>
            <input type="number" step="any" name="actual" value="${item.actual}" class="hm-input tabular-nums" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">결제 상태</label>
            <select name="payStatus" class="hm-input">
              <option value="todo" ${item.payStatus === 'todo' ? 'selected' : ''}>미결제</option>
              <option value="deposit" ${item.payStatus === 'deposit' ? 'selected' : ''}>예약금</option>
              <option value="paid" ${item.payStatus === 'paid' ? 'selected' : ''}>결제완료</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">결제 수단</label>
            <input name="method" value="${escapeHtml(item.method || '')}" class="hm-input" />
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">메모</label>
          <input name="memo" value="${escapeHtml(item.memo || '')}" class="hm-input" />
        </div>
        <div class="flex justify-end gap-2 pt-3">
          <button type="button" data-close-modal class="btn-hm">취소</button>
          <button type="submit" class="btn-hm btn-hm-primary">저장</button>
        </div>
      </form>
    `,
      () => {
        document.getElementById('form-budget-item').addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const payload = {
            id: existing ? existing.id : 'bi-' + Date.now(),
            category: fd.get('category'),
            city: fd.get('city'),
            title: fd.get('title').trim(),
            currency: fd.get('currency'),
            planned: Number(fd.get('planned')) || 0,
            actual: Number(fd.get('actual')) || 0,
            payStatus: fd.get('payStatus'),
            method: fd.get('method').trim(),
            memo: fd.get('memo').trim()
          };

          if (existing) {
            const idx = userState.budgetItems.findIndex((x) => x.id === existing.id);
            if (idx >= 0) userState.budgetItems[idx] = payload;
          } else {
            userState.budgetItems.push(payload);
          }

          saveUserState();
          closeModal();
          renderHero();
          renderBudgetPanel();
          showToast('예산 내역이 저장되었습니다.');
        });
      }
    );
  }

  function openAddFoodModal() {
    openModal(
      `
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold">맛집·카페 추가</h3>
        <button type="button" data-close-modal class="btn-hm btn-hm-sm">닫기</button>
      </div>
      <form id="form-add-food" class="space-y-3 text-sm">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">도시</label>
            <select name="city" class="hm-input">
              <option value="bcn">바르셀로나</option>
              <option value="opo">포르투</option>
              <option value="pmi">마요르카</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">분류</label>
            <select name="foodType" class="hm-input">
              <option value="타파스">타파스</option>
              <option value="해산물·빠에야">해산물·빠에야</option>
              <option value="카페·디저트">카페·디저트</option>
              <option value="바·와인">바·와인</option>
              <option value="파인다이닝">파인다이닝</option>
              <option value="로컬미식">로컬미식</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">이름</label>
          <input name="name" required placeholder="예: 라 플라우타" class="hm-input" />
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">구글맵 검색용 현지 이름</label>
          <input name="nameLocal" placeholder="예: La Flauta Barcelona" class="hm-input" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">대표 메뉴</label>
            <input name="signature" class="hm-input" />
          </div>
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">가격대</label>
            <select name="price" class="hm-input">
              <option value="€">€</option>
              <option value="€€" selected>€€</option>
              <option value="€€€">€€€</option>
              <option value="€€€€">€€€€</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">메모</label>
          <input name="summary" class="hm-input" />
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">예약 링크 (선택)</label>
          <input name="bookingUrl" placeholder="https://..." class="hm-input" />
        </div>
        <div class="flex justify-end gap-2 pt-3">
          <button type="button" data-close-modal class="btn-hm">취소</button>
          <button type="submit" class="btn-hm btn-hm-primary">추가</button>
        </div>
      </form>
    `,
      () => {
        document.getElementById('form-add-food').addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const city = fd.get('city');
          const cityCenter = baseData.trip.cities.find((c) => c.code === city)?.center || [41.39, 2.16];
          const newId = 'custom-food-' + Date.now();

          userState.customPlaces.push({
            id: newId,
            city,
            category: fd.get('foodType').includes('카페') ? 'cafe' : fd.get('foodType').includes('바') ? 'bar' : 'food',
            foodType: fd.get('foodType'),
            name: fd.get('name').trim(),
            nameLocal: fd.get('nameLocal').trim() || fd.get('name').trim(),
            lat: cityCenter[0] + (Math.random() - 0.5) * 0.008,
            lng: cityCenter[1] + (Math.random() - 0.5) * 0.008,
            signature: fd.get('signature').trim(),
            price: fd.get('price'),
            summary: fd.get('summary').trim(),
            bookingUrl: fd.get('bookingUrl').trim(),
            closedDays: []
          });
          userState.foodState[newId] = { liked: true, visited: false, rating: 0, review: '' };

          saveUserState();
          closeModal();
          renderHero();
          renderFoodPanel();
          showToast('맛집이 추가되었습니다.');
        });
      }
    );
  }

  function openAddStayModal() {
    openModal(
      `
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold">숙소 후보 추가</h3>
        <button type="button" data-close-modal class="btn-hm btn-hm-sm">닫기</button>
      </div>
      <form id="form-add-stay" class="space-y-3 text-sm">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">도시</label>
            <select name="city" class="hm-input">
              <option value="bcn">바르셀로나 (4박)</option>
              <option value="opo">포르투 (4박)</option>
              <option value="pmi">마요르카 (4박)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">1박 가격 (EUR)</label>
            <input type="number" name="pricePerNight" required placeholder="350" class="hm-input tabular-nums" />
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">호텔명</label>
          <input name="name" required class="hm-input" />
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">권역·위치</label>
          <input name="area" class="hm-input" />
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">특징 (쉼표 구분)</label>
          <input name="features" placeholder="루프탑 풀, 조식 포함" class="hm-input" />
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">링크</label>
          <input name="bookingUrl" placeholder="https://..." class="hm-input" />
        </div>
        <div>
          <label class="block text-xs font-medium text-[var(--text-sub)] mb-1">메모</label>
          <input name="notes" class="hm-input" />
        </div>
        <div class="flex justify-end gap-2 pt-3">
          <button type="button" data-close-modal class="btn-hm">취소</button>
          <button type="submit" class="btn-hm btn-hm-primary">등록</button>
        </div>
      </form>
    `,
      () => {
        document.getElementById('form-add-stay').addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          userState.customStays.push({
            id: 'stay-custom-' + Date.now(),
            city: fd.get('city'),
            name: fd.get('name').trim(),
            area: fd.get('area').trim() || '시내',
            pricePerNight: Number(fd.get('pricePerNight')) || 0,
            nightsCount: 4,
            features: fd
              .get('features')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            breakfast: '요금제 확인',
            cancellation: '예약처 확인',
            distanceNote: '지도 참조',
            bookingUrl: fd.get('bookingUrl').trim(),
            notes: fd.get('notes').trim(),
            status: 'candidate',
            votes: { me: 0, partner: 0 }
          });
          saveUserState();
          closeModal();
          renderHero();
          renderStaysPanel();
          showToast('숙소 후보가 등록되었습니다.');
        });
      }
    );
  }

  function openBackupModal() {
    openModal(
      `
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold">데이터 백업 및 공유</h3>
        <button type="button" data-close-modal class="btn-hm btn-hm-sm">닫기</button>
      </div>
      <div class="space-y-4 text-sm">
        <div class="p-4 hm-subtle-box">
          <div class="font-semibold mb-1">백업 파일 저장</div>
          <p class="text-xs text-[var(--text-sub)] mb-3">현재 기록한 예산, 항공편, 숙소 투표, 체크리스트를 JSON 파일로 저장해 카톡으로 공유할 수 있습니다.</p>
          <button type="button" id="btn-download-json" class="btn-hm btn-hm-primary w-full">백업 파일(.json) 다운로드</button>
        </div>

        <div class="p-4 hm-subtle-box">
          <div class="font-semibold mb-1">백업 파일 불러오기</div>
          <input type="file" id="input-upload-json" accept=".json" class="hm-input text-xs py-1.5" />
        </div>

        <div class="pt-2 border-t border-[var(--border-line)] flex items-center justify-between">
          <span class="text-xs text-[var(--text-muted)]">초기 데이터로 복원</span>
          <button type="button" id="btn-reset-all" class="btn-hm btn-hm-sm text-rose-600">초기화</button>
        </div>
      </div>
    `,
      () => {
        document.getElementById('btn-download-json').addEventListener('click', () => {
          const blob = new Blob([JSON.stringify(userState, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `jonggu-chaerin-honeymoon-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          showToast('백업 파일이 저장되었습니다.');
        });

        document.getElementById('input-upload-json').addEventListener('change', (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const parsed = JSON.parse(reader.result);
              userState = { ...createInitialUserState(), ...parsed };
              saveUserState();
              closeModal();
              renderAll();
              showToast('데이터를 불러왔습니다.');
            } catch (_) {
              alert('유효한 JSON 파일이 아닙니다.');
            }
          };
          reader.readAsText(file);
        });

        document.getElementById('btn-reset-all').addEventListener('click', () => {
          if (confirm('수정 내역을 모두 초기화할까요?')) {
            localStorage.removeItem(STORAGE_KEY);
            userState = createInitialUserState();
            closeModal();
            renderAll();
            showToast('초기화되었습니다.');
          }
        });
      }
    );
  }

  /* -----------------------------------------------------------------------
     16. Global Event Delegation
     ----------------------------------------------------------------------- */
  function bindGlobalEvents() {
    document.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) {
        switchTab(tabBtn.dataset.tab);
        return;
      }

      const jumpBtn = e.target.closest('[data-jump-tab]');
      if (jumpBtn) {
        switchTab(jumpBtn.dataset.jumpTab);
        return;
      }

      const cityJump = e.target.closest('[data-city-jump]');
      if (cityJump) {
        const cityCode = cityJump.dataset.cityJump;
        mapScope = cityCode;
        const firstDayIdx = getDays().findIndex((d) => d.city === cityCode && d.dayNo > 0);
        if (firstDayIdx >= 0) selectedItineraryDayIndex = firstDayIdx;
        switchTab('itinerary');
        return;
      }

      const calCell = e.target.closest('[data-cal-day-idx]');
      if (calCell) {
        const idx = Number(calCell.dataset.calDayIdx);
        selectedTodayIndex = idx;
        selectedItineraryDayIndex = idx;
        renderHomePanel();
        return;
      }

      const openDayMap = e.target.closest('[data-open-day-map]');
      if (openDayMap) {
        selectedItineraryDayIndex = Number(openDayMap.dataset.openDayMap);
        mapScope = 'day';
        switchTab('itinerary');
        return;
      }

      const itinDayBtn = e.target.closest('[data-itin-day]');
      if (itinDayBtn) {
        selectedItineraryDayIndex = Number(itinDayBtn.dataset.itinDay);
        mapScope = 'day';
        renderItineraryPanel();
        return;
      }

      const scopeBtn = e.target.closest('#map-scope-buttons [data-scope]');
      if (scopeBtn) {
        mapScope = scopeBtn.dataset.scope;
        renderItineraryPanel();
        return;
      }

      const catBtn = e.target.closest('#map-cat-buttons [data-cat]');
      if (catBtn) {
        mapCat = catBtn.dataset.cat;
        document.querySelectorAll('#map-cat-buttons button').forEach((b) => {
          b.classList.toggle('btn-hm-primary', b.dataset.cat === mapCat);
        });
        renderMapMarkers();
        return;
      }

      const editFlightBtn = e.target.closest('[data-edit-flight]');
      if (editFlightBtn) {
        openFlightEditModal(editFlightBtn.dataset.editFlight);
        return;
      }

      const editMemoBtn = e.target.closest('[data-edit-item-memo]');
      if (editMemoBtn) {
        const [date, idxStr] = editMemoBtn.dataset.editItemMemo.split('|');
        const day = getDays().find((d) => d.date === date);
        const curItem = day?.items.find((x) => !x._isCustom && String(x._idx) === idxStr);
        const nextMemo = prompt('일정 메모 수정:', curItem?.memo || '');
        if (nextMemo !== null) {
          userState.dayMemoOverrides[`${date}_${idxStr}`] = nextMemo;
          saveUserState();
          renderItineraryPanel();
          renderHomePanel();
        }
        return;
      }

      const delCustomBtn = e.target.closest('[data-del-custom-item]');
      if (delCustomBtn) {
        const [date, cIdx] = delCustomBtn.dataset.delCustomItem.split('|');
        if (userState.dayCustomItems[date]) {
          userState.dayCustomItems[date].splice(Number(cIdx), 1);
          saveUserState();
          renderItineraryPanel();
          renderHomePanel();
        }
        return;
      }

      const fCityBtn = e.target.closest('#food-city-filters [data-fcity]');
      if (fCityBtn) {
        foodFilterCity = fCityBtn.dataset.fcity;
        renderFoodPanel();
        return;
      }

      const fTypeBtn = e.target.closest('#food-type-filters [data-ftype]');
      if (fTypeBtn) {
        foodFilterType = fTypeBtn.dataset.ftype;
        document.querySelectorAll('#food-type-filters button').forEach((b) => {
          b.classList.toggle('btn-hm-primary', b.dataset.ftype === foodFilterType);
        });
        renderFoodPanel();
        return;
      }

      const likeFoodBtn = e.target.closest('[data-like-food]');
      if (likeFoodBtn) {
        const id = likeFoodBtn.dataset.likeFood;
        const cur = userState.foodState[id] || { liked: false, visited: false, rating: 0, review: '' };
        userState.foodState[id] = { ...cur, liked: !cur.liked };
        saveUserState();
        renderHero();
        renderFoodPanel();
        return;
      }

      const rateFoodBtn = e.target.closest('[data-rate-food]');
      if (rateFoodBtn) {
        const [id, stars] = rateFoodBtn.dataset.rateFood.split('|');
        const cur = userState.foodState[id] || { liked: false, visited: false, rating: 0, review: '' };
        userState.foodState[id] = { ...cur, rating: Number(stars) };
        saveUserState();
        renderFoodPanel();
        return;
      }

      const revFoodBtn = e.target.closest('[data-review-food]');
      if (revFoodBtn) {
        const id = revFoodBtn.dataset.reviewFood;
        const cur = userState.foodState[id] || { liked: false, visited: false, rating: 0, review: '' };
        const txt = prompt('식당 메모 또는 한줄평:', cur.review || '');
        if (txt !== null) {
          userState.foodState[id] = { ...cur, review: txt.trim() };
          saveUserState();
          renderFoodPanel();
        }
        return;
      }

      const bCatBtn = e.target.closest('#booking-cat-filters [data-bcat]');
      if (bCatBtn) {
        bookingFilterCat = bCatBtn.dataset.bcat;
        renderBookingsPanel();
        return;
      }

      const cycleBookingBtn = e.target.closest('[data-cycle-booking]');
      if (cycleBookingBtn) {
        const id = cycleBookingBtn.dataset.cycleBooking;
        const cur = getBookings().find((b) => b.id === id);
        if (!cur) return;
        const order = ['todo', 'booked', 'onsite'];
        const nextStatus = order[(order.indexOf(cur.status) + 1) % order.length];
        const customIdx = userState.customBookings.findIndex((b) => b.id === id);
        if (customIdx >= 0) {
          userState.customBookings[customIdx].status = nextStatus;
        } else {
          userState.bookingOverrides[id] = { ...(userState.bookingOverrides[id] || {}), status: nextStatus };
        }
        saveUserState();
        renderHero();
        renderBookingsPanel();
        renderItineraryPanel();
        renderHomePanel();
        return;
      }

      const voucherBtn = e.target.closest('[data-voucher-booking]');
      if (voucherBtn) {
        const id = voucherBtn.dataset.voucherBooking;
        const cur = getBookings().find((b) => b.id === id);
        const memo = prompt('바우처 보관 위치 메모 (예: 카톡 파일함, 이메일 등):', cur?.voucher || '');
        if (memo !== null) {
          const customIdx = userState.customBookings.findIndex((b) => b.id === id);
          if (customIdx >= 0) {
            userState.customBookings[customIdx].voucher = memo.trim();
          } else {
            userState.bookingOverrides[id] = { ...(userState.bookingOverrides[id] || {}), voucher: memo.trim() };
          }
          saveUserState();
          renderBookingsPanel();
        }
        return;
      }

      const voteStayBtn = e.target.closest('[data-vote-stay]');
      if (voteStayBtn) {
        const [id, who] = voteStayBtn.dataset.voteStay.split('|');
        const stay = getStays().find((s) => s.id === id);
        if (!stay) return;
        const nextVal = stay.votes?.[who] ? 0 : 1;
        const cIdx = userState.customStays.findIndex((s) => s.id === id);
        if (cIdx >= 0) {
          userState.customStays[cIdx].votes[who] = nextVal;
        } else {
          const ov = userState.stayOverrides[id] || {};
          userState.stayOverrides[id] = { ...ov, votes: { ...(stay.votes || {}), [who]: nextVal } };
        }
        saveUserState();
        renderStaysPanel();
        return;
      }

      const confirmStayBtn = e.target.closest('[data-confirm-stay]');
      if (confirmStayBtn) {
        const id = confirmStayBtn.dataset.confirmStay;
        const target = getStays().find((s) => s.id === id);
        if (!target) return;
        const willBook = target.status !== 'booked';

        getStays()
          .filter((s) => s.city === target.city)
          .forEach((s) => {
            const nextSt = s.id === id && willBook ? 'booked' : 'candidate';
            const cIdx = userState.customStays.findIndex((cs) => cs.id === s.id);
            if (cIdx >= 0) {
              userState.customStays[cIdx].status = nextSt;
            } else {
              userState.stayOverrides[s.id] = { ...(userState.stayOverrides[s.id] || {}), status: nextSt };
            }
          });

        saveUserState();
        renderAll();
        showToast(willBook ? `${target.name} 숙소가 확정되었습니다.` : '숙소 확정이 해제되었습니다.');
        return;
      }

      const cyclePayBtn = e.target.closest('[data-cycle-pay]');
      if (cyclePayBtn) {
        const id = cyclePayBtn.dataset.cyclePay;
        const item = userState.budgetItems.find((x) => x.id === id);
        if (item) {
          const seq = ['todo', 'deposit', 'paid'];
          item.payStatus = seq[(seq.indexOf(item.payStatus) + 1) % seq.length];
          if (item.payStatus === 'paid' && item.actual === 0) {
            item.actual = item.planned;
          }
          saveUserState();
          renderHero();
          renderBudgetPanel();
        }
        return;
      }

      const editBudgetBtn = e.target.closest('[data-edit-budget]');
      if (editBudgetBtn) {
        openBudgetItemModal(editBudgetBtn.dataset.editBudget);
        return;
      }

      const delBudgetBtn = e.target.closest('[data-del-budget]');
      if (delBudgetBtn) {
        const id = delBudgetBtn.dataset.delBudget;
        if (confirm('이 항목을 삭제할까요?')) {
          userState.budgetItems = userState.budgetItems.filter((x) => x.id !== id);
          saveUserState();
          renderHero();
          renderBudgetPanel();
        }
        return;
      }

      const cGroupBtn = e.target.closest('#checklist-group-filters [data-cgroup]');
      if (cGroupBtn) {
        checklistFilterGroup = cGroupBtn.dataset.cgroup;
        renderPrepPanel();
        return;
      }

      const delCheckBtn = e.target.closest('[data-del-check]');
      if (delCheckBtn) {
        const id = delCheckBtn.dataset.delCheck;
        userState.checklist = userState.checklist.filter((c) => c.id !== id);
        saveUserState();
        renderPrepPanel();
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target.id === 'today-day-select') {
        selectedTodayIndex = Number(e.target.value);
        renderMay2027Calendar();
        renderTodayFocusCard();
        return;
      }

      if (e.target.id === 'filter-food-liked') {
        foodOnlyLiked = e.target.checked;
        renderFoodPanel();
        return;
      }

      if (e.target.id === 'filter-food-visited') {
        foodOnlyVisited = e.target.checked;
        renderFoodPanel();
        return;
      }

      if (e.target.dataset.visitFood) {
        const id = e.target.dataset.visitFood;
        const cur = userState.foodState[id] || { liked: false, visited: false, rating: 0, review: '' };
        userState.foodState[id] = { ...cur, visited: e.target.checked };
        saveUserState();
        renderFoodPanel();
        return;
      }

      if (e.target.dataset.toggleCheck) {
        const id = e.target.dataset.toggleCheck;
        const item = userState.checklist.find((c) => c.id === id);
        if (item) {
          item.done = e.target.checked;
          saveUserState();
          renderPrepPanel();
        }
        return;
      }

      if (['filter-budget-cat', 'filter-budget-city', 'filter-budget-status'].includes(e.target.id)) {
        renderBudgetPanel();
        return;
      }

      if (e.target.id === 'input-people-count') {
        userState.budgetConfig.peopleCount = Number(e.target.value) || 2;
        saveUserState();
        renderBudgetPanel();
      }
    });

    document.getElementById('input-target-budget')?.addEventListener('input', (e) => {
      userState.budgetConfig.targetTotalKRW = Number(e.target.value) || 0;
      saveUserState();
      renderHero();
      renderBudgetPanel();
    });

    document.getElementById('input-eur-rate')?.addEventListener('input', (e) => {
      userState.budgetConfig.eurRate = Number(e.target.value) || 1500;
      saveUserState();
      renderHero();
      renderStaysPanel();
      renderBudgetPanel();
    });

    document.getElementById('calc-eur')?.addEventListener('input', (e) => {
      const eur = Number(e.target.value) || 0;
      const rate = Number(userState.budgetConfig.eurRate) || 1500;
      const krwEl = document.getElementById('calc-krw');
      if (krwEl) krwEl.value = Math.round(eur * rate);
      updateTaxRefundHint(eur, rate);
    });

    document.getElementById('calc-krw')?.addEventListener('input', (e) => {
      const krw = Number(e.target.value) || 0;
      const rate = Number(userState.budgetConfig.eurRate) || 1500;
      const eur = krw / rate;
      const eurEl = document.getElementById('calc-eur');
      if (eurEl) eurEl.value = Math.round(eur * 10) / 10;
      updateTaxRefundHint(Math.round(eur), rate);
    });

    ['hm-mail-hotel', 'hm-mail-dates', 'hm-mail-ref', 'hm-mail-names'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', updateHoneymoonMailPreview);
    });

    document.getElementById('btn-copy-hm-mail')?.addEventListener('click', () => {
      const txt = document.getElementById('hm-mail-preview')?.value || '';
      navigator.clipboard.writeText(txt).then(() => {
        showToast('영문 메일이 복사되었습니다.');
      });
    });

    document.querySelectorAll('[data-copy-snippet]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const txt = btn.getAttribute('data-copy-snippet') || '';
        navigator.clipboard.writeText(txt).then(() => {
          showToast('요청 문구가 복사되었습니다.');
        });
      });
    });

    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
      userState.theme = userState.theme === 'dark' ? 'light' : 'dark';
      saveUserState();
      initTheme();
    });

    document.getElementById('btn-toggle-layout')?.addEventListener('click', () => {
      layoutMode = layoutMode === 'tabs' ? 'scroll' : 'tabs';
      document.body.setAttribute('data-layout', layoutMode);
      document.getElementById('layout-mode-label').textContent =
        layoutMode === 'tabs' ? '전체 스크롤 보기' : '탭별로 보기';
      if (layoutMode === 'scroll') {
        setTimeout(() => {
          ensureMapInitialized();
          if (mapInstance) mapInstance.invalidateSize();
        }, 100);
      }
    });

    document.getElementById('btn-backup-modal')?.addEventListener('click', openBackupModal);

    document.getElementById('btn-mobile-more')?.addEventListener('click', () => {
      openModal(
        `
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-base font-bold">메뉴 더보기</h3>
          <button type="button" data-close-modal class="btn-hm btn-hm-sm">닫기</button>
        </div>
        <div class="grid grid-cols-1 gap-2 text-sm">
          <button type="button" data-more-go="bookings" class="btn-hm justify-between w-full">
            <span>예약 관리 (항공·입장권·투어)</span>
            <span class="text-xs text-[var(--text-muted)]">이동 →</span>
          </button>
          <button type="button" data-more-go="stays" class="btn-hm justify-between w-full">
            <span>숙소 권역 및 호텔 후보 비교</span>
            <span class="text-xs text-[var(--text-muted)]">이동 →</span>
          </button>
          <button type="button" data-more-go="prep" class="btn-hm justify-between w-full">
            <span>체크리스트 · 호텔 메일 · 현지 팁</span>
            <span class="text-xs text-[var(--text-muted)]">이동 →</span>
          </button>
          <div class="my-1 border-t border-[var(--border-line)]"></div>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" id="more-toggle-layout" class="btn-hm btn-hm-sm">
              ${layoutMode === 'tabs' ? '전체 스크롤 보기' : '탭별로 보기'}
            </button>
            <button type="button" id="more-toggle-theme" class="btn-hm btn-hm-sm">
              ${userState.theme === 'dark' ? '라이트 모드' : '다크 모드'}
            </button>
            <button type="button" id="more-open-backup" class="btn-hm btn-hm-sm">
              데이터 백업·공유
            </button>
            <button type="button" id="more-copy-link" class="btn-hm btn-hm-primary btn-hm-sm">
              사이트 링크 복사
            </button>
          </div>
        </div>
      `,
        (root) => {
          root.querySelectorAll('[data-more-go]').forEach((btn) => {
            btn.addEventListener('click', () => {
              const t = btn.dataset.moreGo;
              closeModal();
              switchTab(t);
            });
          });
          root.querySelector('#more-toggle-layout')?.addEventListener('click', () => {
            closeModal();
            document.getElementById('btn-toggle-layout')?.click();
          });
          root.querySelector('#more-toggle-theme')?.addEventListener('click', () => {
            closeModal();
            document.getElementById('btn-theme-toggle')?.click();
          });
          root.querySelector('#more-open-backup')?.addEventListener('click', () => {
            closeModal();
            openBackupModal();
          });
          root.querySelector('#more-copy-link')?.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href).then(() => {
              closeModal();
              showToast('사이트 주소가 복사되었습니다.');
            });
          });
        }
      );
    });

    document.getElementById('btn-edit-couple')?.addEventListener('click', () => {
      const nextTitle = prompt('타이틀 수정:', userState.coupleTitle);
      if (nextTitle && nextTitle.trim()) {
        userState.coupleTitle = nextTitle.trim();
        saveUserState();
        renderHero();
      }
    });

    document.getElementById('btn-add-budget-item')?.addEventListener('click', () => openBudgetItemModal(null));
    document.getElementById('btn-add-food')?.addEventListener('click', openAddFoodModal);
    document.getElementById('btn-add-stay')?.addEventListener('click', openAddStayModal);

    document.getElementById('btn-add-checklist')?.addEventListener('click', () => {
      const text = prompt('추가할 준비물·할 일:');
      if (text && text.trim()) {
        userState.checklist.push({
          id: 'c-' + Date.now(),
          group: checklistFilterGroup === 'all' ? '짐싸기·현지필수품' : checklistFilterGroup,
          text: text.trim(),
          done: false,
          due: '추가됨'
        });
        saveUserState();
        renderPrepPanel();
      }
    });

    document.getElementById('btn-add-booking')?.addEventListener('click', () => {
      const title = prompt('예약 항목명:');
      if (!title || !title.trim()) return;
      const date = prompt('이용 날짜 (예: 2027-05-18):', '2027-05-18') || '';
      const url = prompt('예약 링크 URL (선택):', '') || '';
      userState.customBookings.push({
        id: 'b-custom-' + Date.now(),
        category: '입장권·투어',
        title: title.trim(),
        city: 'common',
        date: date.trim(),
        time: '미정',
        openNote: '직접 추가',
        status: 'todo',
        price: '미정',
        url: url.trim(),
        priority: 2,
        note: ''
      });
      saveUserState();
      renderHero();
      renderBookingsPanel();
    });

    document.getElementById('btn-add-schedule-item')?.addEventListener('click', () => {
      const curDay = getDays()[selectedItineraryDayIndex];
      if (!curDay) return;
      const time = prompt(`${curDay.date} 시각 (예: 16:30):`, '16:30');
      if (!time) return;
      const customTitle = prompt('장소·일정 제목:');
      if (!customTitle) return;
      const memo = prompt('메모 (선택):', '') || '';
      if (!userState.dayCustomItems[curDay.date]) userState.dayCustomItems[curDay.date] = [];
      userState.dayCustomItems[curDay.date].push({
        time: time.trim(),
        customTitle: customTitle.trim(),
        memo: memo.trim(),
        stayMin: 60
      });
      saveUserState();
      renderItineraryPanel();
      renderHomePanel();
    });

    document.getElementById('btn-export-budget-csv')?.addEventListener('click', () => {
      const rows = [
        ['카테고리', '도시', '항목명', '통화', '예상금액', '예상원화환산', '실제결제액', '실제원화환산', '결제상태', '결제수단', '메모']
      ];
      userState.budgetItems.forEach((it) => {
        rows.push([
          it.category,
          CITY_META[it.city]?.name || it.city,
          it.title,
          it.currency,
          it.planned,
          Math.round(toKRW(it.planned, it.currency)),
          it.actual,
          Math.round(toKRW(it.actual, it.currency)),
          it.payStatus,
          it.method || '',
          it.memo || ''
        ]);
      });
      const csv = '\uFEFF' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '종구쨀린_허니문_예산장부.csv';
      a.click();
    });
  }

  document.addEventListener('DOMContentLoaded', initApp);
})();
