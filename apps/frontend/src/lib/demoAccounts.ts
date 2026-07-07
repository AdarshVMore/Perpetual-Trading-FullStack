export interface DemoAccount {
  username: string;
  password: string;
  displayName: string;
  role: string;
  accent: "green" | "amber";
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: "demo_alice",
    password: "demo123",
    displayName: "Alice",
    role: "Maker / opener",
    accent: "green",
  },
  {
    username: "demo_bob",
    password: "demo123",
    displayName: "Bob",
    role: "Taker / closer",
    accent: "amber",
  },
];

export function isDemoUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return DEMO_ACCOUNTS.some((account) => account.username === username);
}

export function getDemoAccount(username: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((account) => account.username === username);
}
