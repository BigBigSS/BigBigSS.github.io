import { initPhotoViewer } from "./mobile-photo-viewer";
import { initPhotoDistance } from "./mobile-photo-distance";

type Photo = {
  src?: string; thumbSrc?: string; fullSrc?: string; liveVideoSrc?: string;
  title?: string; alt?: string; description?: string; mood?: string; takenAt?: string;
};
type Slot = {
  button: HTMLButtonElement; image: HTMLImageElement;
  live: HTMLElement; sequence: number; photo: number; ready: boolean; readyAt: number;
  revision: number; decoding: number;
};

function initPhotoOrbits() {
  document.querySelectorAll<HTMLElement>("[data-mobile-journal]").forEach((root) => {
    if (root.dataset.bound) return;
    root.dataset.bound = "1";
    const phone = matchMedia("(max-width: 768px)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const events = new AbortController();
    const options = { signal: events.signal };
    const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
    const frame = find<HTMLElement>("[data-photo-frame]");
    const distance = find<HTMLElement>("[data-photo-distance]");
    const distanceLayout = initPhotoDistance(distance, options);
    const viewer = find<HTMLDialogElement>("[data-photo-viewer]");
    const loading = find<HTMLElement>("[data-photo-loading]");
    const retry = find<HTMLButtonElement>("[data-photo-retry]");
    const status = find<HTMLElement>("[data-photo-status]");
    const slots: Slot[] = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-photo-open]")).map((button) => ({
      button, image: button.querySelector("[data-photo-image]")!,
      live: button.querySelector("[data-photo-live]")!, sequence: NaN, photo: -1, ready: false, readyAt: 0,
      revision: 0, decoding: -1,
    }));
    let photos: Photo[] = [];
    const rounds = new Map<number, number[]>();
    const seen = new Map<number, Set<number>>();
    const loaded = new Map<string, Promise<boolean>>();
    const cancelLoads = new Set<() => void>();
    let visible = false;
    let disposed = false;
    let auto = !reduced.matches;
    let rotation = 0;
    let target: number | null = null;
    let currentSequence = NaN;
    let current = -1;
    let raf = 0;
    let previousTime = 0;
    let momentum = 0;
    let suppressClickUntil = 0;
    let frameWidth = 402;
    let cardWidth = 156;
    let cardHeight = 265;
    type Gesture = { id: number; input: 'touch' | 'pointer'; x: number; y: number; rotation: number; lastX: number; time: number; started: number; speed: number; dragging: boolean; slot?: Slot };
    let gesture: Gesture | null = null;
    const mod = (n: number, size: number) => ((n % size) + size) % size;
    const text = (selector: string, value: string) => { find(selector).textContent = value; };
    const shuffle = (list: number[]) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    };
    // An unbounded sequence of shuffled rounds works in either direction.
    // Recycling only happens outside the visible arc, never on a visible card.
    const photoAt = (sequence: number) => {
      const round = Math.floor(sequence / photos.length);
      let order = rounds.get(round);
      if (!order) {
        order = shuffle(photos.map((_, i) => i));
        const before = rounds.get(round - 1)?.at(-1);
        const after = rounds.get(round + 1)?.[0];
        if (order.length > 1 && order[0] === before) [order[0], order[1]] = [order[1], order[0]];
        if (order.length > 1 && order.at(-1) === after) {
          const swap = order.findIndex((item, i) => item !== after && (i !== 0 || order!.at(-1) !== before));
          if (swap >= 0) [order[swap], order[order.length - 1]] = [order[order.length - 1], order[swap]];
        }
        rounds.set(round, order);
      }
      return order[mod(sequence, photos.length)];
    };
    const load = (src: string): Promise<boolean> => {
      if (loaded.has(src)) return loaded.get(src)!;
      const promise = new Promise<boolean>((resolve) => {
        const probe = new Image();
        let timeout = 0;
        const finish = (ok: boolean) => {
          clearTimeout(timeout); probe.onload = probe.onerror = null;
          cancelLoads.delete(cancel); if (!ok) loaded.delete(src); resolve(ok);
        };
        const cancel = () => { probe.src = ""; finish(false); };
        cancelLoads.add(cancel);
        probe.onload = () => { void probe.decode().catch(() => {}).then(() => finish(!disposed)); };
        probe.onerror = () => finish(false);
        timeout = window.setTimeout(cancel, 12000);
        probe.src = src;
      });
      loaded.set(src, promise);
      return promise;
    };
    const decodeSlot = (slot: Slot) => {
      // A cached image can be complete before its load event arrives. Decode
      // once per assignment so that later load events cannot restart its fade.
      if (slot.ready || slot.decoding === slot.revision) return;
      const revision = slot.revision;
      const src = slot.image.getAttribute("src");
      slot.decoding = revision;
      void slot.image.decode().catch(() => {}).then(() => {
        if (disposed || revision !== slot.revision || src !== slot.image.getAttribute("src")) return;
        slot.decoding = -1;
        if (!slot.image.complete || !slot.image.naturalWidth || slot.ready) return;
        slot.ready = true;
        slot.readyAt = performance.now();
        if (slot.sequence === currentSequence) loading.hidden = true;
        paint(); schedule();
      });
    };
    const assign = (slot: Slot, sequence: number) => {
      slot.sequence = sequence; slot.photo = photoAt(sequence); slot.ready = false;
      slot.revision++;
      slot.button.style.opacity = '0';
      const item = photos[slot.photo];
      const src = item.thumbSrc || item.src || item.fullSrc || "";
      slot.image.src = src;
      if (slot.image.complete && slot.image.naturalWidth > 0) decodeSlot(slot);
      slot.image.alt = item.description || item.alt || item.title || "生活照片";
      slot.button.setAttribute("aria-label", `放大照片：${slot.image.alt}`);
      slot.live.hidden = !item.liveVideoSrc;
      slot.button.dataset.sequence = String(sequence);
      slot.button.dataset.photoIndex = String(slot.photo);
      slot.button.hidden = false;
    };
    const updateCurrent = (sequence: number) => {
      if (sequence === currentSequence) return;
      currentSequence = sequence; current = photoAt(sequence);
      const round = Math.floor(sequence / photos.length);
      if (!seen.has(round)) seen.set(round, new Set());
      seen.get(round)!.add(current);
      root.dataset.photoIndex = String(current);
      root.dataset.photoRound = String(round + 1);
      root.dataset.photoSeen = String(seen.get(round)!.size);
    };
    const paint = () => {
      if (!photos.length || disposed || !phone.matches) return;
      const center = Math.round(rotation);
      for (let delta = -4; delta <= 4; delta++) {
        const sequence = center + delta;
        const slot = slots[mod(sequence, slots.length)];
        if (slot.sequence !== sequence) assign(slot, sequence);
        const offset = sequence - rotation;
        const abs = Math.abs(offset);
        // Card positions and surfaces follow the same circle tangent.
        // Include a physical gap so neighboring cards never form a joined wall.
        const step = Math.PI / 6;
        const gap = Math.max(20, Math.min(30, frameWidth * .06));
        const radius = (cardWidth + gap) / (2 * Math.sin(step / 2));
        const angle = offset * step;
        const x = Math.sin(angle) * radius;
        const z = (Math.cos(angle) - 1) * radius;
        const y = (1 - Math.cos(angle)) * 9;
        const readyOpacity = slot.ready ? (reduced.matches ? 1 : Math.min(1, (performance.now() - slot.readyAt) / 160)) : 0;
        const opacity = Math.max(0, Math.min(1, (2.15 - abs) / .45)) * readyOpacity;
        const focus = Math.max(0, 1 - abs);
        // Keep the entire card in one flat compositor plane. Even independent
        // perspective/rotateY layers can lose their clipped texture in iOS
        // WebKit. An affine projection retains depth and the tangent-facing
        // silhouette without any 3D surface sorting or backface changes.
        const scale = 800 / (800 - z);
        const a = Math.max(.12, Math.cos(angle)) * scale;
        const b = Math.sin(angle) * .07 * scale;
        const tx = x * scale - a * cardWidth / 2;
        const ty = y * scale - (b * cardWidth + scale * cardHeight) / 2;
        slot.button.style.transform = `matrix(${a.toFixed(5)},${b.toFixed(5)},0,${scale.toFixed(5)},${tx.toFixed(3)},${ty.toFixed(3)})`;
        const order = String(10 - Math.abs(sequence - center));
        if (slot.button.style.zIndex !== order) slot.button.style.zIndex = order;
        slot.button.style.opacity = String(opacity);
        slot.button.style.setProperty("--focus", focus.toFixed(2));
        slot.button.style.setProperty("--shade", Math.min(.5, abs * .15).toFixed(2));
        const interactive = abs < 1.85 && slot.ready;
        if (slot.button.style.pointerEvents !== (interactive ? "auto" : "none")) {
          slot.button.style.pointerEvents = interactive ? "auto" : "none";
          slot.button.setAttribute("aria-hidden", String(!interactive));
        }
        const tabIndex = sequence === center ? 0 : -1;
        if (slot.button.tabIndex !== tabIndex) slot.button.tabIndex = tabIndex;
      }
      distance.style.transform = `translate3d(${(-Math.sin(rotation * .18) * 9).toFixed(2)}px,0,0)`;
      root.dataset.rotation = rotation.toFixed(3);
      updateCurrent(center);
      const active = slots[mod(center, slots.length)];
      loading.hidden = active.image.complete && active.image.naturalWidth > 0;
    };
    const canRun = () => !disposed && visible && phone.matches && !document.hidden && photos.length > 0;
    const tick = (now: number) => {
      raf = 0;
      if (!canRun()) { previousTime = 0; return; }
      const dt = previousTime ? Math.min((now - previousTime) / 1000, .05) : 0;
      previousTime = now;
      if (!gesture) {
        if (target !== null) {
          rotation += (target - rotation) * Math.min(1, dt * 8);
          if (Math.abs(target - rotation) < .002) { rotation = target; target = null; }
        } else {
          rotation += dt * ((auto && photos.length > 1 ? .17 : 0) + momentum);
          momentum *= Math.exp(-dt * 5);
          if (Math.abs(momentum) < .005) momentum = 0;
        }
      }
      paint();
      if (auto || target !== null || gesture || momentum) raf = requestAnimationFrame(tick);
      else previousTime = 0;
    };
    const schedule = () => {
      if (!canRun()) { cancelAnimationFrame(raf); raf = 0; previousTime = 0; return; }
      if (!raf) { previousTime = 0; raf = requestAnimationFrame(tick); }
    };
    const turnTo = (sequence: number) => {
      if (photos.length < 2 || viewer.open) return;
      momentum = 0;
      if (reduced.matches) { rotation = sequence; target = null; paint(); }
      else target = sequence;
      status.textContent = "已旋转照片，可点击中央照片查看大图。";
      schedule();
    };
    const ensureStarted = () => {
      if (!phone.matches || !visible || disposed) return;
      if (!photos.length) {
        try {
          const source = root.closest(".barrel3d")?.querySelector<HTMLElement>("[data-barrel3d]");
          photos = JSON.parse(source?.dataset.items || "[]").filter((item: Photo) => item.thumbSrc || item.src || item.fullSrc);
        } catch { photos = []; }
        text("[data-photo-total]", `${photos.length} MOMENTS`);
        if (!photos.length) { loading.textContent = "暂时没有照片"; return; }
        const back = shuffle(photos.map((_, i) => i));
        distance.querySelectorAll<HTMLImageElement>("img").forEach((img, i) => {
          const item = photos[back[i % back.length]];
          img.src = item.thumbSrc || item.src || item.fullSrc || "";
          img.addEventListener("error", () => { img.style.opacity = "0"; }, options);
        });
        frameWidth = frame.clientWidth || 402;
        cardWidth = slots[0].button.clientWidth || Math.max(150, Math.min(214, frameWidth * .39));
        cardHeight = slots[0].button.clientHeight || Math.max(246, Math.min(346, frameWidth * .66));
        paint();
        // The first paint reveals the recycled buttons; use their real CSS
        // dimensions before any decoded photo is displayed.
        cardWidth = slots[0].button.clientWidth || cardWidth;
        cardHeight = slots[0].button.clientHeight || cardHeight;
      }
      schedule();
    };
    const photoViewer = initPhotoViewer(root, {
      signal: events.signal, reduced, load,
      onClose: schedule,
    });
    const openViewer = (slot: Slot) => {
      if (performance.now() < suppressClickUntil || viewer.open) return;
      target = null;
      const item = photos[slot.photo];
      photoViewer.open({ source: slot.button, image: slot.image, fullSrc: item.fullSrc || item.src, liveVideoSrc: item.liveVideoSrc });
      schedule();
    };
    slots.forEach((slot) => {
      slot.button.style.transformOrigin = "0 0";
      slot.button.addEventListener("click", () => {
        if (performance.now() < suppressClickUntil || slot.photo < 0) return;
        openViewer(slot);
      }, options);
      slot.image.addEventListener("load", () => {
        decodeSlot(slot);
      }, options);
      slot.image.addEventListener("error", () => {
        if (slot.photo < 0) return;
        const item = photos[slot.photo];
        const fallback = [item.src, item.fullSrc].find((src) => src && src !== slot.image.getAttribute("src"));
        if (fallback && slot.image.dataset.fallback !== String(slot.sequence)) {
          slot.revision++;
          slot.ready = false;
          slot.image.dataset.fallback = String(slot.sequence); slot.image.src = fallback;
        } else if (slot.sequence === currentSequence) {
          loading.textContent = "这张照片暂时无法加载，可继续旋转"; retry.hidden = false;
        }
      }, options);
    });
    retry.addEventListener("click", () => {
      retry.hidden = true; loading.textContent = "照片加载中";
      const slot = slots[mod(Math.round(rotation), slots.length)];
      slot.image.removeAttribute("data-fallback"); assign(slot, slot.sequence); paint();
    }, options);
    const pickSlot = (x: number, y: number, eventTarget: EventTarget | null) => {
      const button = eventTarget instanceof Element ? eventTarget.closest('[data-photo-open]') : null;
      // Preserve the hit-test fallback for composited/rotating card surfaces.
      return slots.find((slot) => slot.button === button) || slots
        .filter((slot) => {
          if (slot.photo < 0 || slot.button.style.pointerEvents === 'none') return false;
          const rect = slot.button.getBoundingClientRect();
          return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        })
        .sort((a, b) => Math.abs(a.sequence - rotation) - Math.abs(b.sequence - rotation))[0];
    };
    const begin = (id: number, input: Gesture['input'], x: number, y: number, eventTarget: EventTarget | null) => {
      if (!phone.matches || !photos.length || viewer.open) return;
      const now = performance.now();
      gesture = { id, input, x, y, rotation, lastX: x, time: now, started: now, speed: 0, dragging: false, slot: pickSlot(x, y, eventTarget) };
      suppressClickUntil = 0;
      target = null; momentum = 0; schedule();
    };
    const release = (point?: { x: number; y: number }, cancelled = false) => {
      if (!gesture) return;
      const ended = gesture; gesture = null;
      frame.classList.remove('is-dragging');
      if (ended.input === 'pointer' && frame.hasPointerCapture(ended.id)) frame.releasePointerCapture(ended.id);
      if (ended.dragging) {
        suppressClickUntil = performance.now() + 300;
        momentum = cancelled || reduced.matches || performance.now() - ended.time > 100 ? 0 : Math.max(-5, Math.min(5, ended.speed));
      } else if (!cancelled && point && ended.slot && performance.now() - ended.started < 600 && Math.hypot(point.x - ended.x, point.y - ended.y) < 12) {
        openViewer(ended.slot);
        suppressClickUntil = performance.now() + 300;
      }
      schedule();
    };
    const move = (x: number, y: number, event: Event) => {
      if (!gesture) return;
      const dx = x - gesture.x;
      const dy = y - gesture.y;
      if (!gesture.dragging) {
        if (Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx)) { release(undefined, true); return; }
        if (Math.abs(dx) < 6 || Math.abs(dx) <= Math.abs(dy)) return;
        gesture.dragging = true;
        frame.classList.add('is-dragging');
      }
      // Touch owns its entire lifecycle, even when Safari cancels the parallel
      // pointer stream. Never capture a pointer from inside a touch listener.
      if (event.cancelable) event.preventDefault();
      const now = performance.now();
      const elapsed = Math.max(8, now - gesture.time);
      const scale = frameWidth * .42;
      const velocity = -(x - gesture.lastX) / scale / elapsed * 1000;
      gesture.speed = gesture.speed * .6 + velocity * .4;
      gesture.lastX = x; gesture.time = now;
      rotation = gesture.rotation - dx / scale;
      schedule();
    };
    frame.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1) { release(undefined, true); return; }
      const touch = event.touches[0];
      begin(touch.identifier, 'touch', touch.clientX, touch.clientY, event.target);
    }, { ...options, passive: true });
    frame.addEventListener('touchmove', (event) => {
      if (gesture?.input !== 'touch') return;
      if (event.touches.length !== 1) { release(undefined, true); return; }
      const touch = Array.from(event.touches).find((item) => item.identifier === gesture!.id);
      if (touch) move(touch.clientX, touch.clientY, event);
    }, { ...options, passive: false });
    window.addEventListener('touchend', (event) => {
      if (gesture?.input !== 'touch') return;
      const touch = Array.from(event.changedTouches).find((item) => item.identifier === gesture!.id);
      if (!touch) return;
      // The explicit tap above opens once; do not also dispatch a delayed click.
      if ((gesture.dragging || gesture.slot) && event.cancelable) event.preventDefault();
      release({ x: touch.clientX, y: touch.clientY });
    }, { ...options, passive: false });
    window.addEventListener('touchcancel', (event) => {
      if (gesture?.input === 'touch' && Array.from(event.changedTouches).some((item) => item.identifier === gesture!.id)) release(undefined, true);
    }, options);
    frame.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0) return;
      begin(event.pointerId, 'pointer', event.clientX, event.clientY, event.target);
      if (gesture?.input === 'pointer') frame.setPointerCapture(event.pointerId);
    }, options);
    frame.addEventListener('pointermove', (event) => {
      if (gesture?.input === 'pointer' && event.pointerType !== 'touch' && event.pointerId === gesture.id) move(event.clientX, event.clientY, event);
    }, options);
    window.addEventListener('pointerup', (event) => {
      if (gesture?.input === 'pointer' && event.pointerType !== 'touch' && event.pointerId === gesture.id) release({ x: event.clientX, y: event.clientY });
    }, options);
    const cancelPointer = (event: PointerEvent) => {
      if (gesture?.input === 'pointer' && event.pointerType !== 'touch' && event.pointerId === gesture.id) release(undefined, true);
    };
    frame.addEventListener('pointercancel', cancelPointer, options);
    frame.addEventListener('lostpointercapture', cancelPointer, options);
    frame.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") { event.preventDefault(); turnTo(Math.round(rotation) + 1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); turnTo(Math.round(rotation) - 1); }
    }, options);
    frame.addEventListener("contextmenu", (event) => event.preventDefault(), options);
    document.addEventListener("visibilitychange", () => { if (document.hidden) release(undefined, true); schedule(); }, options);
    window.addEventListener("blur", () => release(undefined, true), options);
    reduced.addEventListener("change", () => {
      auto = !reduced.matches;
      if (reduced.matches) { rotation = Math.round(rotation); target = null; momentum = 0; }
      paint(); schedule();
    }, options);
    phone.addEventListener("change", () => {
      release();
      if (!phone.matches) photoViewer.close(true);
      if (phone.matches) ensureStarted();
      schedule();
    }, options);
    const resize = new ResizeObserver(() => {
      frameWidth = frame.clientWidth || frameWidth;
      cardWidth = slots[0].button.clientWidth || cardWidth;
      cardHeight = slots[0].button.clientHeight || cardHeight;
      if (phone.matches) distanceLayout.layout();
      paint();
    });
    resize.observe(frame);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting; ensureStarted(); schedule();
    }, { threshold: .08 });
    observer.observe(frame);
    document.addEventListener("astro:before-swap", () => {
      disposed = true; gesture = null; cancelAnimationFrame(raf);
      observer.disconnect(); resize.disconnect();
      photoViewer.dispose();
      for (const cancel of [...cancelLoads]) cancel();
      events.abort();
    }, { once: true });
  });
}

initPhotoOrbits();
document.addEventListener("astro:page-load", initPhotoOrbits);
