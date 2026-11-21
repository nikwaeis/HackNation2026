namespace WodoPlon.Domain.Results;

public static class DomainErrorCodes
{
    public static class ValueObjects
    {
        public const string LocalIdentity = "Vo";

        public static class ParcelId
        {
            public const string CurrentIdentity = nameof(ParcelId);

            public const string Empty = $"{LocalIdentity}.{CurrentIdentity}.{nameof(Empty)}";
            public const string MaxLength = $"{LocalIdentity}.{CurrentIdentity}.{nameof(MaxLength)}";
            public const string InvalidFormat = $"{LocalIdentity}.{CurrentIdentity}.{nameof(InvalidFormat)}";
        }

        public static class CropId
        {
            public const string CurrentIdentity = nameof(CropId);

            public const string Empty = $"{LocalIdentity}.{CurrentIdentity}.{nameof(Empty)}";
            public const string MaxLength = $"{LocalIdentity}.{CurrentIdentity}.{nameof(MaxLength)}";
            public const string InvalidFormat = $"{LocalIdentity}.{CurrentIdentity}.{nameof(InvalidFormat)}";
        }

        public static class Percent
        {
            public const string CurrentIdentity = nameof(Percent);

            public const string OutOfRange = $"{LocalIdentity}.{CurrentIdentity}.{nameof(OutOfRange)}";
        }
    }

    public static class Entities
    {
        public const string LocalIdentity = "Ent";

        public static class Crop
        {
            public const string CurrentIdentity = nameof(Crop);

            public const string EmptyName = $"{LocalIdentity}.{CurrentIdentity}.{nameof(EmptyName)}";
            public const string NameMaxLength = $"{LocalIdentity}.{CurrentIdentity}.{nameof(NameMaxLength)}";
            public const string CoefficientOutOfRange = $"{LocalIdentity}.{CurrentIdentity}.{nameof(CoefficientOutOfRange)}";
            public const string EmptyCriticalMonths = $"{LocalIdentity}.{CurrentIdentity}.{nameof(EmptyCriticalMonths)}";
            public const string InvalidMonth = $"{LocalIdentity}.{CurrentIdentity}.{nameof(InvalidMonth)}";
            public const string InvalidRootDepth = $"{LocalIdentity}.{CurrentIdentity}.{nameof(InvalidRootDepth)}";
        }

        public static class HydroFeature
        {
            public const string CurrentIdentity = nameof(HydroFeature);

            public const string NameMaxLength = $"{LocalIdentity}.{CurrentIdentity}.{nameof(NameMaxLength)}";
            public const string EmptyGeometry = $"{LocalIdentity}.{CurrentIdentity}.{nameof(EmptyGeometry)}";
            public const string InvalidSrid = $"{LocalIdentity}.{CurrentIdentity}.{nameof(InvalidSrid)}";
        }

        public static class Parcel
        {
            public const string CurrentIdentity = nameof(Parcel);

            public const string VoivodeshipMaxLength = $"{LocalIdentity}.{CurrentIdentity}.{nameof(VoivodeshipMaxLength)}";
            public const string InvalidArea = $"{LocalIdentity}.{CurrentIdentity}.{nameof(InvalidArea)}";
            public const string EmptyGeometry = $"{LocalIdentity}.{CurrentIdentity}.{nameof(EmptyGeometry)}";
            public const string InvalidSrid = $"{LocalIdentity}.{CurrentIdentity}.{nameof(InvalidSrid)}";
        }

        public static class ParcelStaticProfile
        {
            public const string CurrentIdentity = nameof(ParcelStaticProfile);

            public const string SlopeOutOfRange = $"{LocalIdentity}.{CurrentIdentity}.{nameof(SlopeOutOfRange)}";
            public const string MeanSlopeExceedsMax = $"{LocalIdentity}.{CurrentIdentity}.{nameof(MeanSlopeExceedsMax)}";
            public const string SoilFractionsExceedTotal = $"{LocalIdentity}.{CurrentIdentity}.{nameof(SoilFractionsExceedTotal)}";
            public const string NegativeValue = $"{LocalIdentity}.{CurrentIdentity}.{nameof(NegativeValue)}";
        }

        public static class DynamicObservation
        {
            public const string CurrentIdentity = nameof(DynamicObservation);

            public const string NegativeValue = $"{LocalIdentity}.{CurrentIdentity}.{nameof(NegativeValue)}";
            public const string InvalidWeatherMonth = $"{LocalIdentity}.{CurrentIdentity}.{nameof(InvalidWeatherMonth)}";
            public const string IndexOutOfRange = $"{LocalIdentity}.{CurrentIdentity}.{nameof(IndexOutOfRange)}";
            public const string MissingSatelliteData = $"{LocalIdentity}.{CurrentIdentity}.{nameof(MissingSatelliteData)}";
            public const string UnexpectedSatelliteData = $"{LocalIdentity}.{CurrentIdentity}.{nameof(UnexpectedSatelliteData)}";
            public const string SceneOutOfWindow = $"{LocalIdentity}.{CurrentIdentity}.{nameof(SceneOutOfWindow)}";
        }

        public static class SavedReport
        {
            public const string CurrentIdentity = nameof(SavedReport);

            public const string EmptyPayload = $"{LocalIdentity}.{CurrentIdentity}.{nameof(EmptyPayload)}";
        }
    }
}
