import { apiConfig, liveConfigured } from "@/lib/api/config";
import { resolveProvider } from "@/lib/api/index";

/**
 * What the UI is allowed to claim about its data.
 *
 * The badge in the header is generated from this, not hard-coded, so a
 * misconfigured or failing live source can never leave a "Live prices" label
 * sitting above sample numbers.
 */
export interface DataStatus {
  source: "sample" | "live";
  providerId: string;
  label: string;
  note: string;
  /** True when a live API is configured, regardless of whether it answered. */
  configured: boolean;
  cacheTtlSecs: number;
}

export async function getDataStatus(): Promise<DataStatus> {
  const config = apiConfig();
  const provider = resolveProvider(config);
  return {
    source: provider.source,
    providerId: provider.id,
    label: provider.label,
    note: provider.note,
    configured: liveConfigured(config),
    cacheTtlSecs: config.cacheTtlSecs,
  };
}
