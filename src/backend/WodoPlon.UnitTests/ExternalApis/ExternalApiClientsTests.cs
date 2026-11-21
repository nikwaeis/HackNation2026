using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NetTopologySuite.Geometries;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Common.Models;
using WodoPlon.Api.Common.Options;
using WodoPlon.Api.Common.Services;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;
using WodoPlon.Domain.Results;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.UnitTests.ExternalApis;

public class ExternalApiClientsTests
{
    private static readonly ParcelIdVo ParcelId = ParcelIdVo.Create("046101_1.0147.31/6").Value;

    #region ULDK

    // trimmed live response, srid=4326 gives "lon lat" order
    private const string UldkFound = """
        0
        046101_1.0147.31/6|kujawsko-pomorskie|SRID=4326;POLYGON((18.0075 53.1242,18.0080 53.1242,18.0080 53.1238,18.0075 53.1238,18.0075 53.1242))
        """;

    private static UldkClient Uldk(StubHandler stub) => new(stub.Client(), NullLogger<UldkClient>.Instance);

    [Fact]
    public async Task Uldk_Parses_Polygon_As_MultiPolygon_In_Lon_Lat()
    {
        var result = await Uldk(new StubHandler(UldkFound)).GetByIdAsync(ParcelId);

        result.IsSuccess.Should().BeTrue();
        result.Value!.ParcelId.Should().Be(ParcelId);
        result.Value.Voivodeship.Should().Be("kujawsko-pomorskie");
        result.Value.Geom.SRID.Should().Be(Parcel.Srid);
        result.Value.Geom.Centroid.X.Should().BeApproximately(18.0077, 0.001);
        result.Value.Geom.Centroid.Y.Should().BeApproximately(53.124, 0.001);
    }

    [Fact]
    public async Task Uldk_Point_Query_Sends_Lon_Lat()
    {
        var stub = new StubHandler(UldkFound);

        await Uldk(stub).GetByPointAsync(53.124, 18.008);

        stub.LastRequest!.RequestUri!.Query.Should().Contain("xy=18.008,53.124,4326");
    }

