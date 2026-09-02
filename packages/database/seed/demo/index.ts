import type { PrismaClient, Doctor, Patient, Department, Branch, Hospital } from "@prisma/client";
import { hashPassword } from "@hospital/shared";
import type { SystemRole } from "@hospital/validation";
import {
  FIRST_NAMES,
  LAST_NAMES,
  SPECIALTIES,
  QUALIFICATIONS_BY_SPECIALTY,
  fullName,
} from "./names";
import { randomItem, addDays, atTime, timeOfDay } from "./helpers";
import {
  HOSPITAL_A,
  HOSPITAL_A_MAIN_BRANCH,
  HOSPITAL_A_RIVERSIDE_BRANCH,
  HOSPITAL_B,
  HOSPITAL_B_NORTH_BRANCH,
  HOSPITAL_B_SOUTH_BRANCH,
  FIXED_DOCTORS,
  FIXED_STAFF,
  FIXED_PATIENTS,
  DEMO_PASSWORD,
} from "./fixtures";

/**
 * Demo seed: realistic fixture data for local/staging/dev only — never run
 * against production (see the guard in seed/index.ts). Builds 2 hospitals,
 * 4 branches, 16 departments, ~16 doctors, ~10 staff, ~40 patients, a spread
 * of appointments across every status, a handful of full clinical journeys
 * exercising the report pipeline's every stage, sample audit logs, and sample
 * notifications. See docs/36-SEED-DATA.md "Demo seed".
 */
