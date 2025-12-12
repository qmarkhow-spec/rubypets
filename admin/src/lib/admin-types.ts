export type AdminAccount = {
  id: number;
  adminId: string;
  permission: string;
  createdAt: string;
  lastAt: string | null;
  updatedAt: string;
};

export type PermissionOption = {
  value: "super" | "administrator" | "Inspector";
  label: string;
};

export const PERMISSION_OPTIONS: PermissionOption[] = [
  { value: "super", label: "全權限 (super)" },
  { value: "administrator", label: "行政主管 (administrator)" },
  { value: "Inspector", label: "審查人員 (Inspector)" }
];
