import { AxiosInstance } from "axios";
import {
  DeleteManyResult,
  DeleteResult,
  EntitiesModule,
  EntityAggregateResult,
  EntityAggregateSpec,
  EntityDistinctResult,
  EntityFilterQuery,
  EntityHandler,
  EntityListOptions,
  EntityPage,
  EntityUpsertOptions,
  EntityUpsertResult,
  ImportResult,
  RealtimeCallback,
  RealtimeEvent,
  RealtimeEventType,
  SortField,
  UpdateManyResult,
} from "./entities.types";
import { RoomsSocket } from "../utils/socket-utils.js";

/**
 * Configuration for the entities module.
 * @internal
 */
export interface EntitiesModuleConfig {
  axios: AxiosInstance;
  appId: string;
  getSocket: () => ReturnType<typeof RoomsSocket>;
}

/**
 * Creates the entities module for the Base44 SDK.
 *
 * @param config - Configuration object containing axios, appId, and getSocket
 * @returns Entities module with dynamic entity access
 * @internal
 */
export function createEntitiesModule(
  config: EntitiesModuleConfig
): EntitiesModule {
  const { axios, appId, getSocket } = config;
  // Using Proxy to dynamically handle entity names
  return new Proxy(
    {},
    {
      get(target, entityName) {
        // Don't create handlers for internal properties
        if (
          typeof entityName !== "string" ||
          entityName === "then" ||
          entityName.startsWith("_")
        ) {
          return undefined;
        }

        // Create entity handler
        return createEntityHandler(axios, appId, entityName, getSocket);
      },
    }
  ) as EntitiesModule;
}

/**
 * Parses the realtime message data and extracts event information.
 * @internal
 */
function parseRealtimeMessage<T = any>(dataStr: string): RealtimeEvent<T> | null {
  try {
    const parsed = JSON.parse(dataStr);
    return {
      type: parsed.type as RealtimeEventType,
      data: parsed.data as T,
      id: parsed.id || parsed.data?.id,
      timestamp: parsed.timestamp || new Date().toISOString(),
    };
  } catch (error) {
    console.warn("[Base44 SDK] Failed to parse realtime message:", error);
    return null;
  }
}

function isListOptions(value: unknown): value is EntityListOptions<any, any> {
  return typeof value === "object" && value !== null;
}

function pageParams(options: EntityListOptions<any, any>): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (options.sort) params.sort = options.sort;
  if (options.limit) params.limit = options.limit;
  if (options.cursor) params.cursor = options.cursor;
  if (options.fields)
    params.fields = Array.isArray(options.fields) ? options.fields.join(",") : options.fields;
  return params;
}

/**
 * Creates a handler for a specific entity.
 *
 * @param axios - Axios instance
 * @param appId - Application ID
 * @param entityName - Entity name
 * @param getSocket - Function to get the socket instance
 * @returns Entity handler with CRUD methods
 * @internal
 */
