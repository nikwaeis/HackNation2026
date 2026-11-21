using System.Text.Json;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Data;
using WodoPlon.Api.Features.Analysis.Shared;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Results;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Api.Features.Analysis.Command.AnalyzeParcel;

public sealed class AnalyzeParcelHandler(
    AppDbContext db,
    ParcelProfileService parcels,
    ObservationService observations,
    TimeProvider timeProvider,
    IOptions<JsonOptions> jsonOptions)
    : ICommandHandler<AnalyzeParcelCommand, AnalysisResponse>
{
    private readonly AppDbContext _db = db;
    private readonly ParcelProfileService _parcels = parcels;
    private readonly ObservationService _observations = observations;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly JsonSerializerOptions _jsonOptions = jsonOptions.Value.SerializerOptions;

    public async Task<Result<AnalysisResponse>> HandleAsync(AnalyzeParcelCommand command,
        CancellationToken cancellationToken = default)
    {
        var cropIdResult = CropIdVo.Create(command.CropId);
        if (cropIdResult.IsFailure)
            return cropIdResult.Errors;

        var crop = await _db.Crops.AsNoTracking().FirstOrDefaultAsync(c => c.Id == cropIdResult.Value, cancellationToken);
        if (crop is null)
            return ResultError.NotFound(AnalysisErrorCodes.CropNotFound);

        var parcelResult = string.IsNullOrWhiteSpace(command.DzialkaId)
            ? await _parcels.ResolveByPointAsync(command.Lat!.Value, command.Lon!.Value, cancellationToken)
            : await _parcels.ResolveByIdAsync(command.DzialkaId, cancellationToken);
        if (parcelResult.IsFailure)
            return parcelResult.Errors;
        var parcel = parcelResult.Value!;

        var observationResult = await _observations.GetOrCreateAsync(parcel, command.TargetDate, cancellationToken);
        if (observationResult.IsFailure)
            return observationResult.Errors;

        // profile is always saved together with the parcel (ParcelProfileService)
        var assessment = AnalysisEngine.Assess(parcel.StaticProfile!, observationResult.Value!, crop);

        var reportId = Guid.CreateVersion7();
        var response = AnalysisResponse.From(reportId, parcel, crop, command.TargetDate, assessment);

        // stored in the wire format, so GET /api/reports/{id} returns it byte for byte
        var reportResult = SavedReport.Create(parcel.Id, crop.Id, command.TargetDate, assessment.RiskLevel,
            JsonSerializer.Serialize(response, _jsonOptions), _timeProvider.GetUtcNow(), reportId);
        if (reportResult.IsFailure)
            return reportResult.Errors;

        _db.SavedReports.Add(reportResult.Value!);
        await _db.SaveChangesAsync(cancellationToken);

        return response;
    }
}
