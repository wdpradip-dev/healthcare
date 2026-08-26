/**
 * The specific named people/places referenced throughout docs/08-MOBILE-DESIGN-MOCKUPS.md,
 * docs/09-ADMIN-DESIGN-MOCKUPS.md, and docs/37-API-EXAMPLES.md. Seeding these exact
 * fixtures means every wireframe/example in the documentation corresponds to a real
 * row in the demo database, not just a documentation-only name.
 */
export const HOSPITAL_A = {
  name: "City General Hospital",
  slug: "city-general",
  contactEmail: "info@citygeneral.example",
  contactPhone: "+15550100",
};

export const HOSPITAL_A_MAIN_BRANCH = {
  name: "Main Branch",
  address: "12 Elm St",
  city: "Springfield",
  state: "IL",
  postalCode: "62701",
  country: "USA",
  contactPhone: "+15550101",
};

export const HOSPITAL_A_RIVERSIDE_BRANCH = {
  name: "Riverside Branch",
  address: "44 River Rd",
  city: "Springfield",
  state: "IL",
  postalCode: "62702",
  country: "USA",
  contactPhone: "+15550177",
};

export const HOSPITAL_B = {
  name: "Lakeside Medical Center",
  slug: "lakeside-medical",
  contactEmail: "info@lakesidemedical.example",
  contactPhone: "+15550200",
};

export const HOSPITAL_B_NORTH_BRANCH = {
  name: "North Branch",
  address: "8 Harbor Ave",
  city: "Lakeside",
  state: "MI",
  postalCode: "49001",
  country: "USA",
  contactPhone: "+15550201",
};

export const HOSPITAL_B_SOUTH_BRANCH = {
  name: "South Branch",
  address: "150 Shoreline Dr",
  city: "Lakeside",
  state: "MI",
  postalCode: "49002",
  country: "USA",
  contactPhone: "+15550255",
};

export const FIXED_DOCTORS = [
  {
    firstName: "Sarah",
    lastName: "Patel",
    email: "s.patel@citygeneral.example",
    specialty: "Cardiology" as const,
    branch: "Main Branch",
    yearsOfExperience: 15,
    consultationFee: "50.00",
  },
  {
    firstName: "Amit",
    lastName: "Shah",
    email: "a.shah@citygeneral.example",
    specialty: "Cardiology" as const,
    branch: "Main Branch",
    yearsOfExperience: 9,
    consultationFee: "45.00",
  },
  {
    firstName: "Raj",
    lastName: "Mehta",
    email: "r.mehta@citygeneral.example",
    specialty: "Pediatrics" as const,
    branch: "Riverside Branch",
    yearsOfExperience: 11,
    consultationFee: "40.00",
  },
];

export const FIXED_STAFF = [
  {
    firstName: "Meera",
    lastName: "Nair",
    email: "m.nair@citygeneral.example",
    roleKey: "RECEPTIONIST" as const,
    branch: "Main Branch",
    jobTitle: "Front Desk Receptionist",
  },
  {
    firstName: "John",
    lastName: "Lee",
    email: "j.lee@citygeneral.example",
    roleKey: "NURSE" as const,
    branch: "Riverside Branch",
    jobTitle: "Staff Nurse",
  },
];

export const FIXED_PATIENTS = [
  { firstName: "Alice", lastName: "Kumar", email: "alice.kumar@example.com", phone: "+15550102" },
  { firstName: "Ben", lastName: "Ortiz", email: "ben.ortiz@example.com", phone: "+15550178" },
  { firstName: "Carla", lastName: "Diaz", email: "carla.diaz@example.com", phone: "+15550190" },
];

/** Shared demo password — never a real credential, see docs/36-SEED-DATA.md and ADR-014. */
export const DEMO_PASSWORD = "DemoPass123!";
