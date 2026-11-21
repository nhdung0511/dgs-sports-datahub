/**
 * Saves an on-screen SVG chart as a PNG. Charts colour themselves with CSS variables
 * (var(--player-1) etc.), which a standalone image can't resolve, so every var() is swapped
 * for its current computed value first. The image matches the theme (light/dark) on screen.
 */
export async function saveSvgAsPng(svg: SVGSVGElement, filename: string, scale = 2): Promise<void> {
  const rootStyle = getComputedStyle(document.documentElement);
  const resolve = (s: string) => s.replace(/var\((--[\w-]+)\)/g, (_, name) => rootStyle.getPropertyValue(name).trim() || "#888");

  const clone = svg.cloneNode(true) as SVGSVGElement;
  const box = svg.viewBox.baseVal;
  const width = box && box.width ? box.width : svg.clientWidth;
  const height = box && box.height ? box.height : svg.clientHeight;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("font-family", getComputedStyle(document.body).fontFamily);

  for (const el of [clone, ...clone.querySelectorAll("*")]) {
    for (const attr of ["fill", "stroke", "style", "stop-color"]) {
      const v = el.getAttribute(attr);
      if (v?.includes("var(")) el.setAttribute(attr, resolve(v));
    }
  }

  // Solid background so the PNG isn't transparent.
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", rootStyle.getPropertyValue("--card").trim() || "#ffffff");
  clone.insertBefore(bg, clone.firstChild);

  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error("Couldn't draw the chart image."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas isn't available in this browser.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
    if (!png) throw new Error("Couldn't create the PNG.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(png);
    a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  } finally {
    URL.revokeObjectURL(url);
  }
}
