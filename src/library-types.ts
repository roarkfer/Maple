export type Notebook = {
  id: string;
  name: string;
  text: string;
  updatedAt: number;
  tags?: string[];
};
export type ReaderSettings = { fontSize: number; fontFamily: string; mode?: "page" | "scroll" };
