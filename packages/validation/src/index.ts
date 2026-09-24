export {
  PERMISSIONS,
  PERMISSION_SCOPES,
  SYSTEM_ROLES,
  isPermission,
  type Permission,
  type PermissionScope,
  type SystemRole,
} from "./permissions";

export {
  paginationQuerySchema,
  paginationMetaSchema,
  idParamSchema,
  errorResponseSchema,
  type PaginationQuery,
  type PaginationMeta,
  type ErrorResponse,
} from "./common";

export {
  passwordSchema,
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  revokeSessionParamsSchema,
  type RegisterInput,
  type VerifyOtpInput,
  type ResendOtpInput,
  type LoginInput,
  type RefreshInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "./auth";

export {
  createHospitalSchema,
  updateHospitalSchema,
  listHospitalsQuerySchema,
  type CreateHospitalInput,
  type UpdateHospitalInput,
  type ListHospitalsQuery,
} from "./hospitals";

export {
  operatingHoursSchema,
  createBranchSchema,
  updateBranchSchema,
  listBranchesQuerySchema,
  type OperatingHours,
  type CreateBranchInput,
  type UpdateBranchInput,
  type ListBranchesQuery,
} from "./branches";

export {
  createDepartmentSchema,
  updateDepartmentSchema,
  listDepartmentsQuerySchema,
  type CreateDepartmentInput,
  type UpdateDepartmentInput,
  type ListDepartmentsQuery,
} from "./departments";

export {
  inviteUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
  requestActivationOtpSchema,
  activateUserSchema,
  type InvitableRoleKey,
  type InviteUserInput,
  type UpdateUserInput,
  type ListUsersQuery,
  type RequestActivationOtpInput,
  type ActivateUserInput,
} from "./users";

export {
  createDoctorSchema,
  updateDoctorSchema,
  listDoctorsQuerySchema,
  assignDoctorDepartmentSchema,
  type CreateDoctorInput,
  type UpdateDoctorInput,
  type ListDoctorsQuery,
  type AssignDoctorDepartmentInput,
} from "./doctors";

export {
  registerPatientSchema,
  updatePatientSchema,
  listPatientsQuerySchema,
  type RegisterPatientInput,
  type UpdatePatientInput,
  type ListPatientsQuery,
} from "./patients";

export {
  updateStaffSchema,
  listStaffQuerySchema,
  type UpdateStaffInput,
  type ListStaffQuery,
} from "./staff";

export {
  dayScheduleBlockSchema,
  replaceDoctorScheduleSchema,
  createScheduleExceptionSchema,
  listScheduleExceptionsQuerySchema,
  availabilityQuerySchema,
  type DayScheduleBlock,
  type ReplaceDoctorScheduleInput,
  type CreateScheduleExceptionInput,
  type ListScheduleExceptionsQuery,
  type AvailabilityQuery,
} from "./schedules";

export {
  appointmentStatusSchema,
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema,
  markNoShowSchema,
  listAppointmentsQuerySchema,
  type CreateAppointmentInput,
  type RescheduleAppointmentInput,
  type CancelAppointmentInput,
  type MarkNoShowInput,
  type ListAppointmentsQuery,
} from "./appointments";

export {
  startConsultationSchema,
  vitalsInputSchema,
  clinicalNoteInputSchema,
  diagnosisInputSchema,
  updateConsultationSchema,
  listMedicalRecordsQuerySchema,
  medicalRecordsSubjectQuerySchema,
  createConditionSchema,
  createAllergySchema,
  type StartConsultationInput,
  type VitalsInput,
  type UpdateConsultationInput,
  type ListMedicalRecordsQuery,
  type MedicalRecordsSubjectQuery,
  type CreateConditionInput,
  type CreateAllergyInput,
} from "./consultations";