function createEntityHandler<T = any>(
  axios: AxiosInstance,
  appId: string,
  entityName: string,
  getSocket: () => ReturnType<typeof RoomsSocket>
): EntityHandler<T> {
  const baseURL = `/apps/${appId}/entities/${entityName}`;

  return {
    // List entities. Positional args read one array; an options object reads one cursor page.
    async list<K extends keyof T = keyof T>(
      sortOrOptions?: SortField<T> | EntityListOptions<T, K>,
      limit?: number,
      skip?: number,
      fields?: K[]
    ): Promise<any> {
      if (isListOptions(sortOrOptions)) {
        return axios.get(`${baseURL}/v2/list`, { params: pageParams(sortOrOptions) });
      }
      const params: Record<string, string | number> = {};
      if (sortOrOptions) params.sort = sortOrOptions;
      if (limit) params.limit = limit;
      if (skip) params.skip = skip;
      if (fields)
        params.fields = Array.isArray(fields) ? fields.join(",") : fields;

      return axios.get(baseURL, { params });
    },

    // Filter entities. Positional args read one array; an options object reads one cursor page.
    async filter<K extends keyof T = keyof T>(
      query: EntityFilterQuery<T>,
      sortOrOptions?: SortField<T> | EntityListOptions<T, K>,
      limit?: number,
      skip?: number,
      fields?: K[]
    ): Promise<any> {
      const q = JSON.stringify(query);
      if (isListOptions(sortOrOptions)) {
        return axios.get(`${baseURL}/v2/list`, { params: { q, ...pageParams(sortOrOptions) } });
      }
      const params: Record<string, string | number> = { q };

      if (sortOrOptions) params.sort = sortOrOptions;
      if (limit) params.limit = limit;
      if (skip) params.skip = skip;
      if (fields)
        params.fields = Array.isArray(fields) ? fields.join(",") : fields;

      return axios.get(baseURL, { params });
    },

    // Get entity by ID
    async get(id: string): Promise<T> {
      return axios.get(`${baseURL}/${id}`);
    },

    // Create new entity
    async create(data: Partial<T>): Promise<T> {
      return axios.post(baseURL, data);
    },

    // Update entity by ID
    async update(id: string, data: Partial<T>): Promise<T> {
      return axios.put(`${baseURL}/${id}`, data);
    },

    // Delete entity by ID
    async delete(id: string): Promise<DeleteResult> {
      return axios.delete(`${baseURL}/${id}`);
    },

    // Delete multiple entities based on query
    async deleteMany(query: Partial<T>): Promise<DeleteManyResult> {
      return axios.delete(baseURL, { data: query });
    },

    // Create multiple entities in a single request
    async bulkCreate(data: Partial<T>[]): Promise<T[]> {
      return axios.post(`${baseURL}/bulk`, data);
    },

    // Update multiple entities matching a query using a MongoDB update operator
    async updateMany(query: Partial<T>, data: Record<string, Record<string, any>>): Promise<UpdateManyResult> {
      return axios.patch(`${baseURL}/update-many`, { query, data });
    },

    // Count entities matching a query
    async count(query?: EntityFilterQuery<T>): Promise<number> {
      const params: Record<string, string> = {};
      if (query) params.q = JSON.stringify(query);
      const result: { count: number } = await axios.get(`${baseURL}/count`, { params });
      return result.count;
    },

    // Distinct values of one field
    async distinct<K extends keyof T & string>(
      field: K,
      query?: EntityFilterQuery<T>
    ): Promise<EntityDistinctResult<T[K]>> {
      const params: Record<string, string> = { field };
      if (query) params.q = JSON.stringify(query);
      return axios.get(`${baseURL}/distinct`, { params });
    },

    // Server-side group-by aggregation
    async aggregate(spec: EntityAggregateSpec<T>): Promise<EntityAggregateResult> {
      return axios.post(`${baseURL}/aggregate`, spec);
    },

    // Create or update by a natural key
    async upsert(
      records: Partial<T>[],
      options: EntityUpsertOptions<T>
    ): Promise<EntityUpsertResult<T>> {
      return axios.post(`${baseURL}/upsert`, { records, key: options.key });
    },

    // Update multiple entities by ID, each with its own update data
    async bulkUpdate(data: (Partial<T> & { id: string })[]): Promise<T[]> {
      return axios.put(`${baseURL}/bulk`, data);
    },

    // Import entities from a file
    async importEntities(file: File): Promise<ImportResult<T>> {
      const formData = new FormData();
      formData.append("file", file, file.name);

      return axios.post(`${baseURL}/import`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
    },

    // Subscribe to realtime updates
    subscribe(callback: RealtimeCallback<T>): () => void {
      const room = `entities:${appId}:${entityName}`;

      // Get the socket and subscribe to the room
      const socket = getSocket();
      const unsubscribe = socket.subscribeToRoom(room, {
        update_model: (msg) => {
          const event = parseRealtimeMessage<T>(msg.data);
          if (!event) {
            return;
          }

          // Server signals oversize broadcasts with `_oversize: true` on
          // `data`. The wire payload was slimmed to fit under the realtime
          // transport cap, so big string fields arrive as empty strings (or
          // the whole record collapses to a stub). Surface this to the
          // developer console so they know to fetch the full record on
          // demand (e.g. a follow-up entities.X.get(id) call) instead of
          // rendering the slimmed payload directly. Skip on delete events
          // — the record no longer exists.
          if (event.type !== "delete" && (event.data as any)?._oversize) {
            console.error(
              `[Base44 SDK] Realtime broadcast for ${entityName}#${event.id} was oversize and got slimmed for transport. ` +
                `Fields >10 KB are empty and the rest of the record may be a stub. ` +
                `Call \`entities.${entityName}.get("${event.id}")\` to fetch the full record.`
            );
          }

          try {
            callback(event);
          } catch (error) {
            console.error("[Base44 SDK] Subscription callback error:", error);
          }
        },
      });

      return unsubscribe;
    },
  };
}
