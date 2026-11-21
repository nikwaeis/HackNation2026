import type { AnalysisReport } from '../../api/types';
import { ReportHeader } from './ReportHeader';
import { Step1WaterAssessment } from './Step1WaterAssessment';
import { Step2CausesAndRetention } from './Step2CausesAndRetention';
import { Step3Irrigation } from './Step3Irrigation';
import { Step4SourcesAndLimitations } from './Step4SourcesAndLimitations';

/**
 * The report sections are rendered in a fixed order required by the KOWR brief:
 * assessment → causes & retention → irrigation (always last of the advice) → sources & limitations.
 * Do not reorder.
 */
export function ReportView({ report, onNewAnalysis }: { report: AnalysisReport; onNewAnalysis: () => void }) {
  return (
    <article className="flex flex-col gap-8" aria-label={`Raport wodny dla działki ${report.meta.dzialkaId}`}>
      <ReportHeader report={report} />
      <div>
        <Step1WaterAssessment
          data={report.step1_WaterAssessment}
          areaHa={report.meta.areaHa}
          satelliteStatus={report.step4_SourcesAndLimitations.satelliteStatus}
        />
        <Step2CausesAndRetention data={report.step2_CausesAndRetention} />
        <Step3Irrigation data={report.step3_Irrigation} />
        <Step4SourcesAndLimitations
          data={report.step4_SourcesAndLimitations}
          reportUuid={report.reportUuid}
          onNewAnalysis={onNewAnalysis}
        />
      </div>
    </article>
  );
}
