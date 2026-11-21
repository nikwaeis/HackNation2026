namespace WodoPlon.Domain.Enums;

public enum SatelliteStatus
{
    /// <summary> Cloud-free scene found in the ±15 days window </summary>
    Ok,
    /// <summary> Only a cloudy scene was available, indices are less reliable </summary>
    CloudyFallback,
    /// <summary> No usable scene, indices are absent </summary>
    NoData
}
