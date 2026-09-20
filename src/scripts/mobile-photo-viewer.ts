type ViewerPhoto = {
  source: HTMLButtonElement;
  image: HTMLImageElement;
  fullSrc?: string;
  liveVideoSrc?: string;
};

export function initPhotoViewer(root: HTMLElement, options: {
  signal: AbortSignal;
  reduced: MediaQueryList;
  load: (src: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const dialog = root.querySelector<HTMLDialogElement>("[data-photo-viewer]")!;
  const media = root.querySelector<HTMLElement>("[data-photo-viewer-media]")!;
  const veil = root.querySelector<HTMLElement>("[data-photo-viewer-veil]")!;
  const image = root.querySelector<HTMLImageElement>("[data-photo-full]")!;
  const video = root.querySelector<HTMLVideoElement>("[data-photo-video]")!;
  const status = root.querySelector<HTMLElement>("[data-photo-viewer-status]")!;
  const events = { signal: options.signal };
  let selected: ViewerPhoto | null = null;
  let token = 0;
  let closing = false;
  let previousOverflow = "";
  let movement: Animation | null = null;
  let fade: Animation | null = null;
  let selectedSequence = "";
  let outsidePress = false;
  let returnFrame = 0;
  let closingWidth = 0;
  let refreshReturnAnchor: (() => void) | null = null;

  const destination = () => {
    const ratio = (selected?.image.naturalWidth || image.naturalWidth || 3) /
      (selected?.image.naturalHeight || image.naturalHeight || 4);
    const width = Math.min(window.innerWidth - 40, (window.innerHeight - 80) * ratio);
    const height = width / ratio;
    return { left: `${(window.innerWidth - width) / 2}px`, top: `${(window.innerHeight - height) / 2}px`, width: `${width}px`, height: `${height}px` };
  };
  const fromRect = (rect: DOMRect, end: DOMRect) =>
    `translate(${rect.left - end.left}px, ${rect.top - end.top}px) scale(${rect.width / end.width}, ${rect.height / end.height})`;
  const stopLive = () => {
    video.pause(); video.classList.remove("is-playing");
  };
  const resetReturnStyles = () => {
    media.style.transform = '';
    media.style.opacity = '';
    media.style.borderRadius = '';
    media.style.clipPath = '';
    media.style.removeProperty('--return-shade');
    refreshReturnAnchor = null;
  };
  const finish = (notify = true) => {
    token++;
    cancelAnimationFrame(returnFrame); returnFrame = 0;
    movement?.cancel(); fade?.cancel(); movement = fade = null;
    stopLive();
    if (selected) selected.source.style.visibility = "";
    const wasOpen = dialog.open;
    selected = null; closing = false;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    if (wasOpen) dialog.close();
    document.body.style.overflow = previousOverflow;
    // Native dialog focus restoration must not scroll to a recycled orbit slot.
    if (window.scrollX !== scrollX || window.scrollY !== scrollY) window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
    resetReturnStyles();
    if (video.hasAttribute('src')) { video.removeAttribute('src'); video.load(); }
    if (notify && wasOpen) options.onClose();
  };
  const close = (immediate = false) => {
    if (!dialog.open) return;
    if (immediate) { finish(); return; }
    if (closing) return;
    if (options.reduced.matches || !selected?.source.isConnected) { finish(); return; }
    closing = true; closingWidth = window.innerWidth; token++;
    // Retain the last Live frame throughout the return; switching back to the
    // still photograph at the same time creates a second visible transition.
    video.pause();
    const start = media.getBoundingClientRect();
    const source = selected.source;
    const sourceStyle = getComputedStyle(source);
    const samePhoto = source.dataset.sequence === selectedSequence && Number(sourceStyle.opacity) > .05;
    const veilOpacity = getComputedStyle(veil).opacity;
    movement?.cancel(); fade?.cancel();
    const duration = 440;
    // Clear the blur before the final handoff, so two different blur levels
    // cannot flash when the small photo replaces the preview.
    fade = veil.animate([{ opacity: veilOpacity }, { opacity: 0 }], { duration: 310, fill: 'forwards' });
    const width = parseFloat(sourceStyle.width);
    const height = parseFloat(sourceStyle.height);
    const parent = source.offsetParent as HTMLElement | null;
    if (!samePhoto || !width || !height || !parent) {
      // A photo that has already left the carousel should not fly to a new photo.
      const initial = fromRect(start, media.getBoundingClientRect());
      movement = media.animate([{ opacity: 1, transform: initial }, { opacity: 0, transform: `${initial} scale(.96)` }], { duration, fill: 'forwards' });
      movement.onfinish = () => finish();
      return;
    }
    const parentRect = parent.getBoundingClientRect();
    const [originX, originY] = sourceStyle.transformOrigin.split(' ').map(parseFloat);
    let anchor = new DOMMatrix().translate(parentRect.left + parseFloat(sourceStyle.left) + originX, parentRect.top + parseFloat(sourceStyle.top) + originY);
    refreshReturnAnchor = () => {
      const rect = parent.getBoundingClientRect();
      const style = getComputedStyle(source);
      anchor = new DOMMatrix().translate(rect.left + parseFloat(style.left) + originX, rect.top + parseFloat(style.top) + originY);
    };
    const fullWidth = parseFloat(media.style.width);
    const fullHeight = parseFloat(media.style.height);
    const cover = Math.max(width / fullWidth, height / fullHeight);
    const cropX = Math.max(0, (fullWidth - width / cover) / 2);
    const cropY = Math.max(0, (fullHeight - height / cover) / 2);
    source.style.visibility = 'hidden';
    Object.assign(media.style, { left: '0px', top: '0px', width: `${fullWidth}px`, height: `${fullHeight}px`, transformOrigin: '0 0', borderRadius: '0px' });
    const from = new DOMMatrix().translate(start.left, start.top).scale(start.width / fullWidth, start.height / fullHeight);
    const mix = (a: number, b: number, progress: number) => a + (b - a) * progress;
    let blendReturn: boolean | undefined;
    const started = performance.now();
    const renderReturn = (now: number) => {
      if (!dialog.open || !selected || options.signal.aborted) return;
      const elapsed = Math.min(1, (now - started) / duration);
      const progress = 1 - Math.pow(1 - elapsed, 3);
      if (source.dataset.sequence !== selectedSequence) { finish(); return; }
      // The orbit publishes its 2D transform. Reading inline values does not
      // flush layout; all geometry above is measured only once.
      const target = anchor.multiply(new DOMMatrix(source.style.transform))
        .translate(width / 2 - originX, height / 2 - originY)
        .scale(cover).translate(-fullWidth / 2, -fullHeight / 2);
      const values = [mix(from.a, target.a, progress), mix(from.b, target.b, progress), mix(from.c, target.c, progress), mix(from.d, target.d, progress), mix(from.e, target.e, progress), mix(from.f, target.f, progress)];
      media.style.transform = `matrix(${values.join(',')})`;
      // Keep the large image at a constant natural aspect ratio. Only the crop
      // window closes around it; no counter-scaling or image re-layout occurs.
      const radius = mix(12, 11 / cover, progress);
      media.style.clipPath = `inset(${cropY * progress}px ${cropX * progress}px round ${radius}px)`;
      media.style.setProperty('--return-shade', `${(Number(source.style.getPropertyValue('--shade')) || 0) * progress}`);
      const handoff = Math.max(0, (elapsed - .72) / .28);
      const orbitOpacity = Math.max(0, Math.min(1, Number(source.style.opacity)));
      if (handoff > 0 && blendReturn === undefined) blendReturn = orbitOpacity >= .995;
      if (blendReturn) {
        // Keep the bottom layer opaque. Fading both layers would expose the
        // dark background and cause a brightness dip during the handoff.
        source.style.visibility = '';
        media.style.opacity = String(mix(1, orbitOpacity, progress) * (1 - handoff));
      } else {
        source.style.visibility = 'hidden';
        media.style.opacity = String(mix(1, orbitOpacity, progress));
      }
      if (elapsed < 1) returnFrame = requestAnimationFrame(renderReturn);
      else finish();
    };
    renderReturn(started);
  };
  const open = (photo: ViewerPhoto) => {
    if (dialog.open || options.signal.aborted) return;
    selected = photo; closing = false; outsidePress = false;
    selectedSequence = photo.source.dataset.sequence || "";
    const currentToken = ++token;
    const start = photo.source.getBoundingClientRect();
    image.src = photo.image.currentSrc || photo.image.src;
    image.alt = photo.image.alt;
    status.textContent = "";
    video.classList.remove("is-playing");
    video.hidden = !photo.liveVideoSrc;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    dialog.focus({ preventScroll: true });
    photo.source.style.visibility = "hidden";
    const end = destination();
    Object.assign(media.style, end);
    const duration = options.reduced.matches ? 0 : 460;
    media.style.transformOrigin = '0 0';
    movement = media.animate([
      { transform: fromRect(start, media.getBoundingClientRect()) },
      { transform: 'none' },
    ], { duration, easing: "cubic-bezier(.22,.8,.2,1)" });
    movement.onfinish = () => {
      if (selected === photo) photo.source.style.visibility = '';
    };
    fade = veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration });
    // Start within the tap gesture. Muted inline playback works on mobile Safari too.
    if (photo.liveVideoSrc) {
      video.src = photo.liveVideoSrc; video.poster = image.src;
      video.muted = true; video.loop = false; video.currentTime = 0;
      void video.play().catch(() => {
        if (currentToken !== token || !dialog.open) return;
        stopLive(); status.textContent = "实况暂时无法播放，正在显示照片。";
      });
    }
    if (photo.fullSrc && photo.fullSrc !== image.getAttribute("src")) {
      void options.load(photo.fullSrc).then((ok) => {
        if (currentToken !== token || !dialog.open || options.signal.aborted) return;
        if (ok) image.src = photo.fullSrc!;
      });
    }
  };
  dialog.addEventListener("pointerdown", (event) => {
    outsidePress = event.target instanceof Node && !media.contains(event.target);
  }, events);
  dialog.addEventListener("click", (event) => {
    if (outsidePress && (!(event.target instanceof Node) || !media.contains(event.target))) close();
    outsidePress = false;
  }, events);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); }, events);
  video.addEventListener("playing", () => {
    if (dialog.open && !closing) video.classList.add("is-playing");
  }, events);
  video.addEventListener("ended", stopLive, events);
  video.addEventListener("error", stopLive, events);
  window.addEventListener("resize", () => {
    if (!dialog.open) return;
    if (closing) {
      // Safari toolbar changes are height-only resizes. They must not abort an
      // in-flight return. A real orientation change fades out without a jump.
      if (window.innerWidth === closingWidth) { refreshReturnAnchor?.(); return; }
      cancelAnimationFrame(returnFrame); returnFrame = 0;
      const opacity = Number(getComputedStyle(media).opacity);
      movement?.cancel();
      movement = media.animate([{ opacity }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
      movement.onfinish = () => finish();
      return;
    }
    movement?.cancel(); Object.assign(media.style, destination());
  }, events);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopLive(); }, events);
  return { open, close, dispose: () => { if (dialog.open) finish(false); } };
}
