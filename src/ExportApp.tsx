import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Download, Share2 } from "lucide-react";

type ExportData = { name: string; text: string };

const EXPORT_KEY = "maple-notebook-export";

function safeFileName(name: string) {
  const clean = name.replace(/[^\w\-áéíóúñü ]/gi, "").trim() || "libreta";
  return `${clean}.txt`;
}

export default function ExportApp() {
  const [data, setData] = useState<ExportData | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(EXPORT_KEY);
      if (raw) setData(JSON.parse(raw) as ExportData);
    } catch {
      setMessage("No se pudo recuperar el texto de la libreta.");
    }
  }, []);

  const file = useMemo(() => {
    if (!data) return null;
    const name = safeFileName(data.name);
    return new File([data.text], name, { type: "text/plain;charset=utf-8" });
  }, [data]);

  const directDownload = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setMessage(`Se preparó ${file.name}. Revisa tus descargas.`);
  };

  const saveFile = async () => {
    if (!file) return;

    const canShareFile =
      typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }));

    if (canShareFile) {
      try {
        await navigator.share({ files: [file], title: file.name });
        setMessage("En iPhone, elige “Guardar en Archivos” para conservar el TXT.");
        return;
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return;
      }
    }

    const picker = (
      window as unknown as {
        showSaveFilePicker?: (options: unknown) => Promise<{
          createWritable: () => Promise<{
            write: (contents: Blob) => Promise<void>;
            close: () => Promise<void>;
          }>;
        }>;
      }
    ).showSaveFilePicker;

    if (picker) {
      try {
        const handle = await picker({
          suggestedName: file.name,
          types: [{ description: "Archivo de texto", accept: { "text/plain": [".txt"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(file);
        await writable.close();
        setMessage(`Guardado como ${file.name}.`);
        return;
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return;
      }
    }

    directDownload();
  };

  return (
    <main className="min-h-screen bg-background px-4 pb-10 text-foreground">
      <header className="sticky top-0 z-10 -mx-4 flex min-h-14 items-center gap-3 border-b border-border bg-background px-3 py-2">
        <a
          href="./"
          aria-label="Volver a Maple"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground active:scale-95"
        >
          <ChevronLeft size={26} strokeWidth={2} />
        </a>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px]">{data?.name ?? "Exportar libreta"}</h1>
          <p className="text-[12px] text-muted-foreground">Archivo de texto completo</p>
        </div>
      </header>

      <section className="py-4">
        {data ? (
          <pre className="min-h-[45vh] whitespace-pre-wrap break-words rounded-md border border-border bg-card p-4 font-sans text-[14px] leading-7 text-card-foreground">
            {data.text || "Esta libreta está vacía."}
          </pre>
        ) : (
          <p className="py-12 text-center text-[14px] text-muted-foreground">
            Abre una libreta y pulsa Descargar para preparar su texto.
          </p>
        )}
      </section>

      {data ? (
        <div className="sticky bottom-3 grid gap-2 bg-background py-2">
          <button
            type="button"
            onClick={() => void saveFile()}
            className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-foreground bg-foreground px-4 text-[15px] text-background active:scale-[0.99]"
          >
            <Share2 size={18} /> Guardar .txt
          </button>
          <button
            type="button"
            onClick={directDownload}
            className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-[14px] active:scale-[0.99]"
          >
            <Download size={17} /> Descarga directa
          </button>
        </div>
      ) : null}

      {message ? (
        <p role="status" className="pt-2 text-center text-[12px] text-muted-foreground">
          {message}
        </p>
      ) : null}
    </main>
  );
}