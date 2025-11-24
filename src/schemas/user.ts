export interface Warn {
  reason: string;
  warn_id: string; // lowercase Crockford base32 slug
  moderator: string;
  timestamp: string; // Date ISO
}

export interface User {
  id: string;
  bank: number;
  cash: number;
  rep: number;
  warns: Warn[] | null;
  openTickets: string[] | null;
}
