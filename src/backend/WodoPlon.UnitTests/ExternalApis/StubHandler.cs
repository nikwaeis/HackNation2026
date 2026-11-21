using System.Net;

namespace WodoPlon.UnitTests.ExternalApis;

/// <summary> Returns a canned response and remembers the last request </summary>
internal sealed class StubHandler(string body, HttpStatusCode status = HttpStatusCode.OK) : HttpMessageHandler
{
    public HttpRequestMessage? LastRequest { get; private set; }
    public string? LastBody { get; private set; }

    public HttpClient Client(string baseUrl = "https://stub.local/") => new(this) { BaseAddress = new Uri(baseUrl) };

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        LastRequest = request;
        LastBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
        return new HttpResponseMessage(status) { Content = new StringContent(body) };
    }
}
