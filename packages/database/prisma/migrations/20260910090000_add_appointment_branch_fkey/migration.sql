-- Appointment.branch relation (schema.prisma) had no corresponding foreign
-- key constraint in the init migration — appointments.branch_id was a plain
-- column with no FK to branches. Adding it now so a booking can never
-- reference a branch that doesn't exist or belongs to a different hospital's
-- subgraph (see docs/18-MULTI-TENANCY.md's constraint-backstop layer).
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
