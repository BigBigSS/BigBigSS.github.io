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

  const bounds = (rect: DOMRect) => ({
    left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
  });
  const destination = () => {
    const ratio = (selected?.image.naturalWidth || image.naturalWidth || 3) /
      (selected?.image.naturalHeight || image.naturalHeight || 4);
    const width = Math.min(window.innerWidth - 40, (window.innerHeight - 80) * ratio);
    const height = width / ratio;
    return { left: `${(window.innerWidth - width) / 2}px`, top: `${(window.innerHeight - height) / 2}px`, width: `${width}px`, height: `${height}px` };
  };
  const stopLive = () => {
    video.pause(); video.classList.remove("is-playing");
  };
  const finish = (notify = true) => {
    token++;
    movement?.cancel(); fade?.cancel(); movement = fade = null;
    stopLive(); video.removeAttribute("src"); video.load();
    if (selected) selected.source.style.visibility = "";
    const wasOpen = dialog.open;
    selected = null; closing = false;
    if (wasOpen) dialog.close();
    document.body.style.overflow = previousOverflow;
    if (notify && wasOpen) options.onClose();
  };
  const close = (immediate = false) => {
    if (!dialog.open) return;
    if (immediate) { finish(); return; }
    if (closing) return;
    if (options.reduced.matches || !selected?.source.isConnected) { finish(); return; }
    closing = true; token++; stopLive();
    const start = bounds(media.getBoundingClientRect());
    const end = bounds(selected.source.getBoundingClientRect());
    const veilOpacity = getComputedStyle(veil).opacity;
    movement?.cancel(); fade?.cancel();
    movement = media.animate([start, end], { duration: 300, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
    fade = veil.animate([{ opacity: veilOpacity }, { opacity: 0 }], { duration: 300, fill: "forwards" });
    movement.onfinish = () => finish();
  };
  const open = (photo: ViewerPhoto) => {
    if (dialog.open || options.signal.aborted) return;
    selected = photo; closing = false;
    const currentToken = ++token;
    const start = bounds(photo.source.getBoundingClientRect());
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
    movement = media.animate([start, end], { duration, easing: "cubic-bezier(.22,.8,.2,1)" });
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
  dialog.addEventListener("click", (event) => {
    if (!(event.target instanceof Node) || !media.contains(event.target)) close();
  }, events);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); }, events);
  video.addEventListener("playing", () => {
    if (dialog.open && !closing) video.classList.add("is-playing");
  }, events);
  video.addEventListener("ended", stopLive, events);
  video.addEventListener("error", stopLive, events);
  window.addEventListener("resize", () => {
    if (!dialog.open || closing) return;
    movement?.cancel(); Object.assign(media.style, destination());
  }, events);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopLive(); }, events);
  return { open, close, dispose: () => { if (dialog.open) finish(false); } };
}
