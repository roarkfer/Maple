export type BookMeta = {
  id: string;
  title: string;
  author: string;
  progress: number; // 0..1
  hasCover: boolean;
  coverMime?: string;
};

export type DictMeta = { id: string; name: string; gz: boolean };
export type FontMeta = { id: string; name: string; family: string };
export type Notebook = { id: string; name: string; text: string; updatedAt: number };
export type ReaderSettings = { fontSize: number; fontFamily: string };
