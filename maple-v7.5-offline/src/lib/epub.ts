import { unzipSync, strFromU8 } from "fflate";

export type EpubChapter = { id: string; title: string; html: string };
export type ParsedEpub = {
  title: string;
  author: string;
  coverBlob: Blob | null;
  coverMime: string;
  chapters: EpubChapter[];
  objectUrls: string[];
};

function dirname(p: string) {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i + 1);
}

function resolvePath(base: string, rel: string) {
  const parts = (base + rel).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function mimeOf(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export function parseEpub(buffer: ArrayBuffer): ParsedEpub {
  const files = unzipSync(new Uint8Array(buffer));
  const parser = new DOMParser();

  const containerRaw = files["META-INF/container.xml"];
  if (!containerRaw) throw new Error("EPUB inválido: falta container.xml");
  const container = parser.parseFromString(strFromU8(containerRaw), "application/xml");
  const opfPath = container.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error("EPUB inválido: falta el OPF");

  const opfDir = dirname(opfPath);
  const opf = parser.parseFromString(strFromU8(files[opfPath]!), "application/xml");

  const title = opf.getElementsByTagName("dc:title")[0]?.textContent?.trim() || "Sin título";
  const author = opf.getElementsByTagName("dc:creator")[0]?.textContent?.trim() || "";

  type ManifestItem = { href: string; type: string; props: string };
  const manifest = new Map<string, ManifestItem>();
  opf.querySelectorAll("manifest > item").forEach((el) => {
    const id = el.getAttribute("id");
    const href = el.getAttribute("href");
    if (!id || !href) return;
    manifest.set(id, {
      href: resolvePath(opfDir, href),
      type: el.getAttribute("media-type") || "",
      props: el.getAttribute("properties") || "",
    });
  });

  // Portada
  let coverPath: string | null = null;
  for (const item of manifest.values()) {
    if (item.props.includes("cover-image")) coverPath = item.href;
  }
  if (!coverPath) {
    const metaCover = Array.from(opf.querySelectorAll("metadata > meta")).find(
      (m) => m.getAttribute("name") === "cover",
    );
    const id = metaCover?.getAttribute("content");
    if (id && manifest.has(id)) coverPath = manifest.get(id)!.href;
  }
  if (!coverPath) {
    const guess = Object.keys(files).find(
      (k) => /cover/i.test(k) && /\.(jpe?g|png|webp)$/i.test(k),
    );
    if (guess) coverPath = guess;
  }
  const coverData = coverPath ? files[coverPath] : undefined;
  const coverBlob = coverData
    ? new Blob([coverData.slice() as unknown as BlobPart], { type: mimeOf(coverPath!) })
    : null;

  // URLs para imágenes internas
  const objectUrls: string[] = [];
  const urlByPath = new Map<string, string>();
  const imageUrl = (path: string) => {
    if (urlByPath.has(path)) return urlByPath.get(path)!;
    const data = files[path];
    if (!data) return "";
    const url = URL.createObjectURL(
      new Blob([data.slice() as unknown as BlobPart], { type: mimeOf(path) }),
    );
    urlByPath.set(path, url);
    objectUrls.push(url);
    return url;
  };

  // Títulos del índice (nav / ncx) por href
  const titleByHref = new Map<string, string>();
  for (const item of manifest.values()) {
    if (item.props.includes("nav") && files[item.href]) {
      const nav = parser.parseFromString(strFromU8(files[item.href]!), "text/html");
      nav.querySelectorAll("nav a").forEach((a) => {
        const href = a.getAttribute("href");
        if (href)
          titleByHref.set(
            resolvePath(dirname(item.href), href.split("#")[0]!),
            a.textContent?.trim() || "",
          );
      });
    }
    if (item.type === "application/x-dtbncx+xml" && files[item.href]) {
      const ncx = parser.parseFromString(strFromU8(files[item.href]!), "application/xml");
      ncx.querySelectorAll("navPoint").forEach((np) => {
        const href = np.querySelector("content")?.getAttribute("src");
        const label = np.querySelector("navLabel > text")?.textContent?.trim();
        if (href && label)
          titleByHref.set(resolvePath(dirname(item.href), href.split("#")[0]!), label);
      });
    }
  }

  const chapters: EpubChapter[] = [];
  opf.querySelectorAll("spine > itemref").forEach((ref, i) => {
    const idref = ref.getAttribute("idref");
    if (!idref) return;
    const item = manifest.get(idref);
    if (!item || !files[item.href]) return;
    const doc = parser.parseFromString(strFromU8(files[item.href]!), "text/html");
    const base = dirname(item.href);

    doc.querySelectorAll("img, image").forEach((img) => {
      const src =
        img.getAttribute("src") ||
        img.getAttribute("xlink:href") ||
        img.getAttribute("href");
      if (!src || /^(https?:|data:)/.test(src)) return;
      const url = imageUrl(resolvePath(base, src));
      if (!url) {
        img.remove();
        return;
      }
      if (img.tagName.toLowerCase() === "image") {
        img.setAttribute("href", url);
        img.setAttribute("xlink:href", url);
      } else {
        img.setAttribute("src", url);
      }
    });
    doc.querySelectorAll("script, link, style").forEach((el) => el.remove());
    doc.querySelectorAll("[style]").forEach((el) => el.removeAttribute("style"));

    const html = doc.body?.innerHTML ?? "";
    if (!html.trim()) return;
    chapters.push({
      id: `${i}-${idref}`,
      title: titleByHref.get(item.href) || `Capítulo ${chapters.length + 1}`,
      html,
    });
  });

  return {
    title,
    author,
    coverBlob,
    coverMime: coverPath ? mimeOf(coverPath) : "image/jpeg",
    chapters,
    objectUrls,
  };
}
