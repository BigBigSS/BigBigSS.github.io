const RESPONSIVE_WIDTHS = [480, 720, 960, 1200];
const DEFAULT_SIZES = "(min-width: 768px) 720px, calc(100vw - 48px)";
const DIMENSION_URL_PATTERN = /^(.*\/)(\d{2,5})\/(\d{2,5})([/?#].*)?$/;

function visit(node, callback) {
  if (!node || typeof node !== "object") return;
  callback(node);

  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    visit(child, callback);
  }
}

function dimensionsFromUrl(src) {
  const match = src.match(DIMENSION_URL_PATTERN);
  if (!match) return null;

  const width = Number(match[2]);
  const height = Number(match[3]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    prefix: match[1],
    width,
    height,
    suffix: match[4] ?? "",
  };
}

function buildSrcSet(src) {
  const dimensions = dimensionsFromUrl(src);
  if (!dimensions) return null;

  const widths = RESPONSIVE_WIDTHS.filter((width) => width < dimensions.width);
  widths.push(dimensions.width);

  return [...new Set(widths)]
    .map((width) => {
      const height = Math.round((width / dimensions.width) * dimensions.height);
      return `${dimensions.prefix}${width}/${height}${dimensions.suffix} ${width}w`;
    })
    .join(", ");
}

export default function rehypeImagePerformance() {
  return (tree) => {
    visit(tree, (node) => {
      if (node.type !== "element" || node.tagName !== "img") return;

      node.properties ??= {};

      const src = typeof node.properties.src === "string" ? node.properties.src : "";
      const dimensions = src ? dimensionsFromUrl(src) : null;

      node.properties.loading ??= "lazy";
      node.properties.decoding ??= "async";
      node.properties.fetchpriority ??= "low";

      if (dimensions) {
        node.properties.width ??= dimensions.width;
        node.properties.height ??= dimensions.height;
        node.properties.srcSet ??= buildSrcSet(src);
        node.properties.sizes ??= DEFAULT_SIZES;
      }
    });
  };
}
