import { validateUserNeed, type UserNeed } from "../shared/userNeed.js";

export {
  USER_NEED_STORAGE_KEY,
  emptyUserNeed,
  loadUserNeed,
  resetUserNeed,
  saveUserNeed,
  validateUserNeed,
} from "../shared/userNeed.js";
export type { UserNeed, UserNeedStorage } from "../shared/userNeed.js";

export interface UserNeedFormValues {
  minBudget: string;
  maxBudget: string;
  mustHave: string;
  niceToHave: string;
  exclude: string;
}

export function parseUserNeedForm(values: UserNeedFormValues): UserNeed {
  return validateUserNeed({
    minBudget: parseBudget(values.minBudget, "Minimum budget"),
    maxBudget: parseBudget(values.maxBudget, "Maximum budget"),
    mustHave: parseLines(values.mustHave),
    niceToHave: parseLines(values.niceToHave),
    exclude: parseLines(values.exclude),
  });
}

function parseBudget(value: string, label: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return validateBudget(Number(trimmed), label);
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

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}
