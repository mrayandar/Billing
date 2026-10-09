// Every permission a role can be given. The seed writes these to the database.
export const PERMISSIONS: Record<string, string> = {
  "billing.create": "Make retail and wholesale bills",
  "billing.change_price": "Change the price on a bill line",
  "billing.cancel": "Cancel a saved bill",
  "discount.override_client": "Change a wholesale discount away from the client's agreed %",
  "items.edit": "Add and edit items and base prices",
  "client_rules.edit": "Edit client company discounts and book rules",
  "clients.edit": "Add and edit clients",
  "cost.view": "See cost price and profit",
  "purchases.manage": "Enter purchases and manage suppliers",
  "stock.adjust": "Adjust stock",
  "returns.manage": "Accept returns",
  "payments.receive": "Receive payments from clients",
  "payments.make": "Make payments to suppliers",
  "ledger.view": "See ledgers and statements",
  "expenses.manage": "Record expenses",
  "reports.view": "See reports",
  "users.manage": "Manage users and roles",
  "settings.manage": "Change system settings",
  "audit.view": "See the audit log",
};

export type PermissionKey = keyof typeof PERMISSIONS;

export const OWNER_ROLE = "Owner";
export const LOGIN_LOCK_AFTER = 5; // wrong passwords in a row
export const LOGIN_LOCK_MINUTES = 5;
export const IDLE_LOGOUT_MINUTES = 30;
export const DEV_PASSWORD = "changeme123";