    [Fact]
    public async Task Uldk_Brak_Wynikow_Is_NotFound()
    {
        var result = await Uldk(new StubHandler("-1 brak wyników\n")).GetByPointAsync(55.5, 15.0);

        result.Errors.Single().Code.Should().Be(ExternalApiErrorCodes.ParcelNotFound);
        result.Errors.Single().Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task Uldk_Server_Error_Is_Unavailable()
    {
        var result = await Uldk(new StubHandler("", HttpStatusCode.ServiceUnavailable)).GetByIdAsync(ParcelId);

        result.Errors.Single().Code.Should().Be(ExternalApiErrorCodes.UldkUnavailable);
        result.Errors.Single().Type.Should().Be(ErrorType.Failure);
    }

    #endregion

    #region Open-Meteo

    private static OpenMeteoClient OpenMeteo(StubHandler stub) => new(stub.Client(), NullLogger<OpenMeteoClient>.Instance);

    [Fact]
    public async Task OpenMeteo_Skips_Days_Without_Data()
    {
        const string body = """
            {"daily":{"time":["2026-11-19","2026-11-20","2026-11-21"],
              "precipitation_sum":[1.2,0.0,null],
              "et0_fao_evapotranspiration":[0.5,0.4,null],
              "temperature_2m_max":[6.1,null,null]}}
            """;

        var result = await OpenMeteo(new StubHandler(body)).GetDailyAsync(53.1, 18.0, new(2026, 11, 19), new(2026, 11, 21));

        result.Value.Should().Equal(
            new DailyWeather(new(2026, 11, 19), 1.2m, 0.5m, 6.1m),
            new DailyWeather(new(2026, 11, 20), 0.0m, 0.4m, null));
    }

    [Fact]
    public async Task OpenMeteo_Daily_Limit_Is_Failure()
    {
        const string body = """{"error":true,"reason":"Daily API request limit exceeded. Please try again tomorrow."}""";

        var result = await OpenMeteo(new StubHandler(body, HttpStatusCode.TooManyRequests))
            .GetDailyAsync(53.1, 18.0, new(2026, 1, 1), new(2026, 1, 2));

        result.Errors.Single().Code.Should().Be(ExternalApiErrorCodes.WeatherUnavailable);
    }

    #endregion

    #region SoilGrids

    private static SoilGridsClient SoilGrids(StubHandler stub) => new(stub.Client(), NullLogger<SoilGridsClient>.Instance);

    private static string SoilLayer(string name, int? top, int? mid, int? deep) => $$$"""
        {"name":"{{{name}}}","unit_measure":{"d_factor":10},"depths":[
          {"range":{"top_depth":0,"bottom_depth":5},"values":{"mean":{{{Json(top)}}}}},
          {"range":{"top_depth":5,"bottom_depth":15},"values":{"mean":{{{Json(mid)}}}}},
          {"range":{"top_depth":15,"bottom_depth":30},"values":{"mean":{{{Json(deep)}}}}}]}
        """;

    private static string Json(int? value) => value?.ToString() ?? "null";

    [Fact]
    public async Task SoilGrids_Applies_DFactor_And_Depth_Weights()
    {
        string body = $$$"""
            {"properties":{"layers":[
              {{{SoilLayer("sand", 659, 674, 701)}}},
              {{{SoilLayer("soc", 724, 273, null)}}}]}}
            """;

        var sample = await SoilGrids(new StubHandler(body)).GetTopsoilAsync(53.05, 18.35);

        // sand: (659*5 + 674*10 + 701*15) / 30 / 10; soc: only depths with data, (724*5 + 273*10) / 15 / 10
        sample.Should().Be(new SoilSample(68.5m, null, null, 42.3m));
    }

    [Fact]
    public async Task SoilGrids_Without_Any_Data_Returns_Null()
    {
        string body = $$$"""{"properties":{"layers":[{{{SoilLayer("sand", null, null, null)}}}]}}""";

        var sample = await SoilGrids(new StubHandler(body)).GetTopsoilAsync(53.124, 18.008);

        sample.Should().BeNull();
    }

    #endregion

    #region Overpass

    private static readonly IOptions<ExternalApisSettings> NoMirrors =
        Options.Create(new ExternalApisSettings { OverpassMirrorUrls = [] });

    /// <summary> Answers each request with the next canned response </summary>
    private sealed class SequenceHandler(params (HttpStatusCode Status, string Body)[] responses) : HttpMessageHandler
    {
        private int _next;
        public List<Uri> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request.RequestUri!);
            var (status, body) = responses[Math.Min(_next++, responses.Length - 1)];
            return Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(body) });
        }
    }

    [Fact]
    public async Task Overpass_Falls_Back_To_Mirror_And_Null_When_All_Fail()
    {
        var settings = Options.Create(new ExternalApisSettings { OverpassMirrorUrls = ["https://mirror.local/"] });
        var handler = new SequenceHandler((HttpStatusCode.GatewayTimeout, ""), (HttpStatusCode.OK, """{"elements":[]}"""));
        var client = new HttpClient(handler) { BaseAddress = new Uri("https://main.local/"), Timeout = TimeSpan.FromSeconds(30) };

        var features = await new OverpassClient(client, settings, NullLogger<OverpassClient>.Instance)
            .GetHydroAroundAsync(53.05, 18.35, 1000);

        features.Should().BeEmpty(); // "no water nearby" is an answer, not a failure
        handler.Requests.Select(u => u.Host).Should().Equal("main.local", "mirror.local");

        var down = new SequenceHandler((HttpStatusCode.BadGateway, ""));
        var none = await new OverpassClient(new HttpClient(down) { BaseAddress = new Uri("https://main.local/") }, settings,
            NullLogger<OverpassClient>.Instance).GetHydroAroundAsync(53.05, 18.35, 1000);
        none.Should().BeNull();
    }

    [Fact]
    public async Task Overpass_Maps_Tags_To_Hydro_Types()
    {
        const string body = """
            {"elements":[
              {"type":"way","id":1,"tags":{"waterway":"ditch"},"geometry":[{"lat":53.05,"lon":18.35},{"lat":53.051,"lon":18.351}]},
              {"type":"way","id":2,"tags":{"natural":"water","name":"Jezioro"},"geometry":[
                {"lat":53.0,"lon":18.0},{"lat":53.0,"lon":18.01},{"lat":53.01,"lon":18.01},{"lat":53.0,"lon":18.0}]},
              {"type":"way","id":3,"tags":{"waterway":"dam"},"geometry":[{"lat":53.0,"lon":18.0},{"lat":53.1,"lon":18.1}]}
            ]}
            """;
        var stub = new StubHandler(body);

        var features = await new OverpassClient(stub.Client(), NoMirrors, NullLogger<OverpassClient>.Instance)
            .GetHydroAroundAsync(53.05, 18.35, 1000);

        features!.Select(f => (f.OsmId, f.Type, f.Name, f.Geom.GeometryType))
            .Should().Equal((1, HydroFeatureType.Ditch, null, "LineString"), (2, HydroFeatureType.Lake, "Jezioro", "Polygon"));
        features.Should().OnlyContain(f => f.Geom.SRID == Parcel.Srid && f.Geom.Coordinate.X >= 18);
        stub.LastBody.Should().Contain("around%3A1000%2C53.05%2C18.35");
    }

    #endregion

    #region Python geo-worker

    private static readonly MultiPolygon Square = new(
    [
        new Polygon(new LinearRing([new(18.007, 53.123), new(18.009, 53.123), new(18.009, 53.125), new(18.007, 53.123)]))
    ]);

    [Fact]
    public async Task GeoWorker_Speaks_Snake_Case_Contract()
    {
        const string body = """
            {"dzialka_id":"040101_1.0001.123/4",
             "terrain":{"status":"OK","mean_slope_deg":4.2,"max_slope_deg":7.8,"steep_area_pct":38.0,"source":"Geoportal NMT WCS"},
             "satellite":{"status":"CLOUDY_FALLBACK","ndvi_mean":0.41,"ndwi_mean":-0.18,"scene_date":"2026-07-12",
                          "cloud_cover_pct":5.0,"source":"Sentinel-2 L2A (Earth Search)","error_reason":null}}
            """;
        var stub = new StubHandler(body);

        var metrics = await new PythonServiceClient(stub.Client(), NullLogger<PythonServiceClient>.Instance)
            .ExtractGeoAsync(ParcelId, new DateOnly(2026, 7, 15), needTerrain: true, Square);

        metrics.Should().Be(new GeoMetrics(4.2m, 7.8m, 38.0m, 0.41m, -0.18m, new DateOnly(2026, 7, 12), 5.0m, SatelliteStatus.CloudyFallback));

        var sent = JsonDocument.Parse(stub.LastBody!).RootElement;
        sent.GetProperty("dzialka_id").GetString().Should().Be(ParcelId.Value);
        sent.GetProperty("target_date").GetString().Should().Be("2026-07-15");
        sent.GetProperty("include_terrain").GetBoolean().Should().BeTrue();
        sent.GetProperty("geometry").GetProperty("type").GetString().Should().Be("MultiPolygon");
    }

    [Fact]
    public async Task GeoWorker_Failed_Sections_Give_No_Data()
    {
        const string body = """
            {"dzialka_id":"x","terrain":{"status":"ERROR","mean_slope_deg":null,"error_reason":"timeout"},
             "satellite":{"status":"ERROR","ndvi_mean":null,"error_reason":"timeout"}}
            """;

        var metrics = await new PythonServiceClient(new StubHandler(body).Client(), NullLogger<PythonServiceClient>.Instance)
            .ExtractGeoAsync(ParcelId, new DateOnly(2026, 7, 15), needTerrain: true, Square);

        metrics.Should().Be(new GeoMetrics(null, null, null, null, null, null, null, SatelliteStatus.Error));
    }

    [Fact]
    public async Task GeoWorker_Down_Returns_Null()
    {
        var metrics = await new PythonServiceClient(new StubHandler("", HttpStatusCode.BadGateway).Client(),
                NullLogger<PythonServiceClient>.Instance)
            .ExtractGeoAsync(ParcelId, new DateOnly(2026, 7, 15), needTerrain: false, Square);

        metrics.Should().BeNull();
    }

    #endregion
}
