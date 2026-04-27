const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function parseEnvBoolean(raw: string | undefined): boolean {
  if (raw === undefined || raw === null) return false;
  return ENABLED_VALUES.has(String(raw).trim().toLowerCase());
}

export function isCommissionRequiredMode(): boolean {
  return parseEnvBoolean(import.meta.env.VITE_COMMISSION_REQUIRED);
}

