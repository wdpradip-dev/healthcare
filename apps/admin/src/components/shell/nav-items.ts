export interface NavItem {
  label: string;
  href: string;
  permission: string;
}

/** Only modules that actually exist get a nav entry — docs/09-ADMIN-DESIGN-MOCKUPS.md's
 * full sidebar (Patients, Doctors, Appointments, ...) fills in as later phases ship. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Branches", href: "/branches", permission: "branches.read" },
  { label: "Departments", href: "/departments", permission: "departments.read" },
  { label: "Doctors", href: "/doctors", permission: "doctors.read" },
  { label: "Doctor Schedules", href: "/doctor-schedules", permission: "schedules.read" },
  { label: "Patients", href: "/patients", permission: "patients.read" },
  { label: "Staff", href: "/staff", permission: "staff.read" },
  { label: "Users", href: "/users", permission: "users.read" },
];
