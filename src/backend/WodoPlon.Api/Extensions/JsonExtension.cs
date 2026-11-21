using System.Text.Json;
using System.Text.Json.Serialization;
using NetTopologySuite.IO.Converters;

namespace WodoPlon.Api.Extensions;

public static class JsonExtension
{
    /// <summary> Wire format of the api.md contract: enums as "HIGH" / "NO_DATA", geometries as GeoJSON </summary>
    public static JsonSerializerOptions AddApiConverters(this JsonSerializerOptions options)
    {
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseUpper, allowIntegerValues: false));
        options.Converters.Add(new GeoJsonConverterFactory());
        return options;
    }
}
