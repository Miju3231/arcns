// Local-storage backed registration log. No server needed — this works
// out of the box on a static Vercel deployment.

const STORAGE_KEY = "arcns:registrations:v1";

export interface RegistrationRecord {
  id: number;
  domainName: string;
  walletAddress: string;
  txHash?: string | null;
  durationYears: number;
  chainId: number;
  registeredAt: string;
  notes?: string | null;
}

export interface SaveRegistrationBody {
  domainName: string;
  walletAddress: string;
  txHash?: string | null;
  durationYears?: number;
  chainId?: number;
  notes?: string | null;
}

function readAll(): RegistrationRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(records: RegistrationRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export async function saveRegistration(
  body: SaveRegistrationBody
): Promise<RegistrationRecord> {
  const all = readAll();
  // Deduplicate by (domainName, txHash)
  const existing = all.find(
    (r) =>
      r.domainName === body.domainName &&
      (r.txHash ?? null) === (body.txHash ?? null)
  );
  if (existing) return existing;

  const record: RegistrationRecord = {
    id: Date.now(),
    domainName: body.domainName,
    walletAddress: body.walletAddress.toLowerCase(),
    txHash: body.txHash ?? null,
    durationYears: body.durationYears ?? 1,
    chainId: body.chainId ?? 5042002,
    registeredAt: new Date().toISOString(),
    notes: body.notes ?? null,
  };
  writeAll([record, ...all]);
  return record;
}

export async function listRegistrations(): Promise<{
  data: RegistrationRecord[];
  total: number;
}> {
  const data = readAll();
  return { data, total: data.length };
}

export async function getRegistrationsByWallet(
  address: string
): Promise<{ data: RegistrationRecord[]; total: number }> {
  const a = address.toLowerCase();
  const data = readAll().filter((r) => r.walletAddress.toLowerCase() === a);
  return { data, total: data.length };
}
