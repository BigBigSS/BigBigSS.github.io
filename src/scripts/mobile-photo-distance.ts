type DistancePhoto = {
  element: HTMLElement;
  image: HTMLImageElement;
  index: number;
};

type Placement = DistancePhoto & {
  x: number;
  y: number;
  width: number;
  height: number;
  halfWidth: number;
  halfHeight: number;
  depth: number;
  yaw: number;
  roll: number;
  distance: number;
};

// Each slot keeps the same small offsets when a photo loads or the phone resizes.
function variation(index: number, salt: number) {
  let value = Math.imul(index + 1, 374761393) ^ Math.imul(salt + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

export function initPhotoDistance(
  container: HTMLElement,
  options: { signal: AbortSignal },
): { layout: () => void } {
  const photos: DistancePhoto[] = Array.from(container.children).flatMap((child, index) => {
    const image = child.querySelector<HTMLImageElement>("img");
    return child instanceof HTMLElement && image ? [{ element: child, image, index }] : [];
  });
  let frame = 0;

  const layout = () => {
    if (options.signal.aborted) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height || !photos.length) return;

    const columns = 7;
    const rows = Math.ceil(photos.length / columns);
    const cellWidth = width / columns;
    const rowHeight = height * 0.9 / rows;
    const placements: Placement[] = photos.map((photo) => {
      const { index, image } = photo;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const horizontal = (column + 0.5) / columns * 2 - 1;
      const distance = Math.max(0, 1 - Math.abs(horizontal) ** 1.35);
      const depth = 12 + distance * 320;
      const scale = 800 / (800 + depth);
      const yaw = -horizontal * 24;
      const roll = (variation(index, 4) - 0.5) * 3;
      const ratio = image.naturalWidth && image.naturalHeight
        ? image.naturalWidth / image.naturalHeight
        : 0.75;
      const area = cellWidth * rowHeight * (0.61 + variation(index, 3) * 0.12);
      let photoWidth = Math.sqrt(area * ratio);
      let photoHeight = Math.sqrt(area / ratio);
      const fit = Math.min(1, cellWidth * 1.13 / photoWidth, rowHeight * 0.96 / photoHeight);
      photoWidth *= fit;
      photoHeight *= fit;

      const projectedWidth = photoWidth * scale * Math.cos(yaw * Math.PI / 180);
      const projectedHeight = photoHeight * scale;
      const rollRadians = Math.abs(roll) * Math.PI / 180;
      const halfWidth = (projectedWidth * Math.cos(rollRadians) + projectedHeight * Math.sin(rollRadians)) / 2;
      const halfHeight = (projectedHeight * Math.cos(rollRadians) + projectedWidth * Math.sin(rollRadians)) / 2;
      const stagger = row % 2 ? 0.12 : -0.12;
      const x = (column + 0.5 + stagger + (variation(index, 1) - 0.5) * 0.55) * cellWidth;
      const baseY = height * 0.05 + (row + 0.5 + (variation(index, 2) - 0.5) * 0.7) * rowHeight;
      // The middle wall recedes: its top and bottom converge towards the horizon.
      const y = height * 0.5 + (baseY - height * 0.5) * (1 - distance * 0.28);

      return { ...photo, x, y, width: photoWidth, height: photoHeight, halfWidth, halfHeight, depth, yaw, roll, distance };
    });

    // Preserve the staggered distribution while keeping mixed portrait/landscape
    // photos apart. This only runs on image load or resize, never during rotation.
    for (let pass = 0; pass < 12; pass += 1) {
      let adjusted = false;
      for (let i = 0; i < placements.length; i += 1) {
        const a = placements[i];
        for (let j = i + 1; j < placements.length; j += 1) {
          const b = placements[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const overlapX = a.halfWidth + b.halfWidth + 5 - Math.abs(dx);
          const overlapY = a.halfHeight + b.halfHeight + 5 - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) continue;
          adjusted = true;
          if (overlapX < overlapY) {
            const shift = (overlapX + 0.15) / 2 * (dx >= 0 ? 1 : -1);
            a.x -= shift;
            b.x += shift;
          } else {
            const shift = (overlapY + 0.15) / 2 * (dy >= 0 ? 1 : -1);
            a.y -= shift;
            b.y += shift;
          }
        }
      }
      if (!adjusted) break;
    }

    placements.forEach(({ element, image, x, y, width: photoWidth, height: photoHeight, depth, yaw, roll, distance }) => {
      element.style.left = `${x.toFixed(2)}px`;
      element.style.top = `${y.toFixed(2)}px`;
      element.style.width = `${photoWidth.toFixed(2)}px`;
      element.style.height = `${photoHeight.toFixed(2)}px`;
      element.style.transform = `translate(-50%, -50%) perspective(800px) translateZ(-${depth.toFixed(2)}px) rotateY(${yaw.toFixed(2)}deg) rotateZ(${roll.toFixed(2)}deg)`;
      element.style.filter = `blur(${(0.85 + distance * 1.05).toFixed(2)}px) brightness(${(0.95 - distance * 0.17).toFixed(2)}) saturate(.72)`;
      element.style.opacity = (0.89 - distance * 0.2).toFixed(2);
      element.style.zIndex = String(Math.round((1 - distance) * 10));
      image.style.objectFit = "contain";
    });
  };

  const requestLayout = () => {
    if (frame || options.signal.aborted) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      layout();
    });
  };

  photos.forEach(({ image }) => image.addEventListener("load", requestLayout, { signal: options.signal }));
  options.signal.addEventListener("abort", () => cancelAnimationFrame(frame), { once: true });
  layout();
  return { layout };
}
