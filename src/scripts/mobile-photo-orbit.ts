import { initPhotoViewer } from "./mobile-photo-viewer";
import { initPhotoDistance } from "./mobile-photo-distance";

type Photo = {
  src?: string; thumbSrc?: string; fullSrc?: string; liveVideoSrc?: string;
  title?: string; alt?: string; description?: string; mood?: string; takenAt?: string;
};
type Slot = {
  button: HTMLButtonElement; image: HTMLImageElement;
  live: HTMLElement; sequence: number; photo: number; promoted: boolean;
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
      live: button.querySelector("[data-photo-live]")!, sequence: NaN, photo: -1, promoted: false,
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
    let resumeAt = 0;
    let suppressClickUntil = 0;
    let frameWidth = 402;
    let cardWidth = 156;
    let gesture: { id: number; x: number; y: number; rotation: number; lastX: number; time: number; speed: number; dragging: boolean } | null = null;
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
        probe.onload = () => finish(true);
        probe.onerror = () => finish(false);
        timeout = window.setTimeout(cancel, 12000);
        probe.src = src;
      });
      loaded.set(src, promise);
      return promise;
    };
    const assign = (slot: Slot, sequence: number) => {
      slot.sequence = sequence; slot.photo = photoAt(sequence); slot.promoted = false;
      const item = photos[slot.photo];
      const src = item.thumbSrc || item.src || item.fullSrc || "";
      slot.image.src = src;
      slot.image.alt = item.description || item.alt || item.title || "生活照片";
      slot.live.hidden = !item.liveVideoSrc;
      slot.button.dataset.sequence = String(sequence);
      slot.button.dataset.photoIndex = String(slot.photo);
      slot.button.hidden = false;
    };
    const promote = (slot: Slot) => {
      if (slot.promoted) return;
      slot.promoted = true;
      const sequence = slot.sequence;
      const item = photos[slot.photo];
      const src = item.src || item.fullSrc;
      if (src && src !== slot.image.getAttribute("src")) void load(src).then((ok) => {
        if (!ok || disposed || !phone.matches || slot.sequence !== sequence) return;
        slot.image.src = src;
      });
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
        const tilt = angle * 180 / Math.PI;
        const opacity = Math.max(0, Math.min(1, (2.15 - abs) / .45));
        const focus = Math.max(0, 1 - abs);
        slot.button.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) rotateY(${tilt.toFixed(2)}deg)`;
        slot.button.style.opacity = String(opacity);
        slot.button.style.setProperty("--focus", focus.toFixed(3));
        slot.button.style.setProperty("--shade", Math.min(.5, abs * .15).toFixed(3));
        slot.button.style.pointerEvents = abs < 1.85 ? "auto" : "none";
        slot.button.tabIndex = sequence === center ? 0 : -1;
        slot.button.setAttribute("aria-hidden", String(abs >= 1.85));
        slot.button.setAttribute("aria-label", `放大照片：${slot.image.alt}`);
        if (abs < 1.3) promote(slot);
      }
      distance.style.transform = `translateX(${(-Math.sin(rotation * .18) * 9).toFixed(2)}px)`;
      root.dataset.rotation = rotation.toFixed(3);
      updateCurrent(center);
      const active = slots[mod(center, slots.length)];
      loading.hidden = active.image.complete && active.image.naturalWidth > 0;
    };
    const canRun = () => !disposed && visible && phone.matches && !document.hidden && !viewer.open && photos.length > 0;
    const tick = (now: number) => {
      raf = 0;
      if (!canRun()) { previousTime = 0; return; }
      const dt = previousTime ? Math.min((now - previousTime) / 1000, .05) : 0;
      previousTime = now;
      if (!gesture) {
        if (target !== null) {
          rotation += (target - rotation) * Math.min(1, dt * 8);
          if (Math.abs(target - rotation) < .002) { rotation = target; target = null; }
        } else if (auto && now >= resumeAt && photos.length > 1) rotation += dt * .17;
      }
      paint();
      if (auto || target !== null || gesture) raf = requestAnimationFrame(tick);
      else previousTime = 0;
    };
    const schedule = () => {
      if (!canRun()) { cancelAnimationFrame(raf); raf = 0; previousTime = 0; return; }
      if (!raf) { previousTime = 0; raf = requestAnimationFrame(tick); }
    };
    const turnTo = (sequence: number) => {
      if (photos.length < 2 || viewer.open) return;
      resumeAt = performance.now() + 3500;
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
        resumeAt = performance.now() + 1200;
        paint();
      }
      schedule();
    };
    const photoViewer = initPhotoViewer(root, {
      signal: events.signal, reduced, load,
      onClose: () => { resumeAt = performance.now() + 1400; schedule(); },
    });
    const openViewer = (slot: Slot) => {
      if (performance.now() < suppressClickUntil || viewer.open) return;
      target = null;
      const item = photos[slot.photo];
      photoViewer.open({ source: slot.button, image: slot.image, fullSrc: item.fullSrc || item.src, liveVideoSrc: item.liveVideoSrc });
      schedule();
    };
    slots.forEach((slot) => {
      slot.button.addEventListener("click", () => {
        if (performance.now() < suppressClickUntil || slot.photo < 0) return;
        openViewer(slot);
      }, options);
      slot.image.addEventListener("load", () => { if (slot.sequence === currentSequence) loading.hidden = true; }, options);
      slot.image.addEventListener("error", () => {
        if (slot.photo < 0) return;
        const item = photos[slot.photo];
        const fallback = [item.src, item.fullSrc].find((src) => src && src !== slot.image.getAttribute("src"));
        if (fallback && slot.image.dataset.fallback !== String(slot.sequence)) {
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
    frame.addEventListener("pointerdown", (event) => {
      if (!phone.matches || !photos.length || !event.isPrimary || event.button !== 0) return;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, rotation, lastX: event.clientX, time: performance.now(), speed: 0, dragging: false };
      target = null; schedule();
    }, options);
    frame.addEventListener("pointermove", (event) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (!gesture.dragging) {
        if (Math.abs(dy) > 9 && Math.abs(dy) > Math.abs(dx)) { gesture = null; schedule(); return; }
        if (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
        gesture.dragging = true;
        frame.setPointerCapture(event.pointerId);
        frame.classList.add("is-dragging");
      }
      const now = performance.now();
      const elapsed = Math.max(8, now - gesture.time);
      const scale = frameWidth * .42;
      const velocity = -(event.clientX - gesture.lastX) / scale / elapsed * 1000;
      gesture.speed = gesture.speed * .6 + velocity * .4;
      gesture.lastX = event.clientX; gesture.time = now;
      rotation = gesture.rotation - dx / scale;
      suppressClickUntil = now + 500;
      paint();
    }, options);
    const release = (event?: PointerEvent) => {
      if (!gesture || (event && event.pointerId !== gesture.id)) return;
      const ended = gesture; gesture = null;
      frame.classList.remove("is-dragging");
      if (frame.hasPointerCapture(ended.id)) frame.releasePointerCapture(ended.id);
      if (ended.dragging) {
        suppressClickUntil = performance.now() + 500;
        const inertia = Math.max(-1.5, Math.min(1.5, ended.speed * .22));
        turnTo(Math.round(rotation + (reduced.matches ? 0 : inertia)));
      } else schedule();
    };
    window.addEventListener("pointerup", release, options);
    frame.addEventListener("pointercancel", (event) => {
      if (gesture) gesture.speed = 0;
      release(event);
    }, options);
    frame.addEventListener("lostpointercapture", release, options);
    frame.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") { event.preventDefault(); turnTo(Math.round(rotation) + 1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); turnTo(Math.round(rotation) - 1); }
    }, options);
    frame.addEventListener("contextmenu", (event) => event.preventDefault(), options);
    document.addEventListener("visibilitychange", () => { if (document.hidden) release(); schedule(); }, options);
    window.addEventListener("blur", () => release(), options);
    reduced.addEventListener("change", () => {
      if (reduced.matches) { auto = false; rotation = Math.round(rotation); target = null; }
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
