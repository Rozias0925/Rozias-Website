/* Shared enhancements for both static language pages; no tracking or backend. */
document.addEventListener('DOMContentLoaded', () => {
    const storageKey = 'rozias:language-switch';
    const languageLink = document.querySelector('.lang-switch');
    let savedPosition = null;
    try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
        sessionStorage.removeItem(storageKey);
        if (saved && saved.path === location.pathname && Date.now() - saved.time < 120000) {
            savedPosition = saved;
        }
    } catch (_) { /* Anchor links still work when browser storage is unavailable. */ }

    const readingOffset = () => (document.querySelector('nav')?.getBoundingClientRect().height || 0) + 24;
    // Ignore temporary translation offsets from fade-in and disclosure animations.
    const layoutRect = element => {
        const rect = element.getBoundingClientRect();
        let shift = 0;
        for (let node = element; node; node = node.parentElement) {
            const transform = getComputedStyle(node).transform;
            if (transform !== 'none') shift += new DOMMatrixReadOnly(transform).m42;
        }
        return { top: rect.top - shift, bottom: rect.bottom - shift, height: rect.height };
    };
    const anchorsFor = section => {
        const anchors = [{ key: 'section', element: section }];
        const add = (key, element) => { if (element) anchors.push({ key, element }); };
        if (section.id === 'about') {
            add('profile', section.querySelector('.about-profile-header'));
            section.querySelectorAll('.about-introduction > p').forEach((element, index) => add('intro-' + index, element));
            section.querySelectorAll('.about-disclosure').forEach((element, index) => add('story-' + index, element));
        } else if (section.id === 'background-skills') {
            section.querySelectorAll('.background-panel .list-item').forEach((element, index) => add('background-' + index, element));
            section.querySelectorAll('.skill-category').forEach((element, index) => add('category-' + index, element));
            section.querySelectorAll('.tag-button').forEach(element => add('skill-' + element.dataset.target, element));
            section.querySelectorAll('.tag-panel').forEach(element => add('panel-' + element.id, element));
        } else if (section.id === 'research') {
            section.querySelectorAll('.research-category').forEach((category, categoryIndex) => {
                add('category-' + categoryIndex, category.querySelector('.research-category-title'));
                category.querySelectorAll('.list-item').forEach((item, itemIndex) => {
                    const prefix = categoryIndex + '-' + itemIndex;
                    add(prefix + '-item', item);
                    add(prefix + '-progress', item.querySelector('.research-progress'));
                    add(prefix + '-actions', item.querySelector('.research-actions'));
                    item.querySelectorAll('.research-entry-content p, .research-note-gallery > figure')
                        .forEach((element, index) => add(prefix + '-detail-' + index, element));
                });
            });
        } else if (section.id === 'honors') {
            section.querySelectorAll('.list-item').forEach((element, index) => add('honor-' + index, element));
        }
        return anchors;
    };
    const capturePosition = destination => {
        const offset = readingOffset();
        const line = scrollY + offset;
        const sections = Array.from(document.querySelectorAll('section[id], footer#contact'));
        const section = sections.find(element => {
            const rect = element.getBoundingClientRect();
            return rect.top + scrollY <= line && rect.bottom + scrollY > line;
        }) || sections.reduce((closest, element) =>
            Math.abs(element.getBoundingClientRect().top - offset) < Math.abs(closest.getBoundingClientRect().top - offset) ? element : closest, sections[0]);
        const visible = anchorsFor(section).map(anchor => ({ ...anchor, rect: layoutRect(anchor.element) }))
            .filter(anchor => anchor.rect.height > 0 && anchor.rect.top <= offset);
        const containing = visible.filter(anchor => anchor.rect.bottom > offset)
            .sort((left, right) => left.rect.height - right.rect.height);
        const anchor = containing.find(item => item.element.matches('.tag-panel.active'))
            || containing[0] || visible.sort((left, right) => right.rect.top - left.rect.top)[0];
        const rect = anchor?.rect || section.getBoundingClientRect();
        return {
            path: destination.pathname,
            time: Date.now(),
            section: section.id,
            anchor: anchor?.key || 'section',
            fraction: Math.max(0, Math.min(1, (offset - rect.top) / rect.height)),
            atBottom: scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - 4,
            stories: Array.from(document.querySelectorAll('.about-disclosure')).map(element => element.open),
            research: Array.from(document.querySelectorAll('.research-detail-button')).map(element => element.getAttribute('aria-expanded') === 'true'),
            skills: Array.from(document.querySelectorAll('.tag-button.active')).map(element => element.dataset.target),
            slide: Math.max(0, Array.from(document.querySelectorAll('.hero-slide')).findIndex(element => element.classList.contains('active')))
        };
    };
    languageLink?.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const destination = new URL(languageLink.href, location.href);
        const position = capturePosition(destination);
        destination.hash = position.section;
        languageLink.href = destination.href;
        try { sessionStorage.setItem(storageKey, JSON.stringify(position)); } catch (_) {}
    });

    if (savedPosition) {
        document.querySelectorAll('.about-disclosure').forEach((element, index) => {
            element.open = Boolean(savedPosition.stories?.[index]);
        });
        document.querySelectorAll('.research-detail-button').forEach((button, index) => {
            const panel = document.getElementById(button.getAttribute('aria-controls'));
            const open = Boolean(savedPosition.research?.[index]);
            button.setAttribute('aria-expanded', String(open));
            if (panel) {
                panel.hidden = !open;
                panel.classList.toggle('is-open', open);
            }
        });
        const restoredPanels = [];
        (savedPosition.skills || []).forEach(id => {
            const button = Array.from(document.querySelectorAll('.tag-button')).find(element => element.dataset.target === id);
            const panel = document.getElementById(id);
            if (button && panel) {
                panel.style.transition = 'none';
                panel.style.animation = 'none';
                button.insertAdjacentElement('afterend', panel);
                button.classList.add('active');
                panel.classList.add('active');
                restoredPanels.push(panel);
            }
        });
        let userMoved = false;
        ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(name =>
            window.addEventListener(name, () => { userMoved = true; }, { once: true, passive: true }));
        const restoreScroll = () => {
            if (userMoved) return;
            const section = document.getElementById(savedPosition.section);
            if (!section) return;
            const anchor = anchorsFor(section).find(item => item.key === savedPosition.anchor)?.element || section;
            const rect = layoutRect(anchor);
            const top = savedPosition.atBottom ? document.documentElement.scrollHeight - innerHeight
                : rect.top + scrollY + rect.height * savedPosition.fraction - readingOffset();
            window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
        };
        const ready = document.fonts?.ready || Promise.resolve();
        Promise.race([ready, new Promise(resolve => setTimeout(resolve, 1200))]).then(() => {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                restoreScroll();
                restoredPanels.forEach(panel => {
                    panel.style.removeProperty('transition');
                    panel.style.removeProperty('animation');
                });
            }));
        });
        ready.then(() => requestAnimationFrame(restoreScroll));
    }

    const banner = document.querySelector('[data-banner-carousel]');
    const home = document.getElementById('home');
    if (!banner || !home) return;
    const slides = Array.from(banner.querySelectorAll('.hero-slide'));
    const dots = Array.from(document.querySelectorAll('.hero-dot'));
    const caption = document.querySelector('[data-banner-caption]');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const loads = new Map();
    const failed = new Set();
    let activeIndex = 0;
    let request = 0;
    let timer;
    let inView = true;
    const stop = () => clearTimeout(timer);
    const loadImage = index => {
        if (loads.has(index)) return loads.get(index);
        const photo = slides[index].querySelector('img');
        const promise = new Promise(resolve => {
            const done = success => {
                photo.removeEventListener('load', onLoad);
                photo.removeEventListener('error', onError);
                if (!success) {
                    failed.add(index);
                    if (dots[index]) dots[index].disabled = true;
                }
                resolve(success);
            };
            const onLoad = () => done(true);
            const onError = () => done(false);
            photo.addEventListener('load', onLoad);
            photo.addEventListener('error', onError);
            photo.loading = 'eager';
            if (photo.dataset.srcset) photo.srcset = photo.dataset.srcset;
            if (photo.dataset.src) photo.src = photo.dataset.src;
            if (photo.complete && photo.getAttribute('src')) done(photo.naturalWidth > 0);
        });
        loads.set(index, promise);
        return promise;
    };
    const nextIndex = () => {
        for (let step = 1; step <= slides.length; step++) {
            const index = (activeIndex + step) % slides.length;
            if (!failed.has(index)) return index;
        }
        return activeIndex;
    };
    const schedule = () => {
        stop();
        if (reducedMotion.matches || document.hidden || !inView || failed.size >= slides.length - 1) return;
        timer = setTimeout(() => show(nextIndex()), 3500);
    };
    const show = async index => {
        stop();
        const token = ++request;
        for (let attempt = 0; attempt < slides.length; attempt++) {
            const success = await loadImage(index);
            if (token !== request) return;
            if (success) {
                activeIndex = index;
                slides.forEach((slide, current) => {
                    slide.classList.toggle('active', current === index);
                    slide.setAttribute('aria-hidden', String(current !== index));
                });
                dots.forEach((dot, current) => {
                    dot.classList.toggle('active', current === index);
                    dot.setAttribute('aria-current', String(current === index));
                });
                if (caption) caption.textContent = slides[index].querySelector('.hero-caption').textContent;
                home.classList.add('has-banner-images');
                if (!reducedMotion.matches && inView) loadImage(nextIndex());
                schedule();
                return;
            }
            index = (index + 1) % slides.length;
        }
        home.classList.remove('has-banner-images');
    };
    dots.forEach((dot, index) => dot.addEventListener('click', () => show(index)));
    document.addEventListener('visibilitychange', schedule);
    reducedMotion.addEventListener('change', () => {
        if (!reducedMotion.matches && inView) loadImage(nextIndex());
        schedule();
    });
    const visibility = new IntersectionObserver(entries => {
        inView = entries[0].isIntersecting;
        if (inView && !reducedMotion.matches) loadImage(nextIndex());
        schedule();
    });
    visibility.observe(home);
    show(savedPosition?.slide || 0);
});
