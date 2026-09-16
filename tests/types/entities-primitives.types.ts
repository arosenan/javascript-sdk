import type {
  EntityAggregateSpec,
  EntityListOptions,
  EntityUpsertOptions,
} from "../../src/index.js";

interface Sale {
  id: string;
  agent_id: string;
  store: string;
  amount: number;
  sale_date: string;
  created_date: string;
}

const perAgent = {
  query: { sale_date: { $gte: "2026-09-01" } },
  groupBy: "agent_id",
  sum: ["amount"],
  avg: "amount",
  sort: "-sum_amount",
  limit: 50,
} satisfies EntityAggregateSpec<Sale>;

const perDay = {
  dateBucket: { field: "created_date", unit: "day" },
  countDistinct: "agent_id",
} satisfies EntityAggregateSpec<Sale>;

const duplicates = {
  groupBy: ["agent_id", "store"],
  having: { count: { $gt: 1 } },
} satisfies EntityAggregateSpec<Sale>;

// @ts-expect-error unknown field names are rejected
const badGroup = { groupBy: "region" } satisfies EntityAggregateSpec<Sale>;

// @ts-expect-error unknown bucket unit
const badUnit = { dateBucket: { field: "created_date", unit: "hour" } } satisfies EntityAggregateSpec<Sale>;

const firstPage = {
  sort: "-created_date",
  limit: 1000,
  fields: ["id", "amount"],
} satisfies EntityListOptions<Sale, "id" | "amount">;

const nextPage = { cursor: "opaque", sort: "-created_date" } satisfies EntityListOptions<Sale>;

// @ts-expect-error sort must name a field of the entity
const badSort = { sort: "-total" } satisfies EntityListOptions<Sale>;

const singleKey = { key: "id" } satisfies EntityUpsertOptions<Sale>;
const compoundKey = { key: ["agent_id", "store"] } satisfies EntityUpsertOptions<Sale>;

// @ts-expect-error key must name fields of the entity
const badKey = { key: "sku" } satisfies EntityUpsertOptions<Sale>;

export { perAgent, perDay, duplicates, badGroup, badUnit, firstPage, nextPage, badSort, singleKey, compoundKey, badKey };