export async function seedDemo(prisma: PrismaClient): Promise<void> {
  const existingHospital = await prisma.hospital.findFirst();
  if (existingHospital) {
    console.log("[seed:demo] A hospital already exists — assuming demo data is already seeded, skipping.");
    return;
  }

  const roles = await prisma.role.findMany({ where: { hospitalId: null, isSystem: true } });
  const roleIdByKey = new Map<SystemRole, string>(roles.map((r) => [r.key as SystemRole, r.id]));
  for (const key of ["PATIENT", "DOCTOR", "NURSE", "RECEPTIONIST", "ADMIN"] as const) {
    if (!roleIdByKey.has(key)) {
      throw new Error(`[seed:demo] Role ${key} not found — run the catalog seed first: pnpm db:seed`);
    }
  }

  const demoPasswordHash = await hashPassword(DEMO_PASSWORD);
  const today = new Date();

  console.log("[seed:demo] Creating hospitals, branches, departments...");
  const hospitalA = await prisma.hospital.create({ data: HOSPITAL_A });
  const hospitalAMain = await prisma.branch.create({
    data: { ...HOSPITAL_A_MAIN_BRANCH, hospitalId: hospitalA.id, operatingHours: defaultOperatingHours() },
  });
  const hospitalARiverside = await prisma.branch.create({
    data: { ...HOSPITAL_A_RIVERSIDE_BRANCH, hospitalId: hospitalA.id, operatingHours: defaultOperatingHours() },
  });
  const hospitalADepartments = await createDepartments(prisma, hospitalA, [hospitalAMain, hospitalARiverside]);

  const hospitalB = await prisma.hospital.create({ data: HOSPITAL_B });
  const hospitalBNorth = await prisma.branch.create({
    data: { ...HOSPITAL_B_NORTH_BRANCH, hospitalId: hospitalB.id, operatingHours: defaultOperatingHours() },
  });
  const hospitalBSouth = await prisma.branch.create({
    data: { ...HOSPITAL_B_SOUTH_BRANCH, hospitalId: hospitalB.id, operatingHours: defaultOperatingHours() },
  });
  const hospitalBDepartments = await createDepartments(prisma, hospitalB, [hospitalBNorth, hospitalBSouth]);

  console.log("[seed:demo] Creating hospital admins + settings...");
  const adminA = await createUser(prisma, {
    name: "Priya Desai",
    email: "admin@citygeneral.example",
    hospitalId: hospitalA.id,
    passwordHash: demoPasswordHash,
    roleId: roleIdByKey.get("ADMIN")!,
  });
  await prisma.hospitalSettings.create({
    data: { hospitalId: hospitalA.id, updatedBy: adminA.id },
  });
  const adminB = await createUser(prisma, {
    name: "Marcus Bianchi",
    email: "admin@lakesidemedical.example",
    hospitalId: hospitalB.id,
    passwordHash: demoPasswordHash,
    roleId: roleIdByKey.get("ADMIN")!,
  });
  await prisma.hospitalSettings.create({
    data: { hospitalId: hospitalB.id, updatedBy: adminB.id },
  });

  console.log("[seed:demo] Creating staff...");
  const staffByBranch = new Map<string, string[]>(); // branchId -> userIds (for notifications later)
  for (const fixed of FIXED_STAFF) {
    const branch = [hospitalAMain, hospitalARiverside].find((b) => b.name === fixed.branch)!;
    const user = await createUser(prisma, {
      name: fullName(fixed.firstName, fixed.lastName),
      email: fixed.email,
      hospitalId: hospitalA.id,
      passwordHash: demoPasswordHash,
      roleId: roleIdByKey.get(fixed.roleKey)!,
      branchId: branch.id,
    });
    await prisma.staff.create({
      data: { userId: user.id, hospitalId: hospitalA.id, branchId: branch.id, jobTitle: fixed.jobTitle },
    });
    pushTo(staffByBranch, branch.id, user.id);
  }
  for (const [hospital, branches] of [
    [hospitalA, [hospitalAMain, hospitalARiverside]],
    [hospitalB, [hospitalBNorth, hospitalBSouth]],
  ] as const) {
    for (const branch of branches) {
      for (const roleKey of ["NURSE", "RECEPTIONIST"] as const) {
        if (hospital === hospitalA && branch === hospitalAMain && roleKey === "RECEPTIONIST") continue;
        if (hospital === hospitalA && branch === hospitalARiverside && roleKey === "NURSE") continue;
        const first = randomItem(FIRST_NAMES);
        const last = randomItem(LAST_NAMES);
        const user = await createUser(prisma, {
          name: fullName(first, last),
          email: emailFor(first, last, hospital.slug),
          hospitalId: hospital.id,
          passwordHash: demoPasswordHash,
          roleId: roleIdByKey.get(roleKey)!,
          branchId: branch.id,
        });
        await prisma.staff.create({
          data: {
            userId: user.id,
            hospitalId: hospital.id,
            branchId: branch.id,
            jobTitle: roleKey === "NURSE" ? "Staff Nurse" : "Receptionist",
          },
        });
        pushTo(staffByBranch, branch.id, user.id);
      }
    }
  }

  console.log("[seed:demo] Creating doctors, schedules, and exceptions...");
  const allDoctors: Doctor[] = [];
  for (const fixed of FIXED_DOCTORS) {
    const branch = [hospitalAMain, hospitalARiverside].find((b) => b.name === fixed.branch)!;
    const department = hospitalADepartments.find(
      (d) => d.branchId === branch.id && d.name === fixed.specialty,
    )!;
    const doctor = await createDoctor(prisma, {
      firstName: fixed.firstName,
      lastName: fixed.lastName,
      email: fixed.email,
      hospitalId: hospitalA.id,
      department,
      passwordHash: demoPasswordHash,
      roleId: roleIdByKey.get("DOCTOR")!,
      qualifications: QUALIFICATIONS_BY_SPECIALTY[fixed.specialty],
      yearsOfExperience: fixed.yearsOfExperience,
      consultationFee: fixed.consultationFee,
    });
    allDoctors.push(doctor);
  }

  for (const [hospital, departments] of [
    [hospitalA, hospitalADepartments],
    [hospitalB, hospitalBDepartments],
  ] as const) {
    for (const department of departments) {
      // Skip the two department/branch slots that already got their doctor(s)
      // from FIXED_DOCTORS above (Cardiology@Main has both Dr. Patel and
      // Dr. Shah; Pediatrics@Riverside has Dr. Mehta) — every other slot gets
      // exactly one generated doctor.
      const isCardiologyMain = department.name === "Cardiology" && department.branchId === hospitalAMain.id;
      const isPediatricsRiverside = department.name === "Pediatrics" && department.branchId === hospitalARiverside.id;
      if (hospital.id === hospitalA.id && (isCardiologyMain || isPediatricsRiverside)) continue;

      const first = randomItem(FIRST_NAMES);
      const last = randomItem(LAST_NAMES);
      const doctor = await createDoctor(prisma, {
        firstName: first,
        lastName: last,
        email: emailFor(first, last, hospital.slug),
        hospitalId: hospital.id,
        department,
        passwordHash: demoPasswordHash,
        roleId: roleIdByKey.get("DOCTOR")!,
        qualifications: QUALIFICATIONS_BY_SPECIALTY[department.name as (typeof SPECIALTIES)[number]],
        yearsOfExperience: 3 + Math.floor(Math.random() * 20),
        consultationFee: (30 + Math.floor(Math.random() * 40)).toFixed(2),
      });
      allDoctors.push(doctor);
    }
  }
  console.log(`[seed:demo] ${allDoctors.length} doctors created.`);

  console.log("[seed:demo] Creating patients...");
  const allPatients: Patient[] = [];
  for (const fixed of FIXED_PATIENTS) {
    allPatients.push(await createPatient(prisma, { ...fixed, passwordHash: demoPasswordHash, roleId: roleIdByKey.get("PATIENT")! }));
  }
  for (let i = 0; i < 37; i++) {
    const first = randomItem(FIRST_NAMES);
    const last = randomItem(LAST_NAMES);
    allPatients.push(
      await createPatient(prisma, {
        firstName: first,
        lastName: last,
        email: `${emailFor(first, last, "patient")}${i}`,
        phone: `+1555${String(2000 + i).padStart(4, "0")}`,
        passwordHash: demoPasswordHash,
        roleId: roleIdByKey.get("PATIENT")!,
      }),
    );
  }
  console.log(`[seed:demo] ${allPatients.length} patients created.`);

  console.log("[seed:demo] Creating appointments and clinical journeys...");
  const drPatel = allDoctors[0]!; // fixture order guarantees Dr. Sarah Patel is first
  const drMehta = allDoctors[2]!; // Dr. Raj Mehta is third fixture
  const alicePatient = await prisma.patient.findFirstOrThrow({
    where: { user: { email: FIXED_PATIENTS[0]!.email } },
  });
  const benPatient = await prisma.patient.findFirstOrThrow({
    where: { user: { email: FIXED_PATIENTS[1]!.email } },
  });

  let auditCount = 0;
  let notificationCount = 0;

  // A rotating cursor through all doctor/patient pairs, generating one
  // appointment per iteration at a distinct time to respect the doctor/startTime
  // conflict constraint without any collision bookkeeping.
  let doctorCursor = 0;
  let slotCursor = 0;
  const nextSlot = (dayOffset: number): { doctor: Doctor; start: Date } => {
    const doctor = allDoctors[doctorCursor % allDoctors.length]!;
    doctorCursor++;
    const hour = 9 + (slotCursor % 6);
    const minute = (slotCursor % 3) * 20;
    slotCursor++;
    return { doctor, start: atTime(addDays(today, dayOffset), hour, minute) };
  };

  // --- Past, completed appointments (some with full clinical journeys) ---
  // JOURNEY_PLAN.length full journeys are created, one per report-pipeline
  // stage plus all three AI verify-decision variants on the RELEASED ones
  // (docs/36-SEED-DATA.md "Demo seed" / docs/27-MEDICAL-AI-SAFETY.md) — every
  // state is guaranteed present exactly once, not left to chance cycling.
  for (let i = 0; i < 12; i++) {
    const patient = allPatients[i % allPatients.length]!;
    const { doctor, start } = nextSlot(-3 - i);
    const appointment = await createAppointment(prisma, {
      doctor,
      patient,
      startTime: start,
      status: "COMPLETED",
      createdBy: patient.userId,
    });
    auditCount += await recordAuditLog(prisma, appointment.hospitalId, patient.userId, "PATIENT", "APPOINTMENT_CREATE", "Appointment", appointment.id);

    if (i < JOURNEY_PLAN.length) {
      await createClinicalJourney(prisma, {
        appointment,
        doctorUserId: doctor.userId,
        journeyIndex: i,
        plan: JOURNEY_PLAN[i]!,
      });
      auditCount += await recordAuditLog(prisma, appointment.hospitalId, doctor.userId, "DOCTOR", "CONSULTATION_COMPLETE", "Appointment", appointment.id);
    }
  }

  // --- Past cancelled / no-show ---
  for (let i = 0; i < 4; i++) {
    const patient = allPatients[(i + 10) % allPatients.length]!;
    const { doctor, start } = nextSlot(-2 - i);
    await createAppointment(prisma, {
      doctor,
      patient,
      startTime: start,
      status: i % 2 === 0 ? "CANCELLED" : "NO_SHOW",
      createdBy: patient.userId,
      cancelReason: i % 2 === 0 ? "Patient requested cancellation" : undefined,
    });
  }

  // --- Future scheduled/confirmed ---
  for (let i = 0; i < 8; i++) {
    const patient = allPatients[(i + 14) % allPatients.length]!;
    const { doctor, start } = nextSlot(1 + i);
    await createAppointment(prisma, {
      doctor,
      patient,
      startTime: start,
      status: i % 3 === 0 ? "SCHEDULED" : "CONFIRMED",
      createdBy: patient.userId,
    });
  }

  // --- The documented "today, checked-in, queue #12" scenario (docs/37-API-EXAMPLES.md) ---
  const todayAppointment = await createAppointment(prisma, {
    doctor: drPatel,
    patient: alicePatient,
    startTime: atTime(today, 9, 0),
    status: "CHECKED_IN",
    createdBy: alicePatient.userId,
    queueNumber: 12,
    checkedInAt: atTime(today, 8, 45),
  });
  auditCount += await recordAuditLog(prisma, todayAppointment.hospitalId, alicePatient.userId, "PATIENT", "APPOINTMENT_CREATE", "Appointment", todayAppointment.id);
  const meera = await prisma.user.findFirstOrThrow({ where: { email: "m.nair@citygeneral.example" } });
  auditCount += await recordAuditLog(prisma, todayAppointment.hospitalId, meera.id, "RECEPTIONIST", "APPOINTMENT_CHECKIN", "Appointment", todayAppointment.id);

  // --- Ben Ortiz checked-in with Dr. Mehta (docs/09-ADMIN-DESIGN-MOCKUPS.md Calendar mockup) ---
  await createAppointment(prisma, {
    doctor: drMehta,
    patient: benPatient,
    startTime: atTime(today, 9, 30),
    status: "CHECKED_IN",
    createdBy: benPatient.userId,
    queueNumber: 1,
    checkedInAt: atTime(today, 9, 10),
  });

  // --- Cross-hospital patient: Alice also has a relationship at Hospital B ---
  const hospitalBDoctor = allDoctors.find((d) => d.hospitalId === hospitalB.id)!;
  await createAppointment(prisma, {
    doctor: hospitalBDoctor,
    patient: alicePatient,
    startTime: atTime(addDays(today, -20), 11, 0),
    status: "COMPLETED",
    createdBy: alicePatient.userId,
  });

  console.log(`[seed:demo] ${auditCount} routine audit log entries recorded so far.`);

  console.log("[seed:demo] Creating security-relevant audit log samples...");
  for (const doctor of allDoctors.slice(0, 3)) {
    auditCount += await recordAuditLog(prisma, doctor.hospitalId, doctor.userId, "DOCTOR", "AUTH_LOGIN", "User", doctor.userId);
  }
  auditCount += await recordAuditLog(prisma, null, null, "SYSTEM", "AUTH_LOGIN", "User", adminA.id);

  console.log("[seed:demo] Creating sample notifications...");
  notificationCount += await createNotification(prisma, alicePatient.userId, "APPOINTMENT_BOOKED", "Appointment confirmed", "Your appointment with Dr. Sarah Patel is confirmed for today at 9:00 AM.", true);
  notificationCount += await createNotification(prisma, alicePatient.userId, "REPORT_READY", "Report ready", "Your Complete Blood Count report is now available.", false);
  notificationCount += await createNotification(prisma, benPatient.userId, "APPOINTMENT_REMINDER", "Appointment reminder", "Your appointment with Dr. Raj Mehta is tomorrow.", false);
  notificationCount += await createNotification(prisma, drPatel.userId, "APPOINTMENT_BOOKED", "New appointment", "Alice Kumar booked an appointment with you.", true);

  console.log(
    `[seed:demo] Done. ${allDoctors.length} doctors, ${allPatients.length} patients, ${auditCount} audit log entries, ${notificationCount} notifications.`,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultOperatingHours(): Record<string, { open: string; close: string }> {
  const weekday = { open: "08:00", close: "20:00" };
  const saturday = { open: "09:00", close: "14:00" };
  return {
    monday: weekday,
    tuesday: weekday,
    wednesday: weekday,
    thursday: weekday,
    friday: weekday,
    saturday,
  };
}

function emailFor(first: string, last: string, domainSlug: string): string {
  return `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, "")}@${domainSlug}.example`;
}

function pushTo(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
  } else {
    map.set(key, [value]);
  }
}

async function createDepartments(
  prisma: PrismaClient,
  hospital: Hospital,
  branches: Branch[],
): Promise<Department[]> {
  const departments: Department[] = [];
  for (const branch of branches) {
    for (const specialty of SPECIALTIES) {
      departments.push(
        await prisma.department.create({
          data: { hospitalId: hospital.id, branchId: branch.id, name: specialty },
        }),
      );
    }
  }
  return departments;
}

async function createUser(
  prisma: PrismaClient,
  opts: {
    name: string;
    email: string;
    hospitalId: string | null;
    passwordHash: string;
    roleId: string;
    branchId?: string;
  },
) {
  const user = await prisma.user.create({
    data: {
      name: opts.name,
      email: opts.email,
      hospitalId: opts.hospitalId,
      passwordHash: opts.passwordHash,
      status: "ACTIVE",
      userRoles: { create: { roleId: opts.roleId, branchId: opts.branchId } },
    },
  });
  return user;
}

async function createDoctor(
  prisma: PrismaClient,
  opts: {
    firstName: string;
    lastName: string;
    email: string;
    hospitalId: string;
    department: Department;
    passwordHash: string;
    roleId: string;
    qualifications: string;
    yearsOfExperience: number;
    consultationFee: string;
  },
): Promise<Doctor> {
  const user = await createUser(prisma, {
    // "Dr." is stored as part of the display name itself (matches every
    // mockup's "Dr. Sarah Patel" literally) rather than a role-based UI prefix.
    name: `Dr. ${fullName(opts.firstName, opts.lastName)}`,
    email: opts.email,
    hospitalId: opts.hospitalId,
    passwordHash: opts.passwordHash,
    roleId: opts.roleId,
  });
  const doctor = await prisma.doctor.create({
    data: {
      userId: user.id,
      hospitalId: opts.hospitalId,
      qualifications: opts.qualifications,
      yearsOfExperience: opts.yearsOfExperience,
      consultationFee: opts.consultationFee,
      doctorDepartments: { create: { departmentId: opts.department.id, isPrimary: true } },
    },
  });

  // Mon(1)-Sat(6): 9:00-13:00 and 14:00-18:00, 20-minute slots, 5-minute buffer.
  for (const dayOfWeek of [1, 2, 3, 4, 5, 6]) {
    for (const [start, end] of [
      [timeOfDay(9, 0), timeOfDay(13, 0)],
      [timeOfDay(14, 0), timeOfDay(18, 0)],
    ] as const) {
      await prisma.doctorSchedule.create({
        data: {
          hospitalId: opts.hospitalId,
          doctorId: doctor.id,
          departmentId: opts.department.id,
          dayOfWeek,
          startTime: start,
          endTime: end,
          slotDurationMinutes: 20,
          bufferMinutes: 5,
          effectiveFrom: addDays(new Date(), -30),
        },
      });
    }
  }

  // One documented holiday exception per doctor, per docs/36-SEED-DATA.md.
  await prisma.scheduleException.create({
    data: {
      hospitalId: opts.hospitalId,
      doctorId: doctor.id,
      type: "LEAVE",
      startDate: addDays(new Date(), 15),
      endDate: addDays(new Date(), 15),
      reason: "Personal leave",
      createdBy: user.id,
    },
  });

  return doctor;
}

async function createPatient(
  prisma: PrismaClient,
  opts: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    passwordHash: string;
    roleId: string;
  },
): Promise<Patient> {
  const user = await createUser(prisma, {
    name: fullName(opts.firstName, opts.lastName),
    email: opts.email,
    hospitalId: null,
    passwordHash: opts.passwordHash,
    roleId: opts.roleId,
  });
  const birthYear = 1950 + Math.floor(Math.random() * 65);
  return prisma.patient.create({
    data: {
      userId: user.id,
      dateOfBirth: new Date(Date.UTC(birthYear, Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 27))),
      gender: randomItem(["MALE", "FEMALE", "OTHER", "UNSPECIFIED"] as const),
      bloodGroup: randomItem(["O+", "A+", "B+", "AB+", "O-", "A-"] as const),
      city: "Springfield",
      country: "USA",
      emergencyContactName: fullName(randomItem(FIRST_NAMES), randomItem(LAST_NAMES)),
      emergencyContactPhone: opts.phone,
    },
  });
}

