export const USER_NEED_STORAGE_KEY = "userNeed";

export interface UserNeed {
  minBudget: number | null;
  maxBudget: number | null;
  mustHave: string[];
  niceToHave: string[];
  exclude: string[];
}

export interface UserNeedStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<unknown>;
  remove(key: string): Promise<unknown>;
}

export function emptyUserNeed(): UserNeed {
  return {
    minBudget: null,
    maxBudget: null,
    mustHave: [],
    niceToHave: [],
    exclude: [],
  };
}

export function validateUserNeed(value: unknown): UserNeed {
  if (!isRecord(value)) {
    throw new Error("Saved user needs are invalid.");
  }

  const userNeed: UserNeed = {
    minBudget: validateBudget(value.minBudget, "Minimum budget"),
    maxBudget: validateBudget(value.maxBudget, "Maximum budget"),
    mustHave: validateList(value.mustHave),
    niceToHave: validateList(value.niceToHave),
    exclude: validateList(value.exclude),
  };

  if (
    userNeed.minBudget !== null &&
    userNeed.maxBudget !== null &&
    userNeed.minBudget > userNeed.maxBudget
  ) {
    throw new Error("Minimum budget cannot exceed maximum budget.");
  }

  return userNeed;
}

export async function loadUserNeed(
  storage: Pick<UserNeedStorage, "get">,
): Promise<UserNeed | null> {
  const stored = await storage.get(USER_NEED_STORAGE_KEY);
  const value = stored[USER_NEED_STORAGE_KEY];

  return value === undefined ? null : validateUserNeed(value);
}

export async function saveUserNeed(
  storage: Pick<UserNeedStorage, "set">,
  value: unknown,
): Promise<UserNeed> {
  const userNeed = validateUserNeed(value);
  await storage.set({ [USER_NEED_STORAGE_KEY]: userNeed });
  return userNeed;
}

export async function resetUserNeed(
  storage: Pick<UserNeedStorage, "remove">,
): Promise<void> {
  await storage.remove(USER_NEED_STORAGE_KEY);
}

function validateBudget(value: unknown, label: string): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }

  return value;
}

function validateList(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("Saved user needs are invalid.");
  }

  return value.map((item) => item.trim()).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
