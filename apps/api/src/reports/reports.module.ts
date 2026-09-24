import { Module } from "@nestjs/common";
import { AppConfigService } from "../config/config.service";
import { AI_REPORT_ASSIST_PROVIDER } from "../storage/storage.tokens";
import { GroqReportAssistProvider } from "./groq-report-assist.provider";
import { LabOrdersController } from "./lab-orders.controller";
import { LabOrdersService } from "./lab-orders.service";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

/** Lab orders + the lab/imaging report pipeline (docs/41-TASKS.md Phase 9, docs/21, docs/27). */
@Module({
  controllers: [ReportsController, LabOrdersController],
  providers: [
    ReportsService,
    LabOrdersService,
    {
      provide: AI_REPORT_ASSIST_PROVIDER,
      useFactory: (config: AppConfigService) => new GroqReportAssistProvider(config.env.GROQ_API_KEY, config.env.GROQ_MODEL),
      inject: [AppConfigService],
    },
  ],
})
export class ReportsModule {}
