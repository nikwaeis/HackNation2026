namespace WodoPlon.Api.Features.Map;

public static class MapErrorCodes
{
    public const string LocalIdentity = "Map";
    public const string BoxInvalid = $"{LocalIdentity}.{nameof(BoxInvalid)}";
    public const string BoxOutsidePoland = $"{LocalIdentity}.{nameof(BoxOutsidePoland)}";
    public const string BoxTooLarge = $"{LocalIdentity}.{nameof(BoxTooLarge)}";
}
