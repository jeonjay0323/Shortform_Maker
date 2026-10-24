// 브라우저에서 업로드 파일을 AI에 보낼 수 있는 형태로 바꾼다 (이미지 축소, PDF·문서 변환)

export type Upload = { src: string; data: string; mediaType: string; label: string; original?: Upload };
export type Source = { name: string; data: string; mediaType: string };

// 원본 PDF를 그대로 보낼 수 있는 크기. 넘으면 페이지 이미지로 바꿔 보낸다 (서버 요청 한도 4.5MB)
const MAX_PDF_BYTES = 2.5 * 1024 * 1024;
const MAX_PDF_PAGES = 8;
const MAX_TEXT_CHARS = 30000;

const canvasToUpload = (canvas: HTMLCanvasElement, quality: number): Upload => {
  const src = canvas.toDataURL("image/webp", quality);
  return { src, data: src.split(",")[1], mediaType: "image/webp", label: "" };
};

export const shrink = (file: Blob, maxSide = 1280, quality = 0.85): Promise<Upload> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvasToUpload(canvas, quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이 이미지 형식은 읽을 수 없어요. JPG·PNG로 바꿔서 올려 주세요."));
    };
    img.src = url;
  });

const toBase64 = (buf: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
};

const pdfToImages = async (file: File, buf: Uint8Array): Promise<Source[]> => {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: Source[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, MAX_PDF_PAGES); n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1400 / Math.max(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
    const { data, mediaType } = canvasToUpload(canvas, 0.8);
    pages.push({ name: `${file.name} ${n}쪽`, data, mediaType });
  }
  return pages;
};

const xmlText = (xml: string, paragraphEnd: RegExp) =>
  xml
    .replace(paragraphEnd, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const byNumber = (a: string, b: string) => Number(a.match(/(\d+)\.xml$/)?.[1]) - Number(b.match(/(\d+)\.xml$/)?.[1]);

// Word·PowerPoint·한글(HWPX)은 압축된 XML이라 글자만 뽑아낸다
const officeText = async (file: File, ext: string) => {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);
  const read = async (pattern: RegExp, paragraphEnd: RegExp) => {
    const names = Object.keys(zip.files).filter((n) => pattern.test(n)).sort(byNumber);
    const parts = await Promise.all(names.map((n) => zip.file(n)!.async("string")));
    return parts.map((x) => xmlText(x, paragraphEnd)).join("\n\n");
  };
  if (ext === "docx") return read(/^word\/document\.xml$/, /<\/w:p>/g);
  if (ext === "pptx") return read(/^ppt\/slides\/slide\d+\.xml$/, /<\/a:p>/g);
  return read(/^Contents\/section\d+\.xml$/, /<\/hp:p>/g);
};

// 캐릭터 배경 지우기. 브라우저 안에서 AI 모델(IMG.LY, 첫 사용 때 약 80MB 내려받음)로 처리해 사진이 서버로 나가지 않는다
export const removeBg = async (upload: Upload, onProgress: (label: string) => void): Promise<Upload> => {
  const { removeBackground } = await import("@imgly/background-removal");
  const blob = await removeBackground(upload.src, {
    model: "isnet_fp16",
    output: { format: "image/png" },
    progress: (key, current, total) => {
      if (key.startsWith("fetch") && total > 0) onProgress(`모델 받는 중 ${Math.round((current / total) * 100)}%`);
      else onProgress("배경 지우는 중…");
    },
  });
  const cut = await shrink(blob);
  return { ...cut, label: upload.label, original: upload };
};

export const SOURCE_ACCEPT = "image/*,application/pdf,.pdf,.docx,.pptx,.hwpx,.txt,.md,.csv";

export const readSource = async (file: File): Promise<Source[]> => {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (file.type === "application/pdf" || ext === "pdf") {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (file.size <= MAX_PDF_BYTES) return [{ name: file.name, data: toBase64(buf), mediaType: "application/pdf" }];
    return pdfToImages(file, buf);
  }
  if (file.type.startsWith("image/") || ["heic", "heif"].includes(ext)) {
    const { data, mediaType } = await shrink(file, 1800, 0.9);
    return [{ name: file.name, data, mediaType }];
  }
  if (["docx", "pptx", "hwpx"].includes(ext)) {
    const text = await officeText(file, ext);
    if (!text) throw new Error(`${file.name}: 글자를 찾지 못했어요. PDF로 저장해서 올려 주세요.`);
    return [{ name: file.name, data: text.slice(0, MAX_TEXT_CHARS), mediaType: "text/plain" }];
  }
  if (["txt", "md", "csv"].includes(ext) || file.type.startsWith("text/")) {
    return [{ name: file.name, data: (await file.text()).slice(0, MAX_TEXT_CHARS), mediaType: "text/plain" }];
  }
  if (["hwp", "doc", "ppt", "xls", "xlsx"].includes(ext)) {
    throw new Error(`${file.name}: 이 형식은 바로 읽을 수 없어요. PDF로 저장해서 올려 주세요.`);
  }
  throw new Error(`${file.name}: 지원하지 않는 파일이에요. 이미지·PDF·Word·PPT·HWPX를 올려 주세요.`);
};