async function createAppointment(
  prisma: PrismaClient,
  opts: {
    doctor: Doctor;
    patient: Patient;
    startTime: Date;
    status: "SCHEDULED" | "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
    createdBy: string;
    queueNumber?: number;
    checkedInAt?: Date;
    cancelReason?: string;
  },
) {
  const department = await prisma.doctorDepartment.findFirstOrThrow({ where: { doctorId: opts.doctor.id } });
  const dept = await prisma.department.findUniqueOrThrow({ where: { id: department.departmentId } });
  const endTime = new Date(opts.startTime.getTime() + 20 * 60_000);

  return prisma.appointment.create({
    data: {
      hospitalId: opts.doctor.hospitalId,
      branchId: dept.branchId,
      departmentId: dept.id,
      doctorId: opts.doctor.id,
      patientId: opts.patient.id,
      startTime: opts.startTime,
      endTime,
      status: opts.status,
      reason: "Routine visit",
      createdBy: opts.createdBy,
      queueNumber: opts.queueNumber,
      checkedInAt: opts.checkedInAt,
      completedAt: opts.status === "COMPLETED" ? endTime : undefined,
      cancelledAt: opts.status === "CANCELLED" ? opts.startTime : undefined,
      cancelReason: opts.cancelReason,
    },
  });
}

