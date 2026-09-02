import type { DocStore } from "./DocStore";
import { createLocalDocStore } from "./keyValueDocStore";

/**
 * The app's chart storage.
 *
 * Browser-local for now, which is what the first release ships with. When
 * accounts land this becomes a choice between the local store and a Supabase
 * one; everything upstream talks to the `DocStore` interface and won't change.
 */
export const chartStore: DocStore = createLocalDocStore();
