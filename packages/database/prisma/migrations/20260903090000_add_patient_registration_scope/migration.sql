-- Additive, nullable columns (docs/38-DATABASE-MIGRATIONS.md "Additive-first")
-- — records which hospital/branch's front desk registered a patient,
-- distinct from clinical hospitalId scoping (a Patient's own identity is
-- never hospital-scoped, docs/18-MULTI-TENANCY.md). Needed for staff
-- `GET /patients` list scoping and the "Registered Branch" field on the
-- admin Patient Details screen (docs/09-ADMIN-DESIGN-MOCKUPS.md).
ALTER TABLE "patients" ADD COLUMN "registered_hospital_id" UUID;
ALTER TABLE "patients" ADD COLUMN "registered_branch_id" UUID;

ALTER TABLE "patients" ADD CONSTRAINT "patients_registered_hospital_id_fkey"
  FOREIGN KEY ("registered_hospital_id") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patients" ADD CONSTRAINT "patients_registered_branch_id_fkey"
  FOREIGN KEY ("registered_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "patients_registered_hospital_id_idx" ON "patients"("registered_hospital_id");
CREATE INDEX "patients_registered_branch_id_idx" ON "patients"("registered_branch_id");