type ReportPipelineStage = "RAW" | "EXTRACTED" | "AI_ANALYZED" | "HUMAN_REVIEWED" | "RELEASED";
type AiDecision = "accept" | "edit" | "discard";

interface JourneyPlanEntry {
  stage: ReportPipelineStage;
  /** Only meaningful once `stage` is RELEASED — see the note in createClinicalJourney. */
  aiDecision: AiDecision;
}

/**
 * Explicit, deterministic plan guaranteeing every report-pipeline stage
 * (docs/27-MEDICAL-AI-SAFETY.md) and all three AI verify-decision variants
 * (accept/edit/discard) are each represented at least once in the seeded
 * data (docs/36-SEED-DATA.md "Demo seed") — not left to a modulo cycle that
 * might not actually hit every combination.
 */
const JOURNEY_PLAN: JourneyPlanEntry[] = [
  { stage: "RAW", aiDecision: "accept" },
  { stage: "EXTRACTED", aiDecision: "accept" },
  { stage: "AI_ANALYZED", aiDecision: "accept" },
  { stage: "HUMAN_REVIEWED", aiDecision: "accept" },
  { stage: "RELEASED", aiDecision: "accept" },
  { stage: "RELEASED", aiDecision: "edit" },
  { stage: "RELEASED", aiDecision: "discard" },
];

