(function () {
  "use strict";

  const INSET = 12;
  const KEYWORD_GAP = 4;
  const motionPreference = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

  function halton(index, base) {
    let result = 0;
    let fraction = 1;
    while (index > 0) {
      fraction /= base;
      result += fraction * (index % base);
      index = Math.floor(index / base);
    }
    return result;
  }

  // Reflect overshoot as well as velocity, even in a very narrow viewport.
  function advance(position, velocity, maximum, elapsed) {
    if (maximum <= 0) return { position: 0, velocity: velocity };
    const next = position + velocity * elapsed;
    if (next >= 0 && next <= maximum) {
      return { position: next, velocity: velocity };
    }
    const period = maximum * 2;
    const wrapped = ((next % period) + period) % period;
    const crossed = Math.floor(next / maximum);
    return {
      position: wrapped > maximum ? period - wrapped : wrapped,
      velocity: Math.abs(crossed % 2) === 1 ? -velocity : velocity,
    };
  }

  function initializeWall(wall) {
    if (wall.dataset.wallInitialized === "true") return;
    const elements = Array.from(wall.querySelectorAll(".learning-keyword"));
    if (!elements.length) return;
    wall.dataset.wallInitialized = "true";

    const monitor = wall.closest(".learning-monitor") || wall.parentElement;
    const toggle = monitor && monitor.querySelector("[data-wall-toggle]");
    const toggleLabel = toggle && toggle.querySelector("[data-wall-toggle-label]");
    const toggleIcon = toggle && toggle.querySelector("[data-wall-toggle-icon]");
    const keywords = elements.map(function (element, index) {
      const angle = (index * 2.399963229728653 + 0.55) % (Math.PI * 2);
      const speed = 14 + ((index * 7) % 15);
      const fontSize = 14;
      return {
        element: element,
        fontSize: fontSize,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        maxX: 0,
        maxY: 0,
        scale: 1,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      };
    });

    let ready = false;
    let visible = !window.IntersectionObserver;
    let manuallyPaused = false;
    let allowReducedMotion = false;
    let animationFrame = 0;
    let layoutFrame = 0;
    let previousTime = 0;
    let inset = INSET;

    function isPaused() {
      return manuallyPaused || !!(motionPreference && motionPreference.matches && !allowReducedMotion);
    }

    function shouldAnimate() {
      return ready && visible && !document.hidden && !isPaused() && wall.isConnected;
    }

    function updateControl() {
      const paused = isPaused();
      wall.dataset.wallPaused = String(paused);
      if (!toggle) return;
      const label = paused
        ? (toggle.dataset.resumeLabel || "Resume animation")
        : (toggle.dataset.pauseLabel || "Pause animation");
      toggle.setAttribute("aria-pressed", String(paused));
      toggle.setAttribute("aria-label", label);
      if (toggleLabel) toggleLabel.textContent = label;
      if (toggleIcon) toggleIcon.textContent = paused ? "▶" : "Ⅱ";
    }

    function render(keyword) {
      keyword.element.style.transform = "translate3d(" +
        (keyword.x + inset).toFixed(3) + "px," +
        (keyword.y + inset).toFixed(3) + "px,0) scale(" +
        keyword.scale.toFixed(6) + ")";
    }

    function separation(first, second, axis) {
      const size = axis === "x" ? "width" : "height";
      const limit = axis === "x" ? "maxX" : "maxY";
      const firstBefore = first[axis] + first[size] / 2 <= second[axis] + second[size] / 2;
      const before = firstBefore ? first : second;
      const after = firstBefore ? second : first;
      return {
        axis: axis,
        before: before,
        after: after,
        amount: before[axis] + before[size] + KEYWORD_GAP - after[axis],
        beforeRoom: before[axis],
        afterRoom: after[limit] - after[axis],
      };
    }

    // Separate along the smallest overlap, sharing the correction between words.
    // Available room matters near walls: a wide pair can instead separate vertically.
    function resolveCollisions(iterations) {
      for (let pass = 0; pass < iterations; pass += 1) {
        let corrections = 0;
        for (let i = 0; i < keywords.length; i += 1) {
          for (let j = i + 1; j < keywords.length; j += 1) {
            const first = keywords[i];
            const second = keywords[j];
            const overlapX = Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x) + KEYWORD_GAP;
            const overlapY = Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y) + KEYWORD_GAP;
            if (overlapX <= 0.01 || overlapY <= 0.01) continue;

            const horizontal = separation(first, second, "x");
            const vertical = separation(first, second, "y");
            let correction = horizontal.amount < vertical.amount ? horizontal : vertical;
            const alternative = correction === horizontal ? vertical : horizontal;
            if (correction.beforeRoom + correction.afterRoom < correction.amount &&
                alternative.beforeRoom + alternative.afterRoom >= alternative.amount) {
              correction = alternative;
            }
            const beforeShift = Math.min(correction.beforeRoom,
              Math.max(correction.amount / 2, correction.amount - correction.afterRoom));
            const afterShift = Math.min(correction.afterRoom, correction.amount - beforeShift);
            if (beforeShift + afterShift <= 0.01) continue;
            correction.before[correction.axis] -= beforeShift;
            correction.after[correction.axis] += afterShift;
            const velocity = correction.axis === "x" ? "vx" : "vy";
            correction.before[velocity] = -Math.abs(correction.before[velocity]);
            correction.after[velocity] = Math.abs(correction.after[velocity]);
            corrections += 1;
          }
        }
        if (!corrections) break;
      }
    }

    function frame(time) {
      animationFrame = 0;
      if (!shouldAnimate()) {
        previousTime = 0;
        return;
      }
      const elapsed = previousTime ? Math.min(Math.max((time - previousTime) / 1000, 0), 0.05) : 0;
      previousTime = time;
      keywords.forEach(function (keyword) {
        const horizontal = advance(keyword.x, keyword.vx, keyword.maxX, elapsed);
        const vertical = advance(keyword.y, keyword.vy, keyword.maxY, elapsed);
        keyword.x = horizontal.position;
        keyword.vx = horizontal.velocity;
        keyword.y = vertical.position;
        keyword.vy = vertical.velocity;
      });
      resolveCollisions(3);
      keywords.forEach(render);
      animationFrame = window.requestAnimationFrame(frame);
    }

    function updateRunningState() {
      updateControl();
      if (shouldAnimate()) {
        if (!animationFrame) {
          previousTime = 0;
          animationFrame = window.requestAnimationFrame(frame);
        }
      } else {
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        previousTime = 0;
      }
    }

    function scatter(width, height) {
      const placed = [];
      const columns = Math.max(1, Math.ceil(Math.sqrt(keywords.length * width / height)));
      const rows = Math.ceil(keywords.length / columns);
      keywords.forEach(function (keyword, index) {
        const idealX = Math.max(0, Math.min(keyword.maxX,
          ((index % columns) + 0.5) * width / columns - keyword.width / 2));
        const idealY = Math.max(0, Math.min(keyword.maxY,
          (Math.floor(index / columns) + 0.5) * height / rows - keyword.height / 2));
        let best = { x: idealX, y: idealY, score: Infinity };
        for (let attempt = 0; attempt < 96; attempt += 1) {
          const sequence = index * 97 + attempt + 1;
          const x = attempt === 0 ? idealX : halton(sequence, 2) * keyword.maxX;
          const y = attempt === 0 ? idealY : halton(sequence, 3) * keyword.maxY;
          let score = Math.hypot((x - idealX) / width, (y - idealY) / height);
          placed.forEach(function (other) {
            const overlapX = Math.max(0, Math.min(x + keyword.width + 6, other.x + other.width + 6) - Math.max(x, other.x));
            const overlapY = Math.max(0, Math.min(y + keyword.height + 6, other.y + other.height + 6) - Math.max(y, other.y));
            score += overlapX * overlapY * 10;
          });
          if (score < best.score) best = { x: x, y: y, score: score };
          if (score === 0) break;
        }
        keyword.x = best.x;
        keyword.y = best.y;
        placed.push(keyword);
      });
    }

    function packNarrowWall(width, height) {
      const rows = [];
      keywords.slice().sort(function (first, second) {
        return second.width - first.width;
      }).forEach(function (keyword) {
        let row = rows.find(function (candidate) {
          return candidate.width + KEYWORD_GAP + keyword.width <= width;
        });
        if (!row) {
          row = { width: 0, height: 0, keywords: [] };
          rows.push(row);
        }
        row.width += keyword.width + (row.keywords.length ? KEYWORD_GAP : 0);
        row.height = Math.max(row.height, keyword.height);
        row.keywords.push(keyword);
      });
      const requiredHeight = rows.reduce(function (sum, row) {
        return sum + row.height;
      }, KEYWORD_GAP * (rows.length - 1));
      if (requiredHeight > height) return false;
      const extraVerticalSpace = (height - requiredHeight) / (rows.length + 1);
      let y = extraVerticalSpace;
      rows.forEach(function (row) {
        const extraHorizontalSpace = (width - row.width) / (row.keywords.length + 1);
        let x = extraHorizontalSpace;
        row.keywords.forEach(function (keyword) {
          keyword.x = Math.max(0, Math.min(keyword.maxX, x));
          keyword.y = Math.max(0, Math.min(keyword.maxY, y + (row.height - keyword.height) / 2));
          x += keyword.width + KEYWORD_GAP + extraHorizontalSpace;
        });
        y += row.height + KEYWORD_GAP + extraVerticalSpace;
      });
      return true;
    }

    function layout() {
      layoutFrame = 0;
      const wallWidth = wall.clientWidth;
      const wallHeight = wall.clientHeight;
      if (!wallWidth || !wallHeight) {
        ready = false;
        updateRunningState();
        return;
      }
      inset = Math.min(INSET, wallWidth / 8, wallHeight / 8);
      const width = Math.max(1, wallWidth - inset * 2);
      const height = Math.max(1, wallHeight - inset * 2);
      const fontFactor = wallWidth < 360 ? 0.9 : 1;
      const wasReady = ready;
      wall.dataset.wallReady = "true";

      keywords.forEach(function (keyword) {
        const relativeX = keyword.maxX > 0 ? keyword.x / keyword.maxX : 0.5;
        const relativeY = keyword.maxY > 0 ? keyword.y / keyword.maxY : 0.5;
        const element = keyword.element;
        element.style.position = "absolute";
        element.style.top = "0";
        element.style.left = "0";
        element.style.margin = "0";
        element.style.minWidth = "0";
        element.style.minHeight = "0";
        element.style.maxWidth = "none";
        element.style.transformOrigin = "top left";
        element.style.fontSize = keyword.fontSize * fontFactor + "px";
        element.style.whiteSpace = "nowrap";

        let measuredWidth = element.offsetWidth;
        let measuredHeight = element.offsetHeight;
        const fontScale = Math.min(1, width / Math.max(1, measuredWidth), height / Math.max(1, measuredHeight));
        if (fontScale < 1) {
          element.style.fontSize = Math.max(1, keyword.fontSize * fontFactor * fontScale) + "px";
          measuredWidth = element.offsetWidth;
          measuredHeight = element.offsetHeight;
        }
        // The final scale also covers fixed padding/borders and rounding in font metrics.
        keyword.scale = Math.min(1, width / Math.max(1, measuredWidth), height / Math.max(1, measuredHeight));
        keyword.width = measuredWidth * keyword.scale;
        keyword.height = measuredHeight * keyword.scale;
        keyword.maxX = Math.max(0, width - keyword.width);
        keyword.maxY = Math.max(0, height - keyword.height);
        keyword.x = Math.max(0, Math.min(keyword.maxX, relativeX * keyword.maxX));
        keyword.y = Math.max(0, Math.min(keyword.maxY, relativeY * keyword.maxY));
      });

      if (!wasReady) scatter(width, height);
      if (wallWidth < 260) packNarrowWall(width, height);
      resolveCollisions(24);
      ready = true;
      keywords.forEach(render);
      updateRunningState();
    }

    function requestLayout() {
      if (!layoutFrame) layoutFrame = window.requestAnimationFrame(layout);
    }

    if (toggle) {
      toggle.addEventListener("click", function () {
        if (isPaused()) {
          manuallyPaused = false;
          allowReducedMotion = true;
        } else {
          manuallyPaused = true;
        }
        updateRunningState();
      });
    }

    if (window.ResizeObserver) {
      new ResizeObserver(requestLayout).observe(wall);
    } else {
      window.addEventListener("resize", requestLayout, { passive: true });
    }
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        visible = entries.some(function (entry) { return entry.isIntersecting; });
        updateRunningState();
      }).observe(wall);
    }
    document.addEventListener("visibilitychange", updateRunningState);
    if (motionPreference) {
      const onMotionPreferenceChange = function () {
        allowReducedMotion = false;
        updateRunningState();
      };
      if (motionPreference.addEventListener) {
        motionPreference.addEventListener("change", onMotionPreferenceChange);
      } else if (motionPreference.addListener) {
        motionPreference.addListener(onMotionPreferenceChange);
      }
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(requestLayout);
    }
    updateControl();
    requestLayout();
  }

  function initialize() {
    document.querySelectorAll("[data-skills-wall]").forEach(initializeWall);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
