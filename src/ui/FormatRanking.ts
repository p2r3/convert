import { formatIdentifier, sameFormat, type FileFormat } from "src/FormatHandler";
import type { CategoryType } from "src/Formats";
import data from "src/ui/popularity.json";

type Counts = Partial<Record<string, number>>;

type CategoryShares = Partial<Record<CategoryType, number>>;

const categories: Partial<
  Record<
    CategoryType,
    {
      in: number;
      out: number;
      /** Share of this category's conversions that go to each category. */
      to?: CategoryShares;
    }
  >
> = data.categories;
const formats: Partial<
  Record<
    string,
    {
      in?: number;
      out?: number;
      /** Share of this format among web files of its category. */
      web?: number;
      /** Category used to calculate the within-category web share. */
      webCategory?: string;
      /** Share of this format's conversions that go to each category. */
      to?: CategoryShares;
      /** Conversion volumes keyed by destination format. */
      pairs?: Counts;
    }
  >
> = data.formats;

export type FormatCategories = ReadonlyMap<string, readonly CategoryType[]>;

function categoriesOf(format: FileFormat, collected?: FormatCategories): readonly CategoryType[] {
  return (
    collected?.get(format.format) ??
    (Array.isArray(format.category) ? format.category : [format.category])
  );
}

/** Union categories across handlers without changing their format objects. */
export function collectFormatCategories(formats: Iterable<FileFormat>): FormatCategories {
  const collected = new Map<string, CategoryType[]>();
  for (const format of formats) {
    const categories = collected.get(format.format) ?? [];
    for (const category of categoriesOf(format)) {
      if (!categories.includes(category)) categories.push(category);
    }
    collected.set(format.format, categories);
  }
  return collected;
}

function predictCategory(
  from: FileFormat,
  to: CategoryType,
  collected: FormatCategories,
): number | undefined {
  const specific = formats[from.format]?.to;
  if (specific) return specific[to] ?? 0;
  const general = categoriesOf(from, collected).map((c) => categories[c]?.to);
  if (!general.some(Boolean)) return undefined;
  return Math.max(0, ...general.map((shares) => shares?.[to] ?? 0));
}

// Starting linear weights. Volumes are monthly counts; category/web shares are 0–1.
const WEIGHTS = {
  pair: 1,
  volume: 0.001,
  web: 1000,
  sameCategory: 1000,
  prediction: 500,
  edgeCost: 500,
};

function rankScore(
  format: FileFormat,
  direction: "from" | "to",
  other: FileFormat | null,
  collected: FormatCategories,
  costs?: ReadonlyMap<string, number>,
): number {
  // A zero-cost no-op should not displace actual conversion choices.
  if (sameFormat(other, format)) return -Infinity;
  const side = direction === "from" ? "in" : "out";
  const stats = formats[format.format];
  const cats = categoriesOf(format, collected);

  let pair = 0;
  let prediction = 0;
  let sameCategory = 0;
  if (other) {
    const [from, to] = direction === "to" ? [other, format] : [format, other];
    pair = formats[from.format]?.pairs?.[to.format] ?? 0;
    const predictions = categoriesOf(to, collected).map((c) => predictCategory(from, c, collected));
    prediction = Math.max(0, ...predictions.map((p) => p ?? 0));
    const otherCats = categoriesOf(other, collected);
    sameCategory = Number(cats.some((c) => otherCats.includes(c)));
  }
  const webCategory = stats?.webCategory as CategoryType | undefined;
  const popularity = (webCategory ? (categories[webCategory]?.[side] ?? 0) : 0) * (stats?.web ?? 0);

  return (
    WEIGHTS.pair * pair +
    WEIGHTS.volume * (stats?.[side] ?? 0) +
    WEIGHTS.web * popularity +
    WEIGHTS.sameCategory * sameCategory +
    WEIGHTS.prediction * prediction -
    WEIGHTS.edgeCost * (costs ? (costs.get(formatIdentifier(format)) ?? Infinity) : 0)
  );
}

export function sortByPopularity<T>(
  items: T[],
  getFormat: (item: T) => FileFormat,
  direction: "from" | "to",
  other: FileFormat | null,
  collected: FormatCategories = collectFormatCategories([
    ...items.map(getFormat),
    ...(other ? [other] : []),
  ]),
  costs?: ReadonlyMap<string, number>,
): T[] {
  const keyed = items.map((item) => ({
    item,
    score: rankScore(getFormat(item), direction, other, collected, costs),
  }));
  keyed.sort((a, b) => (a.score === b.score ? 0 : b.score - a.score));
  return keyed.map(({ item }) => item);
}