async function createClinicalJourney(
  prisma: PrismaClient,
  opts: {
    appointment: { id: string; hospitalId: string; doctorId: string; patientId: string };
    doctorUserId: string;
    journeyIndex: number;
    plan: JourneyPlanEntry;
  },
): Promise<void> {
  const consultation = await prisma.consultation.create({
    data: {
      appointmentId: opts.appointment.id,
      hospitalId: opts.appointment.hospitalId,
      doctorId: opts.appointment.doctorId,
      patientId: opts.appointment.patientId,
      status: "COMPLETED",
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  await prisma.clinicalNote.create({
    data: {
      consultationId: consultation.id,
      authorId: opts.doctorUserId,
      content: "Patient reports mild symptoms, advised lifestyle modification and follow-up in 2 weeks.",
      isInternal: false,
    },
  });
  await prisma.clinicalNote.create({
    data: {
      consultationId: consultation.id,
      authorId: opts.doctorUserId,
      content: "Internal: keep an eye on blood pressure trend at next visit.",
      isInternal: true,
    },
  });
  await prisma.diagnosis.create({
    data: { consultationId: consultation.id, icd10Code: "I10", description: "Essential hypertension" },
  });
  await prisma.vital.create({
    data: {
      consultationId: consultation.id,
      patientId: opts.appointment.patientId,
      bloodPressureSystolic: 118 + opts.journeyIndex,
      bloodPressureDiastolic: 76 + opts.journeyIndex,
      heartRate: 70 + opts.journeyIndex,
      temperatureCelsius: "36.8",
      weightKg: "70.5",
      heightCm: "170.0",
      spo2: 98,
      recordedBy: opts.doctorUserId,
    },
  });

  const prescription = await prisma.prescription.create({
    data: {
      consultationId: consultation.id,
      hospitalId: opts.appointment.hospitalId,
      doctorId: opts.appointment.doctorId,
      patientId: opts.appointment.patientId,
      status: "ACTIVE",
      issuedAt: new Date(),
      items: {
        create: {
          freeTextName: "Amlodipine",
          dosage: "5mg",
          frequency: "Once daily",
          durationDays: 30,
          instructions: "In the morning",
        },
      },
    },
  });

  // Demonstrate the correction/supersession chain for exactly one journey.
  if (opts.journeyIndex === 0) {
    const corrected = await prisma.prescription.create({
      data: {
        consultationId: consultation.id,
        hospitalId: opts.appointment.hospitalId,
        doctorId: opts.appointment.doctorId,
        patientId: opts.appointment.patientId,
        status: "ACTIVE",
        supersedesId: prescription.id,
        issuedAt: new Date(),
        items: {
          create: {
            freeTextName: "Amlodipine",
            dosage: "10mg",
            frequency: "Once daily",
            durationDays: 30,
            instructions: "Dosage corrected from 5mg after review",
          },
        },
      },
    });
    await prisma.prescription.update({ where: { id: prescription.id }, data: { status: "SUPERSEDED" } });
    void corrected;
  }

  const labOrder = await prisma.labOrder.create({
    data: {
      consultationId: consultation.id,
      hospitalId: opts.appointment.hospitalId,
      doctorId: opts.appointment.doctorId,
      patientId: opts.appointment.patientId,
      testType: "Complete Blood Count",
      priority: "ROUTINE",
      status: "COMPLETED",
    },
  });

  const { stage } = opts.plan;
  const structuredValues = [
    { name: "Hemoglobin", value: 14.2, unit: "g/dL", referenceRange: "13.5-17.5", flag: "NORMAL" },
    { name: "WBC Count", value: 11.8, unit: "x10^9/L", referenceRange: "4.0-11.0", flag: "HIGH" },
  ];

  const isReleased = stage === "RELEASED";
  const aiGenerated = stage === "AI_ANALYZED" || isReleased;
  // The three verify-decision variants (accept/edit/discard, docs/27-MEDICAL-AI-SAFETY.md)
  // only make sense once a report has actually been through verify — i.e. once
  // RELEASED. Before that, AI_ANALYZED always carries the AI's own unedited
  // summary, since no human has decided anything about it yet.
  const aiDecision = isReleased ? opts.plan.aiDecision : "accept";
  const aiSummary =
    aiGenerated && aiDecision !== "discard"
      ? aiDecision === "edit"
        ? "Edited by reviewing doctor: mildly elevated WBC, monitor at next visit."
        : "Mildly elevated WBC, consistent with a recent minor infection. Recommend routine follow-up if symptoms persist."
      : undefined;

  await prisma.labReport.create({
    data: {
      labOrderId: labOrder.id,
      hospitalId: opts.appointment.hospitalId,
      patientId: opts.appointment.patientId,
      reportType: "Complete Blood Count",
      structuredValues,
      pipelineStatus: stage,
      aiGenerated,
      aiSummary,
      verifiedBy: stage === "HUMAN_REVIEWED" || isReleased ? opts.doctorUserId : undefined,
      verifiedAt: stage === "HUMAN_REVIEWED" || isReleased ? new Date() : undefined,
      releasedAt: isReleased ? new Date() : undefined,
    },
  });
}

async function recordAuditLog(
  prisma: PrismaClient,
  hospitalId: string | null,
  actorUserId: string | null,
  actorRole: string,
  action: string,
  resourceType: string,
  resourceId: string,
): Promise<number> {
  await prisma.auditLog.create({
    data: { hospitalId, actorUserId, actorRole, action, resourceType, resourceId },
  });
  return 1;
}

async function createNotification(
  prisma: PrismaClient,
  userId: string,
  type: string,
  title: string,
  body: string,
  read: boolean,
): Promise<number> {
  await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      channel: "IN_APP",
      deliveryStatus: "DELIVERED",
      readAt: read ? new Date() : undefined,
    },
  });
  return 1;
}
