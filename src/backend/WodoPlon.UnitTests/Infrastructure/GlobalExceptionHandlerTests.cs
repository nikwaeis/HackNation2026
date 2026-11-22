using System.Globalization;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Localization;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using WodoPlon.Api.Middleware;
using WodoPlon.Api.Resources;

namespace WodoPlon.UnitTests.Infrastructure;

public class GlobalExceptionHandlerTests
{
    private static async Task<(HttpContext Ctx, JsonElement Body)> Handle(Exception ex, string requestCulture = "pl")
    {
        // the handler runs outside request localization: the ambient culture is not the request's one
        CultureInfo.CurrentUICulture = CultureInfo.InvariantCulture;
        var factory = new ResourceManagerStringLocalizerFactory(
            Options.Create(new LocalizationOptions { ResourcesPath = "" }), NullLoggerFactory.Instance);
        var handler = new GlobalExceptionHandler(NullLogger<GlobalExceptionHandler>.Instance,
            new StringLocalizer<SharedResources>(factory));
        var ctx = new DefaultHttpContext { Response = { Body = new MemoryStream() } };
        ctx.Features.Set<IRequestCultureFeature>(new RequestCultureFeature(new RequestCulture(requestCulture), null));

        (await handler.TryHandleAsync(ctx, ex, CancellationToken.None)).Should().BeTrue();

        ctx.Response.Body.Position = 0;
        return (ctx, await JsonSerializer.DeserializeAsync<JsonElement>(ctx.Response.Body));
    }

    [Fact]
    public async Task Malformed_Body_Is_Localized_Problem_Without_Internal_Details()
    {
        var (ctx, body) = await Handle(new BadHttpRequestException("Implicit body inferred for parameter \"requestDto\""));

        ctx.Response.StatusCode.Should().Be(400);
        ctx.Response.ContentType.Should().StartWith("application/problem+json");
        body.GetProperty("detail").GetString().Should().StartWith("Nieprawidłowe dane").And.NotContain("requestDto");
    }

    [Fact]
    public async Task Malformed_Body_Uses_Request_Language()
    {
        var (_, body) = await Handle(new BadHttpRequestException("bad json"), "en");

        body.GetProperty("detail").GetString().Should().StartWith("Invalid request data");
    }

    [Fact]
    public async Task Unexpected_Error_Stays_Generic_500()
    {
        var (ctx, body) = await Handle(new InvalidOperationException("db password=secret"));

        ctx.Response.StatusCode.Should().Be(500);
        body.GetProperty("detail").GetString().Should().NotContain("secret");
    }
}
