using System.Text.Json.Serialization;
using NetTopologySuite.Geometries;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;

namespace WodoPlon.Api.Features.Analysis.Shared;

/// <summary> Report in the mandatory KOWR order (api.md §3.2); also stored as saved_reports.report_payload </summary>
public record AnalysisResponse
(
    [property: JsonPropertyName("reportUuid")] Guid ReportUuid,
    [property: JsonPropertyName("parcelInfo")] ParcelInfoResponse ParcelInfo,
    [property: JsonPropertyName("step1_diagnosis")] DiagnosisResponse Step1Diagnosis,
    [property: JsonPropertyName("step2_causesAndRetention")] CausesAndRetentionResponse Step2CausesAndRetention,
    [property: JsonPropertyName("step3_irrigation")] IrrigationAdvice Step3Irrigation,
    [property: JsonPropertyName("step4_sourcesAndLimitations")] SourcesAndLimitationsResponse Step4SourcesAndLimitations
)
{
    /// <param name="cropName"> Crop name in the report language (field keeps its contract name cropNamePl) </param>
    public static AnalysisResponse From(Guid reportUuid, Parcel parcel, Crop crop, string cropName, DateOnly targetDate,
        Assessment assessment) =>
        new(
            reportUuid,
            new ParcelInfoResponse(parcel.Id.Value, parcel.Voivodeship, parcel.AreaHa, crop.Id.Value, cropName,
                targetDate, parcel.Geom),
            new DiagnosisResponse(assessment.RiskLevel, assessment.SummaryPl, assessment.HistoricalContextPl,
                assessment.Metrics),
            new CausesAndRetentionResponse(assessment.CausesPl, assessment.Retention),
            assessment.Irrigation,
            new SourcesAndLimitationsResponse(assessment.Sources, assessment.LimitationsPl, assessment.SatelliteStatus));
}

public record ParcelInfoResponse
(
    [property: JsonPropertyName("dzialkaId")] string DzialkaId,
    [property: JsonPropertyName("voivodeship")] string? Voivodeship,
    [property: JsonPropertyName("areaHa")] decimal AreaHa,
    [property: JsonPropertyName("cropId")] string CropId,
    [property: JsonPropertyName("cropNamePl")] string CropNamePl,
    [property: JsonPropertyName("targetDate")] DateOnly TargetDate,
    [property: JsonPropertyName("polygonGeoJson")] Geometry PolygonGeoJson
);

public record DiagnosisResponse
(
    [property: JsonPropertyName("riskLevel")] WaterDeficitLevel RiskLevel,
    [property: JsonPropertyName("summaryPl")] string SummaryPl,
    [property: JsonPropertyName("historicalContextPl")] string HistoricalContextPl,
    [property: JsonPropertyName("metrics")] DiagnosisMetrics Metrics
);

public record CausesAndRetentionResponse
(
    [property: JsonPropertyName("causesPl")] string[] CausesPl,
    [property: JsonPropertyName("retentionRecommendationsPl")] RetentionMeasure[] RetentionRecommendationsPl
);

public record SourcesAndLimitationsResponse
(
    [property: JsonPropertyName("sources")] string[] Sources,
    [property: JsonPropertyName("limitationsPl")] string[] LimitationsPl,
    [property: JsonPropertyName("satelliteStatus")] SatelliteStatus SatelliteStatus
);
