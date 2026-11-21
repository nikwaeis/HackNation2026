using WodoPlon.Domain.Enums;
using WodoPlon.Domain.Results;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Domain.Entities;

/// <summary>
/// Generated farmer report, opened by public link /report/{id} without registration. Immutable
/// </summary>
public sealed class SavedReport
{
    /// <summary> Public report id used in the link </summary>
    public Guid Id { get; private set; }

    /// <summary> Analysed parcel </summary>
    public ParcelIdVo ParcelId { get; private set; }

    /// <summary> Analysed crop </summary>
    public CropIdVo CropId { get; private set; }

    /// <summary> Analysis date </summary>
    public DateOnly TargetDate { get; private set; }

    /// <summary> Final risk level </summary>
    public WaterDeficitLevel WaterDeficitLevel { get; private set; }

    /// <summary> Full structured report (4 stages) as JSON </summary>
    public string Payload { get; private set; } = null!;

    /// <summary> Generation time </summary>
    public DateTimeOffset CreatedAt { get; private set; }

    #region References

    public Parcel Parcel { get; private set; } = null!;
    public Crop Crop { get; private set; } = null!;

    #endregion

    private SavedReport() { }

    public static Result<SavedReport> Create(ParcelIdVo parcelId, CropIdVo cropId, DateOnly targetDate,
        WaterDeficitLevel level, string payload, DateTimeOffset createdAt, Guid? id = null)
    {
        if (string.IsNullOrWhiteSpace(payload))
            return ResultError.Validation(DomainErrorCodes.Entities.SavedReport.EmptyPayload);

        return new SavedReport
        {
            Id = id ?? Guid.CreateVersion7(),
            ParcelId = parcelId,
            CropId = cropId,
            TargetDate = targetDate,
            WaterDeficitLevel = level,
            Payload = payload,
            CreatedAt = createdAt
        };
    }
}
