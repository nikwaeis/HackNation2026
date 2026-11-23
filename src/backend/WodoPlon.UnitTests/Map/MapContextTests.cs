using FluentAssertions;
using WodoPlon.Api.Features.Map;
using WodoPlon.Api.Features.Map.Query.GetMapContext;

namespace WodoPlon.UnitTests.Map;

public class MapContextTests
{
    private static readonly GetMapContextQueryValidator Validator = new();

    private static string[] Errors(GetMapContextQuery query) =>
        Validator.Validate(query).Errors.Select(e => e.ErrorCode).ToArray();

    [Fact]
    public void Viewport_In_Poland_Is_Accepted() =>
        Errors(new GetMapContextQuery(53.10, 19.84, 53.14, 19.98)).Should().BeEmpty();

    [Theory]
    [InlineData(null, 19.84, 53.14, 19.98)] // missing edge
    [InlineData(53.14, 19.84, 53.10, 19.98)] // south above north
    [InlineData(53.10, 19.98, 53.14, 19.84)] // west east of east
    public void Malformed_Box_Is_Rejected_Once(double? south, double? west, double? north, double? east) =>
        Errors(new GetMapContextQuery(south, west, north, east)).Should().Equal(MapErrorCodes.BoxInvalid);

    [Fact]
    public void Box_Outside_Poland_Is_Rejected() =>
        Errors(new GetMapContextQuery(52.50, 13.30, 52.54, 13.42)) // Berlin
            .Should().Equal(MapErrorCodes.BoxOutsidePoland);

    [Fact]
    public void Country_Sized_Box_Is_Rejected() =>
        Errors(new GetMapContextQuery(50.0, 16.0, 52.0, 20.0)).Should().Equal(MapErrorCodes.BoxTooLarge);

    [Fact]
    public void View_Across_The_Border_Is_Clamped_To_Poland()
    {
        // Słubice and Frankfurt (Oder): accepted, then cut at the western edge of the Polish box
        Errors(new GetMapContextQuery(52.33, 13.70, 52.37, 13.95)).Should().BeEmpty();
        GetMapContextHandler.ClampToPoland(new GeoBox(52.33, 13.70, 52.37, 13.95))
            .Should().Be(new GeoBox(52.33, GetMapContextQueryValidator.MinLon, 52.37, 13.95));
    }
}
