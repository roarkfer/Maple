import { useEffect, useState } from "react";
import { ChevronLeft, Download, Save } from "lucide-react";
import type { Notebook, ReaderSettings } from "@/lib/library-types";

type Props = {
  notebook: Notebook;
  settings: ReaderSettings;
  onChange: (text: string) => void;
  onBack: () => void;
};

export default function Writer({ notebook, settings, onChange, onBack }: Props) {
  const [text, setText] = useState(notebook.text);
  const [saved, setSaved] = useState(false);

  useEffect(() => setText(notebook.text), [notebook.id]);

  const save = () => {
    onChange(text);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const openExportPage = async () => {
    onChange(text);
    const clean = notebook.name.replace(/[^\\w\\-áéíóúñü ]/gi, "").trim() || "libreta";
    const file = new File([text], `${clean}.txt`, { type: "text/plain;charset=utf-8" });
    if (typeof navigator.share === "function" &&
        (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }))) {
      try { await navigator.share({ files: [file], title: file.name }); return; }
      catch (error) { if ((error as DOMException)?.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          onClick={() => {
            onChange(text);
            onBack();
          }}
          aria-label="Volver a libretas"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground active:scale-95"
        >
          <ChevronLeft size={26} strokeWidth={2} />
        </button>
        <span className="flex-1 truncate text-[13px] text-muted-foreground">{notebook.name}</span>
        <button
          type="button"
          onClick={openExportPage}
          className="flex items-center gap-1 rounded-md border border-border px-3 py-2 text-[14px] active:scale-95"
        >
          <Download size={15} strokeWidth={1.8} /> Descargar
        </button>
        <button
          type="button"
          onClick={save}
          className="flex items-center gap-1 rounded-md border border-foreground px-3 py-2 text-[14px] active:scale-95"
        >
          <Save size={15} strokeWidth={1.8} /> {saved ? "Guardado" : "Guardar"}
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escribe…"
        autoFocus
        style={{ fontSize: settings.fontSize, lineHeight: 1.6 }}
        className="w-full flex-1 resize-none bg-transparent px-4 pb-6 outline-none placeholder:text-muted-foreground"
      />

    </div>
  );
}
