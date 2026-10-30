// Supabase (PostgREST) devuelve como máximo 1000 filas por consulta y corta el
// resto sin avisar. Para listados que pueden crecer (movimientos de años) hay
// que pedir por bloques con .range() hasta que llegue un bloque incompleto.
//
// `build` debe crear la consulta de cero en cada llamada (los builders de
// Supabase no se reutilizan) y llevar un orden estable, idealmente terminando
// en una columna única como "id", para que los bloques no se solapen.
export const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = PAGE_SIZE
): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}
