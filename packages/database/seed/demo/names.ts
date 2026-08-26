/**
 * Fixture name pools for generated (non-fixed) demo doctors/staff/patients.
 * The specific named fixtures referenced throughout docs/08, docs/09, and
 * docs/37-API-EXAMPLES.md (Alice Kumar, Dr. Sarah Patel, Ben Ortiz, Dr. Raj
 * Mehta, Dr. Amit Shah, Meera Nair, John Lee, Carla Diaz) are NOT generated
 * from these pools — they're created explicitly in fixtures.ts so the demo
 * seed always contains exactly the people the documentation's mockups and
 * examples describe. These pools fill out the remaining volume
 * (docs/36-SEED-DATA.md: "~20 Doctors", "~10 Staff", "~50 Patients").
 *
 * All names are deliberately fictitious, per docs/36-SEED-DATA.md "Fixture
 * naming convention" and the confirmed synthetic-data-only project scope
 * (docs/26-PRIVACY-AND-DATA-PROTECTION.md, ADR-014).
 */
export const FIRST_NAMES = [
  "James", "Maria", "Wei", "Fatima", "Liam", "Ava", "Noah", "Priya",
  "Lucas", "Sofia", "Ethan", "Zainab", "Mason", "Chloe", "Arjun", "Emily",
  "Daniel", "Grace", "Omar", "Isla", "Kevin", "Nadia", "Ryan", "Hana",
  "Marcus", "Julia", "Sam", "Leila", "Victor", "Nora", "Tariq", "Elena",
  "Derek", "Amara", "Felix", "Yuki", "Ravi", "Claire", "Bilal", "Ines",
] as const;

export const LAST_NAMES = [
  "Nguyen", "Garcia", "Chen", "Khan", "O'Brien", "Silva", "Kowalski", "Sharma",
  "Rossi", "Dubois", "Yamamoto", "Adeyemi", "Kim", "Petrov", "Haddad", "Novak",
  "Reyes", "Larsson", "Okafor", "Fischer", "Moreau", "Costa", "Ibrahim", "Park",
  "Schmidt", "Rodriguez", "Ali", "Bianchi", "Nakamura", "Singh",
] as const;

export const SPECIALTIES = [
  "Cardiology",
  "Pediatrics",
  "Orthopedics",
  "Dermatology",
] as const;

export const QUALIFICATIONS_BY_SPECIALTY: Record<(typeof SPECIALTIES)[number], string> = {
  Cardiology: "MD, DM Cardiology",
  Pediatrics: "MD, DCH Pediatrics",
  Orthopedics: "MS Orthopedics",
  Dermatology: "MD Dermatology",
};

export function fullName(first: string, last: string): string {
  return `${first} ${last}`;
}
